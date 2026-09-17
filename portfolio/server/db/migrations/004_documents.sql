-- Documents module: the file repository.
-- Metadata and bytes live in separate tables so listing documents never reads file contents.
-- A document with investment_id NULL is an upload that hasn't been saved with an investment yet;
-- those are removed automatically after 24 hours.

CREATE TABLE documents (
  id           BIGSERIAL PRIMARY KEY,
  investment_id BIGINT REFERENCES investments (id),
  category     TEXT NOT NULL CHECK (category IN ('IC_MEMO', 'CLOSING', 'CAPITAL_EVENT', 'STATEMENT', 'OTHER')),
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INT NOT NULL CHECK (size_bytes > 0),
  sha256       TEXT NOT NULL,
  record_type  TEXT,
  record_id    BIGINT,
  uploaded_by  TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  attached_at  TIMESTAMPTZ
);

CREATE TABLE document_files (
  document_id BIGINT PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  content     BYTEA NOT NULL
);

CREATE INDEX documents_investment_id_idx ON documents (investment_id);
CREATE INDEX documents_unattached_idx ON documents (uploaded_at) WHERE investment_id IS NULL;
