# omada-skill · Session Handoff（M1 → M2）

> 本文件是会话切换时的"交接卷"——上一段会话刚完成 **M1 全部 10 项任务**，把仓库交到下一段会话手里。所有内容写于 2026-04-23。

---

## 0. 给下一个 Claude session 的开场白（先读这一节）

**你正在接手 omada-skill 项目，M1 已完工，9 个 commit 已落 main。** 不要重做 M1，不要无差别地把所有文件重读一遍——那会浪费上下文。

### 必读顺序（5 分钟以内能进入状态）

1. **本文件**（先把第 1–7 节读完，建立全局认知）
2. `docs/architecture.md`（5 层心智模型 + 数据流）
3. `docs/api-regeneration.md`（spec 是唯一事实源 + 何时如何重生）
4. `docs/security.md`（dry-run、confirm token、审计 log 的契约）
5. `/Users/chenyuanquan/.claude/plans/omada-mcp-fizzy-owl.md`（原始的 M1–M5 战略规划，**这份在仓库外**）

读完后，**先做这三件事**再开始任何修改：

- `git log --oneline | head -15` —— 应该能看到下方第 4 节列的那 9 个 commit
- `pnpm install && pnpm turbo run typecheck lint test build` —— 应该 7 个任务全绿、约 2 秒
- `pnpm vitest run` —— 应该 54/54 绿 ≈ 600ms

如果上面任意一步异常，**先停下来诊断**——不要在不健康的基线上开新工作。

### 严禁

- 修改 `git config`（CLAUDE.md 全局规则，一定要尊重）
- 跳过 lefthook（`--no-verify`）—— 已经踩过两次类型导入坑，靠 hook 兜住的
- 直接编辑 `packages/sdk/src/generated/`——这是 codegen 产物，靠 `pnpm generate` 重生
- 直接编辑 `specs/omada_api.json`——上游契约，按 `docs/api-regeneration.md` 流程办
- 未经用户明确指示就 commit
- 重新发明 SDK 客户端、错误体系、Logger——`@omada/shared` 和 `@omada/sdk` 已经覆盖

### 用户偏好回顾

- 中文沟通（用户母语）
- 进度报告要简练但带数字（commit hash、测试数、耗时）
- 大改动前问一下方向，小修小补直接动
- 喜欢被告知岔路并自己选——**不要替他做产品决策**
- 已确认的关键决策见第 6 节

---

## 1. 项目一句话定位

**omada-skill** = 把 TP-Link Omada Controller 的 Open API（OpenAPI 3.0.1，1,713 paths / 2,269 ops）封装成一个 **MCP Server + Skill 包**，让 Claude/Cursor 等 MCP 客户端能像专家网工一样安全地驱动 Omada 站点。

目标用户分层（按优先级）：

1. **MSP**（Managed Service Provider）—— 最高 ROI，需要批量部署、跨租户告警、白标报表
2. **SI**（System Integrator）—— 需要部署期配置、Captive Portal 向导
3. **Prosumer / SMB IT**—— 需要会话式排障（"为什么 wifi 慢"）
4. **TP-Link 内部 Support / PM**—— 知识助手 + 工单偏转

---

## 2. 当前快照

**仓库**：`/Users/chenyuanquan/Projects/omada_skill`（main 分支，未推远端）

**环境**：Node 25.6.1（本地，CI 锁 22 LTS）· pnpm 10.33.2 · TS 5.9.3 · turbo 2.9.6

**可执行**：`apps/mcp-server/dist/index.js`（已构建），`bin: omada-mcp` 已声明

**测试**：`pnpm vitest run` → **54/54 绿**（14 shared + 11 sdk + 10 guardrails + 12 mcp-tools + 7 mcp-server）≈ 600 ms

**HTTP 冒烟**：`OMADA_DRY_RUN=0 node apps/mcp-server/dist/index.js --http --port 18788` → POST `/mcp` initialize 返回 `protocolVersion=2025-06-18` + `capabilities.tools` ✓

**仓库体积**：`.git` ≈ 2 MB（generated 文件入库但 delta 压得好）

**未跟踪**：仅 `.omc/`（OMC 运行时状态，已 gitignore）

---

## 3. 架构（30 秒版）

