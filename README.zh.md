# codex-bar-lite

Codex 用量托盘小组件。当前技术栈：Neutralino + React + TypeScript。

## 使用

用户只需要运行：

```bash
./run.sh
```

脚本会自动完成：

- 检查 Node/npm
- 安装 npm 依赖
- 准备 Neutralino 运行时
- 检查 Codex 登录态
- 没有 token 时自动启动 `codex login`
- 清理旧的开发端口和旧 Neutralino 进程
- 启动托盘小组件

## 常用命令

```bash
./run.sh              # 开发模式
./run.sh --build      # 构建发布包
./run.sh --run        # 运行发布版

npm test
npm run typecheck
npm run build
```

## 发布产物

```text
neutralino-dist/codex-bar-lite/
```

Linux x64 可执行文件：

```text
neutralino-dist/codex-bar-lite/bin/neutralino-linux_x64
```

## Zorin / Wayland

这个应用保留托盘小组件思路，所以不会作为普通窗口常驻任务栏：

```json
"skipTaskbar": true
```

在 Zorin GNOME Wayland 上，脚本会优先检测并启用 Zorin 自带托盘扩展：

```text
zorin-appindicator@zorinos.com
```

如果扩展刚被启用，Wayland 会话可能需要注销并重新登录后托盘图标才会出现。

## 登录态

应用会自动读取：

```text
~/.codex/auth.json
```

如果没有 Codex token，脚本会自动执行 `codex login`。用户只需要按 Codex CLI/浏览器提示完成授权，不需要手动输入命令。

Cookie 输入仅作为备用方案保留。
