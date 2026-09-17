-- Closing module: what actually happened at each closing. Once a closing exists, these figures replace the
-- IC approval as the record of the transaction (shares held, cost, ownership).
-- All money in USD; the amount in the currency actually paid and its exchange rate are kept for audit.

CREATE TABLE closings (
  id                         BIGSERIAL PRIMARY KEY,
  investment_id              BIGINT NOT NULL REFERENCES investments (id),
  closing_number             INT NOT NULL CHECK (closing_number >= 1),
  ic_tranche_number          INT CHECK (ic_tranche_number >= 1),
  close_date                 DATE NOT NULL,
  security_class             TEXT,
  shares_allotted            NUMERIC(24, 4) NOT NULL CHECK (shares_allotted > 0),
  price_per_share_usd        NUMERIC(24, 8) NOT NULL CHECK (price_per_share_usd > 0),
  amount_invested_usd        NUMERIC(20, 2) NOT NULL CHECK (amount_invested_usd > 0),
  original_currency          TEXT NOT NULL DEFAULT 'USD' CHECK (original_currency ~ '^[A-Z]{3}$'),
  original_amount            NUMERIC(24, 2) CHECK (original_amount > 0),
  original_price_per_share   NUMERIC(24, 8) CHECK (original_price_per_share > 0),
  fx_rate_usd_per_unit       NUMERIC(20, 10) CHECK (fx_rate_usd_per_unit > 0),
  post_money_valuation_usd   NUMERIC(20, 2) CHECK (post_money_valuation_usd > 0),
  fully_diluted_shares_after NUMERIC(24, 4) CHECK (fully_diluted_shares_after > 0),
  ownership_pct_after        NUMERIC(9, 4) NOT NULL CHECK (ownership_pct_after > 0 AND ownership_pct_after <= 100),
  notes                      TEXT,
  created_by                 TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (investment_id, closing_number)
);

-- An IC tranche can be drawn by at most one closing.
CREATE UNIQUE INDEX closings_tranche_drawn_once ON closings (investment_id, ic_tranche_number) WHERE ic_tranche_number IS NOT NULL;

CREATE TABLE closing_expenses (
  id          BIGSERIAL PRIMARY KEY,
  closing_id  BIGINT NOT NULL REFERENCES closings (id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('LEGAL', 'DUE_DILIGENCE', 'STAMP_DUTY', 'ADVISORY', 'OTHER')),
  description TEXT,
  amount_usd  NUMERIC(20, 2) NOT NULL CHECK (amount_usd >= 0)
);

CREATE INDEX closing_expenses_closing_id_idx ON closing_expenses (closing_id);
