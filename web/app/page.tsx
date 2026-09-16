'use client';

import type { IcCaseSummary, Investment } from '@nksq/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { multiple, rate, STATUS_LABELS, usd, usdCompact } from '@/lib/format';

export default function DashboardPage() {
  const router = useRouter();
  const [investments, setInvestments] = useState<Investment[] | null>(null);
  const [summaries, setSummaries] = useState<Map<number, IcCaseSummary>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The View composes two modules' public endpoints; neither module needs to know about the other.
    Promise.all([api<Investment[]>('/investments'), api<IcCaseSummary[]>('/ic-cases/latest')])
      .then(([list, latest]) => {
        setInvestments(list);
        setSummaries(new Map(latest.map((summary) => [summary.investmentId, summary])));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const totals = useMemo(() => {
    const approved = [...summaries.values()];
    const commitment = approved.reduce((sum, s) => sum + s.commitmentUsd, 0);
    const proceeds = approved.reduce((sum, s) => sum + s.projectedProceedsUsd, 0);
    return { approvedCount: approved.length, commitment, proceeds, moic: commitment > 0 ? proceeds / commitment : null };
  }, [summaries]);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">Portfolio · all amounts in USD</div>
          <h1>Investments</h1>
        </div>
        <Link href="/investments/new" className="btn btn-primary">
          New investment
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="stats" aria-label="Portfolio summary">
        <div className="stat">
          <span className="label">Investments</span>
          <span className="value">{investments ? investments.length : '—'}</span>
          <span className="note">{totals.approvedCount} with an IC approval</span>
        </div>
        <div className="stat">
          <span className="label">IC-approved commitment</span>
          <span className="value">{usdCompact(totals.commitment)}</span>
          <span className="note">latest IC version of each deal</span>
        </div>
        <div className="stat">
          <span className="label">Projected proceeds</span>
          <span className="value">{usdCompact(totals.proceeds)}</span>
          <span className="note">at each deal's exit year</span>
        </div>
        <div className="stat">
          <span className="label">Projected portfolio MOIC</span>
          <span className="value accent">{multiple(totals.moic)}</span>
          <span className="note">proceeds ÷ commitment</span>
        </div>
      </section>

      <section className="panel">
        {investments === null && !error ? (
          <div className="empty">
            <p>Loading investments…</p>
          </div>
        ) : investments && investments.length === 0 ? (
          <div className="empty">
            <h2>No investments yet</h2>
            <p>Add the first deal, then record what the investment committee approved to see projected IRR and MOIC here.</p>
            <Link href="/investments/new" className="btn btn-primary">
              New investment
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Instrument</th>
                  <th>Status</th>
                  <th>IC</th>
                  <th className="num">Commitment</th>
                  <th className="num">Exit year</th>
                  <th className="num">Proj. MOIC</th>
                  <th className="num">Proj. IRR</th>
                </tr>
              </thead>
              <tbody>
                {investments?.map((investment) => {
                  const summary = summaries.get(investment.id);
                  const href = `/investment?id=${investment.id}`;
                  return (
                    <tr key={investment.id} className="clickable" onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} onClick={(e) => e.stopPropagation()}>
                          <strong>{investment.companyName}</strong>
                        </Link>
                        <div className="subtle" style={{ fontSize: 13 }}>
                          {[investment.sector, investment.geography].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td>{investment.instrument}</td>
                      <td>
                        <span className={`pill ${investment.status}`}>{STATUS_LABELS[investment.status]}</span>
                      </td>
                      <td>{summary ? <span className="tag">v{summary.version}</span> : <span className="subtle">—</span>}</td>
                      <td className="num">{usd(summary?.commitmentUsd)}</td>
                      <td className="num">{summary?.exitYear ?? '—'}</td>
                      <td className="num">{multiple(summary?.projectedMoic)}</td>
                      <td className="num">{rate(summary?.projectedIrr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
