import { Injectable, NotFoundException } from '@nestjs/common';
import type { FinancialActual, FinancialActualInput, SessionUser, YearComparison } from '@nksq/contracts';
import { ClosingService } from '../closing';
import { IcCaseService } from '../ic-case';
import { PortfolioService } from '../portfolio';
import { compareFinancials } from './financial-comparison';
import { FinancialActualRepository } from './financial-actual.repository';

@Injectable()
export class FinancialActualService {
  constructor(
    private readonly repository: FinancialActualRepository,
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
    private readonly closings: ClosingService,
  ) {}

  async listForInvestment(investmentId: number): Promise<FinancialActual[]> {
    await this.portfolio.get(investmentId);
    return this.repository.list(investmentId);
  }

  async get(investmentId: number, id: number): Promise<FinancialActual> {
    await this.portfolio.get(investmentId);
    return this.repository.get(investmentId, id);
  }

  /** The IC memo's projection lined up against whatever has been reported, one row per year with either. */
  async comparison(investmentId: number): Promise<YearComparison[]> {
    await this.portfolio.get(investmentId);
    const [current, actuals, closings] = await Promise.all([
      this.icCases.latest(investmentId),
      this.repository.list(investmentId),
      this.closings.listForInvestment(investmentId),
    ]);
    // NKSquared's first closing marks when the investment actually happened; a memo year that ended before
    // that (or before IC approval, if nothing has closed yet) is history, not a projection.
    const entryDate = closings[0]?.closeDate ?? current?.approvedOn ?? null;
    return compareFinancials(current?.financials ?? [], actuals, entryDate);
  }

  /** Only the Lifecycle module calls this, so the evidence document is handled with it. Every upload is kept —
   *  a restatement for a period already on file doesn't replace it, it just becomes the one the comparison and
   *  chart use for that period (see compareFinancials), so nothing uploaded is ever lost. */
  async record(investmentId: number, input: FinancialActualInput, user: SessionUser): Promise<FinancialActual> {
    await this.portfolio.get(investmentId);
    return this.repository.create(investmentId, input, user.username);
  }

  /** Only the Lifecycle module calls this. */
  async delete(investmentId: number, id: number): Promise<void> {
    if (!(await this.repository.delete(investmentId, id))) {
      throw new NotFoundException(`Financial actual ${id} was not found on this investment.`);
    }
  }

  /** Only the Lifecycle module calls this, when an investment is deleted. */
  deleteForInvestment(investmentId: number): Promise<number> {
    return this.repository.deleteForInvestment(investmentId);
  }
}
