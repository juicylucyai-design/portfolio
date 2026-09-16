'use client';

import type { CreateInvestmentRequest, Investment } from '@nksq/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { MONTHS } from '@/lib/format';

const INSTRUMENTS = ['Preferred equity', 'Common equity', 'SAFE', 'Convertible note', 'Venture debt', 'Fund commitment', 'Other'];

export default function NewInvestmentPage() {
  const [form, setForm] = useState<CreateInvestmentRequest>({
    companyName: '',
    sector: '',
    geography: '',
    fiscalYearEndMonth: 12,
    instrument: INSTRUMENTS[0],
    dealLead: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CreateInvestmentRequest>(key: K, value: CreateInvestmentRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Investment>('/investments', { method: 'POST', body: form });
      window.location.href = `/investment?id=${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the investment.');
      setBusy(false);
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

      <form className="panel" onSubmit={submit} style={{ maxWidth: 760 }}>
        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label htmlFor="companyName">Company name</label>
            <input id="companyName" className="input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} required autoFocus />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="sector">Sector</label>
              <input id="sector" className="input" value={form.sector ?? ''} onChange={(e) => set('sector', e.target.value)} placeholder="e.g. Fintech" />
            </div>
            <div className="field">
              <label htmlFor="geography">Geography</label>
              <input id="geography" className="input" value={form.geography ?? ''} onChange={(e) => set('geography', e.target.value)} placeholder="e.g. India" />
            </div>
            <div className="field">
              <label htmlFor="instrument">Instrument</label>
              <select id="instrument" className="input" value={form.instrument} onChange={(e) => set('instrument', e.target.value)}>
                {INSTRUMENTS.map((instrument) => (
                  <option key={instrument}>{instrument}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dealLead">Deal lead</label>
              <input id="dealLead" className="input" value={form.dealLead ?? ''} onChange={(e) => set('dealLead', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="fiscalYearEndMonth">Fiscal year ends in</label>
              <select
                id="fiscalYearEndMonth"
                className="input"
                value={form.fiscalYearEndMonth}
                onChange={(e) => set('fiscalYearEndMonth', Number(e.target.value))}
              >
                {MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <span className="hint">Used later to match quarterly statements to the annual one.</span>
            </div>
          </div>
          <div className="form-actions">
            <Link href="/" className="btn btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save investment'}
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
