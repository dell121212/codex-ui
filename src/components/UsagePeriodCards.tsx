import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PeriodUsage, UsagePeriodKey } from '../types';
import { formatTokenExact, formatTokenM, formatTokenWithUnit, type TokenCount } from '../services/tokenDisplay';
import { summarizePeriodCost } from '../services/usageAggregation';

export interface UsagePeriodOption {
  id: UsagePeriodKey;
  label: string;
  tokens: TokenCount;
  detail: string;
  usage: PeriodUsage;
  previousTokens?: TokenCount;
  previousAriaLabel?: string;
}

interface Props {
  value: UsagePeriodKey;
  options: UsagePeriodOption[];
  onChange: (value: UsagePeriodKey) => void;
  ariaLabel?: string;
}

export default function UsagePeriodCards({
  value,
  options,
  onChange,
  ariaLabel = '切换用量统计周期',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const updateScrollEdge = () => {
    const node = scrollRef.current;
    if (!node) return;
    setEdge({
      start: node.scrollLeft <= 1,
      end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
    });
  };

  useEffect(() => {
    updateScrollEdge();
    window.addEventListener('resize', updateScrollEdge);
    return () => window.removeEventListener('resize', updateScrollEdge);
  }, []);

  const handleScrollKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const node = scrollRef.current;
    if (!node) return;
    const step = node.querySelector<HTMLElement>('.usage-period-card')?.offsetWidth ?? node.clientWidth;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      node.scrollBy({ left: event.key === 'ArrowRight' ? step + 12 : -(step + 12), behavior });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      node.scrollTo({ left: event.key === 'Home' ? 0 : node.scrollWidth, behavior });
    } else {
      return;
    }
    requestAnimationFrame(updateScrollEdge);
  };

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === 'current' || next === 'month' || next === 'total') onChange(next);
      }}
      className="usage-period-tabs"
    >
      <div
        ref={scrollRef}
        className="usage-period-scroll"
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        data-at-start={edge.start ? 'true' : 'false'}
        data-at-end={edge.end ? 'true' : 'false'}
        onScroll={updateScrollEdge}
        onKeyDown={handleScrollKeys}
      >
      <TabsList className="usage-period-list" aria-label={ariaLabel}>
        {options.map((option) => {
          const cost = summarizePeriodCost(option.usage);
          const displayValue = formatTokenM(option.tokens);
          const exactValue = formatTokenExact(option.tokens);
          const previousValue = formatTokenWithUnit(option.previousTokens);
          return (
            <TabsTrigger
              key={option.id}
              value={option.id}
              data-period={option.id}
              className="usage-period-card"
            >
              <span className="usage-period-card-copy">
                <span className="usage-period-label">{option.label}</span>
                <span className="usage-period-values">
                  <strong
                    title={exactValue === '—' ? undefined : exactValue}
                    aria-label={exactValue}
                  >
                    {displayValue}
                  </strong>
                  {option.previousTokens !== undefined && (
                    <span
                      className="usage-period-previous"
                      title={formatTokenExact(option.previousTokens) === '—' ? undefined : formatTokenExact(option.previousTokens)}
                      aria-label={option.previousAriaLabel ?? `上一周期 ${formatTokenExact(option.previousTokens)}`}
                    >
                      上期 {previousValue}
                    </span>
                  )}
                </span>
                <span className="usage-period-detail">{option.detail}</span>
                <span className="usage-period-estimate">
                  估价 ~${cost.usd.toFixed(2)}
                  {cost.unpricedModels.length > 0 ? ` · ${cost.unpricedModels.length} 个模型未计价` : ''}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      </div>
    </Tabs>
  );
}
