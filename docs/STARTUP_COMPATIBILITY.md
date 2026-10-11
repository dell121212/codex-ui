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
