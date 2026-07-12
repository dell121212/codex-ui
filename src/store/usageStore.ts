import { create } from 'zustand';
import type { AuthStatus, ResetOutcome, Settings, UsageSnapshot } from '../types';
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

  checkFirstLaunch,
  getAuthStatus,

  loadSettings: () => loadSettings() as Promise<Settings>,
  saveSettings: saveSettings,
}));
