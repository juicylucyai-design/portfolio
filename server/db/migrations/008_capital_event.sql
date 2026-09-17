-- Capital Events module: things that happen to a portfolio company after NKSquared has invested, distinct from
-- NKSquared's own closings. Mostly recorded by hand; sometimes from an email the company sends (e.g. a ROFR
-- notice of a secondary transaction), in which case the email is kept as evidence via the documents module.
-- A priced event (one with an implied valuation) is used to mark the investment's current valuation once it's
-- more recent than the latest closing — see server/src/modules/performance/position.ts.

CREATE TABLE capital_events (
  id                       BIGSERIAL PRIMARY KEY,
  investment_id            BIGINT NOT NULL REFERENCES investments (id),
  event_type               TEXT NOT NULL CHECK (event_type IN
                              ('SECONDARY_TRANSACTION', 'VALUATION_MARK', 'DIVIDEND', 'CAPITAL_CALL', 'TENDER_OFFER', 'OTHER')),
  event_date               DATE NOT NULL,
  selling_party            TEXT,
  buying_party             TEXT,
  security_class           TEXT,
  shares                   NUMERIC(24, 4) CHECK (shares > 0),
  price_per_share_usd      NUMERIC(24, 8) CHECK (price_per_share_usd > 0),
  total_consideration_usd  NUMERIC(20, 2) CHECK (total_consideration_usd > 0),
  -- The company's implied valuation from this event, if it was a priced transaction.
  implied_valuation_usd    NUMERIC(20, 2) CHECK (implied_valuation_usd > 0),
  -- A response deadline stated in the notice (e.g. a ROFR exercise window), if any. Informational only for now.
  deadline_date            DATE,
  notes                    TEXT,
  created_by               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX capital_events_investment_id_idx ON capital_events (investment_id, event_date);

-- Claude can now read capital-event emails too.
ALTER TABLE extractions DROP CONSTRAINT extractions_kind_check;
ALTER TABLE extractions ADD CONSTRAINT extractions_kind_check CHECK (kind IN ('IC_MEMO', 'CLOSING', 'CAPITAL_EVENT'));
