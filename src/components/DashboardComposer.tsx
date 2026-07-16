import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { AgentId, PeriodUsage, ProviderLocalUsage, UsageSnapshot, WindowUsage } from '../types';
import { agentMeta, COMPANY_LIST } from '../services/agentCatalog';
import { computeSpend, isWindowMissing } from '../services/usageLogic';
import CodexUsageDashboard from './CodexUsageDashboard';
import ModelList from './ModelList';
import ProviderQuotaDashboard, { type DashboardDensity } from './ProviderQuotaDashboard';
import SpendCard from './SpendCard';

const STORAGE_KEY = 'codex-ui-dashboard-providers-v1';
const DROP_ZONE_ID = 'provider-dashboard-dropzone';

interface Props {
  data: UsageSnapshot | null;
  providers: ProviderLocalUsage[];
}

function dashboardId(id: AgentId): string {
  return `dashboard:${id}`;
}

function paletteId(id: AgentId): string {
  return `palette:${id}`;
}

function providerFromDragId(value: string): AgentId | null {
  const id = value.replace(/^(dashboard|palette):/, '');
  return COMPANY_LIST.includes(id as AgentId) ? id as AgentId : null;
}

function loadInitialProviders(): AgentId[] {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const requested = new URLSearchParams(window.location.search).get('providers');
    if (requested) {
      const ids = requested.split(',').filter((id): id is AgentId => COMPANY_LIST.includes(id as AgentId));
      if (ids.length) return [...new Set(ids)];
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      const ids = parsed.filter((id): id is AgentId => COMPANY_LIST.includes(id as AgentId));
      if (ids.length) return [...new Set(ids)];
    }
  } catch {
    // Ignore invalid or unavailable local storage.
  }
  return ['codex'];
}

