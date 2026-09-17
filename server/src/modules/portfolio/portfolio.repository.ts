import { Injectable } from '@nestjs/common';
import type { CreateInvestmentRequest, Investment, InvestmentStatus } from '@nksq/contracts';
import { Db } from '../../database/db';

interface InvestmentRow {
  id: number;
  company_id: number;
  company_name: string;
  sector: string | null;
  geography: string | null;
  fiscal_year_end_month: number;
  instrument: string;
  deal_lead: string | null;
  status: InvestmentStatus;
  created_by: string | null;
  created_at: Date;
}

const SELECT_INVESTMENT = `
  SELECT i.id, i.company_id, c.name AS company_name, c.sector, c.geography, c.fiscal_year_end_month,
         i.instrument, i.deal_lead, i.status, i.created_by, i.created_at
  FROM investments i
  JOIN companies c ON c.id = i.company_id`;

const toInvestment = (row: InvestmentRow): Investment => ({
  id: row.id,
  companyId: row.company_id,
  companyName: row.company_name,
  sector: row.sector,
  geography: row.geography,
  fiscalYearEndMonth: row.fiscal_year_end_month,
  instrument: row.instrument,
  dealLead: row.deal_lead,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at.toISOString(),
});

/** The only code that reads or writes the companies and investments tables. */
@Injectable()
export class PortfolioRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<Investment[]> {
    const rows = await this.db.query<InvestmentRow>(`${SELECT_INVESTMENT} ORDER BY lower(c.name), i.id`);
    return rows.map(toInvestment);
  }

  async findById(id: number): Promise<Investment | null> {
    const rows = await this.db.query<InvestmentRow>(`${SELECT_INVESTMENT} WHERE i.id = $1`, [id]);
    return rows[0] ? toInvestment(rows[0]) : null;
  }

  async create(input: CreateInvestmentRequest, createdBy: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [company] = await tx.query<{ id: number }>(
        `INSERT INTO companies (name, sector, geography, fiscal_year_end_month)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.companyName, input.sector ?? null, input.geography ?? null, input.fiscalYearEndMonth],
      );
      const [investment] = await tx.query<{ id: number }>(
        `INSERT INTO investments (company_id, instrument, deal_lead, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [company.id, input.instrument, input.dealLead ?? null, createdBy],
      );
      return investment.id;
    });
  }

  async updateStatus(id: number, status: InvestmentStatus): Promise<void> {
    await this.db.query('UPDATE investments SET status = $1 WHERE id = $2', [status, id]);
  }

  /** Deletes the investment, and its company if no other investment refers to it. */
  async delete(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [deleted] = await tx.query<{ company_id: number }>('DELETE FROM investments WHERE id = $1 RETURNING company_id', [id]);
      if (!deleted) return;
      await tx.query(
        'DELETE FROM companies c WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM investments i WHERE i.company_id = c.id)',
        [deleted.company_id],
      );
    });
  }
}
