'use client';

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

export interface ConfirmDialogHandle {
  /** Shows the dialog and resolves true (confirmed) or false (cancelled/dismissed). */
  confirm: (options: { title: string; body?: ReactNode; confirmLabel?: string }) => Promise<boolean>;
}

/**
 * A shared danger-confirmation dialog, click-to-confirm (no typing required). Uses the native <dialog> element —
 * a real, clickable part of the page — instead of window.confirm(), which browsers render outside the page and
 * can't be scripted or automated.
 */
export const ConfirmDialog = forwardRef<ConfirmDialogHandle>(function ConfirmDialog(_props, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<{ title: string; body?: ReactNode; confirmLabel: string } | null>(null);

  useImperativeHandle(ref, () => ({
    confirm: (options) =>
      new Promise<boolean>((resolve) => {
        setState({ confirmLabel: 'Delete', ...options });
        resolver.current = resolve;
        // showModal() needs the dialog mounted with its new content first.
        requestAnimationFrame(() => dialogRef.current?.showModal());
      }),
  }));

  function close(result: boolean) {
    dialogRef.current?.close();
    resolver.current?.(result);
    resolver.current = null;
  }

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby="confirm-title" onCancel={() => close(false)}>
      {state && (
        <div className="modal-body">
          <h2 id="confirm-title">{state.title}</h2>
          {state.body}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => close(true)}>
              {state.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
});
