import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BankedResets, ResetCredit } from '../types';
import ResetPanel from './ResetPanel';

const later = Date.parse('2026-12-15T08:30:00Z') / 1000;
const earlier = Date.parse('2026-11-15T08:30:00Z') / 1000;

function credit(expires_at: number | null, status = 'available'): ResetCredit {
  return { id: `${status}-${expires_at}`, status, expires_at, granted_at: 0, title: null, description: null };
}

function render(credits: ResetCredit[], available: number | null = 2) {
  const banked: BankedResets = { credits, available, lifetime_used: 0, last_reset_at: null };
  return renderToStaticMarkup(<ResetPanel banked={banked} embedded compact />);
}

describe('ResetPanel credit expiry', () => {
  it('shows the earliest available expiry in compact mode, ignoring consumed credits', () => {
    const markup = render([credit(later), credit(earlier), credit(earlier - 86400, 'redeemed')]);
    expect(markup).toContain('最早过期');
    expect(markup).toContain('dateTime="2026-11-15T08:30:00.000Z"');
    expect(markup).not.toContain('dateTime="2026-11-14');
  });

  it('renders a concrete local date and time for a single credit', () => {
    const markup = render([credit(earlier)], 1);
    const formatted = new Date(earlier * 1000).toLocaleString([], {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    expect(markup).toContain('过期时间');
    expect(markup).toContain(formatted);
    expect(markup).not.toContain('最早过期');
  });

  it('does not guess an expiry when details are missing', () => {
    expect(render([])).toContain('过期时间未提供');
    expect(render([], null)).toContain('过期时间未提供');
  });

  it('ignores absent, invalid and out-of-range timestamps without crashing', () => {
    const markup = render([
      credit(null), credit(0), credit(-1), credit(NaN), credit(Infinity), credit(1e20),
    ]);
    expect(markup).toContain('过期时间未提供');
    expect(markup).not.toContain('<time');
  });

  it('hides expiry details when there are no available credits', () => {
    expect(render([credit(earlier)], 0)).not.toContain('reset-expiry');
  });
});
