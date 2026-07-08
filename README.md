# codex-ui

Codex has dedicated desktop apps for Windows and macOS, but Linux users are often left with the CLI alone. That makes a simple question surprisingly awkward: how much usage is left, and when does the next reset happen?

codex-ui exists to close that gap. It is a lightweight Linux tray dashboard for Codex usage that can stay out of the way until you need it. Run one script, let it read your existing Codex login, and keep your usage windows and reset times visible without repeatedly copying tokens or remembering setup steps.

Built with Neutralino + React + TypeScript.

## Highlights

- Automatically reads the Codex token from `~/.codex/auth.json`
- Starts `codex login` for you when no token is available
- One-command setup and launch with `./run.sh`
- Simple autostart setup from the settings panel
- Tray dashboard for 5-hour usage, weekly usage, and reset times
- Keeps a taskbar entry on Zorin / Wayland so the window remains recoverable

## Use

Run one script:

```bash
./run.sh
```

The script installs dependencies, prepares Neutralino, detects Codex auth, runs `codex login` when needed, builds the app, and starts it.

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

If the extension was just enabled, log out and log back in before expecting the tray icon to appear. The main window remains available from the taskbar either way.

## Auth

The app automatically reads:

```text
~/.codex/auth.json
```

If no Codex token is available, `run.sh` starts `codex login`. The user only needs to follow the Codex browser/CLI authorization prompt.

Cookie input remains as a fallback only.
