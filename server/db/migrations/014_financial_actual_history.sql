-- Every uploaded statement is kept, even one later superseded by a restatement or an annual figure for the
-- same period, so the original filing is never lost and stays accessible. The comparison and chart use
-- whichever one for a period was uploaded most recently; the rest remain in the list as history.
ALTER TABLE financial_actuals DROP CONSTRAINT financial_actuals_investment_id_period_type_fiscal_year_qua_key;
