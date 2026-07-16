# Changelog

All notable changes to `pi-session-insights` are documented in this file.

## [Unreleased]

## [0.1.0] - 2026-07-16

### Added

- **pi-dgoal 审核用量**：`/insights` 只读聚合 `audit-usage.jsonl` 中脱敏且去重的审核 token 与费用，并按所选时间范围展示。

### Changed

- **工具结果人类可读投影**：`insights` 工具默认显示范围摘要，展开时显示报告正文；统计 `details` 保留给内部使用，不直接展示。
