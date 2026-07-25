# codex-ui

<p align="center">
  <strong>See remaining AI quota on Linux — without digging through CLIs or browser tabs.</strong><br/>
  OpenAI Codex · Claude · Grok · Mistral · Kimi · GLM
</p>

<p align="center">
  <a href="./README.zh.md">中文</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#how-it-works">How it works</a>
</p>

<p align="center">
  <img src="./docs/images/hero.png" alt="codex-ui multi-provider dashboard" width="920" />
</p>

---

Codex ships a desktop app on Windows and macOS. On Linux you’re usually left with the CLI — and answering *“how much quota is left?”* means opening terminals, scraping logs, or hopping between web consoles.

**codex-ui** is a lightweight Linux desktop console for multi-company AI usage. Drag providers onto a canvas, read official remaining quota when the vendor exposes it, and keep a tray entry so the answer is one click away.

Built with **Neutralino + React + TypeScript** — not an Electron mega-bundle.

## Features

- **Multi-company palette** — OpenAI Codex, Claude, Grok, Mistral Vibe, Kimi, GLM. Always visible; drag or click to compose your dashboard.
- **Official quota first** — Codex app-server / WHAM windows, Grok billing credits, Mistral rate-limit headers when available. Never confuses session context-window counters with billed usage.
- **Portfolio analytics** — Aggregate tokens, messages, estimated cost, provider share, and cross-company model ranking.
- **Instant open** — Disk stale-while-revalidate cache: paint the last snapshot immediately, refresh remotes in parallel in the background.
- **Local-first auth** — Reads `~/.codex`, `~/.grok`, `~/.vibe` (and friends) automatically. No tokens pasted into the UI.
- **Linux tray + taskbar** — Autostart optional. On Zorin / Wayland the window stays recoverable if the tray icon flakes out.

## Screenshots

<p align="center">
  <img src="./docs/images/dashboard.png" alt="OpenAI Codex weekly quota detail" width="920" />
  <br/>
  <sub>Overview — Codex weekly remaining, reset countdown, model spend</sub>
</p>

<p align="center">
  <img src="./docs/images/usage.png" alt="Cross-provider usage analysis" width="920" />
  <br/>
  <sub>Usage analysis — tokens, cost estimate, provider contribution</sub>
</p>

<p align="center">
  <img src="./docs/images/providers.png" alt="Provider connection status" width="920" />
  <br/>
  <sub>Providers — login state and local data roots at a glance</sub>
</p>

<p align="center">
  <img src="./docs/images/picker.png" alt="Provider palette strip" width="920" />
  <br/>
  <sub>Company palette — compose the canvas with a click or a drag</sub>
</p>

## Quick start

**Requirements:** Linux, Node.js 20+, a graphical session. Optional but recommended: `codex` CLI already logged in.

```bash
git clone https://github.com/dell121212/codex-ui.git
cd codex-ui
./run.sh
```

That’s it. The script installs dependencies, prepares Neutralino, checks Codex auth (`codex login` if needed), builds, and launches the tray UI.

### Developer checks

```bash
npm test
npm run typecheck
npm run build
```

### Binary path after build

```text
neutralino-dist/codex-ui/bin/neutralino-linux_x64
```

## How it works

```text
Open the app
  → paint disk / memory cache (instant if present)
  → phase A: local session scan + last remote numbers
  → phase B: parallel official remotes
       · Codex app-server / WHAM
       · Grok  GET /v1/billing (+ ?format=credits)
       · Mistral rate-limit probe (cached ~10 min)
```

Grok and Mistral **never** treat session context-window counters as billed API usage.

## Local auth (read-only)

| Provider | Typical path |
|----------|----------------|
| OpenAI Codex | `~/.codex/auth.json` |
| Grok / xAI | `~/.grok/auth.json` (OIDC) |
| Mistral Vibe | `~/.vibe/.env` (`MISTRAL_API_KEY`) |
| Claude / Kimi / GLM | respective CLI home dirs when present |

Tokens stay on disk. Network calls use short-lived curl config files that are deleted after use.

## Linux notes (Zorin / Wayland)

The window keeps a normal taskbar entry so you can always recover the dashboard if the tray icon is missing.

Optional tray helper packages / AppIndicator setup:

```bash
./run.sh --setup-tray
```

## Privacy

- Quota cache lives only on your machine (Neutralino storage / small JSON).
- No drivers, no system network rewrites.
- Autostart is off until you enable it in Settings.

## Project layout

```text
src/
  components/   # toolbar, drag canvas, workspaces
  services/     # usage parsing, local providers, Neutralino backend
  store/        # Zustand state
docs/images/    # README screenshots (captured from the running UI)
```

## License / status

Personal open project — expect rough edges. Issues and PRs welcome.

---

<p align="center">
  <sub>Made for Linux users who just want to know how much AI budget is left.</sub>
</p>
