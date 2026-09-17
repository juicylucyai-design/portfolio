-- Financial actuals: quarterly and annual statements uploaded after the IC memo, compared against its
-- year-by-year revenue and EBITDA projections (see ic_financials, migration 011).
CREATE TABLE financial_actuals (
  id              BIGSERIAL PRIMARY KEY,
  investment_id   BIGINT NOT NULL REFERENCES investments (id),
  period_type     TEXT NOT NULL CHECK (period_type IN ('QUARTERLY', 'ANNUAL')),
  fiscal_year     INT NOT NULL CHECK (fiscal_year BETWEEN 1990 AND 2200),
  -- 0 means "the whole year" (an ANNUAL statement); 1-4 is the quarter number for a QUARTERLY one. Using 0
  -- instead of NULL here lets the UNIQUE constraint below actually stop duplicate annual statements too.
  quarter         INT NOT NULL DEFAULT 0 CHECK (quarter BETWEEN 0 AND 4),
  period_end_date DATE NOT NULL,
  revenue_usd     NUMERIC(20, 2) CHECK (revenue_usd >= 0),
  ebitda_usd      NUMERIC(20, 2),
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((period_type = 'ANNUAL' AND quarter = 0) OR (period_type = 'QUARTERLY' AND quarter BETWEEN 1 AND 4)),
  UNIQUE (investment_id, period_type, fiscal_year, quarter)
);
