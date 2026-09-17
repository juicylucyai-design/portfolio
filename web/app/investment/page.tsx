'use client';

import type { DocumentInfo, IcCase, Investment } from '@nksq/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DeleteInvestment } from '@/components/DeleteInvestment';
import { IcCaseForm } from '@/components/IcCaseForm';
import { api, documentUrl } from '@/lib/api';
import { date, DOCUMENT_CATEGORY_LABELS, fileSize, MONTHS, multiple, percent, rate, STATUS_LABELS, usd } from '@/lib/format';

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [inv, cases, docs] = await Promise.all([
      api<Investment>(`/investments/${id}`),
      api<IcCase[]>(`/investments/${id}/ic-cases`),
      api<DocumentInfo[]>(`/investments/${id}/documents`),
    ]);
    setInvestment(inv);
    setIcCases(cases);
    setDocuments(docs);
    return cases;
  }, [id]);

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
          </dl>
        </div>
      </section>

      {formOpen ? (
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
        <IcCaseView icCase={shown} isCurrent={shown.id === current?.id} onRevise={() => setFormOpen(true)} />
      )}

      {icCases.length > 0 && !formOpen && (
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

      {!formOpen && (
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

      {!formOpen && <DeleteInvestment investment={investment} icVersions={icCases.length} documents={documents} />}
    </>
  );
}

function IcCaseView({ icCase, isCurrent, onRevise }: { icCase: IcCase; isCurrent: boolean; onRevise: () => void }) {
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
