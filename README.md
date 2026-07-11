# pi-session-insights

`pi-session-insights` 是一个 Pi extension（扩展）包，做**只读的 Pi 会话信息拓展**：从本地 session JSONL 聚合会话消耗与活动，提供多维分析 + 项目化日报。

> 当前进度：已实现 K0 量纲 + 多维分析（K1/K2/K3/K5）+ 按天摘要缓存 + 项目化日报（复用 pi-daily 日报链）+ 配置化自动归档 + L2 交互面板。详见 `doc/10-需求规格/PRD-pi-session-insights.md`。

## 定位

- **只读不拦截**：只读 `~/.pi/agent/sessions/**/*.jsonl`，不拦截工具调用、不做 sandbox。对照 context-mode 的分析层心智模型，但靠"读 JSONL"达到深度，不付拦截税。
- 调研与设计依据见 `doc/20-能力参考/01-context-mode会话信息分析参考.md` 和 `doc/10-需求规格/PRD-pi-session-insights.md`。

## 当前功能（量纲 + 多维分析 + 项目化日报）

注册一个 slash command（斜杠命令）：

```text
/insights [自然语言时间范围]
```

默认无参数时显示今天的数据。示例：

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
/insights daily（生成当日项目化日报）
```

运行 `/insights daily` 会自动归档到 `~/.pi/agent/pi-session-insights.json` 的 `reportOutputDir`；未配置时写 `~/Documents/pi-daily-reports/YYYY-MM-DD.md`，同日重跑幂等覆盖。`dailyModel` 可选用 `provider/model-id:thinking` 指定日报模型；不可用时会提示并回退当前会话模型，当前模型也不可用时使用本地 Markdown fallback。

同时注册 `insights` tool（工具），agent 可以在自然语言对话中调用。例如你问"最近 5 小时 token 花了多少？"时，agent 应优先把已理解好的绝对 `since/until` 时间范围传给工具；若没有结构化范围，也可退回传原始时间表达。

## UI 行为

- **TUI 模式**：`/insights` 无参数会立即打开带加载状态的 L2 overlay 交互面板（第 1 页今天消耗 / 第 2 页昨天日报预览，见 ADR 0003），再异步读取数据。数字页只扫描今天有写入的 session 文件；日报页只读缓存并限制行数。完整日报请运行 `/insights daily`。带参数（如 `/insights 最近5小时`）走原生 select/input 提问式对话框。
- **非 TUI 模式**（`pi -p` / JSON / RPC）：输出纯文本，方便脚本和测试验证。
- 日报标签与 AI 输出跟随 `pi-di18n` 的当前 locale（语言环境）；支持简体中文、繁体中文、日语、韩语、德语、法语、西班牙语、葡萄牙语、俄语、阿拉伯语和英语。
- 时间范围解析：先用当前模型理解，失败后回退本地规则解析。

## 统计口径

- 默认 `/insights` = 今天本机所有 session 的统计。
- 时间范围统计扫描 `~/.pi/agent/sessions` 下所有 JSONL（异步、容错解析）。
- 时间窗口按 assistant message（模型回复）的实际 timestamp（时间戳）聚合 token 与 cost。
- 模型维度按 `provider/model`（供应商/模型）聚合；即使 model 同名，只要 provider 不同也会分开统计。
- `/insights 当前会话` 使用 `ctx.sessionManager.getBranch()`，口径接近官方 `/session` 的 active branch。

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
- 当前会话 / session

当模型与本地规则都无法识别时，会回退到今天，并在标题里保留原始输入提示。

## 项目结构

```text
pi-session-insights/
├── index.ts                # Pi extension 入口，注册 /insights 命令 + insights tool
├── src/
│   ├── types.ts            # 类型层：Session JSONL 解析类型 + 量纲/范围类型
│   ├── session-scan.ts     # 扫描层：异步扫描 ~/.pi/agent/sessions，容错解析（复用自 pi-daily）
│   ├── locale.ts           # 多语言文案 + locale 解析（pi-di18n 事件 API）
│   ├── usage-rollup.ts     # K0 量纲聚合（rollupEntries/rollupSessions，纯函数）
│   ├── dimensions.ts      # 多维聚合（K1 项目/K2 工具/K3 错误/K5 健康，纯算法）
│   ├── time-range.ts       # 时间范围解析（parseRange + LLM 解析）
│   ├── format.ts           # 格式化与渲染（print 模式纯文本）
│   ├── insights.ts         # 命令主逻辑（组装扫描 → 聚合 → 渲染）
│   ├── daily-command.ts    # /insights daily 子命令解析与多天日期展开
│   ├── daily-options.ts    # 默认/显式日界
│   ├── daily-config.ts     # 日报配置与模型选择器
│   ├── daily-archive.ts    # 配置目录稳定归档
│   ├── daily-orchestrator.ts # /insights daily 编排：确认、扫描、生成、归档、错误隔离
│   ├── day-cache.ts        # 按天摘要缓存（day-*.json 读写幂等 + 增量补跑）
│   ├── day-report.ts       # 日报组装：接日报生成链 + 缓存
│   ├── date-utils.ts       # 本地日期字符串与自然日 TimeRange
│   ├── report-session-extract.ts # 从 session 提取日报事实（任务/完成/阻塞/工具/文件）
│   ├── report-model.ts     # 按项目聚合日报模型
│   ├── report-ai-summary.ts # 配置模型→当前会话模型→本地 Markdown fallback
│   ├── report-markdown.ts  # AI 失败时的本地 Markdown fallback
│   ├── report-labels.ts    # 日报正文多语言文案字典
│   ├── daily-ui-labels.ts  # 日报命令 UI 多语言文案字典
│   ├── panel-data.ts       # L2 overlay 面板数据加载
│   ├── report-redact.ts    # 日报链脱敏与截断
│   ├── obsidian-sync.ts    # 遗留 Obsidian 落点工具，不参与默认日报归档
│   └── panel.ts            # L2 overlay 交互面板（今天消耗/昨天日报切换）
├── tests/                  # Node 内置 test（TS 直接 import .ts）
├── doc/                    # 需求规格、调研参考、决策档案
└── package.json            # Pi package 清单
```

## 安装

把本仓库路径加入 `~/.pi/agent/settings.json` 的 `packages`：

```json
"/Users/diwu/Workspace/Codes/Githubs/pi-session-insights"
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
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights daily"
```
