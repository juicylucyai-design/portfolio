-- Carry module: the deal-team incentive plan. Investments are "qualified" (the incentive plan applies) or
-- "non-qualified" (a pass-through, no carry). For a qualified investment, up to three people share the carry:
-- Origination (up to 5% of profit), Monitoring (up to 5%), Closure (up to 10%) — 20% combined if it's the same
-- person for all three. A hurdle rate (12%/yr, compounded over the holding period) must be cleared on cost
-- before carry applies to the remaining profit.
-- Carry itself isn't stored — it's computed from each investment's position (see server/src/modules/carry).

CREATE TABLE carry_settings (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hurdle_rate_pct NUMERIC(6, 3) NOT NULL DEFAULT 12 CHECK (hurdle_rate_pct >= 0 AND hurdle_rate_pct <= 100)
);
INSERT INTO carry_settings (id, hurdle_rate_pct) VALUES (1, 12);

-- One row per investment that has terms set; an investment without a row uses the defaults below.
CREATE TABLE carry_terms (
  investment_id       BIGINT PRIMARY KEY REFERENCES investments (id),
  qualified           BOOLEAN NOT NULL DEFAULT true,
  origination_person  TEXT,
  origination_pct     NUMERIC(5, 2) NOT NULL DEFAULT 5 CHECK (origination_pct >= 0 AND origination_pct <= 5),
  monitoring_person   TEXT,
  monitoring_pct      NUMERIC(5, 2) NOT NULL DEFAULT 5 CHECK (monitoring_pct >= 0 AND monitoring_pct <= 5),
  closure_person      TEXT,
  closure_pct         NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (closure_pct >= 0 AND closure_pct <= 10),
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
