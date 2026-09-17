'use client';

import type {
  Closing,
  ClosingInput,
  DocumentInfo,
  ExpenseCategory,
  ExtractedClosing,
  IcCase,
  ClosingExtraction,
  Position,
  SaveClosingsRequest,
  SaveClosingsResponse,
} from '@nksq/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { discardUpload, pagesFromSources, PdfUploadPanel, type ExtractionResult } from '@/components/PdfUploadPanel';
import { api } from '@/lib/api';
import { count, date, EXPENSE_CATEGORY_LABELS, groupDigits, multiple, parseAmount, percent, rate, usd } from '@/lib/format';

interface ExpenseDraft {
  key: number;
  category: ExpenseCategory;
  description: string;
  amount: string;
}

interface Draft {
  key: number;
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
  /** True while ownershipPctAfter tracks the computed cumulative value automatically (shares held so far ÷
   *  fully diluted). Turns false once the person edits it directly, or a document states its own figure. */
  ownershipAuto: boolean;
  notes: string;
  expenses: ExpenseDraft[];
}

let draftKey = 0;
let expenseKey = 0;
const toText = (value: number | null) => (value === null ? '' : groupDigits(String(value)));
const plain = (value: number | null) => (value === null ? '' : String(value));
const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function emptyDraft(nextTranche: number | null): Draft {
  return {
    key: draftKey++,
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
    ownershipAuto: true,
    notes: '',
    expenses: [],
  };
}

