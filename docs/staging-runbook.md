# Staging runbook

> Step-by-step playbook for the first end-to-end pass against a real
> Omada controller. Today this is a **skeleton**: the structure is in
> place, but the per-step expected outputs are filled in only as the
> real run completes — the first operator to dogfood replaces every
> `TBD: …` with an observed value.
>
> Companion to [`docs/m6-auth-research-questions.md`](./m6-auth-research-questions.md):
> the auth doc unblocks `cimd` / `authcode` strategies; this doc
> unblocks the `cc` (Client Credentials) path that is already
> implemented.

## Goal

Three checkpoints, in order, against a real controller:

1. **Read-only smoke.** Each of the M3 read-only intent tools makes one
   round-trip and returns coherent text + `structuredContent`.
2. **Two-phase dry-run.** One write tool issues a confirm token, the
   server returns the plan preview, and a second call with
   `OMADA_DRY_RUN=1` confirms the short-circuit path.
3. **Real write under sandbox.** One small, reversible write
   (`omada_apply_site_template` against a throwaway site) actually
   modifies controller state and the audit log captures it.

## Prerequisites

- A staging Omada controller you have admin on. Sandbox or non-prod
  cluster, never an operator-facing one.
- An OAuth Client Credentials pair issued by the controller
  (`OMADA_CLIENT_ID` + `OMADA_CLIENT_SECRET`).
- The `omadacId` for the controller — surfaces as `omadacId` in any
  controller dashboard URL.
- One disposable site under that `omadacId` to point write tools at.
  Never run the real-write step against a customer site.

## §0 — Pre-flight

```bash
# Workspace prep
pnpm install
pnpm build

# Smoke against a region that the controller actually serves.
# Default is "use1" — adjust per your deployment.
export OMADA_REGION=use1                 # or eu-west-1, etc.
export OMADA_CLIENT_ID=...               # from controller's OAuth admin
export OMADA_CLIENT_SECRET=...
export OMADA_OMADAC_ID=...               # required for staging tests
export OMADA_AUDIT_DIR=$PWD/.tmp/audit   # captures every call as JSONL
export OMADA_MCP_CONFIRM_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")

# (Optional) override controller URL if region-default is wrong:
# export OMADA_BASE_URL=https://your-controller.example.com

# (Optional) tighten down the HTTP transport:
# export OMADA_MCP_BEARER=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
# export OMADA_MCP_ALLOWED_ORIGINS=https://claude.ai
```

Verify reachability:

```bash
curl -fsS "$OMADA_BASE_URL/openapi/authorize/token" -d 'grant_type=client_credentials' \
     -d "client_id=$OMADA_CLIENT_ID" -d "client_secret=$OMADA_CLIENT_SECRET" \
  | head -c 200
```

Expected: an RFC 6749 / Omada-wrapped JSON body with an `access_token`.
If this fails, do not proceed — fix credentials / network / region first.

## §1 — Read-only smoke

Run the staging-gated SDK tests, which exercise paginated reads and
audit-sink delivery:

```bash
pnpm test:staging
```

Expected (TBD: replace once the first run completes):

- `OmadaClient against staging controller > paginates getSiteList` — pass
  in TBD ms; first batch length: TBD.
- `OmadaClient against staging controller > dry-run short-circuits` —
  pass.
- `OmadaClient against staging controller > writes every real call into
the JsonlAuditSink file` — pass; audit file: `$OMADA_AUDIT_DIR/<today>.jsonl`,
  TBD lines.

Then exercise each read-only intent tool from a stdio MCP session:

```bash
npx omada-mcp --stdio
```

…and from the client side, call:

| Tool                   | Inputs                                          | Expected                                              | Observed |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------- | -------- |
| `omada_discover_scope` | `{}`                                            | controllers + sites count                             | TBD      |
| `omada_list_sites`     | `{ "page": 1, "pageSize": 10 }`                 | first page of sites                                   | TBD      |
| `omada_site_overview`  | `{ "siteId": "<one>" }`                         | device counts, alert counts, snapshot                 | TBD      |
| `omada_list_devices`   | `{ "siteId": "<one>", "kind": "ap" }`           | AP inventory                                          | TBD      |
| `omada_device_detail`  | `{ "siteId": "<one>", "kind": "ap", "mac": … }` | per-device telemetry                                  | TBD      |
| `omada_list_clients`   | `{ "siteId": "<one>" }`                         | connected clients                                     | TBD      |
| `omada_client_journey` | `{ "siteId": …, "mac": … }`                     | last-N events for a client                            | TBD      |
| `omada_topology`       | `{ "siteId": "<one>" }`                         | nodes + links                                         | TBD      |
| `omada_wifi_diagnose`  | `{ "siteId": "<one>" }`                         | per-AP RSSI / interference summary                    | TBD      |
| `omada_alerts_list`    | `{ "siteId": "<one>" }`                         | alert page                                            | TBD      |
| `omada_alerts_triage`  | `{ "siteId": "<one>" }`                         | grouped/scored alerts                                 | TBD      |
| `omada_voip_overview`  | `{ "siteId": "<one>" }`                         | VoIP-capable APs + call counts                        | TBD      |
| `omada_vpn_status`     | `{ "siteId": "<one>" }`                         | tunnels and their states                              | TBD      |
| `omada_audit_logs`     | `{ "siteId": "<one>", "since": … }`             | controller-side audit entries                         | TBD      |
| `omada_firmware_plan`  | `{ "siteId": "<one>" }`                         | available firmware vs current per kind                | TBD      |
| `omada_exec_report`    | `{}`                                            | MSP rollup (TBD if available on this controller tier) | TBD      |

