"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Accessible confirmation dialog: focus moves to the confirm button, Escape
 * cancels, and the overlay is a labelled dialog.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-[420px] animate-sheet-up rounded-[20px] border border-line bg-canvas p-5 shadow-lift"
      >
        <h2 id="confirm-title" className="display text-[22px] leading-tight text-ink">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line bg-surface px-4 py-2.5 text-[13px] font-medium text-ink2 transition hover:border-line-strong"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60 ${
              danger ? "bg-danger hover:bg-danger/90" : "bg-ink hover:bg-ink2"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
