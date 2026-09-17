import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  Closing,
  CreateFromIcMemoRequest,
  CreateFromIcMemoResponse,
  DeleteInvestmentResult,
  DocumentInfo,
  IcCase,
  InvestmentStatus,
  SaveCapitalEventRequest,
  SaveCapitalEventResponse,
  SaveClosingsRequest,
  SaveClosingsResponse,
  SaveFinancialActualRequest,
  SaveFinancialActualResponse,
  SessionUser,
} from '@nksq/contracts';
import { CapitalEventService } from '../capital-event';
import { CarryService } from '../carry';
import { ClosingService } from '../closing';
import { DocumentsService } from '../documents';
import { FinancialActualService } from '../financial-actual';
import { IcCaseService } from '../ic-case';
import { IntakeService } from '../intake';
import { PortfolioService } from '../portfolio';

const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Operations that span modules: creating an investment from an IC memo, recording and deleting closings and
 * capital events with their documents, and deleting an investment with everything attached to it. Each module
 * still only touches its own tables; this service decides the order.
 */
@Injectable()
export class LifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Lifecycle');
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
    private readonly closings: ClosingService,
    private readonly capitalEvents: CapitalEventService,
    private readonly carry: CarryService,
    private readonly documents: DocumentsService,
    private readonly financialActuals: FinancialActualService,
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
   * Records one or more closings from a single document (a closing memo can draw more than one IC tranche
   * at once), attaches a copy of the document to each, and moves the investment to Partly drawn or Closed.
   */
  async saveClosings(investmentId: number, request: SaveClosingsRequest, user: SessionUser): Promise<SaveClosingsResponse> {
    if (request.closings.length === 0) throw new BadRequestException('Record at least one closing.');
    if (request.documentId !== null) {
      const upload = await this.documents.assertUnattached(request.documentId);
      if (upload.category !== 'CLOSING') throw new BadRequestException('That document was not uploaded as a closing document.');
    }

    const closings: Closing[] = [];
    const documents: (DocumentInfo | null)[] = [];
    try {
      for (const input of request.closings) {
        const closing = await this.closings.record(investmentId, input, user);
        closings.push(closing);
        if (request.documentId === null) {
          documents.push(null);
          continue;
        }
        // The first closing gets the uploaded document itself; any further ones get their own copy of it,
        // since one saved document can only be evidence for one record.
        const docId = closings.length === 1 ? request.documentId : (await this.documents.duplicate(request.documentId, user.username)).id;
        documents.push(await this.documents.attachToInvestment(docId, investmentId, { type: 'CLOSING', id: closing.id }));
      }
    } catch (error) {
      for (const closing of closings) await this.closings.delete(investmentId, closing.id).catch(() => undefined);
      throw error;
    }

    const status = await this.refreshDealStage(investmentId);
    this.logger.log(`${user.username} recorded ${closings.length} closing(s) on investment ${investmentId}`);
    return { closings, documents, status };
  }

  /** Deletes one closing with its documents and what Claude read from them, then updates the deal stage. */
  async deleteClosing(investmentId: number, closingId: number, user: SessionUser): Promise<{ status: InvestmentStatus; documentsDeleted: number }> {
    const closing = await this.closings.get(investmentId, closingId);
    const documentIds = await this.documents.idsForRecord('CLOSING', closingId);
    await this.intake.deleteForDocuments(documentIds);
    const documents = await this.documents.deleteByIds(documentIds);
    await this.closings.delete(investmentId, closingId);
    const status = await this.refreshDealStage(investmentId);
    this.logger.log(`${user.username} deleted closing ${closing.closingNumber} on investment ${investmentId} (${documents.count} documents)`);
    return { status, documentsDeleted: documents.count };
  }

  /** Records a capital event, attaches its evidence document (an email or PDF notice), if any. */
  async saveCapitalEvent(investmentId: number, request: SaveCapitalEventRequest, user: SessionUser): Promise<SaveCapitalEventResponse> {
    if (request.documentId !== null) {
      const upload = await this.documents.assertUnattached(request.documentId);
      if (upload.category !== 'CAPITAL_EVENT') throw new BadRequestException('That document was not uploaded as capital-event evidence.');
    }

    const capitalEvent = await this.capitalEvents.record(investmentId, request.capitalEvent, user);
    let document: DocumentInfo | null = null;
    try {
      if (request.documentId !== null) {
        document = await this.documents.attachToInvestment(request.documentId, investmentId, { type: 'CAPITAL_EVENT', id: capitalEvent.id });
      }
    } catch (error) {
      await this.capitalEvents.delete(investmentId, capitalEvent.id).catch(() => undefined);
      throw error;
    }

    this.logger.log(`${user.username} recorded a ${capitalEvent.eventType} capital event on investment ${investmentId}`);
    return { capitalEvent, document };
  }

  /** Deletes one capital event with its evidence document and what Claude read from it. */
  async deleteCapitalEvent(investmentId: number, eventId: number, user: SessionUser): Promise<{ documentsDeleted: number }> {
    const event = await this.capitalEvents.get(investmentId, eventId);
    const documentIds = await this.documents.idsForRecord('CAPITAL_EVENT', eventId);
    await this.intake.deleteForDocuments(documentIds);
    const documents = await this.documents.deleteByIds(documentIds);
    await this.capitalEvents.delete(investmentId, eventId);
    this.logger.log(`${user.username} deleted a ${event.eventType} capital event on investment ${investmentId} (${documents.count} documents)`);
    return { documentsDeleted: documents.count };
  }

  /** Records a quarterly or annual financial statement, attaching the uploaded statement, if any, as evidence. */
  async saveFinancialActual(investmentId: number, request: SaveFinancialActualRequest, user: SessionUser): Promise<SaveFinancialActualResponse> {
    if (request.documentId !== null) {
      const upload = await this.documents.assertUnattached(request.documentId);
      if (upload.category !== 'STATEMENT') throw new BadRequestException('That document was not uploaded as a financial statement.');
    }

    const financialActual = await this.financialActuals.record(investmentId, request.financialActual, user);
    let document: DocumentInfo | null = null;
    try {
      if (request.documentId !== null) {
        document = await this.documents.attachToInvestment(request.documentId, investmentId, { type: 'FINANCIAL_ACTUAL', id: financialActual.id });
      }
    } catch (error) {
      await this.financialActuals.delete(investmentId, financialActual.id).catch(() => undefined);
      throw error;
    }

    this.logger.log(`${user.username} recorded a financial statement (${financialActual.periodType} FY${financialActual.fiscalYear}) on investment ${investmentId}`);
    return { financialActual, document };
  }

  /** Deletes one financial actual with its evidence document and what Claude read from it. */
  async deleteFinancialActual(investmentId: number, id: number, user: SessionUser): Promise<{ documentsDeleted: number }> {
    const actual = await this.financialActuals.get(investmentId, id);
    const documentIds = await this.documents.idsForRecord('FINANCIAL_ACTUAL', id);
    await this.intake.deleteForDocuments(documentIds);
    const documents = await this.documents.deleteByIds(documentIds);
    await this.financialActuals.delete(investmentId, id);
    this.logger.log(`${user.username} deleted a financial statement (${actual.periodType} FY${actual.fiscalYear}) on investment ${investmentId} (${documents.count} documents)`);
    return { documentsDeleted: documents.count };
  }

  /**
   * Deletes an investment and everything held for it: closings and expenses, capital events, IC versions and
   * tranches, documents and their files, and Claude extractions of those documents. Runs from the leaves inward,
   * so if a step fails the investment is still listed and deleting again finishes the job.
   */
  async deleteInvestment(investmentId: number, confirmCompanyName: string, user: SessionUser): Promise<DeleteInvestmentResult> {
    const investment = await this.portfolio.get(investmentId);
    if (confirmCompanyName.trim().toLowerCase() !== investment.companyName.trim().toLowerCase()) {
      throw new BadRequestException(`Type "${investment.companyName}" exactly to confirm.`);
    }

    const documentIds = await this.documents.idsForInvestment(investmentId);
    const extractionsDeleted = await this.intake.deleteForDocuments(documentIds);
    const documents = await this.documents.deleteByIds(documentIds);
    const closingsDeleted = await this.closings.deleteForInvestment(investmentId);
    await this.capitalEvents.deleteForInvestment(investmentId);
    await this.financialActuals.deleteForInvestment(investmentId);
    await this.carry.deleteForInvestment(investmentId);
    const icCasesDeleted = await this.icCases.deleteForInvestment(investmentId);
    await this.portfolio.delete(investmentId);

    this.logger.log(
      `${user.username} deleted investment ${investmentId} (${investment.companyName}): ${closingsDeleted} closings, ` +
        `${icCasesDeleted} IC versions, ${documents.count} documents (${documents.bytes} bytes), ${extractionsDeleted} extractions`,
    );
    return {
      investmentId,
      companyName: investment.companyName,
      icCasesDeleted,
      closingsDeleted,
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

  /**
   * No closings: IC approved (or pipeline). Some IC tranches have no closing drawing them: partly drawn.
   * Otherwise: closed. A tranche closed for more or less than its approved amount still counts as drawn —
   * only whether a closing exists for it decides the stage, not the dollar amount.
   */
  private async refreshDealStage(investmentId: number): Promise<InvestmentStatus> {
    const [closings, icCase] = await Promise.all([this.closings.listForInvestment(investmentId), this.icCases.latest(investmentId)]);
    let stage: 'PIPELINE' | 'IC_APPROVED' | 'PARTLY_DRAWN' | 'CLOSED';
    if (closings.length === 0) {
      stage = icCase ? 'IC_APPROVED' : 'PIPELINE';
    } else if (!icCase) {
      stage = 'CLOSED';
    } else {
      const drawn = new Set(closings.map((c) => c.icTrancheNumber).filter((n): n is number => n !== null));
      stage = drawn.size >= icCase.tranches.length ? 'CLOSED' : 'PARTLY_DRAWN';
    }
    return this.portfolio.setDealStage(investmentId, stage);
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
