# pi-session-insights 执行计划与当前状态

> 本文件是 pi-session-insights 的**当前执行状态与接续位置**唯一正文。顶部写当前状态，历史阶段向下累积，不从旧阶段表倒推现状。能力口径见 [README.md](README.md)，需求与范围见 [doc/10-需求规格/](doc/10-需求规格/)，决策见 [doc/决策档案/](doc/决策档案/)，证据与历史见 [doc/references/](doc/references/)。

## 当前状态（2026-07-20）

**版本**：0.2.1（`package.json` 为唯一权威），`CHANGELOG.md` 同步定版。

**已落地**：`/insights` 数字洞察（K0 量纲 + K1 项目 / K2 工具 / K3 错误 / K5 上下文健康）+ 无参数 L2 overlay 面板（先挂载加载态、后异步刷新）+ 独立 `/daily` 命令与 `daily` tool（项目化日报、自适应默认日界、配置化归档、按文件存在性确认覆盖）+ pi-dgoal 审核用量与 dteam worker 用量的只读聚合 + 11 语言 locale 跟随。

**验证现状**：`npm run check`（typecheck + 单元测试）为仓库内常规验证命令；非 TUI 端到端与真实 TUI 手测按 `AGENTS.md` 的验证分级执行，真实 LLM 日报测试需单独成本授权。本文件不记录某次测试的通过数。

**待办**：无进行中的实施批次。

| 项 | 状态 | 说明 |
|---|---|---|
| 0.2.1 范围扫描内存峰值与日期范围解析修复 | 已定版 | 见 `CHANGELOG.md` 0.2.1 |
| 文档结构改 Cozuo 式 | 已完成（未提交） | `doc/README.md` 改为薄入口；调研与历史路线图迁入 `doc/references/`；补 `PLAN.md`、`doc/经验笔记.md`、`.artifacts/` 本机现场机制 |

## 已知未覆盖

- K4 工具延迟、K6 工作流画像仍是 PRD 候选维度，当前实现未做；是否实施未定。
- 术语表与 ADR 0004 正文仍以 `/insights daily` 表述默认日界，现行入口是 `/daily`（ADR 0007）；属决策档案原文，按「后记」方式修订，不改写原文结论。

## 接续位置

新会话接手时：

1. 读 `README.md`（能力口径与安装）、本文件（当前状态）、`doc/README.md`（导航）。
2. 按改动范围读 `doc/10-需求规格/`（需求与范围）、`doc/决策档案/`（已定决策）、`AGENTS.md`（规则）。
3. 改动后按 `AGENTS.md` 的验证分级执行；证据落 `doc/references/`，本文件更新「当前状态」段。
