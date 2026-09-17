'use client';

import type { CapitalEventExtraction, CapitalEventInput, CapitalEventType, DocumentInfo, SaveCapitalEventRequest, SaveCapitalEventResponse } from '@nksq/contracts';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { discardUpload, pagesFromSources, PdfUploadPanel } from '@/components/PdfUploadPanel';
import { api } from '@/lib/api';
import { CAPITAL_EVENT_TYPE_LABELS, groupDigits, parseAmount } from '@/lib/format';

interface Draft {
  eventType: CapitalEventType;
  eventDate: string;
  sellingParty: string;
  buyingParty: string;
  securityClass: string;
  shares: string;
  pricePerShareUsd: string;
  totalConsiderationUsd: string;
  impliedValuationUsd: string;
  deadlineDate: string;
  notes: string;
}

const toText = (value: number | null) => (value === null ? '' : groupDigits(String(value)));

function emptyDraft(): Draft {
  return {
    eventType: 'SECONDARY_TRANSACTION',
    eventDate: new Date().toISOString().slice(0, 10),
    sellingParty: '',
    buyingParty: '',
    securityClass: '',
    shares: '',
    pricePerShareUsd: '',
    totalConsiderationUsd: '',
    impliedValuationUsd: '',
    deadlineDate: '',
    notes: '',
  };
}

function draftFromExtraction(extracted: CapitalEventExtraction['capitalEvent'], fallback: Draft): Draft {
  return {
    eventType: extracted.eventType ?? fallback.eventType,
    eventDate: extracted.eventDate ?? fallback.eventDate,
    sellingParty: extracted.sellingParty ?? '',
    buyingParty: extracted.buyingParty ?? '',
    securityClass: extracted.securityClass ?? '',
    shares: toText(extracted.shares),
    pricePerShareUsd: toText(extracted.pricePerShareUsd),
    totalConsiderationUsd: toText(extracted.totalConsiderationUsd),
    impliedValuationUsd: toText(extracted.impliedValuationUsd),
    deadlineDate: extracted.deadlineDate ?? '',
    notes: extracted.notes ?? '',
  };
}

function toInput(draft: Draft): CapitalEventInput | null {
  if (!draft.eventDate) return null;
  return {
    eventType: draft.eventType,
    eventDate: draft.eventDate,
    sellingParty: draft.sellingParty.trim() || null,
    buyingParty: draft.buyingParty.trim() || null,
    securityClass: draft.securityClass.trim() || null,
    shares: parseAmount(draft.shares),
    pricePerShareUsd: parseAmount(draft.pricePerShareUsd),
    totalConsiderationUsd: parseAmount(draft.totalConsiderationUsd),
    impliedValuationUsd: parseAmount(draft.impliedValuationUsd),
    deadlineDate: draft.deadlineDate || null,
    notes: draft.notes.trim() || null,
  };
}

function countFilled(extraction: CapitalEventExtraction): number {
  return Object.values(extraction.capitalEvent).filter((v) => v !== null).length;
}

