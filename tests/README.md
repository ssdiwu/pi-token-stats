# tests — pi-session-insights 测试

本目录放 `pi-session-insights` 的 Node.js 内置测试，直接 `import` TypeScript 源文件，不走编译产物。

## 当前覆盖

- `usage-rollup.test.ts`：K0 消耗量纲
- `dimensions.test.ts`：K1/K2/K3/K5 多维聚合
- `day-cache.test.ts`：按天摘要缓存 / narrative 缓存行为
- `day-report.test.ts`：历史日报 markdown 缓存命中行为
- `day-diff.test.ts`：按天差异算法与渲染
- `obsidian-sync.test.ts`：Obsidian 探测与落点
- `package-manifest.test.ts`：Pi core runtime import 的 peer dependency 声明
- `report-session-extract.test.ts` / `report-model.test.ts` / `report-ai-summary.test.ts`：日报事实提取、报告模型与 AI prompt 骨架

## 运行

```bash
npm test
```

如改 `day-cache.ts`、`report-session-extract.ts`、`report-model.ts`、`report-ai-summary.ts`、`report-markdown.ts`，应补对应测试。