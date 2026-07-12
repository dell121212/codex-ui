import type { BoardTask } from '../types';
import { normalizeTasks } from './boardLogic';

const BOARD_KEY = 'board_tasks';
const FALLBACK_KEY = 'codex-ui.board_tasks';

function nativeApi(): NeutralinoApi | null {
  return window.Neutralino ?? (typeof Neutralino !== 'undefined' ? Neutralino : null);
}

/**
 * Load board tasks.
 * Neutralino storage is the source of truth when available.
 * localStorage is only used in pure browser/Vite dev (no Neutralino).
 */
export async function loadBoardTasks(): Promise<BoardTask[]> {
  const api = nativeApi();
  if (api) {
    try {
      const raw = await api.storage.getData(BOARD_KEY);
      return normalizeTasks(JSON.parse(raw));
    } catch {
      // Missing key → empty board (do not silently prefer a divergent localStorage copy).
      return [];
    }
  }

  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return normalizeTasks(JSON.parse(raw));
  } catch {
    // ignore
  }
  return [];
}

export async function saveBoardTasks(tasks: BoardTask[]): Promise<void> {
  const payload = JSON.stringify(tasks);
  const api = nativeApi();

  if (api) {
    await api.storage.setData(BOARD_KEY, payload);
    // Mirror for debugging only when NL is present; load ignores this path.
    try {
      localStorage.setItem(FALLBACK_KEY, payload);
    } catch {
      // optional
    }
    return;
  }

  localStorage.setItem(FALLBACK_KEY, payload);
}
