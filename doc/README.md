# pi-token-stats 文档入口

当前唯一权威说明是根目录 `README.md`。

## 阅读地图

- `README.md`：功能、单命令设计、UI 行为、自然语言时间范围、统计口径、安装与验证。
- `index.ts`：Pi extension（扩展）入口，包含 session JSONL 扫描、总量聚合、`provider/model` 模型维度聚合、跟随 `pi-di18n` locale 的原生 `select/input` 提问式对话框和 `token_stats` 工具。
- `doc/决策档案/0001-use-native-select-input-dialogs.md`：拒绝 overlay、自绘窗口和 confirm，统一使用原生 `select/input` 的决策记录。
- `package.json`：Pi package（Pi 包）清单与扩展加载声明。

## 文档扩展条件

只有当出现难逆转、无上下文会困惑且有真实权衡的设计决策时，才新增 `doc/决策档案/`。
