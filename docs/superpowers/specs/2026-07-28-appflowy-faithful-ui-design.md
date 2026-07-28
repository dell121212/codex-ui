# AI Console — AppFlowy 桌面体验完整复刻规格

日期：2026-07-28

状态：暂停，不执行；仅保留方案记录

目标平台：Neutralino 桌面应用，默认窗口 940 × 720，最小窗口 680 × 600

## 1. 目标

把 AppFlowy 桌面前端视为固定产品外壳，完整复刻其空间组织、组件原语、视觉参数和交互反馈，再通过独立适配层接入 AI Console 的数据采集、额度计算、Provider 编排和设置能力。熟悉 AppFlowy 的用户应当能够立即感受到相同的使用方式。

“完整复刻”包括：

- 保留 AppFlowy 的页面布局和导航结构；
- 保留字体、颜色、间距、圆角和阴影参数；
- 保留按钮、菜单、弹窗、卡片和输入框形态；
- 保留悬停、选中、展开、拖拽、加载、空态和错误态；
- 可折叠、可拖动缩放的桌面侧栏；
- 多页面标签栏；
- 页面级面包屑 Top Bar；
- 侧栏分组、树形 Provider 项及 hover 操作；
- Ctrl+P 命令面板；
- 右侧 Provider Inspector；
- 带二级导航的设置 Dialog；
- AppFlowy 的按钮、菜单、分隔线、焦点环、弹层和语义主题原语；
- 与 AppFlowy 相同的层级转场、hover 显隐和键盘交互逻辑。

只允许在外壳稳定后执行以下替换：

- 原始文字替换为 AI Console 业务文案；
- 原始数据替换为 AI Console 模拟数据或真实数据；
- 原始按钮事件重新绑定到 AI Console 功能；
- 明确不适用的页面经用户同意后删除。

未经用户同意，不得自行简化剩余页面、导航层级、组件状态或交互。组件使用 React/TypeScript 重新实现，不直接把 Flutter 运行时嵌入本项目；不复制 AppFlowy 商标或产品名称。

## 2. 实施架构：固定外壳 + 业务适配

实施严格分为两个互不干扰的阶段。

### 2.1 阶段一：完整界面壳

先建立独立运行的 AppFlowy 风格界面壳，不读取 `usageStore`、Neutralino API 或本地 Provider 文件。

- 用固定模拟数据覆盖所有页面；
- 所有页面、组件和交互状态必须可达；
- 包括正常、hover、selected、expanded、dragging、loading、empty、error 和 disabled；
- 页面路由、侧栏、标签、Top Bar、Inspector、Dialog、Popover 和命令面板全部成立；
- 以 AppFlowy 源码尺寸和 token 为验收依据；
- 阶段一通过视觉与交互验收前，不绑定真实业务。

该阶段的模拟数据集中放在 `src/appflowy-shell/mock/`，不能散落在组件内部。

### 2.2 阶段二：业务适配层

界面壳验收后，增加 `src/adapters/`：

```text
AppFlowy-style shell
  ← ShellViewModel / ShellAction ports
  ← AI Console adapters
  ← usageStore / Neutralino / local services
```

适配层负责：

- 把 `UsageSnapshot` 转为页面和组件需要的 ViewModel；
- 把 Provider、本地连接、额度窗口、成本和模型转换为壳层数据；
- 把壳层按钮、菜单和快捷键事件绑定到现有业务操作；
- 把业务加载、空态和错误转换为壳层标准状态；
- 保持壳层组件不知道 API、文件路径和 Neutralino。

现有业务 Store 和服务不直接 import 界面壳组件；界面壳也不直接 import 业务 Store。

## 3. 源码映射依据

