import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@appica/ui-react/button';
import { useLocalStorage } from '@appica/ui-react/hooks/use-local-storage';
import { useReducedMotion } from '@appica/ui-react/hooks/use-reduced-motion';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@appica/ui-react/popover';
import type { UsageSnapshot } from '../types';
import { mostConstrainedCodexWindow } from '../services/usageLogic';

const STORAGE_KEY = 'codex-ui-companion-v1';

const COMPANIONS = [
  {
    id: 'paimon',
    name: '派蒙',
    src: '/assets/game-ui/character-paimon.png',
    expressions: {
      look: '/assets/companions/expressions/paimon-look.png',
      doze: '/assets/companions/expressions/paimon-doze.png',
      interact: '/assets/companions/expressions/paimon-cheer.png',
    },
  },
  {
    id: 'klee',
    name: '可莉',
    src: '/assets/companions/klee.png',
    expressions: {
      look: '/assets/companions/expressions/klee-look.png',
      doze: '/assets/companions/expressions/klee-doze.png',
      interact: '/assets/companions/expressions/klee-cheer.png',
    },
  },
  {
    id: 'nahida',
    name: '纳西妲',
    src: '/assets/companions/nahida.png',
    expressions: {
      look: '/assets/companions/expressions/nahida-look.png',
      doze: '/assets/companions/expressions/nahida-doze.png',
      interact: '/assets/companions/expressions/nahida-cheer.png',
    },
  },
  {
    id: 'sayu',
    name: '早柚',
    src: '/assets/companions/sayu.png',
    expressions: {
      look: '/assets/companions/expressions/sayu-look.png',
      doze: '/assets/companions/expressions/sayu-doze.png',
      interact: '/assets/companions/expressions/sayu-cheer.png',
    },
  },
] as const;

type CompanionId = (typeof COMPANIONS)[number]['id'];
type CompanionMotion = 'idle' | 'wave' | 'hop' | 'cheer';

const INTERACTIONS: Array<{ motion: CompanionMotion; message: string }> = [
  { motion: 'wave', message: '我在，随时陪你看看额度。' },
  { motion: 'hop', message: '收到！今天也稳稳推进吧。' },
  { motion: 'cheer', message: '做得不错，记得也让自己休息一下。' },
];

interface Props {
  data: UsageSnapshot | null;
  providerCount: number;
}

export default function WorkspaceCompanion({ data, providerCount }: Props) {
  const [companionId, setCompanionId] = useLocalStorage<CompanionId>(STORAGE_KEY, 'paimon', {
    serializer: (value) => value,
    deserializer: (raw) => isCompanionId(raw) ? raw : 'paimon',
  });
  const reduceMotion = useReducedMotion();
  const [motion, setMotion] = useState<CompanionMotion>('idle');
  const [interactionIndex, setInteractionIndex] = useState(0);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [sparkleKey, setSparkleKey] = useState(0);
  const resetTimer = useRef<number | null>(null);
  const companion = COMPANIONS.find((item) => item.id === companionId) ?? COMPANIONS[0];
  const companionImage = motion === 'idle' ? companion.src : companion.expressions.interact;
  const statusMessage = useMemo(
    () => buildStatusMessage(data, providerCount),
    [data, providerCount],
  );

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const interact = () => {
    const interaction = INTERACTIONS[interactionIndex % INTERACTIONS.length];
    setInteractionIndex((current) => current + 1);
    setMotion(reduceMotion ? 'idle' : interaction.motion);
    setInteractionMessage(interaction.message);
    if (!reduceMotion) setSparkleKey((current) => current + 1);

    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setMotion('idle');
      setInteractionMessage(null);
    }, 2200);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 5;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 3;
    event.currentTarget.style.setProperty('--companion-look-x', `${x.toFixed(1)}px`);
    event.currentTarget.style.setProperty('--companion-look-y', `${y.toFixed(1)}px`);
  };

  const resetLook = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty('--companion-look-x', '0px');
    event.currentTarget.style.setProperty('--companion-look-y', '0px');
  };

  return (
    <aside className="workspace-companion-area" aria-label="桌面伙伴">
      <Popover>
        <PopoverTrigger
          render={(
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="workspace-companion-switcher"
              aria-label={`切换陪伴角色，当前为${companion.name}`}
            >
              <img src={companion.src} alt="" draggable={false} />
            </Button>
          )}
        />
        <PopoverContent
          className="workspace-companion-popover"
          side="bottom"
          align="end"
          sideOffset={7}
          arrow={false}
        >
          <PopoverTitle>陪伴角色</PopoverTitle>
          <PopoverDescription>角色只在你主动点击时互动。</PopoverDescription>
          <div className="workspace-companion-picker" aria-label="选择陪伴角色">
            {COMPANIONS.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="sm"
                className={`workspace-companion-choice${item.id === companionId ? ' is-active' : ''}`}
                onClick={() => setCompanionId(item.id)}
                aria-label={`选择${item.name}`}
                aria-pressed={item.id === companionId}
              >
                <img src={item.src} alt="" draggable={false} />
                <span>{item.name}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        className={`workspace-companion-character companion-motion--${motion}`}
        onClick={interact}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetLook}
        aria-label={`和${companion.name}互动`}
        aria-describedby="workspace-companion-message"
        title={`点击和${companion.name}互动`}
      >
        <span className="workspace-companion-look">
          <img
            key={companionImage}
            className={companionImage === companion.src ? '' : 'is-expression'}
            src={companionImage}
            alt=""
            draggable={false}
          />
        </span>
        <span key={sparkleKey} className="workspace-companion-sparkles" aria-hidden="true">
          <i>✦</i>
          <i>♥</i>
          <i>✧</i>
        </span>
      </button>

      <p
        id="workspace-companion-message"
        className="workspace-companion-message"
        aria-live="polite"
      >
        <span>{interactionMessage ?? statusMessage}</span>
        <small>点击互动</small>
      </p>
    </aside>
  );
}

function isCompanionId(value: string): value is CompanionId {
  return COMPANIONS.some((item) => item.id === value);
}

function buildStatusMessage(data: UsageSnapshot | null, providerCount: number): string {
  const constrained = data
    ? mostConstrainedCodexWindow(data.window_5h, data.window_weekly)
    : null;
  if (constrained) {
    const used = Math.round(constrained.window.percent);
    if (used >= 85) return `${constrained.label}已用 ${used}%，建议留些余量。`;
    if (used >= 60) return `${constrained.label}已用 ${used}%，节奏还不错。`;
    return `${constrained.label}还剩 ${Math.max(0, 100 - used)}%。`;
  }
  return providerCount > 0
    ? `已连接 ${providerCount} 个 Provider。`
    : '还没有检测到 Provider。';
}
