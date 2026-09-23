#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/integrations/ccusage-codex/Cargo.toml"
OUT_DIR="$ROOT_DIR/neutralino-dist/codex-ui/bin"
PRICING_INPUT="$ROOT_DIR/integrations/ccusage-codex/litellm-pricing-empty.json"

command -v cargo >/dev/null 2>&1 || {
  echo "Rust/Cargo is required to build the ccusage Codex engine." >&2
  exit 1
}

cd "$ROOT_DIR"
CCUSAGE_PRICING_JSON_PATH="$PRICING_INPUT" cargo build --release --locked --manifest-path "$MANIFEST"
mkdir -p "$OUT_DIR"
install -m 755 "$ROOT_DIR/integrations/ccusage-codex/target/release/codex-ui-ccusage-bridge" "$OUT_DIR/ccusage-codex"
