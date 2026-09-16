import { BadRequestException, Injectable } from '@nestjs/common';
import type { IcCase, IcCaseInput, IcCaseSummary, IcProjection, SessionUser } from '@nksq/contracts';
import { PortfolioService } from '../portfolio';
import { exitDateFor, projectIcCase } from './ic-case.projection';
import { IcCaseRepository } from './ic-case.repository';

@Injectable()
export class IcCaseService {
  constructor(
    private readonly repository: IcCaseRepository,
    private readonly portfolio: PortfolioService,
  ) {}

  /** Calculates the projection without saving anything, for the live preview on the form. */
  preview(input: IcCaseInput): IcProjection {
    this.checkDates(input);
    return projectIcCase(input);
  }

  async listForInvestment(investmentId: number): Promise<IcCase[]> {
    await this.portfolio.get(investmentId);
    return this.repository.listForInvestment(investmentId);
  }

  latestSummaries(): Promise<IcCaseSummary[]> {
    return this.repository.latestSummaries();
  }

  /** Records an IC approval. The first one is version 1; each revised IC memo adds the next version. */
  async recordApproval(investmentId: number, input: IcCaseInput, user: SessionUser): Promise<IcCase> {
    await this.portfolio.get(investmentId);
    this.checkDates(input);
    const projection = projectIcCase(input);
    const id = await this.repository.createVersion(investmentId, input, projection, user.username);
    await this.portfolio.markIcApproved(investmentId);

    const created = (await this.repository.listForInvestment(investmentId)).find((icCase) => icCase.id === id);
    if (!created) throw new Error(`IC case ${id} was saved but could not be read back.`);
    return created;
  }

  private checkDates(input: IcCaseInput): void {
    const exitDate = exitDateFor(input.exitYear);
    const lastTranche = input.tranches.map((tranche) => tranche.expectedDate).sort().at(-1);
    if (lastTranche && lastTranche >= exitDate) {
      throw new BadRequestException(`Exit year ${input.exitYear} must come after the last tranche (${lastTranche}).`);
    }
  }
}
