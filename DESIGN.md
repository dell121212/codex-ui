# codex-ui Design System

## 1. Visual Theme & Atmosphere

codex-ui is a compact local developer console for understanding AI usage,
quota pressure, cost, and Provider connectivity. Its visual source is the
read-only OmniRoute reference package at
`/home/chenkai/文档/ui-素材/OmniRoute-UI精选`, especially:

- `README.md` and `CATALOG.md` for the component and state inventory;
- `01-设计基础/globals.css` for the dark token system;
- `02-基础组件` for Button, Card, Badge, Tooltip, Tabs, Modal, and segmented
  control patterns;
- `03-数据与状态组件` for MetricCard, DataTable, StatusDot,
  QuotaMiniBar, and QuotaProgressBar;
- `04-复杂交互组件/ProviderCard.tsx` for Provider identity and connection
  states;
- `06-视觉素材/screenshots/01-providers.png`, `03-analytics.png`,
  `06-settings.png`, `07-cli-tools.png`, and `08-usage.png` for page density
  and state references.

The application should feel like a focused, information-dense desktop tool:
dark graph-paper backdrop, compact rail, thin separators, flat surfaces, and
small semantic status accents. The primary composition is the Neutralino
940x720 window from `neutralino.config.json`. Personality remains optional
and local to `WorkspaceCompanion`; it must never compete with quota data.

## 2. Color Palette & Roles

The dark palette is adapted directly from
`OmniRoute-UI精选/01-设计基础/globals.css` and its catalog preview:

```css
--od-bg: #0b0e14;             /* application background */
--od-sidebar: #10141e;        /* navigation rail */
--od-surface: #161b22;        /* cards and panels */
--od-surface-alt: #111520;    /* controls and nested surfaces */
--od-border: rgb(255 255 255 / 8%);
--od-border-strong: rgb(255 255 255 / 14%);
--od-text: #e6e6ef;
--od-text-muted: #a1a1aa;
--od-text-faint: #71717a;
--od-primary: #e54d5e;        /* active and primary action */
--od-accent: #8b5cf6;         /* secondary emphasis */
--od-success: #22c55e;
--od-warning: #f59e0b;
--od-danger: #ef4444;
--od-info: #60a5fa;
```

Provider colors are identity/data colors only. They may appear in Provider
badges, comparison bars, and quota progress; they do not recolor the whole
page. No warm paper, gold, glass, neon glow, or decorative gradient token is
part of this system.

## 3. Typography Rules

- Use a compact system sans stack for UI copy: `Inter`, `Segoe UI`,
  `-apple-system`, `Roboto`, `sans-serif`.
- Use the existing monospace stack for paths, Provider sources, model IDs, and
  exact token values.
- Data uses `lining-nums tabular-nums`; exact values remain available in
  `title` and `aria-label` attributes.
- Page headings are 24px/1.2 at desktop, section labels are 10–11px uppercase
  or sentence-case metadata, body copy is 11–13px, and compact values are
  14–28px according to hierarchy.
- Do not introduce a serif display face. Numbers and quota percentages should
  read as operational data, not editorial decoration.

## 4. Component Stylings

Appica owns generic interaction primitives already imported from
`@appica/ui-react`: Button, Tooltip, Popover, AlertDialog, Switch, Toggle,
ToggleGroup, Tabs, ReducedMotionProvider, and ThemeProvider. Existing
components remain the business composites:

| Need | Appica/reference baseline | codex-ui composite |
| --- | --- | --- |
| Application navigation | Button, Tooltip, StatusDot | `AppToolbar` |
| Provider chooser and DnD | Card, Badge, ProviderCard | `DashboardComposer` |
| Official quota | MetricCard, QuotaMiniBar, QuotaProgressBar, StatusDot | `ProviderQuotaDashboard` / `CodexUsageDashboard` |
| Usage analysis | MetricCard, DataTable, Badge | `UsageAnalysisWorkspace`, `ModelList`, `QuotaList` |
| Connections | ProviderCard, DataTable, StatusDot | `ProvidersWorkspace` |
| Settings | Tabs/segmented control, Switch, Button, Alert | `SettingsPanel` |
| Reset confirmation | AlertDialog, danger Button, Badge | `ResetPanel` |
| Optional companion | Popover, Button | `WorkspaceCompanion` |

