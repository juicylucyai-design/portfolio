'use client';

import type { DeleteInvestmentRequest, DeleteInvestmentResult, DocumentInfo, Investment } from '@nksq/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { fileSize } from '@/lib/format';

/** Danger zone: deletes the investment with every IC version, document and extraction, after typing the name. */
export function DeleteInvestment({ investment, icVersions, closings, documents }: { investment: Investment; icVersions: number; closings: number; documents: DocumentInfo[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bytes = documents.reduce((sum, d) => sum + d.sizeBytes, 0);
  const matches = typed.trim().toLowerCase() === investment.companyName.trim().toLowerCase();

  function open() {
    setTyped('');
    setError(null);
    dialog.current?.showModal();
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const body: DeleteInvestmentRequest = { confirmCompanyName: typed };
      const result = await api<DeleteInvestmentResult>(`/investments/${investment.id}`, { method: 'DELETE', body });
      const params = new URLSearchParams({ deleted: result.companyName, documents: String(result.documentsDeleted), freed: String(result.bytesFreed) });
      window.location.href = `/?${params.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the investment.');
      setBusy(false);
    }
  }

  return (
    <section className="panel danger">
      <div className="panel-head">
        <div>
          <h2>Delete investment</h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            For deals that didn't go ahead or were entered by mistake. Removes the investment, its IC versions, closings and every saved document.
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={open}>
          Delete investment
        </button>
      </div>

      <dialog ref={dialog} className="modal" aria-labelledby="delete-title" onClose={() => setBusy(false)}>
        <form onSubmit={confirm} className="modal-body">
          <h2 id="delete-title">Delete {investment.companyName}?</h2>
          <p>This permanently deletes:</p>
          <ul>
            <li>the investment record</li>
            {closings > 0 && (
              <li>
                {closings} closing{closings === 1 ? '' : 's'} and {closings === 1 ? 'its' : 'their'} expenses
              </li>
            )}
            <li>
              {icVersions} IC version{icVersions === 1 ? '' : 's'} and {icVersions === 1 ? 'its' : 'their'} tranches
            </li>
            <li>
              {documents.length} document{documents.length === 1 ? '' : 's'}
              {documents.length ? ` (${fileSize(bytes)})` : ''} and anything Claude read from them
            </li>
          </ul>
          <p className="subtle">This can't be undone. Download any documents you want to keep first.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label htmlFor="confirmCompanyName">
              Type <strong>{investment.companyName}</strong> to confirm
            </label>
            <input id="confirmCompanyName" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>
              Keep investment
            </button>
            <button type="submit" className="btn btn-danger" disabled={!matches || busy}>
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
