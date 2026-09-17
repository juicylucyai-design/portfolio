import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateInvestmentRequest, Investment, InvestmentStatus, SessionUser } from '@nksq/contracts';
import { PortfolioRepository } from './portfolio.repository';

@Injectable()
export class PortfolioService {
  constructor(private readonly repository: PortfolioRepository) {}

  list(): Promise<Investment[]> {
    return this.repository.list();
  }

  async get(id: number): Promise<Investment> {
    const investment = await this.repository.findById(id);
    if (!investment) throw new NotFoundException(`Investment ${id} was not found.`);
    return investment;
  }

  async create(input: CreateInvestmentRequest, user: SessionUser): Promise<Investment> {
    const id = await this.repository.create(input, user.username);
    return this.get(id);
  }

  /**
   * Removes the investment row itself. Only the Lifecycle module calls this, after it has removed
   * everything other modules hold for the investment.
   */
  async delete(id: number): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }

  /**
   * Sets the deal-stage status after closings change. Only moves between the pre-investment and closing
   * stages; later stages (active, exited, written off) are never overwritten here.
   */
  async setDealStage(id: number, status: 'PIPELINE' | 'IC_APPROVED' | 'PARTLY_DRAWN' | 'CLOSED'): Promise<InvestmentStatus> {
    const investment = await this.get(id);
    const dealStages: InvestmentStatus[] = ['PIPELINE', 'IC_APPROVED', 'PARTLY_DRAWN', 'CLOSED'];
    if (!dealStages.includes(investment.status) || investment.status === status) return investment.status;
    await this.repository.updateStatus(id, status);
    return status;
  }

  /** Called by IC Case when an approval is recorded. Status only ever moves forward. */
  async markIcApproved(id: number): Promise<void> {
    const investment = await this.get(id);
    if (investment.status === 'PIPELINE') await this.repository.updateStatus(id, 'IC_APPROVED');
  }
}