Cards are flat `#161b22` surfaces with 1px borders and 8–14px radii. Primary
actions use coral, secondary actions use outlined/ghost controls, and status
is conveyed by a dot plus text. Focus rings must remain visible. Loading,
empty, stale, error, disabled, selected, and offline states use the same
surface grammar rather than new decorative variants.

## 5. Layout Principles

- Use a 214px desktop navigation rail and a scrollable content pane, matching
  the dense OmniRoute desktop screenshots while keeping the existing
  `app-shell`, `app-toolbar`, and `workspace-content` selectors stable.
- Keep the content width below 1080px inside the 940px Neutralino window so
  the rail, page heading, current quota, and first supporting metrics are
  visible without an unnecessary horizontal scroll.
- Order content as: page identity → sync/connection state → primary quota or
  contribution → period controls → supporting models, costs, and reset action.
- Keep Provider DnD controls discoverable and keyboard-operable; do not hide
  removal or sorting behind an unannounced hover-only affordance.
- Keep the current reachable workspaces: overview, usage, providers, and
  settings. Board components remain dormant because they have no reachable
  navigation in `Popover.tsx`.

## 6. Depth & Elevation

The base interface is flat. Use only:

- 1px `--od-border` separators between surfaces;
- a stronger border for hover/selected/focus states;
- a restrained `0 12px 32px rgb(0 0 0 / 28%)` shadow for popovers and dialogs;
- no backdrop blur, glass translucency, inner highlights, or glow filters on
  cards, quota rings, buttons, or the application shell.

The graph-paper grid is a low-contrast 32px linear background pattern from the
OmniRoute catalog preview. It must remain behind content and never reduce text
contrast.

## 7. Do's and Don'ts

### Do

- Preserve real data from `usageStore`, `neutralinoBackend`,
  `codexLocalUsage`, `localProviders`, `usageLogic`, and
  `usageAggregation`.
- Preserve all existing storage keys, DnD ordering, reset outcomes, settings
  side effects, keyboard semantics, and reduced-motion behavior.
- Show exact token counts through accessible labels/tooltips while using compact
  visual values.
- Use semantic status colors consistently: green success, amber warning, red
  danger, blue informational/local, coral primary.
- Prefer Appica primitives before adding another base component.

### Don't

- Do not use static preview data in production; `usageStore.ts:158-355` is
  test-only.
- Do not invent Provider counts, quota limits, reset dates, or connectivity
  status when the real data is unavailable.
- Do not add Board navigation, new routes, fake actions, or OmniRoute business
  logic.
- Do not retain warm paper, game/gold decoration, gradients, glassmorphism,
  serif data numerals, or a second competing component library.
- Do not remove the companion, local subtotal, reset, settings, empty, error,
  or disabled states merely because the reference package has no equivalent.

## 8. Responsive Behavior

- Desktop target: 940x720; rail remains 214px and content scrolls vertically.
- At 840px and below, reduce content padding and let the Provider palette stack.
- At 760px and below, use a 64px icon rail, one-column dashboard cards,
  stacked summary metrics, and a horizontally scrollable period row with
  keyboard/Home/End support.
- At 560px and below, keep labels available through tooltips/accessible names,
  keep actions reachable, and avoid clipping quota/reset content.
- Dialogs/popovers are viewport-constrained and retain focus.
- `prefers-reduced-motion: reduce` disables decorative companion motion,
  smooth scrolling, non-essential transitions, and continuous glow effects.

## 9. Agent Prompt Guide

Before changing UI, treat the sources as three separate facts:

1. Target repository code is the business truth. Read the existing component,
   store, service, API, type, test, selector, persistence, and accessibility
   contract before moving it.
2. `ui-素材/OmniRoute-UI精选` is the sole visual truth. Reuse its dark tokens,
   flat shell, compact density, status semantics, and component proportions;
   adapt names and data to codex-ui without copying OmniRoute behavior.
3. OpenDesign is the contract/orchestration layer. Its design-system mode
   emits this `DESIGN.md`, `preview.html`, and optional `tokens.json`; it does
   not own production business patches. The local executable read entry is
   `od tools design-systems read --path <manifest-declared-path>`.

Implementation order: freeze business behavior → map every reachable feature
and state → apply centralized tokens → compose Appica primitives → migrate
each workspace → verify real actions and side effects → check desktop/narrow,
focus, keyboard, loading, empty, error, disabled, selected, and reduced-motion
states. Never claim completion from a screenshot alone.
