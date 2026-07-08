import type { ModelUsage } from '../types';

interface Props {
  models?: ModelUsage[];
}

/** Trim vendor prefix and date suffixes for readability */
function shortName(name: string): string {
  return name
    .replace(/^(claude|gemini)-/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')   // strip date suffixes
    .replace(/-preview$/, '')
    .substring(0, 20);
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

/** Bar color cycles through a small palette per model index */
const BAR_COLORS = ['#0a84ff', '#5e5ce6', '#30d158', '#ff9f0a', '#ff453a'];

export default function ModelList({ models }: Props) {
  if (!models?.length) {
    return (
      <div className="card model-list">
        <div className="card-label">今日模型</div>
        <div className="empty-state">未在 ~/.codex/sessions/ 找到会话</div>
      </div>
    );
  }

  return (
    <div className="card model-list">
      <div className="card-label">今日模型</div>

      {models.map((m, i) => {
        const totalTok = m.input_tokens + m.output_tokens;
        const cachedTok = m.cached_input_tokens;
        const color    = BAR_COLORS[i % BAR_COLORS.length];

        return (
          <div key={m.model} className="model-row">
            <div className="model-name-row">
              <span className="model-name" title={m.model}>
                {shortName(m.model)}
              </span>
              <span className="model-stats">
                {fmtTok(totalTok)} token{cachedTok ? ` · cached ${fmtTok(cachedTok)}` : ''}
              </span>
            </div>
            <div className="progress-bg">
              <div
                className="progress-fill"
                style={{
                  width: `${m.percent_of_total}%`,
                  background: color,
                  transition: 'width 600ms ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
