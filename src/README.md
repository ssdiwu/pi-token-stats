# src — pi-session-insights 源码

本目录存放 `pi-session-insights` 的核心逻辑。`index.ts` 只负责注册 Pi extension（Pi 扩展）命令；扫描、聚合、日报生成和展示逻辑放在本目录。

## 模块分层

| 文件 | 职责 |
|---|---|
| `types.ts` | 基础类型：session JSONL、量纲、多维、日报模型 |
| `session-scan.ts` | 异步扫描本地 `~/.pi/agent/sessions/**/*.jsonl`，支持按文件修改时间过滤 |
| `usage-rollup.ts` | K0 消耗量纲聚合 |
| `dimensions.ts` | K1/K2/K3/K5 多维聚合 |
| `time-range.ts` | `/insights` 时间范围解析 |
| `format.ts` | 数字视图纯文本渲染 |
| `insights.ts` | `/insights` 主逻辑：范围洞察、`daily` 子命令 |
| `day-cache.ts` | 按天缓存：确定性摘要 + 报表 markdown |
| `day-diff.ts` | 按天差异（趋势 / 新增 / 消失 / 工具变化 / 异常） |
| `report-session-extract.ts` | 从 session 提取日报事实：任务、完成、阻塞、工具、文件 |
| `report-model.ts` | 把多 session 事实聚合成日报模型 |
| `report-ai-summary.ts` | 用当前会话模型把日报模型整理成项目化日报 |
| `report-markdown.ts` | AI 不可用时的本地 Markdown fallback |
| `report-labels.ts` | 日报文案字典（`zh-CN` / `zh-TW` / `en`） |
| `report-redact.ts` | 日报链路脱敏与截断 |
| `obsidian-sync.ts` | Obsidian vault 探测与日报落点 |
| `panel.ts` | `/insights` L2 overlay 面板 |

## 当前日报链

`/insights daily` 生成完整日报：

1. `session-scan.ts` 扫描本地 session
2. `report-session-extract.ts` 提取任务 / 完成 / 风险 / 待跟进 / 文件 / 工具事实
3. `report-model.ts` 聚合成日报模型
4. `report-ai-summary.ts` 让当前会话模型按项目输出日报
5. 模型失败时回退到 `report-markdown.ts`
6. `day-diff.ts` 追加“差异”段
7. `day-cache.ts` 缓存历史日报

无参数面板的数字页只扫描今天有写入的 session 文件；第 2 页只读取昨天的缓存日报并限制为预览，不触发日报生成。缺少缓存时提示运行 `/insights daily`。

## 约定

- 数字视图（今天消耗 / 范围洞察）不调 LLM。
- 日报正文只读本地 session，不上传原始长文本，只发送脱敏后的结构化事实。
- 历史日报优先命中缓存；今天日报由显式命令触发生成。
