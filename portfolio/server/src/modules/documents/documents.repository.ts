import { Injectable } from '@nestjs/common';
import type { DocumentCategory, DocumentInfo } from '@nksq/contracts';
import { Db } from '../../database/db';

interface DocumentRow {
  id: number;
  investment_id: number | null;
  category: DocumentCategory;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  record_type: string | null;
  record_id: number | null;
  uploaded_by: string | null;
  uploaded_at: Date;
}

const COLUMNS = 'id, investment_id, category, file_name, content_type, size_bytes, sha256, record_type, record_id, uploaded_by, uploaded_at';

const toInfo = (row: DocumentRow): DocumentInfo => ({
  id: row.id,
  investmentId: row.investment_id,
  category: row.category,
  fileName: row.file_name,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  recordType: row.record_type,
  recordId: row.record_id,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at.toISOString(),
});

export interface NewDocument {
  category: DocumentCategory;
  fileName: string;
  contentType: string;
  sha256: string;
  uploadedBy: string;
  content: Buffer;
}

/**
 * The only code that reads or writes documents and document_files.
 * Files are stored in Postgres for now; moving them to object storage later only changes this class.
 */
@Injectable()
export class DocumentsRepository {
  constructor(private readonly db: Db) {}

  async insert(doc: NewDocument): Promise<DocumentInfo> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<DocumentRow>(
        `INSERT INTO documents (category, file_name, content_type, size_bytes, sha256, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
        [doc.category, doc.fileName, doc.contentType, doc.content.length, doc.sha256, doc.uploadedBy],
      );
      await tx.query('INSERT INTO document_files (document_id, content) VALUES ($1, $2)', [row.id, doc.content]);
      return toInfo(row);
    });
  }

  async findById(id: number): Promise<DocumentInfo | null> {
    const rows = await this.db.query<DocumentRow>(`SELECT ${COLUMNS} FROM documents WHERE id = $1`, [id]);
    return rows[0] ? toInfo(rows[0]) : null;
  }

  async content(id: number): Promise<Buffer | null> {
    const rows = await this.db.query<{ content: Buffer }>('SELECT content FROM document_files WHERE document_id = $1', [id]);
    return rows[0]?.content ?? null;
  }

  async listForInvestment(investmentId: number): Promise<DocumentInfo[]> {
    const rows = await this.db.query<DocumentRow>(
      `SELECT ${COLUMNS} FROM documents WHERE investment_id = $1 ORDER BY uploaded_at DESC, id DESC`,
      [investmentId],
    );
    return rows.map(toInfo);
  }

  async attach(id: number, investmentId: number, recordType: string | null, recordId: number | null): Promise<DocumentInfo> {
    const [row] = await this.db.query<DocumentRow>(
      `UPDATE documents SET investment_id = $2, record_type = $3, record_id = $4, attached_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, investmentId, recordType, recordId],
    );
    return toInfo(row);
  }

  async idsForInvestment(investmentId: number): Promise<number[]> {
    const rows = await this.db.query<{ id: number }>('SELECT id FROM documents WHERE investment_id = $1', [investmentId]);
    return rows.map((row) => row.id);
  }

  async idsForRecord(recordType: string, recordId: number): Promise<number[]> {
    const rows = await this.db.query<{ id: number }>('SELECT id FROM documents WHERE record_type = $1 AND record_id = $2', [recordType, recordId]);
    return rows.map((row) => row.id);
  }

  async unattachedOlderThan(hours: number): Promise<number[]> {
    const rows = await this.db.query<{ id: number }>(
      `SELECT id FROM documents WHERE investment_id IS NULL AND uploaded_at < now() - make_interval(hours => $1)`,
      [hours],
    );
    return rows.map((row) => row.id);
  }

  /** Deletes the documents and their file contents. Returns how many and how many bytes. */
  async deleteByIds(ids: number[]): Promise<{ count: number; bytes: number }> {
    if (ids.length === 0) return { count: 0, bytes: 0 };
    const rows = await this.db.query<{ size_bytes: number }>(
      'DELETE FROM documents WHERE id = ANY($1::bigint[]) RETURNING size_bytes',
      [ids],
    );
    return { count: rows.length, bytes: rows.reduce((sum, row) => sum + row.size_bytes, 0) };
  }
}
