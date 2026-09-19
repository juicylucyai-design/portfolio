'use client';

import type { IcCase, IcCaseInput, IcMemoExtraction, IcProjection } from '@nksq/contracts';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { groupDigits, multiple, parseAmount, percent, rate, usd } from '@/lib/format';

// ---------- Draft: what's typed into the form, before it's valid ----------

export interface TrancheDraft {
  key: number;
  amount: string;
  expectedDate: string;
  milestone: string;
}

export interface FinancialDraft {
  key: number;
  year: string;
  revenue: string;
  ebitda: string;
}

export interface IcDraft {
  approvedOn: string;
  entryPostMoney: string;
  entryOwnership: string;
  dilutionToExit: string;
  exitYear: string;
  exitValuation: string;
  notes: string;
  tranches: TrancheDraft[];
  financials: FinancialDraft[];
}

let trancheKey = 0;
let financialKey = 0;
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number | null) => (value === null ? '' : groupDigits(String(value)));
const plain = (value: number | null) => (value === null ? '' : String(value));

export function emptyIcDraft(): IcDraft {
  return {
    approvedOn: today(),
    entryPostMoney: '',
    entryOwnership: '',
    dilutionToExit: '0',
    exitYear: String(new Date().getFullYear() + 5),
    exitValuation: '',
    notes: '',
    tranches: [{ key: trancheKey++, amount: '', expectedDate: today(), milestone: '' }],
    financials: [],
  };
}

export function icDraftFromCase(previous: IcCase): IcDraft {
  return {
    approvedOn: today(),
    entryPostMoney: money(previous.entryPostMoneyUsd),
    entryOwnership: plain(previous.entryOwnershipPct),
    dilutionToExit: plain(previous.dilutionToExitPct),
    exitYear: String(previous.exitYear),
    exitValuation: money(previous.exitValuationUsd),
    notes: '',
    tranches: previous.tranches.map((t) => ({ key: trancheKey++, amount: money(t.amountUsd), expectedDate: t.expectedDate, milestone: t.milestone ?? '' })),
    financials: previous.financials.map((f) => ({ key: financialKey++, year: String(f.year), revenue: money(f.revenueUsd), ebitda: money(f.ebitdaUsd) })),
  };
}

export function icDraftFromExtraction(extracted: IcMemoExtraction['icCase']): IcDraft {
  const fallback = emptyIcDraft();
  return {
    approvedOn: extracted.approvedOn ?? '',
    entryPostMoney: money(extracted.entryPostMoneyUsd),
    entryOwnership: plain(extracted.entryOwnershipPct),
    dilutionToExit: extracted.dilutionToExitPct === null ? '0' : String(extracted.dilutionToExitPct),
    exitYear: plain(extracted.exitYear),
    exitValuation: money(extracted.exitValuationUsd),
    notes: extracted.notes ?? '',
    tranches: extracted.tranches.length
      ? extracted.tranches.map((t) => ({ key: trancheKey++, amount: money(t.amountUsd), expectedDate: t.expectedDate ?? '', milestone: t.milestone ?? '' }))
      : fallback.tranches.map((t) => ({ ...t, expectedDate: '' })),
    financials: extracted.financials
      .filter((f) => f.year !== null)
      .map((f) => ({ key: financialKey++, year: String(f.year), revenue: money(f.revenueUsd), ebitda: money(f.ebitdaUsd) })),
  };
}

