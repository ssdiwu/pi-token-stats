# pi-token-stats

`pi-token-stats` 是一个 Pi extension（扩展）包，用来统计本机 Pi session（会话）里的 token（令牌）与 cost（费用）消耗。

## 功能

只注册一个 slash command（斜杠命令）：

```text
/tokens [自然语言时间范围]
```

默认无参数时显示今天的数据。

示例：

```text
/tokens
/tokens 最近5小时
/tokens 本周
/tokens 最近一周
/tokens 昨天
/tokens 2026-06-17
/tokens 2026-06-10 到 2026-06-17
/tokens 当前会话
```

同时注册 `token_stats` tool（工具），agent 可以在自然语言对话中调用它。例如你问“最近 5 小时 token 花了多少？”时，agent 可以把原始时间表达传给工具并返回统计。

## UI 行为

在 TUI（终端交互界面）模式中，统计结果使用 Pi 原生 `ctx.ui.select(title, choices)` 提问式对话框显示。

UI 文案会优先跟随 `pi-di18n` 的当前 locale（语言环境）；当前内置 `zh-CN`、`zh-TW`、`en`，其他 locale 回退英文。对话框只提供两个选项：

- `输入时间范围` / `Enter time range`：打开 Pi 原生 `ctx.ui.input(...)`，可输入 `最近5小时`、`1天`、`本周`、`2026-06-17` 等，然后重新显示统计对话框。
- `退出` / `Exit`：关闭对话框。

本项目明确拒绝 `overlay`（覆盖层）、自绘小窗口和 `confirm`（是/否确认）作为 `/tokens` 主交互，详见 `doc/adr/0001-use-native-select-input-dialogs.md`。

在 `pi -p`、JSON 或 RPC 等非 TUI 模式中，命令会输出纯文本，方便脚本和测试验证。

## 统计口径

- 默认 `/tokens` = 今天本机所有 session 的统计。
- 时间范围统计扫描 `~/.pi/agent/sessions` 下所有 JSONL（JSON Lines，会话日志）。
- 时间窗口按 assistant message（模型回复）的实际 timestamp（时间戳）聚合 token 与 cost。
- UI locale（语言环境）优先读取 `pi-di18n` 事件 API，其次读取 `pi-di18n` 配置文件和环境变量。
- 模型维度按 `provider/model`（供应商/模型）聚合；即使 model 同名，只要 provider 不同也会分开统计。
- `/tokens 当前会话` 使用 `ctx.sessionManager.getBranch()`，口径接近官方 `/session` 的 active branch。

## 支持的时间表达

- 今天 / day / today
- 昨天 / yesterday
- 本周 / week
- 最近一周 / 过去一周 / last week
- 最近 N 小时 / 最近 N 天 / 最近 N 周
- 裸时间：`5小时`、`1天`、`2周`
- 单日：`YYYY-MM-DD`
- 日期范围：`YYYY-MM-DD 到 YYYY-MM-DD`
- 当前会话 / session

无法识别的时间表达会回退到今天，并在标题里保留原始输入提示。

## 安装

把本仓库路径加入 `~/.pi/agent/settings.json` 的 `packages`：

```json
"../../Documents/Codes/Githubs/pi-token-stats"
```

然后在 Pi 中执行：

```text
/reload
```

## 开发验证

```bash
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 当前会话"
```
