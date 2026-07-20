# tests — pi-session-insights 测试

本目录放 `pi-session-insights` 的 Node.js 内置测试，直接 `import` TypeScript 源文件，不走编译产物。

## 当前覆盖

- `usage-rollup.test.ts`：K0 消耗量纲
- `audit-usage.test.ts`：pi-dgoal 脱敏审核用量扫描、时间过滤、去重聚合与渲染
- `dteam-usage.test.ts`：dteam worker 脱敏用量扫描、时间过滤、去重及 worker/model/tier 聚合与渲染
- `insights-tool.test.ts`：insights tool 结果的摘要 / 展开文字投影
- `daily-tool.test.ts`：daily tool 注册、渲染、结构化参数、insights/daily 路由提示与职责分离
- `daily.e2e.test.ts`：daily 入口端到端日报生成、逐日归档、批次摘要与覆盖跳过
- `dimensions.test.ts`：K1/K2/K3/K5 多维聚合
- `daily-options.test.ts`：日报自适应日界、显式日界与多天日期展开
- `daily-command.test.ts`：`/daily` 命令参数校验、日界、完整/中文/紧凑月日范围展开与 buildDailyRequest 参数合并
- `daily-config.test.ts`：日报目录默认值、模型选择器与模型回退
- `daily-archive.test.ts`：配置文件读取、同日期稳定归档覆盖与 probeDailyReportExists 存在性探测
- `day-cache.test.ts`：按天摘要缓存行为
- `day-report.test.ts`：历史日报 markdown 缓存命中行为
- `daily-orchestrator.test.ts`：日报批量摘要、范围扫描、错误隔离、覆盖确认策略（无文件直写/有文件确认/非 TUI 跳过）与 seams 注入
- `obsidian-sync.test.ts`：Obsidian 探测与落点
- `package-manifest.test.ts`：Pi core runtime import 的 peer dependency 声明
- `panel.test.ts`：日报预览行数上限与完整日报提示
- `panel-loading.test.ts`：面板先显示加载态、异步完成后重绘，以及关闭后的生命周期保护
- `session-scan.test.ts`：按修改时间和事件范围过滤、逐行容错解析、并发扫描后保持文件顺序
- `report-session-extract.test.ts` / `report-model.test.ts` / `report-ai-summary.test.ts`：日报事实提取、报告模型与 AI prompt 骨架

## 运行

```bash
npm test
```

如改 `day-cache.ts`、`report-session-extract.ts`、`report-model.ts`、`report-ai-summary.ts`、`report-markdown.ts`，应补对应测试。