-- IC memo financial projections: revenue and EBITDA by year, as stated in the memo's financial model.
-- One row per year per IC case version, so a revised memo can restate the whole projection.
CREATE TABLE ic_financials (
  ic_case_id  BIGINT NOT NULL REFERENCES ic_cases (id) ON DELETE CASCADE,
  year        INT NOT NULL CHECK (year BETWEEN 1990 AND 2200),
  revenue_usd NUMERIC(20, 2) CHECK (revenue_usd >= 0),
  ebitda_usd  NUMERIC(20, 2),
  PRIMARY KEY (ic_case_id, year)
);
