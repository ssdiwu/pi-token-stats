# Changelog

All notable changes to `pi-session-insights` are documented in this file.

## [Unreleased]

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