export default function DashboardComposer({ data, providers }: Props) {
  const [selected, setSelected] = useState<AgentId[]>(loadInitialProviders);
  const [activeDrag, setActiveDrag] = useState<AgentId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const density: DashboardDensity = selected.length <= 1
    ? 'detail'
    : selected.length === 2
      ? 'balanced'
      : 'compact';

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    } catch {
      // Persistence is best-effort.
    }
  }, [selected]);

  const addProvider = (id: AgentId) => {
    setSelected((current) => current.includes(id) ? current : [...current, id]);
  };
  const removeProvider = (id: AgentId) => {
    setSelected((current) => {
      const next = current.filter((item) => item !== id);
      return next.length ? next : ['codex'];
    });
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDrag(providerFromDragId(String(active.id)));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDrag(null);
    if (!over) return;
    const activeId = String(active.id);
    const provider = providerFromDragId(activeId);
    if (!provider) return;

    if (activeId.startsWith('palette:')) {
      const overId = String(over.id);
      if (overId === DROP_ZONE_ID || overId.startsWith('dashboard:')) {
        addProvider(provider);
      }
      return;
    }

    const overProvider = providerFromDragId(String(over.id));
    if (!overProvider || overProvider === provider) return;
    setSelected((current) => {
      const from = current.indexOf(provider);
      const to = current.indexOf(overProvider);
      return from >= 0 && to >= 0 ? arrayMove(current, from, to) : current;
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="dashboard-composer">
        <section className="provider-palette" aria-label="可添加公司">
          <div className="provider-palette-list">
            {COMPANY_LIST.map((id) => (
              <PaletteProvider
                key={id}
                id={id}
                selected={selected.includes(id)}
                onAdd={() => addProvider(id)}
              />
            ))}
          </div>
        </section>

        <DashboardDropZone empty={!selected.length}>
          <SortableContext items={selected.map(dashboardId)} strategy={rectSortingStrategy}>
            <div
              className={`provider-dashboard-grid provider-dashboard-grid--${density} provider-dashboard-grid--count-${selected.length}`}
            >
              {selected.map((id) => (
                <SortableProviderCard
                  key={id}
                  id={id}
                  density={density}
                  data={data}
                  local={providers.find((provider) => provider.provider === id)}
                  onRemove={() => removeProvider(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DashboardDropZone>
      </div>

      <DragOverlay>
        {activeDrag ? <ProviderDragPreview id={activeDrag} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function PaletteProvider({
  id,
  selected,
  onAdd,
}: {
  id: AgentId;
  selected: boolean;
  onAdd: () => void;
}) {
  const meta = agentMeta(id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: paletteId(id) });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`provider-palette-item${selected ? ' provider-palette-item--selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{ '--provider-color': meta.color } as CSSProperties}
      onClick={onAdd}
      aria-label={`${selected ? '已添加' : '添加'} ${meta.fullName}，也可拖入额度展示区`}
      title={`${meta.fullName}${selected ? ' · 已添加' : ' · 拖入或点击添加'}`}
      {...attributes}
      {...listeners}
    >
      <span className="provider-palette-badge">{meta.badge}</span>
      <span className="provider-palette-label">{meta.label}</span>
    </button>
  );
}

function DashboardDropZone({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: DROP_ZONE_ID });
  return (
    <section
      ref={setNodeRef}
      className={`provider-dashboard-dropzone${isOver ? ' provider-dashboard-dropzone--over' : ''}`}
      aria-label="额度展示区"
    >
      {empty ? <div className="provider-dashboard-empty">把公司拖到这里开始编排额度面板</div> : children}
    </section>
  );
}

function SortableProviderCard({
  id,
  density,
  data,
  local,
  onRemove,
}: {
  id: AgentId;
  density: DashboardDensity;
  data: UsageSnapshot | null;
  local?: ProviderLocalUsage;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dashboardId(id),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`sortable-provider-card${isDragging ? ' is-dragging' : ''}`}
    >
      <div className="sortable-provider-actions">
        <button type="button" className="provider-drag-handle" aria-label="拖动排序" {...attributes} {...listeners}>
          <GripVertical size={15} />
        </button>
        <button type="button" className="provider-remove-button" onClick={onRemove} aria-label={`移除 ${agentMeta(id).label}`}>
          <X size={14} />
        </button>
      </div>
      <ProviderDashboardContent id={id} density={density} data={data} local={local} />
    </article>
  );
}

function ProviderDashboardContent({
  id,
  density,
  data,
  local,
}: {
  id: AgentId;
  density: DashboardDensity;
  data: UsageSnapshot | null;
  local?: ProviderLocalUsage;
}) {
  const meta = agentMeta(id);
  const periods = providerPeriods(id, data, local);

  return (
    <>
      {id === 'codex' ? (
        <CodexUsageDashboard
          shortWindow={data?.window_5h}
          weeklyWindow={data?.window_weekly}
          source={data?.provider}
          density={density}
          bankedResets={data?.banked_resets}
        />
      ) : (
        <ProviderQuotaDashboard
          providerName={meta.fullName}
          source={periods.source}
          primary={periods.primary}
          secondary={periods.secondary}
          primaryLabel={periods.primaryLabel}
          secondaryLabel={periods.secondaryLabel}
          periodCopy={periods.periodCopy}
          accentColor={meta.color}
          density={density}
          emptyCopy={`尚未发现 ${meta.localHint} 的额度或本地活动。`}
        />
      )}

      {density === 'detail' && periods.month && (
        <div className="provider-dashboard-extras">
          <SpendCard spend={periods.spend} today={periods.today} month={periods.month} />
          <ModelList models={periods.today?.models} monthModels={periods.month.models} title="活跃模型" />
        </div>
      )}
    </>
  );
}

function ProviderDragPreview({ id }: { id: AgentId }) {
  const meta = agentMeta(id);
  return (
    <div className="provider-drag-preview" style={{ '--provider-color': meta.color } as CSSProperties}>
      <span>{meta.badge}</span>
      <strong>{meta.fullName}</strong>
    </div>
  );
}

function providerPeriods(
  id: AgentId,
  data: UsageSnapshot | null,
  local?: ProviderLocalUsage,
): {
  primary?: WindowUsage;
  secondary?: WindowUsage;
  primaryLabel: string;
  secondaryLabel: string;
  periodCopy: string;
  source: string;
  today?: PeriodUsage;
  month?: PeriodUsage;
  spend?: ReturnType<typeof computeSpend>;
} {
  const today = id === 'codex' ? data?.today_local : local?.today;
  const month = id === 'codex' ? data?.month_local : local?.month;
  const spend = id === 'codex' ? data?.spend : month ? computeSpend(month) : undefined;
  const remote = local?.remote;

  if (remote && !remote.error && !isWindowMissing(remote.primary)) {
    return {
      primary: remote.primary,
      secondary: isWindowMissing(remote.secondary) ? undefined : remote.secondary,
      primaryLabel: remote.primary_label ?? (id === 'grok' ? '周额度' : id === 'mistral' ? '月 Token' : '主额度'),
      secondaryLabel: id === 'grok' ? '月额度' : id === 'mistral' ? '分钟额度' : '次级额度',
      periodCopy: id === 'grok' ? '本周已使用 ' : '本周期已使用 ',
      source: remote.source,
      today,
      month,
      spend,
    };
  }

  const localWindow = monthWindow(month?.tokens ?? 0);
  return {
    primary: localWindow.used > 0 ? localWindow : undefined,
    primaryLabel: '本月 Token',
    secondaryLabel: '次级额度',
    periodCopy: '本月已使用 ',
    source: local?.available ? agentMeta(id).localHint : '等待连接',
    today,
    month,
    spend,
  };
}

function monthWindow(tokens: number): WindowUsage {
  const now = new Date();
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetUnix = Math.floor(reset.getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);
  return {
    used: tokens,
    limit: 0,
    percent: 0,
    window_duration_mins: 43_200,
    reset_at_unix: resetUnix,
    remaining_secs: Math.max(0, resetUnix - nowUnix),
  };
}
