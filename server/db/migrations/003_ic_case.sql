-- IC Case module: what the investment committee approved.
-- Rows are never edited. A revised IC memo adds a new version and marks the previous one superseded.
-- All money in USD; percentages 0–100; projected_irr is a fraction (0.25 = 25%).

CREATE TABLE ic_cases (
  id                     BIGSERIAL PRIMARY KEY,
  investment_id          BIGINT NOT NULL REFERENCES investments (id),
  version                INT NOT NULL CHECK (version >= 1),
  approved_on            DATE NOT NULL,
  entry_post_money_usd   NUMERIC(20, 2) NOT NULL CHECK (entry_post_money_usd > 0),
  entry_ownership_pct    NUMERIC(9, 4) NOT NULL CHECK (entry_ownership_pct > 0 AND entry_ownership_pct <= 100),
  dilution_to_exit_pct   NUMERIC(9, 4) NOT NULL DEFAULT 0 CHECK (dilution_to_exit_pct >= 0 AND dilution_to_exit_pct < 100),
  exit_year              INT NOT NULL CHECK (exit_year BETWEEN 1990 AND 2200),
  exit_valuation_usd     NUMERIC(20, 2) NOT NULL CHECK (exit_valuation_usd >= 0),
  notes                  TEXT,
  -- Projection frozen at approval time, so later changes to the calculation never alter what IC saw.
  commitment_usd         NUMERIC(20, 2) NOT NULL CHECK (commitment_usd > 0),
  exit_ownership_pct     NUMERIC(9, 4) NOT NULL,
  projected_proceeds_usd NUMERIC(20, 2) NOT NULL,
  projected_moic         NUMERIC(12, 4) NOT NULL,
  projected_irr          NUMERIC(14, 6),
  superseded_by          BIGINT REFERENCES ic_cases (id),
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (investment_id, version)
);

CREATE TABLE ic_tranches (
  id             BIGSERIAL PRIMARY KEY,
  ic_case_id     BIGINT NOT NULL REFERENCES ic_cases (id) ON DELETE CASCADE,
  tranche_number INT NOT NULL CHECK (tranche_number >= 1),
  amount_usd     NUMERIC(20, 2) NOT NULL CHECK (amount_usd > 0),
  expected_date  DATE NOT NULL,
  milestone      TEXT,
  UNIQUE (ic_case_id, tranche_number)
);
