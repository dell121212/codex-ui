# codex-ui

Lightweight Linux tray widget for Codex usage, built with Neutralino + React.

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