```
Claude Desktop / Cursor / Web Claude / Managed Agents
   │ stdio (本地)            │ HTTP+SSE (远端)
   ▼                          ▼
apps/mcp-server  ── ListToolsRequestSchema → ToolRegistry.list()
                  └ CallToolRequestSchema  → ToolRegistry.call()
   │
   ▼
@omada/mcp-tools  +  @omada/guardrails
  • defineTool(z)      • HIGH_RISK_OPERATION_IDS
  • ToolRegistry       • riskSeverity()
  • omada_list_sites   • issue/verifyConfirmToken (HMAC + bucket)
   │
   ▼
@omada/sdk
  • generated/schema.d.ts  (openapi-typescript)
  • generated/operations.ts (operationId → {method, path, tags})
  • OmadaClient.call<Op>(opId, params)
  • OAuthTokenStore + FetchTransport / MockTransport
   │
   ▼
@omada/shared
  • Logger / OmadaError / paginate / retry / redact
   │
   ▼ HTTPS + OAuth2 (real)  |  in-memory routes (mock)
Omada Controller Open API
```

**5 层 5 句**：

1. `@omada/shared`：所有横切关注点（log/error/retry/redact/pagination）
2. `@omada/sdk`：spec → 强类型客户端，意图工具只认 `operationId`
3. `@omada/guardrails`：高危操作白名单 + 两阶段提交 token
4. `@omada/mcp-tools`：意图型工具 + 注册表（M1 只有 1 个，M3 加到 22）
5. `apps/mcp-server`：双传输（stdio + HTTP/SSE）+ MCP 协议适配

完整版见 `docs/architecture.md`（含 ASCII 图、why-this-layer 表格、`omada_list_sites` 8 步数据流）。

---

## 4. M1 已完成（git log 时间线）

```
5597d62 docs: add docs/ trunk and expand CHANGELOG with M1 summary
a98a9d1 ci: add GitHub Actions workflow + PR template
ec228de feat(mcp-server): apps/mcp-server with stdio + HTTP/SSE dual transport
f724540 feat(mcp-tools): add @omada/guardrails + @omada/mcp-tools with omada_list_sites
0bc09f7 chore: ignore entire .omc/ runtime state directory
1c43548 feat(sdk): OmadaClient with OAuth2, dry-run, audit, MockTransport
a636628 feat(sdk): bootstrap @omada/shared + @omada/sdk with OpenAPI codegen
ff10dfc chore: set up pnpm + turbo monorepo with TS, ESLint, Prettier, Lefthook
1682d6b chore: initialize repo scaffold with MIT LICENSE and specs layout
```

**逐项对应**：

| 任务                         | Commit    | 关键交付                                                                                             |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| M1-01 scaffold               | `1682d6b` | LICENSE (MIT) · `.gitignore` · `.gitattributes` · `.editorconfig` · `.nvmrc=22` · README · CHANGELOG |
| M1-02 specs                  | `1682d6b` | `omada_api.json` 迁入 `specs/` + 首次快照 `specs/snapshots/2026-04-23.json`                          |
| M1-03 monorepo               | `ff10dfc` | pnpm workspace + turbo + tsconfig 链 + ESLint flat + Prettier + Lefthook + commitlint + Changesets   |
| M1-04 shared                 | `a636628` | OmadaError 体系 / Logger / paginate / retry / redact + 14 测试                                       |
| M1-05 sdk codegen            | `a636628` | `scripts/generate.ts` → 6.1 MiB schema.d.ts + 2,269 ops 0 冲突                                       |
| M1-06 OmadaClient            | `1c43548` | call<Op>() + OAuth2 Client Credentials + MockTransport + dry-run + audit + 11 测试                   |
| —（gitignore）               | `0bc09f7` | 把整个 `.omc/` 加 gitignore（之前漏了 sessions/）                                                    |
| M1-07 mcp-tools + guardrails | `f724540` | ToolRegistry + defineTool(zod) + omada_list_sites + highRiskOps + confirm token + 22 测试            |
| M1-08 mcp-server             | `ec228de` | stdio + HTTP/SSE 双传输 + 配置 + 7 个端到端 MCP 协议测试                                             |
| M1-09 CI                     | `a98a9d1` | `.github/workflows/ci.yml` + PR template + spec→generated 漂移检测                                   |
| M1-10 docs                   | `5597d62` | docs/ 8 篇主干 + CHANGELOG 完整化                                                                    |

---

## 5. 验证基线（接手第一时间应该重现的状态）

