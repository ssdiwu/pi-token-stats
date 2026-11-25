# pi-session-insights

English · [简体中文](./README-zh.md)

`pi-session-insights` is a Pi extension package for **read-only session insights**: it aggregates usage and activity from local session JSONL files and provides multi-dimensional analysis plus project-based daily reports.

> Current status: K0 dimensions, multi-dimensional analysis (K1/K2/K3/K5), per-day summary cache, project-based daily reports (reusing the pi-daily report chain), configurable automatic archiving, and the L2 interactive panel are implemented. See [`doc/规格/PRD-pi-session-insights.md`](./doc/规格/PRD-pi-session-insights.md).

## Positioning

- **Read-only, no interception**: reads only `~/.pi/agent/sessions/**/*.jsonl` and redacted numeric ledgers produced by local extensions; it does not intercept tool calls and does not use a sandbox. It follows the analysis-layer mental model of context-mode, but gains depth by reading existing records instead of paying an interception tax.
- Research and design references: [`doc/references/01-context-mode会话信息分析参考.md`](./doc/references/01-context-mode会话信息分析参考.md) (historical reference, not current authority) and [`doc/规格/PRD-pi-session-insights.md`](./doc/规格/PRD-pi-session-insights.md).

## Current features (dimensions, multi-dimensional analysis, project-based daily reports)

Two independent slash commands are registered:

```text
/insights [natural-language time range]   # tokens/cost/tools/projects/health numbers panel
/daily [date|range] [--day-start HH:mm] [--project current]   # project-based daily report
```

`/insights` with no arguments shows today's data:

```text
/insights
/insights 最近5小时          (last 5 hours)
/insights 本周               (this week)
/insights 最近一周           (last week)
/insights 昨天               (yesterday)
/insights 昨天到今天         (yesterday through today)
/insights 2026-06-17
/insights 2026-06-10 到 2026-06-17
/insights 当前会话           (current session)
```

`/daily` generates a project-based daily report grouped by real projects and archives it:

```text
/daily                       # today
/daily 昨天                   # yesterday
/daily 2026-06-17
/daily 0718 和 0719           # compact MMDD range, resolved using the current year
/daily 2026-06-10 到 2026-06-17
/daily 本周                   # this week
/daily --project current     # restrict to the current project
/daily --day-start 03:00     # custom day boundary
```

> `/insights daily` is deprecated; once pi-daily is uninstalled, this project's `/daily` takes over daily reporting.

Reports are archived automatically to `reportOutputDir` in `~/.pi/agent/pi-session-insights.json`; when unset, they go to `~/Documents/pi-daily-reports/YYYY-MM-DD.md`. Multi-day ranges write one file per day; the command or tool result shows only the generated count and archive paths, not the report bodies. **Archive overwrite policy**: write directly when no file exists; in TUI mode ask once to confirm overwriting an existing file (combined confirmation for multiple days); in non-interactive mode (`-p`/JSON/RPC) skip existing files by default and note this in the result. `dailyModel` accepts `provider/model-id:thinking` to select the report model; if unavailable it prompts and falls back to the current session model, and if that is unavailable too it uses a local Markdown fallback.

Two tools are also registered for agent use in natural-language conversation: `insights` (reads token/cost usage, preferably with structured `since`/`until`) and `daily` (generates a project-based report with `date`/`range`/`projectCurrent`). For example, asking "最近 5 小时 token 花了多少？" (how many tokens in the last 5 hours) calls `insights`; asking "生成今天的日报" or "总结今天的工作" (generate today's report / summarize today's work) calls `daily`.

## UI behavior

- **TUI mode**: `/insights` with no arguments immediately opens the L2 overlay panel with a loading state (page 1: today's usage; page 2: yesterday's report preview, see ADR 0003), then loads data asynchronously. The numbers page keeps only session events in today's range; the report page reads the cache and limits the number of lines. Run `/daily` for the full report. With arguments such as `/insights 最近5小时`, native select/input dialogs are used.
- **Non-TUI mode** (`pi -p` / JSON / RPC): outputs plain text for scripts and tests.
- Report labels and AI output follow the current `pi-di18n` locale: Simplified Chinese, Traditional Chinese, Japanese, Korean, German, French, Spanish, Portuguese, Russian, Arabic, and English.
- Time ranges are parsed first by the current model, with a local rule-based fallback.

## Statistics rules

- Default `/insights` = today's statistics for all local sessions.
- Range statistics read session JSONL line by line, keeping only in-range events and necessary metadata; scanning is fault-tolerant, asynchronous, and serializes concurrent external scans to control peak memory.
- Token and cost are aggregated by the actual `timestamp` of assistant messages; it also read-only merges redacted usage from `~/.pi/agent/audit-usage.jsonl` (pi-dgoal) and `~/.pi/agent/dteam-usage.jsonl` (dteam in-memory workers), deduplicated by `dedupKey`.
- Models are aggregated by `provider/model`; models with the same name but different providers are counted separately.
- `/insights 当前会话` uses `ctx.sessionManager.getBranch()` for the active branch and merges dteam worker usage belonging to that main session by `parentSessionId`.

