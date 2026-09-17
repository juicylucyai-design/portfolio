'use client';

import type { DocumentCategory, DocumentInfo, IntakeStatus } from '@nksq/contracts';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { api, documentUrl, uploadDocument } from '@/lib/api';
import { fileSize } from '@/lib/format';

export interface ExtractionResult {
  sources: { field: string; page: number | null; quote: string }[];
  warnings: string[];
}

type Phase = 'none' | 'uploading' | 'reading' | 'read' | 'not-read';

/** Maps a source field path to the first page it was read from, for "p. 7" tags beside labels. */
export function pagesFromSources(sources: ExtractionResult['sources'], rename: (field: string) => string = (f) => f): Record<string, number> {
  const pages: Record<string, number> = {};
  for (const source of sources) {
    const field = rename(source.field);
    if (source.page && !pages[field]) pages[field] = source.page;
  }
  return pages;
}

/**
 * Upload a PDF, have Claude read it, and hand the result to the page. The upload is stored straight away
 * but only saved with an investment when the page saves; "Remove" throws it away.
 */
export function PdfUploadPanel<T extends ExtractionResult>(props: {
  category: DocumentCategory;
  readPath: string;
  title: string;
  intro: string;
  dropLabel: string;
  /** File types this drop zone accepts. Defaults to PDF only. */
  accept?: 'pdf' | 'pdf-or-email';
  readingLabel: string;
  countFilled: (result: T) => number;
  onDocument: (document: DocumentInfo | null) => void;
  onExtracted: (result: T) => void;
  onBusyChange?: (busy: boolean) => void;
  children?: (result: T) => ReactNode;
}) {
  const accept = props.accept ?? 'pdf';
  const { onBusyChange } = props;
  const [intake, setIntake] = useState<IntakeStatus | null>(null);
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('none');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<IntakeStatus>('/intake/status').then(setIntake).catch(() => setIntake({ configured: false, model: '', reader: 'api' }));
  }, []);

  const busy = phase === 'uploading' || phase === 'reading';
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  function setDoc(next: DocumentInfo | null) {
    setDocument(next);
    props.onDocument(next);
  }

  async function read(target: DocumentInfo) {
    setPhase('reading');
    setError(null);
    try {
      const extracted = await api<T>(props.readPath, { method: 'POST', body: { documentId: target.id } });
      setResult(extracted);
      props.onExtracted(extracted);
      setPhase('read');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claude could not read the document.');
      setPhase('not-read');
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (document) await api(`/uploads/${document.id}`, { method: 'DELETE' }).catch(() => undefined);
    setDoc(null);
    setResult(null);
    setPhase('uploading');
    try {
      const uploaded = await uploadDocument(file, props.category);
      setDoc(uploaded);
      if (intake?.configured) await read(uploaded);
      else setPhase('not-read');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('none');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove() {
    if (document) await api(`/uploads/${document.id}`, { method: 'DELETE' }).catch(() => undefined);
    setDoc(null);
    setResult(null);
    setError(null);
    setPhase('none');
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0]);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{props.title}</h2>
          <p className="subtle" style={{ fontSize: 14 }}>
            {props.intro} {intake?.configured ? 'Claude reads it and fills in the form below.' : ''}
          </p>
        </div>
      </div>
      <div className="panel-body">
        {intake && !intake.configured && (
          <div className="alert alert-info">
            {intake.reader === 'claude-code'
              ? "Claude Code from the Claude desktop app wasn't found on this computer, so documents can't be read automatically. You can still upload the PDF and fill in the form yourself."
              : "Reading documents automatically isn't switched on (the server needs ANTHROPIC_API_KEY). You can still upload the PDF and fill in the form yourself."}
          </div>
        )}
        {intake?.configured && intake.reader === 'claude-code' && (
          <p className="subtle" style={{ fontSize: 13, margin: 0 }}>
            Local testing: documents are read by Claude Code on this computer using your Claude sign-in, not the API key.
          </p>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {!document && phase !== 'uploading' ? (
          <label
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInput}
              id={`upload-${props.category}`}
              type="file"
              accept={accept === 'pdf-or-email' ? 'application/pdf,.pdf,message/rfc822,.eml' : 'application/pdf,.pdf'}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <strong>{props.dropLabel}</strong>
            <span className="subtle">{accept === 'pdf-or-email' ? 'PDF or email (.eml)' : 'PDF'}, up to 20 MB</span>
          </label>
        ) : (
          <div className="file-card">
            <span className="file-icon" aria-hidden="true">{document?.fileName.toLowerCase().endsWith('.eml') ? 'EML' : 'PDF'}</span>
            <div style={{ minWidth: 0 }}>
              <div className="file-name">{document?.fileName ?? 'Uploading…'}</div>
              <div className="subtle" style={{ fontSize: 13 }}>
                {document ? fileSize(document.sizeBytes) : ''}
                {phase === 'uploading' && 'Uploading…'}
                {phase === 'reading' && ` · ${props.readingLabel}`}
                {phase === 'read' && result && ` · Filled in ${props.countFilled(result)} fields. Check them before saving.`}
                {phase === 'not-read' && ' · Saved when you save.'}
              </div>
            </div>
            <div className="file-actions">
              {busy && <span className="spinner" aria-label="Working" />}
              {document && (
                <a className="btn btn-small" href={documentUrl(document.id)} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
              {document && phase === 'not-read' && intake?.configured && (
                <button type="button" className="btn btn-small" onClick={() => void read(document)}>
                  Read again
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void remove()} disabled={busy}>
                Remove
              </button>
            </div>
          </div>
        )}

        {result && phase === 'read' && (
          <div className="extraction-notes">
            {props.children?.(result)}
            {result.warnings.length > 0 && (
              <div className="alert alert-info">
                <strong>Check these</strong>
                <ul>
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.sources.length > 0 && (
              <details>
                <summary>Where each value came from ({result.sources.length})</summary>
                <table>
                  <tbody>
                    {result.sources.map((source, index) => (
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
  );
}

/** Discards an unsaved upload, e.g. when the person cancels the form. */
export function discardUpload(document: DocumentInfo | null) {
  if (document && document.investmentId === null) void api(`/uploads/${document.id}`, { method: 'DELETE' }).catch(() => undefined);
}
