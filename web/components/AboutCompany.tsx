'use client';

import type { Investment, UpdateBusinessSummaryRequest } from '@nksq/contracts';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { date, MONTHS } from '@/lib/format';

/**
 * One compact strip at the top of an investment: what the company does, with the deal facts on a single line.
 * The summary is read from the IC memo when the investment is created, and can be edited here.
 */
export function AboutCompany({ investment, onSaved }: { investment: Investment; onSaved: (investment: Investment) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(investment.businessSummary ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facts = [
    investment.instrument,
    investment.sector,
    investment.geography,
    investment.dealLead ? `Lead: ${investment.dealLead}` : null,
    `FY ends ${MONTHS[investment.fiscalYearEndMonth - 1]}`,
    `Added ${date(investment.createdAt)}${investment.createdBy ? ` by ${investment.createdBy}` : ''}`,
  ].filter(Boolean);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: UpdateBusinessSummaryRequest = { businessSummary: text.trim() || null };
      onSaved(await api<Investment>(`/investments/${investment.id}/summary`, { method: 'PUT', body }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the summary.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="about">
      {editing ? (
        <form onSubmit={save} className="about-edit">
          <label htmlFor="businessSummary" className="eyebrow">
            What the company does
          </label>
          <textarea
            id="businessSummary"
            className="input"
            rows={3}
            value={text}
            maxLength={2000}
            autoFocus
            placeholder="Two or three sentences: what it sells, to whom, and its scale."
            onChange={(e) => setText(e.target.value)}
          />
          {error && <div className="alert alert-error">{error}</div>}
          <div className="about-actions">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setText(investment.businessSummary ?? '');
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-small btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save summary'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className={investment.businessSummary ? 'about-summary' : 'about-summary subtle'}>
            {investment.businessSummary ?? 'No description of the company yet. Add a couple of sentences, or upload an IC memo and Claude fills this in.'}
          </p>
          <button type="button" className="btn btn-ghost btn-small about-edit-button" onClick={() => setEditing(true)}>
            {investment.businessSummary ? 'Edit' : 'Add'}
          </button>
        </>
      )}
      <p className="about-facts">
        {facts.map((fact, index) => (
          <span key={fact as string}>
            {index > 0 && <span aria-hidden="true"> · </span>}
            {fact}
          </span>
        ))}
      </p>
    </section>
  );
}
