# Linux 托盘常驻与静默自启动合同

## 开机托盘资源路径排错（2026-10-18，实施前）

目标是恢复开机静默启动后的窗口入口。当前发布进程与托盘菜单存在，真实菜单的“显示窗口”可以将窗口恢复为 X11 IsViewable；但托盘 IconName 指向的 PNG 不存在，GNOME 日志报告图标无法解码。

本轮核验现有 Neutralino core 6.5.0（MIT）的 `api/os/os.cpp:setTray`、`resources.cpp:extractFile`，以及本地已安装 neu CLI 11.7.2（MIT）的 `src/modules/bundler.js:createAsarFile`。原生托盘读取资源归档绝对路径，不使用 HTTP `documentRoot`；当前资源归档包含 `dist/icons/tray.png`，应用却传入 `/icons/tray.png`。原生层忽略提取失败，仍返回托盘初始化成功。旧桌面测试使用目录模式并在根目录另放图标，掩盖了生产包差异。

选择继续直接复用现有宿主与打包器，仅修正应用的托盘资源路径；不引入、移植或升级上游代码，不改变许可证边界。数据、扫描、认证、设置、缓存、后台启动与窗口恢复顺序均保留。回归改用现有打包器依赖生成与生产相同层级的资源归档，调用实际托盘配置，检查桌面公布的 PNG 能被解码，再验证真实菜单及窗口映射。无上游测试移植。

本轮结果：新回归在旧路径下因 `tray_icon_linux_02.png` 不存在而失败，修正为 `/dist/icons/tray.png` 后通过图标解码、托盘显示/隐藏、最小化恢复、关闭常驻和隔离自启动设置检查，并沿用生产 alwaysOnTop 配置。105 项单元测试、类型检查、lint、前端构建与 Neutralino/ccusage 发布打包通过。已退出旧进程，以原自启动二进制路径和 `--background` 启动修复版；在正常图形会话和原数据目录中确认 32×32 托盘 PNG 可解码、真实菜单恢复后 X11 为 IsViewable，再次隐藏/显示也可恢复。自启动 desktop 文件未改动且通过 desktop-file-validate。未实际重启或重新登录。

### 防回归加固：实施前边界

目标是让同类资源路径错误在打包时失败，运行时也保留可见的恢复入口。保留现有生命周期与业务数据路径，直接复用 Neutralino resources.getStats（本地 client 6.8.0 类型声明与官方 Resources API）和 neu 已有的 @electron/asar；不自写归档解析器、不新增运行时依赖或上游源码移植。托盘原生资源路径集中到 JSON 清单，由前端和包检查共享。启动时资源缺失、空文件或目录返回托盘不可用，沿用生命周期的显示窗口/关闭退出分支。打包检查读取真正的 resources.neu，核对页面入口、图标内容和必要权限，并接入 neutralino:build；桌面回归继续检查真实 PNG 解码、菜单和 X11 映射。新增测试覆盖失败恢复与缺损资源包；原有额度、Provider、设置、自启存储和扫描边界不变。

加固实现：`src/desktop-resources.json` 为共享路径；`configureTray` 在调用原生托盘前检查资源，新增最小权限 `resources.getStats`。`scripts/verify-desktop-package.mjs` 使用 neu 的归档读取器，检查页面入口、客户端文件、原生窗口/托盘权限，并逐字节对比打包图标与源文件。`pnpm neutralino:build`（包括 run.sh 的构建路径）自动执行此门禁，失败返回非零状态。可单独运行 `pnpm verify:package`，或传入归档路径；`pnpm test:package` 在临时目录覆盖正常、缺图标、空图标、损坏图标、缺页面、缺权限六种包。图形环境继续运行 `pnpm test:desktop` 验证解码和真实窗口恢复。资源路径、权限或打包布局变更须同时通过这两项检查。