```bash
$ pnpm turbo run typecheck
 Tasks:    7 successful, 7 total
  Time:    ~2.0 s

$ pnpm vitest run
 Test Files  7 passed (7)
      Tests  54 passed (54)
   Duration  ~600 ms

$ node apps/mcp-server/dist/index.js --help
omada-mcp — MCP server for TP-Link Omada Controller
...

$ node apps/mcp-server/dist/index.js --http --port 18788 &
$ curl -sS -X POST http://127.0.0.1:18788/mcp \
    -H "content-type: application/json" \
    -H "accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
         "protocolVersion":"2025-06-18","capabilities":{},
         "clientInfo":{"name":"smoke","version":"0"}}}'
event: message
data: {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},
       "serverInfo":{"name":"omada-mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

`pnpm generate` 输出：

```
[generate] Omada Open API v0.1 (openapi 3.0.1)
[generate]   → schema.d.ts (6086.7 KiB, ~900 ms)
[generate]   → operations.ts (2269 ops across 1713 paths, 0 collisions)
```

如果上面任意一项不重现，**先调查再前进**。

---

## 6. 已确认的关键决策（用户拍板过的）

| 决策点        | 选择                                                    | 影响                                                 |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| SDK 发版策略  | **内部 workspace 包**（结构按独立发版预留，1–2 天可切） | 当前 `@omada/sdk` `private: true`，README 偏内部语气 |
| License       | **MIT**                                                 | 可开源、接受社区 PR、Claude 插件市场分发             |
| M1 传输层     | **stdio + remote HTTP/SSE 都做**                        | 已落地，未来云端部署不返工                           |
| 首批 Skill 数 | **5 个**（MSP×2 + SI×1 + Prosumer×1 + 内部×1）          | M4 要做，目前 `skills/` 目录为空                     |
| Mock 模式     | **凭据缺失自动 fallback**                               | 离线 / CI / 演示都能跑通                             |

**还没问过用户、未来需要拍板的**（M5 之前要解决）：

- 默认 region 是否需要扩展（目前只有 `use1`，TP-Link 实际有 eu/ap）？
- 是否要独立 CLI（`omada` 命令，非 MCP）？
- SDK 何时切独立发版？
- 是否要做 Omada Central 内嵌 Copilot（产品化方向）？

---

## 7. 已知坑 / Gotchas

1. **`@modelcontextprotocol/sdk` 的 type-only import**
   - lefthook 会被 `consistent-type-imports` 卡住。`Logger`、`ToolRegistry` 这类只在类型位置用的，**必须 `import type`**。M1 已经踩了两次。
   - 模式：碰到 lint 报 "Imports X are only used as type"，把那一项拆出去用 `import type { X } from "..."`。

2. **prettier 在 commit 时会自动改格式**
   - lefthook pre-commit 跑 prettier --write 然后 stage_fixed，所以提交后文件可能和你 Write 时不完全一样（数组展开、表格等宽对齐等）。无害但是看起来可能"我没改的它怎么变了"。

3. **omada_api.json 的 `securitySchemes` 缺失**
   - 上游 spec 没给 OAuth schema 定义。我们在 SDK 侧硬编码了 `OAuthTokenStore`，参数从代码里 hardcode。M5 要补 `scripts/generate.ts` 的 post-process 阶段往 schema.d.ts 注入 OAuth2 类型。

4. **生成物入库**
   - `packages/sdk/src/generated/schema.d.ts` 6.1 MiB 也入库了。CI 会跑 `pnpm generate` 再 `git diff --exit-code` 验证一致性。改 spec 后忘 generate，CI 必挂。

5. **HTTP transport 的 stop() 幂等性**
   - `httpServer.close()` 第二次调会 `ERR_SERVER_NOT_RUNNING`。已用 `httpServer.listening` 做卫语句，再次调用静默返回。M1-08 commit 之后这点没问题。

6. **Node 25 vs Node 22**
   - 本地是 Node 25（Homebrew 默认），但 `.nvmrc` 锁 22 LTS、CI 跑 22。一切应在 22 上工作；25 是开发期偷个懒。如果遇到诡异行为，第一件事 `nvm use 22`。

7. **`OMADA_MCP_CONFIRM_SECRET` 还没有人调用**
   - guardrails 里的 `issueConfirmToken` 已经有 16 字符长度门槛，但 M1 没有任何写工具调用它。M3 第一个写工具一上来就要：环境变量 + 文档示例 + 测试都要顺手补上。

8. **`omada_api.json` 8 MB 的 `git diff`**
   - 标了 binary 但仍占 commit 体积。如果未来 spec 增长到 30 MB+，考虑 git-lfs 或者只跟踪 `snapshots/`。

---

## 8. 下一阶段任务推荐（按用户最后给的 4 条选项 → M2/M3/M4/M5 路径）

用户在 M1 收尾时给了 4 条岔路（这是要等他选的）：

1. **本地 Claude Desktop 接通跑一次 mock 模式 demo**（最快的视觉验收，0 代码）
2. **拿到 staging OAuth 凭据 → M2**（让真实 controller 验证 SDK 中间件）
3. **跳过 M2 → M3**（不等凭据，先把 22 个意图工具堆起来）
4. **把 Anthropic 的设计文章转成内部分享材料**（PM/团队对齐用）

如果用户没指明，**主动问一下**而不是替他选。每条对应的具体执行计划如下：

### → M2 路径（SDK 成熟化，2–3 周）

**前置**：用户提供 staging controller 的 OAuth `client_id` + `client_secret`（**绝不要写进 git**，用 `.env.local`）。

任务清单（按依赖排序）：

- M2-01 `.env.example` + `.env.local` 加载机制（`dotenv` 或 `node --env-file`）
- M2-02 `OmadaClient` 接 `retry` 中间件（目前 transport 报错就抛，没真重试 `OmadaTransientError`）
- M2-03 `paginate()` 实战测试（mock 多页 + 自动翻页 + maxPages 上界）
- M2-04 `redact()` 接进 logger / audit 链路（目前定义了但没人调用）
- M2-05 文件型审计 sink：`~/.omada-mcp/audit/YYYY-MM-DD.jsonl`（带轮转 + redact）
- M2-06 staging 集成测试 `pnpm test:staging`（CI 不跑，只在有 secret 时手动跑）
- M2-07 测试覆盖率达 ≥70%（`pnpm vitest run --coverage`）
- M2-08 `OmadaClient.call` 的强类型化（用 schema.d.ts 的 `operations` 派生 params/response 类型，目前 `Promise<unknown>`）

每项一个 commit。结束后写 `CHANGELOG [Unreleased]` 的 `### Changed` 段。

