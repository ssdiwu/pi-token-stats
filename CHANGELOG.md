# Changelog

All notable changes to `pi-session-insights` are documented in this file.

## [Unreleased]

### Fixed

- **范围扫描内存峰值**：`/insights` 与 `/daily` 先筛选候选文件、逐行读取并仅保留目标范围事件，同时串行化并发扫描，避免多次范围查询叠加全量 JSONL 导致 Node.js OOM。
- **日期范围解析**：中文 `7月18日到7月19日` 不再误判为“最近 18 天”；`/daily` 支持按当前年份解析 `0718 和 0719` 形式的紧凑月日范围。
- **日报工具路由**：明确数字洞察与日报生成职责；多日请求一次调用 `daily`，逐日归档且只返回批次摘要。

## [0.2.0] - 2026-07-18

### Added

- **独立 `/daily` 命令与 `daily` tool**：项目化日报从 `/insights daily` 子命令升级为独立入口，LLM 可通过结构化参数（`date`/`range`/`projectCurrent`/`dayStart`）直接生成日报；pi-daily 卸载后由本项目接管每日日报。
- **日报归档覆盖策略**：无已有文件直接写入；有已有文件时 TUI 一次确认是否覆盖（多天合并确认），非交互模式（`-p`/JSON/RPC）默认跳过已有文件并在结果提示。
- **dteam worker 用量**：`/insights` 与今日面板只读聚合独立 `dteam-usage.jsonl`，按时间范围去重展示 worker 数、模型回复数、token 与费用，并保留模型和实际档位维度。

### Removed

- **`/insights daily` 子命令**：项目化日报升级为独立 `/daily` 命令，`/insights` 回归纯数字面板。

## [0.1.0] - 2026-07-16

### Added

- **pi-dgoal 审核用量**：`/insights` 只读聚合 `audit-usage.jsonl` 中脱敏且去重的审核 token 与费用，并按所选时间范围展示。

### Changed

- **工具结果人类可读投影**：`insights` 工具默认显示范围摘要，展开时显示报告正文；统计 `details` 保留给内部使用，不直接展示。
