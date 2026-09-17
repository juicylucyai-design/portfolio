'use client';

import type {
  Closing,
  ClosingExtraction,
  ClosingInput,
  DocumentInfo,
  ExpenseCategory,
  IcCase,
  Position,
  SaveClosingRequest,
  SaveClosingResponse,
} from '@nksq/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { discardUpload, pagesFromSources, PdfUploadPanel } from '@/components/PdfUploadPanel';
import { api } from '@/lib/api';
import { count, date, EXPENSE_CATEGORY_LABELS, groupDigits, multiple, parseAmount, percent, rate, usd } from '@/lib/format';

interface ExpenseDraft {
  key: number;
  category: ExpenseCategory;
  description: string;
  amount: string;
}

interface Draft {
  closeDate: string;
  icTrancheNumber: string;
  securityClass: string;
  sharesAllotted: string;
  pricePerShareUsd: string;
  amountInvestedUsd: string;
  originalCurrency: string;
  originalAmount: string;
  originalPricePerShare: string;
  fxRateUsdPerUnit: string;
  postMoneyValuationUsd: string;
  fullyDilutedSharesAfter: string;
  ownershipPctAfter: string;
  notes: string;
  expenses: ExpenseDraft[];
}

let expenseKey = 0;
const toText = (value: number | null) => (value === null ? '' : groupDigits(String(value)));
const plain = (value: number | null) => (value === null ? '' : String(value));
const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function emptyDraft(nextTranche: number | null): Draft {
  return {
    closeDate: new Date().toISOString().slice(0, 10),
    icTrancheNumber: nextTranche === null ? '' : String(nextTranche),
    securityClass: '',
    sharesAllotted: '',
    pricePerShareUsd: '',
    amountInvestedUsd: '',
    originalCurrency: 'USD',
    originalAmount: '',
    originalPricePerShare: '',
    fxRateUsdPerUnit: '',
    postMoneyValuationUsd: '',
    fullyDilutedSharesAfter: '',
    ownershipPctAfter: '',
    notes: '',
    expenses: [],
  };
}

function draftFromExtraction(extracted: ClosingExtraction['closing'], fallback: Draft): Draft {
  return {
    closeDate: extracted.closeDate ?? fallback.closeDate,
    icTrancheNumber: extracted.trancheNumber === null ? fallback.icTrancheNumber : String(extracted.trancheNumber),
    securityClass: extracted.securityClass ?? '',
    sharesAllotted: toText(extracted.sharesAllotted),
    pricePerShareUsd: plain(extracted.pricePerShareUsd),
    amountInvestedUsd: toText(extracted.amountInvestedUsd),
    originalCurrency: extracted.originalCurrency ?? 'USD',
    originalAmount: toText(extracted.originalAmount),
    originalPricePerShare: plain(extracted.originalPricePerShare),
    fxRateUsdPerUnit: plain(extracted.fxRateUsdPerUnit),
    postMoneyValuationUsd: toText(extracted.postMoneyValuationUsd),
    fullyDilutedSharesAfter: toText(extracted.fullyDilutedSharesAfter),
    ownershipPctAfter: plain(extracted.ownershipPctAfter),
    notes: extracted.notes ?? '',
    expenses: extracted.expenses.map((e) => ({ key: expenseKey++, category: e.category, description: e.description ?? '', amount: toText(e.amountUsd) })),
  };
}

