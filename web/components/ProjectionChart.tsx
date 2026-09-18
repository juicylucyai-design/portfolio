'use client';

import type { ExpectationStatus, FinancialActual, SaveFinancialActualResponse, YearComparison } from '@nksq/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmDialogHandle } from '@/components/ConfirmDialog';
import { FinancialActualForm } from '@/components/FinancialActualForm';
import { api } from '@/lib/api';
import { date, rate, usdCompact } from '@/lib/format';

const WIDTH = 680;
const HEIGHT = 300;
const MARGIN = { top: 22, right: 20, bottom: 36, left: 72 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

const STATUS_LABEL: Record<ExpectationStatus, string> = { BEATING: 'Beating', MEETING: 'Meeting', BELOW: 'Below' };
const STATUS_COLOR: Record<ExpectationStatus, string> = { BEATING: 'var(--accent)', MEETING: 'var(--muted)', BELOW: 'var(--red)' };

const periodLabel = (a: Pick<FinancialActual, 'periodType' | 'fiscalYear' | 'quarter'>) =>
  a.periodType === 'ANNUAL' ? `FY${a.fiscalYear}` : `Q${a.quarter} FY${a.fiscalYear}`;

/** Ids of whichever statement is the most recently uploaded for each exact period — the ones the chart and
 *  comparison actually use (see the server's compareFinancials, which applies the same rule). */
function currentIds(actuals: FinancialActual[]): Set<number> {
  const latest = new Map<string, FinancialActual>();
  for (const actual of actuals) {
    const key = `${actual.periodType}:${actual.fiscalYear}:${actual.quarter ?? 0}`;
    const current = latest.get(key);
    if (!current || actual.createdAt > current.createdAt) latest.set(key, actual);
  }
  return new Set([...latest.values()].map((a) => a.id));
}

/** Revenue and EBITDA: what the IC memo projected, compared against reported financial statements. Self-fetches
 *  and manages its own upload form and delete confirmation, so the investment page just drops it in. */
export function FinancialPerformanceSection({ investmentId }: { investmentId: number }) {
  const [comparison, setComparison] = useState<YearComparison[] | null>(null);
  const [actuals, setActuals] = useState<FinancialActual[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useRef<ConfirmDialogHandle>(null);
  const currentPeriodIds = useMemo(() => currentIds(actuals ?? []), [actuals]);

  const refresh = useCallback(
    () => Promise.all([api<YearComparison[]>(`/investments/${investmentId}/financial-comparison`), api<FinancialActual[]>(`/investments/${investmentId}/financial-actuals`)]).then(
      ([c, a]) => {
        setComparison(c);
        setActuals(a);
      },
    ),
    [investmentId],
  );

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  async function deleteActual(actual: FinancialActual) {
    const ok = await confirmDialog.current?.confirm({
      title: `Delete the ${periodLabel(actual)} statement?`,
      body: <p className="subtle">This can&apos;t be undone. The comparison above is recalculated from what remains.</p>,
    });
    if (!ok) return;
    try {
      await api(`/investments/${investmentId}/financial-actuals/${actual.id}`, { method: 'DELETE', body: {} });
      setNotice(`Deleted the ${periodLabel(actual)} statement.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the statement.');
    }
  }

  if (uploadOpen) {
    return (
      <FinancialActualForm
        investmentId={investmentId}
        onCancel={() => setUploadOpen(false)}
        onSaved={async (result: SaveFinancialActualResponse) => {
          setUploadOpen(false);
          setNotice(`Saved the ${periodLabel(result.financialActual)} statement${result.document ? ' with its document' : ''}.`);
          await refresh().catch((err: Error) => setError(err.message));
        }}
      />
    );
  }

  return (
    <>
      <ConfirmDialog ref={confirmDialog} />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Financial performance</h2>
            <p className="subtle" style={{ fontSize: 14 }}>
              Revenue and EBITDA projected in the IC memo, compared against quarterly and annual statements as they come in.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            Upload statement
          </button>
        </div>
        <div className="panel-body">
          {notice && (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          )}
          {error && <div className="alert alert-error">{error}</div>}

          {comparison === null ? (
            <p className="subtle">Loading…</p>
          ) : comparison.length === 0 ? (
            <p className="subtle">
              No projections or statements yet. Revenue and EBITDA projections come from the IC memo; upload a quarterly or annual statement above to
              start comparing actuals against them.
            </p>
          ) : (
            <>
              <MetricChart
                label="Revenue"
                color="var(--accent)"
                showCagr
                points={comparison.map((c) => ({ year: c.year, projected: c.projectedRevenueUsd, actual: c.actualRevenueUsd, status: c.revenueStatus, quartersReported: c.quartersReported }))}
              />
              <MetricChart
                label="EBITDA"
                color="var(--amber)"
                points={comparison.map((c) => ({ year: c.year, projected: c.projectedEbitdaUsd, actual: c.actualEbitdaUsd, status: c.ebitdaStatus, quartersReported: c.quartersReported }))}
              />
            </>
          )}

          {actuals && actuals.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Period end</th>
                    <th className="num">Revenue</th>
                    <th className="num">EBITDA</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {actuals.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {periodLabel(a)}
                        {currentPeriodIds.has(a.id) ? <span className="tag current" style={{ marginLeft: 6 }}>current</span> : <span className="tag" style={{ marginLeft: 6 }}>superseded</span>}
                      </td>
                      <td>{date(a.periodEndDate)}</td>
                      <td className="num">{usdCompact(a.revenueUsd)}</td>
                      <td className="num">{usdCompact(a.ebitdaUsd)}</td>
                      <td>{date(a.createdAt)}</td>
                      <td className="num">
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => void deleteActual(a)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

interface MetricPoint {
  year: number;
  projected: number | null;
  actual: number | null;
  status: ExpectationStatus | null;
  quartersReported: number;
}

/** Compound annual growth rate from the first year with a usable figure to the last, preferring the actual
 *  over the projection for each end. Null if there's fewer than two years, or either end isn't positive. */
function cagr(points: MetricPoint[]): { fromYear: number; toYear: number; rate: number } | null {
  const withValue = points.map((p) => ({ year: p.year, value: p.actual ?? p.projected })).filter((p): p is { year: number; value: number } => p.value !== null);
  if (withValue.length < 2) return null;
  const first = withValue[0];
  const last = withValue[withValue.length - 1];
  const years = last.year - first.year;
  if (years <= 0 || first.value <= 0 || last.value <= 0) return null;
  return { fromYear: first.year, toYear: last.year, rate: (last.value / first.value) ** (1 / years) - 1 };
}

function MetricChart({ label, color, points, showCagr }: { label: string; color: string; points: MetricPoint[]; showCagr?: boolean }) {
  const values = points.flatMap((p) => [p.projected, p.actual]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  const maxValue = Math.max(0, ...values);
  const minValue = Math.min(0, ...values);
  const range = maxValue - minValue || 1;
  // Headroom above the tallest bar for its bold value label and, above that, the status badge.
  const y = (value: number) => MARGIN.top + 34 + (PLOT_HEIGHT - 34) * (1 - (value - minValue) / range);
  const zeroY = y(0);

  const groupWidth = PLOT_WIDTH / points.length;
  const pairedWidth = Math.min(24, groupWidth * 0.24);
  const soloWidth = Math.min(36, groupWidth * 0.36);
  const gap = 8;
  const ticks = [...new Set([maxValue, 0, minValue])];
  const growth = showCagr ? cagr(points) : null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{label}</strong>
        <Legend color={color} opacity={0.3} label="Projected" />
        <Legend color={color} opacity={1} label="Actual" />
        {growth && (
          <span className="subtle" style={{ fontSize: 13 }}>
            CAGR {growth.fromYear}–{growth.toYear}: <strong style={{ color: 'var(--ink)' }}>{rate(growth.rate)}</strong>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Projected vs actual ${label}`} style={{ width: '100%', height: 'auto' }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--rule)"
              strokeWidth={tick === 0 ? 1.5 : 1}
              opacity={tick === 0 ? 1 : 0.45}
            />
            <text x={MARGIN.left - 10} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11.5} fill="var(--muted)">
              {usdCompact(tick)}
            </text>
          </g>
        ))}
        {points.map((p, index) => {
          const groupX = MARGIN.left + index * groupWidth;
          const centre = groupX + groupWidth / 2;
          const solo = p.projected === null || p.actual === null;
          const headlineValue = p.actual ?? p.projected;
          const headlineTop = headlineValue === null ? zeroY : y(headlineValue);
          const bothTop = Math.min(p.projected !== null ? y(p.projected) : zeroY, p.actual !== null ? y(p.actual) : zeroY);
          return (
            <g key={p.year}>
              <text x={centre} y={HEIGHT - MARGIN.bottom + 22} textAnchor="middle" fontSize={12.5} fill="var(--muted)">
                {p.year}
              </text>
              {p.quartersReported > 0 && (
                <text x={centre} y={HEIGHT - MARGIN.bottom + 36} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {p.quartersReported} of 4 quarters
                </text>
              )}
              {p.projected !== null && (
                <rect
                  x={solo ? centre - soloWidth / 2 : centre - gap / 2 - pairedWidth}
                  y={Math.min(y(p.projected), zeroY)}
                  width={solo ? soloWidth : pairedWidth}
                  height={Math.max(1, Math.abs(y(p.projected) - zeroY))}
                  fill={color}
                  fillOpacity={0.3}
                  rx={3}
                />
              )}
              {p.actual !== null && (
                <rect
                  x={solo ? centre - soloWidth / 2 : centre + gap / 2}
                  y={Math.min(y(p.actual), zeroY)}
                  width={solo ? soloWidth : pairedWidth}
                  height={Math.max(1, Math.abs(y(p.actual) - zeroY))}
                  fill={color}
                  rx={3}
                />
              )}
              {/* One value label per year, on the more interesting figure (the actual, once there is one) — the
                  headline number the whole chart exists to show, so it reads bolder than everything around it. */}
              {headlineValue !== null && (
                <text x={centre} y={headlineValue >= 0 ? headlineTop - 9 : headlineTop + 18} textAnchor="middle" fontSize={13.5} fontWeight={700} fill="var(--ink)">
                  {usdCompact(headlineValue)}
                </text>
              )}
              {p.status && (
                <text x={centre} y={bothTop - 25} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={STATUS_COLOR[p.status]}>
                  {STATUS_LABEL[p.status]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity, display: 'inline-block' }} />
      <span className="subtle">{label}</span>
    </span>
  );
}
