import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateInvestmentRequest, Investment, SessionUser } from '@nksq/contracts';
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

  /** Called by IC Case when an approval is recorded. Status only ever moves forward. */
  async markIcApproved(id: number): Promise<void> {
    const investment = await this.get(id);
    if (investment.status === 'PIPELINE') await this.repository.updateStatus(id, 'IC_APPROVED');
  }
}
