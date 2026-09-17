import { Injectable } from '@nestjs/common';
import type { IcCase, IcCaseInput, IcCaseSummary, IcProjection, IcTranche } from '@nksq/contracts';
import { Db } from '../../database/db';

interface IcCaseRow {
  id: number;
  investment_id: number;
  version: number;
  approved_on: string;
  entry_post_money_usd: number;
  entry_ownership_pct: number;
  dilution_to_exit_pct: number;
  exit_year: number;
  exit_valuation_usd: number;
  notes: string | null;
  commitment_usd: number;
  exit_ownership_pct: number;
  projected_proceeds_usd: number;
  projected_moic: number;
  projected_irr: number | null;
  superseded_by: number | null;
  created_by: string | null;
  created_at: Date;
}

interface TrancheRow {
  ic_case_id: number;
  tranche_number: number;
  amount_usd: number;
  expected_date: string;
  milestone: string | null;
}

/** The only code that reads or writes the ic_cases and ic_tranches tables. */
@Injectable()
export class IcCaseRepository {
  constructor(private readonly db: Db) {}

  /** Every version for one investment, newest first, each with its tranches. */
  async listForInvestment(investmentId: number): Promise<IcCase[]> {
    const cases = await this.db.query<IcCaseRow>('SELECT * FROM ic_cases WHERE investment_id = $1 ORDER BY version DESC', [investmentId]);
    if (cases.length === 0) return [];

    const tranches = await this.db.query<TrancheRow>(
      `SELECT ic_case_id, tranche_number, amount_usd, expected_date, milestone
       FROM ic_tranches WHERE ic_case_id = ANY($1::bigint[]) ORDER BY tranche_number`,
      [cases.map((row) => row.id)],
    );
    const byCase = new Map<number, IcTranche[]>();
    for (const row of tranches) {
      const list = byCase.get(row.ic_case_id) ?? [];
      list.push({ trancheNumber: row.tranche_number, amountUsd: row.amount_usd, expectedDate: row.expected_date, milestone: row.milestone });
      byCase.set(row.ic_case_id, list);
    }

    return cases.map((row) => ({
      id: row.id,
      investmentId: row.investment_id,
      version: row.version,
      approvedOn: row.approved_on,
      entryPostMoneyUsd: row.entry_post_money_usd,
      entryOwnershipPct: row.entry_ownership_pct,
      dilutionToExitPct: row.dilution_to_exit_pct,
      exitYear: row.exit_year,
      exitValuationUsd: row.exit_valuation_usd,
      notes: row.notes,
      commitmentUsd: row.commitment_usd,
      exitOwnershipPct: row.exit_ownership_pct,
      projectedProceedsUsd: row.projected_proceeds_usd,
      projectedMoic: row.projected_moic,
      projectedIrr: row.projected_irr,
      exitDate: `${row.exit_year}-12-31`,
      supersededBy: row.superseded_by,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      tranches: byCase.get(row.id) ?? [],
    }));
  }

  /** The current (latest) version of every investment that has one, each with its tranches. */
  async latestSummaries(): Promise<IcCaseSummary[]> {
    const rows = await this.db.query<IcCaseRow>(
      `SELECT DISTINCT ON (c.investment_id) c.* FROM ic_cases c ORDER BY c.investment_id, c.version DESC`,
    );
    if (rows.length === 0) return [];

    const tranches = await this.db.query<TrancheRow>(
      `SELECT ic_case_id, tranche_number, amount_usd, expected_date, milestone
       FROM ic_tranches WHERE ic_case_id = ANY($1::bigint[]) ORDER BY tranche_number`,
      [rows.map((row) => row.id)],
    );
    const byCase = new Map<number, IcTranche[]>();
    for (const row of tranches) {
      const list = byCase.get(row.ic_case_id) ?? [];
      list.push({ trancheNumber: row.tranche_number, amountUsd: row.amount_usd, expectedDate: row.expected_date, milestone: row.milestone });
      byCase.set(row.ic_case_id, list);
    }

    return rows.map((row) => ({
      investmentId: row.investment_id,
      version: row.version,
      commitmentUsd: row.commitment_usd,
      projectedProceedsUsd: row.projected_proceeds_usd,
      projectedMoic: row.projected_moic,
      projectedIrr: row.projected_irr,
      exitYear: row.exit_year,
      exitValuationUsd: row.exit_valuation_usd,
      entryPostMoneyUsd: row.entry_post_money_usd,
      entryOwnershipPct: row.entry_ownership_pct,
      dilutionToExitPct: row.dilution_to_exit_pct,
      tranches: byCase.get(row.id) ?? [],
    }));
  }

  /** Deletes every version and its tranches (tranches cascade). Returns how many versions were removed. */
  async deleteForInvestment(investmentId: number): Promise<number> {
    const rows = await this.db.query<{ id: number }>('DELETE FROM ic_cases WHERE investment_id = $1 RETURNING id', [investmentId]);
    return rows.length;
  }

  /** Adds the next version and marks the previous one superseded, in one transaction. Returns the new id. */
  async createVersion(investmentId: number, input: IcCaseInput, projection: IcProjection, createdBy: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [investmentId]);
      const [{ next }] = await tx.query<{ next: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM ic_cases WHERE investment_id = $1',
        [investmentId],
      );

      const [created] = await tx.query<{ id: number }>(
        `INSERT INTO ic_cases (
           investment_id, version, approved_on, entry_post_money_usd, entry_ownership_pct, dilution_to_exit_pct,
           exit_year, exit_valuation_usd, notes, commitment_usd, exit_ownership_pct, projected_proceeds_usd,
           projected_moic, projected_irr, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          investmentId, next, input.approvedOn, input.entryPostMoneyUsd, input.entryOwnershipPct, input.dilutionToExitPct,
          input.exitYear, input.exitValuationUsd, input.notes ?? null, projection.commitmentUsd, projection.exitOwnershipPct,
          projection.projectedProceedsUsd, projection.projectedMoic, projection.projectedIrr, createdBy,
        ],
      );

      await tx.query(
        'UPDATE ic_cases SET superseded_by = $1 WHERE investment_id = $2 AND id <> $1 AND superseded_by IS NULL',
        [created.id, investmentId],
      );

      for (const [index, tranche] of input.tranches.entries()) {
        await tx.query(
          'INSERT INTO ic_tranches (ic_case_id, tranche_number, amount_usd, expected_date, milestone) VALUES ($1, $2, $3, $4, $5)',
          [created.id, index + 1, tranche.amountUsd, tranche.expectedDate, tranche.milestone ?? null],
        );
      }
      return created.id;
    });
  }
}
