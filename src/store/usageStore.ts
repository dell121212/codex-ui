import { create } from 'zustand';
import type {
  AuthStatus,
  PeriodUsage,
  ProviderLocalUsage,
  ResetOutcome,
  Settings,
  UsageSnapshot,
} from '../types';
import {
  checkFirstLaunch,
  executeReset,
  getAuthStatus,
  getUsage,
  loadSettings,
  onUsageUpdated,
  refreshUsage,
  saveSettings,
} from '../services/neutralinoBackend';

// ─── Module-level listener (registered once, cleaned up on unlisten call) ───

let _unlisten: (() => void) | null = null;

export function subscribe() {
  if (_unlisten) return;
  _unlisten = onUsageUpdated((snapshot) => {
    useStore.setState({
      data: snapshot,
      lastUpdated: new Date(),
      error: snapshot.error ?? null,
      errorKind: snapshot.error_kind ?? null,
    });
  });
}

export function unsubscribe() {
  if (_unlisten) {
    _unlisten();
    _unlisten = null;
  }
}

interface Store {
  data: UsageSnapshot | null;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  error: string | null;
  errorKind: string | null;

  fetchInitial: () => Promise<void>;
  refresh: () => Promise<void>;
  executeReset: (creditId?: string) => Promise<ResetOutcome>;
  checkFirstLaunch: () => Promise<boolean>;
  getAuthStatus: () => Promise<AuthStatus>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (s: Settings) => Promise<void>;
}

export const useStore = create<Store>((set) => ({
  data: null,
  isRefreshing: false,
  lastUpdated: null,
  error: null,
  errorKind: null,

  fetchInitial: async () => {
    if (isPreviewMode()) {
      set({ data: previewSnapshot(), lastUpdated: new Date(), error: null, errorKind: null });
      return;
    }
    try {
      // getUsage paints disk/memory cache immediately and may kick a background refresh.
      // Live updates after that arrive via subscribe() → onUsageUpdated.
      const data = await getUsage();
      set({
        data,
        lastUpdated: new Date(),
        error: data.error ?? null,
        errorKind: data.error_kind ?? null,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        errorKind: 'NETWORK_ERROR',
      });
    }
  },

  refresh: async () => {
    if (isPreviewMode()) {
      set({ data: previewSnapshot(), lastUpdated: new Date(), error: null, errorKind: null });
      return;
    }
    set({ isRefreshing: true });
    try {
      // Phase A (local) + phase B (remote) both publish via listeners; final return is phase B.
      const data = await refreshUsage();
      set({
        data,
        lastUpdated: new Date(),
        error: data.error ?? null,
        errorKind: data.error_kind ?? null,
        isRefreshing: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        errorKind: 'NETWORK_ERROR',
        isRefreshing: false,
      });
    }
  },

  executeReset: async (creditId) => {
    try {
      const outcome = await executeReset(creditId);
      return outcome;
    } catch {
      return 'failed';
    }
  },

  checkFirstLaunch: () => isPreviewMode() ? Promise.resolve(false) : checkFirstLaunch(),
  getAuthStatus,

  loadSettings: () => loadSettings() as Promise<Settings>,
  saveSettings: saveSettings,
}));

function isPreviewMode(): boolean {
  return import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('preview');
}

