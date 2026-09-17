'use client';

import type { Investment, Position } from '@nksq/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { fileSize, multiple, percent, rate, STATUS_LABELS, usd, usdCompact } from '@/lib/format';

export default function DashboardPage() {
  const router = useRouter();
  const [investments, setInvestments] = useState<Investment[] | null>(null);
  const [positions, setPositions] = useState<Map<number, Position>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Confirmation after deleting an investment, then tidy the URL.
    const params = new URLSearchParams(window.location.search);
    const deleted = params.get('deleted');
    if (deleted) {
      const documents = Number(params.get('documents') ?? 0);
      const freed = Number(params.get('freed') ?? 0);
      setNotice(`Deleted ${deleted}${documents ? `, including ${documents} document${documents === 1 ? '' : 's'} (${fileSize(freed)})` : ''}.`);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  useEffect(() => {
    Promise.all([api<Investment[]>('/investments'), api<Position[]>('/positions')])
      .then(([list, positionList]) => {
        setInvestments(list);
        setPositions(new Map(positionList.map((p) => [p.investmentId, p])));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const totals = useMemo(() => {
    const all = [...positions.values()];
    const closed = all.filter((p) => p.basis === 'CLOSING');
    const withProjection = all.filter((p) => p.projectedProceedsUsd !== null && p.costUsd);
    const cost = withProjection.reduce((sum, p) => sum + (p.costUsd ?? 0), 0);
    const proceeds = withProjection.reduce((sum, p) => sum + (p.projectedProceedsUsd ?? 0), 0);
    return {
      closedCount: closed.length,
      investedToDate: closed.reduce((sum, p) => sum + (p.costUsd ?? 0), 0),
      undrawn: all.reduce((sum, p) => sum + (p.undrawnCommitmentUsd ?? 0), 0),
      moic: cost > 0 ? proceeds / cost : null,
    };
  }, [positions]);

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

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="stats" aria-label="Portfolio summary">
        <div className="stat">
          <span className="label">Investments</span>
          <span className="value">{investments ? investments.length : '—'}</span>
          <span className="note">{totals.closedCount} closed</span>
        </div>
        <div className="stat">
          <span className="label">Invested to date</span>
          <span className="value">{usdCompact(totals.investedToDate)}</span>
          <span className="note">from closings, expenses included</span>
        </div>
        <div className="stat">
          <span className="label">Committed, not yet drawn</span>
          <span className="value">{usdCompact(totals.undrawn)}</span>
          <span className="note">latest IC approvals less closings</span>
        </div>
        <div className="stat">
          <span className="label">Projected portfolio MOIC</span>
          <span className="value accent">{multiple(totals.moic)}</span>
          <span className="note">actual cost where closed, IC otherwise</span>
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
            <p>Add the first deal from its IC memo, then record the closing to track actual cost and ownership.</p>
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
                  <th>Status</th>
                  <th>Figures from</th>
                  <th className="num">Cost</th>
                  <th className="num">Ownership</th>
                  <th className="num">Exit year</th>
                  <th className="num">Proj. MOIC</th>
                  <th className="num">Proj. IRR</th>
                </tr>
              </thead>
              <tbody>
                {investments?.map((investment) => {
                  const position = positions.get(investment.id);
                  const href = `/investment?id=${investment.id}`;
                  const basis =
                    position?.basis === 'CLOSING' ? (
                      <span className="tag current">
                        {position.closingCount} closing{position.closingCount === 1 ? '' : 's'}
                      </span>
                    ) : position?.basis === 'IC' ? (
                      <span className="tag">IC v{position.icVersion}</span>
                    ) : (
                      <span className="subtle">—</span>
                    );
                  return (
                    <tr key={investment.id} className="clickable" onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} onClick={(e) => e.stopPropagation()}>
                          <strong>{investment.companyName}</strong>
                        </Link>
                        <div className="subtle" style={{ fontSize: 13 }}>
                          {[investment.instrument, investment.sector, investment.geography].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${investment.status}`}>{STATUS_LABELS[investment.status]}</span>
                      </td>
                      <td>{basis}</td>
                      <td className="num">{usd(position?.costUsd)}</td>
                      <td className="num">{percent(position?.ownershipPct)}</td>
                      <td className="num">{position?.exitYear ?? '—'}</td>
                      <td className="num">{multiple(position?.projectedMoic)}</td>
                      <td className="num">{rate(position?.projectedIrr)}</td>
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
