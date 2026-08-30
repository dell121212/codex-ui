# codex-ui UI Implementation Contract

This document is the implementation handoff for the OpenDesign design-system
mode. It separates facts deliberately:

- **Business truth:** this repository's services, stores, types, tests, routes,
  selectors, persistence, and side effects.
- **Design truth:** only `/home/chenkai/文档/ui-素材/OmniRoute-UI精选`.
- **Design orchestration:** `/home/chenkai/文档/AI-desgin` provides the
  OpenDesign contract and workflow; it does not provide business data or patch
  this repository.

## 1. Frozen business contract

The product remains a local AI usage and quota console for developers and AI
tool users. `src/App.tsx:3-14` mounts the app and starts the store. The
following are frozen and must not be replaced by static UI data:

- Snapshot acquisition, local-first capture, remote quota enrichment, cache,
  refresh scheduling, continuity merge, auth, settings, notification, and
  reset behavior in `src/services/neutralinoBackend.ts` and
  `src/store/usageStore.ts`.
- Codex rollout/token parsing in `src/services/codexLocalUsage.ts` and
  `src/services/usageLogic.ts`.
- Provider probes, local activity, Grok/Mistral remote quota enrichment, and
  six-company catalog in `src/services/localProviders.ts` and
  `src/services/agentCatalog.ts`.
- Usage fields and reset/settings/Provider contracts in `src/types.ts:1-195`.
- Existing browser selectors and user journeys in
  `tests/browser_ui_regression.mjs`.
- Persistence keys: `codex-ui-dashboard-providers-v1`,
  `codex-ui-companion-v1`, and `codex_local_token_subtotal_v1`.
- `usageStore.ts:158-355` `previewSnapshot` is test-only and must not become
  production data.

The only permitted production change is presentation, layout, responsive
composition, semantic labeling, and accessibility-safe state presentation.

## 2. Reachable surface and 100% old-to-new mapping

There is no router. `src/components/Popover.tsx:10-138` owns
`overview|usage|providers|settings`; DEV-only `?workspace=` selects a view.
`AppToolbar.tsx:12-127` exposes the three main navigation entries and settings.

