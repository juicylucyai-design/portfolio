'use client';

import type { Investment, Position } from '@nksq/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Stat } from '@/components/Stat';
import { api } from '@/lib/api';
import { fileSize, multiple, percent, rate, STATUS_LABELS, usd, usdCompact } from '@/lib/format';

export default function DashboardPage() {
  const router = useRouter();
  const [investments, setInvestments] = useState<Investment[] | null>(null);
  const [positions, setPositions] = useState<Map<number, Position>>(new Map());
  const [portfolioSummary, setPortfolioSummary] = useState<{ moic: number | null; irr: number | null }>({ moic: null, irr: null });
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
    Promise.all([
      api<Investment[]>('/investments'),
      api<Position[]>('/positions'),
      api<{ moic: number | null; irr: number | null }>('/positions/portfolio-summary'),
    ])
      .then(([list, positionList, summary]) => {
        setInvestments(list);
        setPositions(new Map(positionList.map((p) => [p.investmentId, p])));
        setPortfolioSummary(summary);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const totals = useMemo(() => {
    const all = [...positions.values()];
    const closed = all.filter((p) => p.basis === 'CLOSING');
    return {
      closedCount: closed.length,
      investedToDate: closed.reduce((sum, p) => sum + (p.investedUsd ?? 0), 0),
      // Capital events (sales, dividends) aren't tracked yet, so nothing is realized until that module exists.
      realized: 0,
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
        <Stat label="Investments" value={investments ? investments.length : '—'} note={`${totals.closedCount} closed`} />
        <Stat label="Invested to date" value={usdCompact(totals.investedToDate)} note="From closings, excluding expenses." />
        <Stat label="Realized" value={usdCompact(totals.realized)} note="From capital events (sales, dividends) — none recorded yet." />
        <Stat
          label="Portfolio MOIC"
          value={multiple(portfolioSummary.moic)}
          note="Actual cost vs. value at each investment's latest known valuation. Investments with no closing yet aren't counted."
          accent
        />
        <Stat
          label="Portfolio IRR"
          value={rate(portfolioSummary.irr)}
          note="XIRR of actual closing cash flows to date, marked at each investment's latest known valuation as of today."
          accent
        />
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
                  <th className="num">Investment</th>
                  <th className="num">Expenses</th>
                  <th className="num">Invested valuation</th>
                  <th className="num">Current valuation</th>
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
                  return (
                    <tr key={investment.id} className="clickable" onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} onClick={(e) => e.stopPropagation()}>
                          <strong>{investment.companyName}</strong>
                        </Link>
                      </td>
                      <td>
                        <span className={`pill ${investment.status}`}>{STATUS_LABELS[investment.status]}</span>
                      </td>
                      <td className="num">{usd(position?.investedUsd ?? position?.costUsd)}</td>
                      <td className="num">{usd(position?.expensesUsd)}</td>
                      <td className="num">{usd(position?.entryValuationUsd)}</td>
                      <td className="num">{usd(position?.currentValuationUsd)}</td>
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
