# 技能（Skills）

> [English](./skills.md) · 中文

**技能**是把一堆 MCP 工具粘合成 Omada 专家的「过程性知识」。引用
Anthropic
[Building agents that reach production systems with MCP](./Building%20agents%20that%20reach%20production%20systems%20with%20MCP.md)：

> MCP 让 Agent 能访问外部系统的工具和数据，技能则教会 Agent 用这些工具
> 完成真实工作的过程性知识。

M5 起，`apps/mcp-server` 启动时会把 [`skills/`](../skills/) 下所有技能
以 `resource://omada-skills/<名称>` 的 MCP Resource 形式发布（MIME
`text/markdown`）。兼容的客户端会随工具列表一起自动加载。

## M4 已落地的 5 个技能

| 技能                                                                        | 角色          | 目标                                           | 调度的工具                                                                                                              |
| --------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`omada-bulk-site-onboard`](../skills/omada-bulk-site-onboard/SKILL.md)     | MSP           | 按模板成批接入多个客户站点（SSID / VLAN 一致） | `omada_discover_scope` · `omada_list_sites` · `omada_bulk_onboard` · `omada_apply_site_template` · `omada_batch_change` |
| [`omada-alert-triage`](../skills/omada-alert-triage/SKILL.md)               | MSP / SI      | 把一批告警聚类、分级、产出可交接的摘要         | `omada_alerts_list` · `omada_alerts_triage` · `omada_device_detail` · `omada_topology`                                  |
| [`omada-guest-portal-wizard`](../skills/omada-guest-portal-wizard/SKILL.md) | SI            | 从零到一拉起一个品牌化的 Captive Portal        | `omada_portal_wizard` · `omada_apply_site_template`                                                                     |
| [`omada-wifi-troubleshoot`](../skills/omada-wifi-troubleshoot/SKILL.md)     | Prosumer / SI | 按固定 playbook 回答「为什么 Wi-Fi 卡？」      | `omada_wifi_diagnose` · `omada_client_journey` · `omada_device_detail`                                                  |
| [`omada-support-assist`](../skills/omada-support-assist/SKILL.md)           | 内部一线支持  | 起草附带证据的一线工单                         | `omada_site_overview` · `omada_device_detail` · `omada_alerts_list` · `omada_audit_logs`                                |

## 技能目录结构

每个技能都位于 `skills/<slug>/`，遵循 Anthropic Agent Skill 约定：

```
skills/omada-bulk-site-onboard/
├── SKILL.md                # frontmatter + 过程性正文
├── RESOURCES.md            # 术语、MSP 模型、常见错误
├── examples/
│   ├── 10-stores-quickservice.md
│   └── multi-region-rollout.md
└── checklists/
    └── preflight.md        # 执行前检查（VLAN / SSID / DHCP 冲突）
```

`SKILL.md` 的 frontmatter：

```yaml
---
name: omada-bulk-site-onboard
description: |
  TRIGGER when the user wants to onboard multiple Omada customer sites
  from a template with consistent SSIDs/VLANs/firmware. SKIP for
  single-site changes or read-only queries.
version: 0.1.0
tags: [omada, msp, bulk, onboarding]
requires-mcp-server: omada-skill>=0.1
---
```

正文需包含：

1. **目标（Goal）** — 一句话说清结果。
2. **使用时机（When to use）** — 3 个 TRIGGER + 3 个 SKIP，让 Claude
   的 skill selector 精准匹配。
3. **依赖工具（Required tools）** — 技能协调的 MCP 工具名。
4. **工作流（Workflow）** — 按编号给出每一步，并点名它调用的工具。
5. **示例（Examples）** — 指向 `examples/…`。
6. **陷阱（Pitfalls）** — API 怪癖、顺序约束等必须记住的项。

## 分发机制

**MCP Server 内嵌分发**（M5 起默认生效）：
`apps/mcp-server` 启动时遍历 `<仓库>/skills/*/SKILL.md`，解析
frontmatter 并以
`resource://omada-skills/<slug>` 发布，MIME 为 `text/markdown`。
`resources/list` 返回 `{ uri, name, description, mimeType }`，其中
`description` 取 frontmatter `description` 块的第一行非空文本。
`resources/read` 返回完整 SKILL.md（含 frontmatter）原文。

备选：**Claude Plugin Bundle**——把技能目录和 `omada-mcp` binary 打成
一个可安装产物，等 Claude Desktop 支持即可启用（M6 的 stretch
goal）。

版本号绑定到 MCP 服务器版本，再绑定到规格基线。

## 校验与 CI

- `pnpm skill:validate` — 走 `@omada/mcp-tools` 加载器检查每个
  SKILL.md：
  - frontmatter 必填项（`name` / `description` / `version`）。
  - `name` 必须等于目录名（slug）。
  - `tags` 必须是内联数组 `[a, b]`。
- `pnpm skill:validate --strict` — 额外把缺失的
  `RESOURCES.md` / `examples/` / `checklists/` 从 warning 升级为
  error。CI 就用这档。
- CI 流水线 `.github/workflows/ci.yml` 已串进上述步骤，合入 `main`
  之前必须通过。

## 内部校准计划

1. ✅ **编写** — 五个技能已落在 `skills/**`，frontmatter 已定稿，
   各自两个 `examples/` + 一个 `checklists/` + `RESOURCES.md`。
2. ⏭ **校准** — 每个技能收集 10+ 条真实对话样本，按用户真实用词微
   调 frontmatter 里的 TRIGGER / SKIP。
3. ⏭ **设计伙伴试跑** — 让 2 家 MSP 的真实工程师把
   `omada-bulk-site-onboard` + `omada-alert-triage` 跑到尾，含回滚
   演练。把摩擦点写回 `checklists/*.md` 和 `Pitfalls`。
4. ⏭ **分发（M5 ✓，Plugin 待 M6）** — MCP Resource 已开通，Plugin
   Bundle 等 Claude 客户端就绪。

## 相关文档

- [`HANDOFF.md`](../HANDOFF.md) — 当前里程碑交接。
- [`docs/STATUS.zh.md`](./STATUS.zh.md) — M1 → M5 进度全景。
- [`docs/mcp-tools.md`](./mcp-tools.md) — 工具清单，被技能 workflow
  直接引用。
