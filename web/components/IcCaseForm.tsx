'use client';

import type { IcCase, IcCaseInput, IcProjection } from '@nksq/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { groupDigits, multiple, parseAmount, percent, rate, usd } from '@/lib/format';

interface TrancheDraft {
  key: number;
  amount: string;
  expectedDate: string;
  milestone: string;
}

interface Draft {
  approvedOn: string;
  entryPostMoney: string;
  entryOwnership: string;
  dilutionToExit: string;
  exitYear: string;
  exitValuation: string;
  notes: string;
  tranches: TrancheDraft[];
}

let trancheKey = 0;
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => groupDigits(String(value));

function draftFrom(previous: IcCase | null): Draft {
  if (!previous) {
    return {
      approvedOn: today(),
      entryPostMoney: '',
      entryOwnership: '',
      dilutionToExit: '0',
      exitYear: String(new Date().getFullYear() + 5),
      exitValuation: '',
      notes: '',
      tranches: [{ key: trancheKey++, amount: '', expectedDate: today(), milestone: '' }],
    };
  }
  return {
    approvedOn: today(),
    entryPostMoney: money(previous.entryPostMoneyUsd),
    entryOwnership: String(previous.entryOwnershipPct),
    dilutionToExit: String(previous.dilutionToExitPct),
    exitYear: String(previous.exitYear),
    exitValuation: money(previous.exitValuationUsd),
    notes: '',
    tranches: previous.tranches.map((t) => ({ key: trancheKey++, amount: money(t.amountUsd), expectedDate: t.expectedDate, milestone: t.milestone ?? '' })),
  };
}

/** Turns the draft into an API request, or null while required fields are still empty. */
function toInput(draft: Draft): IcCaseInput | null {
  const entryPostMoneyUsd = parseAmount(draft.entryPostMoney);
  const entryOwnershipPct = parseAmount(draft.entryOwnership);
  const dilutionToExitPct = parseAmount(draft.dilutionToExit) ?? 0;
  const exitValuationUsd = parseAmount(draft.exitValuation);
  const exitYear = Number(draft.exitYear);
  const tranches = draft.tranches.map((t) => ({ amountUsd: parseAmount(t.amount), expectedDate: t.expectedDate, milestone: t.milestone.trim() || null }));
  if (entryPostMoneyUsd === null || entryOwnershipPct === null || exitValuationUsd === null || !Number.isInteger(exitYear)) return null;
  if (tranches.some((t) => t.amountUsd === null || !t.expectedDate)) return null;
  return {
    approvedOn: draft.approvedOn,
    entryPostMoneyUsd,
    entryOwnershipPct,
    dilutionToExitPct,
    exitYear,
    exitValuationUsd,
    notes: draft.notes.trim() || null,
    tranches: tranches.map((t) => ({ ...t, amountUsd: t.amountUsd as number })),
  };
}

