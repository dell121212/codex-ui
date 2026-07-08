# codex-bar-lite

Lightweight Linux tray widget for Codex usage, built with Neutralino + React.

## Use

Run one script:

```bash
./run.sh
```

The script checks dependencies, prepares Neutralino, detects Codex auth, runs `codex login` when needed, clears stale dev processes, and starts the app.

## Commands

```bash
./run.sh              # dev mode
./run.sh --build      # build Neutralino package
./run.sh --run        # run packaged Linux binary

npm test
npm run typecheck
npm run build
```

## Output

Packaged app:

```text
neutralino-dist/codex-bar-lite/
```

Linux x64 binary:

```text
neutralino-dist/codex-bar-lite/bin/neutralino-linux_x64
```

## Zorin / Wayland

The app is designed as a tray widget, so it intentionally uses `skipTaskbar: true`.

On Zorin GNOME Wayland, `run.sh` checks the built-in Zorin AppIndicator extension:

```text
zorin-appindicator@zorinos.com
```

If the extension was just enabled, log out and log back in before expecting the tray icon to appear.

## Auth

The app automatically reads:

```text
~/.codex/auth.json
```

If no Codex token is available, `run.sh` starts `codex login`. The user only needs to follow the Codex browser/CLI authorization prompt.

Cookie input remains as a fallback only.
