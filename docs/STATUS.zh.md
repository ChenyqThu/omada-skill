# 项目进度总览（M1 → M5）

> 写于 M5 落地后。本文档专门回答「到底做完了吗、每个阶段都做了什么、
> 还剩什么」这类问题。可与根目录的
> [`HANDOFF.md`](../HANDOFF.md) 配合阅读——HANDOFF 面向下一位操作者，
> 这里面向项目进度追踪。

## 一、总体结论

**M1 ~ M5 全部完成并已提交 `main`。** 剩余的 M6 条目全部依赖外部资料
或凭据（TP-Link IdP 文档、真实控制器账号、真实对话样本），无法在
仓库内部闭环完成。

| 维度         | M1   | M2   | M3   | M4     | M5   |
| ------------ | ---- | ---- | ---- | ------ | ---- |
| 测试数       | 54   | 89   | 142  | 142    | 166  |
| MCP 工具     | 1    | 1    | 22   | 22     | 22   |
| Skill 数量   | 0    | 0    | 0    | 5      | 5    |
| MCP Resource | —    | —    | —    | 未发布 | 5 条 |
| CI 闸门      | 4 步 | 5 步 | 5 步 | 5 步   | 7 步 |

`pnpm turbo run typecheck lint test build` 冷跑约 6 秒、热跑约 5 秒，
五个里程碑下来始终保持全绿。

## 二、各里程碑交付物

### M1 · 骨架（54 条测试）

- pnpm 10 workspace + turborepo 2 + TypeScript 5.9（NodeNext ESM
  strict）+ ESLint 9 flat + Prettier 3 + Lefthook + commitlint +
  Changesets。
- `@omada/shared`：`OmadaError` 家族、HTTP 状态分类、结构化 JSON
  logger、异步分页、指数退避 + 抖动的重试、敏感字段 redactor。
- `@omada/sdk`：`openapi-typescript` 产出的 `schema.d.ts`（6.1 MiB）、
  2,269 条 `operations.ts`、`OmadaClient.call<Op>()`、OAuth2 Client
  Credentials token store、`FetchTransport`、`MockTransport`、dry-run
  与审计中间件。
- `@omada/guardrails`：10 条高危 operationId 白名单 + 严重级分档 +
  HMAC 桶 token 两阶段确认。
- `@omada/mcp-tools`：`defineTool` + `ToolRegistry` + zod → JSON
  Schema；第一个种子工具 `omada_list_sites`。
- `apps/mcp-server`：`omada-mcp` 可执行；stdio + `StreamableHTTPServer`
  双通道；protocolVersion `2025-06-18`；无凭据时自动进 mock 模式。
- `scripts/generate.ts`：按规格重建 SDK；CI 校验承诺文件与规格同步。
- 文档：导航、架构、规格再生 SOP、部署、安全、贡献指南、MCP 工具说明、
  Skills 说明。

### M2 · SDK 成熟化（89 条测试）

- M2-01 `.env.local` 加载（走 Node 22 原生 `--env-file-if-exists`，不
  引入 `dotenv`）。
- M2-02 `OmadaClient.call<Op>()` 进入共享 `retry()`；429 尊重
  `Retry-After`；401 失效 token、不再重试。
- M2-03 `callPaginated<Op>()` 异步生成器封装；`MockTransport.pagedRoute()`
  支持离线多页测试。
- M2-04 审计 + logger 双通道 `redact`；`OMADA_LOG_NO_REDACT=1` 本地
  关闭。
- M2-05 JSONL 审计落盘 `${OMADA_AUDIT_DIR}/YYYY-MM-DD.jsonl`，自动按
  日滚动。
- M2-06 `packages/sdk/test/staging.test.ts` + `pnpm test:staging`
  （无凭据 CI 跳过）。
- M2-07 `vitest.config.ts` 覆盖率闸 ≥70 % lines/statements/functions/
  branches。
- M2-08 由 OpenAPI schema 推导响应类型：`call<Op>()` 返回
  `ResponseFor<Op>`，`ParamsFor<Op>` 可选使用。
- M2-09 `CIMDIntegration` + `AuthCodeFlow` 骨架先行（所有方法抛 M5
  占位符错）。

### M3 · 22 个意图工具 + 两阶段助手（142 条测试）

