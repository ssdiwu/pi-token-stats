# PRD: pi-session-insights

> 状态：对齐后规格（research + grill 收口的基准）。配套参考：`doc/20-能力参考/01-context-mode会话信息分析参考.md`。
> 本 PRD 只描述"要做什么 / 为什么"，不规定实现步骤；具体文件路径、schema 细节等易过期项留实施阶段定。

## Problem Statement

Pi 已经把每次会话的结构化事件完整写进本地 session JSONL（cwd / 模型 / token / cost / 工具名 / 错误标志 / 压缩事件 / 工作流自定义事件等），但用户没有顺手的入口去**读懂这些会话**：

- 只能看"今天花了多少 token"（pi-token-stats 现状），看不到"消耗集中在哪类项目、哪类工具、哪里噪声大"。
- 想看"今天做了什么"得另开 pi-daily，两个包各管一摊，量纲统计和活动叙事割裂。
- 竞品（context-mode / `@observal/pi-insights` 等）要么靠拦截工具调用获取深度（对 Pi 是冗余开销，因为 Pi 原生日志已足够丰富），要么只做 usage 统计、不做叙事。

用户（507）需要一个**只读、不拦截**的 Pi 会话信息拓展包：把 Pi 已经写好的会话日志，变成一层多维分析聚合 + 叙事日报，并能把日报自动归档到可配置目录长期积累。

## Solution

新包 `pi-session-insights`，单入口命令 `/insights`，在 Pi 原生 TUI 内开一个交互面板（L2 overlay），面板内分视图承载"会话信息"的两类产物：

- **数字视图**（即时、纯算法）：量纲 / 项目排行 / 工具画像 / 错误情报 / 上下文健康。对标竞品的 usage insights，但走轻量纯算法路线，不烧 LLM。
- **日报视图**（叙事、过 LLM）：基于按天摘要生成当日工作叙事，并自动归档到配置目录。

关键立论（已用本机真实会话文件核验）：Pi 原生 session JSONL 足够丰富，能靠"只读 JSONL"达到竞品靠拦截才能拿到的大部分分析维度，无需 context-mode 那套拦截税。

## User Stories

1. 作为 Pi 用户，我想在终端内一个入口看到会话消耗集中在哪里，这样我能定位高成本项目 / 工具 / 工作流，而不只是看一个总 token 数。
2. 作为 Pi 用户，我想看到当日工作叙事日报（做了什么 / 产出 / 阻塞 / 待跟进），这样我能回顾和汇报。
3. 作为 Pi 用户，我想在数字洞察中对比时间范围和项目活动，这样能识别趋势与异常。
4. 作为日报使用者，我想让生成的日报自动归档到可配置目录，这样可稳定重跑、检索和补写。
5. 作为已使用 pi-daily 的用户，我希望平滑迁移——daily 暂时保留兼容，新包是它的超集，最终吸收其能力。
6. 作为关心成本的用户，我想让分析层尽量少烧 token——数字切片即开即看不调 LLM，只有日报生成才用 LLM，且按天读写避免一次性吞超量会话原文。

## Implementation Decisions

### 定位与边界

- **只读不拦截**：只读 `~/.pi/agent/sessions/**/*.jsonl`，不拦截工具调用、不做 sandbox、不做 session continuity 恢复（Pi 已有原生 compaction / `/session` / `/resume`）。详见参考文档 §3.1 设计冲突清单。
- **超集策略**：覆盖竞品（`@observal/pi-insights` / `@mrclrchtr/supi-insights` / `@tmustier/pi-usage-extension` 等）的 usage insights 能力 + pi-daily 的叙事日报，不强求差异化。
- **与 pi-daily 的关系**：新包是 pi-daily 超集。daily 保留兼容已发布用户，不投入新功能，待新包成熟后引导迁移、最终吸收。

### 形态分层（流派切分）

- **数字视图 = 流派 B（交互面板）**：L2 overlay 面板，键盘切换视图 / 时段。即开即看。
- **日报视图 = 流派 A（生成流）**：过 LLM 生成叙事 markdown，在面板内用 `Markdown` 组件渲染、可滚动、可沉淀文件。两种产物同面板消费，不割裂。
- **常驻实时条（流派 C）**：可选后续增强，非首版范围。

### 数据维度（来自参考文档候选 K0~K7）

Pi session JSONL 已原生支持，纯算法可算（已在真实会话文件核验）：
- K0 量纲：token / cost / 模型维度聚合（继承自 pi-token-stats）。
- K1 项目维度：`session.cwd` + `session_info.name` → 项目排行。
- K2 工具画像：`toolResult.toolName` → bash-heavy / edit-heavy / research-heavy 等。
- K3 错误情报：`toolResult.isError` → 错误率、按工具错误来源、相邻重试检测。
- K4 工具延迟：assistant content 的 toolCall block（id+起始时间戳）与 toolResult（toolCallId+结束时间戳）按 id 对齐算延迟。
- K5 上下文健康：`compaction` entry 的 `tokensBefore` → 压缩频率 / 压缩量。
- K6 工作流画像：`custom` entry 的 `customType`（如 `dgoal-state`）→ 工作流使用强度。

