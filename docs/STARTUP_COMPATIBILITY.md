# Linux startup compatibility

`./run.sh` and `pnpm neutralino:build` already package the existing ccusage Rust
sidecar through `scripts/build-codex-engine.sh`. The startup failure reproduced
on 2026-10-11 was `Rust/Cargo is required to build the ccusage Codex engine`:
rustup was installed, but Cargo was absent from the launching shell's PATH.

The build helper now checks PATH first and then rustup's standard
`${CARGO_HOME:-$HOME/.cargo}/bin/cargo` location. The launcher runs the same
check before dependency installation and frontend packaging. A missing or
unconfigured toolchain remains an explicit failure rather than shipping an app
without its authoritative statistics engine.

This is a bounded adaptation of the existing build scripts. The ccusage sources,
versions, licenses, retained upstream tests and integration contract remain as
recorded in [UPSTREAM_SOURCES.md](UPSTREAM_SOURCES.md). No new upstream code,
dependency, scanner, storage schema or UI implementation is introduced.

The browser regression now detects installed Chromium, Chrome or Edge (or
`CHROMIUM_BIN`), uses an isolated temporary profile/config directory, handles
launch errors and cleans up its browser and Vite processes. This also fixes the
reproduced `spawn chromium ENOENT` failure on machines with Edge installed.

GPT model API-equivalent token rates are checked at startup and then once every
24 hours from LiteLLM's shared price catalog. Valid rates are cached in
Neutralino storage. Offline runs retain the cached rates and the built-in table.

Validation: Bash syntax and toolchain preflight; TypeScript, lint and production
build; 83 frontend tests; 5 existing Rust bridge tests; browser drag/persistence,
page navigation and layout regression; packaged Linux desktop startup with real
local usage and official quota data. Desktop rendering must be tested in a
graphical session with access to normal application storage.

## Application-menu launcher repair (2026-11-09)

The installed application-menu entry still referenced a removed checkout after
the project was moved. The background autostart entry and packaged application
were valid; launching the old menu entry could never reach that application.

Implementation contract: reuse the existing Desktop Entry escaping from
`linuxAutostart.ts` in a shared JavaScript module usable by both Node and the
renderer. Keep Neutralino core 6.5.0 / client 6.8.0 and the existing build and
autostart adapters. The [Desktop Entry Exec specification](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html)
and [XDG Base Directory 0.8 specification](https://specifications.freedesktop.org/basedir/latest/)
define the host boundary; no upstream implementation, dependency, or licensed
asset is added. Only `applications/codex-ui.desktop` is managed. Usage scanning,
Provider state, settings, storage, and the separate autostart entry are retained.

`pnpm desktop:install` installs or repairs the current checkout's menu entry
after `pnpm neutralino:build`. Menu launches use `--show`; autostart continues
to use `--background`. After moving the checkout, run the install command
again. A successful normal `./run.sh` launch also refreshes an already installed
entry; `./run.sh --build` leaves desktop files untouched. Absolute
`XDG_DATA_HOME` is supported, with `~/.local/share` as the default. Missing build
artifacts fail before changing the entry, and installation uses atomic rename.

Compatibility checks retain existing autostart tests and add isolated Node
regressions for relocation, explicit window display, build failures, XDG
directories, and real GIO argument parsing with special-character paths.
`pnpm test:launcher` runs these checks without changing the user's menu or data.

Real GIO launch tests also reproduced a gap in the previous quoting-only
autostart checks: GIO resolves the executable before expanding `%%`. Paths
containing `%` now use `/usr/bin/env` as the command and the quoted executable
as its argument, for both menu and autostart entries. Executable paths containing
`=` are rejected as required by the Desktop Entry specification.

## Reset-credit selection audit (2026-11-09)

The reset button previously submitted the first credit ID even when that entry
was already redeemed and a later credit was available. The existing UI already
filters credit status when displaying expiry. Reuse that same status rule for
the submitted ID; when the server only supplies a count, keep the existing
server-selection fallback. This is a correction within the existing reset
adapter and React component, with no upstream code, dependency, endpoint,
authentication, or persistence change. The browser regression replaces the
reset action with a recorder and checks confirmation submits the available ID;
it never calls an account reset endpoint.

Validation for this audit: TypeScript, ESLint, Bash/Node syntax checks, 113
frontend unit tests, 6 archive tests, 4 launcher regressions, and 5 Rust bridge
tests passed. Browser checks covered both mixed-status credit selection and
the count-only fallback. Production Neutralino/ccusage packaging, package
resource validation, real GTK/tray/window restoration, and isolated autostart
creation/removal passed. The installed menu entry was refreshed using the new
command and accepted by `desktop-file-validate`. No real reset was consumed;
desktop login/reboot was not tested.
