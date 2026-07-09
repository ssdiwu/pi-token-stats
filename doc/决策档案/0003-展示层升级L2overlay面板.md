# ADR 0003: 展示层升级 L2 overlay 面板

## 状态

Accepted（取代 [0001](./0001-统一使用原生select与input对话框.md)）

## 背景

旧 ADR 0001（pi-token-stats 时代）决策「拒绝 overlay、自绘窗口和 confirm，`/tokens` 交互统一走 Pi 原生 select/input」。其前提假设是 overlay = 简陋自绘小窗。

但核实 Pi 原生 TUI 能力（pi-tui 组件系统）后：`ctx.ui.custom(comp, {overlay:true})` 有完整组件系统（Markdown / Selector / Box / Container + 焦点传播 + 定位参数 + 生命周期）。overlay 不是「简陋小窗」，是成熟的交互面板能力。

pi-session-insights 是 pi-daily 超集，需展示日报长文（markdown）+ 多维数字视图，select 的 title 塞不下长文，需要 overlay 面板。

## 决策

- `/insights` 无参数 TUI 模式：打开 L2 overlay 面板（`ctx.ui.custom` + `@earendil-works/pi-tui` 组件）。
- 面板内数字视图（量纲/项目/工具/错误/健康）与日报视图（叙事 markdown）键盘切换（1/2 切视图，Esc 退出）。
- 非 TUI 模式（`-p` / JSON / RPC）退化为纯文本输出，便于脚本和测试验证。
- 引入 `@earendil-works/pi-tui` 作为 devDependency。

## 后果

- 旧 ADR 0001（select/input 交互）失效。
- TUI 键盘交互无法 print 模式验证，手测。
- 数字视图/日报视图同面板分页，产物同一处消费，不割裂。

## 取代

[0001-统一使用原生select与input对话框.md](./0001-统一使用原生select与input对话框.md)