**硬边界**：git 操作结构化事件、显式 user decision、subagent delegation 事件——Pi JSONL 不直接记录，要拿这些深度就得引入拦截层，落入"不做"。只读路线的能力上限即此。

### 分析深度（按天 LLM 读写）

- **轻量起步**：不做 observal 式 per-session LLM facet 抽取。
- **按天读写**：以"天"为单位做 LLM 读写，每天产出一个结构化摘要（目标 / 产出 / 异常等），缓存本地。跨天聚合时主代理读"天摘要"而非会话原文，避免一次性吞超量内容。
- **数字面板视图不过 LLM**（纯算法）；只有日报视图过 LLM。
- 需要**按天粒度缓存设施**（类似竞品 facet 缓存，但粒度是"天"而非"会话"），这是基线设施、非可选。

### 配置化自动归档

- 配置文件固定为 `~/.pi/agent/pi-session-insights.json`；不保存 API Key。
- 日报默认自动写入 `reportOutputDir`；未配置时使用 `~/Documents/pi-daily-reports`。
- 单日与多天补写均按 `YYYY-MM-DD.md` 写入，同日重跑幂等覆盖。
- `dailyModel` 采用 `provider/model-id:thinking` 选择器；不可用时显式回退当前会话模型，当前模型也不可用时使用本地 Markdown fallback，并在日报记录原因。

### 展示层技术

- L2 overlay 面板：`ctx.ui.custom(comp, {overlay:true})` + `@earendil-works/pi-tui` 组件（`Markdown` / `Selector` / `Box` / `Container`）。
- 非 TUI 模式（`-p` / JSON / RPC）退化为纯文本输出。
- **旧 ADR 0001（pi-token-stats 的"只用 select/input、拒绝 overlay"）在新项目失效**——其决策前提（overlay = 简陋自绘小窗）已不成立，Pi overlay 有完整组件系统。需新建 ADR 记录这个转变。

### 命名与仓库

- 包名 `pi-session-insights`（npm 已确认未占用），命令 `/insights`（避开官方 `/session`、避开 pi-daily `/daily`）。
- 代码基底：从零搭骨架，复用 pi-daily 技术资产（复制 / 重构其 `session-scan` / `session-extract` / `report-model` / `ai-summary` / `markdown-render` / `natural-time` / `redact` 等模块）。
- pi-token-stats 仓库归档，保留 git 历史。

## Testing Decisions

- **数据层单元测试（主力）**：Node 内置 test，手造 session JSONL 样本输入，测公开聚合函数（K0~K6 / 今日差异 diff）。纯函数不 mock 系统。先例：pi-daily `tests/report.test.ts`、`session-extract.test.ts`。
- **按天缓存层**：`day-*.json` 读写幂等、缺失天补跑、跨天聚合读摘要不碰原文。
- **日报归档**：临时配置目录 + mock 配置文件 → 验证默认目录、配置覆盖、文件名、同日幂等覆盖。
- **命令端到端**：`pi -p "/insights ..."` print 模式纯文本输出（非 TUI 退化为文本）。先例：pi-token-stats 验证接缝。
- **LLM 层**：只测回退规则路径（按天摘要生成、日报生成的规则版），真 LLM 调用手测。先例：pi-daily `ai-summary.test.ts`。
- **TUI 面板交互**：不自动化（print 模式无法覆盖键盘交互），手测。
- 测试看外部行为不看实现细节；mock 只放系统边界（LLM、文件系统、日报配置）。
- TS 源码直接 import `.ts` 跑 Node test，不走编译（沿用 pi-daily 风格）。

## Out of Scope

- 不拦截工具调用 / 不做 sandbox 执行 / 不做 session continuity 恢复 / 不做跨平台适配 / 不做全局 agent memory 平台。
- 不做 composite score（0-100 评分）——健康度只做事实陈述（"压缩 3 次丢 X token"），不出分数。
- 不做 L3 常驻实时条（首版）。
- 不做 git / decision / delegation 维度（Pi JSONL 不记录，需拦截才能拿，越界）。
- 不保存 API Key；日报归档目录仅通过用户配置或约定默认值解析。

## Further Notes

- **风险：与 pi-daily 的重叠迁移**。新包吸收 daily 能力，但 daily 已发布有用户。迁移期需保持 daily 可用、不破坏，最终引导。开放问题：迁移节奏和 daily 退役时机，留实施阶段定。
- **风险：按天 LLM 读写仍烧当前会话 model**。虽轻量于 observal，但日报生成 + 天摘要生成仍有 token 成本。需在面板内明确提示"生成日报会花 token"。
- **开放问题**（落规格 / 实施阶段定，不在本 PRD 拍）：
  - 按天摘要缓存的具体 schema 与目录路径（骨架 `~/.pi/agent/session-insights/day-YYYY-MM-DD.json`）。
  - 多天范围日报的确认交互和批量结果展示细节。
  - L2 面板的视图切换交互细节（键位、视图列表）。
  - README / AGENTS / doc 内 `pi-token-stats` 字样的全面更新。
- **决策档案待补**：够格进 `doc/决策档案/` 的至少两条——①只读不拦截的能力边界（含 git/decision/delegation 硬边界）；②旧 ADR 0001 失效、展示层升级到 overlay 面板的转变。实施时按需沉淀。
