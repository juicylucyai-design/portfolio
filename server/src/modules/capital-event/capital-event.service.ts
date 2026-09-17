import { Injectable, NotFoundException } from '@nestjs/common';
import type { CapitalEvent, CapitalEventInput, SessionUser } from '@nksq/contracts';
import { PortfolioService } from '../portfolio';
import { CapitalEventRepository } from './capital-event.repository';

@Injectable()
export class CapitalEventService {
  constructor(
    private readonly repository: CapitalEventRepository,
    private readonly portfolio: PortfolioService,
  ) {}

  async listForInvestment(investmentId: number): Promise<CapitalEvent[]> {
    await this.portfolio.get(investmentId);
    return this.repository.list(investmentId);
  }

  /** Every capital event across the portfolio, for position summaries. */
  listAll(): Promise<CapitalEvent[]> {
    return this.repository.listAll();
  }

  async get(investmentId: number, id: number): Promise<CapitalEvent> {
    await this.portfolio.get(investmentId);
    return this.repository.get(investmentId, id);
  }

  /** Only the Lifecycle module calls this, so the evidence document is handled with it. */
  async record(investmentId: number, input: CapitalEventInput, user: SessionUser): Promise<CapitalEvent> {
    await this.portfolio.get(investmentId);
    return this.repository.create(investmentId, input, user.username);
  }

  /** Only the Lifecycle module calls this. */
  async delete(investmentId: number, id: number): Promise<void> {
    if (!(await this.repository.delete(investmentId, id))) {
      throw new NotFoundException(`Capital event ${id} was not found on this investment.`);
    }
  }

  /** Only the Lifecycle module calls this, when an investment is deleted. */
  deleteForInvestment(investmentId: number): Promise<number> {
    return this.repository.deleteForInvestment(investmentId);
  }
}
