import { Injectable } from '@nestjs/common';
import type { CarrySettings, CarryTerms, CarryTermsInput } from '@nksq/contracts';
import { Db } from '../../database/db';

interface SettingsRow {
  hurdle_rate_pct: number;
}

interface TermsRow {
  investment_id: number;
  qualified: boolean;
  origination_person: string | null;
  origination_pct: number;
  monitoring_person: string | null;
  monitoring_pct: number;
  closure_person: string | null;
  closure_pct: number;
}

const toTerms = (row: TermsRow): CarryTerms => ({
  investmentId: row.investment_id,
  qualified: row.qualified,
  originationPerson: row.origination_person,
  originationPct: row.origination_pct,
  monitoringPerson: row.monitoring_person,
  monitoringPct: row.monitoring_pct,
  closurePerson: row.closure_person,
  closurePct: row.closure_pct,
});

/** Defaults for an investment that has no carry_terms row yet: qualified, 5/5/10, no one named. */
export function defaultTerms(investmentId: number): CarryTerms {
  return {
    investmentId,
    qualified: true,
    originationPerson: null,
    originationPct: 5,
    monitoringPerson: null,
    monitoringPct: 5,
    closurePerson: null,
    closurePct: 10,
  };
}

/** The only code that reads or writes carry_settings and carry_terms. */
@Injectable()
export class CarryRepository {
  constructor(private readonly db: Db) {}

  async settings(): Promise<CarrySettings> {
    const [row] = await this.db.query<SettingsRow>('SELECT hurdle_rate_pct FROM carry_settings WHERE id = 1');
    return { hurdleRatePct: row.hurdle_rate_pct };
  }

  async setHurdleRate(hurdleRatePct: number): Promise<CarrySettings> {
    const [row] = await this.db.query<SettingsRow>(
      'UPDATE carry_settings SET hurdle_rate_pct = $1 WHERE id = 1 RETURNING hurdle_rate_pct',
      [hurdleRatePct],
    );
    return { hurdleRatePct: row.hurdle_rate_pct };
  }

  /** All saved terms, keyed by investment id. An investment missing from this map uses defaultTerms(). */
  async listAll(): Promise<Map<number, CarryTerms>> {
    const rows = await this.db.query<TermsRow>('SELECT * FROM carry_terms');
    return new Map(rows.map((row) => [row.investment_id, toTerms(row)]));
  }

  async get(investmentId: number): Promise<CarryTerms | null> {
    const rows = await this.db.query<TermsRow>('SELECT * FROM carry_terms WHERE investment_id = $1', [investmentId]);
    return rows[0] ? toTerms(rows[0]) : null;
  }

  async save(investmentId: number, input: CarryTermsInput, updatedBy: string): Promise<CarryTerms> {
    const [row] = await this.db.query<TermsRow>(
      `INSERT INTO carry_terms (
         investment_id, qualified, origination_person, origination_pct, monitoring_person, monitoring_pct,
         closure_person, closure_pct, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (investment_id) DO UPDATE SET
         qualified = EXCLUDED.qualified,
         origination_person = EXCLUDED.origination_person,
         origination_pct = EXCLUDED.origination_pct,
         monitoring_person = EXCLUDED.monitoring_person,
         monitoring_pct = EXCLUDED.monitoring_pct,
         closure_person = EXCLUDED.closure_person,
         closure_pct = EXCLUDED.closure_pct,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING *`,
      [
        investmentId, input.qualified, input.originationPerson, input.originationPct, input.monitoringPerson,
        input.monitoringPct, input.closurePerson, input.closurePct, updatedBy,
      ],
    );
    return toTerms(row);
  }

  async deleteForInvestment(investmentId: number): Promise<void> {
    await this.db.query('DELETE FROM carry_terms WHERE investment_id = $1', [investmentId]);
  }
}