| AppFlowy 源码 | 复刻内容 | AI Console 映射 |
| --- | --- | --- |
| `home_sizes.dart` | 268px 侧栏、40px 标签栏、56px Top Bar | 使用相同基础尺寸 |
| `home_layout.dart` | 侧栏、主画布、Secondary View 的偏移状态 | `WorkspaceShell` 布局状态机 |
| `sidebar.dart` | 顶部、工作区、搜索、新建、滚动树、底部区 | AI 工作区与 Provider 树 |
| `sidebar_resizer.dart` | 2px hover/drag 蓝色缩放条 | 鼠标拖动调整侧栏宽度 |
| `tabs_manager.dart` / `flowy_tab.dart` | 多标签、活动页、hover 关闭、固定标签 | 概览固定；分析、Provider 可关闭 |
| `navigation.dart` | 页面面包屑和折叠侧栏入口 | 工作区 / 页面 / Provider |
| `command_palette.dart` | Ctrl+P、搜索、最近页面、空状态 | 搜索页面和 Provider，支持直接导航 |
| `settings_dialog.dart` | Dialog + 204px 二级侧栏 | 常规、连接、通知、关于 |
| `AFBaseButton` / `AFMenuItem` | hover、disabled、selected、focus ring | 统一 React 原语 |
| Semantic tokens | Surface、Fill、Border、Text、Spacing、Radius | 集中 CSS token |

## 4. 固定信息架构

### 4.1 侧栏

