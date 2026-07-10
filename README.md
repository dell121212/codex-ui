# codex-ui

Codex has dedicated desktop apps for Windows and macOS, but Linux users are often left with the CLI alone. That makes a simple question surprisingly awkward: how much usage is left, and when does the next reset happen?

codex-ui exists to close that gap. It is a lightweight Linux tray dashboard for Codex usage that can stay out of the way until you need it. Run one script, let it read your existing Codex login, and keep your usage windows and reset times visible without repeatedly copying tokens or remembering setup steps.

Built with Neutralino + React + TypeScript.

## Screenshots

<p align="center">
  <img width="615" height="698" alt="codex-ui preview" src="https://github.com/user-attachments/assets/ce11be6b-54d2-4fad-b1cd-67465aec918a" />
</p>

<p align="center">
  <img src="./截图%202026-07-10%2013-27-13.png" alt="Codex usage dashboard" width="360" />
  <img src="./截图%202026-07-10%2013-27-20.png" alt="codex-ui settings" width="360" />
</p>

## Highlights

- Reads authenticated usage through the local Codex app-server
- Starts `codex login` for you when no token is available
- One-command setup and launch with `./run.sh`
- Simple autostart setup from the settings panel
- Dashboard for primary limits, independent legacy-model limits, and reset times
- Shows server-reported reset credits and consumes them only on explicit confirmation
- Estimates API-equivalent USD cost from local Codex sessions
- Keeps a taskbar entry on Zorin / Wayland so the window remains recoverable

## Use

Run one script:

```bash
./run.sh
```

The script installs project dependencies, prepares the pinned Neutralino runtime, detects Codex auth, runs `codex login` when needed, builds the app, and starts it. It does not install system packages by default.

## Developer Checks

```bash
npm test
npm run typecheck
npm run build
```

## App Directory

Generated app files:

```text
neutralino-dist/codex-ui/
```

Linux x64 binary:

```text
neutralino-dist/codex-ui/bin/neutralino-linux_x64
```

Autostart can be enabled from the settings panel; for normal use, only run `./run.sh`.

## Zorin / Wayland

The app keeps a normal taskbar entry so users can always bring the dashboard back even if the tray icon is unavailable.

On Zorin GNOME Wayland, `run.sh` checks the built-in Zorin AppIndicator extension:

```text
zorin-appindicator@zorinos.com
```

To explicitly install or enable tray support, run:

```bash
./run.sh --setup-tray
```

If the extension was just enabled, log out and log back in before expecting the tray icon to appear. The main window remains available from the taskbar either way.

## Auth

The app automatically reads:

```text
~/.codex/auth.json
```

If no Codex token is available, `run.sh` starts `codex login`. The user only needs to follow the Codex browser/CLI authorization prompt.

The app does not store ChatGPT cookies. On older Codex CLI versions without a compatible app-server, it falls back to read-only HTTP requests with the same CLI token.

## Data Notes

- All quota buckets come from `account/rateLimits/read` and are rendered dynamically by server-provided `limitId`.
- Reset availability comes from `rateLimitResetCredits.availableCount`; only `reset` and `alreadyRedeemed` outcomes count as success.
- USD figures are API-equivalent estimates, not subscription charges. Unknown models are left unpriced instead of receiving a guessed default price.
