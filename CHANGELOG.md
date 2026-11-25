# Changelog

This project follows the basic format of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). For tagged releases, use the version from the Git tag. The tagged release is maintained by the release owner in this English `CHANGELOG.md`; daily user-perceivable changes are recorded in the Chinese `CHANGELOG-zh.md` in this repository. Both files contain user-perceivable facts only and ship in the npm package.

For new releases, use headings in the format `## [x.y.z] - YYYY-MM-DD`. When an entry can be linked unambiguously to a GitHub issue, append `(#xx)`. Historical entries keep their original heading format.

## [0.2.2] - 2026-11-25

### Changed

- Restored `/insights` and `/daily` on Pi 1.6.0, including model-assisted time ranges and daily summaries.

## [0.2.1] - 2026-07-20

### Fixed

- **Peak memory during range scans**: `/insights` and `/daily` now filter candidate files first, read line by line, and retain only events in the target range, while serializing concurrent scans, so multiple range queries no longer stack full JSONL data and cause Node.js OOM.
- **Date-range parsing**: a Chinese-language date range meaning "July 18 to July 19" is no longer misread as "the last 18 days"; `/daily` now parses compact month-day ranges in the form `0718 and 0719` using the current year.
- **Daily-report tool routing**: clarified the split between numeric insights and daily-report generation; multi-day requests call `daily` once, archive each day, and return only a batch summary.

## [0.2.0] - 2026-07-18

### Added

- **Standalone `/daily` command and `daily` tool**: project-based daily reports were promoted from the `/insights daily` subcommand to a standalone entry point; the LLM can generate reports directly via structured parameters (`date`/`range`/`projectCurrent`/`dayStart`); when pi-daily is uninstalled, this project takes over daily reporting.
- **Daily-report archive overwrite policy**: writes directly when no file exists; when a file exists, the TUI asks once whether to overwrite (combined confirmation for multiple days), while non-interactive modes (`-p`/JSON/RPC) skip existing files by default and note this in the result.
- **dteam worker usage**: `/insights` and the today panel read-only aggregate the separate `dteam-usage.jsonl`, deduplicating by time range to show worker counts, model replies, tokens, and cost, preserving model and actual tier dimensions.

### Removed

- **`/insights daily` subcommand**: project-based daily reports were promoted to the standalone `/daily` command, returning `/insights` to a purely numeric panel.

## [0.1.0] - 2026-07-16

### Added

- **pi-dgoal audit usage**: `/insights` read-only aggregates redacted, deduplicated audit tokens and cost from `audit-usage.jsonl` and displays them for the selected time range.

### Changed

- **Human-readable tool-result projection**: the `insights` tool shows a range summary by default and the report body when expanded; statistical `details` remain internal and are not displayed directly.