/** The API request for a draft, or null while required fields are still empty. */
export function icDraftToInput(draft: IcDraft): IcCaseInput | null {
  const entryPostMoneyUsd = parseAmount(draft.entryPostMoney);
  const entryOwnershipPct = parseAmount(draft.entryOwnership);
  const dilutionToExitPct = parseAmount(draft.dilutionToExit) ?? 0;
  const exitValuationUsd = parseAmount(draft.exitValuation);
  const exitYear = Number(draft.exitYear);
  const tranches = draft.tranches.map((t) => ({ amountUsd: parseAmount(t.amount), expectedDate: t.expectedDate, milestone: t.milestone.trim() || null }));
  if (!draft.approvedOn || entryPostMoneyUsd === null || entryOwnershipPct === null || exitValuationUsd === null || !Number.isInteger(exitYear)) return null;
  if (tranches.some((t) => t.amountUsd === null || !t.expectedDate)) return null;
  const financials = draft.financials
    .filter((f) => f.year.trim() !== '')
    .map((f) => ({ year: Number(f.year), revenueUsd: parseAmount(f.revenue), ebitdaUsd: parseAmount(f.ebitda) }));
  if (financials.some((f) => !Number.isInteger(f.year))) return null;
  return {
    approvedOn: draft.approvedOn,
    entryPostMoneyUsd,
    entryOwnershipPct,
    dilutionToExitPct,
    exitYear,
    exitValuationUsd,
    notes: draft.notes.trim() || null,
    tranches: tranches.map((t) => ({ ...t, amountUsd: t.amountUsd as number })),
    financials,
  };
}

// ---------- Fields ----------

/** "p. 7" beside a label when the value was read from that page of the memo. */
function Label({ htmlFor, children, page }: { htmlFor: string; children: ReactNode; page?: number | null }) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      {page ? <span className="src" title="Page of the IC memo this came from">p. {page}</span> : null}
    </label>
  );
}

