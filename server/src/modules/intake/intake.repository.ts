import { Injectable } from '@nestjs/common';
import { Db } from '../../database/db';

export type ExtractionKind = 'IC_MEMO' | 'CLOSING' | 'CAPITAL_EVENT' | 'FINANCIAL_STATEMENT';

export interface NewExtraction {
  documentId: number;
  kind: ExtractionKind;
  status: 'SUCCEEDED' | 'FAILED';
  model: string;
  promptVersion: string;
  result: unknown;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdBy: string;
}

/** The only code that reads or writes the extractions table. */
@Injectable()
export class IntakeRepository {
  constructor(private readonly db: Db) {}

  async insert(extraction: NewExtraction): Promise<number> {
    const [row] = await this.db.query<{ id: number }>(
      `INSERT INTO extractions (document_id, kind, status, model, prompt_version, result, error, input_tokens, output_tokens, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        extraction.documentId, extraction.kind, extraction.status, extraction.model, extraction.promptVersion,
        extraction.result === null ? null : JSON.stringify(extraction.result), extraction.error,
        extraction.inputTokens, extraction.outputTokens, extraction.createdBy,
      ],
    );
    return row.id;
  }

  async deleteForDocuments(documentIds: number[]): Promise<number> {
    if (documentIds.length === 0) return 0;
    const rows = await this.db.query<{ id: number }>('DELETE FROM extractions WHERE document_id = ANY($1::bigint[]) RETURNING id', [documentIds]);
    return rows.length;
  }
}
