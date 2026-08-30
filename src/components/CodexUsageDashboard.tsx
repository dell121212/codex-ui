import type { BankedResets, PeriodUsage, WindowUsage } from '../types';
import { isWindowMissing, windowDurationLabel } from '../services/usageLogic';
import ProviderQuotaDashboard, { type DashboardDensity } from './ProviderQuotaDashboard';
import ResetPanel from './ResetPanel';

interface Props {
  shortWindow?: WindowUsage;
  weeklyWindow?: WindowUsage;
  source?: string;
  density?: DashboardDensity;
  bankedResets?: BankedResets;
  currentLocal?: PeriodUsage;
  previousLocal?: PeriodUsage;
}

export default function CodexUsageDashboard({
  shortWindow,
  weeklyWindow,
  source,
  density = 'detail',
  bankedResets,
  currentLocal,
  previousLocal,
}: Props) {
  const shortAvailable = !isWindowMissing(shortWindow);
  const weeklyAvailable = !isWindowMissing(weeklyWindow);
  // OpenAI documents the rolling five-hour window as the base Codex allowance;
  // weekly limits may additionally apply. Prefer 5h when both are returned,
  // but keep weekly-only rollouts honest instead of inventing a missing window.
  const main = shortAvailable ? shortWindow! : weeklyAvailable ? weeklyWindow! : null;
  const secondary = shortAvailable && weeklyAvailable ? weeklyWindow! : null;
  return (
    <ProviderQuotaDashboard
      providerName="OpenAI Codex"
      source={source?.includes('app-server') ? undefined : source}
      primary={main ?? undefined}
      secondary={secondary ?? undefined}
      primaryLabel={main ? `官方额度 · ${windowDurationLabel(main, '当前窗口')}` : '官方额度'}
      secondaryLabel={secondary ? `官方额度 · ${windowDurationLabel(secondary, '周额度')}` : '周官方额度'}
      periodCopy="当前周期本地 Token "
      accentColor="#6f8cff"
      density={density}
      localPrimary={currentLocal}
      localPrevious={previousLocal}
      emptyCopy="等待官方额度"
      footer={(
        <ResetPanel
          banked={bankedResets}
          embedded
          compact={density === 'compact'}
        />
      )}
    />
  );
}
