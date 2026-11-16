/**
 * Shared surface primitives. Everything routes through the tokens in
 * tailwind.config.js so screens stay visually consistent.
 */

export const inputClass =
  "mt-1 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 outline-none transition focus:border-ink/30 focus:ring-4 focus:ring-ink/5";

export const labelClass = "block text-[13px] font-medium text-ink2";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[15px] font-semibold text-canvas transition hover:bg-ink2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-canvas focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-50";

export const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink2 transition hover:bg-ink/[0.05] disabled:opacity-50";

export const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-3.5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-50";

export const cardClass = "rounded-[18px] border border-line bg-surface";

export const authShellClass =
  "flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-6";

/** Small uppercase label used above sections and in cards. */
export const eyebrowClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

/** 1px hairline divider that matches the warm palette. */
export const dividerClass = "border-t border-line";
