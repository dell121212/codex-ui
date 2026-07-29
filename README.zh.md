<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="codex-ui Linux AI 用量与额度工作台">
</p>

<p align="center"><strong>在 Linux 桌面上，一处查看多个 AI 工具的额度、成本和本地用量。</strong></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#真实界面">真实界面</a> ·
  <a href="#隐私与数据来源">隐私与数据来源</a>
</p>

<p align="center">
  <img src="./docs/images/overview-latest.png" alt="codex-ui 用量概览界面" width="1100">
</p>

## 这是什么

`codex-ui` 是一个面向 Linux 的轻量桌面用量工作台。它从本机已安装的 AI CLI 和登录态中读取数据，在同一个界面里展示：

- OpenAI Codex、Claude、Kimi、Grok、Mistral Vibe、GLM 等 Provider
- 官方额度、剩余比例和重置时间（Provider 提供数据时）
- Token、消息数、模型排行、Provider 贡献和 API 等价成本
- 本机连接状态、数据来源和同步状态

它使用 **Neutralino + React + TypeScript**，不打包完整 Electron 运行时。

## 真实界面

### 用量概览

通过 Provider 编排条添加或移除额度面板，概览页集中查看主要额度、重置窗口、成本和活跃模型。

<p align="center">
  <img src="./docs/images/overview-latest.png" alt="用量概览：Provider 编排、Codex 额度和活跃模型" width="1100">
</p>

### 用量分析

按 Provider 汇总今日与本月 Token、成本估价和贡献占比，并继续查看跨公司模型用量。

<p align="center">
  <img src="./docs/images/usage-latest.png" alt="用量分析：Provider 贡献、模型排行和成本" width="1100">
</p>

### Provider 连接

一张表查看每个 Provider 的登录状态、本月活动、数据来源和本机目录。

<p align="center">
  <img src="./docs/images/providers-latest.png" alt="Providers：连接状态、本月活动和数据来源" width="1100">
</p>

## 功能

- **拖拽式额度看板**：点击或拖入 Provider，自由排列额度卡片。
- **官方额度优先**：优先读取 Codex app-server / WHAM、Grok billing、Mistral rate-limit 等官方数据。
- **本地缓存优先**：先显示上次缓存，再在后台并行刷新，减少打开等待。
- **只读本机认证**：读取 `~/.codex`、`~/.grok`、`~/.vibe` 等目录，不要求在 UI 粘贴 Token。
- **Linux 托盘与任务栏**：支持常驻托盘，Wayland 或托盘异常时仍可从任务栏找回窗口。
- **Q 版陪伴角色**：概览页可选择角色，并带有轻量待机动作；不影响数据阅读。

> **非官方粉丝装饰声明**：本项目与《原神》、米哈游、HoYoverse 或任何相关权利方无关联、无授权、无赞助，也不是其官方产品。概览页中的 Q 版角色仅出于个人热爱，用作本地界面装饰，不代表本项目品牌、业务或商业合作；角色相关名称、形象与版权归其各自权利方所有。

## 快速开始

环境要求：Linux、Node.js 20+、图形会话。建议提前完成 `codex login`，其他 Provider 按需配置。

```bash
git clone https://github.com/dell121212/codex-ui.git
cd codex-ui
./run.sh
```

`run.sh` 会安装依赖、准备 Neutralino、检查登录态、构建并启动桌面 UI。

### 开发与验证

```bash
npm install
npm run dev

# 单元测试、类型检查、生产构建
npm test
npm run typecheck
npm run build

# 浏览器拖拽回归
npm run dev
npm run test:browser
```

### 构建产物

```text
neutralino-dist/codex-ui/bin/neutralino-linux_x64
```

## 数据如何进入界面

```text
打开应用
  → 立即读取本地缓存
  → 扫描本机 CLI 登录态与会话数据
  → 并行请求可用的官方额度接口
  → 合并 Provider、模型、Token 和成本数据
```

不同 Provider 的能力不同：没有官方额度接口时，界面会明确显示本地可用或暂无数据，不把会话上下文窗口伪装成 API 账单。

## 隐私与数据来源

- 额度缓存只保存在本机 Neutralino storage / JSON 文件中。
- 认证目录以只读方式扫描，不把 Token 显示在界面里。
- 网络请求使用临时配置，完成后清理。
- 不安装驱动、不改写系统网络；开机自启只有在设置中手动开启后才生效。

典型认证路径：

| Provider | 路径 |
| --- | --- |
| OpenAI Codex | `~/.codex/auth.json` |
| Grok / xAI | `~/.grok/auth.json` |
| Mistral Vibe | `~/.vibe/.env` |
| Claude / Kimi / GLM | 对应 CLI 主目录（存在时） |

## 项目结构

```text
src/components/   # 工具栏、额度卡片、拖拽看板、工作区
src/services/     # Provider 解析、本机数据、Neutralino 后端
src/store/        # 用量与看板状态
docs/images/      # README 使用的真实界面截图
```

## 许可证与状态

这是一个个人开源项目，欢迎提交 Issue 或 PR。部分 UI 素材来自随项目记录的本地素材库，具体来源、归属和使用边界见 `public/assets/game-ui/README.md`。上述声明用于表达项目立场，不能替代权利授权，也不能保证在所有司法辖区完全排除版权、商标或其他法律风险；公开发布或商业使用前，请移除未获授权的角色素材，或替换为自有/已授权素材。

<p align="center"><sub>给只想快速知道 AI 额度还剩多少的 Linux 用户。</sub></p>
