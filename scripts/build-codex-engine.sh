#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/integrations/ccusage-codex/Cargo.toml"
OUT_DIR="$ROOT_DIR/neutralino-dist/codex-ui/bin"
PRICING_INPUT="$ROOT_DIR/integrations/ccusage-codex/litellm-pricing-empty.json"

# Desktop launchers and non-login shells may omit rustup's bin directory.
CARGO_BIN="$(command -v cargo || true)"
if [[ -z "$CARGO_BIN" ]]; then
  CARGO_BIN="${CARGO_HOME:-$HOME/.cargo}/bin/cargo"
fi
[[ -x "$CARGO_BIN" ]] || {
  echo "Rust/Cargo is required to build the ccusage Codex engine. Install Rust via rustup and retry ./run.sh." >&2
  exit 1
}
"$CARGO_BIN" --version >/dev/null
if [[ "${1:-}" == --check ]]; then
  exit 0
fi

cd "$ROOT_DIR"
CCUSAGE_PRICING_JSON_PATH="$PRICING_INPUT" "$CARGO_BIN" build --release --locked --manifest-path "$MANIFEST"
mkdir -p "$OUT_DIR"
install -m 755 "$ROOT_DIR/integrations/ccusage-codex/target/release/codex-ui-ccusage-bridge" "$OUT_DIR/ccusage-codex"