| Existing capability / entry | Real data, action, and state | New OmniRoute-backed placement | Implementation owner |
| --- | --- | --- | --- |
| Application shell and workspace navigation | Local workspace state, first-launch redirect, refresh/sync status, error indicator | Dark graph-paper shell, compact rail, active coral navigation, Tooltip labels | `Popover.tsx`, `AppToolbar.tsx`, `main.tsx`, CSS |
| Overview heading and Provider count | `local_providers`; unavailable must show waiting/unknown, not an invented count | Page header + compact status badge | `Popover.tsx` |
| Setup/auth banner | `NO_AUTH`, `COOKIE_EXPIRED` open settings; `NETWORK_ERROR`/`PARSE_ERROR` remain non-clickable; detail/error copy | OmniRoute Callout/Badge treatment with explicit next action and focus state | `SetupBanner.tsx` |
| Provider palette | `COMPANY_LIST`; click/drag add; selected state; provider color identity | Flat Provider chips/cards with status dot, coral/Provider-color selected state | `DashboardComposer.tsx` |
| Provider dashboard DnD | dnd-kit pointer/keyboard sensors, reorder/remove, last-Codex safeguard, `codex-ui-dashboard-providers-v1` | Dense responsive card grid; visible drag/remove controls and drop target | `DashboardComposer.tsx` |
| Codex official quota | Five-hour preferred, weekly fallback, secondary weekly, remote source, reset footer | Quota card using ring plus compact progress/MetricCard grammar; no fake limit | `CodexUsageDashboard.tsx`, `ProviderQuotaDashboard.tsx` |
| Other Provider quota/local activity | Remote-first primary/secondary if valid; local fallback, previous/current/month/total | Same quota composite with neutral/local/error states and Provider identity color | `ProviderQuotaDashboard.tsx`, `DashboardComposer.tsx` |
| Period cards | Current/month/total, previous period where available, exact token labels, cost estimate/unpriced models | OmniRoute segmented tabs + flat MetricCards; horizontal keyboard-scroll row on narrow views | `UsagePeriodCards.tsx` |
| Local Token subtotal | Checkpoint-based usage and async reset; does not affect official quota | Compact supporting card with outlined action, success/error status | `TokenSubtotalPanel.tsx` |
| Model usage ranking | Current/month model aggregation, cached tokens, cost, empty state | Dense model list with monospace numbers, thin progress bars, empty panel | `ModelList.tsx` |
| OpenAI independent quotas | Rate-limit buckets, used-model pinning, progress/reset display | Data/status table rows with QuotaProgressBar semantics | `QuotaList.tsx` |
| Usage analysis page | `buildUsagePortfolio`, period switch, Provider contribution, share bars, model list, quota list | Analytics workspace modeled on OmniRoute analytics screenshot: summary tabs, metrics, dense rows | `UsageAnalysisWorkspace.tsx` |
| Provider connections page | Six catalog entries, connected/local/off status, month tokens/source, open-to-usage | ProviderCard/DataTable/StatusDot pattern; all rows and source states retained | `ProvidersWorkspace.tsx` |
| Settings/auth | Load/save settings, Codex auth check, refresh after recheck, autostart, interval, 90% notify, save error | Grouped dark settings sections, segmented interval, Switch, Alert, sticky actions | `SettingsPanel.tsx` |
| Official reset | App-server/HTTP reset through store; outcomes reset/alreadyRedeemed/nothingToReset/noCredit/failed; disabled without credit | Appica AlertDialog with danger action and visible disabled/loading/feedback states | `ResetPanel.tsx` |
| Companion picker/interaction | Local selection, wave/hop/cheer, status copy, reduced motion, local persistence | Optional compact shell companion; Appica Popover picker; no permanent motion | `WorkspaceCompanion.tsx` |
| Loading/suspense | Lazy workspace fallback | OmniRoute skeleton/status surface while retaining `role=status` | `Popover.tsx`, CSS |
| Keyboard/focus/reduced motion | Existing native/Appica semantics, dnd keyboard sensor, reduced-motion provider | Visible focus ring, no essential motion, no hidden action-only-on-hover | All owned UI files/CSS |

Board components (`BoardPanel`, `BoardColumn`, `BoardTaskCard`,
`BoardTaskDialog`) have no reachable entry from `Popover.tsx`; they remain
unchanged and are not added to navigation by this redesign.

## 3. OmniRoute design and token mapping

The sole visual reference is `ui-素材/OmniRoute-UI精选`:

- `01-设计基础/globals.css`: `#0b0e14` background, `#10141e` sidebar,
  `#161b22` surface, `#111520` alternate surface, white-alpha borders,
  `#e6e6ef` text, `#a1a1aa` muted text, coral `#e54d5e`, purple `#8b5cf6`,
  green `#22c55e`, amber `#f59e0b`, red `#ef4444`.
- `02-基础组件/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Tooltip.tsx`,
  `Tabs.tsx`, `Modal.tsx`, `SegmentedControl.tsx`: flat controls, restrained
  radii, visible focus/disabled states.
- `03-数据与状态组件/MetricCard.tsx`, `DataTable.tsx`, `StatusDot.tsx`,
  `QuotaMiniBar.tsx`, `QuotaProgressBar.tsx`: dense data/status patterns.
- `04-复杂交互组件/ProviderCard.tsx`: Provider identity and connection state.
- `06-视觉素材/screenshots/01-providers.png`, `03-analytics.png`,
  `06-settings.png`, `07-cli-tools.png`, `08-usage.png`: page composition and
  loading/filter/status references.