## Supported time expressions

- `今天` / day / today
- yesterday (`昨天`)
- this week / week (`本周`)
- last week (`最近一周` / `过去一周`)
- last N hours / days / weeks (`最近 N 小时` / `最近 N 天` / `最近 N 周`)
- bare durations: `5小时`, `1天`, `2周`
- single dates: `YYYY-MM-DD`, `YYYY/MM/DD`
- date ranges: `YYYY-MM-DD 到 YYYY-MM-DD`, `YYYY/MM/DD 到 YYYY/MM/DD`
- named ranges: `昨天到今天` (end boundary is the current moment), `昨天到现在`
- Chinese month-day ranges: `7月18日到7月19日` (resolved with the current year)
- `/daily` compact month-day ranges: `0718 和 0719` (resolved with the current year)
- current session / session (`当前会话`)

When neither the model nor local rules can recognize an expression, it falls back to today and keeps the original input in the heading.

## Project structure

```text
pi-session-insights/
├── index.ts                # Pi extension entry: /insights + /daily commands and insights/daily tools
├── src/
│   ├── types.ts            # Types: session JSONL parsing, dimensions/range types
│   ├── session-scan.ts     # Scan layer: async scan of ~/.pi/agent/sessions, fault-tolerant parsing (reused from pi-daily)
│   ├── locale.ts           # Localized strings + locale resolution (pi-di18n event API)
│   ├── usage-rollup.ts     # K0 usage rollup (rollupEntries/rollupSessions, pure functions)
│   ├── dimensions.ts       # K1 project / K2 tool / K3 error / K5 health aggregation (pure algorithms)
│   ├── time-range.ts       # Time-range parsing (parseRange + LLM parsing)
│   ├── format.ts           # Formatting and rendering (plain text for print mode)
│   ├── insights.ts         # Command logic: scan → aggregate → render
│   ├── daily-command.ts    # /daily argument parsing, date expansion, tool parameter merge
│   ├── daily-options.ts    # Default/explicit day boundary
│   ├── daily-config.ts     # Daily-report configuration and model selector
│   ├── daily-archive.ts    # Stable archiving under the configured directory
│   ├── daily-orchestrator.ts # /daily orchestration: overwrite confirmation, scan, generate, archive, error isolation
│   ├── day-cache.ts        # Per-day summary cache (idempotent day-*.json read/write + incremental backfill)
│   ├── day-report.ts       # Report assembly: report generation chain + cache
│   ├── date-utils.ts       # Local date strings and natural-day TimeRange
│   ├── report-session-extract.ts # Extract report facts from sessions (tasks/completions/blockers/tools/files)
│   ├── report-model.ts     # Aggregate daily-report model by project
│   ├── report-ai-summary.ts # Configured model → current session model → local Markdown fallback
│   ├── report-markdown.ts  # Local Markdown fallback when AI fails
│   ├── report-labels.ts    # Multilingual dictionary for report body text
│   ├── daily-ui-labels.ts  # Multilingual dictionary for command UI text
│   ├── audit-usage.ts      # pi-dgoal audit-usage.jsonl scan, time filter, numeric aggregation
│   ├── dteam-usage.ts      # dteam-usage.jsonl scan, dedup, worker/model/tier aggregation
│   ├── panel-data.ts       # L2 overlay panel data loading
│   ├── report-redact.ts    # Redaction and truncation in the report chain
│   ├── obsidian-sync.ts    # Legacy Obsidian target helper, not part of default archiving
│   └── panel.ts            # L2 overlay interactive panel (today's usage / yesterday's report)
├── tests/                  # Node built-in tests (TS imported directly)
├── PLAN.md                 # Current execution state and continuation point
├── doc/                    # Docs: map, specs, decision archive, notes, references (sources/history)
└── package.json            # Pi package manifest
```

## Install

Add this repository path to `packages` in `~/.pi/agent/settings.json`:

```json
"/Users/diwu/Workspace/Codes/Githubs/pi-extensions/pi-session-insights"
```

Then run in Pi:

```text
/reload
```

## Development, tests, and public contracts

Use a source checkout for the contributor rules, project plan, and test guide below.

- Development and contribution rules: [`AGENTS.md`](./AGENTS.md), [`PLAN.md`](./PLAN.md), and [`doc/README.md`](./doc/README.md).
- Tests: [`tests/README.md`](./tests/README.md); run `npm test` or `npm run check` (type-check + unit tests).
- Public contract: product rules and scope in [`doc/规格/PRD-pi-session-insights.md`](./doc/规格/PRD-pi-session-insights.md) (Chinese), implementation entry in [`index.ts`](./index.ts) and [`src/README.md`](./src/README.md). `doc/references/` and superseded ADRs are background only, not current authority.

## Development verification

```bash
npm run check          # typecheck + unit tests
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/insights 当前会话"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/daily 2020-01-02"
```
