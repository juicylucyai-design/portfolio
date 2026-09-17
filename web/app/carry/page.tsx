'use client';

import type { CarryFigures, CarrySettings, InvestmentCarry } from '@nksq/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CarryTermsPanel } from '@/components/CarryTermsPanel';
import { Stat } from '@/components/Stat';
import { api } from '@/lib/api';
import { parseAmount, usd } from '@/lib/format';

type Basis = 'projected' | 'current';

export default function CarryPage() {
  const [carries, setCarries] = useState<InvestmentCarry[] | null>(null);
  const [settings, setSettings] = useState<CarrySettings | null>(null);
  const [hurdleDraft, setHurdleDraft] = useState('');
  const [savingHurdle, setSavingHurdle] = useState(false);
  const [basis, setBasis] = useState<Basis>('projected');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function refreshSummary() {
    return api<InvestmentCarry[]>('/carry/summary').then(setCarries);
  }

  useEffect(() => {
    Promise.all([api<InvestmentCarry[]>('/carry/summary'), api<CarrySettings>('/carry/settings')])
      .then(([summary, s]) => {
        setCarries(summary);
        setSettings(s);
        setHurdleDraft(String(s.hurdleRatePct));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function saveHurdle() {
    const pct = parseAmount(hurdleDraft);
    if (pct === null) return;
    setSavingHurdle(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api<CarrySettings>('/carry/settings', { method: 'POST', body: { hurdleRatePct: pct } });
      setSettings(updated);
      setNotice(`Hurdle rate set to ${updated.hurdleRatePct}%.`);
      await refreshSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the hurdle rate.');
    } finally {
      setSavingHurdle(false);
    }
  }

  const totals = useMemo(() => {
    const qualified = (carries ?? []).filter((c) => c.terms.qualified && c[basis].totalCarryUsd !== null);
    return {
      profit: qualified.reduce((sum, c) => sum + (c[basis].profitUsd ?? 0), 0),
      carriable: qualified.reduce((sum, c) => sum + (c[basis].carriableProfitUsd ?? 0), 0),
      total: qualified.reduce((sum, c) => sum + (c[basis].totalCarryUsd ?? 0), 0),
    };
  }, [carries, basis]);

  const byPerson = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of carries ?? []) {
      if (!c.terms.qualified) continue;
      const figures = c[basis];
      const add = (person: string | null, amount: number | null) => {
        if (!person || !amount) return;
        totals.set(person, (totals.get(person) ?? 0) + amount);
      };
      add(c.terms.originationPerson, figures.originationCarryUsd);
      add(c.terms.monitoringPerson, figures.monitoringCarryUsd);
      add(c.terms.closurePerson, figures.closureCarryUsd);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [carries, basis]);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">Portfolio · all amounts in USD</div>
          <h1>Carry</h1>
          <p className="subtle" style={{ marginTop: 4 }}>
            Deal-by-deal incentive plan: origination (up to 5%), monitoring (up to 5%) and closure (up to 10%) of profit above the hurdle — 20% combined
            for one person doing all three. There&apos;s no realized exit to calculate this from yet, so figures are either projected (the IC&apos;s
            assumed exit) or current (the latest known valuation, as if realized today).
          </p>
        </div>
        <div className="field" style={{ width: 160 }} title="Minimum annual return, compounded over the holding period, before carry applies.">
          <label htmlFor="hurdleRate" style={{ fontSize: 12 }}>
            Hurdle rate
          </label>
          <div className="input-affix suffix">
            <input id="hurdleRate" className="input num" inputMode="decimal" value={hurdleDraft} onChange={(e) => setHurdleDraft(e.target.value)} />
            <span className="post">%</span>
          </div>
          {hurdleDraft !== String(settings?.hurdleRatePct ?? '') && (
            <button type="button" className="btn btn-small btn-primary" onClick={() => void saveHurdle()} disabled={savingHurdle}>
              {savingHurdle ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="nav" style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6, padding: 3, width: 'fit-content' }}>
        <a className={basis === 'projected' ? 'active' : undefined} onClick={() => setBasis('projected')} style={{ cursor: 'pointer' }}>
          Projected
        </a>
        <a className={basis === 'current' ? 'active' : undefined} onClick={() => setBasis('current')} style={{ cursor: 'pointer' }}>
          Current
        </a>
      </div>

      <section className="stats" aria-label="Carry summary">
        <Stat label={`${basis === 'projected' ? 'Projected' : 'Current'} profit`} value={usd(totals.profit)} note="Across qualified investments, floored at zero per deal." />
        <Stat label="Carriable profit" value={usd(totals.carriable)} note="Profit above the hurdle." />
        <Stat label="Total carry" value={usd(totals.total)} note="Sum of origination, monitoring and closure carry." accent />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>By investment</h2>
        </div>
        {carries === null && !error ? (
          <div className="empty">
            <p>Loading…</p>
          </div>
        ) : carries && carries.length === 0 ? (
          <div className="empty">
            <p className="subtle">No investments yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="num">Profit</th>
                  <th className="num">Hurdle</th>
                  <th className="num">Carriable</th>
                  <th>Origination</th>
                  <th>Monitoring</th>
                  <th>Closure</th>
                  <th className="num">Total carry</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {carries?.map((c) => {
                  const figures: CarryFigures = c[basis];
                  return (
                    <tr key={c.investmentId} className="clickable" onClick={() => setEditingId(c.investmentId === editingId ? null : c.investmentId)}>
                      <td>
                        <Link href={`/investment?id=${c.investmentId}`} onClick={(e) => e.stopPropagation()}>
                          <strong>{c.companyName}</strong>
                        </Link>
                        {!c.terms.qualified && <div className="subtle" style={{ fontSize: 12 }}>Non-qualified</div>}
                      </td>
                      <td className="num">{usd(figures.profitUsd)}</td>
                      <td className="num">{usd(figures.hurdleAmountUsd)}</td>
                      <td className="num">{usd(figures.carriableProfitUsd)}</td>
                      <td>
                        {c.terms.originationPerson ?? <span className="subtle">—</span>}
                        <div className="subtle" style={{ fontSize: 12 }}>
                          {c.terms.originationPct}% · {usd(figures.originationCarryUsd)}
                        </div>
                      </td>
                      <td>
                        {c.terms.monitoringPerson ?? <span className="subtle">—</span>}
                        <div className="subtle" style={{ fontSize: 12 }}>
                          {c.terms.monitoringPct}% · {usd(figures.monitoringCarryUsd)}
                        </div>
                      </td>
                      <td>
                        {c.terms.closurePerson ?? <span className="subtle">—</span>}
                        <div className="subtle" style={{ fontSize: 12 }}>
                          {c.terms.closurePct}% · {usd(figures.closureCarryUsd)}
                        </div>
                      </td>
                      <td className="num">{usd(figures.totalCarryUsd)}</td>
                      <td className="num">
                        <button type="button" className="btn btn-small">
                          {editingId === c.investmentId ? 'Close' : 'Edit terms'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingId !== null && (
        <CarryTermsPanel
          investmentId={editingId}
          companyName={carries?.find((c) => c.investmentId === editingId)?.companyName}
          onSaved={() => void refreshSummary()}
          onClose={() => setEditingId(null)}
        />
      )}

      {byPerson.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>By person</h2>
            <span className="subtle" style={{ fontSize: 13 }}>
              Across qualified investments, {basis}.
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="num">Carry</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map(([person, amount]) => (
                  <tr key={person}>
                    <td>{person}</td>
                    <td className="num">{usd(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
