import { useState, useEffect, useMemo } from 'react';

import type { AgentId, ProviderLocalUsage } from '../types';
import { agentMeta } from '../services/agentCatalog';
import { computeSpend } from '../services/usageLogic';
import { useStore } from '../store/usageStore';

import Header        from './Header';
import CompanyList   from './CompanyList';
import GrokPanel     from './GrokPanel';
import MistralPanel  from './MistralPanel';
import RingCard      from './RingCard';
import WeeklyCard    from './WeeklyCard';
import ResetPanel    from './ResetPanel';
import ModelList     from './ModelList';
import SpendCard     from './SpendCard';
import QuotaList     from './QuotaList';
import SetupBanner   from './SetupBanner';
import SettingsPanel from './SettingsPanel';

export default function Popover() {
  const [showSettings, setShowSettings] = useState(false);
  const [company, setCompany] = useState<AgentId>('codex');
  const { data, isRefreshing, refresh, lastUpdated, error, errorKind, checkFirstLaunch } = useStore();

  useEffect(() => {
    checkFirstLaunch().then(first => {
      if (first) setShowSettings(true);
    }).catch(() => {});
  }, [checkFirstLaunch]);

  const localProviders = data?.local_providers ?? [];
  const activeLocal = useMemo(
    () => localProviders.find((p) => p.provider === company),
    [localProviders, company],
  );

  if (showSettings) {
    return (
      <div className="popover">
        <SettingsPanel onClose={() => {
          setShowSettings(false);
          refresh();
        }} />
      </div>
    );
  }

  const isOpenAI = company === 'codex';

  return (
    <div className="popover">
      <Header
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        lastUpdated={lastUpdated}
        onOpenSettings={() => setShowSettings(true)}
        hasError={!!errorKind && isOpenAI}
      />

      <div className="popover-chrome">
        <CompanyList
          active={company}
          onSelect={setCompany}
          providers={localProviders}
        />
      </div>

      {/* Single vertical scroll surface for desktop wheel / trackpad */}
      <div className="popover-scroll" id="main-scroll">
        <div className="popover-scroll-inner">
          {isOpenAI ? (
            <>
              <SetupBanner
                errorKind={errorKind}
                error={data?.error ?? error}
                onOpenSettings={() => setShowSettings(true)}
              />

              <div className="metrics-row">
                <RingCard window={data?.window_5h} />
                <div className="right-col">
                  <WeeklyCard window={data?.window_weekly} />
                  <SpendCard
                    spend={data?.spend}
                    today={data?.today_local}
                    month={data?.month_local}
                  />
                </div>
              </div>

              <ResetPanel banked={data?.banked_resets} />

              <QuotaList
                buckets={data?.rate_limits}
                usedModels={[
                  ...(data?.today_local.models ?? []),
                  ...(data?.month_local.models ?? []),
                ]}
              />

              <ModelList
                models={data?.today_local.models}
                monthModels={data?.month_local.models}
              />
            </>
          ) : company === 'grok' ? (
            <GrokPanel local={activeLocal} />
          ) : company === 'mistral' ? (
            <MistralPanel local={activeLocal} />
          ) : (
            <CompanyLocalPanel companyId={company} local={activeLocal} />
          )}

          {/* Spacer so last cards clear the scroll edge */}
          <div className="scroll-end-spacer" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function CompanyLocalPanel({
  companyId,
  local,
}: {
  companyId: AgentId;
  local?: ProviderLocalUsage;
}) {
  const meta = agentMeta(companyId);
  const today = local?.today;
  const month = local?.month;
  const spend = month ? computeSpend(month) : undefined;
  const hasTokens = !!local?.hasTokens;

  return (
    <>
      {!hasTokens && (
        <div className="company-status card">
          <p className="company-placeholder-copy">
            {local?.available
              ? `已发现 ${meta.localHint}，但尚未拉到会话 token。`
              : `尚未发现 ${meta.localHint}。`}
          </p>
        </div>
      )}

      {hasTokens && (
        <>
          <SpendCard spend={spend} today={today} month={month} />
          <ModelList
            models={today?.models}
            monthModels={month?.models}
          />
        </>
      )}
    </>
  );
}
