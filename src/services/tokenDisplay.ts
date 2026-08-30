export type TokenCount = number | null | undefined;

/**
 * Format a token count for people: decimal millions, never k or a raw integer.
 * Raw token counts remain numbers in the business layer; this is display-only.
 */
export function formatTokenM(value: TokenCount): string {
  if (value == null || !Number.isFinite(value)) return '—';

  const tokens = Math.max(0, Math.floor(value));
  if (tokens === 0) return '0.000M';
  if (tokens < 1_000) return '<0.001M';

  const millions = Number((tokens / 1_000_000).toFixed(3));
  return `${millions.toFixed(3).replace(/\.?(0+)$/, '')}M`;
}

/** Preserve an exact, comma-separated integer for title/aria metadata. */
export function formatTokenExact(value: TokenCount): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.max(0, Math.floor(value)).toLocaleString('en-US')} Token`;
}

/** Keep the Token unit in visible labels where the surrounding copy needs it. */
export function formatTokenWithUnit(value: TokenCount): string {
  const display = formatTokenM(value);
  return display === '—' ? display : `${display} Token`;
}
