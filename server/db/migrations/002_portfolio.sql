-- Portfolio module: the deal register.

CREATE TABLE companies (
  id                    BIGSERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  sector                TEXT,
  geography             TEXT,
  fiscal_year_end_month SMALLINT NOT NULL DEFAULT 12 CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE investments (
  id         BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies (id),
  instrument TEXT NOT NULL,
  deal_lead  TEXT,
  status     TEXT NOT NULL DEFAULT 'PIPELINE'
             CHECK (status IN ('PIPELINE', 'IC_APPROVED', 'PARTLY_DRAWN', 'CLOSED', 'ACTIVE', 'EXITED', 'WRITTEN_OFF')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX investments_company_id_idx ON investments (company_id);
