import type { ModelUsage } from '../types';
import { modelTokenTotal, rankModelsByTokens } from '../services/usageLogic';

interface Props {
  models?: ModelUsage[];
  monthModels?: ModelUsage[];
  title?: string;
  preferMonth?: boolean;
}

function shortName(name: string): string {
  return name
    .replace(/^(claude|gemini)-/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-preview$/, '')
    .substring(0, 24);
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

const BAR_COLORS = ['#0a84ff', '#5e5ce6', '#30d158', '#64d2ff', '#ff9f0a'];

function modelsWithTokens(
  today?: ModelUsage[],
  month?: ModelUsage[],
  preferMonth = false,
): ModelUsage[] {
  if (preferMonth && month?.length) return rankModelsByTokens(month);
  const todayRanked = rankModelsByTokens(today ?? []);
  if (!month?.length) return todayRanked;

  const seen = new Set(todayRanked.map((m) => m.model));
  const monthOnly = rankModelsByTokens(month).filter((m) => !seen.has(m.model));
  return [...todayRanked, ...monthOnly];
}

export default function ModelList({ models, monthModels, title, preferMonth = false }: Props) {
  const ranked = modelsWithTokens(models, monthModels, preferMonth);
  const label = title ?? '使用量排名';

  if (!ranked.length) {
    return (
      <div className="card model-list">
        <div className="card-label">{label}</div>
        <div className="empty-state">暂无会话数据</div>
      </div>
    );
  }

  const maxTok = Math.max(...ranked.map(modelTokenTotal), 1);

  return (
    <div className="card model-list">
      <div className="card-label">{label}</div>

      {ranked.map((m, i) => {
        const totalTok = modelTokenTotal(m);
        const cachedTok = m.cached_input_tokens;
        const color = BAR_COLORS[i % BAR_COLORS.length];
        const barPct = Math.max(3, (totalTok / maxTok) * 100);
        const isToday = (models ?? []).some((t) => t.model === m.model && modelTokenTotal(t) > 0);

        return (
          <div key={m.model} className="model-row">
            <div className="model-name-row">
              <span className="model-name" title={m.model}>
                {shortName(m.model)}
                {!isToday && <span className="model-tag">本月</span>}
              </span>
              <span className="model-stats">
                {fmtTok(totalTok)}
                {m.cost_usd != null ? ` · $${m.cost_usd.toFixed(2)}` : ''}
              </span>
            </div>
            <div className="progress-bg">
              <div
                className="progress-fill"
                style={{
                  width: `${barPct}%`,
                  background: color,
                  transition: 'width 600ms cubic-bezier(.2,.8,.2,1)',
                }}
              />
            </div>
            {cachedTok > 0 && (
              <div className="model-stats" style={{ marginTop: 4, fontSize: 11, color: 'var(--t4)' }}>
                缓存 {fmtTok(cachedTok)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
