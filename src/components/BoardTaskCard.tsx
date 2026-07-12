import type { MouseEvent } from 'react';
import { Copy, GripVertical } from 'lucide-react';
import type { BoardColumnId, BoardTask } from '../types';
import { agentMeta, buildAgentPrompt, priorityMeta } from '../services/boardLogic';
import { useBoardStore } from '../store/boardStore';

interface Props {
  task: BoardTask;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}

export default function BoardTaskCard({ task, onDragStart, onDragEnd }: Props) {
  const openEdit = useBoardStore((s) => s.openEdit);
  const move = useBoardStore((s) => s.moveTask);
  const setToast = useBoardStore((s) => s.setToast);
  const prio = priorityMeta(task.priority);
  const agent = agentMeta(task.agentType);

  const copyPrompt = async (e: MouseEvent) => {
    e.stopPropagation();
    const text = buildAgentPrompt(task);
    try {
      await navigator.clipboard.writeText(text);
      setToast(`已复制 ${agent.label} ${agent.promptLabel}`);
    } catch {
      setToast('复制失败，请手动选择');
    }
  };

  const advance = async (e: MouseEvent) => {
    e.stopPropagation();
    const next: Record<BoardColumnId, BoardColumnId | null> = {
      backlog: 'in_progress',
      in_progress: 'review',
      review: 'done',
      done: null,
    };
    const to = next[task.columnId];
    if (to) await move(task.id, to);
  };

  return (
    <div
      className="board-card"
      style={{ borderLeftColor: prio.color }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/board-task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => openEdit(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEdit(task.id);
        }
      }}
      aria-label={`任务：${task.title}（${agent.label}）`}
    >
      <div className="board-card-top">
        <span className="board-card-grip" aria-hidden>
          <GripVertical size={12} />
        </span>
        <span className="board-card-prio" title={prio.label}>{prio.emoji}</span>
        <span className="board-card-title">{task.title}</span>
      </div>

      <div className="board-card-agent-row">
        <span
          className="board-agent-badge"
          style={{
            color: agent.color,
            borderColor: `color-mix(in srgb, ${agent.color} 45%, transparent)`,
            background: `color-mix(in srgb, ${agent.color} 14%, transparent)`,
          }}
          title={agent.fullName}
        >
          {agent.badge}
          <span className="board-agent-badge-label">{agent.label}</span>
        </span>
      </div>

      {task.description ? (
        <p className="board-card-desc">{task.description}</p>
      ) : null}

      {(task.repoPath || task.branchName) && (
        <div className="board-card-meta">
          {task.branchName && <span className="board-chip">{task.branchName}</span>}
          {task.repoPath && (
            <span className="board-chip board-chip--muted" title={task.repoPath}>
              {shortPath(task.repoPath)}
            </span>
          )}
        </div>
      )}

      <div className="board-card-actions">
        <button
          type="button"
          className="board-mini-btn"
          onClick={copyPrompt}
          title={`复制 ${agent.fullName} 提示词`}
          aria-label={`复制 ${agent.fullName} 提示词`}
        >
          <Copy size={11} />
          <span>{agent.promptLabel}</span>
        </button>
        {task.columnId !== 'done' && (
          <button
            type="button"
            className="board-mini-btn board-mini-btn--accent"
            onClick={advance}
            title="推进到下一列"
          >
            推进 →
          </button>
        )}
      </div>
    </div>
  );
}

function shortPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join('/')}`;
}