/** The API request for a draft, or null while required fields are still empty. */
function toInput(draft: Draft): ClosingInput | null {
  const n = (text: string) => parseAmount(text);
  const currency = draft.originalCurrency.trim().toUpperCase() || 'USD';
  const required = [n(draft.sharesAllotted), n(draft.pricePerShareUsd), n(draft.amountInvestedUsd), n(draft.ownershipPctAfter)];
  if (!draft.closeDate || required.some((value) => value === null)) return null;
  if (currency !== 'USD' && n(draft.fxRateUsdPerUnit) === null) return null;
  if (draft.expenses.some((e) => n(e.amount) === null)) return null;
  return {
    closeDate: draft.closeDate,
    icTrancheNumber: draft.icTrancheNumber ? Number(draft.icTrancheNumber) : null,
    securityClass: draft.securityClass.trim() || null,
    sharesAllotted: n(draft.sharesAllotted) as number,
    pricePerShareUsd: n(draft.pricePerShareUsd) as number,
    amountInvestedUsd: n(draft.amountInvestedUsd) as number,
    originalCurrency: currency,
    originalAmount: currency === 'USD' ? null : n(draft.originalAmount),
    originalPricePerShare: currency === 'USD' ? null : n(draft.originalPricePerShare),
    fxRateUsdPerUnit: currency === 'USD' ? null : n(draft.fxRateUsdPerUnit),
    postMoneyValuationUsd: n(draft.postMoneyValuationUsd),
    fullyDilutedSharesAfter: n(draft.fullyDilutedSharesAfter),
    ownershipPctAfter: n(draft.ownershipPctAfter) as number,
    notes: draft.notes.trim() || null,
    expenses: draft.expenses.map((e) => ({ category: e.category, description: e.description.trim() || null, amountUsd: n(e.amount) as number })),
  };
}