### → M3 路径（22 意图工具 + omada_script，2 周）

**前置**：M2 不一定要全做完，但**至少要把 retry 和 paginate 接进 OmadaClient**——否则 22 个工具里很多分页接口会一调就翻车。

任务清单（按业务价值排序）：

- M3-01 `omada_discover_scope`（preflight，所有其它工具的入口）
- M3-02 `omada_list_devices` + `omada_device_detail`（最高频读）
- M3-03 `omada_list_clients` + `omada_client_journey`（次高频读）
- M3-04 `omada_alerts_list` + `omada_alerts_triage`（MSP 重点）
- M3-05 `omada_site_overview` + `omada_topology`（MCP App HTML 实验）
- M3-06 `omada_apply_site_template` + `omada_bulk_onboard`（**第一个写工具，要把 confirm_token 链路串起来**）
- M3-07 `omada_device_action` + `omada_firmware_*`（**高危**，guardrails 强制门）
- M3-08 `omada_voip_overview` + `omada_vpn_status` + `omada_audit_logs`（补齐覆盖）
- M3-09 `omada_exec_report`（MCP App，跨站周报 HTML）
- M3-10 `omada_batch_change`（`/openapi/v1/{omadacId}/batch` 包装）
- M3-11 `omada_script`（V8 isolate 沙箱，给 Claude 跑 SDK 脚本）
- M3-12 Tool Search 懒加载（节省 ~85% token，照 Anthropic 文章）

每个工具的 SOP 见 `docs/contributing.md` "Adding a new MCP tool" 7 步清单。

### → M4 路径（5 Skill + 分发，2 周）

5 个 Skill 见 `docs/skills.md` 表格。每个 Skill 一个目录 + `SKILL.md`（YAML frontmatter）+ `examples/` + `checklists/`。要点：

- `description` 字段的 TRIGGER / SKIP 子句要精确——M1 没数据校准，M4 要拿 10+ 真实对话样本调
- MCP Server-distributed Skill 机制：把 Skill 当 MCP Resource 暴露
- 备选：Claude Plugin bundle 打包发布

### → M5 路径（生产化 + 0.1.0 发布，1 周）

- `scripts/diff-api.ts`（spec 新旧对比）
- `.github/workflows/api-diff.yml`（PR 自动评论 + breaking gate）
- `OMADA_MCP_CONFIRM_SECRET` 的安全文档化
- CIMD + Claude Vault 真接（`packages/sdk/src/client/auth/CIMDIntegration.ts` 目前是占位）
- Plugin bundle 打包脚本
- 0.1.0 发布 + CHANGELOG 滚版

### → 选项 1（本地 demo，0 代码）

