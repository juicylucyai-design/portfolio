import { Injectable } from '@nestjs/common';
import type { CarrySettings, CarryTerms, CarryTermsInput, InvestmentCarry, SessionUser } from '@nksq/contracts';
import { ClosingService } from '../closing';
import { IcCaseService } from '../ic-case';
import { PerformanceService } from '../performance';
import { PortfolioService } from '../portfolio';
import { roundUsd } from '../../shared/money';
import { computeCarry } from './carry.calc';
import { CarryRepository, defaultTerms } from './carry.repository';

@Injectable()
export class CarryService {
  constructor(
    private readonly repository: CarryRepository,
    private readonly portfolio: PortfolioService,
    private readonly performance: PerformanceService,
    private readonly closings: ClosingService,
    private readonly icCases: IcCaseService,
  ) {}

  settings(): Promise<CarrySettings> {
    return this.repository.settings();
  }

  setHurdleRate(hurdleRatePct: number): Promise<CarrySettings> {
    return this.repository.setHurdleRate(hurdleRatePct);
  }

  async termsForInvestment(investmentId: number): Promise<CarryTerms> {
    await this.portfolio.get(investmentId);
    return (await this.repository.get(investmentId)) ?? defaultTerms(investmentId);
  }

  async saveTerms(investmentId: number, input: CarryTermsInput, user: SessionUser): Promise<CarryTerms> {
    await this.portfolio.get(investmentId);
    return this.repository.save(investmentId, input, user.username);
  }

  deleteForInvestment(investmentId: number): Promise<void> {
    return this.repository.deleteForInvestment(investmentId);
  }

  /**
   * Carry for every investment, deal by deal, two ways: projected (the IC's exit assumptions) and current
   * (stake value at the latest known valuation — a closing or capital event — as if realized today). Cost is
   * the same for both: actual cost where closed, the IC's commitment otherwise. The hurdle compounds annually
   * over the holding period, from the first closing (or the IC's approval date, before any closing) to the
   * assumed exit or to today. There's no realized exit yet to compute an actual figure from.
   */
  async summary(): Promise<InvestmentCarry[]> {
    const [investments, positions, allTerms, settings, allClosings] = await Promise.all([
      this.portfolio.list(),
      this.performance.positions(),
      this.repository.listAll(),
      this.repository.settings(),
      this.closings.listAll(),
    ]);
    const positionByInvestment = new Map(positions.map((p) => [p.investmentId, p]));
    const today = new Date().toISOString().slice(0, 10);

    return Promise.all(
      investments.map(async (investment) => {
        const terms = allTerms.get(investment.id) ?? defaultTerms(investment.id);
        const position = positionByInvestment.get(investment.id);
        const costUsd = position?.costUsd ?? null;

        const ownClosings = allClosings.filter((c) => c.investmentId === investment.id).map((c) => c.closeDate).sort();
        const entryDate = ownClosings[0] ?? (await this.icCases.latest(investment.id))?.approvedOn ?? null;
        const exitDate = position?.exitYear ? `${position.exitYear}-12-31` : null;

        const currentProceedsUsd =
          position?.currentValuationUsd != null && position?.ownershipPct != null
            ? roundUsd(position.currentValuationUsd * (position.ownershipPct / 100))
            : null;

        return {
          investmentId: investment.id,
          companyName: investment.companyName,
          terms,
          projected: computeCarry(position?.projectedProceedsUsd ?? null, costUsd, entryDate, exitDate, terms, settings.hurdleRatePct),
          current: computeCarry(currentProceedsUsd, costUsd, entryDate, today, terms, settings.hurdleRatePct),
        };
      }),
    );
  }
}
