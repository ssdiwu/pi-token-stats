# AGENTS.md — pi-session-insights

## 项目一句话定位

`pi-session-insights` 是一个 `Pi extension（Pi 扩展）`：**只读、不拦截**地扫描本机 `Pi session（Pi 会话）` JSONL，做多维分析聚合（量纲/项目/工具/错误/健康）+ 项目化日报，是 pi-daily 的超集。核心立论——Pi 原生 session JSONL 已足够丰富，靠"读 JSONL"即可达到竞品靠拦截才能拿到的分析深度，无需 context-mode 那套拦截税。

## 先读（按顺序）

1. `doc/10-需求规格/PRD-pi-session-insights.md`：**当前基准**。需求规格、形态分层、K0~K6 维度、按天 LLM 读写、今日差异、Obsidian 沉淀、测试接缝、Out of Scope。
2. `doc/20-能力参考/01-context-mode会话信息分析参考.md`：调研参考，三档借鉴分级（设计冲突/同思路/候选）。
3. `README.md`：当前能力（量纲 + 多维分析 + 项目化日报 + Obsidian 沉淀 + L2 面板）、命令、统计口径、安装与验证。
4. `src/` 各模块 `README`（如有）或模块顶部注释。

## 项目结构

```text
pi-session-insights/
├── index.ts              # Pi extension 入口，注册 /insights 命令 + insights tool
├── src/
│   ├── types.ts          # 类型层（Session JSONL 解析 + 量纲/范围）
│   ├── session-scan.ts   # 扫描层（异步 scanSessions，容错解析，复用自 pi-daily）
│   ├── locale.ts         # 多语言文案 + locale 解析（pi-di18n 事件 API）
│   ├── usage-rollup.ts   # K0 量纲聚合（纯函数，按 provider/model 分组，带 cwd）
│   ├── dimensions.ts    # 多维聚合（K1 项目/K2 工具/K3 错误/K5 健康，纯算法不调 LLM）
│   ├── time-range.ts     # 时间范围解析（parseRange + LLM 解析）
│   ├── format.ts         # 格式化与渲染（print 模式纯文本）
│   ├── insights.ts       # 命令主逻辑（组装扫描 → 聚合 → 渲染）
│   ├── day-cache.ts      # 按天摘要缓存（读写幂等 + 增量补跑）
│   ├── day-summary.ts    # 旧按天叙事链（历史兼容，逐步淡出）
│   ├── day-report.ts     # 日报组装：接日报生成链 + 差异 + 缓存
│   ├── day-diff.ts       # 按天差异（趋势/新增/消失/工具/异常，纯算法）
│   ├── report-session-extract.ts # 从 session 提取日报事实（任务/完成/阻塞/工具/文件）
│   ├── report-model.ts   # 按项目聚合日报模型
│   ├── report-ai-summary.ts # 用当前模型整理项目化日报
│   ├── report-markdown.ts # AI 失败时的本地 Markdown fallback
│   ├── report-labels.ts  # 日报文案字典
│   ├── report-redact.ts  # 日报脱敏与截断
│   ├── obsidian-sync.ts  # Obsidian vault 探测 + 日报落点（幂等覆盖）
│   └── panel.ts          # L2 overlay 交互面板（今天消耗/昨天日报切换）
├── tests/                # Node 内置 test（TS 直接 import .ts，不走编译）
├── doc/                  # 需求规格、调研参考、决策档案
└── package.json
```

## 代码边界（guardrails）

- **只读不拦截**：只读 `~/.pi/agent/sessions/**/*.jsonl`，绝不修改会话文件；**绝不引入拦截层**（PreToolUse 路由 / 工具拦截 / sandbox）。这是和 context-mode 的本质分界，是本项目定位的基石。
- **命令边界**：主入口 `/insights`（避开官方 `/session` 与 pi-daily 的 `/daily`）；同时注册 `insights` tool。
- **LLM 边界**：LLM 调用仅用于项目化日报生成；数字面板视图（量纲/项目/工具/错误/健康）**绝不调 LLM**，纯算法。
- **复用边界**：复用 pi-daily 代码只复制/重构进本项目 `src/`，不 import pi-daily 包（它是独立已发布包）。
- **交互边界**：`/insights` 无参数 TUI 走 L2 overlay 面板（ADR 0003）；带参数走原生 select/input。旧 ADR 0001 已失效（被 0003 取代）。非 TUI 模式（`-p`/JSON/RPC）退化为纯文本。
- **locale 边界**：UI 文案跟随 `pi-di18n`；内置 `zh-CN`、`zh-TW`、`en`，其他回退英文。
- **路径边界**：不硬编码用户本地路径偏好（vault 子目录、缓存目录走配置/探测）。
- 依赖边界：除 Pi peer dependencies 外保持轻量。

## 修改时特别注意

- `/insights 当前会话` 的口径依赖 `ctx.sessionManager.getBranch()`；改这一块时防止和时间范围统计混成两套逻辑。
- 时间窗口按 assistant message 时间戳聚合；改统计口径时先同步 `README.md` 的"统计口径"。
- 扫描层是异步的（`scanSessions`），聚合层是纯函数（`rollupSessions`）；保持扫描/聚合分离，便于测试。
- 新增多维聚合时（K1~K6）走纯函数，加进 `usage-rollup.ts` 或新模块，配单元测试。

## 验证

改动后至少执行：

```bash
npm run check          # typecheck + 单元测试（必须全绿才算完成）
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 当前会话"
```

只读边界核验：`rg "PreToolUse|tool_call.*block:|sandbox|ctx_exec" src/ index.ts` 应无结果。

## 文档沉淀出口

- `doc/术语表.md` — 项目特有概念（惰性创建）。
- `doc/决策档案/` — 难逆转 + 无上下文会困惑 + 有真实权衡的决策（刻碑）。索引见 `doc/决策档案/README.md`。
- `doc/经验笔记.md` — 可改的做法与避坑经验（活页）。

## 不要做（Out of Scope，详见 PRD）

- 不拦截工具调用 / 不做 sandbox / 不做 session continuity 恢复 / 不做跨平台适配 / 不做全局 agent memory 平台。
- 不做 composite score（0-100 评分）——健康度只做事实陈述。
- 不做 git/decision/delegation 维度（Pi JSONL 不记录，需拦截，越界）。
- 不破坏 pi-daily 包。