function Field({ id, label, page, hint, children }: { id: string; label: string; page?: number; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {page ? <span className="src">p. {page}</span> : null}
      </label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function CapitalEventForm(props: { investmentId: number; nextEventNumber: number; onSaved: (result: SaveCapitalEventResponse) => void; onCancel: () => void }) {
  const { investmentId } = props;
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [extraction, setExtraction] = useState<CapitalEventExtraction | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const input = toInput(draft);
  const pages = pagesFromSources(extraction?.sources ?? [], (f) => f.replace(/^capitalEvent\./, ''));

  const onExtracted = useCallback((result: CapitalEventExtraction) => {
    setExtraction(result);
    setDraft((current) => draftFromExtraction(result.capitalEvent, current));
  }, []);

  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input) {
      setError('Enter at least the event date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: SaveCapitalEventRequest = { documentId: document?.id ?? null, capitalEvent: input };
      props.onSaved(await api<SaveCapitalEventResponse>(`/investments/${investmentId}/capital-events`, { method: 'POST', body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the capital event.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
      <PdfUploadPanel<CapitalEventExtraction>
        category="CAPITAL_EVENT"
        readPath="/intake/capital-event"
        title={`Record capital event ${props.nextEventNumber}`}
        intro="Upload the notice — often an email from the portfolio company (a ROFR notice, secondary transaction, valuation update, dividend or capital call) — or record it by hand below. The file is kept as evidence."
        dropLabel="Drop the email (.eml) or PDF here, or choose a file"
        accept="pdf-or-email"
        readingLabel="Claude is reading the notice. This usually takes under two minutes."
        countFilled={countFilled}
        onDocument={setDocument}
        onExtracted={onExtracted}
        onBusyChange={setBusy}
      />

      <section className="panel">
        <div className="panel-head">
          <h2>Event details</h2>
          <span className="subtle" style={{ fontSize: 13 }}>All amounts in USD</span>
        </div>
        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
            <div className="grid-3">
              <Field id="eventType" label="Event type">
                <select id="eventType" className="input" value={draft.eventType} onChange={(e) => set('eventType', e.target.value as CapitalEventType)}>
                  {Object.entries(CAPITAL_EVENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="eventDate" label="Event date" page={pages['eventDate']}>
                <input id="eventDate" type="date" className="input" value={draft.eventDate} onChange={(e) => set('eventDate', e.target.value)} required />
              </Field>
              <Field id="deadlineDate" label="Response deadline (if any)" page={pages['deadlineDate']} hint="E.g. a ROFR exercise window.">
                <input id="deadlineDate" type="date" className="input" value={draft.deadlineDate} onChange={(e) => set('deadlineDate', e.target.value)} />
              </Field>
            </div>

            <div className="grid-3">
              <Field id="sellingParty" label="Selling party" page={pages['sellingParty']}>
                <input id="sellingParty" className="input" value={draft.sellingParty} onChange={(e) => set('sellingParty', e.target.value)} />
              </Field>
              <Field id="buyingParty" label="Buying party" page={pages['buyingParty']}>
                <input id="buyingParty" className="input" value={draft.buyingParty} onChange={(e) => set('buyingParty', e.target.value)} />
              </Field>
              <Field id="securityClass" label="Security" page={pages['securityClass']}>
                <input id="securityClass" className="input" value={draft.securityClass} onChange={(e) => set('securityClass', e.target.value)} placeholder="e.g. Series A Preferred Shares" />
              </Field>
            </div>

            <div className="grid-3">
              <Field id="shares" label="Shares" page={pages['shares']}>
                <input id="shares" className="input num" inputMode="decimal" value={draft.shares} onChange={(e) => set('shares', groupDigits(e.target.value))} />
              </Field>
              <Field id="pricePerShareUsd" label="Price per share (USD)" page={pages['pricePerShareUsd']}>
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="pricePerShareUsd" className="input num" inputMode="decimal" value={draft.pricePerShareUsd} onChange={(e) => set('pricePerShareUsd', e.target.value)} />
                </div>
              </Field>
              <Field id="totalConsiderationUsd" label="Total consideration (USD)" page={pages['totalConsiderationUsd']}>
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="totalConsiderationUsd" className="input num" inputMode="decimal" value={draft.totalConsiderationUsd} onChange={(e) => set('totalConsiderationUsd', groupDigits(e.target.value))} />
                </div>
              </Field>
              <Field
                id="impliedValuationUsd"
                label="Implied valuation (USD)"
                page={pages['impliedValuationUsd']}
                hint="Marks the investment's current valuation once this is more recent than the latest closing."
              >
                <div className="input-affix">
                  <span className="pre">$</span>
                  <input id="impliedValuationUsd" className="input num" inputMode="decimal" value={draft.impliedValuationUsd} onChange={(e) => set('impliedValuationUsd', groupDigits(e.target.value))} />
                </div>
              </Field>
            </div>

            <Field id="notes" label="Notes" page={pages['notes']}>
              <textarea id="notes" className="input" value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Summary of the notice, anything unusual" />
            </Field>
          </fieldset>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                discardUpload(document);
                props.onCancel();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || busy || !input}>
              {saving ? 'Saving…' : 'Save capital event'}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
