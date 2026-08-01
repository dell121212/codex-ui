# UI Implementation Contract

## Frozen business behavior

- Usage and quota values continue to come from `usageStore` and existing services.
- Provider drag, ordering, removal, and local persistence remain unchanged.
- Settings load/save and Neutralino integration remain unchanged.
- Reset confirmation and reset execution remain unchanged.
- Browser preview fixtures remain test-only and do not replace production data.

## Stack decision

- Package manager: pnpm 10.33.4.
- Runtime: React 19 and React DOM 19.
- Styling: Tailwind CSS 4 plus Appica UI 1.0.0 tokens.
- Component library: `@appica/ui-react` 1.0.0, imported by subpath.
- Icons: existing `lucide-react` remains until a separate icon migration is justified.

## Component mapping

| Product need | Appica primitive | Product composite | State/data owner |
| --- | --- | --- | --- |
| Workspace actions | Button, Tooltip, Navigation | AppToolbar | Popover workspace state |
| Refresh status | Button, Tooltip, Badge, Spinner | SyncControl | usageStore |
| Provider selection | ToggleGroup, Badge, Tooltip | DashboardComposer | dashboard storage |
| Provider connection list | Table, Badge, ScrollArea | ProvidersWorkspace | localProviders |
| Quota presentation | Progress, Meter, Badge, Tooltip | ProviderQuotaDashboard | usage logic |
| Reset confirmation | AlertDialog, Button | ResetPanel | usageStore |
| Settings controls | Switch, ToggleGroup, Button, Alert | SettingsPanel | settings service |
| Task editor | Dialog, Field, Input, Select, Button | BoardTaskDialog | boardStore |
| Companion selection | Popover, Tooltip, ToggleGroup | WorkspaceCompanion | local preference |
| Motion preference | ReducedMotionProvider, Switch | Companion preferences | local preference |

## First implementation slice

1. Install and configure the compatible Appica foundation.
2. Add theme and reduced-motion providers at the application root.
3. Replace SettingsPanel switches, interval choices, alerts, and action buttons.
4. Replace AppToolbar icon actions and tooltips.
5. Move the companion picker into a Popover and stop continuous idle motion.
6. Convert reset confirmation to AlertDialog if its API fits the existing async flow.

## Deferred composites

- Quota ring SVG and quota density layouts.
- DnD Provider dashboard and board interactions.
- Usage aggregation charts and model rows.
- Full Provider table migration.

These remain visually compatible during the first slice and are migrated only
after the foundation passes regression tests.

## Responsive/state matrix

| Surface | Desktop | Narrow | Reduced motion | Loading/error |
| --- | --- | --- | --- | --- |
| Toolbar | Icon rail with tooltips | Same rail | No spinning beyond progress need | Warning badge and retry |
| Settings | Grouped sections | Single column | No decorative transitions | Alert keeps user input |
| Companion | Character plus contextual copy | Character only | Static image | Most constrained quota/error |
| Popover/dialog | Anchored/focused | Viewport constrained | Instant open/close | Action remains reachable |

## Acceptance

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:browser`
- Visual review at 940x720 and 680x600.
- Keyboard focus review for navigation, settings, Popover, and dialogs.
- No regression in Provider drag, persisted companion selection, reset flow, or settings save.
