import type { PeriodUsage } from '../types';

/** Kept intentionally separate from official quota/reset state. */
export const LOCAL_TOKEN_SUBTOTAL_STORAGE_KEY = 'codex_local_token_subtotal_v1';

export interface LocalTokenSubtotalCheckpoint {
  checkpoint_unix: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readLocalTokenSubtotalCheckpoint(storage = browserStorage()): number | null {
  try {
    const raw = storage?.getItem(LOCAL_TOKEN_SUBTOTAL_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LocalTokenSubtotalCheckpoint>;
    const checkpoint = Number(value.checkpoint_unix);
    return Number.isFinite(checkpoint) && checkpoint > 0 ? Math.floor(checkpoint) : null;
  } catch {
    return null;
  }
}

/** A checkpoint hides older events; it never alters rollout/session files. */
export function setLocalTokenSubtotalCheckpoint(
  checkpointUnix = Math.floor(Date.now() / 1000),
  storage = browserStorage(),
): number | null {
  const checkpoint = Math.max(1, Math.floor(checkpointUnix));
  try {
    if (!storage) return null;
    storage.setItem(LOCAL_TOKEN_SUBTOTAL_STORAGE_KEY, JSON.stringify({ checkpoint_unix: checkpoint }));
    return checkpoint;
  } catch {
    // Never present a false local-reset success when persistence is unavailable.
    return null;
  }
}

export function emptyLocalTokenSubtotal(): PeriodUsage {
  return { messages: 0, tokens: 0, models: [] };
}
