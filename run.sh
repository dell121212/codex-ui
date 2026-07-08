#!/usr/bin/env bash
# codex-ui one-shot launcher
#
# Usage:
#   ./run.sh             Install, build, and start the app
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}▸${NC} $*"; }
info() { echo -e "${CYAN}i${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

APP_BIN="neutralino-dist/codex-ui/bin/neutralino-linux_x64"

has_codex_auth() {
  node -e '
const fs = require("fs");
const path = `${process.env.HOME}/.codex/auth.json`;
try {
  const auth = JSON.parse(fs.readFileSync(path, "utf8"));
  const token = auth?.tokens?.access_token || auth?.tokens?.accessToken || auth?.access_token || auth?.accessToken;
  process.exit(typeof token === "string" && token.trim() ? 0 : 1);
} catch {
  process.exit(1);
}
' >/dev/null 2>&1
}

print_header() {
  echo -e "${BOLD}${BLUE}"
  echo "  ╔════════════════════════════════╗"
  echo "  ║      codex-ui  v0.1.0         ║"
  echo "  ║   Neutralino · Codex usage    ║"
  echo "  ╚════════════════════════════════╝"
  echo -e "${NC}"
}

ensure_command() {
  local name="$1"
  local hint="$2"
  command -v "$name" >/dev/null 2>&1 || err "未找到 $name。$hint"
}

ensure_node() {
  log "检查 Node.js / npm..."
  ensure_command node "请先安装 Node.js 20+。"
  ensure_command npm "请先安装 npm。"

  local node_ver node_major
  node_ver="$(node --version)"
  node_major="$(echo "$node_ver" | tr -d 'v' | cut -d. -f1)"
  if [[ "$node_major" -lt 20 ]]; then
    warn "Node.js $node_ver 低于建议版本 v20，可能无法正常运行。"
  else
    ok "Node.js $node_ver"
  fi
}

ensure_npm_deps() {
  if [[ ! -d node_modules ]] || [[ package.json -nt node_modules/.package-lock.json ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
    log "安装/更新 npm 依赖..."
    npm install --loglevel=error
    ok "npm 依赖已就绪"
  else
    ok "npm 依赖已就绪"
  fi
}

ensure_neutralino_runtime() {
  if [[ ! -f neutralino.js ]] || [[ ! -x bin/neutralino-linux_x64 ]]; then
    log "下载 Neutralino 运行时..."
    npx neu update
    ok "Neutralino 运行时已就绪"
  else
    ok "Neutralino 运行时已就绪"
  fi
}

ensure_icons() {
  mkdir -p public/icons
  [[ -f public/icons/tray.png ]] || warn "缺少 public/icons/tray.png，托盘图标可能不可用。"
  [[ -f public/icons/app.png ]] || warn "缺少 public/icons/app.png，窗口图标可能不可用。"
}

ensure_tray_support() {
  [[ "$(uname -s)" == "Linux" ]] || return

  local session="${XDG_SESSION_TYPE:-unknown}"
  local desktop="${XDG_CURRENT_DESKTOP:-unknown}"
  info "桌面会话：${desktop} / ${session}"

  local missing=()
  if command -v apt-get >/dev/null 2>&1; then
    dpkg -s libayatana-appindicator3-1 >/dev/null 2>&1 || missing+=("libayatana-appindicator3-1")
  fi

  if [[ "$desktop" == *zorin* || "$desktop" == *Zorin* ]]; then
    local zorin_ext="zorin-appindicator@zorinos.com"
    if [[ -d "/usr/share/gnome-shell/extensions/$zorin_ext" || -d "$HOME/.local/share/gnome-shell/extensions/$zorin_ext" ]]; then
      if command -v gnome-extensions >/dev/null 2>&1; then
        if gnome-extensions list --enabled 2>/dev/null | grep -Fxq "$zorin_ext"; then
          ok "Zorin AppIndicator 扩展已启用"
        else
          warn "Zorin AppIndicator 扩展未启用，正在启用..."
          if gnome-extensions enable "$zorin_ext" 2>/dev/null; then
            ok "Zorin AppIndicator 扩展已启用"
            [[ "$session" == "wayland" ]] && warn "Wayland 会话下扩展刚启用后可能需要注销/重登才完全生效。"
          else
            warn "无法自动启用 Zorin AppIndicator 扩展；托盘图标可能不可见。"
          fi
        fi
      else
        warn "未找到 gnome-extensions，无法检测 Zorin AppIndicator 扩展状态。"
      fi
    else
      warn "未找到 Zorin AppIndicator 扩展目录；托盘图标可能不可见。"
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    dpkg -s gnome-shell-extension-appindicator >/dev/null 2>&1 || missing+=("gnome-shell-extension-appindicator")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "缺少托盘支持组件：${missing[*]}"
    if sudo apt-get update -qq && sudo apt-get install -y "${missing[@]}"; then
      ok "托盘支持组件已安装"
      [[ "$session" == "wayland" ]] && warn "Wayland 会话下新安装的 Shell 扩展可能需要注销/重登才生效。"
    else
      warn "托盘支持组件安装失败。应用仍会启动，但托盘图标可能不可见。"
    fi
  else
    ok "托盘运行库已就绪"
  fi
}

ensure_codex_login() {
  log "检测 Codex 登录态..."

  if has_codex_auth; then
    ok "已读取 ~/.codex/auth.json"
    return
  fi

  if ! command -v codex >/dev/null 2>&1; then
    warn "未找到 codex 命令。应用仍会启动，但远端配额不可用，仅显示本地数据。"
    return
  fi

  warn "未检测到 Codex 登录态，脚本将自动启动 Codex 登录流程。"
  info "按 Codex CLI 提示在浏览器中完成授权；完成后脚本会继续启动应用。"

  if codex login; then
    if has_codex_auth; then
      ok "Codex 登录完成"
    else
      warn "codex login 已结束，但仍未检测到 access token；应用会以本地数据模式启动。"
    fi
  else
    warn "Codex 登录未完成；应用会以本地数据模式启动。"
  fi
}

clear_old_app_processes() {
  local pids
  pids="$(pgrep -f 'neutralino-linux_x64|codex-ui/bin/neutralino' || true)"
  if [[ -n "$pids" ]]; then
    warn "检测到旧的 codex-ui/Neutralino 进程，正在关闭..."
    # shellcheck disable=SC2086
    kill $pids || true
    sleep 0.5
  fi
}

build_app() {
  log "构建应用..."
  rm -rf dist neutralino-dist/codex-ui
  npm run neutralino:build
  ok "构建完成"
}

run_app() {
  build_app
  clear_old_app_processes
  log "启动应用..."
  "$APP_BIN"
}

print_header
if [[ "$#" -gt 0 ]]; then
  warn "run.sh 不需要参数，已忽略：$*"
fi
ensure_node
ensure_npm_deps
ensure_neutralino_runtime
ensure_icons
ensure_tray_support
ensure_codex_login
run_app
