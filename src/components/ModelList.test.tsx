import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ModelUsage } from '../types';
import ModelList from './ModelList';

describe('ModelList cost display', () => {
  it('shows small GPT-6 estimates and each token-cost class', () => {
    const models: ModelUsage[] = [{
      model: 'gpt-6-luna',
      input_tokens: 10_000,
      cached_input_tokens: 2_000,
      cache_creation_tokens: 2_000,
      output_tokens: 2_000,
      cost_usd: 0.00187,
      percent_of_total: 100,
    }];

    const markup = renderToStaticMarkup(<ModelList models={models} />);

    expect(markup).toContain('~$0.00187');
    expect(markup).toContain('输入 $0.0006');
    expect(markup).toContain('缓存读 $0.00002');
    expect(markup).toContain('缓存写 $0.00025');
    expect(markup).toContain('输出 $0.001');
  });
});
