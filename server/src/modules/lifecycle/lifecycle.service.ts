import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  CreateFromIcMemoRequest,
  CreateFromIcMemoResponse,
  DeleteInvestmentResult,
  IcCase,
  SessionUser,
} from '@nksq/contracts';
import { DocumentsService } from '../documents';
import { IcCaseService } from '../ic-case';
import { IntakeService } from '../intake';
import { PortfolioService } from '../portfolio';

const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Operations that span modules: creating an investment from an IC memo, and deleting an investment
 * with everything attached to it. Each module still only touches its own tables; this service decides the order.
 */
@Injectable()
export class LifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Lifecycle');
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
    private readonly documents: DocumentsService,
    private readonly intake: IntakeService,
  ) {}

  async createFromIcMemo(request: CreateFromIcMemoRequest, user: SessionUser): Promise<CreateFromIcMemoResponse> {
    const memo = await this.documents.assertUnattached(request.documentId);
    if (memo.category !== 'IC_MEMO') throw new BadRequestException('That document was not uploaded as an IC memo.');
    // Validate the IC case before creating anything, so a bad figure doesn't leave a half-made investment.
    if (request.icCase) this.icCases.preview(request.icCase);

    const investment = await this.portfolio.create(request.investment, user);
    try {
      let icCase: IcCase | null = null;
      if (request.icCase) icCase = await this.icCases.recordApproval(investment.id, request.icCase, user);
      const document = await this.documents.attachToInvestment(memo.id, investment.id, icCase ? { type: 'IC_CASE', id: icCase.id } : undefined);
      return { investment: await this.portfolio.get(investment.id), icCase, document };
    } catch (error) {
      // Undo the parts that were saved, but keep the uploaded memo so the person can try again.
      await this.icCases.deleteForInvestment(investment.id).catch(() => undefined);
      await this.portfolio.delete(investment.id).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Deletes an investment and everything held for it: IC versions and tranches, documents and their files,
   * and Claude extractions of those documents. Runs from the leaves inward, so if a step fails the investment
   * is still listed and deleting again finishes the job.
   */
  async deleteInvestment(investmentId: number, confirmCompanyName: string, user: SessionUser): Promise<DeleteInvestmentResult> {
    const investment = await this.portfolio.get(investmentId);
    if (confirmCompanyName.trim().toLowerCase() !== investment.companyName.trim().toLowerCase()) {
      throw new BadRequestException(`Type "${investment.companyName}" exactly to confirm.`);
    }

    const documentIds = await this.documents.idsForInvestment(investmentId);
    const extractionsDeleted = await this.intake.deleteForDocuments(documentIds);
    const documents = await this.documents.deleteByIds(documentIds);
    const icCasesDeleted = await this.icCases.deleteForInvestment(investmentId);
    await this.portfolio.delete(investmentId);

    this.logger.log(
      `${user.username} deleted investment ${investmentId} (${investment.companyName}): ` +
        `${icCasesDeleted} IC versions, ${documents.count} documents (${documents.bytes} bytes), ${extractionsDeleted} extractions`,
    );
    return {
      investmentId,
      companyName: investment.companyName,
      icCasesDeleted,
      documentsDeleted: documents.count,
      bytesFreed: documents.bytes,
      extractionsDeleted,
    };
  }

  /** Throws away an upload that was never saved with an investment (e.g. the person cancelled). */
  async discardUpload(documentId: number): Promise<void> {
    await this.documents.assertUnattached(documentId);
    await this.intake.deleteForDocuments([documentId]);
    await this.documents.deleteByIds([documentId]);
  }

  /** Removes uploads left unsaved for more than a day, with their extractions. */
  async cleanUpAbandonedUploads(): Promise<void> {
    const ids = await this.documents.abandonedUploadIds();
    if (ids.length === 0) return;
    await this.intake.deleteForDocuments(ids);
    const { count, bytes } = await this.documents.deleteByIds(ids);
    this.logger.log(`Removed ${count} abandoned uploads (${bytes} bytes).`);
  }

  onModuleInit(): void {
    const run = () => this.cleanUpAbandonedUploads().catch((error: Error) => this.logger.warn(`Upload clean-up failed: ${error.message}`));
    setTimeout(run, 30_000).unref();
    this.cleanupTimer = setInterval(run, CLEANUP_EVERY_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
