import { Plus } from 'lucide-react';
import type { BoardColumnId, BoardTask } from '../types';
import { columnMeta, tasksByColumn } from '../services/boardLogic';
import { useBoardStore } from '../store/boardStore';
import BoardTaskCard from './BoardTaskCard';

interface Props {
  columnId: BoardColumnId;
  tasks: BoardTask[];
  draggingId: string | null;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  dropTarget: BoardColumnId | null;
  onDropTarget: (col: BoardColumnId | null) => void;
}

export default function BoardColumn({
  columnId,
  tasks,
  draggingId,
  onDragStart,
  onDragEnd,
  dropTarget,
  onDropTarget,
}: Props) {
  const openCreate = useBoardStore((s) => s.openCreate);
  const move = useBoardStore((s) => s.moveTask);
  const meta = columnMeta(columnId);
  const columnTasks = tasksByColumn(tasks, columnId);
  const isDrop = dropTarget === columnId;

  const dropAt = async (taskId: string | null, toIndex?: number) => {
    onDropTarget(null);
    if (taskId) await move(taskId, columnId, toIndex);
    onDragEnd();
  };

  return (
    <section
      className={`board-col${isDrop ? ' board-col--drop' : ''}`}
      data-column={columnId}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTarget !== columnId) onDropTarget(columnId);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) onDropTarget(null);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/board-task-id') || draggingId;
        // Drop on empty column body / header → append
        await dropAt(id);
      }}
    >
      <header className="board-col-header">
        <div className="board-col-title-row">
          <span className="board-col-dot" style={{ background: meta.color }} />
          <span className="board-col-title">{meta.title}</span>
          <span className="board-col-count">{columnTasks.length}</span>
        </div>
        <button
          type="button"
          className="board-col-add"
          onClick={() => openCreate(columnId)}
          title={`在「${meta.title}」新建任务`}
          aria-label={`在${meta.title}新建任务`}
        >
          <Plus size={12} />
        </button>
      </header>
      <p className="board-col-hint">{meta.hint}</p>

      <div className="board-col-body">
        {columnTasks.length === 0 ? (
          <div className="board-col-empty">拖入任务</div>
        ) : (
          columnTasks.map((task, index) => (
            <div
              key={task.id}
              className="board-drop-slot"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (dropTarget !== columnId) onDropTarget(columnId);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.dataTransfer.getData('text/board-task-id') || draggingId;
                // Insert before this card (column-internal reorder)
                let toIndex = index;
                if (id && draggingId === id) {
                  const from = columnTasks.findIndex((t) => t.id === id);
                  if (from >= 0 && from < index) toIndex = index - 1;
                }
                await dropAt(id, toIndex);
              }}
            >
              <BoardTaskCard
                task={task}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </div>
          ))
        )}
        {columnTasks.length > 0 && (
          <div
            className="board-drop-tail"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dropTarget !== columnId) onDropTarget(columnId);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData('text/board-task-id') || draggingId;
              await dropAt(id, columnTasks.length);
            }}
          />
        )}
      </div>
    </section>
  );
}
