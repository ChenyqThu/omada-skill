# Resources — bulk-site-onboard

Supporting reference the skill can pull into context when an operator
asks a follow-up. None of this is loaded automatically; it's human-
readable notes for the skill author + operator.

## Glossary

| Term                | Meaning                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| **MSP**             | Managed Service Provider — owns many customers, each with their own controller scope. |
| **`mspId`**         | MSP tenant identifier. Only set in MSP mode of `omada_discover_scope`.                |
| **`omadacId`**      | Controller ID (one per customer). Every tool takes this.                              |
| **`siteId`**        | A single-site scope under a controller (store, branch, apartment).                    |
| **Site template**   | A reusable configuration bundle (wireless / wired / portal / profiles).               |
| **Device template** | Per-device override (switch port layout, radio profile) applied _inside_ a site.      |
| **Backup file**     | The `.cfg` export the controller replays when `batchSiteImport` runs.                 |

## MSP model cheat-sheet

```
MSP (mspId)
 ├── Customer A  (omadacId = oc-abc)
 │    ├── Site HQ        (siteId = site-001)
 │    └── Site Store-42  (siteId = site-002)
 └── Customer B  (omadacId = oc-def)
      └── Site Portland  (siteId = site-003)
```

`omada_discover_scope` returns the second column; `omada_list_sites`
returns rows beneath one `omadacId`. Always resolve scope _first_ —
the write tools refuse to guess between customers.

## File-server configuration

`omada_bulk_onboard` requires a `fileServerConfig` block. Minimum:

```jsonc
{
  "protocol": "SFTP", // one of FTP | SFTP | TFTP | SCP
  "hostname": "backups.msp.local",
  "port": 22,
  "username": "omada-bot", // optional for anonymous FTP / TFTP
  "password": "***", // redacted in logs via @omada/shared redactor
}
```

Common protocol trap: TFTP has no auth → the `username` / `password`
fields should be omitted, not left empty. The tool's zod schema allows
the optional fields but Omada itself will reject `username=""`.

## Site-template payload shape (`omada_apply_site_template`)

Bound per site. Skeleton:

```jsonc
{
  "omadacId": "oc-abc",
  "siteTemplateId": "tmpl-retail-v3",
  "siteId": "site-042",
  "switches": [
    { "mac": "AA-BB-CC-DD-EE-01", "deviceTemplateId": "tmpl-switch-24p" },
    { "mac": "AA-BB-CC-DD-EE-02", "deviceTemplateId": "tmpl-switch-8p" },
  ],
}
```

`switches` is optional — omit it when the template's defaults are
sufficient. Keys that are not `mac` / `deviceTemplateId` are ignored
by the Omada API; the zod schema will reject unknown top-level fields.

## Common Omada error codes

| Code     | Meaning (bulk-onboard context)                                       |
| -------- | -------------------------------------------------------------------- |
| `-1000`  | Generic failure. Inspect `msg` and the controller's audit log.       |
| `-1001`  | Permission denied — the API key lacks the MSP or write scope.        |
| `-44111` | Duplicate site name in the same tenant (rename before re-importing). |
| `-41000` | File server unreachable from the controller (check firewall / DNS).  |
| `-44210` | `siteTemplateId` does not exist or belongs to another tenant.        |

All of these surface through the tool as `isError: true` with a text
message — the skill should show them to the operator and stop, not
retry blindly.

## Operational guardrails

- Stage large rollouts: 25 → 100 → 300 sites, not 300 in one shot.
- Run `omada_list_sites` before _and_ after each wave so the operator
  sees the delta.
- Record every confirm token in `omada_audit_logs` context — they're
  already in the JSONL audit sink (`OMADA_AUDIT_DIR=…`).
- After the skill finishes, hand off to
  [omada-support-assist](../omada-support-assist/SKILL.md) if the
  operator wants a ticket-ready report.

## Related skills

- [omada-guest-portal-wizard](../omada-guest-portal-wizard/SKILL.md) —
  stand up the captive portal on any newly created site.
- [omada-support-assist](../omada-support-assist/SKILL.md) — compile
  evidence and audit trails once the rollout has run.