export function IcCaseForm(props: { investmentId: number; previous: IcCase | null; onSaved: (icCase: IcCase) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(props.previous));
  const [preview, setPreview] = useState<IcProjection | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = useMemo(() => toInput(draft), [draft]);
  const commitment = draft.tranches.reduce((sum, t) => sum + (parseAmount(t.amount) ?? 0), 0);
  const postMoney = parseAmount(draft.entryPostMoney);
  const impliedOwnership = postMoney && commitment ? (commitment / postMoney) * 100 : null;

  // Live projection, calculated by the server so the math lives in exactly one place.
  useEffect(() => {
    if (!input) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      api<IcProjection>('/ic-cases/preview', { method: 'POST', body: input })
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err: Error) => {
          setPreview(null);
          setPreviewError(err.message);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [input]);

  const set = (key: keyof Omit<Draft, 'tranches'>, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const setTranche = (key: number, field: keyof Omit<TrancheDraft, 'key'>, value: string) =>
    setDraft((d) => ({ ...d, tranches: d.tranches.map((t) => (t.key === key ? { ...t, [field]: value } : t)) }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input) {
      setError('Fill in every amount, percentage and tranche date before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api<IcCase>(`/investments/${props.investmentId}/ic-cases`, { method: 'POST', body: input });
      props.onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the IC approval.');
      setBusy(false);
    }
  }

  const isRevision = props.previous !== null;

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>{isRevision ? `Record revised IC (version ${props.previous!.version + 1})` : 'Record IC approval'}</h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            {isRevision
              ? `Starts from version ${props.previous!.version}. Saving keeps version ${props.previous!.version} unchanged and marks it superseded.`
              : 'Enter the case as approved. It becomes version 1 and cannot be edited afterwards.'}
          </p>
        </div>
      </div>
      <div className="panel-body">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="grid-3">
          <div className="field">
            <label htmlFor="approvedOn">IC approval date</label>
            <input id="approvedOn" type="date" className="input" value={draft.approvedOn} onChange={(e) => set('approvedOn', e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="entryPostMoney">Entry post-money valuation</label>
            <div className="input-affix">
              <span className="pre">$</span>
              <input id="entryPostMoney" className="input num" inputMode="decimal" value={draft.entryPostMoney} onChange={(e) => set('entryPostMoney', groupDigits(e.target.value))} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="entryOwnership">Entry ownership</label>
            <div className="input-affix suffix">
              <input id="entryOwnership" className="input num" inputMode="decimal" value={draft.entryOwnership} onChange={(e) => set('entryOwnership', e.target.value)} required />
              <span className="post">%</span>
            </div>
            <span className="hint">{impliedOwnership ? `Commitment ÷ post-money = ${percent(impliedOwnership)}` : 'Fully diluted, at entry.'}</span>
          </div>
          <div className="field">
            <label htmlFor="dilutionToExit">Expected dilution to exit</label>
            <div className="input-affix suffix">
              <input id="dilutionToExit" className="input num" inputMode="decimal" value={draft.dilutionToExit} onChange={(e) => set('dilutionToExit', e.target.value)} />
              <span className="post">%</span>
            </div>
            <span className="hint">From future rounds before exit.</span>
          </div>
          <div className="field">
            <label htmlFor="exitYear">Exit year</label>
            <input id="exitYear" className="input num" inputMode="numeric" value={draft.exitYear} onChange={(e) => set('exitYear', e.target.value.replace(/\D/g, '').slice(0, 4))} required />
            <span className="hint">Exit assumed on 31 December.</span>
          </div>
          <div className="field">
            <label htmlFor="exitValuation">Company valuation at exit</label>
            <div className="input-affix">
              <span className="pre">$</span>
              <input id="exitValuation" className="input num" inputMode="decimal" value={draft.exitValuation} onChange={(e) => set('exitValuation', groupDigits(e.target.value))} required />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <h3>Tranches</h3>
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
              <input
                aria-label={`Tranche ${index + 1} amount`}
                id={`tranche-${tranche.key}-amount`}
                className="input num"
                inputMode="decimal"
                value={tranche.amount}
                onChange={(e) => setTranche(tranche.key, 'amount', groupDigits(e.target.value))}
                required
              />
              <input
                aria-label={`Tranche ${index + 1} expected date`}
                id={`tranche-${tranche.key}-date`}
                type="date"
                className="input"
                value={tranche.expectedDate}
                onChange={(e) => setTranche(tranche.key, 'expectedDate', e.target.value)}
                required
              />
              <input
                aria-label={`Tranche ${index + 1} milestone`}
                id={`tranche-${tranche.key}-milestone`}
                className="input milestone"
                value={tranche.milestone}
                placeholder={index === 0 ? 'At signing' : 'e.g. ARR ≥ $5M'}
                onChange={(e) => setTranche(tranche.key, 'milestone', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                aria-label={`Remove tranche ${index + 1}`}
                disabled={draft.tranches.length === 1}
                onClick={() => setDraft((d) => ({ ...d, tranches: d.tranches.filter((t) => t.key !== tranche.key) }))}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setDraft((d) => ({ ...d, tranches: [...d.tranches, { key: trancheKey++, amount: '', expectedDate: '', milestone: '' }] }))}
            >
              Add tranche
            </button>
            <span className="subtle">
              Total commitment <strong style={{ color: 'var(--ink)' }}>{usd(commitment)}</strong>
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Key conditions, or what changed in this revision" />
          <span className="hint">Uploading the IC memo itself arrives with the Documents module.</span>
        </div>

        <div className="preview" aria-live="polite">
          <span className="eyebrow">Projection</span>
          {previewError ? (
            <span className="alert alert-error">{previewError}</span>
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
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !input}>
            {busy ? 'Saving…' : isRevision ? `Save version ${props.previous!.version + 1}` : 'Save IC approval'}
          </button>
        </div>
      </div>
    </form>
  );
}
