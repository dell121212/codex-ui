# V2.0 开源代码整合原则

## 项目定位

`codex-ui` V2.0 是开源代码整合工程。默认先寻找、评估并复用已有开源实现，再为 Neutralino 与本项目业务做必要适配。只有确认没有合适的现成实现，或许可证、运行时、维护状态等因素使复用不可行时，才新写功能。

目标是形成一个统一的 Linux 桌面产品：统一入口、统一数据契约、统一设置与持久化体验。可以保留独立 CLI、本地服务或 Neutralino 扩展来运行上游实现；不要求所有代码都复制进 `src/`，也不接受只把几个独立软件并排启动、彼此重复扫描数据的拼接式集成。

## 实现优先级

每项新功能或重构都按以下顺序决策，并在任务说明或 PR 中记录选择理由：

1. **直接复用现有实现**：已有代码满足需求时，优先采用依赖包、Git 子模块/子树或带来源记录的代码移植；保留其测试和必要的兼容声明。
2. **适配后复用**：上游使用 Electron、Tauri、Node 原生模块或其他不兼容运行时，但领域逻辑可用时，保留领域实现，只重写 Neutralino 边界、IPC、文件访问或生命周期适配。
3. **外部进程集成**：上游 CLI/服务能可靠输出结构化 JSON 时，优先复用该接口；明确进程启动、超时、错误、版本、数据隐私与平台约束。需要时可用独立本地服务或 Neutralino 扩展承载上游代码。
4. **自行实现**：只有在检索和兼容性验证后仍无合适实现，或现成实现存在明确阻断（许可证不兼容、关键功能缺失、不可维护、无法安全运行等）时采用。记录查过的来源、未采用原因和最小自研范围。

不得只因代码风格、文件布局或技术栈不同，就重写已有解析、缓存、统计、价格、图表或成熟交互组件。

## V2.0 优先评估的上游

用户准备的本地上游源码位于 `/home/chenkai/下载/codex/`。目前盘点到 CodexBar、ccusage、Codex Monitor 和 `codex_usage`；目录中没有 CodeBurn 或 Token Monitor。缺失的项目仍可作为外部候选，但不得声称已经审阅或从本地归档移植。每次实际采用前须核对具体来源版本、文件、依赖、许可证和运行时。

