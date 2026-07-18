# ADR 0007: 独立 daily 入口与归档覆盖策略

## 状态

Accepted

## 背景

改造前 daily 仅挂在 `/insights` 命令的字符串检测（`isDayReportRequest` 匹配 `daily` 前缀）上；而 LLM 唯一的 tool 入口 `buildReportForRequest` 没有任何 daily 分支，所以 LLM 无法通过 tool 生成项目化日报。归档层则对同日期文件无条件覆盖（`saveDailyReport` 探测 `overwritten` 只用于打标记），多天补写时不论文件是否存在一律弹确认框。

pi-daily 已卸载，`/daily` 命令名空出，本项目作为 pi-daily 的超集可正式接管每日日报。同时需要让 LLM 能用结构化参数直接触发日报生成，并让归档覆盖更克制（无文件不打扰、有文件才确认、非交互模式不阻塞）。

## 决策

- daily 升级为独立 `/daily` 命令 + `daily` tool；`insights.ts` 删除 `isDayReportRequest` 分支，`/insights` 回归纯数字面板。
- `runDailyReports` 改为接收结构化 `DailyCommandRequest`：命令路径用 `parseDailyCommand(args)`，tool 路径用 `buildDailyRequest(params)`，LLM 直接传结构化 `date`/`range`/`projectCurrent`/`dayStart`，不经字符串序列化往返。
- 废弃 `/insights daily` 子命令（取代 ADR 0005「日报入口仅为 `/insights daily`」）。
- 归档覆盖策略：新增 `probeDailyReportExists` 探测存在性；**无已有文件直接写入**；**有已有文件 + 有 UI** 一次确认是否覆盖（多天合并确认，列出新建/覆盖日期）；**有已有文件 + 无 UI**（`-p`/JSON/RPC）默认跳过覆盖项只写新建项并在结果提示。
- 覆盖确认被拒绝时跳过的是覆盖项（不是整体取消），新建项照常生成。

## 后果

- LLM 能通过 `daily` tool 直接生成项目化日报（本次改造核心目标），用户也能用 `/daily` 独立命令。
- `/insights daily` 不再生效：`daily` 被当作普通时间范围词回退到今天量纲面板。
- 归档从「无条件覆盖 + 多天一律确认」改为「按文件存在性按需确认」，减少无意义打扰，非交互模式不阻塞。
- `/daily` 命令名不再与 pi-daily 冲突（已卸载）；若用户重新安装 pi-daily 需自行取舍每日日报归属。
- `daily` tool 与 `insights` tool 职责分离：一个生成项目化叙事日报（调模型、归档），一个读数字消耗（纯算法、不归档）。