| 泳道                | 工具                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 作用域              | `omada_discover_scope` · `omada_list_sites`                                                                                             |
| 清单（只读）        | `omada_site_overview` · `omada_list_devices` · `omada_device_detail` · `omada_list_clients` · `omada_client_journey` · `omada_topology` |
| 监控 / 健康（只读） | `omada_alerts_list` · `omada_alerts_triage` · `omada_wifi_diagnose` · `omada_voip_overview` · `omada_vpn_status` · `omada_audit_logs`   |
| 固件 / 报告         | `omada_firmware_plan` · `omada_exec_report`                                                                                             |
| 部署（写）          | `omada_apply_site_template` · `omada_bulk_onboard` · `omada_portal_wizard`                                                              |
| 生命周期（高危写）  | `omada_device_action` · `omada_firmware_rollout` · `omada_batch_change`                                                                 |
| 进阶                | `omada_script`                                                                                                                          |

所有写工具通过
[`packages/mcp-tools/src/helpers/two_phase.ts`](../packages/mcp-tools/src/helpers/two_phase.ts)
完成预览 / 确认两阶段；`@omada/guardrails` 给出风险等级；风险最高档
（`high` / `catastrophic`）强制走握手。`omada_script` 是逃生口：GET 请
求快速路径直发、非 GET 仍走握手。

### M4 · 5 个 Agent 技能（142 条测试，纯 Markdown）

每个技能固定 5 个文件：`SKILL.md`（含 frontmatter 的 7 段正文）、
`RESOURCES.md`（术语、参考表、相关技能链接）、2 个
`examples/*.md`（端到端脚本，包含写操作的双阶段握手对白）、1 个
`checklists/*.md`（写前 preflight 或只读 runbook）。

| 技能                        | 角色          | 调度的工具                                                                                                              |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `omada-bulk-site-onboard`   | MSP           | `omada_discover_scope` · `omada_list_sites` · `omada_bulk_onboard` · `omada_apply_site_template` · `omada_batch_change` |
| `omada-alert-triage`        | MSP / SI      | `omada_alerts_list` · `omada_alerts_triage` · `omada_device_detail` · `omada_topology`                                  |
| `omada-guest-portal-wizard` | SI            | `omada_portal_wizard` · `omada_apply_site_template`                                                                     |
| `omada-wifi-troubleshoot`   | Prosumer / SI | `omada_wifi_diagnose` · `omada_client_journey` · `omada_device_detail`（kind=ap）                                       |
| `omada-support-assist`      | 内部一线支持  | `omada_site_overview` · `omada_alerts_list` · `omada_audit_logs` · `omada_device_detail`                                |

每个 workflow 步骤都指向实际注册的 MCP 工具，不虚构 operationId；写
技能显式写明「预览 → 确认」握手；只读技能显式给出将要交接的写技能
名，但自己绝不调用写工具。

### M5 · 分发 + 工具链（166 条测试）

1. **技能加载器**（`@omada/mcp-tools/src/skills/`）：无第三方 YAML 依赖
   的 frontmatter 解析器（处理 `|` / `>` 块标量 + `[a, b]` 内联数组），
   文件系统加载器，资产 lint（RESOURCES / examples / checklists 缺失
   时给 warn，`--strict` 升级成 error）。
2. **MCP Resource 发布**：`apps/mcp-server` 启动时读 `<repo>/skills/`
   下所有 `SKILL.md`，以 `resource://omada-skills/<slug>`（MIME
   `text/markdown`）发布；`buildMcpServer` 新增 `skills` 与 `skillsDir`
   两个可选入口，测试与生产均可控。
3. **两个 CLI**：`pnpm skill:validate`（`scripts/validate-skills.ts`，
   CI 走 `--strict`）和 `pnpm spec:diff`
   （`scripts/diff-api.ts`，支持 `--baseline` / `--output` /
   `--fail-on-change`，只做 operation 粒度 diff，schema 层差异交给
   `pnpm generate` 的 PR review）。
4. **CI 串接**：`.github/workflows/ci.yml` 增加
   `pnpm skill:validate --strict` 步骤；新增
   `.github/workflows/api-diff.yml`，在涉及 `specs/**` 的 PR 上跑 diff、
   上传 artefact、并通过 sticky comment 回显 Markdown 结果。
