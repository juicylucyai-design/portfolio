import { Injectable } from '@nestjs/common';
import type { ClosingInput, Position } from '@nksq/contracts';
import { CapitalEventService } from '../capital-event';
import { ClosingService } from '../closing';
import { IcCaseService } from '../ic-case';
import { PortfolioService } from '../portfolio';
import { roundTo, roundUsd, sumUsd } from '../../shared/money';
import { xirr, type CashFlow } from '../../shared/returns-engine';
import { CapitalEventFigures, ClosingFigures, computePosition } from './position';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly icCases: IcCaseService,
    private readonly closings: ClosingService,
    private readonly capitalEvents: CapitalEventService,
  ) {}

  /** Current position of every investment. */
  async positions(): Promise<Position[]> {
    const [investments, summaries, closings, events] = await Promise.all([
      this.portfolio.list(),
      this.icCases.latestSummaries(),
      this.closings.listAll(),
      this.capitalEvents.listAll(),
    ]);
    const icByInvestment = new Map(summaries.map((s) => [s.investmentId, s]));
    return investments.map((investment) =>
      computePosition(
        investment.id,
        closings.filter((c) => c.investmentId === investment.id),
        icByInvestment.get(investment.id) ?? null,
        events.filter((e) => e.investmentId === investment.id),
      ),
    );
  }

  async position(investmentId: number): Promise<Position> {
    await this.portfolio.get(investmentId);
    const [summaries, closings, events] = await Promise.all([
      this.icCases.latestSummaries(),
      this.closings.listForInvestment(investmentId),
      this.capitalEvents.listForInvestment(investmentId),
    ]);
    return computePosition(investmentId, closings, summaries.find((s) => s.investmentId === investmentId) ?? null, events);
  }

  /** What the position would be with one or more added closings, for the live preview on the closing form. */
  async previewWithClosings(investmentId: number, inputs: ClosingInput[]): Promise<Position> {
    await Promise.all(inputs.map((input) => this.closings.validate(investmentId, input)));
    const [summaries, existing, events] = await Promise.all([
      this.icCases.latestSummaries(),
      this.closings.listForInvestment(investmentId),
      this.capitalEvents.listForInvestment(investmentId),
    ]);
    const drafts: ClosingFigures[] = inputs.map((input, index) => ({
      closingNumber: existing.length + index + 1,
      closeDate: input.closeDate,
      icTrancheNumber: input.icTrancheNumber,
      sharesAllotted: input.sharesAllotted,
      amountInvestedUsd: input.amountInvestedUsd,
      expensesTotalUsd: sumUsd(input.expenses.map((e) => e.amountUsd)),
      ownershipPctAfter: input.ownershipPctAfter,
      postMoneyValuationUsd: input.postMoneyValuationUsd,
    }));
    return computePosition(investmentId, [...existing, ...drafts], summaries.find((s) => s.investmentId === investmentId) ?? null, events);
  }

  /**
   * Portfolio-level MOIC and IRR from actual money in the ground only: investments with no closing yet don't
   * count (nothing has actually been invested). Value is marked at each investment's latest known valuation
   * (its most recent closing's post-money, or a later priced capital event, × ownership) as of today — not a
   * future IC-exit projection.
   */
  async portfolioMoicAndIrr(): Promise<{ moic: number | null; irr: number | null }> {
    const [investments, summaries, allClosings, allEvents] = await Promise.all([
      this.portfolio.list(),
      this.icCases.latestSummaries(),
      this.closings.listAll(),
      this.capitalEvents.listAll(),
    ]);
    const icByInvestment = new Map(summaries.map((s) => [s.investmentId, s]));
    const today = new Date().toISOString().slice(0, 10);

    let cost = 0;
    let value = 0;
    const flows: CashFlow[] = [];

    for (const investment of investments) {
      const closings = allClosings.filter((c) => c.investmentId === investment.id);
      if (closings.length === 0) continue;
      const events: CapitalEventFigures[] = allEvents.filter((e) => e.investmentId === investment.id);
      const position = computePosition(investment.id, closings, icByInvestment.get(investment.id) ?? null, events);
      if (position.costUsd === null || position.ownershipPct === null || position.currentValuationUsd === null) continue;

      const stakeValue = roundUsd(position.currentValuationUsd * (position.ownershipPct / 100));
      cost += position.costUsd;
      value += stakeValue;
      for (const c of closings) flows.push({ date: c.closeDate, amount: -sumUsd([c.amountInvestedUsd, c.expensesTotalUsd]) });
      if (today > position.lastCloseDate!) flows.push({ date: today, amount: stakeValue });
    }

    const moic = cost > 0 ? roundTo(value / cost, 4) : null;
    const irr = xirr(flows);
    return { moic, irr: irr === null ? null : roundTo(irr, 6) };
  }
}
