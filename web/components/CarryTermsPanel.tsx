'use client';

import type { CarryTermsInput, InvestmentCarry } from '@nksq/contracts';
import { useCallback, useEffect, useState } from 'react';
import { CarryFiguresRow } from '@/components/CarryFiguresRow';
import { api } from '@/lib/api';
import { parseAmount } from '@/lib/format';

interface Draft {
  qualified: boolean;
  originationPerson: string;
  originationPct: string;
  monitoringPerson: string;
  monitoringPct: string;
  closurePerson: string;
  closurePct: string;
}

function draftFrom(terms: InvestmentCarry['terms']): Draft {
  return {
    qualified: terms.qualified,
    originationPerson: terms.originationPerson ?? '',
    originationPct: String(terms.originationPct),
    monitoringPerson: terms.monitoringPerson ?? '',
    monitoringPct: String(terms.monitoringPct),
    closurePerson: terms.closurePerson ?? '',
    closurePct: String(terms.closurePct),
  };
}

export function CarryTermsPanel({
  investmentId,
  companyName,
  onSaved,
  onClose,
}: {
  investmentId: number;
  companyName?: string;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const [carry, setCarry] = useState<InvestmentCarry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const summary = await api<InvestmentCarry[]>('/carry/summary');
    const mine = summary.find((c) => c.investmentId === investmentId);
    if (mine) {
      setCarry(mine);
      setDraft(draftFrom(mine.terms));
    }
  }, [investmentId]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  if (!carry || !draft) return null;

  const set = (key: keyof Draft, value: string | boolean) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body: CarryTermsInput = {
        qualified: draft.qualified,
        originationPerson: draft.originationPerson.trim() || null,
        originationPct: parseAmount(draft.originationPct) ?? 0,
        monitoringPerson: draft.monitoringPerson.trim() || null,
        monitoringPct: parseAmount(draft.monitoringPct) ?? 0,
        closurePerson: draft.closurePerson.trim() || null,
        closurePct: parseAmount(draft.closurePct) ?? 0,
      };
      await api(`/carry/investments/${investmentId}/terms`, { method: 'POST', body });
      setNotice('Saved carry terms.');
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save carry terms.');
    } finally {
      setSaving(false);
    }
  }

  const totalPct = (parseAmount(draft.originationPct) ?? 0) + (parseAmount(draft.monitoringPct) ?? 0) + (parseAmount(draft.closurePct) ?? 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Carry terms{companyName ? ` — ${companyName}` : ''}</h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            Deal-by-deal incentive: up to 5% for origination, 5% for monitoring and 10% for closure of profit above the hurdle. Shown two ways —
            projected at the IC&apos;s assumed exit, and current at the latest known valuation — since there&apos;s no realized exit yet.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        <label className="check">
          <input type="checkbox" checked={draft.qualified} onChange={(e) => set('qualified', e.target.checked)} />
          Qualified investment (the incentive plan applies)
        </label>

        {!draft.qualified ? (
          <p className="subtle" style={{ fontSize: 14 }}>
            Non-qualified: a pass-through, no carry applies.
          </p>
        ) : (
          <>
            <div className="grid-3">
              <div className="field">
                <label htmlFor="originationPerson">Origination</label>
                <input id="originationPerson" className="input" placeholder="Person" value={draft.originationPerson} onChange={(e) => set('originationPerson', e.target.value)} />
                <div className="input-affix suffix" style={{ marginTop: 6 }}>
                  <input className="input num" inputMode="decimal" aria-label="Origination %" value={draft.originationPct} onChange={(e) => set('originationPct', e.target.value)} />
                  <span className="post">%</span>
                </div>
                <span className="hint">Up to 5%.</span>
              </div>
              <div className="field">
                <label htmlFor="monitoringPerson">Monitoring</label>
                <input id="monitoringPerson" className="input" placeholder="Person" value={draft.monitoringPerson} onChange={(e) => set('monitoringPerson', e.target.value)} />
                <div className="input-affix suffix" style={{ marginTop: 6 }}>
                  <input className="input num" inputMode="decimal" aria-label="Monitoring %" value={draft.monitoringPct} onChange={(e) => set('monitoringPct', e.target.value)} />
                  <span className="post">%</span>
                </div>
                <span className="hint">Up to 5%.</span>
              </div>
              <div className="field">
                <label htmlFor="closurePerson">Closure</label>
                <input id="closurePerson" className="input" placeholder="Person" value={draft.closurePerson} onChange={(e) => set('closurePerson', e.target.value)} />
                <div className="input-affix suffix" style={{ marginTop: 6 }}>
                  <input className="input num" inputMode="decimal" aria-label="Closure %" value={draft.closurePct} onChange={(e) => set('closurePct', e.target.value)} />
                  <span className="post">%</span>
                </div>
                <span className="hint">Up to 10%.</span>
              </div>
            </div>
            <p className="subtle" style={{ fontSize: 13 }}>
              {totalPct.toFixed(2)}% combined{totalPct === 20 ? ' — same as one person doing all three.' : '.'}
            </p>
          </>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save carry terms'}
          </button>
        </div>

        {draft.qualified && (carry.projected.totalCarryUsd !== null || carry.current.totalCarryUsd !== null) ? (
          <>
            <CarryFiguresRow label="Projected" figures={carry.projected} profitNote="Projected exit proceeds less cost, floored at zero." />
            <CarryFiguresRow label="Current" figures={carry.current} profitNote="Stake value at the latest known valuation, less cost, as if realized today." />
          </>
        ) : (
          draft.qualified && (
            <p className="subtle" style={{ fontSize: 14 }}>
              No IC approval or closing recorded yet, so there&apos;s nothing to calculate carry from.
            </p>
          )
        )}
      </div>
    </section>
  );
}