function draftFromExtraction(extracted: ExtractedClosing, fallback: Draft): Draft {
  return {
    key: draftKey++,
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
    // A figure the document states itself takes precedence; otherwise keep computing it from shares held.
    ownershipAuto: extracted.ownershipPctAfter === null,
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
  return extraction.closings.reduce(
    (sum, closing) => sum + Object.entries(closing).filter(([key, value]) => key !== 'expenses' && value !== null).length + closing.expenses.length,
    0,
  );
}

/** Pages for one draft's own fields, from a source list keyed like "closings[1].sharesAllotted". */
function pagesForDraft(sources: ExtractionResult['sources'], index: number): Record<string, number> {
  const prefix = `closings[${index}].`;
  return pagesFromSources(
    sources.filter((s) => s.field.startsWith(prefix)),
    (f) => f.slice(prefix.length).replace(/^expenses.*/, 'expenses'),
  );
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

export function ClosingForm(props: { investmentId: number; icCase: IcCase | null; closings: Closing[]; onSaved: (result: SaveClosingsResponse) => void; onCancel: () => void }) {
  const { investmentId, icCase, closings } = props;
  const drawnByExisting = useMemo(() => new Set(closings.map((c) => c.icTrancheNumber).filter((t): t is number => t !== null)), [closings]);
  const nextTranche = icCase?.tranches.find((t) => !drawnByExisting.has(t.trancheNumber))?.trancheNumber ?? null;

  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [extraction, setExtraction] = useState<ClosingExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => [emptyDraft(nextTranche)]);
  const [preview, setPreview] = useState<Position | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputs = useMemo(() => drafts.map(toInput), [drafts]);
  const allValid = inputs.every((input): input is ClosingInput => input !== null);

  const onExtracted = useCallback(
    (result: ClosingExtraction) => {
      setExtraction(result);
      setDrafts((current) => {
        let usedTranches = new Set(drawnByExisting);
        return result.closings.map((extracted) => {
          const suggestion = icCase?.tranches.find((t) => !usedTranches.has(t.trancheNumber))?.trancheNumber ?? null;
          const draft = draftFromExtraction(extracted, current[0] ?? emptyDraft(suggestion));
          if (draft.icTrancheNumber) usedTranches = new Set(usedTranches).add(Number(draft.icTrancheNumber));
          return draft;
        });
      });
    },
    [drawnByExisting, icCase],
  );

  useEffect(() => {
    if (!allValid) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      api<Position>(`/investments/${investmentId}/position/preview`, { method: 'POST', body: { closings: inputs } })
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
  }, [allValid, inputs, investmentId]);

  function updateDraft(key: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addTranche() {
    const usedTranches = new Set([...drawnByExisting, ...drafts.map((d) => (d.icTrancheNumber ? Number(d.icTrancheNumber) : null)).filter((t): t is number => t !== null)]);
    const suggestion = icCase?.tranches.find((t) => !usedTranches.has(t.trancheNumber))?.trancheNumber ?? null;
    setDrafts((current) => [...current, emptyDraft(suggestion)]);
  }

  function removeTranche(key: number) {
    setDrafts((current) => current.filter((d) => d.key !== key));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!allValid) {
      setError('Fill in every tranche closing below: close date, shares, price per share, amount invested, ownership, and every expense amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: SaveClosingsRequest = { documentId: document?.id ?? null, closings: inputs as ClosingInput[] };
      props.onSaved(await api<SaveClosingsResponse>(`/investments/${investmentId}/closings`, { method: 'POST', body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the closing.');
      setSaving(false);
    }
  }

  const nextClosingNumber = closings.length + 1;
  const availableTranches = icCase?.tranches.filter((t) => !drawnByExisting.has(t.trancheNumber)).length ?? 0;
  const canAddTranche = drafts.length < Math.max(availableTranches, drafts.length + 1);

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
      <PdfUploadPanel<ClosingExtraction>
        category="CLOSING"
        readPath="/intake/closing"
        title={`Record closing ${nextClosingNumber}`}
        intro="Upload the closing document (allotment letter, SSA, closing memo or funds flow). One document can cover more than one tranche; Claude reads each one as its own line below. Once saved, these figures replace the IC approval as the record of the transaction."
        dropLabel="Drop the closing document PDF here, or choose a file"
        readingLabel="Claude is reading the closing document. This usually takes under two minutes."
        countFilled={countFilled}
        onDocument={setDocument}
        onExtracted={onExtracted}
        onBusyChange={setBusy}
      />

      {error && <div className="alert alert-error">{error}</div>}

      {drafts.map((draft, index) => (
        <ClosingDraftPanel
          key={draft.key}
          index={index}
          draft={draft}
          icCase={icCase}
          existingClosings={closings}
          priorDrafts={drafts.slice(0, index)}
          otherChosenTranches={new Set(drafts.filter((d) => d.key !== draft.key).map((d) => (d.icTrancheNumber ? Number(d.icTrancheNumber) : null)).filter((t): t is number => t !== null))}
          drawnByExisting={drawnByExisting}
          pages={pagesForDraft(extraction?.sources ?? [], index)}
          busy={busy}
          canRemove={drafts.length > 1}
          onRemove={() => removeTranche(draft.key)}
          onChange={(patch) => updateDraft(draft.key, patch)}
        />
      ))}

      <div>
        <button type="button" className="btn btn-small" onClick={addTranche} disabled={busy || !canAddTranche}>
          + Add another tranche from this document
        </button>
      </div>

      <div className="panel">
        <div className="panel-body">
          <div className="preview" aria-live="polite">
            <span className="eyebrow">Position after {drafts.length > 1 ? 'these closings' : 'this closing'}</span>
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
            <button type="submit" className="btn btn-primary" disabled={saving || busy || !allValid}>
              {saving ? 'Saving…' : drafts.length > 1 ? `Save ${drafts.length} closings` : `Save closing ${nextClosingNumber}`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ClosingDraftPanel(props: {
  index: number;
  draft: Draft;
  icCase: IcCase | null;
  existingClosings: Closing[];
  priorDrafts: Draft[];
  otherChosenTranches: Set<number>;
  drawnByExisting: Set<number>;
  pages: Record<string, number>;
  busy: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const { draft, icCase, existingClosings, priorDrafts, otherChosenTranches, drawnByExisting, pages } = props;
  const idFor = (field: string) => `closing-${draft.key}-${field}`;
  const set = (key: keyof Omit<Draft, 'expenses' | 'key'>, value: string) => props.onChange({ [key]: value } as Partial<Draft>);

  function setConverted(key: 'originalAmount' | 'originalPricePerShare' | 'fxRateUsdPerUnit', value: string) {
    const next = { ...draft, [key]: value };
    const fx = parseAmount(next.fxRateUsdPerUnit);
    const amount = parseAmount(next.originalAmount);
    const price = parseAmount(next.originalPricePerShare);
    const patch: Partial<Draft> = { [key]: value };
    if (fx !== null && amount !== null) patch.amountInvestedUsd = groupDigits(String(roundTo(amount * fx, 2)));
    if (fx !== null && price !== null) patch.pricePerShareUsd = String(roundTo(price * fx, 6));
    props.onChange(patch);
  }

  const currency = draft.originalCurrency.trim().toUpperCase() || 'USD';
  const shares = parseAmount(draft.sharesAllotted);
  const price = parseAmount(draft.pricePerShareUsd);
  const invested = parseAmount(draft.amountInvestedUsd);
  const fdShares = parseAmount(draft.fullyDilutedSharesAfter);
  const sharesBefore = existingClosings.reduce((sum, c) => sum + c.sharesAllotted, 0) + priorDrafts.reduce((sum, d) => sum + (parseAmount(d.sharesAllotted) ?? 0), 0);
  const impliedOwnership = shares !== null && fdShares ? roundTo(((sharesBefore + shares) / fdShares) * 100, 4) : null;
  const priceGap = shares !== null && price !== null && invested ? Math.abs(shares * price - invested) / invested : 0;
  const expensesTotal = draft.expenses.reduce((sum, e) => sum + (parseAmount(e.amount) ?? 0), 0);
  const unavailable = new Set([...drawnByExisting, ...otherChosenTranches]);

  // Ownership after a closing is cumulative — this tranche's shares added to every share held so far, divided by
  // the fully diluted total — so keep it in sync automatically rather than making someone add it up by hand.
  useEffect(() => {
    if (!draft.ownershipAuto || impliedOwnership === null) return;
    const computed = String(impliedOwnership);
    if (computed !== draft.ownershipPctAfter) props.onChange({ ownershipPctAfter: computed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ownershipAuto, impliedOwnership]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{props.index === 0 && !props.canRemove ? 'Closing details' : `Tranche closing ${props.index + 1}`}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="subtle" style={{ fontSize: 13 }}>All amounts in USD</span>
          {props.canRemove && (
            <button type="button" className="btn btn-ghost btn-small" onClick={props.onRemove} disabled={props.busy}>
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="panel-body">
        <fieldset disabled={props.busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
          <div className="grid-3">
            <Field id={idFor('closeDate')} label="Close date" page={pages['closeDate']}>
              <input id={idFor('closeDate')} type="date" className="input" value={draft.closeDate} onChange={(e) => set('closeDate', e.target.value)} required />
            </Field>
            <Field id={idFor('icTrancheNumber')} label="IC tranche drawn" page={pages['trancheNumber']} hint={icCase ? `From IC version ${icCase.version}` : 'No IC approval recorded'}>
              <select id={idFor('icTrancheNumber')} className="input" value={draft.icTrancheNumber} onChange={(e) => set('icTrancheNumber', e.target.value)}>
                <option value="">Not linked to a tranche</option>
                {icCase?.tranches.map((t) => (
                  <option key={t.trancheNumber} value={t.trancheNumber} disabled={unavailable.has(t.trancheNumber) && String(t.trancheNumber) !== draft.icTrancheNumber}>
                    T{t.trancheNumber} · {usd(t.amountUsd)} · {date(t.expectedDate)}
                    {drawnByExisting.has(t.trancheNumber) ? ' (already drawn)' : unavailable.has(t.trancheNumber) ? ' (used above)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={idFor('securityClass')} label="Security" page={pages['securityClass']}>
              <input id={idFor('securityClass')} className="input" value={draft.securityClass} onChange={(e) => set('securityClass', e.target.value)} placeholder="e.g. Series B CCPS" />
            </Field>
          </div>

          <div className="grid-3">
            <Field id={idFor('originalCurrency')} label="Currency paid in" page={pages['originalCurrency']}>
              <input id={idFor('originalCurrency')} className="input" value={draft.originalCurrency} maxLength={3} onChange={(e) => set('originalCurrency', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            </Field>
            {currency !== 'USD' && (
              <>
                <Field id={idFor('originalAmount')} label={`Amount paid in ${currency}`} page={pages['originalAmount']}>
                  <input id={idFor('originalAmount')} className="input num" inputMode="decimal" value={draft.originalAmount} onChange={(e) => setConverted('originalAmount', groupDigits(e.target.value))} />
                </Field>
                <Field id={idFor('originalPricePerShare')} label={`Price per share in ${currency}`} page={pages['originalPricePerShare']}>
                  <input id={idFor('originalPricePerShare')} className="input num" inputMode="decimal" value={draft.originalPricePerShare} onChange={(e) => setConverted('originalPricePerShare', e.target.value)} />
                </Field>
                <Field id={idFor('fxRateUsdPerUnit')} label={`Exchange rate (USD per 1 ${currency})`} page={pages['fxRateUsdPerUnit']} hint={parseAmount(draft.fxRateUsdPerUnit) ? `= ${count(roundTo(1 / (parseAmount(draft.fxRateUsdPerUnit) as number), 4))} ${currency} per USD. USD amounts below update automatically.` : 'Rate from the wire confirmation or funds flow.'}>
                  <input id={idFor('fxRateUsdPerUnit')} className="input num" inputMode="decimal" value={draft.fxRateUsdPerUnit} onChange={(e) => setConverted('fxRateUsdPerUnit', e.target.value)} required />
                </Field>
              </>
            )}
          </div>

          <div className="grid-3">
            <Field id={idFor('sharesAllotted')} label="Shares allotted" page={pages['sharesAllotted']}>
              <input id={idFor('sharesAllotted')} className="input num" inputMode="decimal" value={draft.sharesAllotted} onChange={(e) => set('sharesAllotted', groupDigits(e.target.value))} required />
            </Field>
            <Field id={idFor('pricePerShareUsd')} label="Price per share (USD)" page={pages['pricePerShareUsd']}>
              <div className="input-affix">
                <span className="pre">$</span>
                <input id={idFor('pricePerShareUsd')} className="input num" inputMode="decimal" value={draft.pricePerShareUsd} onChange={(e) => set('pricePerShareUsd', e.target.value)} required />
              </div>
            </Field>
            <Field
              id={idFor('amountInvestedUsd')}
              label="Amount invested (USD)"
              page={pages['amountInvestedUsd']}
              hint={priceGap > 0.01 && shares !== null && price !== null ? <span style={{ color: 'var(--amber)' }}>Shares × price = {usd(shares * price)}, which differs from the amount invested.</span> : 'Excluding expenses.'}
            >
              <div className="input-affix">
                <span className="pre">$</span>
                <input id={idFor('amountInvestedUsd')} className="input num" inputMode="decimal" value={draft.amountInvestedUsd} onChange={(e) => set('amountInvestedUsd', groupDigits(e.target.value))} required />
              </div>
            </Field>
            <Field id={idFor('postMoneyValuationUsd')} label="Post-money valuation (USD)" page={pages['postMoneyValuationUsd']} hint="Marks this position's current value until a later valuation is recorded.">
              <div className="input-affix">
                <span className="pre">$</span>
                <input id={idFor('postMoneyValuationUsd')} className="input num" inputMode="decimal" value={draft.postMoneyValuationUsd} onChange={(e) => set('postMoneyValuationUsd', groupDigits(e.target.value))} />
              </div>
            </Field>
            <Field id={idFor('fullyDilutedSharesAfter')} label="Fully diluted shares after closing" page={pages['fullyDilutedSharesAfter']}>
              <input id={idFor('fullyDilutedSharesAfter')} className="input num" inputMode="decimal" value={draft.fullyDilutedSharesAfter} onChange={(e) => set('fullyDilutedSharesAfter', groupDigits(e.target.value))} />
            </Field>
            <Field
              id={idFor('ownershipPctAfter')}
              label="NKSquared ownership after closing"
              page={pages['ownershipPctAfter']}
              hint={
                draft.ownershipAuto ? (
                  impliedOwnership !== null ? (
                    `Calculated automatically: all shares held so far (including this tranche) ÷ fully diluted = ${percent(impliedOwnership, 4)}.`
                  ) : (
                    'Calculated automatically once shares allotted and fully diluted shares are filled in.'
                  )
                ) : (
                  <>
                    Cumulative, not just this tranche.{' '}
                    {impliedOwnership !== null && (
                      <button type="button" className="linklike" onClick={() => props.onChange({ ownershipPctAfter: String(impliedOwnership), ownershipAuto: true })}>
                        Use calculated value ({percent(impliedOwnership, 4)})
                      </button>
                    )}
                  </>
                )
              }
            >
              <div className="input-affix suffix">
                <input
                  id={idFor('ownershipPctAfter')}
                  className="input num"
                  inputMode="decimal"
                  value={draft.ownershipPctAfter}
                  onChange={(e) => props.onChange({ ownershipPctAfter: e.target.value, ownershipAuto: false })}
                  required
                />
                <span className="post">%</span>
              </div>
            </Field>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <h3>
              Expenses paid by NKSquared
              {pages['expenses'] ? <span className="src">p. {pages['expenses']}</span> : null}
            </h3>
            {draft.expenses.length === 0 && <p className="subtle" style={{ fontSize: 14 }}>No expenses added. Legal, due diligence, stamp duty and advisory costs count towards the cost of the investment.</p>}
            {draft.expenses.map((expense, index) => (
              <div className="expense-row" key={expense.key}>
                <select
                  aria-label={`Expense ${index + 1} type`}
                  id={idFor(`expense-${expense.key}-category`)}
                  className="input"
                  value={expense.category}
                  onChange={(e) => props.onChange({ expenses: draft.expenses.map((x) => (x.key === expense.key ? { ...x, category: e.target.value as ExpenseCategory } : x)) })}
                >
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Expense ${index + 1} description`}
                  id={idFor(`expense-${expense.key}-description`)}
                  className="input"
                  placeholder="Description"
                  value={expense.description}
                  onChange={(e) => props.onChange({ expenses: draft.expenses.map((x) => (x.key === expense.key ? { ...x, description: e.target.value } : x)) })}
                />
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input
                    aria-label={`Expense ${index + 1} amount in USD`}
                    id={idFor(`expense-${expense.key}-amount`)}
                    className="input num"
                    inputMode="decimal"
                    value={expense.amount}
                    onChange={(e) => props.onChange({ expenses: draft.expenses.map((x) => (x.key === expense.key ? { ...x, amount: groupDigits(e.target.value) } : x)) })}
                    required
                  />
                </div>
                <button type="button" className="btn btn-ghost btn-small" aria-label={`Remove expense ${index + 1}`} onClick={() => props.onChange({ expenses: draft.expenses.filter((x) => x.key !== expense.key) })}>
                  ✕
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-small" onClick={() => props.onChange({ expenses: [...draft.expenses, { key: expenseKey++, category: 'LEGAL', description: '', amount: '' }] })}>
                Add expense
              </button>
              <span className="subtle">
                Expenses <strong style={{ color: 'var(--ink)' }}>{usd(expensesTotal)}</strong> · Total cost <strong style={{ color: 'var(--ink)' }}>{usd((invested ?? 0) + expensesTotal)}</strong>
              </span>
            </div>
          </div>

          <Field id={idFor('notes')} label="Notes" page={pages['notes']}>
            <textarea id={idFor('notes')} className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Conditions subsequent, deferred consideration, anything unusual" />
          </Field>
        </fieldset>
      </div>
    </section>
  );
}