5. **鉴权占位符参数校验**：`CIMDIntegration` / `AuthCodeFlow` 构造器
   现在立刻校验必填字段、`https://` 协议、loopback 重定向（遵 RFC
   8252）、`envelopeTtlSec` 范围。方法体仍抛 M5 占位符——**这是 M6 的
   活**。
6. **`docs/mcp-tools.md` 回填**：补齐 M3 时代落下的 22 个工具参考，
   统一 ToC + 风险等级 + 源码链接。

各包测试增量（M4 → M5）：

| 包                  | M4 → M5                            |
| ------------------- | ---------------------------------- |
| `@omada/shared`     | 30 → 30                            |
| `@omada/sdk`        | 30 → 39（+9 条鉴权参数校验用例）   |
| `@omada/guardrails` | 10 → 10                            |
| `@omada/mcp-tools`  | 64 → 76（+12 条 skills.test 用例） |
| `@omada/mcp-server` | 7 → 11（+4 条 resource 协议用例）  |

## 三、MCP Resource 协议契约（M5 起稳定）

- **URI 结构**：`resource://omada-skills/<slug>`，`<slug>` 必须与技能
  frontmatter 里的 `name` 一致；不一致的技能会被加载器拒绝加载。
- **MIME**：`text/markdown`，`resources/read` 返回完整的 SKILL.md
  （含 frontmatter），一字不差。
- **列表**：`resources/list` 返回
  `{ uri, name, description, mimeType }`。`description` 是 frontmatter
  `description` 块里第一行非空文本，方便客户端一眼看到 TRIGGER。
- **能力位**：当且仅当加载到 ≥ 1 个技能时，服务器才声明
  `{ resources: {} }`；skills 目录为空的部署里，客户端看到的只是工
  具，不会看到 `resources/list` 端点。

stdio 与 HTTP 两种 transport 下契约一致。

## 四、M6 暂未落地项（已在 HANDOFF 标记）

1. **CIMD / AuthCodeFlow 实体**：依赖 TP-Link IdP 文档——CIMD
   envelope 端点、签名方案、控制器交换端点；Authorization-Code 是否
   直指 `/openapi/authorize/code` + `/openapi/authorize/token`；
   refresh token 的持久化位置。拿到材料后是纯机械填空。
2. **真机 staging 回归**：`pnpm test:staging` 脚手架就绪，就等真实
   `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET`。建议顺序：先跑 15 个只读
   工具，再 `OMADA_DRY_RUN=1` 跑 1 个写，再小范围真写 + 手动回滚。
3. **技能 trigger 校准**：需要 10+ 条真实对话样本，按真实用词微调
   每个 SKILL.md 的 TRIGGER / SKIP 列表；`skill:validate --strict` 已
   保证结构合规，属语义打磨。
4. **Resource 订阅**：`notifications/resources/list_changed` 未接入，
   M5 故意留白——skills 是作者侧产物，会话期间不会改动；若策略变化
   再补。
5. **Claude Plugin 打包**：`omada-mcp` binary + 内建 skills 的 plugin
   产物仍是 stretch goal，等 Claude 客户端支持该格式。
6. **`api-diff.yml` 第三方 Action 钉住 SHA**：当前用
   `actions/github-script@v7`，下一轮再钉 SHA 做供应链防护。

## 五、常见问题

**Q：M5 改到了哪些文件？**
六个 commit 落在 `main` 上，从 `fa8d06e` 到 `42de6cb`：
`skills` 加载器、MCP server 资源发布、两个 CLI + CI、SDK 鉴权校验、
`docs/mcp-tools.md` 回填、M5 CHANGELOG + HANDOFF。详见
[`HANDOFF.md §7`](../HANDOFF.md)。

**Q：没有远端 remote 能 push 吗？**
`git remote -v` 当前为空，需要先配置一个 remote（例如
`git remote add origin git@github.com:<user>/omada-skill.git`）再
`git push -u origin main`。详见 [`docs/contributing.md`](./contributing.md)
与根目录 [`HANDOFF.md`](../HANDOFF.md)。

**Q：如何自己跑一遍？**
`pnpm install && pnpm turbo run typecheck lint test build` 即可；无
凭据会自动走 mock。要接真实控制器，填好 `.env.local` 之后
`pnpm test:staging`（会从 `packages/sdk/test/staging.test.ts` 读凭据
并跑集成）。