export function IcCaseFields({ draft, onChange, pages = {} }: { draft: IcDraft; onChange: (draft: IcDraft) => void; pages?: Record<string, number> }) {
  const set = (key: keyof Omit<IcDraft, 'tranches' | 'financials'>, value: string) => onChange({ ...draft, [key]: value });
  const setTranche = (key: number, field: keyof Omit<TrancheDraft, 'key'>, value: string) =>
    onChange({ ...draft, tranches: draft.tranches.map((t) => (t.key === key ? { ...t, [field]: value } : t)) });
  const setFinancial = (key: number, field: keyof Omit<FinancialDraft, 'key'>, value: string) =>
    onChange({ ...draft, financials: draft.financials.map((f) => (f.key === key ? { ...f, [field]: value } : f)) });

  const commitment = draft.tranches.reduce((sum, t) => sum + (parseAmount(t.amount) ?? 0), 0);
  const postMoney = parseAmount(draft.entryPostMoney);
  const impliedOwnership = postMoney && commitment ? (commitment / postMoney) * 100 : null;

  return (
    <>
      <div className="grid-3">
        <div className="field">
          <Label htmlFor="approvedOn" page={pages['icCase.approvedOn']}>IC approval date</Label>
          <input id="approvedOn" type="date" className="input" value={draft.approvedOn} onChange={(e) => set('approvedOn', e.target.value)} required />
        </div>
        <div className="field">
          <Label htmlFor="entryPostMoney" page={pages['icCase.entryPostMoneyUsd']}>Entry post-money valuation</Label>
          <div className="input-affix">
            <span className="pre">$</span>
            <input id="entryPostMoney" className="input num" inputMode="decimal" value={draft.entryPostMoney} onChange={(e) => set('entryPostMoney', groupDigits(e.target.value))} required />
          </div>
        </div>
        <div className="field">
          <Label htmlFor="entryOwnership" page={pages['icCase.entryOwnershipPct']}>Entry ownership</Label>
          <div className="input-affix suffix">
            <input id="entryOwnership" className="input num" inputMode="decimal" value={draft.entryOwnership} onChange={(e) => set('entryOwnership', e.target.value)} required />
            <span className="post">%</span>
          </div>
          <span className="hint">{impliedOwnership ? `Commitment ÷ post-money = ${percent(impliedOwnership)}` : 'Fully diluted, at entry.'}</span>
        </div>
        <div className="field">
          <Label htmlFor="dilutionToExit" page={pages['icCase.dilutionToExitPct']}>Expected dilution to exit</Label>
          <div className="input-affix suffix">
            <input id="dilutionToExit" className="input num" inputMode="decimal" value={draft.dilutionToExit} onChange={(e) => set('dilutionToExit', e.target.value)} />
            <span className="post">points</span>
          </div>
          <span className="hint">Percentage points of ownership given up to future rounds before exit (entry 20%, exit 15% → 5).</span>
        </div>
        <div className="field">
          <Label htmlFor="exitYear" page={pages['icCase.exitYear']}>Exit year</Label>
          <input id="exitYear" className="input num" inputMode="numeric" value={draft.exitYear} onChange={(e) => set('exitYear', e.target.value.replace(/\D/g, '').slice(0, 4))} required />
          <span className="hint">Exit assumed on 31 December.</span>
        </div>
        <div className="field">
          <Label htmlFor="exitValuation" page={pages['icCase.exitValuationUsd']}>Company valuation at exit</Label>
          <div className="input-affix">
            <span className="pre">$</span>
            <input id="exitValuation" className="input num" inputMode="decimal" value={draft.exitValuation} onChange={(e) => set('exitValuation', groupDigits(e.target.value))} required />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <h3>
          Tranches
          {pages['icCase.tranches'] ? <span className="src">p. {pages['icCase.tranches']}</span> : null}
        </h3>
        <div className="tranche-row tranche-head" aria-hidden="true">
          <span />
          <span>Amount (USD)</span>
          <span>Expected date</span>
          <span>Milestone or condition</span>
          <span />
        </div>
        {draft.tranches.map((tranche, index) => (
          <div className="tranche-row" key={tranche.key}>
            <span className="n">T{index + 1}</span>
            <input aria-label={`Tranche ${index + 1} amount`} id={`tranche-${tranche.key}-amount`} className="input num" inputMode="decimal" value={tranche.amount} onChange={(e) => setTranche(tranche.key, 'amount', groupDigits(e.target.value))} required />
            <input aria-label={`Tranche ${index + 1} expected date`} id={`tranche-${tranche.key}-date`} type="date" className="input" value={tranche.expectedDate} onChange={(e) => setTranche(tranche.key, 'expectedDate', e.target.value)} required />
            <input aria-label={`Tranche ${index + 1} milestone`} id={`tranche-${tranche.key}-milestone`} className="input milestone" value={tranche.milestone} placeholder={index === 0 ? 'At signing' : 'e.g. ARR ≥ $5M'} onChange={(e) => setTranche(tranche.key, 'milestone', e.target.value)} />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              aria-label={`Remove tranche ${index + 1}`}
              disabled={draft.tranches.length === 1}
              onClick={() => onChange({ ...draft, tranches: draft.tranches.filter((t) => t.key !== tranche.key) })}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...draft, tranches: [...draft.tranches, { key: trancheKey++, amount: '', expectedDate: '', milestone: '' }] })}>
            Add tranche
          </button>
          <span className="subtle">
            Total commitment <strong style={{ color: 'var(--ink)' }}>{usd(commitment)}</strong>
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <h3>
          Financial projections
          {pages['icCase.financials'] ? <span className="src">p. {pages['icCase.financials']}</span> : null}
        </h3>
        <p className="subtle" style={{ fontSize: 13, margin: 0 }}>
          Revenue and EBITDA by fiscal year, as stated in the memo. Optional — leave empty if the memo has no year-by-year figures.
        </p>
        {draft.financials.length > 0 && (
          <div className="tranche-row tranche-head" aria-hidden="true">
            <span />
            <span>Year</span>
            <span>Revenue (USD)</span>
            <span>EBITDA (USD)</span>
            <span />
          </div>
        )}
        {draft.financials.map((financial, index) => (
          <div className="tranche-row" key={financial.key}>
            <span className="n">Y{index + 1}</span>
            <input
              aria-label={`Financial projection ${index + 1} year`}
              className="input num"
              inputMode="numeric"
              value={financial.year}
              onChange={(e) => setFinancial(financial.key, 'year', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <input
              aria-label={`Financial projection ${index + 1} revenue`}
              className="input num"
              inputMode="decimal"
              value={financial.revenue}
              onChange={(e) => setFinancial(financial.key, 'revenue', groupDigits(e.target.value))}
            />
            <input
              aria-label={`Financial projection ${index + 1} EBITDA`}
              className="input num"
              inputMode="decimal"
              value={financial.ebitda}
              onChange={(e) => setFinancial(financial.key, 'ebitda', groupDigits(e.target.value))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              aria-label={`Remove financial projection ${index + 1}`}
              onClick={() => onChange({ ...draft, financials: draft.financials.filter((f) => f.key !== financial.key) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            const lastYear = Number(draft.financials.at(-1)?.year);
            const nextYear = Number.isInteger(lastYear) ? String(lastYear + 1) : String(new Date().getFullYear());
            onChange({ ...draft, financials: [...draft.financials, { key: financialKey++, year: nextYear, revenue: '', ebitda: '' }] });
          }}
        >
          Add year
        </button>
      </div>

      <div className="field">
        <Label htmlFor="notes" page={pages['icCase.notes']}>Notes</Label>
        <textarea id="notes" className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Key conditions, or what changed in this revision" />
      </div>
    </>
  );
}

// ---------- Live projection ----------

/** Projected IRR and MOIC, calculated by the server so the math lives in exactly one place. */
export function IcProjectionPreview({ input, stated }: { input: IcCaseInput | null; stated?: { irrPct: number | null; moic: number | null } }) {
  const [preview, setPreview] = useState<IcProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!input) {
      setPreview(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      api<IcProjection>('/ic-cases/preview', { method: 'POST', body: input })
        .then((result) => {
          setPreview(result);
          setError(null);
        })
        .catch((err: Error) => {
          setPreview(null);
          setError(err.message);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [input]);

  const hasStated = stated && (stated.irrPct !== null || stated.moic !== null);

  return (
    <div className="preview" aria-live="polite">
      <span className="eyebrow">Projection</span>
      {error ? (
        <span className="alert alert-error">{error}</span>
      ) : preview ? (
        <dl className="kv">
          <div><dt>Commitment</dt><dd>{usd(preview.commitmentUsd)}</dd></div>
          <div><dt>Ownership at exit</dt><dd>{percent(preview.exitOwnershipPct)}</dd></div>
          <div><dt>Proceeds at exit</dt><dd>{usd(preview.projectedProceedsUsd)}</dd></div>
          <div><dt>Projected MOIC</dt><dd>{multiple(preview.projectedMoic)}</dd></div>
          <div><dt>Projected IRR</dt><dd>{rate(preview.projectedIrr)}</dd></div>
        </dl>
      ) : (
        <span className="subtle">Fill in the valuation, ownership, exit and tranche amounts to see IRR and MOIC.</span>
      )}
      {hasStated && (
        <span className="subtle" style={{ fontSize: 13 }}>
          The memo states {stated.irrPct !== null ? `IRR ${stated.irrPct}%` : ''}
          {stated.irrPct !== null && stated.moic !== null ? ' and ' : ''}
          {stated.moic !== null ? `MOIC ${multiple(stated.moic)}` : ''}. A gap usually means different exit timing or dilution assumptions.
        </span>
      )}
    </div>
  );
}

// ---------- Recording a revised IC on an existing investment ----------

export function IcCaseForm(props: { investmentId: number; previous: IcCase | null; onSaved: (icCase: IcCase) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<IcDraft>(() => (props.previous ? icDraftFromCase(props.previous) : emptyIcDraft()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useMemo(() => icDraftToInput(draft), [draft]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input) {
      setError('Fill in every amount, percentage and tranche date before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      props.onSaved(await api<IcCase>(`/investments/${props.investmentId}/ic-cases`, { method: 'POST', body: input }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the IC approval.');
      setBusy(false);
    }
  }

  const previous = props.previous;
  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>{previous ? `Record revised IC (version ${previous.version + 1})` : 'Record IC approval'}</h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            {previous
              ? `Starts from version ${previous.version}. Saving keeps version ${previous.version} unchanged and marks it superseded.`
              : 'Enter the case as approved. It becomes version 1 and cannot be edited afterwards.'}
          </p>
        </div>
      </div>
      <div className="panel-body">
        {error && <div className="alert alert-error">{error}</div>}
        <IcCaseFields draft={draft} onChange={setDraft} />
        <IcProjectionPreview input={input} />
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !input}>
            {busy ? 'Saving…' : previous ? `Save version ${previous.version + 1}` : 'Save IC approval'}
          </button>
        </div>
      </div>
    </form>
  );
}
