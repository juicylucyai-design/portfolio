'use client';

import type { Closing, DocumentInfo, IcCase, Investment, Position } from '@nksq/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClosingForm } from '@/components/ClosingForm';
import { DeleteInvestment } from '@/components/DeleteInvestment';
import { IcCaseForm } from '@/components/IcCaseForm';
import { api, documentUrl } from '@/lib/api';
import {
  count,
  date,
  DOCUMENT_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  fileSize,
  MONTHS,
  multiple,
  percent,
  rate,
  STATUS_LABELS,
  usd,
  usdPrecise,
} from '@/lib/format';

export default function InvestmentPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="subtle">Loading…</p>}>
        <InvestmentDetail />
      </Suspense>
    </AppShell>
  );
}

function InvestmentDetail() {
  const id = Number(useSearchParams().get('id'));
  const [investment, setInvestment] = useState<Investment | null>(null);
  const [icCases, setIcCases] = useState<IcCase[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [closingFormOpen, setClosingFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [inv, cases, docs, closingList, pos] = await Promise.all([
      api<Investment>(`/investments/${id}`),
      api<IcCase[]>(`/investments/${id}/ic-cases`),
      api<DocumentInfo[]>(`/investments/${id}/documents`),
      api<Closing[]>(`/investments/${id}/closings`),
      api<Position>(`/investments/${id}/position`),
    ]);
    setInvestment(inv);
    setIcCases(cases);
    setDocuments(docs);
    setClosings(closingList);
    setPosition(pos);
    return cases;
  }, [id]);

  async function deleteClosing(closing: Closing) {
    const docs = documents.filter((d) => d.recordType === 'CLOSING' && d.recordId === closing.id).length;
    const ok = window.confirm(
      `Delete closing ${closing.closingNumber} (${date(closing.closeDate)})${docs ? ` and its ${docs} document${docs === 1 ? '' : 's'}` : ''}? This can't be undone.`,
    );
    if (!ok) return;
    try {
      await api(`/investments/${id}/closings/${closing.id}`, { method: 'DELETE', body: {} });
      setNotice(`Deleted closing ${closing.closingNumber}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the closing.');
    }
  }

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setError('This link is missing an investment id.');
      return;
    }
    load().catch((err: Error) => setError(err.message));
  }, [id, load]);

  if (error) {
    return (
      <>
        <div className="alert alert-error">{error}</div>
        <Link href="/">Back to the portfolio</Link>
      </>
    );
  }
  if (!investment) return <p className="subtle">Loading…</p>;

  const current = icCases[0] ?? null;
  const shown = icCases.find((c) => c.id === selectedId) ?? current;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href="/">Portfolio</Link> / {investment.companyName}
          </div>
          <h1>{investment.companyName}</h1>
          <p className="subtle" style={{ marginTop: 4 }}>
            {[investment.instrument, investment.sector, investment.geography].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`pill ${investment.status}`}>{STATUS_LABELS[investment.status]}</span>
      </div>

      <section className="panel">
        <div className="panel-body">
          <dl className="kv">
            <div><dt>Deal lead</dt><dd>{investment.dealLead ?? '—'}</dd></div>
            <div><dt>Fiscal year ends</dt><dd>{MONTHS[investment.fiscalYearEndMonth - 1]}</dd></div>
            <div><dt>Added</dt><dd>{date(investment.createdAt)}{investment.createdBy ? ` by ${investment.createdBy}` : ''}</dd></div>
            <div><dt>IC versions</dt><dd>{icCases.length}</dd></div>
            <div><dt>Closings</dt><dd>{closings.length}</dd></div>
          </dl>
        </div>
      </section>

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      {closingFormOpen ? (
        <ClosingForm
          investmentId={investment.id}
          icCase={current}
          closings={closings}
          onCancel={() => setClosingFormOpen(false)}
          onSaved={async (result) => {
            setClosingFormOpen(false);
            setNotice(`Saved closing ${result.closing.closingNumber}${result.document ? ' with its document' : ''}. The position below now uses the closing figures.`);
            await load().catch((err: Error) => setError(err.message));
          }}
        />
      ) : (
        !formOpen && (
          <>
            {position && <PositionView position={position} />}
            <ClosingsView
              closings={closings}
              documents={documents}
              onRecord={() => {
                setNotice(null);
                setClosingFormOpen(true);
              }}
              onDelete={deleteClosing}
            />
          </>
        )
      )}

      {closingFormOpen ? null : formOpen ? (
        <IcCaseForm
          investmentId={investment.id}
          previous={current}
          onCancel={() => setFormOpen(false)}
          onSaved={async (saved) => {
            setFormOpen(false);
            setSelectedId(saved.id);
            await load().catch((err: Error) => setError(err.message));
          }}
        />
      ) : !shown ? (
        <section className="panel">
          <div className="empty">
            <h2>No IC approval recorded yet</h2>
            <p>Record what the investment committee approved: the tranches, entry valuation and exit year. Projected IRR and MOIC are calculated from it.</p>
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              Record IC approval
            </button>
          </div>
        </section>
      ) : (
        <IcCaseView icCase={shown} isCurrent={shown.id === current?.id} closed={closings.length > 0} onRevise={() => setFormOpen(true)} />
      )}

      {icCases.length > 0 && !formOpen && !closingFormOpen && (
        <section className="panel">
          <div className="panel-head">
            <h2>IC versions</h2>
            <span className="subtle" style={{ fontSize: 13 }}>Select a version to view it. Earlier versions are never changed.</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Approved</th>
                  <th className="num">Commitment</th>
                  <th className="num">Exit year</th>
                  <th className="num">Proj. MOIC</th>
                  <th className="num">Proj. IRR</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {icCases.map((icCase) => (
                  <tr
                    key={icCase.id}
                    className={`clickable${icCase.id === shown?.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(icCase.id)}
                    aria-selected={icCase.id === shown?.id}
                  >
                    <td>
                      <span className={`tag${icCase.id === current?.id ? ' current' : ''}`}>v{icCase.version}</span>{' '}
                      <span className="subtle" style={{ fontSize: 13 }}>{icCase.id === current?.id ? 'current' : 'superseded'}</span>
                    </td>
                    <td>{date(icCase.approvedOn)}</td>
                    <td className="num">{usd(icCase.commitmentUsd)}</td>
                    <td className="num">{icCase.exitYear}</td>
                    <td className="num">{multiple(icCase.projectedMoic)}</td>
                    <td className="num">{rate(icCase.projectedIrr)}</td>
                    <td>{icCase.createdBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!formOpen && !closingFormOpen && (
        <section className="panel">
          <div className="panel-head">
            <h2>Documents</h2>
            <span className="subtle" style={{ fontSize: 13 }}>
              {documents.length === 0 ? 'None yet' : `${documents.length} · ${fileSize(documents.reduce((sum, d) => sum + d.sizeBytes, 0))}`}
            </span>
          </div>
          {documents.length === 0 ? (
            <div className="panel-body">
              <p className="subtle">No documents saved with this investment. IC memos uploaded on the New investment page appear here.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th className="num">Size</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => {
                    const icVersion = document.recordType === 'IC_CASE' ? icCases.find((c) => c.id === document.recordId)?.version : undefined;
                    const closingNumber = document.recordType === 'CLOSING' ? closings.find((c) => c.id === document.recordId)?.closingNumber : undefined;
                    return (
                      <tr key={document.id}>
                        <td>
                          <a href={documentUrl(document.id)} target="_blank" rel="noreferrer">
                            {document.fileName}
                          </a>
                        </td>
                        <td>
                          {DOCUMENT_CATEGORY_LABELS[document.category]}
                          {icVersion ? <span className="tag" style={{ marginLeft: 6 }}>IC v{icVersion}</span> : null}
                          {closingNumber ? <span className="tag" style={{ marginLeft: 6 }}>Closing {closingNumber}</span> : null}
                        </td>
                        <td className="num">{fileSize(document.sizeBytes)}</td>
                        <td>
                          {date(document.uploadedAt)}
                          {document.uploadedBy ? <span className="subtle"> by {document.uploadedBy}</span> : null}
                        </td>
                        <td className="num">
                          <a className="btn btn-small" href={documentUrl(document.id, true)}>
                            Download
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!formOpen && !closingFormOpen && (
        <DeleteInvestment investment={investment} icVersions={icCases.length} closings={closings.length} documents={documents} />
      )}
    </>
  );
}

function PositionView({ position }: { position: Position }) {
  if (position.basis === 'NONE') return null;
  const fromClosings = position.basis === 'CLOSING';
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>
            Current position <span className={`tag${fromClosings ? ' current' : ''}`}>{fromClosings ? 'From closings' : 'From IC approval'}</span>
          </h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            {fromClosings
              ? `Actual figures from ${position.closingCount} closing${position.closingCount === 1 ? '' : 's'}, which take precedence over the IC approval.`
              : 'No closing recorded yet, so this shows what IC approved. Record the closing to replace it with actual figures.'}
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="stats">
          <div className="stat">
            <span className="label">{fromClosings ? 'Total cost' : 'IC commitment'}</span>
            <span className="value">{usd(position.costUsd)}</span>
            <span className="note">{fromClosings ? `${usd(position.investedUsd)} invested + ${usd(position.expensesUsd)} expenses` : `IC version ${position.icVersion}`}</span>
          </div>
          <div className="stat">
            <span className="label">Ownership</span>
            <span className="value">{percent(position.ownershipPct)}</span>
            <span className="note">{fromClosings ? `${count(position.sharesHeld)} shares` : 'at entry, as approved'}</span>
          </div>
          <div className="stat">
            <span className="label">Projected MOIC</span>
            <span className="value accent">{multiple(position.projectedMoic)}</span>
            <span className="note">{usd(position.projectedProceedsUsd)} at exit</span>
          </div>
          <div className="stat">
            <span className="label">Projected IRR</span>
            <span className="value accent">{rate(position.projectedIrr)}</span>
            <span className="note">{position.exitYear ? `exit 31 Dec ${position.exitYear}` : '—'}</span>
          </div>
        </div>
        {fromClosings && position.icVersion !== null && (
          <p className="subtle" style={{ fontSize: 13 }}>
            Exit assumptions come from IC version {position.icVersion}: company valued at {usd(position.exitValuationUsd)} in {position.exitYear}, {percent(position.dilutionToExitPct)} dilution before exit.
            {position.undrawnCommitmentUsd ? ` ${usd(position.undrawnCommitmentUsd)} of the ${usd(position.icCommitmentUsd)} IC commitment is not yet drawn.` : ''}
          </p>
        )}
        {position.notes.map((note) => (
          <div key={note} className="alert alert-info">{note}</div>
        ))}
      </div>
    </section>
  );
}

function ClosingsView(props: { closings: Closing[]; documents: DocumentInfo[]; onRecord: () => void; onDelete: (closing: Closing) => void }) {
  const { closings, documents } = props;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Closings</h2>
          <p className="subtle" style={{ fontSize: 14 }}>The de facto record of the transaction: shares allotted, amounts paid and expenses.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={props.onRecord}>
          {closings.length ? 'Record another closing' : 'Record closing'}
        </button>
      </div>
      {closings.length === 0 ? (
        <div className="panel-body">
          <p className="subtle">No closing recorded yet. Upload the closing document to capture the actual shares allotted, price and expenses.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Closed</th>
                <th>Security</th>
                <th className="num">Shares</th>
                <th className="num">Price / share</th>
                <th className="num">Invested</th>
                <th className="num">Expenses</th>
                <th className="num">Ownership after</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {closings.map((closing) => {
                const doc = documents.find((d) => d.recordType === 'CLOSING' && d.recordId === closing.id);
                return (
                  <tr key={closing.id}>
                    <td className="mono">
                      {closing.closingNumber}
                      {closing.icTrancheNumber ? <span className="tag" style={{ marginLeft: 6 }}>T{closing.icTrancheNumber}</span> : null}
                    </td>
                    <td>{date(closing.closeDate)}</td>
                    <td>
                      {closing.securityClass ?? '—'}
                      {closing.originalCurrency !== 'USD' && (
                        <div className="subtle" style={{ fontSize: 12 }}>
                          Paid {count(closing.originalAmount)} {closing.originalCurrency} @ {closing.fxRateUsdPerUnit} USD
                        </div>
                      )}
                    </td>
                    <td className="num">{count(closing.sharesAllotted)}</td>
                    <td className="num">{usdPrecise(closing.pricePerShareUsd)}</td>
                    <td className="num">{usd(closing.amountInvestedUsd)}</td>
                    <td className="num" title={closing.expenses.map((e) => `${EXPENSE_CATEGORY_LABELS[e.category]}${e.description ? ` (${e.description})` : ''}: ${usd(e.amountUsd)}`).join('\n')}>
                      {usd(closing.expensesTotalUsd)}
                      {closing.expenses.length > 0 && (
                        <div className="subtle" style={{ fontSize: 12 }}>
                          {closing.expenses.length} line{closing.expenses.length === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td className="num">{percent(closing.ownershipPctAfter)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {doc && (
                        <a className="btn btn-small" href={documentUrl(doc.id)} target="_blank" rel="noreferrer">
                          Document
                        </a>
                      )}{' '}
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => props.onDelete(closing)} aria-label={`Delete closing ${closing.closingNumber}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {closings.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{count(closings.reduce((sum, c) => sum + c.sharesAllotted, 0))}</td>
                  <td />
                  <td className="num">{usd(closings.reduce((sum, c) => sum + c.amountInvestedUsd, 0))}</td>
                  <td className="num">{usd(closings.reduce((sum, c) => sum + c.expensesTotalUsd, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

function IcCaseView({ icCase, isCurrent, closed, onRevise }: { icCase: IcCase; isCurrent: boolean; closed: boolean; onRevise: () => void }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>
            IC case <span className={`tag${isCurrent ? ' current' : ''}`}>v{icCase.version}</span>
          </h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            Approved {date(icCase.approvedOn)}
            {isCurrent ? ' · current version' : ' · superseded by a later version'}
          </p>
        </div>
        {isCurrent && (
          <button type="button" className="btn" onClick={onRevise}>
            Record revised IC
          </button>
        )}
      </div>
      <div className="panel-body">
        {closed && (
          <div className="alert alert-info">
            Closing figures take precedence. This IC approval is kept for reference, and its exit year, exit valuation and dilution are used to project returns on the actual position.
          </div>
        )}
        <div className="stats">
          <div className="stat"><span className="label">Commitment</span><span className="value">{usd(icCase.commitmentUsd)}</span><span className="note">{icCase.tranches.length} tranche{icCase.tranches.length === 1 ? '' : 's'}</span></div>
          <div className="stat"><span className="label">Projected proceeds</span><span className="value">{usd(icCase.projectedProceedsUsd)}</span><span className="note">on 31 Dec {icCase.exitYear}</span></div>
          <div className="stat"><span className="label">Projected MOIC</span><span className="value accent">{multiple(icCase.projectedMoic)}</span></div>
          <div className="stat"><span className="label">Projected IRR</span><span className="value accent">{rate(icCase.projectedIrr)}</span></div>
        </div>

        <dl className="kv">
          <div><dt>Entry post-money valuation</dt><dd>{usd(icCase.entryPostMoneyUsd)}</dd></div>
          <div><dt>Entry ownership</dt><dd>{percent(icCase.entryOwnershipPct)}</dd></div>
          <div><dt>Dilution to exit</dt><dd>{percent(icCase.dilutionToExitPct)}</dd></div>
          <div><dt>Ownership at exit</dt><dd>{percent(icCase.exitOwnershipPct)}</dd></div>
          <div><dt>Valuation at exit</dt><dd>{usd(icCase.exitValuationUsd)}</dd></div>
          <div><dt>Recorded</dt><dd>{date(icCase.createdAt)}{icCase.createdBy ? ` by ${icCase.createdBy}` : ''}</dd></div>
        </dl>

        <div className="table-wrap" style={{ border: '1px solid var(--rule)', borderRadius: 6 }}>
          <table>
            <thead>
              <tr>
                <th>Tranche</th>
                <th className="num">Amount (USD)</th>
                <th>Expected date</th>
                <th>Milestone or condition</th>
              </tr>
            </thead>
            <tbody>
              {icCase.tranches.map((tranche) => (
                <tr key={tranche.trancheNumber}>
                  <td className="mono">T{tranche.trancheNumber}</td>
                  <td className="num">{usd(tranche.amountUsd)}</td>
                  <td>{date(tranche.expectedDate)}</td>
                  <td>{tranche.milestone ?? <span className="subtle">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{usd(icCase.commitmentUsd)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {icCase.notes && (
          <div className="field">
            <span className="eyebrow">Notes</span>
            <p style={{ whiteSpace: 'pre-wrap' }}>{icCase.notes}</p>
          </div>
        )}
      </div>
    </section>
  );
}
