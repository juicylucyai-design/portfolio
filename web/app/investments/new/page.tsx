'use client';

import type {
  CreateFromIcMemoRequest,
  CreateFromIcMemoResponse,
  CreateInvestmentRequest,
  DocumentInfo,
  IcMemoExtraction,
  IntakeStatus,
  Investment,
} from '@nksq/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { emptyIcDraft, IcCaseFields, icDraftFromExtraction, icDraftToInput, IcProjectionPreview, type IcDraft } from '@/components/IcCaseForm';
import { api, documentUrl, uploadPdf } from '@/lib/api';
import { fileSize, INSTRUMENTS, MONTHS } from '@/lib/format';

type MemoPhase = 'none' | 'uploading' | 'reading' | 'read' | 'not-read';

const blankInvestment = (): CreateInvestmentRequest => ({
  companyName: '',
  sector: '',
  geography: '',
  fiscalYearEndMonth: 12,
  instrument: INSTRUMENTS[0],
  dealLead: '',
});

function countFilled(extraction: IcMemoExtraction): number {
  const values = [
    ...Object.values(extraction.investment),
    ...Object.entries(extraction.icCase).filter(([key]) => key !== 'tranches').map(([, value]) => value),
  ];
  return values.filter((value) => value !== null).length + (extraction.icCase.tranches.length ? 1 : 0);
}