```bash
# 1. 配 Claude Desktop
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json <<'JSON'
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/Users/chenyuanquan/Projects/omada_skill/apps/mcp-server/dist/index.js", "--stdio"]
    }
  }
}
JSON

# 2. 重启 Claude Desktop
# 3. 在对话里输入：列出我的 omada 站点
# 期望：Claude 触发 omada_list_sites，返回 3 个 SAMPLE_SITES
```

### → 选项 4（内部分享材料）

`docs/Building agents that reach production systems with MCP.md` 是 Anthropic 原文，可以照它的结构写一个 TP-Link 内部版："为什么我们要做 omada-skill / 三层关系 / 五个用户分层 / 路线图"。建议输出 PPT 大纲 + 演讲笔记，不直接生成 PPT。

---

## 9. 命令速查

```bash
# 全套验证（接手第一时间）
pnpm install
pnpm turbo run typecheck lint test build
pnpm vitest run

# 只跑某包
pnpm --filter @omada/sdk test
pnpm --filter @omada/mcp-server build

# spec → SDK 重生
pnpm generate
pnpm generate --spec specs/snapshots/2026-04-23.json   # 用历史快照

# 本地起服务（mock 模式）
pnpm --filter @omada/mcp-server dev:stdio
pnpm --filter @omada/mcp-server dev:http

# 本地起服务（real 模式）
OMADA_CLIENT_ID=... OMADA_CLIENT_SECRET=... \
  pnpm --filter @omada/mcp-server dev:http

# Format 修一切
pnpm format

# Lint 修能修的
pnpm eslint . --fix

# 看变更
git status --short
git diff --stat HEAD~1
```

---

## 10. 路径索引（按用例查文件）

| 想做的事                | 看哪里                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 加一个新 MCP 工具       | `docs/contributing.md` "Adding a new MCP tool" 章节 + `packages/mcp-tools/src/tools/scope/list_sites.ts` 范本                                 |
| 改 SDK 客户端行为       | `packages/sdk/src/client/OmadaClient.ts`                                                                                                      |
| 加一个新 OAuth flow     | `packages/sdk/src/client/auth/`（已有 OAuthTokenStore）                                                                                       |
| 加一个 region           | `packages/sdk/src/client/regions.ts` 的 `REGIONS` 常量                                                                                        |
| 标记一个新的高危 op     | `packages/guardrails/src/highRiskOps.ts` `HIGH_RISK_OPERATION_IDS` + `SEVERITY`                                                               |
| 改 codegen 行为         | `scripts/generate.ts`                                                                                                                         |
| 改 CI                   | `.github/workflows/ci.yml`                                                                                                                    |
| 改启动 / 配置           | `apps/mcp-server/src/{config,buildClient,index}.ts`                                                                                           |
| 改 stdio/HTTP transport | `apps/mcp-server/src/transport/{stdio,http}.ts`                                                                                               |
| 找一个 operationId      | `grep '"opIdNameHere"' packages/sdk/src/generated/operations.ts`                                                                              |
| 看完整端点列表          | `node --input-type=module -e "import('./packages/sdk/src/generated/operations.ts').then(m => console.log(Object.keys(m.operations).length))"` |
| 看 spec 元信息          | `jq '.info, (.servers // []), (.tags // [])                                                                                                   | length' specs/omada_api.json` |
| 看历史决策              | 本文件第 6 节 + 用户答过的 4 个 AskUserQuestion（在原 plan 文件附近）                                                                         |
| 看战略愿景              | `/Users/chenyuanquan/.claude/plans/omada-mcp-fizzy-owl.md`（仓库外，user-scoped）                                                             |
| 看设计原则参考          | `docs/Building agents that reach production systems with MCP.md`（Anthropic 原文）                                                            |

---

## 11. 给下一段 session 的最后嘱咐

- **先问，再做**：除非用户已经说了"继续"，否则启动后先报告状态、列出他在 M1 末尾给的 4 个选项、问他选哪条
- **进度同步要带数字**：commit hash、test 数、耗时——这是上一段会话立的沟通节奏
- **lefthook 会拦你**——type-only import 是最常见的拦截点，看到 lint 报 `consistent-type-imports` 就改成 `import type`
- **不要 commit**：除非用户说 "commit 一下" / "提交吧" / 类似
- **遇到不确定的设计问题**：用 `AskUserQuestion` 工具，给 2–4 个选项 + 推荐项，让用户选
- **架构图、Skill 表、工具表、风险表都在 docs/**：要更新就在原位改，不要在新地方复述
- **本文件可以更新**：每完成一个里程碑后，把这份 HANDOFF.md 改成对应那个里程碑的状态——保持"最新一份"在仓库根