加固验收：旧代码在三项资源异常恢复测试中失败，加固后 108 项单元测试与 6 项真实归档测试通过；类型检查、lint、浏览器回归、打包桌面回归和完整 `pnpm neutralino:build`（含自动资源门禁）均通过。已用原图形会话重新启动加固发布版，确认托盘 PNG 可解码、菜单恢复后 X11 为 IsViewable。未实际重启或重新登录，未添加 GitHub Actions 或自动化发布配置。

## 实施前评估（2026-10-13）

目标：普通启动可静默常驻，关闭窗口仍刷新，桌面登录后静默自启动，托盘提供显示/隐藏/刷新/退出入口。
现有实现：`neutralinoBackend.ts` 已有托盘、设置持久化、刷新计时器和 XDG desktop 自启动文件；但启动强制 show/focus，关闭即退出，Linux 托盘缺少显示入口，禁用自启动误用客户端不存在的 removeFile 并吞掉异常。

复用检索：保留已锁定 Neutralino core 6.5.0 / client 6.8.0（MIT）及现有 React/Appica 设置组件；核验官方配置、window/os/filesystem API、v6.5.0 `api/window/window.cpp`、`api/os/os.cpp`、`api/fs/fs.cpp` 与 freedesktop Autostart/Desktop Entry 标准。当前环境不存在 `/home/chenkai/下载/codex/`，不声称重新审阅本地 CodexBar 等归档。已有框架支持 hidden、windowClose、show/hide、setTray 与文件操作，不需引入另一个桌面壳或自启动依赖。

选择：直接复用宿主原生能力，补充最小 Neutralino 生命周期及 XDG 适配；未复制新上游源码/素材，无新许可证或运行时边界。设置和错误仍走本项目 service/store；无新日志扫描、认证或额度请求路径。

保留：Provider、额度、重置、定时刷新、用量提醒、统一 storage、ccusage 权威扫描与统计 UI。
适配：原生窗口初始化后由应用立即隐藏；根据设置决定显示；关闭改为隐藏；托盘失败时恢复普通窗口且关闭可退出。
新增：`start_hidden` 设置（默认 true；老设置迁移时补齐）、`--background` 和 `--show` 启动覆盖。自启动总是 `--background`，独立于普通启动设置。静默指不主动弹出/聚焦主窗口，现有用量提醒仍可独立关闭。

边界：Linux 自启动指图形桌面登录后；使用绝对 XDG_CONFIG_HOME，缺省 ~/.config；只管理 codex-ui.desktop；运行已构建包，不执行安装/构建/登录脚本。保存失败须报告并恢复原自启动文件；禁用失败不得伪报成功。托盘 API 成功不能证明桌面 Shell 正在显示图标；可用 `--show` 恢复窗口。

验证：无上游测试复制；本项目覆盖设置迁移、启动参数优先级、托盘先就绪、关闭/恢复/退出、托盘失败、XDG 路径、Exec 转义、真实删除 API、保存回滚和 nativeAllowList。运行 TypeScript/lint/test、生产打包、浏览器设置交互及实际 Linux 桌面启动检查。

## 使用与验收

- 偏好设置提供“启动后静默运行”和“开机自启”。保存静默偏好后，下次普通启动生效；开机自启始终隐藏到托盘。
- `./run.sh --background`：构建后后台启动，跳过交互登录，运行输出写入发布目录 `startup.log`。
- `./run.sh --show`：显式打开主窗口，覆盖静默偏好。已有发布版可直接运行 `neutralino-dist/codex-ui/bin/neutralino-linux_x64 --show`，无需重新构建。
- `./run.sh --build`：仅构建，不启动/登录，不关闭已有进程。
- 图形桌面自启动直接运行发布二进制；移动/删除发布目录后需重新保存自启设置。
- `pnpm test:desktop` 在临时目录隔离设置与 XDG_CONFIG_HOME，使用真实已打包 Neutralino binary 和生产适配器，验证隐藏、显示、关闭常驻、退出、设置持久化、自启动创建/删除。测试启用 WebKit 软件合成以适应验证环境；生产配置不修改 GPU 设置。

