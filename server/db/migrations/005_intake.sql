-- Intake module: every time Claude reads a document, what it returned.
-- Keeping the model and prompt version means a later re-run can be compared, never silently replacing past results.

CREATE TABLE extractions (
  id             BIGSERIAL PRIMARY KEY,
  document_id    BIGINT NOT NULL, -- a Documents id; removed with its document by the Lifecycle module
  kind           TEXT NOT NULL CHECK (kind IN ('IC_MEMO')),
  status         TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED')),
  model          TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  result         JSONB,
  error          TEXT,
  input_tokens   INT,
  output_tokens  INT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX extractions_document_id_idx ON extractions (document_id);
