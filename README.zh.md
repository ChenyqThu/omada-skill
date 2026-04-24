# omada-skill

> [English](./README.md) · 中文

面向 **TP-Link Omada 控制器** 的 AI 原生集成层：一个 MCP 服务器，外加
一组精心编排的 Claude Agent Skills，让 Claude（以及任何兼容 MCP 的客户
端）能像资深网络工程师一样操作 Omada 站点。

## 仓库构成

| 组件                                                        | 作用                                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MCP 服务器** — [`apps/mcp-server`](./apps/mcp-server)     | 22 个按意图组织的工具 + 1 个操作逃生口；同时支持 stdio 与 HTTP；所有写操作走两阶段确认；支持 JSONL 审计落盘。                                                                  |
| **Agent 技能** — [`skills/`](./skills)                      | 5 个 Claude Agent Skills，通过 MCP Resource（`resource://omada-skills/<名称>`）分发：bulk-site-onboard、alert-triage、guest-portal-wizard、wifi-troubleshoot、support-assist。 |
| **内部 SDK** — [`packages/sdk`](./packages/sdk)             | 由 [`specs/omada_api.json`](./specs/omada_api.json) 生成的 TypeScript 强类型客户端，覆盖 Omada Open API 2,269 个操作。                                                         |
| **守护栏** — [`packages/guardrails`](./packages/guardrails) | 高风险操作白名单与分级，HMAC 指纹化的 confirm token，驱动 two-phase 写操作助手。                                                                                               |

## 项目状态（M5 已落地）

**166 条测试全绿**，`pnpm turbo run typecheck lint test build` 冷跑 < 6 秒。
完整里程碑史详见 [`docs/STATUS.zh.md`](./docs/STATUS.zh.md)，最新交接文档
见 [`HANDOFF.md`](./HANDOFF.md)。

- **M1** — monorepo 骨架、SDK 生成管线、守护栏、MCP 服务器、种子工具、
  规格基线。54 条测试。
- **M2** — SDK 成熟化：重试、JSONL 审计、覆盖率闸、staging 测试脚手架、
  类型化响应、M5 鉴权策略占位符。89 条测试。
- **M3** — 22 个意图工具 + 两阶段提交助手。142 条测试。
- **M4** — 5 个 Agent 技能（frontmatter + RESOURCES + examples +
  checklists）。纯 Markdown，不增测试。142 条测试。
- **M5** — 技能加载器、MCP Resource 发布、`pnpm skill:validate` /
  `pnpm spec:diff` CLI、CI 串接、鉴权占位符参数校验、
  `docs/mcp-tools.md` 回填。166 条测试。
- **M6**（阻塞在外部资料/凭据上）— 真正的 CIMD / Authorization-Code
  实现、上真机 staging 验证、基于真实对话样本的 trigger 校准。详见
  [`HANDOFF.md §3`](./HANDOFF.md).

## 快速上手

需要 **Node 22 LTS** 与 **pnpm**（`corepack prepare pnpm@latest --activate`
即可）。

```bash
pnpm install
pnpm build

# 本地（Claude Desktop、Cursor）
npx omada-mcp --stdio

# 远程（网页版 Claude、托管 Agent）
npx omada-mcp --http --port 8787
```

凭据通过环境变量注入（CIMD / Vault 在 [`docs/security.md`](./docs/security.md)
有说明，属 M6 范围）：

```
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_REGION=use1
OMADA_DRY_RUN=1                 # 可选：把每个写操作短路为 dry-run
OMADA_MCP_CONFIRM_SECRET=...    # 写工具必需，长度 ≥ 16
OMADA_AUDIT_DIR=./audit         # 可选：JSONL 审计落盘目录
```

不设置 `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET` 时，服务器自动进入
**mock 模式**，内置 3 个 `SAMPLE_SITES`，适合离线开发。

## 常用脚本

```bash
pnpm build                 # turbo run build
pnpm test                  # turbo run test（166 条）
pnpm test:staging          # 上真机集成（需要真实凭据）
pnpm typecheck             # turbo run typecheck
pnpm lint                  # turbo run lint
pnpm generate              # 按 specs/omada_api.json 重新生成 SDK
pnpm spec:diff             # 对比当前规格 vs 最新快照
pnpm skill:validate        # 校验 skills/**（CI 请加 --strict）
pnpm skill:validate --strict
```

## 文档入口

全量索引：[`docs/README.md`](./docs/README.md)（英文）、
[`docs/README.zh.md`](./docs/README.zh.md)（中文）。

- [架构](./docs/architecture.md)
- [MCP 工具参考](./docs/mcp-tools.md) — 每个工具的背后操作与风险等级
- [技能编写指南](./docs/skills.zh.md) · [English](./docs/skills.md)
- [安全与守护栏](./docs/security.md)
- [部署说明](./docs/deployment.md) — stdio / HTTP / Claude Desktop
- [规格再生 SOP](./docs/api-regeneration.md)
- [贡献指南](./docs/contributing.md)
- [里程碑进度（中文）](./docs/STATUS.zh.md)

## 设计来源

参考 Anthropic
[Building agents that reach production systems with MCP](./docs/Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)
（2026 年 4 月）提出的原则：意图分组的工具、远端优先的服务器、CIMD 鉴权、
MCP Apps，以及 Skills + MCP 配对分发。

## 许可证

[MIT](./LICENSE) © 2026 陈源泉
