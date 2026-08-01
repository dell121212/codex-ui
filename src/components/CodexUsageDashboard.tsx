import type { BankedResets, WindowUsage } from '../types';
import { isWindowMissing, windowDurationLabel } from '../services/usageLogic';
import ProviderQuotaDashboard, { type DashboardDensity } from './ProviderQuotaDashboard';
import ResetPanel from './ResetPanel';

interface Props {
  shortWindow?: WindowUsage;
  weeklyWindow?: WindowUsage;
  source?: string;
  density?: DashboardDensity;
  bankedResets?: BankedResets;
}

export default function CodexUsageDashboard({
  shortWindow,
  weeklyWindow,
  source,
  density = 'detail',
  bankedResets,
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
      primaryLabel={main ? windowDurationLabel(main, '当前额度') : '周额度'}
      secondaryLabel={secondary ? windowDurationLabel(secondary, '周额度') : '周额度'}
      periodCopy={main === shortWindow ? '当前 5 小时已使用 ' : '本周已使用 '}
      accentColor="#6f8cff"
      density={density}
      emptyCopy="等待 app-server 返回当前额度窗口。"
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
