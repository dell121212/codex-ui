# Codex UI Design System

## Design source

The visual source of truth is OpenDesign's `warm-editorial` system:

`/home/chenkai/文档/AI-desgin/design-systems/warm-editorial/DESIGN.md`

Codex UI adapts that editorial system to a compact desktop utility. It keeps the
palette, typography hierarchy, restrained elevation, and single-accent rule,
while replacing marketing-page hero heights with desktop workspace density.

## Product character

Codex UI is a calm local usage workspace with a quiet companion layer. Data is
professional and precise; personality appears through concise microcopy and the
optional workspace companion, never through decorative dashboard noise.

### Required

- Warm paper surfaces and warm near-black text.
- One primary accent per screen.
- Serif only for page titles and high-value numbers; sans-serif for controls and data.
- Hairline borders and whitespace before shadow.
- Functional motion triggered by state changes or direct interaction.
- Complete focus, disabled, loading, empty, error, and reduced-motion states.

### Avoid

- Gradients, glassmorphism, neumorphism, neon glows, or large tinted card walls.
- More than one competing accent in the same workspace.
- Permanent mascot motion or a permanently expanded character picker.
- Invented Provider counts or status copy that contradicts the primary quota window.
- Page-specific restyling of shared primitives.

## Tokens

### Color

- Paper background: `#FAF7F2`
- Primary foreground: `#1C1A17`
- Terracotta accent: `#C0512F`
- Forest secondary: `#2F5B4F`
- Muted text: `#8A817A`
- Raised surface: `#FFFFFF`

Pure black and pure white are not used for user-facing backgrounds or text.
Provider colors may appear only in Provider identity, progress, and comparison data.

### Type

- Display: `GT Sectra`, then `Times New Roman`, then serif.
- Body: `Söhne`, then the platform system sans-serif stack.
- Mono: `JetBrains Mono`, then the platform monospace stack.
- Product scale: 12, 14, 16, 20, 28, 40px.
- Data uses tabular numerals.

### Shape and elevation

- Small controls: 8px radius.
- Buttons and compact surfaces: 12px radius.
- Cards and dialogs: 16px radius.
- No radius above 24px.
- Flat by default; popovers, dialogs, and hover-raised cards may use one 2px/16px/6% shadow.

### Motion

- Enter: about 200ms with `cubic-bezier(0.23, 1, 0.32, 1)`.
- Exit: about 140ms with the same ease-out curve.
- Never animate from scale zero.
- System reduced-motion and the in-app animation preference disable non-essential motion.

## Workspace hierarchy

1. Compact application rail.
2. Page title and the most important current state.
3. Primary quota window and reset time.
4. Supporting cost, model, and Provider analysis.
5. Contextual actions and optional companion feedback.

The 940x720 desktop viewport is the primary composition target. The primary quota
and the beginning of supporting analysis must be visible without scrolling.

## Companion contract

- The current character is visible; the full picker lives in an Appica Popover.
- Idle is static. Short animation is allowed after refresh, warning state, or click.
- Copy reports the most constrained valid quota window.
- Warning and error messages include a meaningful next action.
- Selection and motion preferences persist locally.

## Component ownership

Appica UI owns generic primitives such as Button, Tooltip, Popover, Dialog,
AlertDialog, Switch, Tabs, ToggleGroup, Field, Input, Select, Badge, Progress,
Table, ScrollArea, Skeleton, and Toast.

Codex UI owns business composites such as quota dashboards, Provider drag and
drop, usage aggregation views, Neutralino settings behavior, and companion
expressions. Business composites compose Appica primitives instead of cloning them.
