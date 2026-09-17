import { Injectable, NotFoundException } from '@nestjs/common';
import type { FinancialActual, FinancialActualInput, FinancialPeriodType } from '@nksq/contracts';
import { Db } from '../../database/db';

interface FinancialActualRow {
  id: number;
  investment_id: number;
  period_type: FinancialPeriodType;
  fiscal_year: number;
  quarter: number;
  period_end_date: string;
  revenue_usd: number | null;
  ebitda_usd: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

const toActual = (row: FinancialActualRow): FinancialActual => ({
  id: row.id,
  investmentId: row.investment_id,
  periodType: row.period_type,
  fiscalYear: row.fiscal_year,
  quarter: row.quarter === 0 ? null : row.quarter,
  periodEndDate: row.period_end_date,
  revenueUsd: row.revenue_usd,
  ebitdaUsd: row.ebitda_usd,
  notes: row.notes,
  createdBy: row.created_by,
  createdAt: row.created_at.toISOString(),
});

/** The only code that reads or writes the financial_actuals table. */
@Injectable()
export class FinancialActualRepository {
  constructor(private readonly db: Db) {}

  /** Every statement ever uploaded, newest upload first — including ones later superseded for the same period. */
  async list(investmentId: number): Promise<FinancialActual[]> {
    const rows = await this.db.query<FinancialActualRow>(
      'SELECT * FROM financial_actuals WHERE investment_id = $1 ORDER BY created_at DESC, id DESC',
      [investmentId],
    );
    return rows.map(toActual);
  }

  async get(investmentId: number, id: number): Promise<FinancialActual> {
    const rows = await this.db.query<FinancialActualRow>(
      'SELECT * FROM financial_actuals WHERE id = $1 AND investment_id = $2',
      [id, investmentId],
    );
    if (!rows[0]) throw new NotFoundException(`Financial actual ${id} was not found on this investment.`);
    return toActual(rows[0]);
  }

  async create(investmentId: number, input: FinancialActualInput, createdBy: string): Promise<FinancialActual> {
    const [row] = await this.db.query<FinancialActualRow>(
      `INSERT INTO financial_actuals (
         investment_id, period_type, fiscal_year, quarter, period_end_date, revenue_usd, ebitda_usd, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [investmentId, input.periodType, input.fiscalYear, input.quarter ?? 0, input.periodEndDate, input.revenueUsd, input.ebitdaUsd, input.notes ?? null, createdBy],
    );
    return toActual(row);
  }

  /** Deletes one financial actual. Returns false if it didn't exist for that investment. */
  async delete(investmentId: number, id: number): Promise<boolean> {
    const rows = await this.db.query<{ id: number }>(
      'DELETE FROM financial_actuals WHERE id = $1 AND investment_id = $2 RETURNING id',
      [id, investmentId],
    );
    return rows.length > 0;
  }

  async deleteForInvestment(investmentId: number): Promise<number> {
    const rows = await this.db.query<{ id: number }>('DELETE FROM financial_actuals WHERE investment_id = $1 RETURNING id', [investmentId]);
    return rows.length;
  }
}
