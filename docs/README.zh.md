# omada-skill 文档

> [English](./README.md) · 中文

`omada-skill` monorepo 的文档索引。

## 给 MCP 服务器的使用者

- **[部署指南](./deployment.md)** — 在 stdio（Claude Desktop、Cursor）
  或 HTTP（网页 Claude、托管 Agent）下运行 `omada-mcp`。
- **[MCP 工具参考](./mcp-tools.md)** — M3 起 22 个意图工具的输入
  schema、背后 operationId、风险等级与源码链接。
- **[技能（Skills）](./skills.zh.md)** · [English](./skills.md) — 5 个
  Claude Agent Skills 的目录结构、frontmatter 约定，以及它们如何通过
  `resource://omada-skills/<名称>` 作为 MCP Resource 分发。
- **[安全与守护栏](./security.md)** — 鉴权 scope、dry-run、两阶段
  confirm token、JSONL 审计。

## 给贡献者

- **[架构](./architecture.md)** — SDK → guardrails → mcp-tools →
  mcp-server 的分层心智模型。
- **[规格再生 SOP](./api-regeneration.md)** — TP-Link 发新
  `omada_api.json` 时如何吸收；`pnpm spec:diff` 如何展示 operation
  级别的漂移。
- **[贡献指南](./contributing.md)** — Conventional Commits、lefthook
  钩子、如何新增一个工具 / 技能。

## 里程碑记录

- **[STATUS.zh.md](./STATUS.zh.md)** — M1 → M5 详细进度、每个包的测
  试数、M6 被搁置的项。
- **[HANDOFF.md](../HANDOFF.md)** — 当前「下一位接手者请先读」文档。
  每个里程碑交接都会重写一份；历史版本归档在
  [`archive/`](./archive/)。

## 参考资料

- [Anthropic · Building agents that reach production systems with MCP](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)
  （2026 年 4 月）— 本项目遵循的设计原则。

## 归档

历届里程碑交接：

- [M1 → M2](./archive/HANDOFF-m1-to-m2.md)
- [M2 → M3](./archive/HANDOFF-m2-to-m3.md)
- [M3 → M4](./archive/HANDOFF-m3-to-m4.md)
- [M4 → M5](./archive/HANDOFF-m4-to-m5.md)
