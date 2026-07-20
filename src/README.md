# src — pi-session-insights 源码

本目录存放 `pi-session-insights` 的核心逻辑。`index.ts` 只负责注册 Pi extension（Pi 扩展）命令；扫描、聚合、日报生成和展示逻辑放在本目录。

## 模块分层

| 文件 | 职责 |
|---|---|
| `types.ts` | 基础类型：session JSONL、量纲、多维、日报模型 |
| `session-scan.ts` | 串行化外部扫描请求；可按文件修改时间筛选，逐行读取并仅保留目标范围事件 |
| `audit-usage.ts` | 只读扫描 pi-dgoal 脱敏审核用量，并按时间范围去重聚合 |
| `dteam-usage.ts` | 只读扫描 dteam worker 脱敏用量，并按时间、worker、模型与实际档位去重聚合 |
| `usage-rollup.ts` | K0 消耗量纲聚合 |
| `dimensions.ts` | K1/K2/K3/K5 多维聚合 |
| `time-range.ts` | `/insights` 时间范围解析 |
| `format.ts` | 数字视图纯文本渲染 |
| `insights.ts` | `/insights` 主逻辑：按范围扫描、聚合与渲染数字洞察 |
| `daily-options.ts` | 默认/显式日界与多天日期展开 |
| `daily-config.ts` | `pi-session-insights.json` 的归档目录和模型选择器 |
| `daily-command.ts` | `/daily` 命令参数、紧凑月日与自然语言时间范围解析 |
| `daily-archive.ts` | 配置目录下的稳定日报文件归档 |
| `daily-orchestrator.ts` | `/daily` 编排：确认、范围扫描、生成、归档、错误隔离 |
| `day-cache.ts` | 按天缓存：确定性摘要 + 报表 markdown |
| `date-utils.ts` | 本地日期字符串与自然日 TimeRange 工具 |
| `report-session-extract.ts` | 从 session 提取日报事实：任务、完成、阻塞、工具、文件 |
| `report-model.ts` | 把多 session 事实聚合成日报模型 |
| `report-ai-summary.ts` | 用配置日报模型（不可用时回退当前会话模型）整理项目化日报 |
| `report-markdown.ts` | AI 不可用时的本地 Markdown fallback |
| `report-labels.ts` | 11 语言日报正文文案字典 |
| `daily-ui-labels.ts` | 11 语言日报命令 UI 文案字典 |
| `panel-data.ts` | L2 overlay 面板数据加载 |
| `report-redact.ts` | 日报链路脱敏与截断 |
| `obsidian-sync.ts` | 遗留 Obsidian 落点工具，不参与默认日报归档 |
| `panel.ts` | `/insights` L2 overlay 面板 |

## 当前日报链

`/daily [日期/自然语言范围]` 生成完整日报并自动归档到配置目录；`--day-start HH:mm` 和 `--project current` 可覆盖默认口径。多日范围逐日归档，界面只返回生成数量与文件路径：

1. `session-scan.ts` 按整体日报范围筛选并逐行扫描本地 session
2. `report-session-extract.ts` 提取任务 / 完成 / 风险 / 待跟进 / 文件 / 工具事实
3. `report-model.ts` 聚合成日报模型
4. `report-ai-summary.ts` 让配置日报模型按项目输出日报，并在不可用时回退当前会话模型
5. 模型失败时回退到 `report-markdown.ts`
6. `day-cache.ts` 缓存历史日报

无参数面板先挂载加载态，再异步读取数据：数字页只扫描并保留今天范围内的 session 事件；第 2 页只读取昨天的缓存日报并限制为预览，不触发日报生成。缺少缓存时提示运行 `/daily`；面板关闭后不再重绘异步结果。

## 约定

- 数字视图（今天消耗 / 范围洞察）不调 LLM；session、pi-dgoal audit 与 dteam worker 用量均只读本机记录。
- 日报正文只读本地 session，不上传原始长文本，只发送脱敏后的结构化事实。
- 历史日报优先命中缓存；今天日报由显式命令触发生成。