/** Browser-only design fixture; excluded from production behavior by import.meta.env.DEV. */
function previewSnapshot(): UsageSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const previewVariant = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('preview')
    : 'weekly';
  const weeklyReset = now + (3 * 86_400) + (6 * 3_600);
  const today = {
    messages: 18,
    tokens: 384_200,
    models: [
      {
        model: 'gpt-5.6-sol',
        input_tokens: 284_000,
        cached_input_tokens: 102_000,
        output_tokens: 31_200,
        cost_usd: 3.42,
        percent_of_total: 82,
      },
      {
        model: 'gpt-5.6-luna',
        input_tokens: 61_000,
        cached_input_tokens: 22_000,
        output_tokens: 8_000,
        cost_usd: 0.38,
        percent_of_total: 18,
      },
    ],
  };
  const month = {
    messages: 146,
    tokens: 2_840_000,
    models: [
      {
        model: 'gpt-5.6-sol',
        input_tokens: 2_100_000,
        cached_input_tokens: 780_000,
        output_tokens: 300_000,
        cost_usd: 10.8,
        percent_of_total: 84.5,
      },
      {
        model: 'gpt-5.6-luna',
        input_tokens: 360_000,
        cached_input_tokens: 120_000,
        output_tokens: 80_000,
        cost_usd: 2.06,
        percent_of_total: 15.5,
      },
    ],
  };
  const previewProvider = (
    provider: ProviderLocalUsage['provider'],
    todayUsage: PeriodUsage,
    monthUsage: PeriodUsage,
  ): ProviderLocalUsage => ({
    provider,
    available: true,
    hasTokens: monthUsage.tokens > 0,
    authOk: true,
    today: todayUsage,
    month: monthUsage,
  });
  const usagePeriod = (
    messages: number,
    tokens: number,
    model: string,
    cost: number | null,
  ): PeriodUsage => {
    const input = Math.round(tokens * 0.8);
    return {
      messages,
      tokens,
      models: tokens > 0 ? [{
        model,
        input_tokens: input,
        cached_input_tokens: Math.round(input * 0.25),
        output_tokens: tokens - input,
        cost_usd: cost,
        percent_of_total: 100,
      }] : [],
    };
  };
  const localProviders: ProviderLocalUsage[] = [
    previewProvider('codex', today, month),
    previewProvider(
      'claude',
      usagePeriod(11, 214_000, 'claude-sonnet-4.5', 0.92),
      usagePeriod(92, 1_920_000, 'claude-sonnet-4.5', 7.48),
    ),
    previewProvider(
      'kimi',
      usagePeriod(7, 96_000, 'kimi-k2.5', null),
      usagePeriod(41, 860_000, 'kimi-k2.5', null),
    ),
    previewProvider(
      'grok',
      usagePeriod(5, 0, 'grok-4.5', null),
      usagePeriod(28, 0, 'grok-4.5', null),
    ),
    previewProvider(
      'mistral',
      usagePeriod(9, 83_000, 'mistral-medium-3.5', 0.24),
      usagePeriod(58, 730_000, 'mistral-medium-3.5', 1.84),
    ),
    previewProvider(
      'glm',
      usagePeriod(4, 39_000, 'glm-4.7', null),
      usagePeriod(19, 310_000, 'glm-4.7', null),
    ),
  ];
  const weekly = {
    used: 43,
    limit: 100,
    percent: 43,
    window_duration_mins: 10_080,
    reset_at_unix: weeklyReset,
    remaining_secs: weeklyReset - now,
  };
  const emptyWindow = {
    used: 0,
    limit: 0,
    percent: 0,
    window_duration_mins: 0,
    reset_at_unix: 0,
    remaining_secs: 0,
  };
  const shortWindow = previewVariant === 'dual'
    ? {
        used: 18,
        limit: 100,
        percent: 18,
        window_duration_mins: 300,
        reset_at_unix: now + 7_200,
        remaining_secs: 7_200,
      }
    : emptyWindow;

  return {
    fetched_at: new Date().toISOString(),
    provider: 'codex-app-server',
    window_5h: shortWindow,
    window_weekly: weekly,
    rate_limits: [{
      id: 'codex',
      name: null,
      primary: shortWindow === emptyWindow ? weekly : shortWindow,
      secondary: shortWindow === emptyWindow ? emptyWindow : weekly,
      plan_type: 'plus',
    }],
    today_local: today,
    month_local: month,
    local_providers: localProviders,
    banked_resets: {
      available: 2,
      credits: [],
      lifetime_used: 1,
      last_reset_at: null,
    },
    spend: {
      month_total_usd: 12.86,
      avg_daily_usd: 1.84,
      projected_usd: 55.2,
      unpriced_models: [],
      pricing_as_of: new Date().toISOString().slice(0, 10),
    },
  };
}
