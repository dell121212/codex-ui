# codex-ui

Codex 在 Windows 和 macOS 上有专门的桌面应用，但 Linux 用户很多时候只能依赖命令行。额度用了多少、5 小时窗口什么时候重置、本周额度还剩多少，这些信息并不会安静地待在桌面上等你查看。

这就是 codex-ui 诞生的原因：给 Linux 用户一个轻量、可常驻、开箱即用的 Codex 用量看板。它不会要求你反复复制 token，也不需要你记一串启动命令。运行一次脚本，应用会自动读取本机 Codex 登录态，构建并启动托盘小组件；需要长期使用时，也可以在设置里傻瓜式开启开机自启。

当前技术栈：Neutralino + React + TypeScript。

## 界面预览

<p align="center">
  <img width="615" height="698" alt="codex-ui 界面预览" src="https://github.com/user-attachments/assets/9bed0445-c887-4be8-8fcd-a2e4da8845c4" />
</p>

<p align="center">
  <img src="./截图%202026-07-10%2013-27-13.png" alt="Codex 用量看板" width="360" />
  <img src="./截图%202026-07-10%2013-27-20.png" alt="codex-ui 设置页" width="360" />
</p>

## 亮点

- 通过 Codex app-server 读取本机登录态与真实额度
- 没有 token 时自动引导执行 `codex login`
- 傻瓜式一键运行：只需要 `./run.sh`
- 傻瓜式设置开机自启：在设置面板里点一下即可
- 常驻托盘查看主额度、旧模型独立额度和下次重置时间
- 显示服务端返回的手动重置次数，并安全执行重置
- 按公开 API 单价估算本地 Codex 会话的等价美元成本
- Zorin / Wayland 下保留任务栏入口，托盘不可用时也能找回窗口

## 使用

用户只需要运行：

```bash
./run.sh
```

脚本会自动完成安装、构建和启动：

- 检查 Node/npm
- 安装 npm 依赖
- 准备固定版本的 Neutralino 运行时
- 检查 Codex 登录态
- 没有 token 时自动启动 `codex login`
- 只清理本应用的旧进程
- 自动构建应用
- 启动托盘小组件

## 开发者校验

```bash
npm test
npm run typecheck
npm run build
```

## 应用目录

```text
neutralino-dist/codex-ui/
```

Linux x64 可执行文件：

```text
neutralino-dist/codex-ui/bin/neutralino-linux_x64
```

开机自启可在设置面板中开启；正常使用只需要运行 `./run.sh`。

## Zorin / Wayland

这个应用会保留普通任务栏入口。即使托盘图标在 Zorin / Wayland 下不可见，用户也能从任务栏找回用量看板。

在 Zorin GNOME Wayland 上，脚本会检测 Zorin 自带托盘扩展：

```text
zorin-appindicator@zorinos.com
```

默认启动不会执行 `sudo` 或修改 GNOME 扩展。需要自动安装/启用托盘支持时，显式运行：

```bash
./run.sh --setup-tray
```

如果扩展刚被启用，Wayland 会话可能需要注销并重新登录后托盘图标才会出现。无论托盘是否可用，主窗口都会保留在任务栏中。

## 登录态

应用会自动读取：

```text
~/.codex/auth.json
```

如果没有 Codex token，脚本会自动执行 `codex login`。用户只需要按 Codex CLI/浏览器提示完成授权，不需要手动输入命令。

应用不会保存 ChatGPT Cookie。若 app-server 在较旧 Codex CLI 上不可用，会使用同一 CLI token 进行只读 HTTP 降级。

## 数据说明

- 多组额度来自 `account/rateLimits/read`，按服务端 `limitId` 动态展示，不硬编码模型名。
- 手动重置次数来自 `rateLimitResetCredits.availableCount`；只有明确返回 `reset` 或 `alreadyRedeemed` 才记录成功。
- 美元金额是订阅内 token 按标准 API 单价换算的等价估算，不是实际账单。未知模型不会套用默认价格，而会标记为未计价。
