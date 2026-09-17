'use client';

import type { CreateFromIcMemoRequest, CreateFromIcMemoResponse, CreateInvestmentRequest, DocumentInfo, IcMemoExtraction, Investment } from '@nksq/contracts';
import Link from 'next/link';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { emptyIcDraft, IcCaseFields, icDraftFromExtraction, icDraftToInput, IcProjectionPreview, type IcDraft } from '@/components/IcCaseForm';
import { discardUpload, pagesFromSources, PdfUploadPanel } from '@/components/PdfUploadPanel';
import { api } from '@/lib/api';
import { INSTRUMENTS, MONTHS } from '@/lib/format';

const blankInvestment = (): CreateInvestmentRequest => ({
  companyName: '',
  businessSummary: '',
  sector: '',
  geography: '',
  fiscalYearEndMonth: 12,
  instrument: INSTRUMENTS[0],
  dealLead: '',
});

function countFilled(extraction: IcMemoExtraction): number {
  const values = [
    ...Object.values(extraction.investment),
    ...Object.entries(extraction.icCase).filter(([key]) => key !== 'tranches' && key !== 'financials').map(([, value]) => value),
  ];
  return values.filter((value) => value !== null).length + (extraction.icCase.tranches.length ? 1 : 0) + (extraction.icCase.financials.length ? 1 : 0);
}

export default function NewInvestmentPage() {
  const [memo, setMemo] = useState<DocumentInfo | null>(null);
  const [extraction, setExtraction] = useState<IcMemoExtraction | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<CreateInvestmentRequest>(blankInvestment);
  const [includeIc, setIncludeIc] = useState(true);
  const [icDraft, setIcDraft] = useState<IcDraft>(emptyIcDraft);
  const icInput = useMemo(() => icDraftToInput(icDraft), [icDraft]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pages = useMemo(
    () => pagesFromSources(extraction?.sources ?? [], (f) => f.replace(/^icCase\.tranches.*/, 'icCase.tranches').replace(/^icCase\.financials.*/, 'icCase.financials')),
    [extraction],
  );
  const set = <K extends keyof CreateInvestmentRequest>(key: K, value: CreateInvestmentRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onExtracted = useCallback((result: IcMemoExtraction) => {
    setExtraction(result);
    setForm((current) => ({
      companyName: result.investment.companyName ?? current.companyName,
      businessSummary: result.investment.businessSummary ?? current.businessSummary,
      sector: result.investment.sector ?? current.sector,
      geography: result.investment.geography ?? current.geography,
      fiscalYearEndMonth: result.investment.fiscalYearEndMonth ?? current.fiscalYearEndMonth,
      instrument: result.investment.instrument ?? current.instrument,
      dealLead: result.investment.dealLead ?? current.dealLead,
    }));
    setIcDraft(icDraftFromExtraction(result.icCase));
    setIncludeIc(true);
  }, []);

  const onDocument = useCallback((document: DocumentInfo | null) => {
    setMemo(document);
    if (!document) setExtraction(null);
  }, []);

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
        <PdfUploadPanel<IcMemoExtraction>
          category="IC_MEMO"
          readPath="/intake/ic-memo"
          title="IC memo"
          intro="Upload the approved memo. The PDF is saved with the investment."
          dropLabel="Drop the IC memo PDF here, or choose a file"
          readingLabel="Claude is reading the memo. This usually takes under two minutes."
          countFilled={countFilled}
          onDocument={onDocument}
          onExtracted={onExtracted}
          onBusyChange={setBusy}
        >
          {(result) => (result.currency.fxNote ? <p><strong>Currency:</strong> {result.currency.fxNote}</p> : null)}
        </PdfUploadPanel>

        <section className="panel">
          <div className="panel-head">
            <h2>Company and deal</h2>
          </div>
          <div className="panel-body">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label htmlFor="companyName">
                Company name{pages['company.companyName'] ? <span className="src">p. {pages['company.companyName']}</span> : null}
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
          <Link href="/" className="btn btn-ghost" onClick={() => discardUpload(memo)}>
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
