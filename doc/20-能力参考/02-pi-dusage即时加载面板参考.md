# 02-pi-dusage 即时加载面板参考

> 被调研对象：本地项目 [`pi-dusage`](../../../pi-dusage/)，核心实现为 [`index.ts`](../../../pi-dusage/index.ts) 的 `showUsage()` 与 `UsageOverlay`。
> 借鉴目的：让 `pi-session-insights` 的 `/insights` 无参数 TUI 面板先出现可见的加载状态，再异步读取当天 session 与缓存日报；不改变非 TUI 输出和 `/insights daily` 完整日报语义。
> 调研范围：507 明确指定本地参照项目，按指定对象核验，不展开外部同类项目搜索。

## 1. 总体判断

**值得吸收，但只借「overlay 先挂载、数据后刷新」的状态机。**

`pi-dusage` 不是先等待网络额度请求完成才打开面板：`ctx.ui.custom(...)` 的 factory（工厂函数）同步返回 `UsageOverlay`；构造函数立刻以 `void this.refresh()` 启动异步请求，首帧渲染 `Loader`。请求结束后调用 `tui.requestRender()`，同一个 overlay 切换为结果或错误。它正好解决 `/insights` 当前在 `showInsightsPanel()` 中先完成 session 扫描和日报读取、用户才看到面板的等待盲区。

## 2. 核心机制速览

1. **同步挂载，异步拉取。** `showUsage()` 在 TUI 分支直接调用 `ctx.ui.custom(...)`；`UsageOverlay` 的构造函数不 `await` 数据，而是 `void this.refresh()`。因此命令触发后先有一个可交互、可关闭的空壳面板。
2. **显式加载态。** `UsageOverlay` 以 `loading = true` 初始化，`render()` 在加载期只渲染 `Loader` 与“Fetching usage…”。用户能区分“仍在加载”和“命令没有响应”。
3. **单一刷新入口。** `refresh()` 负责设置 loading、请求数据、收集异常、结束 loading，并在状态变化两次调用 `tui.requestRender()`；`r` 键复用这一入口。
4. **失败留在面板。** 请求异常进入 overlay 的 `error` 状态，不会让面板消失；每个 provider 自己的失败则留在对应卡片。非 TUI 分支仍独立调用 `formatTextReport(await collectUsages())`。
5. **面板生命周期与本地化分离。** 构造时订阅 locale 变化，`destroy()` 解除订阅；数据刷新不依赖 locale 请求完成。

## 3. 与 pi-session-insights 的关系

### 3.1 设计冲突（明确不借）

- **不搬 provider 请求、刷新快捷键或进度条卡片。** `pi-dusage` 的数据源是网络 quota API；本项目的默认面板是本地 session JSONL + 缓存日报，复用它们会越过只读、轻量的会话分析边界。
- **不照搬未完成任务的生命周期处理。** `pi-dusage` 在关闭 overlay 后不会中止正在进行的网络请求。`pi-session-insights` 的扫描也无需中止，但实现时应避免关闭后继续 `requestRender()`，以免触碰已释放 TUI。
- **不改变非 TUI 路径。** `pi-dusage` 的 `-p` 路径仍等待完整结果；`/insights` 的文本输出同样必须继续走完整、可脚本化的报告，不显示 loading 壳。

### 3.2 同思路（已有，印证方向）

- **已有 L2 overlay。** `index.ts` 已用 `ctx.ui.custom(..., { overlay: true })`，`src/panel.ts` 已是独立的可渲染组件；不需要引入新 UI 框架。
- **已有轻量日报预览。** 当前面板只读昨天缓存并限制 12 行，适合在异步加载完成后一次替换数据，避免把加载态升级为完整日报生成。
- **已有纯文本降级。** `showDialog()` 已为非 TUI 使用 `console.log`；即时加载只应影响 TUI 分支。

### 3.3 候选（值得吸收）

- **K1：把 `showInsightsPanel()` 改为立即挂载。** 现在 `index.ts` 先执行 `scanSessions({ modifiedSince })` 与 `readDaySummary()`，最后才 `ctx.ui.custom()`。可改为先创建一个带 `loading` 状态的 `InsightsPanel`，把扫描和缓存读取放进组件 `refresh()`；首帧显示本地化“正在加载会话洞察…”。
  - 改造点：`index.ts` 的 `showInsightsPanel()`、`src/panel.ts`。
  - 验证点：`ctx.ui.custom` factory 在 session 扫描 Promise 结束前同步构造面板；加载时渲染 loading 文案，完成后替换成数字页/日报预览。
- **K2：为关闭后的异步完成加存活保护。** `InsightsPanel` 在 `Esc` 后标记 disposed；异步刷新完成时仅在仍存活时写数据、调用 `requestRender()`。
  - 改造点：`src/panel.ts`。
  - 验证点：关闭面板后完成 refresh 不触发 TUI 更新；这项比直接照搬 `pi-dusage` 更符合 Pi overlay 生命周期安全。
- **K3：把加载失败变成面板内可读状态。** 扫描/缓存读取虽已有容错，但 I/O 异常应替换加载正文为局部错误提示，数字页仍可显示成功部分；不让命令静默卡住。
  - 改造点：`src/panel.ts` 与 `index.ts` 的数据装载函数。
  - 验证点：模拟 `scanSessions` 失败时，overlay 已出现且显示错误提示，`Esc` 仍可退出。

## 4. 可借鉴的具体代码

- `pi-dusage/index.ts`：`UsageOverlay.constructor()` 中的 `void this.refresh()`——首帧不等待数据。
- `pi-dusage/index.ts`：`UsageOverlay.refresh()`——loading / error / `requestRender()` 的状态转换。
- `pi-dusage/index.ts`：`UsageOverlay.render()` 的 `this.loading` 分支和 `Loader`。
- `pi-dusage/index.ts`：`showUsage()` 的 TUI / 非 TUI 分支分离。

## 5. 决策记录

暂无 ADR（架构决策记录）。这是现有 overlay 的加载时序优化；若后续确定面板要支持刷新、取消或通用异步面板基类，再评估是否形成难逆转的交互架构决策。
