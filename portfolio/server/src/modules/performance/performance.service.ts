import { Injectable } from '@nestjs/common';
import type { ClosingInput, Position } from '@nksq/contracts';
import { ClosingService } from '../closing';
import { IcCaseService } from '../ic-case';
import { PortfolioService } from '../portfolio';
import { sumUsd } from '../../shared/money';
import { ClosingFigures, computePosition } from './position';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
    private readonly closings: ClosingService,
  ) {}

  /** Current position of every investment. */
  async positions(): Promise<Position[]> {
    const [investments, summaries, closings] = await Promise.all([this.portfolio.list(), this.icCases.latestSummaries(), this.closings.listAll()]);
    const icByInvestment = new Map(summaries.map((s) => [s.investmentId, s]));
    return investments.map((investment) =>
      computePosition(investment.id, closings.filter((c) => c.investmentId === investment.id), icByInvestment.get(investment.id) ?? null),
    );
  }

  async position(investmentId: number): Promise<Position> {
    await this.portfolio.get(investmentId);
    const [summaries, closings] = await Promise.all([this.icCases.latestSummaries(), this.closings.listForInvestment(investmentId)]);
    return computePosition(investmentId, closings, summaries.find((s) => s.investmentId === investmentId) ?? null);
  }

  /** What the position would be with one more closing, for the live preview on the closing form. */
  async previewWithClosing(investmentId: number, input: ClosingInput): Promise<Position> {
    await this.closings.validate(investmentId, input);
    const [summaries, existing] = await Promise.all([this.icCases.latestSummaries(), this.closings.listForInvestment(investmentId)]);
    const draft: ClosingFigures = {
      closingNumber: existing.length + 1,
      closeDate: input.closeDate,
      sharesAllotted: input.sharesAllotted,
      amountInvestedUsd: input.amountInvestedUsd,
      expensesTotalUsd: sumUsd(input.expenses.map((e) => e.amountUsd)),
      ownershipPctAfter: input.ownershipPctAfter,
    };
    return computePosition(investmentId, [...existing, draft], summaries.find((s) => s.investmentId === investmentId) ?? null);
  }
}
