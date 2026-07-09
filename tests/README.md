# tests — pi-session-insights 测试

本目录放 `pi-session-insights` 的 Node.js 内置测试，直接 `import` TypeScript 源文件，不走编译产物。

## 当前覆盖

- `usage-rollup.test.ts`：K0 消耗量纲
- `dimensions.test.ts`：K1/K2/K3/K5 多维聚合
- `daily-options.test.ts`：日报自适应日界、显式日界与多天日期展开
- `daily-command.test.ts`：`/insights daily` 参数校验、日界与日期范围展开
- `daily-config.test.ts`：日报目录默认值、模型选择器与模型回退
- `daily-archive.test.ts`：配置文件读取与同日期稳定归档覆盖
- `day-cache.test.ts`：按天摘要缓存 / narrative 缓存行为
- `day-report.test.ts`：历史日报 markdown 缓存命中行为
- `day-diff.test.ts`：按天差异算法与渲染
- `obsidian-sync.test.ts`：Obsidian 探测与落点
- `package-manifest.test.ts`：Pi core runtime import 的 peer dependency 声明
- `panel.test.ts`：日报预览行数上限与完整日报提示
- `panel-loading.test.ts`：面板先显示加载态、异步完成后重绘，以及关闭后的生命周期保护
- `session-scan.test.ts`：按修改时间过滤、并发扫描后保持文件顺序与解析错误汇总
- `report-session-extract.test.ts` / `report-model.test.ts` / `report-ai-summary.test.ts`：日报事实提取、报告模型与 AI prompt 骨架

## 运行

```bash
npm test
```

如改 `day-cache.ts`、`report-session-extract.ts`、`report-model.ts`、`report-ai-summary.ts`、`report-markdown.ts`，应补对应测试。