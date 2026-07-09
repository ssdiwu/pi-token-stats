# ADR 0001: 拒绝 overlay，自然交互统一使用原生 select/input 对话框

## 状态

**Superseded** — 已被 [0003-展示层升级L2overlay面板.md](./0003-展示层升级L2overlay面板.md) 取代。

> 原状态（pi-token-stats 时代）：Accepted。pi-session-insights 升级到 L2 overlay 面板后，本 ADR 的“只用 select/input、拒绝 overlay”失效。

## 背景

`pi-token-stats` 的 `/tokens` 需要呈现 token 统计结果，并允许用户继续输入新的时间范围，例如 `最近5小时`、`1天`、`本周`。

曾尝试过三种 UI 路线：

1. `ctx.ui.notify`：更像通知，容易常驻或不符合“提问式”交互预期。
2. `ctx.ui.custom(..., { overlay: true })`：可以自定义按钮和输入，但呈现为自绘覆盖层/小窗口，不像 Pi 原生对话框。
3. `ctx.ui.confirm`：是 Pi 原生确认对话框，但语义固定为 yes/no，不适合 `退出` / `输入时间范围`。

用户明确期望接近 `pi-reminders` 的提问式交互，而不是 overlay 或自绘窗口。

## 决策

`pi-token-stats` 的 TUI 交互统一使用 Pi 原生 UI 方法：

- 用 `ctx.ui.select(title, choices)` 展示统计结果与动作选择。
- `choices` 只允许 `输入时间范围` 和 `退出`。
- 用户选择 `输入时间范围` 后，用 `ctx.ui.input(...)` 获取自然语言时间范围。
- 获取输入后重新计算统计，并回到 `ctx.ui.select(...)`。
- 禁止在该交互中使用 `ctx.ui.custom(..., { overlay: true })`、自绘 dialog、toast 或 `ctx.ui.confirm`。

## 后果

正向影响：

- UI 行为更接近 `pi-reminders` 和 Pi 原生提问式对话框。
- 不再出现大覆盖层、小窗口或 yes/no 语义错位。
- 实现更简单，减少自定义 TUI 组件维护成本。

代价：

- 输入时间范围会进入 Pi 原生 `input` 对话框，而不是嵌在同一个自绘窗口里。
- 视觉可定制性降低，但这是为了保留原生交互一致性。

## 验证

修改后需确认：

```bash
rg "ctx\.ui\.custom|overlay|ctx\.ui\.confirm|token-hour|token-day|token-week|token-session" index.ts README.md AGENTS.md doc package.json
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 当前会话"
```
