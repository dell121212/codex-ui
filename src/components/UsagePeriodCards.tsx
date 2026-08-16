import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import type { PeriodUsage, UsagePeriodKey } from '../types';
import { summarizePeriodCost } from '../services/usageAggregation';

export interface UsagePeriodOption {
  id: UsagePeriodKey;
  label: string;
  value: string;
  detail: string;
  usage: PeriodUsage;
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
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === 'current' || next === 'month' || next === 'total') onChange(next);
      }}
      className="usage-period-tabs"
    >
      <TabsList className="usage-period-list" aria-label={ariaLabel}>
        {options.map((option) => {
          const cost = summarizePeriodCost(option.usage);
          return (
            <TabsTrigger
              key={option.id}
              value={option.id}
              data-period={option.id}
              className="usage-period-card"
            >
              <span className="usage-period-card-copy">
                <span className="usage-period-label">{option.label}</span>
                <strong>{option.value}</strong>
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
    </Tabs>
  );
}
