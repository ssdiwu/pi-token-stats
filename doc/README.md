# pi-session-insights 文档入口

## 阅读地图

- `doc/10-需求规格/PRD-pi-session-insights.md`：**当前基准**。research + grill 对齐后落成的需求规格（定位、形态分层、K0~K6 维度、按天 LLM 读写、今日差异、Obsidian 沉淀、测试接缝、Out of Scope）。新功能 / 实施以此为依据。
- `doc/20-能力参考/01-context-mode会话信息分析参考.md`：对照 context-mode，论证「Pi 原生 JSONL 够丰富、可只读长出 insight 层」并给出三档借鉴分级（设计冲突 / 同思路 / 候选 K1~K6 改造点）。
- `README.md`：当前能力（量纲 + 多维分析 + 项目化日报）、`/insights` 命令、统计口径、项目结构、安装与验证。
- `AGENTS.md`：给 agent 的实现边界（guardrails）、代码边界、验证要求、Out of Scope。
- `index.ts`：Pi extension 入口，注册 `/insights` 命令 + `insights` tool。
- `src/`：分层实现——`types.ts`（类型）/ `session-scan.ts`（异步扫描，复用自 pi-daily）/ `locale.ts`（多语言 + locale 解析）/ `usage-rollup.ts`（K0 量纲聚合，纯函数）/ `dimensions.ts`（多维聚合 K1/K2/K3/K5）/ `time-range.ts`（时间范围解析 + LLM）/ `format.ts`（渲染）/ `insights.ts`（命令主逻辑）/ `day-cache.ts`（按天缓存）/ `day-report.ts`（接日报生成链 + 差异）/ `day-diff.ts`（按天差异）/ `report-session-extract.ts`（日报事实提取）/ `report-model.ts`（日报模型聚合）/ `report-ai-summary.ts`（AI 项目化日报）/ `report-markdown.ts`（fallback 渲染）/ `report-labels.ts`（日报文案）/ `report-redact.ts`（脱敏）/ `obsidian-sync.ts`（Obsidian 沉淀）/ `panel.ts`（L2 overlay 面板）。
- `doc/决策档案/`：[0001](../决策档案/0001-统一使用原生select与input对话框.md)（select/input，**已被 0003 取代**）；[0002](../决策档案/0002-只读不拦截会话分析边界.md)（只读不拦截边界）；[0003](../决策档案/0003-展示层升级L2overlay面板.md)（L2 overlay 面板）。索引见 `doc/决策档案/README.md`。
- `doc/30-路线图/路线地图.md`：pi-token-stats 时代路线图，**已被 PRD 取代**，保留作历史参考。
- `package.json`：Pi package 清单与扩展加载声明。

## 文档扩展条件

只有当出现难逆转、无上下文会困惑且有真实权衡的设计决策时，才新增 `doc/决策档案/`。
