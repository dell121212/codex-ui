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

function sourceName(source?: string): string {
  if (source?.includes('app-server')) return 'Codex app-server';
  if (source?.includes('http')) return 'OpenAI usage API';
  return '服务端动态窗口';
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
  const main = weeklyAvailable ? weeklyWindow! : shortAvailable ? shortWindow! : null;
  const secondary = main === weeklyWindow && shortAvailable ? shortWindow! : null;
  return (
    <ProviderQuotaDashboard
      providerName="OpenAI Codex"
      source={sourceName(source)}
      primary={main ?? undefined}
      secondary={secondary ?? undefined}
      primaryLabel={main ? windowDurationLabel(main, '当前额度') : '周额度'}
      secondaryLabel={secondary ? windowDurationLabel(secondary, '短周期') : '短周期'}
      periodCopy={main === weeklyWindow ? '本周已使用 ' : '当前周期已使用 '}
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
