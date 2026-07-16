# codex-ui

<p align="center">
  <img src="./docs/images/hero.png" alt="codex-ui 实际界面示意" width="900" />
</p>

<p align="center">
  <strong>Linux 托盘里的多公司 AI 额度看板</strong><br/>
  OpenAI Codex · Claude · Grok · Mistral · 月之暗面 · 智谱
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="#快速开始">快速开始</a>
  ·
  <a href="#功能亮点">功能亮点</a>
</p>

---

Codex 在 Windows / macOS 有官方桌面端，Linux 上往往只剩 CLI。想知道 **还剩多少额度、何时重置**，通常要翻终端或网页控制台。

**codex-ui** 是一个轻量托盘应用：不挡路、不装 Electron 全家桶。一条脚本、沿用本机已有登录态，优先展示**官方剩余额度**（在提供方暴露接口时），无需粘贴 token。

技术栈：**Neutralino + React + TypeScript**。

## 界面预览

贴近真实产品 UI（应用内同一套深色 Apple 风格面板）：

<p align="center">
  <img src="./docs/images/dashboard.png" alt="OpenAI Codex 动态周额度仪表盘" width="280" />
  &nbsp;
  <img src="./docs/images/grok.png" alt="Grok 官方周额度与月额度" width="280" />
  &nbsp;
  <img src="./docs/images/picker.png" alt="紧凑公司组件条" width="280" />
</p>

| | |
|---|---|
| **应用框架** | 单层紧凑工具栏；概览、分析、Provider、设置和窗口动作统一排布 |
| **拖拽编排** | 从顶部公司组件库拖入额度画布；支持排序、移除和布局持久化 |
| **综合用量分析** | 汇总所有 AI 的 Token、消息、成本、Provider 贡献占比和跨公司模型排行 |
| **OpenAI** | 服务端动态周额度、可选短周期窗口、本地 Token、模型用量排名 |
| **Grok** | 官方周额度 + 月 credit（`cli-chat-proxy` billing，**不是**上下文窗口） |
| **公司组件库** | 始终在画布上方展开；拖入或点击即可添加额度面板 |

## 功能亮点

| 模块 | 说明 |
|------|------|
| **多公司组件库** | OpenAI / Claude / Grok / Mistral / Kimi / GLM；始终展开，可拖入、点击添加、排序和移除 |
| **OpenAI Codex** | 按 app-server / WHAM 返回时长识别周额度；兼容仅周窗口与旧双窗口账户，并展示重置次数、模型用量与 API 等价估价 |
| **Grok** | 官方 billing：周额度 + Build/Chat + 月 credit |
| **Mistral Vibe** | 月 Token；有 rate-limit 头则用官方，免费档无月 cap 时展示本月本地会话 |
| **热力进度条** | **蓝 → 红**连续渐变：越低越蓝，越高越红 |
| **秒开体验** | 磁盘 SWR：先画上次缓存，后台刷新；远端并行 |
| **本机优先** | 自动读 `~/.codex`、`~/.grok`、`~/.vibe` |
| **Linux 托盘** | 设置里可开开机自启；Zorin / Wayland 保留任务栏入口 |

## 快速开始

```bash
./run.sh
```

脚本会安装依赖、准备 Neutralino、检查 Codex 登录（必要时 `codex login`）、构建并启动托盘 UI。

### 开发校验

```bash
npm test
npm run typecheck
npm run build
```

### 产物路径

```text
neutralino-dist/codex-ui/
neutralino-dist/codex-ui/bin/neutralino-linux_x64
```

## 额度如何加载

```text
打开托盘
  → 有缓存则立刻显示
  → 阶段 A：本地扫描 + 合并上次远端数字
  → 阶段 B：并行官方接口
       · Codex app-server / WHAM
       · Grok  GET /v1/billing（含 ?format=credits）
       · Mistral rate-limit 探测（约 10 分钟缓存）
```

Grok / Mistral **不会**把会话 context 窗口计数当成 API 额度消耗。

## 本机认证路径（只读）

| 公司 | 路径 |
|------|------|
| OpenAI Codex | `~/.codex/auth.json` |
| Grok / xAI | `~/.grok/auth.json`（OIDC） |
| Mistral Vibe | `~/.vibe/.env`（`MISTRAL_API_KEY`） |

界面不粘贴 token。网络请求使用临时 curl 配置文件，用后清理。

## Zorin / Wayland

窗口保留任务栏入口，托盘图标不可用时也能找回看板。

可选：

```bash
./run.sh --setup-tray
```

## 目录结构

```text
src/
  components/     # 工具栏、拖拽额度画布、统一 Provider 面板
  services/       # 用量解析、本地抓取、Neutralino 后端
  store/          # Zustand
docs/images/      # README 截图（HTML mock → PNG）
```

## 隐私与对本机影响

- 额度缓存仅存本机（Neutralino storage / 小 JSON）
- 不装驱动、不改系统网络
- 开机自启仅在你于设置中开启时生效

## 状态

个人开源项目，欢迎 Issue / PR。

---

<p align="center">
  <sub>给只想知道「AI 额度还剩多少」的 Linux 用户。</sub>
</p>
