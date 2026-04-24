# Diagnose runbook

## Scope

- [ ] Single `omadacId` + `siteId` confirmed. Cross-site asks get
      redirected to `omada_exec_report`.
- [ ] Operator's symptom captured in one sentence — "laggy evenings",
      "laptop drops in meeting room", "bufferings". Drives which
      zoom path to take.

## Site-wide

- [ ] `omada_wifi_diagnose` called first. Read all three lines
      (Summary · Wi-Fi health · Client health) before zooming.
- [ ] If the tool reports "no diagnostic signals — controller
      returned empty payloads", stop and tell the operator the
      controller is idle; don't retry.

## Decide the zoom

- [ ] Retry > 10% or airtime > 70% → zoom AP(s) via
      `omada_device_detail kind="ap"`.
- [ ] PoorSignal > 0 or operator named a client → zoom client via
      `omada_client_journey`.
- [ ] Wi-Fi health unhealthy > 0 but summary fine → pivot to
      `omada-alert-triage`.
- [ ] Client health unhealthy > 0 → pivot to `omada-support-assist`.

## Per-client zoom

- [ ] MAC resolved (use `omada_list_clients` if only hostname is
      known).
- [ ] Journey events inspected for ping-pong (3+ roams in 60s
      between same two APs).
- [ ] Current attachment cross-referenced against operator's
      expectation (meeting room client attached to the meeting-room
      AP, not the one next door).

## Per-AP zoom

- [ ] `kind="ap"` passed (not `switch` / `gateway`).
- [ ] Firmware version noted — lag behind a known-good build hints
      at upgrade-first.
- [ ] `cpuUtil` vs `clients` reconciled — high CPU + few clients is
      odd and worth calling out.

## Verdict

- [ ] Four-line output: Symptom · Likely cause · Evidence · Next step.
- [ ] Any write (reboot / firmware / portal) named but NOT taken.
- [ ] Handoff to the matching write skill named explicitly.