侧栏默认及最小宽度为 268px，与 `HomeSizes.minimumSidebarWidth` 一致。桌面宽度下可继续向右拖动，最大值由“主画布至少保留 500px”动态限制，不另设任意固定上限；窄窗口按 AppFlowy 的 drawer 逻辑覆盖主画布。宽度写入 localStorage。点击折叠按钮或使用 `Ctrl+\` 隐藏侧栏，主画布平滑占满。折叠后 Top Bar 左侧出现“展开侧栏”按钮。

从上到下分为：

1. 44px 窗口拖动区：产品图标、AI Console、仅 hover 出现的折叠按钮；
2. 32px 工作区切换行：本地工作区名称、连接状态、下拉箭头；
3. 30px 搜索按钮：显示“搜索”和 `Ctrl+P`；
4. 30px 主操作：“添加 Provider”，打开 Provider 选择 Popover；
5. 可滚动树：
   - `工作区`：概览、用量分析；
   - `Providers`：六个 Provider 子节点，带连接状态点和可展开箭头；
   - 当前 Provider 节点选中时打开对应详情页；
   - hover 后显示“打开 Inspector”和更多操作；
6. 底部：同步状态、设置入口；用细分隔线与树区分开。

侧栏项高度 30–32px，选中态使用 `Fill.themeSelect`，普通 hover 使用 `Fill.contentHover`，不绘制常驻卡片边框。

### 4.2 标签栏

仅打开一个页面时隐藏；打开两个及以上页面时显示 40px 标签栏。

- “概览”为固定标签，不显示关闭按钮；
- 分析和 Provider 详情可以成为普通标签；设置始终使用独立 Dialog；
- 普通标签最小 100px、最大 200px；
- 关闭按钮只在 hover 时出现；
- 选中标签使用主 Surface，非选中标签使用侧栏 Surface；
- 点击 Provider 侧栏节点会复用已打开标签，不重复创建。

### 4.3 Top Bar

Top Bar 总高 56px，使用单行布局替代上一轮的大型 H1 Header。

左侧：

- 侧栏隐藏时显示展开按钮；
- 面包屑最多保留首项、末两项，过深时使用省略项；
- 示例：`AI Console / Providers / OpenAI Codex`。

右侧：

- 页面上下文动作；
- 刷新；
- Inspector 开关；
- 页面更多菜单。

Top Bar 下方直接进入页面内容，不再重复显示英文 eyebrow、大标题和 Provider 数量胶囊。

## 5. 页面保留与业务映射

第一阶段先保留 AppFlowy 桌面壳要求的页面容器和状态。页面是否删除不是实现者自行判断项；只有用户明确确认不适用的页面才从壳中移除。

### 5.1 概览

概览从“仪表盘卡片墙”调整为 AppFlowy 页面画布：

- 页面内容最大宽度 960px，左右留白随窗口变化；
- 顶部为一行核心额度摘要；
- 主 Provider 使用单个重点区块；
- 成本与模型列表使用无外层阴影的分组列表；
- Provider 编排入口移动到 Top Bar 的页面操作或 Popover；
- 拖入多个 Provider 后转为等宽比较区，不在页面顶部永久展示六个按钮。

### 5.2 用量分析

- 顶部四个指标改为连续的统计条；
- Provider 贡献使用 AppFlowy Database 风格列表；
- 表头保持轻量，行 hover 时出现打开详情动作；
- 选中行时右侧打开 Provider Inspector，而不是直接跳走；
- 模型和成本作为下方分组区，不重复卡片边框。

### 5.3 Providers

- 使用树和列表两种相互同步的表达；
- 主列表采用 AppFlowy Database 行高、分隔线和 hover 操作；
- 单击选中 Provider 并打开 Inspector；
- 双击或 Enter 打开 Provider 独立标签；
- 状态、来源、月用量为列，未连接状态提供唯一下一步动作。

### 5.4 Provider Inspector

Inspector 对应 AppFlowy 的 Secondary View / Edit Panel：

- 从右侧滑入，默认宽度为可用主画布的 3/7，限制在 320–400px；
- 顶部 56px，含关闭、扩展为标签、Provider 名称；
- 内容显示连接状态、额度窗口、Token、成本、数据来源和最近模型；
- `Escape` 关闭；
- “扩展”把 Inspector 内容打开为普通标签。

### 5.5 设置 Dialog

设置不再作为普通主画布页面，而是 AppFlowy 风格 Dialog：

- 宽度为窗口 60%，最小 564px；在 940px 窗口下为 564px；
- 左侧二级导航固定 204px；
- 右侧内容使用 24px 内边距；
- 页面分为“常规”“连接”“通知”“关于”；
- 表单使用 `SettingsCategory`、`SettingListTile` 对应原语；
- 保存按钮只在有未保存变更时进入强调态；
- 小于 700px 宽度时 Dialog 占满工作区，二级导航压缩为图标列。

## 6. 命令面板

`Ctrl+P` 打开命令面板，点击侧栏搜索按钮效果相同。

- 顶部自动聚焦搜索框；
- 无查询时显示最近打开页面与 Provider；
- 输入时搜索页面名称、Provider、公司和模型；
- 上下方向键移动选中项，Enter 打开，Escape 关闭；
- 结果类型带图标和路径；
- 无结果时显示说明和“打开 Providers”唯一行动；
- 面板使用顶端居中 Dialog，保留 AppFlowy 的最小宽度 572px、最大宽度 960px、最大高度 640px，并在小窗口中只增加必要的外边距约束。

## 7. React 组件边界

新增以下边界清晰的组件：

- `appflowy-shell/ui/ThemeTokens.css`：AppFlowy token 的唯一来源；
- `appflowy-shell/ui/Button.tsx`：Filled、Outlined、Ghost、Icon；
- `appflowy-shell/ui/MenuItem.tsx`：selected、hover、disabled、trailing；
- `appflowy-shell/ui/Card.tsx`、`Input.tsx`、`Dialog.tsx`、`Popover.tsx`、`Divider.tsx`；
- `appflowy-shell/shell/WorkspaceShell.tsx`：布局状态；
- `appflowy-shell/shell/Sidebar.tsx`；
- `appflowy-shell/shell/SidebarResizer.tsx`；
- `appflowy-shell/shell/WorkspaceTabs.tsx`；
- `appflowy-shell/shell/WorkspaceTopBar.tsx`；
- `appflowy-shell/shell/CommandPalette.tsx`；
- `appflowy-shell/shell/InspectorPanel.tsx`；
- `appflowy-shell/settings/SettingsDialog.tsx`；
- `appflowy-shell/mock/shellMockData.ts`；
- `adapters/usageShellAdapter.ts`；
- `adapters/settingsShellAdapter.ts`；
- `adapters/shellActionAdapter.ts`。

壳层组件只接受 ViewModel 和 action 回调。现有额度、成本、模型和 Provider 逻辑继续作为业务能力存在，但旧视觉组件不得直接混入新壳；需要的业务内容通过适配后的新页面组件呈现。

## 8. 状态与数据流

界面壳拥有独立 UI Store，业务 Store 保持不变：

```text
usageStore
  └─ 数据、刷新、登录、设置

workspaceUiStore
  ├─ sidebarWidth / sidebarCollapsed
  ├─ openTabs / activeTab
  ├─ selectedProvider
  ├─ inspectorOpen
  ├─ commandPaletteOpen
  └─ settingsDialogOpen / settingsSection