function countFilled(extraction: ClosingExtraction): number {
  return Object.entries(extraction.closing).filter(([key, value]) => key !== 'expenses' && value !== null).length + extraction.closing.expenses.length;
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

export function ClosingForm(props: { investmentId: number; icCase: IcCase | null; closings: Closing[]; onSaved: (result: SaveClosingResponse) => void; onCancel: () => void }) {
  const { investmentId, icCase, closings } = props;
  const drawn = useMemo(() => new Set(closings.map((c) => c.icTrancheNumber).filter((t): t is number => t !== null)), [closings]);
  const nextTranche = icCase?.tranches.find((t) => !drawn.has(t.trancheNumber))?.trancheNumber ?? null;

  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [extraction, setExtraction] = useState<ClosingExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(nextTranche));
  const [preview, setPreview] = useState<Position | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const input = useMemo(() => toInput(draft), [draft]);
  const pages = useMemo(() => pagesFromSources(extraction?.sources ?? [], (f) => f.replace(/^closing\.expenses.*/, 'closing.expenses')), [extraction]);
  const currency = draft.originalCurrency.trim().toUpperCase() || 'USD';

  const onExtracted = useCallback(
    (result: ClosingExtraction) => {
      setExtraction(result);
      setDraft((current) => draftFromExtraction(result.closing, current));
    },
    [],
  );

  useEffect(() => {
    if (!input) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      api<Position>(`/investments/${investmentId}/position/preview`, { method: 'POST', body: input })
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err: Error) => {
          setPreview(null);
          setPreviewError(err.message);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [input, investmentId]);

  const set = (key: keyof Omit<Draft, 'expenses'>, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  /** Amounts paid in another currency convert to USD at the entered rate. */
  function setConverted(key: 'originalAmount' | 'originalPricePerShare' | 'fxRateUsdPerUnit', value: string) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      const fx = parseAmount(next.fxRateUsdPerUnit);
      const amount = parseAmount(next.originalAmount);
      const price = parseAmount(next.originalPricePerShare);
      if (fx !== null && amount !== null) next.amountInvestedUsd = groupDigits(String(roundTo(amount * fx, 2)));
      if (fx !== null && price !== null) next.pricePerShareUsd = String(roundTo(price * fx, 6));
      return next;
    });
  }

  const shares = parseAmount(draft.sharesAllotted);
  const price = parseAmount(draft.pricePerShareUsd);
  const invested = parseAmount(draft.amountInvestedUsd);
  const fdShares = parseAmount(draft.fullyDilutedSharesAfter);
  const sharesBefore = closings.reduce((sum, c) => sum + c.sharesAllotted, 0);
  const impliedOwnership = shares !== null && fdShares ? roundTo(((sharesBefore + shares) / fdShares) * 100, 4) : null;
  const priceGap = shares !== null && price !== null && invested ? Math.abs(shares * price - invested) / invested : 0;
  const expensesTotal = draft.expenses.reduce((sum, e) => sum + (parseAmount(e.amount) ?? 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input) {
      setError(`Fill in close date, shares, price per share, amount invested, ownership${currency !== 'USD' ? ', exchange rate' : ''} and every expense amount.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: SaveClosingRequest = { documentId: document?.id ?? null, closing: input };
      props.onSaved(await api<SaveClosingResponse>(`/investments/${investmentId}/closings`, { method: 'POST', body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the closing.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
      <PdfUploadPanel<ClosingExtraction>
        category="CLOSING"
        readPath="/intake/closing"
        title={`Record closing ${closings.length + 1}`}
        intro="Upload the closing document (allotment letter, SSA, closing memo or funds flow). Once saved, these figures replace the IC approval as the record of the transaction."
        dropLabel="Drop the closing document PDF here, or choose a file"
        readingLabel="Claude is reading the closing document. This usually takes under two minutes."
        countFilled={countFilled}
        onDocument={setDocument}
        onExtracted={onExtracted}
        onBusyChange={setBusy}
      />

      <section className="panel">
        <div className="panel-head">
          <h2>Closing details</h2>
          <span className="subtle" style={{ fontSize: 13 }}>All amounts in USD</span>
        </div>
        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
            <div className="grid-3">
              <Field id="closeDate" label="Close date" page={pages['closing.closeDate']}>
                <input id="closeDate" type="date" className="input" value={draft.closeDate} onChange={(e) => set('closeDate', e.target.value)} required />
              </Field>
              <Field id="icTrancheNumber" label="IC tranche drawn" page={pages['closing.trancheNumber']} hint={icCase ? `From IC version ${icCase.version}` : 'No IC approval recorded'}>
                <select id="icTrancheNumber" className="input" value={draft.icTrancheNumber} onChange={(e) => set('icTrancheNumber', e.target.value)}>
                  <option value="">Not linked to a tranche</option>
                  {icCase?.tranches.map((t) => (
                    <option key={t.trancheNumber} value={t.trancheNumber} disabled={drawn.has(t.trancheNumber)}>
                      T{t.trancheNumber} · {usd(t.amountUsd)} · {date(t.expectedDate)}
                      {drawn.has(t.trancheNumber) ? ' (already drawn)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="securityClass" label="Security" page={pages['closing.securityClass']}>
                <input id="securityClass" className="input" value={draft.securityClass} onChange={(e) => set('securityClass', e.target.value)} placeholder="e.g. Series B CCPS" />
              </Field>
            </div>

            <div className="grid-3">
              <Field id="originalCurrency" label="Currency paid in" page={pages['closing.originalCurrency']}>
                <input id="originalCurrency" className="input" value={draft.originalCurrency} maxLength={3} onChange={(e) => set('originalCurrency', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
              </Field>
              {currency !== 'USD' && (
                <>
                  <Field id="originalAmount" label={`Amount paid in ${currency}`} page={pages['closing.originalAmount']}>
                    <input id="originalAmount" className="input num" inputMode="decimal" value={draft.originalAmount} onChange={(e) => setConverted('originalAmount', groupDigits(e.target.value))} />
                  </Field>
                  <Field id="originalPricePerShare" label={`Price per share in ${currency}`} page={pages['closing.originalPricePerShare']}>
                    <input id="originalPricePerShare" className="input num" inputMode="decimal" value={draft.originalPricePerShare} onChange={(e) => setConverted('originalPricePerShare', e.target.value)} />
                  </Field>
                  <Field id="fxRateUsdPerUnit" label={`Exchange rate (USD per 1 ${currency})`} page={pages['closing.fxRateUsdPerUnit']} hint={parseAmount(draft.fxRateUsdPerUnit) ? `= ${count(roundTo(1 / (parseAmount(draft.fxRateUsdPerUnit) as number), 4))} ${currency} per USD. USD amounts below update automatically.` : 'Rate from the wire confirmation or funds flow.'}>
                    <input id="fxRateUsdPerUnit" className="input num" inputMode="decimal" value={draft.fxRateUsdPerUnit} onChange={(e) => setConverted('fxRateUsdPerUnit', e.target.value)} required />
                  </Field>
                </>
              )}
            </div>

            <div className="grid-3">
              <Field id="sharesAllotted" label="Shares allotted" page={pages['closing.sharesAllotted']}>
                <input id="sharesAllotted" className="input num" inputMode="decimal" value={draft.sharesAllotted} onChange={(e) => set('sharesAllotted', groupDigits(e.target.value))} required />
              </Field>
              <Field id="pricePerShareUsd" label="Price per share (USD)" page={pages['closing.pricePerShareUsd']}>
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="pricePerShareUsd" className="input num" inputMode="decimal" value={draft.pricePerShareUsd} onChange={(e) => set('pricePerShareUsd', e.target.value)} required />
                </div>
              </Field>
              <Field
                id="amountInvestedUsd"
                label="Amount invested (USD)"
                page={pages['closing.amountInvestedUsd']}
                hint={priceGap > 0.01 && shares !== null && price !== null ? <span style={{ color: 'var(--amber)' }}>Shares × price = {usd(shares * price)}, which differs from the amount invested.</span> : 'Excluding expenses.'}
              >
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="amountInvestedUsd" className="input num" inputMode="decimal" value={draft.amountInvestedUsd} onChange={(e) => set('amountInvestedUsd', groupDigits(e.target.value))} required />
                </div>
              </Field>
              <Field id="postMoneyValuationUsd" label="Post-money valuation (USD)" page={pages['closing.postMoneyValuationUsd']}>
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="postMoneyValuationUsd" className="input num" inputMode="decimal" value={draft.postMoneyValuationUsd} onChange={(e) => set('postMoneyValuationUsd', groupDigits(e.target.value))} />
                </div>
              </Field>
              <Field id="fullyDilutedSharesAfter" label="Company's fully diluted shares after closing" page={pages['closing.fullyDilutedSharesAfter']}>
                <input id="fullyDilutedSharesAfter" className="input num" inputMode="decimal" value={draft.fullyDilutedSharesAfter} onChange={(e) => set('fullyDilutedSharesAfter', groupDigits(e.target.value))} />
              </Field>
              <Field
                id="ownershipPctAfter"
                label="NKSquared ownership after closing"
                page={pages['closing.ownershipPctAfter']}
                hint={
                  impliedOwnership !== null ? (
                    <>
                      {closings.length ? 'All shares held' : 'Shares allotted'} ÷ fully diluted = {percent(impliedOwnership, 4)}{' '}
                      <button type="button" className="linklike" onClick={() => set('ownershipPctAfter', String(impliedOwnership))}>
                        Use this
                      </button>
                    </>
                  ) : (
                    'Fully diluted, including shares already held.'
                  )
                }
              >
                <div className="input-affix suffix">
                  <input id="ownershipPctAfter" className="input num" inputMode="decimal" value={draft.ownershipPctAfter} onChange={(e) => set('ownershipPctAfter', e.target.value)} required />
                  <span className="post">%</span>
                </div>
              </Field>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <h3>
                Expenses paid by NKSquared
                {pages['closing.expenses'] ? <span className="src">p. {pages['closing.expenses']}</span> : null}
              </h3>
              {draft.expenses.length === 0 && <p className="subtle" style={{ fontSize: 14 }}>No expenses added. Legal, due diligence, stamp duty and advisory costs count towards the cost of the investment.</p>}
              {draft.expenses.map((expense, index) => (
                <div className="expense-row" key={expense.key}>
                  <select
                    aria-label={`Expense ${index + 1} type`}
                    id={`expense-${expense.key}-category`}
                    className="input"
                    value={expense.category}
                    onChange={(e) => setDraft((d) => ({ ...d, expenses: d.expenses.map((x) => (x.key === expense.key ? { ...x, category: e.target.value as ExpenseCategory } : x)) }))}
                  >
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Expense ${index + 1} description`}
                    id={`expense-${expense.key}-description`}
                    className="input"
                    placeholder="Description"
                    value={expense.description}
                    onChange={(e) => setDraft((d) => ({ ...d, expenses: d.expenses.map((x) => (x.key === expense.key ? { ...x, description: e.target.value } : x)) }))}
                  />
                  <div className="input-affix">
                    <span className="pre">$</span>
                    <input
                      aria-label={`Expense ${index + 1} amount in USD`}
                      id={`expense-${expense.key}-amount`}
                      className="input num"
                      inputMode="decimal"
                      value={expense.amount}
                      onChange={(e) => setDraft((d) => ({ ...d, expenses: d.expenses.map((x) => (x.key === expense.key ? { ...x, amount: groupDigits(e.target.value) } : x)) }))}
                      required
                    />
                  </div>
                  <button type="button" className="btn btn-ghost btn-small" aria-label={`Remove expense ${index + 1}`} onClick={() => setDraft((d) => ({ ...d, expenses: d.expenses.filter((x) => x.key !== expense.key) }))}>
                    ✕
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-small" onClick={() => setDraft((d) => ({ ...d, expenses: [...d.expenses, { key: expenseKey++, category: 'LEGAL', description: '', amount: '' }] }))}>
                  Add expense
                </button>
                <span className="subtle">
                  Expenses <strong style={{ color: 'var(--ink)' }}>{usd(expensesTotal)}</strong> · Total cost <strong style={{ color: 'var(--ink)' }}>{usd((invested ?? 0) + expensesTotal)}</strong>
                </span>
              </div>
            </div>

            <Field id="closingNotes" label="Notes" page={pages['closing.notes']}>
              <textarea id="closingNotes" className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Conditions subsequent, deferred consideration, anything unusual" />
            </Field>
          </fieldset>

          <div className="preview" aria-live="polite">
            <span className="eyebrow">Position after this closing</span>
            {previewError ? (
              <span className="alert alert-error">{previewError}</span>
            ) : preview ? (
              <>
                <dl className="kv">
                  <div><dt>Total cost</dt><dd>{usd(preview.costUsd)}</dd></div>
                  <div><dt>Ownership</dt><dd>{percent(preview.ownershipPct)}</dd></div>
                  <div><dt>Projected proceeds</dt><dd>{usd(preview.projectedProceedsUsd)}</dd></div>
                  <div><dt>Projected MOIC</dt><dd>{multiple(preview.projectedMoic)}</dd></div>
                  <div><dt>Projected IRR</dt><dd>{rate(preview.projectedIrr)}</dd></div>
                </dl>
                {icCase && (
                  <span className="subtle" style={{ fontSize: 13 }}>
                    IC version {icCase.version} projected {multiple(icCase.projectedMoic)} and {rate(icCase.projectedIrr)} on {usd(icCase.commitmentUsd)}. The projection above uses the actual closing figures with IC exit assumptions (exit {icCase.exitYear} at {usd(icCase.exitValuationUsd)}, {percent(icCase.dilutionToExitPct)} dilution).
                  </span>
                )}
                {preview.notes.map((note) => (
                  <span key={note} className="subtle" style={{ fontSize: 13 }}>{note}</span>
                ))}
              </>
            ) : (
              <span className="subtle">Fill in the closing figures to see cost, ownership and projected returns.</span>
            )}
          </div>

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
              {saving ? 'Saving…' : `Save closing ${closings.length + 1}`}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
