# codex-ui

Codex 在 Windows 和 macOS 上有专门的桌面应用，但 Linux 用户很多时候只能依赖命令行。额度用了多少、5 小时窗口什么时候重置、本周额度还剩多少，这些信息并不会安静地待在桌面上等你查看。

这就是 codex-ui 诞生的原因：给 Linux 用户一个轻量、可常驻、开箱即用的 Codex 用量看板。它不会要求你反复复制 token，也不需要你记一串启动命令。运行一次脚本，应用会自动读取本机 Codex 登录态，构建并启动托盘小组件；需要长期使用时，也可以在设置里傻瓜式开启开机自启。

当前技术栈：Neutralino + React + TypeScript。

## 亮点

- 自动抓取 `~/.codex/auth.json` 中的 Codex token
- 没有 token 时自动引导执行 `codex login`
- 傻瓜式一键运行：只需要 `./run.sh`
- 傻瓜式设置开机自启：在设置面板里点一下即可
- 常驻托盘查看 5 小时额度、本周额度和下次重置时间
- Zorin / Wayland 下保留任务栏入口，托盘不可用时也能找回窗口

## 使用

用户只需要运行：

```bash
./run.sh
```

脚本会自动完成安装、构建和启动：

- 检查 Node/npm
- 安装 npm 依赖
- 准备 Neutralino 运行时
- 检查 Codex 登录态
- 没有 token 时自动启动 `codex login`
- 清理旧 Neutralino 进程
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

在 Zorin GNOME Wayland 上，脚本会优先检测并启用 Zorin 自带托盘扩展：

```text
zorin-appindicator@zorinos.com
```

如果扩展刚被启用，Wayland 会话可能需要注销并重新登录后托盘图标才会出现。无论托盘是否可用，主窗口都会保留在任务栏中。

## 登录态

应用会自动读取：

```text
~/.codex/auth.json
```

如果没有 Codex token，脚本会自动执行 `codex login`。用户只需要按 Codex CLI/浏览器提示完成授权，不需要手动输入命令。

Cookie 输入仅作为备用方案保留。