| codex-ui token/primitive | OmniRoute source | Rule |
| --- | --- | --- |
| `--bg0`, `--bg1`, `--bg2` | `globals.css` dark tokens | `#0b0e14`, `#10141e`, `#161b22/#111520`; never warm paper |
| `--sep`, `--sep-soft` | `globals.css` border tokens | 1px fine separators; stronger border on hover/focus |
| `--blue`, `--purple`, `--orange`, `--green`, `--red` | OmniRoute semantic palette | blue/info, purple/accent, coral/primary, green/warning/success, red/danger |
| `.card` | `Card.tsx` | flat surface, no blur/gradient/glow |
| `.btn-*`, Appica Button | `Button.tsx` | primary coral, secondary/outline/ghost, disabled/loading preserved |
| `.usage-state`, `.provider-connection` | `StatusDot.tsx`, ProviderCard | dot plus text, never color alone |
| `.progress-bg/.progress-fill` and quota tracks | QuotaMiniBar/QuotaProgressBar | thin, semantic, bounded values and reset copy |

## 4. State and responsive matrix

| Surface | Default | Loading | Empty/unavailable | Warning/error | Disabled/focus/selected |
| --- | --- | --- | --- | --- | --- |
| Shell/sync | connected status | `正在同步`, disabled refresh | unknown count/waiting | sync warning and retry remains reachable | active nav + visible focus ring |
| Setup banner | absent | n/a | n/a | four existing error kinds; only auth kinds open settings | keyboard Enter/Space for clickable banner |
| Quota | real window/ring | waiting/neutral | no limit/local-only | >=75 warning, >=90 critical | reset disabled without credit; focus on actions |
| Provider card | real source/status | source pending | no local/remote data copy | remote error/local fallback | selected DnD card, visible drag/remove focus |
| Period/model/list | real aggregation | workspace status | no session data | unpriced cost stays explicit | selected period, keyboard scroll |
| Settings | loaded settings | auth/save spinner | auth unknown | save error keeps fields | Switch/toggle/action focus and disabled states |
| Reset/subtotal | real available count | reset/clear text | no credit/checkpoint absent | outcome feedback | danger action disabled/loading, dialog focus |
| Companion | static idle | no essential animation | waiting first sync | status copy/interaction | picker pressed state and reduced motion |

Responsive targets are 940x720 desktop, 840px reduced padding/stacked palette,
760px 64px rail + one-column cards + horizontal period scroller, and 560px
compact controls. `prefers-reduced-motion` disables decorative transitions and
smooth scrolling.

## 5. OpenDesign handoff and ownership

OpenDesign's design-system mode is documented in
`/home/chenkai/文档/AI-desgin/docs/modes.md:173-229`; its canonical output is
the nine-section `DESIGN.md` plus optional `preview.html`/`tokens.json`. The
local design-system reader is:

```bash
od tools design-systems read --path <manifest-declared-path> [--design-system <id>]
```

The importer contract is described in
`/home/chenkai/文档/AI-desgin/apps/daemon/src/design-system-import.ts:143-156,431-443,539-562`.
This task uses the inspected OmniRoute files as the input facts and does not
claim daemon execution or generated artifacts. Codex is the sole writer of the
target production files.

## 6. Verification contract

Run from the target repository after implementation:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
pnpm test:browser
git diff --check -- DESIGN.md docs/UI_IMPLEMENTATION_CONTRACT.md src/main.tsx src/index.css src/appica-theme.css src/reference-skin.css src/components/Popover.tsx src/components/AppToolbar.tsx src/components/DashboardComposer.tsx src/components/ProviderQuotaDashboard.tsx src/components/CodexUsageDashboard.tsx src/components/UsageAnalysisWorkspace.tsx src/components/UsagePeriodCards.tsx src/components/ModelList.tsx src/components/QuotaList.tsx src/components/ProvidersWorkspace.tsx src/components/SetupBanner.tsx src/components/SettingsPanel.tsx src/components/ResetPanel.tsx src/components/TokenSubtotalPanel.tsx src/components/WorkspaceCompanion.tsx
git status --short
```

Browser evidence must cover preview data only through the existing test path,
the main 940x720 view, 680x600/narrow view, navigation, companion picker,
Provider DnD persistence, period switching, subtotal reset, reset dialog, and
settings save/recheck. Dirty paths present before this task must be reported
separately from implementation changes.
