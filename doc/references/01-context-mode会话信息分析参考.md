# 01-context-mode 会话信息分析参考

> 被调研对象：[context-mode](https://pi.dev/packages/context-mode)（npm `context-mode`，作者 mksglu，Pi manifest 同时声明 extension + skill）。
> 借鉴目的：重新定义 `pi-token-stats` 为「Pi 会话信息拓展」，参考 context-mode 的**分析层心智模型**（不是它的接管层）。
> 对照口径：context-mode 是介入接管型（拦截 + sandbox + continuity），`pi-token-stats` 是只读统计型。两者类别不同。

## 1. 总体判断

**部分值得借。**

借的不是 context-mode 的核心（拦截工具调用 / sandbox 执行 / PreCompact 快照恢复 —— 那些和本项目定位冲突，且 Pi 不需要），而是它的**分析层心智模型**：`ctx-insight` 那套「把会话事件变成可行动洞察」的维度（project / tool / error / latency / compaction-health）。

**关键立论（已用本机真实会话文件核验）**：Pi 原生 session JSONL 本身就足够丰富，已经记录了 context-mode 靠 hook 拦截才能拿到的绝大部分事件维度。所以对 Pi 而言，`pi-token-stats` 可以靠「只读 JSONL」达到 `ctx-insight` 的大部分分析深度，**绕开 context-mode 的拦截税**。context-mode 之所以要重新拦截，是因为它目标是跨 15 平台通用，很多平台的原生日志不开放或不记这些事件；Pi 不存在这个问题。

这条立论直接支撑 507 的「pi 会话信息拓展」重新定位：不是去抄一个上下文管理器，而是把 Pi 已经写好的会话日志，变成一层只读的会话信息分析。

## 2. 核心机制速览（context-mode 怎么做、为什么）

1. **四支柱架构**：Context Saving（sandbox 把原始工具输出挡在上下文窗外，98% 减量）/ Session Continuity（hook 捕获事件 + 压缩前快照 + 压缩后恢复）/ Think in Code（sandbox 执行脚本，只回 stdout）/ 不限制 prose 风格。前三个都是**主动介入**，不是只读观察。

2. **靠 hook 重新捕获结构化事件**：用 `PreToolUse` / `PostToolUse` / `PreCompact` / `SessionStart` / `UserPromptSubmit` 拦截每一次工具调用，抽成结构化事件存进 SQLite（23 个事件类别）。**这一层是它整个分析能力的上游** —— 没有拦截，就没有 `ctx-insight` 的深度。

3. **`ctx-insight` 分析层（最值得参考的部分）**：90 metrics / 37 insight patterns / 4 composite scores（Productivity / Quality / Delegation / Context Health，各 0-100）/ Error Intelligence（错误恢复率、retry storm 检测、按工具 P95 延迟、错误来源 TOP）/ Delegation analytics（subagent 完成率、并行 burst、节省时间）/ CLAUDEmd 相关性（有规则文件 ↔ 错误恢复率的因果叙事）。**核心特征**：不是 vanity metrics，而是「数字 → 因果叙事」（如「7 错误 + 0 提交 = 白干」「同一文件改 12 次 = 先写 spec」）。

4. **15 平台适配器**：每个平台一套 hook/adapter（Claude Code / Gemini / Cursor / OpenCode / Codex / Pi / OMP …）。**为什么这么重**：因为通用性要求它不能假设各平台原生日志可用，只能自己拦截重建事件流。Pi 适配器也是靠 extension 注册 `tool_call`/`tool_result`/`session_start`/`session_before_compact` —— 即在 Pi 上它同样重新拦截，而非读 Pi 原生 JSONL。

5. **许可证 Elastic-2.0**：非完全开源（限制云竞品使用），不能整包搬进项目，只能借鉴机制与维度设计。

## 3. 与 pi-token-stats 的关系

### 3.1 设计冲突（明确不借）

每条带项目定位理由：

- **C1. 不做 context governor / 工具拦截器（PreToolUse 路由拦截）。** 与本项目路线图明确排除「接管型上下文框架」冲突；且 Pi 原生 JSONL 已记录工具事件，拦截是冗余开销。context-mode 的拦截是为 15 平台通用付的税，Pi 不该交。
- **C2. 不做 sandbox 执行器（`ctx_execute` think-in-code）。** 那是另一个产品（代码执行沙箱），不是会话信息分析。本项目定位是只读观察，不接管执行。
- **C3. 不做 PreCompact 主动快照注入 / session continuity 恢复。** Pi 已有原生 compaction + `/session` + `/resume` + `ctx.sessionManager.getBranch()`，重做是重复造轮子，且属于「接管 session 状态」，越界。
- **C4. 不做跨平台适配。** 本项目是 Pi 原生包，只读 Pi 自己的 JSONL，不追求通用性带来的复杂度膨胀。
- **C5. 不做全局 agent memory platform / 知识库接管。** 路线图「暂不做」已明确排除。

### 3.2 同思路（已有，印证方向）

- **S1. 自然语言时间范围解析（LLM + 本地规则回退）。** context-mode 同样靠模型理解意图再降级，印证本项目「先模型理解、再本地规则兜底」的方向正确。
- **S2. `provider/model` 维度聚合。** context-mode 的 Error Intelligence 也按 tool / model 分组，印证模型维度是会话分析的基本盘。
- **S3. 只读、本地、数据不离机。** context-mode 强调 "Every insight runs locally. Your data never leaves your machine."，本项目本就是本地扫描 JSONL，方向一致且是天然优势。
- **S4. 单 slash command 入口 + 同时注册 tool 供 agent 调用。** 入口形态与 context-mode 的 `ctx-stats` 一致。

### 3.3 候选（值得吸收）

每条都基于「Pi JSONL 已原生记录该维度」的一手核验，附改造点：

- **K1. 项目维度（cwd → 项目排行榜）。** 一手核验：`session` entry 带 `cwd`、`session_info` entry 带 `name`（如 "Curio"）。**改造点**：`index.ts` 的 `SessionRollup` 增加 cwd 归一化聚合；新增项目排行榜视图（这正是 507 已在做、当前靠手算的「7 天项目排行」）。命中路线图方向 §2。
- **K2. 工具画像维度（toolName → bash-heavy / edit-heavy / research-heavy）。** 一手核验：`toolResult.toolName` 真实分布 bash 475 / read 313 / edit 229 / dgoal_plan 94 / tinyfish_search 10…。**改造点**：`index.ts` 增加 by-toolName 聚合，`formatDialogBody` 加工具分布段，识别项目工作流类型。命中路线图方向 §2「项目画像」。
- **K3. 错误情报（isError → 错误率 / 按工具错误来源 / retry storm）。** 一手核验：`toolResult.isError` 真实可用（样本 1173 次 toolResult，42 次 isError，错误率 3.6%，bash 21 / edit 18 / read 3）。**改造点**：新增 isError 聚合 + 相邻同名工具重试检测，对应 `ctx-insight` 的 Error Intelligence 的可算子集。命中路线图方向 §1「高噪声会话」。
- **K4. 工具延迟（toolCallId 对齐 → 按工具 P95 延迟）。** 一手核验：assistant message content 里的 toolCall block 带 `id`+`name`+起始时间戳，toolResult 带 `toolCallId`+结束时间戳，两端可按 toolCallId 对齐算延迟（样本实测 bash 234ms）。**改造点**：建 call→result 映射算 per-tool 延迟分位。对应 `ctx-insight` 的「P95 latency by tool」。
- **K5. 上下文健康（compaction.tokensBefore → 压缩频率 / 压缩量趋势 → Context Health 分）。** 一手核验：`compaction` entry 带 `tokensBefore` + `summary` + `fromHook`。**改造点**：聚合 compaction 事件，算「上下文被压缩了几次 / 每次丢多少」，对应 `ctx-insight` 的 Context Health 复合分。
- **K6. skill / 工作流画像（custom.customType → 工作流使用强度）。** 一手核验：`custom` entry 带 `customType`，真实出现 `dgoal-state` 130 次、`pi-autoname-state` 69 次。**改造点**：聚合 customType，看出 dgoal 等工作流在各项目的分布强度。
- **K7. insight 叙事模板（不抄它的 37 pattern，借「数字 → 因果叙事」思路）。** context-mode 的杀手锏是把聚合数字组织成「7 错误 0 提交=白干」「同文件改 12 次=先写 spec」。**改造点**：报告里把 K1~K6 的聚合数字组织成「高噪声会话 / 低产出会话 / 高频重试 / 压缩频繁」等叙事段，而不是只堆数字。这是把「统计」升级成「信息」的关键一步，也最贴合「会话信息拓展」的命名意图。

> 注：context-mode 能算、但 **Pi JSONL 不直接记录**的维度（git 操作的结构化事件、显式 user decision、subagent delegation 事件、rejected approaches），不作为候选 —— 这些要么得从 bash 工具结果文本里损失性地解析，要么 Pi 根本没记。要拿这些深度就得引入拦截层，落入 C1 设计冲突。在文档里显式标注这条边界。

## 4. 可借鉴的具体资源

- **context-mode `ctx-insight` 的 4 composite scores 框架**（Productivity / Quality / Delegation / Context Health）：可作为本项目「会话健康度评分」的参考维度划分（不必照搬权重，取维度）。
- **context-mode 的 23 事件类别表**：拿来做对照清单，逐条标出「Pi JSONL 已原生支持 / 需解析 / 不支持」，用于界定只读分析层的能力边界（K1~K6 已标为可算，git/decision/delegation 标为不支持）。
- **作者一手发布帖**（LinkedIn，v1.0.103 发布）：列出 `ctx-insight` 的真实形态与示例叙事，是一手源；本档 §2、§3.3 的 insight 形态描述以此为准。

## 5. 决策记录

本档为调研参考，暂无够格进 `doc/决策档案/` 的刻碑决策。以下留待 `507-grill` 决策树后再定：

- 重新命名（当前 `pi-token-stats` 过窄，与「会话信息拓展」定位不符）—— 候选方向：`pi-session-insights` / `pi-session-stats` / `pi-sessions` / `pi-session-compass`，**命名是 grill 的第一决策点**。
- 是否上 insight 叙事层（K7）vs 保持纯聚合，决定「统计工具」还是「信息工具」的产品形态分界。
- 是否引入 composite score（参考 K5 + ctx-insight 4 分框架），决定要不要从「报告」升级到「评分」。
- 项目维度（K1）是否作为默认视图之一。

> 递进：本档（research，把外部机制搞清 + 三档分级）→ `507-grill`（把命名 / 形态 / 边界问透）→ 落成路线图修订或工单。
