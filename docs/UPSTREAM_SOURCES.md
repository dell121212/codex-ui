# V2.0 上游源码盘点

本清单记录 `/home/chenkai/下载/codex/` 中发现的候选源码和已完成的代码整合。下载目录没有 `.git` 元数据；版本来自各自的 package/version 文件，不能代替上游提交 SHA。

| 本地归档 | 上游项目 | 已确认版本 | 许可证 | 可优先评估的模块 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| `CodexBar-main/` | [steipete/CodexBar](https://github.com/steipete/CodexBar) | `MARKETING_VERSION=0.64.2` | MIT | Codex Provider quota JSON contract and Linux CLI | Added a tested JSON adapter and optional installed-CLI fallback. The Qt/QML desktop interface is not embedded. |
| `ccusage-main/` | [ccusage/ccusage](https://github.com/ccusage/ccusage) | `20.0.25` | MIT | Rust Codex adapter, replay detection, cross-session dedupe, pricing and aggregation | Rust workspace is vendored and called by a Neutralino sidecar; raw timestamped events are the analysis contract. |
| `codex-monitor-main/` | [SC123667/codex-monitor](https://github.com/SC123667/codex-monitor) | `2.4.3` (`VERSION`) | MIT | `web_dashboard.py` chart organization and model/token comparison | Chart structure and interaction were adapted to React/SVG; Python server is not included. |
| `codex_usage-main/` | [capisoft-lib/codex_usage](https://github.com/capisoft-lib/codex_usage) | `1.5.3` | AGPL-3.0-or-later | Incremental collector/index, analyzer, price history, visualization | Reviewed but not integrated; its AGPL terms and separate analysis pipeline would add licensing and engine duplication. |

## 用户指定但此目录未包含的候选

- [CodeBurn](https://github.com/getagentseal/codeburn)：用户提供了 `src/providers/codex.ts`、`src/codex-cache.ts` 和 Codex Provider 测试路径；本地 `/home/chenkai/下载/codex/` 中没有 CodeBurn 归档。
- [Token Monitor](https://github.com/Javis603/token-monitor)：本地目录中没有该项目归档。不可将它与 `codex_usage-main` 或其他本地仓库混为一谈。

本地下载目录经检查未发现这两个上游项目的源码，因此没有从它们复制代码，也没有用相似实现冒充移植。继续直接移植前需要把源码放入该目录并记录提交 SHA、模块许可证和依赖。

## 移植记录

### Codex Monitor 图表交互与 Dashboard 分析模块

- 来源：[SC123667/codex-monitor](https://github.com/SC123667/codex-monitor)，本地归档 `codex-monitor-main/`，版本 `2.4.3`（`VERSION`）；下载目录无 Git 元数据，提交 SHA 不可用。
- 许可证：MIT；完整上游声明保存在 [`third_party/codex-monitor/LICENSE`](../third_party/codex-monitor/LICENSE)。上游许可证文件 SHA-256：`736d1ea4ac74779e2d62439805693cf6c299b12e4109d177908156090ddc375a`。
- 审阅/迁移源：`web_dashboard.py`，源文件 SHA-256：`e1519ae41340aa5b0937cfc11084b0e67919862495007cdf211786a722029cbf`。复用其模型负载排行、输入/缓存/输出构成、按模型排序与交互高亮的图表组织和呈现逻辑；其画布图表适配为 React/SVG 与 CSS，避免引入 Python HTTP 服务及全页脚本。
- 目标文件：`src/components/UsageCharts.tsx`、`src/services/usageChartData.ts`、`src/services/usageChartData.test.ts`、`src/index.css`，集成到 `UsageAnalysisWorkspace`。
- 数据边界：模型和 Token 构成均直接由当前选中周期 `PeriodUsage.models` 计算。缓存 Token 从输入中扣除后单独展示，避免重复计数。时间趋势由有时间戳的事件计算，没有事件时显示空状态。
- 本地适配/改动：保留本项目暗色设计令牌、中文文案、键盘聚焦和精确 Token 提示；不移植上游 Python 服务、全页 Dashboard 或其全局 DOM 状态。
- 更新责任：升级时重新核对图表语义、源文件、LICENSE 与以上测试，保持此清单和 MIT 声明同步。

### ccusage Rust Codex parser and event engine

- 来源：本地 `ccusage-main/`，版本 `20.0.25`；上游下载目录无 Git 元数据。完整 MIT 声明复制到 [`third_party/ccusage/LICENSE`](../third_party/ccusage/LICENSE)，许可证 SHA-256：`ffa4dd2d15c2e9f87d21367a007593002366c308d90b4a666d5bd43f57df7563`。
- 上游核心文件哈希：`adapters/codex/src/parser.rs` `b5ab26bf9b46974797e95031d3f34972ff7d2835e8956dfc6699c290789da490`；`loader.rs` `7a60f82532b892573d1d9ab3d77ff3f848d4e259d9d97c402e5da8257fc081e5`；`replay.rs` `51b047dce3455c2bf9bb42a2a35f1999c3a55db3a4f69acea1e32c51f5bfa2e9`；`report.rs` `49b7a082c31cbae802ec0361e57515a34932d0d5cd101ec792f26ec8cb5ec0a3`。
- 移植范围：上游 Rust workspace 下 `rust/` 完整源码，位于 [`third_party/ccusage/rust/`](../third_party/ccusage/rust/)。Native adapter, replay detector, duplicate filtering and cost calculation remain Rust code.
- Neutralino boundary: [`integrations/ccusage-codex/`](../integrations/ccusage-codex/) builds a versioned sidecar. Contract version 4 exposes deduplicated raw events with millisecond timestamps, session/model/token fields, cache creation and reasoning tokens, service tier, cost, project path and parent session, plus period summaries and the latest quota payload. TypeScript validates the schema in [`src/services/ccusageBridge.ts`](../src/services/ccusageBridge.ts).
- Cache: the sidecar fingerprints session file path, size, modification time, and first-line project/parent metadata; unchanged inputs reuse the complete event cache. Schema/engine-version fields invalidate stale cache. A changed file currently triggers an upstream full parse so replay deduplication remains authoritative.
- Pricing: uses the ccusage embedded `PricingMap` and preserves `null` when upstream reports a model as unpriced. The UI checks the LiteLLM `model_prices_and_context_window.json` catalog once per 24 hours, filters OpenAI GPT chat-model rates, and stores the validated rates in Neutralino storage. The current upstream rate catalog refreshes runtime estimates; the vendored ccusage snapshot and local price table remain offline fallbacks. This is an API-equivalent estimate and is not a billing statement.
- Compatibility and memory boundary: when the packaged sidecar is missing or errors in the desktop app, the UI reports `usage_engine_error` and skips the renderer-side full Codex log scan to keep memory bounded. The existing TypeScript parser remains available only through its explicit compatibility path; it is not an automatic desktop fallback and does not claim Rust replay/dedupe parity.
- UI: [`src/components/UsageCharts.tsx`](../src/components/UsageCharts.tsx) renders recent daily bars from these event timestamps; [`src/components/UsageEventAnalysis.tsx`](../src/components/UsageEventAnalysis.tsx) adds custom date, project, model, session and parent-agent grouping.
- Validation: run the bridge crate tests with `CCUSAGE_PRICING_JSON_PATH=integrations/ccusage-codex/litellm-pricing-empty.json cargo test --offline --manifest-path integrations/ccusage-codex/Cargo.toml`; upstream parser tests are run separately. The build helper installs the executable beside the Neutralino binary.

### CodexBar quota JSON and optional CLI fallback

- Source: local `CodexBar-main/`, version `0.64.2`; MIT declaration preserved at [`third_party/codexbar/LICENSE`](../third_party/codexbar/LICENSE), SHA-256 `14293556b79940745123d0160c71d27ed0e9fe9b8a848093f3ed78f4853caafe`.
- Audited contract: `Sources/CodexBarCLI/CLIPayloads.swift` (`ProviderPayload.usage`) and `Sources/CodexBarCore/UsageFetcher.swift` (`RateWindow`); source hashes `4a84977a24c23fe2f7e9a988fe0ff4dffc97f00c49b2c56041b36d41ddd9b05c` and `d589d16591584f4f1fab783a460f23463ffe8e292d4765793a8d646fb4a62c49`.
- Target: [`src/services/codexBarQuota.ts`](../src/services/codexBarQuota.ts) maps actual CodexBar rate windows; [`neutralinoBackend.ts`](../src/services/neutralinoBackend.ts) calls `codexbar usage --provider codex --format json` only as a last fallback after the existing official transports fail. It does not install or launch CodexBar when it is absent.
- CodexBar reports used percentage, duration and reset time, not token counts; the adapter keeps that distinction and does not invent token limits. Synthetic and missing windows are ignored. The native OpenAI quota endpoint remains primary.
- The CodexBar SwiftUI/Qt interface and its independent cost scanner are not included. The platform-neutral quota payload is the selected capability; ccusage remains the only Codex log/cost engine.

### Neutralino 桌面生命周期与 Linux 自启动适配（2026-10-13）

- 直接复用已锁定 [Neutralino core v6.5.0](https://github.com/neutralinojs/neutralinojs/tree/v6.5.0) 与 client 6.8.0；MIT，核对 core 根 LICENSE 及窗口、OS、文件 API 源文件，无额外文件级版权声明。未复制新增上游代码、测试或素材；不变更现有运行时分发边界。
- 审阅路径：`api/window/window.cpp`（hidden/windowClose）、`api/os/os.cpp`（setTray/trayMenuItemClicked）、`api/fs/fs.cpp`（remove/createDirectory/getStats）；以 v6.5.0 tag 为版本记录，GitHub API 本轮限流，未取得新的 commit SHA，不编造。
- 接口约束来自 [官方配置](https://neutralino.js.org/docs/configuration/neutralino.config.json/)、[Window API](https://neutralino.js.org/docs/api/window/)、[Filesystem API](https://neutralino.js.org/docs/api/filesystem/)、[freedesktop Autostart](https://specifications.freedesktop.org/autostart/latest/) 和 [Desktop Entry Exec](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html)。使用规范，不复制规范文字或引入第三方自启动进程。
- 实现：`src/services/desktopLifecycle.ts`、`src/services/linuxAutostart.ts`、`neutralinoBackend.ts`、`SettingsPanel.tsx`、`neutralino.config.json`、`run.sh`。后台启动不执行构建、安装或登录流程；用户登录桌面后由系统启动发布版二进制。启动偏好、Provider 数据、统一刷新和 storage 保持同一应用边界。
- 测试与更新责任：本项目 `desktopLifecycle.test.ts` 检查真实 API 名、权限、旧设置迁移、启动覆盖、托盘恢复/关闭/退出、失败回退、XDG/Exec、保存回滚；未移植上游测试。维护者升级 Neutralino 时应同时复核 nativeAllowList、客户端方法名和 Linux 托盘事件，重跑桌面兼容验证。详细边界见 [DESKTOP_BACKGROUND_CONTRACT.md](DESKTOP_BACKGROUND_CONTRACT.md)。

窗口恢复补充核验：6.5.0 `api/window/window.cpp` 的 show 只更新 GTK widget，isVisible 返回 GTK visible 标记；它们不保证 GNOME 实际窗口已经映射。窗口初始化 native hidden=true 的失效已由系统 X11 状态复现，修复采用已有 API 和 renderer 初始化隐藏，复用 `window.unminimize` 恢复最小化，不升级运行时、不引入外部激活工具。新增真实 AppIndicator/D-Bus 点击与 X11 映射回归位于 `tests/desktop_startup_regression.mjs`；维护责任与先前适配相同。
