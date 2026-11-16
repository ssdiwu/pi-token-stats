# pi-session-insights

`pi-session-insights` 是一个 Pi extension（扩展）包，做**只读的 Pi 会话信息拓展**：从本地 session JSONL 聚合会话消耗与活动，提供多维分析 + 项目化日报。

> 当前进度：已实现 K0 量纲 + 多维分析（K1/K2/K3/K5）+ 按天摘要缓存 + 项目化日报（复用 pi-daily 日报链）+ 配置化自动归档 + L2 交互面板。详见 `doc/10-需求规格/PRD-pi-session-insights.md`。

## 定位

- **只读不拦截**：只读 `~/.pi/agent/sessions/**/*.jsonl` 及本机扩展产生的脱敏数字账本，不拦截工具调用、不做 sandbox。对照 context-mode 的分析层心智模型，但靠读取既有记录达到深度，不付拦截税。
- 调研与设计依据见 `doc/references/01-context-mode会话信息分析参考.md`（历史参考，非现行权威）和 `doc/10-需求规格/PRD-pi-session-insights.md`。

## 当前功能（量纲 + 多维分析 + 项目化日报）

注册两个独立的 slash command（斜杠命令）：

```text
/insights [自然语言时间范围]   # token/cost/工具/项目/健康数字面板
/daily [日期|范围] [--day-start HH:mm] [--project current]   # 项目化日报
```

`/insights` 默认无参数显示今天的数据：

```text
/insights
/insights 最近5小时
/insights 本周
/insights 最近一周
/insights 昨天
/insights 昨天到今天
/insights 2026-06-17
/insights 2026-06-10 到 2026-06-17
/insights 当前会话
```

`/daily` 生成按真实项目分组的项目化日报并归档：

```text
/daily                       # 今天日报
/daily 昨天
/daily 2026-06-17
/daily 0718 和 0719           # MMDD 范围按当前年份解析
/daily 2026-06-10 到 2026-06-17
/daily 本周
/daily --project current     # 限定当前项目
/daily --day-start 03:00     # 自定义日界
```

> `/insights daily` 已废弃；pi-daily 卸载后由本项目 `/daily` 接管每日日报。

日报自动归档到 `~/.pi/agent/pi-session-insights.json` 的 `reportOutputDir`；未配置时写 `~/Documents/pi-daily-reports/YYYY-MM-DD.md`。多日范围会逐日写入独立文件，命令或 tool 结果只显示生成数量与归档路径，不展开各日报正文。**归档覆盖策略**：无已有文件直接写入；有已有文件时，TUI 模式一次确认是否覆盖（多天合并确认），非交互模式（`-p`/JSON/RPC）默认跳过已有文件并在结果提示。`dailyModel` 可选用 `provider/model-id:thinking` 指定日报模型；不可用时会提示并回退当前会话模型，当前模型也不可用时使用本地 Markdown fallback。

同时注册两个 tool（工具），agent 可在自然语言对话中调用：`insights`（读 token/cost 消耗，优先传结构化 `since/until`）与 `daily`（生成项目化日报，传 `date`/`range`/`projectCurrent`）。例如你问"最近 5 小时 token 花了多少？"时 agent 调 `insights`；问"生成今天的日报"或"总结今天的工作"时 agent 调 `daily`。

## UI 行为

- **TUI 模式**：`/insights` 无参数会立即打开带加载状态的 L2 overlay 交互面板（第 1 页今天消耗 / 第 2 页昨天日报预览，见 ADR 0003），再异步读取数据。数字页只保留今天范围内的 session 事件；日报页只读缓存并限制行数。完整日报请运行 `/daily`。带参数（如 `/insights 最近5小时`）走原生 select/input 提问式对话框。
- **非 TUI 模式**（`pi -p` / JSON / RPC）：输出纯文本，方便脚本和测试验证。
- 日报标签与 AI 输出跟随 `pi-di18n` 的当前 locale（语言环境）；支持简体中文、繁体中文、日语、韩语、德语、法语、西班牙语、葡萄牙语、俄语、阿拉伯语和英语。
- 时间范围解析：先用当前模型理解，失败后回退本地规则解析。

## 统计口径

- 默认 `/insights` = 今天本机所有 session 的统计。
- 时间范围统计逐行读取 session JSONL，只保留范围内事件与必要元数据；扫描保持异步、容错，并串行化多个外部扫描请求以控制内存峰值。
- 时间窗口按 assistant message（模型回复）的实际 timestamp（时间戳）聚合 token 与 cost；同时只读合并 `~/.pi/agent/audit-usage.jsonl` 中 pi-dgoal 的脱敏审核用量，以及 `~/.pi/agent/dteam-usage.jsonl` 中 dteam in-memory worker 的脱敏用量（都按 `dedupKey` 去重）。
- 模型维度按 `provider/model`（供应商/模型）聚合；即使 model 同名，只要 provider 不同也会分开统计。
- `/insights 当前会话` 使用 `ctx.sessionManager.getBranch()` 统计 active branch，并按 `parentSessionId` 合并该主会话所属的 dteam worker 用量。