If any tool returns `isError: true` with a non-trivial message, capture
the full error in this table's "Observed" column before moving on.

## §2 — Two-phase dry-run

Pick one medium-risk write tool. `omada_apply_site_template` is the
safest — it has explicit confirm, and the diff is small.

```bash
export OMADA_DRY_RUN=1
npx omada-mcp --stdio
```

Plan phase (no `confirm_token` in input):

```jsonc
{
  "siteId": "<disposable site>",
  "templateId": "<existing template id>",
}
```

Expected: the tool returns text containing the plan summary plus a
`__phase: "plan"` block with a `confirm_token`. Capture the token.

Confirm phase (same inputs + the token):

```jsonc
{
  "siteId": "<disposable site>",
  "templateId": "<existing template id>",
  "confirm_token": "<token from the plan phase>",
}
```

Expected (with `OMADA_DRY_RUN=1`): the tool returns
`{ "__dryRun": true, "operationId": "bindSiteTemplate", … }` and the
audit sink shows `dryRun: true`. No controller state changed.

## §3 — Real write under sandbox

Same flow as §2 with `OMADA_DRY_RUN` unset. Run once against the
disposable site only.

```bash
unset OMADA_DRY_RUN
```

Capture the audit-log entry:

```bash
tail -n 1 "$OMADA_AUDIT_DIR/$(date -u +%F).jsonl" | python3 -m json.tool
```

Expected: `dryRun: false`, `status: 200`, `operationId: bindSiteTemplate`,
no leaked secret fields.

Re-run `omada_site_overview` against the same site and confirm the
template binding shows up.

## §4 — Cleanup

- Detach the template binding from the disposable site (UI is fine — we
  don't have a generic "unbind" tool yet) so re-runs of this runbook
  start clean.
- Wipe the local audit dir: `rm -rf "$OMADA_AUDIT_DIR"`.
- Rotate any staging credential pair if it was shared in chat or on a
  shared host.

## Troubleshooting

| Symptom                                      | Likely cause                                                    | Resolution                                                                      |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `OmadaAuthError: 401`                        | Wrong client id/secret, or scope issue                          | Re-issue the OAuth pair on the controller; check the controller's OAuth admin.  |
| `OmadaAuthError: refusing http://`           | `OMADA_BASE_URL` or `OMADA_TOKEN_URL` is plaintext              | Use `https://`, or set `OMADA_ALLOW_INSECURE_LOOPBACK=1` for loopback dev only. |
| `OmadaAuthError: token expires_in is …`      | Controller returned a non-positive TTL (clock skew?)            | Compare server time; re-issue credentials.                                      |
| `OmadaTransientError` on retry exhaustion    | Network drop or controller maintenance                          | Wait, then re-run the failing step.                                             |
| `pnpm test:staging` reports `0 tests`        | `OMADA_CLIENT_ID`/`OMADA_CLIENT_SECRET`/`OMADA_OMADAC_ID` unset | Set all three; the suite skips itself when any is missing.                      |
| Tools return text but no `structuredContent` | Controller returned non-JSON (HTML error page)                  | Inspect raw response — usually a region/baseUrl mismatch.                       |
| Audit file empty after several calls         | Wrong `OMADA_AUDIT_DIR` permissions                             | Pick a writable path; the sink reports the error via the registered onError.    |

## What this doc becomes once dogfooded

After the first successful run:

- Replace every `TBD` with the observed value (ms, line count, sample
  output snippet).
- Append a `## Run log` section at the end with date + operator initials
  - which controller version + any anomalies. One bullet per run.
- Add a `## Known controller quirks` section if any read-only tool
  needed a workaround. Cross-reference the relevant
  [`packages/mcp-tools/src/tools/`](../packages/mcp-tools/src/tools/)
  file.

When CIMD or AuthCode auth lands, fork this runbook into
`docs/staging-runbook-cimd.md` / `docs/staging-runbook-authcode.md`
rather than overloading this one — the CC flow stays the simplest path
for new contributors to follow.