| 能力 | 本地优先评估来源 | 集成边界 |
| --- | --- | --- |
| Codex 会话解析、累计 Token、重放/子 Agent 去重、统计与价格 | `ccusage-main/rust/adapters/codex/` 及 `rust/crates/ccusage-core/`；同时可比较 `codex-monitor-main/codex_monitor_core.py` | ccusage 具有独立 Codex Rust adapter、回放检测、归并和成本核心，优先复用其 JSON 接口或 adapter。保留对应测试/快照；Python 实现可作交叉校验或兼容候选。 |
| Codex 增量缓存与历史索引 | `codex_usage-main/src/usage-collector.mjs`、`src/storage/`；比较 ccusage loader 与 Codex Monitor | 先采用现成增量索引/缓存或调用上游进程；只适配 Neutralino 文件 API与生命周期，禁止引入第二套重复扫描。该仓库为 AGPL，移植前必须解决许可证兼容。 |
| 统计页面、图表、布局、样式和交互 | `codex_usage-main/public/visualization.js`、`public/styles.css`、`public/index.html`；`codex-monitor-main/web_dashboard.py`；CodexBar Linux `Integrations/Linux/qml/` | 按完整组件迁移布局、样式、交互和状态；分别评估原生 HTML/CSS/JS、Python HTTP 与 Qt Quick 的接入成本。不得把完整桌面壳并排拼接进来。`codex_usage` 为 AGPL-3.0-or-later。 |
| 模型价格及模型别名 | ccusage `rust/crates/ccusage-core/src/pricing.rs`、锁定的 LiteLLM/models.dev 数据；Codex Monitor 本地定价配置 | 优先复用价格结构、别名、缓存/输入/输出分价和未匹配处理；注明数据快照版本/时间与估价口径。 |
| 桌面额度、重置时间及 Provider 状态 | 保留 `codex-ui` 现有实现，并评估 CodexBar CLI 与 Linux adapter | 优先把 CLI 作为数据提供方接入；CodexBar Linux UI 依赖 Qt 6，只有能统一到本产品体验时才考虑整体移植。避免重复认证和重复额度请求。 |
| 多模型成本/历史统计 | ccusage、Codex Monitor、`codex_usage` | 先比较其 JSON/CLI/服务边界；Rust/Python 不兼容不构成重写理由，先评估独立进程/本地服务。AGPL 来源须先完成许可证决策。 |
| CodeBurn 与 Token Monitor | 用户指定的 [CodeBurn](https://github.com/getagentseal/codeburn) 和 [Token Monitor](https://github.com/Javis603/token-monitor) | 当前不在本地源码目录。需要直接移植时，先取得对应源码归档并记录版本/提交，再按常规来源和许可门禁评估；可先与本地 ccusage、Codex Monitor、`codex_usage` 比较。 |
| 本项目多模型编排/Hook 分析 | 保留现有业务并在其上扩展 | 新增分析必须接入统一数据契约，不另建平行日志扫描器。 |

Codex 日志应有一个权威扫描和归并路径。评估 ccusage、CodeBurn 等候选后，选择一个引擎作为统计事实来源，避免同时扫描相同文件并重复计数；远端官方额度和 Provider 管理仍可作为互补数据源。

## 来源、许可证与版权

移植、复制或打包任何代码、测试、样式、图片、字体、数据集或其他素材前：

- 核验具体仓库、提交 SHA、文件路径、文件级声明、主许可证及相关依赖/素材许可证；不得仅凭项目名或仓库根许可证推断全部内容可用。
- 确认许可证与 `codex-ui` 的分发方式兼容。存在冲突或来源不清时，暂停该模块并报告，不得先复制后补手续。
- 目标仓库当前没有根 `LICENSE`。这不阻断许可证明确、可按条件纳入的 permissive 模块；可在 `third_party/<project>/` 保留完整许可证和声明，并在来源清单中记录边界。AGPL 等 copyleft 来源仍须先审查集成、打包和分发边界并完成人工兼容决策；进程隔离本身不能作为许可证兼容结论。
- 保留上游版权头、许可证文本、NOTICE 和要求的署名；不得删除、改写或伪装作者信息。
- 在 `docs/UPSTREAM_SOURCES.md` 记录来源 URL、版本/提交 SHA、移植路径、许可证、版权要求、本地改动、适配边界及更新责任。新增上游模块必须同步更新该清单。
- 本地下载目录目前没有 `.git` 元数据；在取得原仓库提交 SHA 前，记录归档目录、包版本/版本文件和文件哈希，不得编造提交号。
- 上游更新时保留可追溯差异，优先形成小而明确的适配层；不得让项目内修改变得无法与上游对照。

## 统一产品与架构约束

- 继续以本项目的 React、TypeScript、Neutralino 为桌面 UI 和宿主基线；上游领域代码可由依赖、局部移植、CLI、本地服务或扩展提供。
- 通过清晰的 service/adapter 边界把上游能力映射到 `codex-ui` 统一类型、Provider、设置、缓存和错误状态。上游原始格式不要泄漏到多个 UI 页面。
- 复用 UI 时同时接入组件结构、布局、样式、可访问性状态与交互；不要只抄视觉后自行重写同一套组件逻辑。
- 保留现有额度、Provider、重置、设置和本地数据能力。整合时列出保留、替换、适配和新增项，防止功能静默丢失。
- 尊重上游运行时隔离。只有必要的 OS/API 调用通过 Neutralino 适配；不得为了接入单个模块把整套 Electron/Tauri 壳或另一款完整桌面产品带入应用。
- 优先复用已有扫描结果和缓存；多个模块不得无协调地重复遍历同一批日志或各自维护互不一致的成本口径。

## 每项整合任务的交付要求

开始实现前写清：

1. 目标能力及当前仓库中已有的相关实现。
2. 检索过的上游项目、模块、版本/提交及许可证结论。
3. 选择直接依赖、代码移植、CLI/服务、Neutralino 适配或自研的理由。
4. 上游与 `codex-ui` 的数据、界面、设置、存储和错误边界。
5. 哪些上游测试会保留/移植，以及本项目需要的兼容性回归。

声称“复用完成”时，提供来源清单和实现路径证据；声称“没有现成实现”时，提供检索范围及不采用现有方案的具体原因。不得用“重写得更统一”作为跳过上游评估的理由。