```

阶段一由 `shellMockData` 提供所有页面数据；阶段二在应用组合根处把 mock provider 切换为真实 adapter。切换数据源不改变壳层组件和样式。

持久化：

- 侧栏宽度与折叠状态；
- 已打开标签与当前标签；
- Dashboard Provider 编排；
- 不持久化临时 Dialog、Popover、hover 与 Inspector 开关。

所有快捷键在 Shell 层注册，表单输入聚焦时不拦截普通字符。

## 9. 错误、加载与空状态

- 阶段一必须提供可显式切换的 loading、empty 和 error 模拟场景；
- 初始加载：严格复刻 AppFlowy 对应页面的加载表达；
- 刷新：Top Bar 刷新图标旋转，现有数据继续显示；
- 同步错误：侧栏状态变为警告色，Top Bar 提供可行动提示；
- Provider 未连接：Inspector 内说明原因并提供“打开连接设置”；
- 命令无结果：单一空状态；
- 设置保存失败：保留用户输入，在对应字段或 Dialog 底部展示错误。

## 10. 动效与无障碍

- 侧栏折叠、Inspector、Dialog 使用 160–200ms `easeOut`；
- hover 操作只改变透明度和背景，不使用装饰性缩放；
- 支持 `prefers-reduced-motion`；
- 所有可点击元素支持键盘和可见焦点环；
- 图标按钮提供 `aria-label` 和 tooltip；
- 选中导航、标签和菜单使用 `aria-current` 或对应 ARIA 状态；
- 拖动侧栏提供可键盘调整的 separator 语义。

## 11. 分阶段验收标准

### 11.1 阶段一：外壳验收

- 在不启动 Neutralino、不读取真实用量数据时，所有页面可使用模拟数据独立运行；
- 页面布局、导航结构、字体、颜色、间距、圆角、阴影和组件形态逐项对照 AppFlowy 源码；
- hover、selected、expanded、dragging、loading、empty、error 和 disabled 都有可重复验证入口；
- 未经用户同意，没有删除或简化仍保留的页面与交互；
- 阶段一截图与交互清单经用户确认后，才能进入业务适配。

### 11.2 阶段二：适配验收

- 同一套壳层可以在模拟数据和真实业务数据之间切换；
- 真实数据不会改变布局、组件结构或视觉 token；
- 原按钮事件已映射到刷新、导航、设置、Provider 编排和详情操作；
- 业务错误、空态和加载状态使用壳层既定表达；
- 现有计算与数据服务测试继续通过。

### 视觉

- 940 × 720 下的 Shell 比例、侧栏密度、标签栏、Top Bar 和设置 Dialog 与 AppFlowy 桌面源码定义一致；
- 页面不再依赖上一轮末尾的大段覆盖 CSS；
- 所有颜色、间距、圆角来自集中 token；
- 不存在大标题 Dashboard 模板感和常驻卡片阴影。

### 交互

- 侧栏可拖动、折叠、快捷键展开；
- 标签可打开、切换、关闭和复用；
- Ctrl+P 完整支持键盘搜索导航；
- Provider 可从列表或树打开 Inspector，并可扩展为标签；
- 设置 Dialog 支持二级导航、脏状态和错误保留；
- 原有 Provider 拖拽编排与 localStorage 行为继续工作。

### 工程

- TypeScript、ESLint、现有单元测试和生产构建通过；
- 壳层和适配层不存在互相反向依赖；
- 模拟数据不进入生产业务计算；
- 为 UI Store、标签复用、命令搜索和侧栏宽度约束增加单元测试；
- 浏览器回归覆盖侧栏 resize/collapse、标签、命令面板、Inspector、设置 Dialog、Provider 拖拽；
- 在 940 × 720、680 × 600 和 1440 × 900 三种尺寸截图审查；
- 保留用户已有未提交文件，不自动 commit 或 push。

## 12. 明确不做

- 不复制 AppFlowy Logo、名称或商标资产；
- 不引入 AppFlowy 的协作、文档、数据库、云端或账号业务；
- 不迁移 Flutter 运行时；
- 不在外壳阶段接入真实 API 或本地数据；
- 不在业务适配阶段反向修改已经验收的视觉壳；
- 不未经用户同意自行删除、合并或简化剩余页面与状态；
- 不为“看起来更像”而伪造不存在的额度或 Provider 数据；
- 不在本轮新增 GitHub Actions、发布或自动提交。
