import { Injectable, NotFoundException } from '@nestjs/common';
import type { CapitalEvent, CapitalEventInput, CapitalEventType } from '@nksq/contracts';
import { Db } from '../../database/db';

interface CapitalEventRow {
  id: number;
  investment_id: number;
  event_type: CapitalEventType;
  event_date: string;
  selling_party: string | null;
  buying_party: string | null;
  security_class: string | null;
  shares: number | null;
  price_per_share_usd: number | null;
  total_consideration_usd: number | null;
  implied_valuation_usd: number | null;
  deadline_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

const toEvent = (row: CapitalEventRow): CapitalEvent => ({
  id: row.id,
  investmentId: row.investment_id,
  eventType: row.event_type,
  eventDate: row.event_date,
  sellingParty: row.selling_party,
  buyingParty: row.buying_party,
  securityClass: row.security_class,
  shares: row.shares,
  pricePerShareUsd: row.price_per_share_usd,
  totalConsiderationUsd: row.total_consideration_usd,
  impliedValuationUsd: row.implied_valuation_usd,
  deadlineDate: row.deadline_date,
  notes: row.notes,
  createdBy: row.created_by,
  createdAt: row.created_at.toISOString(),
});

/** The only code that reads or writes the capital_events table. */
@Injectable()
export class CapitalEventRepository {
  constructor(private readonly db: Db) {}

  /** Every capital event, for position summaries (marking current valuation). */
  async listAll(): Promise<CapitalEvent[]> {
    const rows = await this.db.query<CapitalEventRow>('SELECT * FROM capital_events ORDER BY investment_id, event_date');
    return rows.map(toEvent);
  }

  async list(investmentId: number): Promise<CapitalEvent[]> {
    const rows = await this.db.query<CapitalEventRow>(
      'SELECT * FROM capital_events WHERE investment_id = $1 ORDER BY event_date DESC, id DESC',
      [investmentId],
    );
    return rows.map(toEvent);
  }

  async get(investmentId: number, id: number): Promise<CapitalEvent> {
    const rows = await this.db.query<CapitalEventRow>(
      'SELECT * FROM capital_events WHERE id = $1 AND investment_id = $2',
      [id, investmentId],
    );
    if (!rows[0]) throw new NotFoundException(`Capital event ${id} was not found on this investment.`);
    return toEvent(rows[0]);
  }

  async create(investmentId: number, input: CapitalEventInput, createdBy: string): Promise<CapitalEvent> {
    const [row] = await this.db.query<CapitalEventRow>(
      `INSERT INTO capital_events (
         investment_id, event_type, event_date, selling_party, buying_party, security_class, shares,
         price_per_share_usd, total_consideration_usd, implied_valuation_usd, deadline_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        investmentId, input.eventType, input.eventDate, input.sellingParty, input.buyingParty, input.securityClass,
        input.shares, input.pricePerShareUsd, input.totalConsiderationUsd, input.impliedValuationUsd,
        input.deadlineDate, input.notes, createdBy,
      ],
    );
    return toEvent(row);
  }

  /** Deletes one capital event. Returns false if it didn't exist for that investment. */
  async delete(investmentId: number, id: number): Promise<boolean> {
    const rows = await this.db.query<{ id: number }>(
      'DELETE FROM capital_events WHERE id = $1 AND investment_id = $2 RETURNING id',
      [id, investmentId],
    );
    return rows.length > 0;
  }

  async deleteForInvestment(investmentId: number): Promise<number> {
    const rows = await this.db.query<{ id: number }>('DELETE FROM capital_events WHERE investment_id = $1 RETURNING id', [investmentId]);
    return rows.length;
  }
}
