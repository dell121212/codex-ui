# codex-ui

Codex 用量托盘小组件。当前技术栈：Neutralino + React + TypeScript。

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
