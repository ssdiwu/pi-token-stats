# AGENTS.md — pi-token-stats

## 先读

1. `README.md`：功能、单命令设计、UI 行为、自然语言时间范围、统计口径。
2. `doc/README.md`：文档入口和扩展条件。
3. `index.ts`：扩展入口与实现。

## 项目结构

```text
pi-token-stats/
├── index.ts       # Pi extension 入口
├── README.md      # 使用说明
├── doc/README.md  # 文档入口
└── package.json   # Pi package 清单
```

## 代码边界

- 只读取 `~/.pi/agent/sessions` 下的 session JSONL，不修改 session 文件。
- slash command 只保留 `/tokens`，不要新增别名命令。
- TUI 模式必须使用 Pi 原生 `ctx.ui.select(title, choices)` + `ctx.ui.input(...)` 提问式对话框；拒绝 `overlay`、自绘小窗口和 `ctx.ui.confirm`，详见 `doc/adr/0001-use-native-select-input-dialogs.md`；非 TUI 模式保持纯文本输出。
- 支持 `token_stats` tool（工具）供 agent 在自然语言对话中调用。
- UI 文案优先跟随 `pi-di18n` 的当前 locale；本包内置 `zh-CN`、`zh-TW`、`en`，其他 locale 回退英文。
- 不硬编码 API Key（接口密钥）或私密凭据。
- 不引入不必要运行时依赖，除 Pi peer dependencies（对等依赖）外保持轻量。

## 验证

改动后至少执行：

```bash
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 最近5小时"
PI_SKIP_VERSION_CHECK=1 pi --no-extensions --extension ./index.ts --no-session -p "/tokens 当前会话"
```