## 支持的时间表达

- 今天 / day / today
- 昨天 / yesterday
- 本周 / week
- 最近一周 / 过去一周 / last week
- 最近 N 小时 / 最近 N 天 / 最近 N 周
- 裸时间：`5小时`、`1天`、`2周`
- 单日：`YYYY-MM-DD`、`YYYY/MM/DD`
- 日期范围：`YYYY-MM-DD 到 YYYY-MM-DD`、`YYYY/MM/DD 到 YYYY/MM/DD`
- 命名范围：`昨天到今天`（结束边界为当前时刻）、`昨天到现在`
- 中文月日范围：`7月18日到7月19日`（按当前年份解析）
- `/daily` 紧凑月日范围：`0718 和 0719`（按当前年份解析）
- 当前会话 / session

当模型与本地规则都无法识别时，会回退到今天，并在标题里保留原始输入提示。

## 项目结构

```text
pi-session-insights/
├── index.ts                # Pi extension 入口，注册 /insights + /daily 命令与 insights/daily tool
├── src/
│   ├── types.ts            # 类型层：Session JSONL 解析类型 + 量纲/范围类型
│   ├── session-scan.ts     # 扫描层：异步扫描 ~/.pi/agent/sessions，容错解析（复用自 pi-daily）
│   ├── locale.ts           # 多语言文案 + locale 解析（pi-di18n 事件 API）
│   ├── usage-rollup.ts     # K0 量纲聚合（rollupEntries/rollupSessions，纯函数）
│   ├── dimensions.ts      # 多维聚合（K1 项目/K2 工具/K3 错误/K5 健康，纯算法）
│   ├── time-range.ts       # 时间范围解析（parseRange + LLM 解析）
│   ├── format.ts           # 格式化与渲染（print 模式纯文本）
│   ├── insights.ts         # 命令主逻辑（组装扫描 → 聚合 → 渲染）
│   ├── daily-command.ts    # /daily 命令参数解析、日期展开与 tool 参数合并
│   ├── daily-options.ts    # 默认/显式日界
│   ├── daily-config.ts     # 日报配置与模型选择器
│   ├── daily-archive.ts    # 配置目录稳定归档
│   ├── daily-orchestrator.ts # /daily 编排：覆盖确认、扫描、生成、归档、错误隔离
│   ├── day-cache.ts        # 按天摘要缓存（day-*.json 读写幂等 + 增量补跑）
│   ├── day-report.ts       # 日报组装：接日报生成链 + 缓存
│   ├── date-utils.ts       # 本地日期字符串与自然日 TimeRange
│   ├── report-session-extract.ts # 从 session 提取日报事实（任务/完成/阻塞/工具/文件）
│   ├── report-model.ts     # 按项目聚合日报模型
│   ├── report-ai-summary.ts # 配置模型→当前会话模型→本地 Markdown fallback
│   ├── report-markdown.ts  # AI 失败时的本地 Markdown fallback
│   ├── report-labels.ts    # 日报正文多语言文案字典
│   ├── daily-ui-labels.ts  # 日报命令 UI 多语言文案字典
│   ├── audit-usage.ts      # pi-dgoal audit-usage.jsonl 扫描、时间过滤与数字聚合
│   ├── dteam-usage.ts      # dteam-usage.jsonl 扫描、去重及 worker/model/tier 聚合
│   ├── panel-data.ts       # L2 overlay 面板数据加载
│   ├── report-redact.ts    # 日报链脱敏与截断
│   ├── obsidian-sync.ts    # 遗留 Obsidian 落点工具，不参与默认日报归档
│   └── panel.ts            # L2 overlay 交互面板（今天消耗/昨天日报切换）
├── tests/                  # Node 内置 test（TS 直接 import .ts）
├── PLAN.md                 # 当前执行状态与接续位置
├── doc/                    # 文档：入口、需求规格、决策档案、经验笔记、references（来源与历史）
└── package.json            # Pi package 清单
```

## 安装

把本仓库路径加入 `~/.pi/agent/settings.json` 的 `packages`：

```json
"/Users/diwu/Workspace/Codes/Githubs/pi-extensions/pi-session-insights"
```

然后在 Pi 中执行：

```text
/reload
```

## 开发验证

```bash
npm run check          # typecheck + 单元测试
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 当前会话"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/daily 2020-01-02"
```
