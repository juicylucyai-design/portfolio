'use client';

import type { DocumentInfo, FinancialActualInput, FinancialPeriodType, FinancialStatementExtraction, SaveFinancialActualRequest, SaveFinancialActualResponse } from '@nksq/contracts';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { discardUpload, pagesFromSources, PdfUploadPanel } from '@/components/PdfUploadPanel';
import { api } from '@/lib/api';
import { groupDigits, parseAmount } from '@/lib/format';

interface Draft {
  periodType: FinancialPeriodType;
  fiscalYear: string;
  quarter: string;
  periodEndDate: string;
  revenueUsd: string;
  ebitdaUsd: string;
  notes: string;
}

const toText = (value: number | null) => (value === null ? '' : groupDigits(String(value)));
const plain = (value: number | null) => (value === null ? '' : String(value));

function emptyDraft(): Draft {
  const today = new Date();
  return {
    periodType: 'QUARTERLY',
    fiscalYear: String(today.getFullYear()),
    quarter: '',
    periodEndDate: '',
    revenueUsd: '',
    ebitdaUsd: '',
    notes: '',
  };
}

function draftFromExtraction(extracted: FinancialStatementExtraction['statement'], fallback: Draft): Draft {
  return {
    periodType: extracted.periodType ?? fallback.periodType,
    fiscalYear: extracted.fiscalYear === null ? fallback.fiscalYear : String(extracted.fiscalYear),
    quarter: plain(extracted.quarter),
    periodEndDate: extracted.periodEndDate ?? fallback.periodEndDate,
    revenueUsd: toText(extracted.revenueUsd),
    ebitdaUsd: toText(extracted.ebitdaUsd),
    notes: fallback.notes,
  };
}

function toInput(draft: Draft): FinancialActualInput | null {
  const fiscalYear = Number(draft.fiscalYear);
  const quarter = draft.periodType === 'QUARTERLY' ? Number(draft.quarter) : null;
  if (!Number.isInteger(fiscalYear) || !draft.periodEndDate) return null;
  if (draft.periodType === 'QUARTERLY' && !(quarter && quarter >= 1 && quarter <= 4)) return null;
  return {
    periodType: draft.periodType,
    fiscalYear,
    quarter,
    periodEndDate: draft.periodEndDate,
    revenueUsd: parseAmount(draft.revenueUsd),
    ebitdaUsd: parseAmount(draft.ebitdaUsd),
    notes: draft.notes.trim() || null,
  };
}

function countFilled(extraction: FinancialStatementExtraction): number {
  return Object.values(extraction.statement).filter((v) => v !== null).length;
}

function Field({ id, label, page, hint, children }: { id: string; label: string; page?: number; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {page ? <span className="src">p. {page}</span> : null}
      </label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function FinancialActualForm(props: { investmentId: number; onSaved: (result: SaveFinancialActualResponse) => void; onCancel: () => void }) {
  const { investmentId } = props;
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [extraction, setExtraction] = useState<FinancialStatementExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const input = toInput(draft);
  const pages = pagesFromSources(extraction?.sources ?? [], (f) => f.replace(/^statement\./, ''));

  const onExtracted = useCallback((result: FinancialStatementExtraction) => {
    setExtraction(result);
    setDraft((current) => draftFromExtraction(result.statement, current));
  }, []);

  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input) {
      setError(draft.periodType === 'QUARTERLY' ? 'Enter the fiscal year, quarter (1-4) and period end date.' : 'Enter the fiscal year and period end date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: SaveFinancialActualRequest = { documentId: document?.id ?? null, financialActual: input };
      props.onSaved(await api<SaveFinancialActualResponse>(`/investments/${investmentId}/financial-actuals`, { method: 'POST', body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the financial statement.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
      <PdfUploadPanel<FinancialStatementExtraction>
        category="STATEMENT"
        readPath="/intake/financial-statement"
        title="Upload financial statement"
        intro="Upload a quarterly or annual financial statement. The file is kept as evidence."
        dropLabel="Drop the statement PDF here, or choose a file"
        readingLabel="Claude is reading the statement. This usually takes under two minutes."
        countFilled={countFilled}
        onDocument={setDocument}
        onExtracted={onExtracted}
        onBusyChange={setBusy}
      />

      <section className="panel">
        <div className="panel-head">
          <h2>Statement details</h2>
          <span className="subtle" style={{ fontSize: 13 }}>All amounts in USD</span>
        </div>
        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
            <div className="grid-3">
              <Field id="periodType" label="Period type">
                <select
                  id="periodType"
                  className="input"
                  value={draft.periodType}
                  onChange={(e) => set('periodType', e.target.value as FinancialPeriodType)}
                >
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </Field>
              <Field id="fiscalYear" label="Fiscal year" page={pages['fiscalYear']}>
                <input id="fiscalYear" className="input num" inputMode="numeric" value={draft.fiscalYear} onChange={(e) => set('fiscalYear', e.target.value.replace(/\D/g, '').slice(0, 4))} required />
              </Field>
              {draft.periodType === 'QUARTERLY' && (
                <Field id="quarter" label="Quarter" page={pages['quarter']}>
                  <select id="quarter" className="input" value={draft.quarter} onChange={(e) => set('quarter', e.target.value)}>
                    <option value="">Choose…</option>
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        Q{q}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field id="periodEndDate" label="Period end date" page={pages['periodEndDate']}>
                <input id="periodEndDate" type="date" className="input" value={draft.periodEndDate} onChange={(e) => set('periodEndDate', e.target.value)} required />
              </Field>
            </div>

            <div className="grid-3">
              <Field id="revenueUsd" label="Revenue (USD)" page={pages['revenueUsd']}>
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="revenueUsd" className="input num" inputMode="decimal" value={draft.revenueUsd} onChange={(e) => set('revenueUsd', groupDigits(e.target.value))} />
                </div>
              </Field>
              <Field id="ebitdaUsd" label="EBITDA (USD)" page={pages['ebitdaUsd']} hint="Can be negative.">
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="ebitdaUsd" className="input num" inputMode="decimal" value={draft.ebitdaUsd} onChange={(e) => set('ebitdaUsd', groupDigits(e.target.value))} />
                </div>
              </Field>
            </div>

            <Field id="notes" label="Notes">
              <textarea id="notes" className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything unusual about this period" />
            </Field>
          </fieldset>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                discardUpload(document);
                props.onCancel();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || busy || !input}>
              {saving ? 'Saving…' : 'Save statement'}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
