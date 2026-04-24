import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaAuditLogsTool, omadaVoipOverviewTool, omadaVpnStatusTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_voip_overview tool", () => {
  it("renders enable / dscp / queue", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/qos/gateway/voip-prioritization",
      body: { errorCode: 0, result: { enable: true, dscp: 46, queue: 6 } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaVoipOverviewTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toMatch(/enabled/);
    expect(res.content[0]!.text).toContain("dscp=46");
  });

  it("surfaces errorCode", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/openapi\/v1\//,
      body: { errorCode: -1, msg: "nope" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaVoipOverviewTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBe(true);
  });
});

describe("omada_vpn_status tool", () => {
  it("renders tunnel list with mode / peer / status", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/remoteAccess/tunnel/status",
      body: {
        errorCode: 0,
        result: [
          {
            name: "hq-to-branch",
            mode: "ipsec",
            peerAddress: "1.2.3.4",
            status: "up",
            uptimeStr: "3d",
          },
          { name: "ssl-vpn", mode: "openvpn", peerAddress: "5.6.7.8", status: "down" },
        ],
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaVpnStatusTool.handler(
      { omadacId: "oc", siteId: "s" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    const text = res.content[0]!.text;
    expect(text).toMatch(/Found 2 tunnel/);
    expect(text).toContain("hq-to-branch");
    expect(text).toContain("peer=1.2.3.4");
    expect(text).toContain("openvpn");
  });
});

describe("omada_audit_logs tool", () => {
  it("forwards time window + searchKey and renders entries", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/audit-logs",
      body: {
        errorCode: 0,
        result: {
          totalRows: 1,
          data: [
            {
              timestamp: 1_700_000_000_000,
              user: "alice",
              module: "Device",
              action: "reboot",
              message: "rebooted AP-1",
              ip: "10.0.0.2",
            },
          ],
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaAuditLogsTool.handler(
      { omadacId: "oc", siteId: "s", page: 1, pageSize: 50, searchKey: "reboot" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    const url = transport.calls[0]?.url ?? "";
    expect(url).toContain("searchKey=reboot");
    expect(url).toContain("filters.timeStart=");
    expect(res.content[0]!.text).toContain("alice");
    expect(res.content[0]!.text).toContain("Device/reboot");
  });
});