export default function NewInvestmentPage() {
  const [intake, setIntake] = useState<IntakeStatus | null>(null);
  const [memo, setMemo] = useState<DocumentInfo | null>(null);
  const [phase, setPhase] = useState<MemoPhase>('none');
  const [memoError, setMemoError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<IcMemoExtraction | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateInvestmentRequest>(blankInvestment);
  const [includeIc, setIncludeIc] = useState(true);
  const [icDraft, setIcDraft] = useState<IcDraft>(emptyIcDraft);
  const icInput = useMemo(() => icDraftToInput(icDraft), [icDraft]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<IntakeStatus>('/intake/status').then(setIntake).catch(() => setIntake({ configured: false, model: '' }));
  }, []);

  const pages = useMemo(() => {
    const map: Record<string, number> = {};
    for (const source of extraction?.sources ?? []) {
      const field = source.field.replace(/^icCase\.tranches.*/, 'icCase.tranches').replace(/^company\./, 'investment.');
      if (source.page && !map[field]) map[field] = source.page;
    }
    return map;
  }, [extraction]);

  const set = <K extends keyof CreateInvestmentRequest>(key: K, value: CreateInvestmentRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function readMemo(document: DocumentInfo) {
    setPhase('reading');
    setMemoError(null);
    try {
      const result = await api<IcMemoExtraction>('/intake/ic-memo', { method: 'POST', body: { documentId: document.id } });
      setExtraction(result);
      setForm((current) => ({
        companyName: result.investment.companyName ?? current.companyName,
        sector: result.investment.sector ?? current.sector,
        geography: result.investment.geography ?? current.geography,
        fiscalYearEndMonth: result.investment.fiscalYearEndMonth ?? current.fiscalYearEndMonth,
        instrument: result.investment.instrument ?? current.instrument,
        dealLead: result.investment.dealLead ?? current.dealLead,
      }));
      setIcDraft(icDraftFromExtraction(result.icCase));
      setIncludeIc(true);
      setPhase('read');
    } catch (err) {
      setMemoError(err instanceof Error ? err.message : 'Claude could not read the memo.');
      setPhase('not-read');
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setMemoError(null);
    setError(null);
    if (memo) await api(`/uploads/${memo.id}`, { method: 'DELETE' }).catch(() => undefined);
    setMemo(null);
    setExtraction(null);
    setPhase('uploading');
    try {
      const uploaded = await uploadPdf(file, 'IC_MEMO');
      setMemo(uploaded);
      if (intake?.configured) {
        await readMemo(uploaded);
      } else {
        setPhase('not-read');
      }
    } catch (err) {
      setMemoError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('none');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removeMemo() {
    if (memo) await api(`/uploads/${memo.id}`, { method: 'DELETE' }).catch(() => undefined);
    setMemo(null);
    setExtraction(null);
    setMemoError(null);
    setPhase('none');
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files[0]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (memo && includeIc && !icInput) {
      setError('Fill in every IC amount, percentage and tranche date, or untick "Record the IC approval".');
      return;
    }
    setSaving(true);
    try {
      let investmentId: number;
      if (memo) {
        const body: CreateFromIcMemoRequest = { documentId: memo.id, investment: form, icCase: includeIc ? icInput : null };
        investmentId = (await api<CreateFromIcMemoResponse>('/investments/from-ic-memo', { method: 'POST', body })).investment.id;
      } else {
        investmentId = (await api<Investment>('/investments', { method: 'POST', body: form })).id;
      }
      window.location.href = `/investment?id=${investmentId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the investment.');
      setSaving(false);
    }
  }

  const busy = phase === 'uploading' || phase === 'reading';

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href="/">Portfolio</Link> / New
          </div>
          <h1>New investment</h1>
        </div>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gap: 20, maxWidth: 920 }}>
        {/* ---------- IC memo ---------- */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>IC memo</h2>
              <p className="subtle" style={{ fontSize: 14 }}>
                {intake?.configured
                  ? 'Upload the approved memo and Claude fills in the form below. The PDF is saved with the investment.'
                  : 'Upload the approved memo to keep it with the investment.'}
              </p>
            </div>
          </div>
          <div className="panel-body">
            {intake && !intake.configured && (
              <div className="alert alert-info">Reading memos automatically isn't switched on yet (the server needs ANTHROPIC_API_KEY). You can still upload the PDF and fill in the form yourself.</div>
            )}
            {memoError && <div className="alert alert-error">{memoError}</div>}

            {!memo && phase !== 'uploading' ? (
              <label
                className={`dropzone${dragging ? ' dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input ref={fileInput} id="icMemoFile" type="file" accept="application/pdf,.pdf" onChange={(e) => void chooseFile(e.target.files?.[0])} />
                <strong>Drop the IC memo PDF here, or choose a file</strong>
                <span className="subtle">PDF, up to 20 MB</span>
              </label>
            ) : (
              <div className="file-card">
                <span className="file-icon" aria-hidden="true">PDF</span>
                <div style={{ minWidth: 0 }}>
                  <div className="file-name">{memo?.fileName ?? 'Uploading…'}</div>
                  <div className="subtle" style={{ fontSize: 13 }}>
                    {memo ? fileSize(memo.sizeBytes) : ''}
                    {phase === 'uploading' && 'Uploading…'}
                    {phase === 'reading' && ' · Claude is reading the memo. This usually takes under two minutes.'}
                    {phase === 'read' && extraction && ` · Filled in ${countFilled(extraction)} fields. Check them before saving.`}
                    {phase === 'not-read' && ' · Saved when you save the investment.'}
                  </div>
                </div>
                <div className="file-actions">
                  {busy && <span className="spinner" aria-label="Working" />}
                  {memo && (
                    <a className="btn btn-small" href={documentUrl(memo.id)} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  )}
                  {memo && phase === 'not-read' && intake?.configured && (
                    <button type="button" className="btn btn-small" onClick={() => void readMemo(memo)}>
                      Read again
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void removeMemo()} disabled={busy}>
                    Remove
                  </button>
                </div>
              </div>
            )}

            {extraction && phase === 'read' && (
              <div className="extraction-notes">
                {extraction.currency.fxNote && <p><strong>Currency:</strong> {extraction.currency.fxNote}</p>}
                {extraction.warnings.length > 0 && (
                  <div className="alert alert-info">
                    <strong>Check these</strong>
                    <ul>
                      {extraction.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extraction.sources.length > 0 && (
                  <details>
                    <summary>Where each value came from ({extraction.sources.length})</summary>
                    <table>
                      <tbody>
                        {extraction.sources.map((source, index) => (
                          <tr key={index}>
                            <td className="mono">{source.field}</td>
                            <td className="num">{source.page ? `p. ${source.page}` : '—'}</td>
                            <td>“{source.quote}”</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Company and deal ---------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>Company and deal</h2>
          </div>
          <div className="panel-body">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label htmlFor="companyName">
                Company name{pages['investment.companyName'] ? <span className="src">p. {pages['investment.companyName']}</span> : null}
              </label>
              <input id="companyName" className="input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} required disabled={busy} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sector">Sector</label>
                <input id="sector" className="input" value={form.sector ?? ''} onChange={(e) => set('sector', e.target.value)} placeholder="e.g. Fintech" disabled={busy} />
              </div>
              <div className="field">
                <label htmlFor="geography">Geography</label>
                <input id="geography" className="input" value={form.geography ?? ''} onChange={(e) => set('geography', e.target.value)} placeholder="e.g. India" disabled={busy} />
              </div>
              <div className="field">
                <label htmlFor="instrument">Instrument</label>
                <select id="instrument" className="input" value={form.instrument} onChange={(e) => set('instrument', e.target.value)} disabled={busy}>
                  {INSTRUMENTS.map((instrument) => (
                    <option key={instrument}>{instrument}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dealLead">Deal lead</label>
                <input id="dealLead" className="input" value={form.dealLead ?? ''} onChange={(e) => set('dealLead', e.target.value)} disabled={busy} />
              </div>
              <div className="field">
                <label htmlFor="fiscalYearEndMonth">Fiscal year ends in</label>
                <select id="fiscalYearEndMonth" className="input" value={form.fiscalYearEndMonth} onChange={(e) => set('fiscalYearEndMonth', Number(e.target.value))} disabled={busy}>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
                <span className="hint">Used later to match quarterly statements to the annual one.</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- IC approval (only with a memo) ---------- */}
        {memo && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>IC approval</h2>
                <p className="subtle" style={{ fontSize: 14 }}>Saved as version 1 of the IC case, linked to this memo.</p>
              </div>
              <label className="check" htmlFor="includeIc">
                <input id="includeIc" type="checkbox" checked={includeIc} onChange={(e) => setIncludeIc(e.target.checked)} />
                Record the IC approval
              </label>
            </div>
            {includeIc && (
              <div className="panel-body">
                <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
                  <IcCaseFields draft={icDraft} onChange={setIcDraft} pages={pages} />
                </fieldset>
                <IcProjectionPreview input={icInput} stated={extraction?.statedReturns} />
              </div>
            )}
          </section>
        )}

        <div className="form-actions">
          <Link href="/" className="btn btn-ghost" onClick={() => void (memo && api(`/uploads/${memo.id}`, { method: 'DELETE' }).catch(() => undefined))}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving || busy}>
            {saving ? 'Saving…' : 'Save investment'}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