本轮验证：105 项 Vitest 测试、TypeScript、ESLint、Bash 语法、生产 Neutralino/ccusage 打包、浏览器旧功能与新增开关交互、真实 Linux 桌面 API 回归、自启动文件 desktop-file-validate。未进行实际重启/重新登录，登录后自动启动的最后一步依赖桌面环境执行 XDG 项。

## 窗口恢复修复：实施前记录

用户反馈“无法显示窗口”后，真实托盘菜单触发和 X11 检查确认：`show/focus` 后 GTK 的 isVisible 可以为 true，但实际窗口仍 IsUnMapped/Iconic。原桌面回归只检查 GTK 标记，遗漏系统窗口映射与最小化恢复。
复用路径仍限定现有 Neutralino 6.5.0 的 window API（show/unminimize/focus），核对官方 Window API 和同 tag `api/window/window.cpp`；不引入新桌面壳、扫描器或源码移植。实施范围是恢复窗口的宿主边界；静默启动、自启、现有用量/Provider/持久化均保留。回归增加系统窗口映射、真实托盘事件以及最小化→恢复检查，再更新当前发布进程。

修复结论：保留 Neutralino 6.5.0，将原生 `hidden` 设为 false，由 renderer 初始化首先调用 hide，再建立托盘、读取偏好；显示窗口按 show → unminimize → focus 恢复。避免在 GTK 首次映射之前原生隐藏造成后续窗口无法映射。无需 Python/X11 helper 或新运行时依赖进入产品；诊断中尝试的外部 X11 激活与延时没有采用。Linux 启动时可能短暂绘制原生窗口框，后台偏好在应用初始化时生效。

加强后的桌面测试通过 X11 的 _NET_WM_PID 定位测试窗口，并检查 IsViewable，而非仅相信 GTK isVisible；通过桌面 D-Bus 调用实际 AppIndicator 菜单，覆盖首次显示、隐藏后显示、最小化恢复。Python/Gio 与 xwininfo/xprop 仅是图形环境测试依赖，使用隔离临时目录。原“真实桌面验证通过”的结论仅覆盖 API 标记，不包含此次新增系统映射与真实点击检查。

当前发布版已重新打包并替换旧后台进程；在用户原有设置/数据目录中，以 --background 启动，再调用其真实托盘“显示窗口”，确认 X11 IsViewable、WM_STATE Normal，且截图显示实际用量页面。再次执行隐藏→显示后仍可恢复。原自启动文件与 autostart/start_hidden=true 保留，desktop-file-validate 通过。

## 推送前代码复核（2026-10-13）

检查范围包括当前未提交的窗口、自启、设置、启动器、数据与测试路径；无新增上游模块或依赖。复用现有 Neutralino 生命周期 API、Appica 控件与 Vitest/浏览器验收，仅适配应用层动作顺序和设置加载状态。

发现并用回归复现：恢复窗口的 show/unminimize/focus 尚未完成时再隐藏，会被晚到的 focus 重新打开；设置页还未加载原设置时可以保存默认值，从而覆盖原有自启动偏好。分别序列化现有窗口操作，以及在配置加载成功之前禁用保存和相关编辑，维持原 service/store/存储契约。新增测试检查延迟恢复后最后的窗口动作，以及浏览器中延迟加载的保存行为。

推送前验收通过：105 项单元测试、TypeScript、ESLint、Bash 与 Node 脚本语法、浏览器全流程和真实桌面回归、Neutralino/ccusage 生产打包。浏览器拖拽脚本以明确的 940×720 视口和实际拖拽预览/卡片数量作为等待条件，修正窗口尺寸复原与固定延时引起的偶发误报。设置页延迟加载时不会提交默认值，完成加载后保存原有开关和刷新间隔。
