import { create } from 'zustand';
import type { AgentId, BoardColumnId, BoardPriority, BoardTask } from '../types';
import {
  createTask,
  filterTasks,
  isValidColumnId,
  moveTask,
  nextOrderForColumn,
} from '../services/boardLogic';
import { isValidAgentId } from '../services/agentCatalog';
import { loadBoardTasks, saveBoardTasks } from '../services/boardStorage';

interface BoardState {
  tasks: BoardTask[];
  loaded: boolean;
  query: string;
  priorityFilter: BoardPriority | 'all';
  agentFilter: AgentId | 'all';
  showArchived: boolean;
  /** Task id currently open in editor, or `new:<columnId>` for create dialog */
  editingId: string | null;
  /** Feedback after copy prompt */
  toast: string | null;
  persistError: string | null;

  load: () => Promise<void>;
  setQuery: (q: string) => void;
  setPriorityFilter: (p: BoardPriority | 'all') => void;
  setAgentFilter: (a: AgentId | 'all') => void;
  setShowArchived: (v: boolean) => void;
  openCreate: (columnId?: BoardColumnId) => void;
  openEdit: (id: string) => void;
  closeEditor: () => void;
  restoreTask: (id: string) => Promise<void>;
  addTask: (input: {
    title: string;
    description?: string;
    priority?: BoardPriority;
    columnId?: BoardColumnId;
    agentType?: AgentId;
    repoPath?: string;
    branchName?: string;
    successCheck?: string;
  }) => Promise<BoardTask | null>;
  updateTask: (id: string, patch: Partial<Pick<BoardTask,
    'title' | 'description' | 'priority' | 'columnId' | 'agentType' | 'repoPath' | 'branchName' | 'successCheck'
  >>) => Promise<void>;
  moveTask: (id: string, toColumn: BoardColumnId, toIndex?: number) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setToast: (msg: string | null) => void;
  filteredTasks: () => BoardTask[];
}

/** Serialize writes so rapid drag/drop cannot last-write-wins overwrite newer state. */
let persistChain: Promise<void> = Promise.resolve();

function enqueuePersist(getTasks: () => BoardTask[]): Promise<void> {
  persistChain = persistChain
    .catch(() => undefined)
    .then(async () => {
      try {
        await saveBoardTasks(getTasks());
        useBoardStore.setState({ persistError: null });
      } catch (e) {
        useBoardStore.setState({
          persistError: e instanceof Error ? e.message : String(e),
        });
      }
    });
  return persistChain;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  loaded: false,
  query: '',
  priorityFilter: 'all',
  agentFilter: 'all',
  showArchived: false,
  editingId: null,
  toast: null,
  persistError: null,

  load: async () => {
    if (get().loaded) return;
    const tasks = await loadBoardTasks();
    set({ tasks, loaded: true });
  },

  setQuery: (q) => set({ query: q }),
  setPriorityFilter: (p) => set({ priorityFilter: p }),
  setAgentFilter: (a) => set({ agentFilter: a }),
  setShowArchived: (v) => set({ showArchived: v }),

  openCreate: (columnId) => {
    const col = isValidColumnId(columnId) ? columnId : 'backlog';
    set({ editingId: `new:${col}` });
  },

  openEdit: (id) => set({ editingId: id }),
  closeEditor: () => set({ editingId: null }),

  addTask: async (input) => {
    const title = input.title.trim();
    if (!title) return null;

    const columnId = isValidColumnId(input.columnId) ? input.columnId : 'backlog';
    const order = nextOrderForColumn(get().tasks, columnId);
    const task = createTask({ ...input, title, columnId, order });
    const tasks = [...get().tasks, task];
    set({ tasks, editingId: null });
    await enqueuePersist(() => get().tasks);
    return task;
  },

  updateTask: async (id, patch) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return;

    // Column changes must go through moveTask so `order` is re-numbered.
    let tasks = get().tasks;
    if (patch.columnId && patch.columnId !== current.columnId && isValidColumnId(patch.columnId)) {
      tasks = moveTask(tasks, id, patch.columnId);
    }

    const now = Date.now();
    tasks = tasks.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        title: patch.title !== undefined ? patch.title.trim() : t.title,
        description: patch.description !== undefined ? patch.description.trim() : t.description,
        priority: patch.priority ?? t.priority,
        agentType: patch.agentType && isValidAgentId(patch.agentType)
          ? patch.agentType
          : t.agentType,
        repoPath: patch.repoPath !== undefined
          ? (patch.repoPath.trim() || undefined)
          : t.repoPath,
        branchName: patch.branchName !== undefined
          ? (patch.branchName.trim() || undefined)
          : t.branchName,
        successCheck: patch.successCheck !== undefined
          ? (patch.successCheck.trim() || undefined)
          : t.successCheck,
        updatedAt: now,
      };
    });

    set({ tasks, editingId: null });
    await enqueuePersist(() => get().tasks);
  },

  moveTask: async (id, toColumn, toIndex) => {
    if (!isValidColumnId(toColumn)) return;
    const tasks = moveTask(get().tasks, id, toColumn, toIndex);
    set({ tasks });
    await enqueuePersist(() => get().tasks);
  },

  archiveTask: async (id) => {
    const now = Date.now();
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, archived: true, updatedAt: now } : t,
    );
    set({ tasks, editingId: null });
    get().setToast('已归档（可在归档列表恢复）');
    await enqueuePersist(() => get().tasks);
  },

  restoreTask: async (id) => {
    const now = Date.now();
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, archived: false, updatedAt: now } : t,
    );
    set({ tasks });
    get().setToast('已恢复到看板');
    await enqueuePersist(() => get().tasks);
  },

  deleteTask: async (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id);
    set({ tasks, editingId: null });
    await enqueuePersist(() => get().tasks);
  },

  setToast: (msg) => {
    set({ toast: msg });
    if (msg) {
      window.setTimeout(() => {
        if (get().toast === msg) set({ toast: null });
      }, 2200);
    }
  },

  filteredTasks: () => filterTasks(
    get().tasks,
    get().query,
    get().priorityFilter,
    get().agentFilter,
  ),
}));
