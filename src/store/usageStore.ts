import { create } from 'zustand';
import type { AuthStatus, Settings, UsageSnapshot } from '../types';
import {
  checkFirstLaunch,
  executeReset,
  getAuthStatus,
  getUsage,
  loadSettings,
  onUsageUpdated,
  refreshUsage,
  saveSettings,
  testConnection,
} from '../services/neutralinoBackend';

// ─── Module-level listener (registered once, cleaned up on unlisten call) ───

let _unlisten: (() => void) | null = null;

function subscribe() {
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
  executeReset: () => Promise<boolean>;
  testConnection: (cookie: string) => Promise<boolean>;
  checkFirstLaunch: () => Promise<boolean>;
  getAuthStatus: () => Promise<AuthStatus>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (s: Settings) => Promise<void>;
}

export const useStore = create<Store>((set, get) => ({
  data: null,
  isRefreshing: false,
  lastUpdated: null,
  error: null,
  errorKind: null,

  fetchInitial: async () => {
    try {
      const data = await getUsage();
      set({
        data,
        lastUpdated: new Date(),
        error: data.error ?? null,
        errorKind: data.error_kind ?? null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      const data = await refreshUsage();
      set({
        data,
        lastUpdated: new Date(),
        error: data.error ?? null,
        errorKind: data.error_kind ?? null,
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isRefreshing: false });
    }
  },

  executeReset: async () => {
    try {
      const ok = await executeReset();
      if (ok) await get().refresh();
      return ok;
    } catch {
      return false;
    }
  },

  testConnection,

  checkFirstLaunch,
  getAuthStatus,

  loadSettings: () => loadSettings() as Promise<Settings>,
  saveSettings: saveSettings,
}));

// Call subscribe() once when the store module is imported
subscribe();
