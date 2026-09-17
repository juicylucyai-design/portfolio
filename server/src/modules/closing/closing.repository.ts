import { Injectable } from '@nestjs/common';
import type { Closing, ClosingInput, ExpenseCategory } from '@nksq/contracts';
import { Db } from '../../database/db';
import { sumUsd } from '../../shared/money';

interface ClosingRow {
  id: number;
  investment_id: number;
  closing_number: number;
  ic_tranche_number: number | null;
  close_date: string;
  security_class: string | null;
  shares_allotted: number;
  price_per_share_usd: number;
  amount_invested_usd: number;
  original_currency: string;
  original_amount: number | null;
  original_price_per_share: number | null;
  fx_rate_usd_per_unit: number | null;
  post_money_valuation_usd: number | null;
  fully_diluted_shares_after: number | null;
  ownership_pct_after: number;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

interface ExpenseRow {
  closing_id: number;
  category: ExpenseCategory;
  description: string | null;
  amount_usd: number;
}

/** The only code that reads or writes the closings and closing_expenses tables. */
@Injectable()
export class ClosingRepository {
  constructor(private readonly db: Db) {}

  /** Closings for one investment, or for all investments when no id is given, in date order. */
  async list(investmentId?: number): Promise<Closing[]> {
    const rows = await this.db.query<ClosingRow>(
      `SELECT * FROM closings ${investmentId === undefined ? '' : 'WHERE investment_id = $1'}
       ORDER BY investment_id, close_date, closing_number`,
      investmentId === undefined ? [] : [investmentId],
    );
    if (rows.length === 0) return [];

    const expenses = await this.db.query<ExpenseRow>(
      'SELECT closing_id, category, description, amount_usd FROM closing_expenses WHERE closing_id = ANY($1::bigint[]) ORDER BY id',
      [rows.map((row) => row.id)],
    );
    const byClosing = new Map<number, ExpenseRow[]>();
    for (const expense of expenses) byClosing.set(expense.closing_id, [...(byClosing.get(expense.closing_id) ?? []), expense]);

    return rows.map((row) => {
      const lines = (byClosing.get(row.id) ?? []).map((e) => ({ category: e.category, description: e.description, amountUsd: e.amount_usd }));
      const expensesTotalUsd = sumUsd(lines.map((e) => e.amountUsd));
      return {
        id: row.id,
        investmentId: row.investment_id,
        closingNumber: row.closing_number,
        icTrancheNumber: row.ic_tranche_number,
        closeDate: row.close_date,
        securityClass: row.security_class,
        sharesAllotted: row.shares_allotted,
        pricePerShareUsd: row.price_per_share_usd,
        amountInvestedUsd: row.amount_invested_usd,
        originalCurrency: row.original_currency,
        originalAmount: row.original_amount,
        originalPricePerShare: row.original_price_per_share,
        fxRateUsdPerUnit: row.fx_rate_usd_per_unit,
        postMoneyValuationUsd: row.post_money_valuation_usd,
        fullyDilutedSharesAfter: row.fully_diluted_shares_after,
        ownershipPctAfter: row.ownership_pct_after,
        notes: row.notes,
        expenses: lines,
        expensesTotalUsd,
        totalCostUsd: sumUsd([row.amount_invested_usd, expensesTotalUsd]),
        createdBy: row.created_by,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  async create(investmentId: number, input: ClosingInput, createdBy: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [investmentId]);
      const [{ next }] = await tx.query<{ next: number }>(
        'SELECT COALESCE(MAX(closing_number), 0) + 1 AS next FROM closings WHERE investment_id = $1',
        [investmentId],
      );
      const [created] = await tx.query<{ id: number }>(
        `INSERT INTO closings (
           investment_id, closing_number, ic_tranche_number, close_date, security_class, shares_allotted, price_per_share_usd,
           amount_invested_usd, original_currency, original_amount, original_price_per_share, fx_rate_usd_per_unit,
           post_money_valuation_usd, fully_diluted_shares_after, ownership_pct_after, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          investmentId, next, input.icTrancheNumber, input.closeDate, input.securityClass, input.sharesAllotted, input.pricePerShareUsd,
          input.amountInvestedUsd, input.originalCurrency, input.originalAmount, input.originalPricePerShare, input.fxRateUsdPerUnit,
          input.postMoneyValuationUsd, input.fullyDilutedSharesAfter, input.ownershipPctAfter, input.notes, createdBy,
        ],
      );
      for (const expense of input.expenses) {
        await tx.query(
          'INSERT INTO closing_expenses (closing_id, category, description, amount_usd) VALUES ($1, $2, $3, $4)',
          [created.id, expense.category, expense.description, expense.amountUsd],
        );
      }
      return created.id;
    });
  }

  /** Deletes one closing (expenses cascade). Returns false if it didn't exist for that investment. */
  async delete(investmentId: number, closingId: number): Promise<boolean> {
    const rows = await this.db.query<{ id: number }>('DELETE FROM closings WHERE id = $1 AND investment_id = $2 RETURNING id', [closingId, investmentId]);
    return rows.length > 0;
  }

  async deleteForInvestment(investmentId: number): Promise<number> {
    const rows = await this.db.query<{ id: number }>('DELETE FROM closings WHERE investment_id = $1 RETURNING id', [investmentId]);
    return rows.length;
  }
}
