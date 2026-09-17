import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Closing, ClosingInput, SessionUser } from '@nksq/contracts';
import { IcCaseService } from '../ic-case';
import { PortfolioService } from '../portfolio';
import { ClosingRepository } from './closing.repository';

@Injectable()
export class ClosingService {
  constructor(
    private readonly repository: ClosingRepository,
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
  ) {}

  async listForInvestment(investmentId: number): Promise<Closing[]> {
    await this.portfolio.get(investmentId);
    return this.repository.list(investmentId);
  }

  /** Every closing across the portfolio, for position summaries. */
  listAll(): Promise<Closing[]> {
    return this.repository.list();
  }

  /** Checks a closing against what already exists, without saving it. */
  async validate(investmentId: number, input: ClosingInput): Promise<void> {
    await this.portfolio.get(investmentId);
    const existing = await this.repository.list(investmentId);

    // Ownership after a closing is cumulative — every share NKSquared holds, including from earlier closings,
    // divided by the fully diluted total — so it should never fall below what an earlier closing already recorded.
    // The one case this doesn't hold (a down-round diluting NKSquared's existing stake between closings) is rare
    // enough that recording it under "Not linked to a tranche" with a note is a reasonable workaround.
    const priorMax = existing.reduce((max, c) => Math.max(max, c.ownershipPctAfter), 0);
    if (existing.length > 0 && input.ownershipPctAfter < priorMax) {
      throw new BadRequestException(
        `Ownership after this closing (${input.ownershipPctAfter}%) is lower than an earlier closing's ${priorMax}%. ` +
          'Ownership after should be cumulative: all shares NKSquared holds so far, divided by the fully diluted total — not just the shares from this closing.',
      );
    }

    if (input.icTrancheNumber === null) return;

    const icCase = await this.icCases.latest(investmentId);
    if (!icCase) throw new BadRequestException('There is no IC approval to link this closing to a tranche. Choose "Not linked to a tranche".');
    if (!icCase.tranches.some((t) => t.trancheNumber === input.icTrancheNumber)) {
      throw new BadRequestException(`IC version ${icCase.version} has no tranche ${input.icTrancheNumber}.`);
    }
    const drawnBy = existing.find((c) => c.icTrancheNumber === input.icTrancheNumber);
    if (drawnBy) throw new ConflictException(`Tranche ${input.icTrancheNumber} was already drawn by closing ${drawnBy.closingNumber}.`);
  }

  /** Only the Lifecycle module calls this, so the closing document and deal status are handled with it. */
  async record(investmentId: number, input: ClosingInput, user: SessionUser): Promise<Closing> {
    await this.validate(investmentId, input);
    const id = await this.repository.create(investmentId, input, user.username);
    const created = (await this.repository.list(investmentId)).find((c) => c.id === id);
    if (!created) throw new Error(`Closing ${id} was saved but could not be read back.`);
    return created;
  }

  async get(investmentId: number, closingId: number): Promise<Closing> {
    const closing = (await this.repository.list(investmentId)).find((c) => c.id === closingId);
    if (!closing) throw new NotFoundException(`Closing ${closingId} was not found on this investment.`);
    return closing;
  }

  /** Only the Lifecycle module calls this. */
  async delete(investmentId: number, closingId: number): Promise<void> {
    if (!(await this.repository.delete(investmentId, closingId))) {
      throw new NotFoundException(`Closing ${closingId} was not found on this investment.`);
    }
  }

  /** Only the Lifecycle module calls this, when an investment is deleted. */
  deleteForInvestment(investmentId: number): Promise<number> {
    return this.repository.deleteForInvestment(investmentId);
  }
}
