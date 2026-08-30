import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ProviderQuotaDashboard from './ProviderQuotaDashboard';

describe('ProviderQuotaDashboard reset details', () => {
  const environment = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const originalTimezone = environment.TZ;

  beforeAll(() => {
    environment.TZ = 'Asia/Shanghai';
  });

  afterAll(() => {
    if (originalTimezone === undefined) delete environment.TZ;
    else environment.TZ = originalTimezone;
  });

  it('shows concrete local dates for primary and secondary resets next to their countdowns', () => {
    // These UTC instants are 11/15 06:13 and 11/22 04:53 in the local product timezone.
    const markup = renderToStaticMarkup(
      <ProviderQuotaDashboard
        providerName="Codex"
        primaryLabel="5 小时额度"
        secondaryLabel="7 天额度"
        periodCopy="当前周期"
        accentColor="#00a67e"
        density="balanced"
        primary={{
          used: 40,
          limit: 100,
          percent: 40,
          window_duration_mins: 300,
          reset_at_unix: 1_700_000_000,
          remaining_secs: 1_800,
        }}
        secondary={{
          used: 30,
          limit: 100,
          percent: 30,
          window_duration_mins: 10_080,
          reset_at_unix: 1_700_600_000,
          remaining_secs: 604_800,
        }}
      />,
    );

    expect(markup).toContain('30分钟');
    expect(markup).toContain('7天 0小时后重置');
    expect(markup).toContain('11/15 06:13');
    expect(markup).toContain('11/22 04:53');
  });
});
