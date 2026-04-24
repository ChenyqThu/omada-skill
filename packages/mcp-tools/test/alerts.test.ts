import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaAlertsListTool, omadaAlertsTriageTool } from "../src/index.js";

const logger = rootLogger.child("test");

const SAMPLE_ALERTS = [
  {
    timestamp: 1_700_000_000_000,
    module: "Device",
    severity: "critical",
    deviceName: "AP-1",
    message: "AP offline",
    resolved: false,
  },
  {
    timestamp: 1_700_000_500_000,
    module: "Device",
    severity: "critical",
    deviceName: "AP-1",
    message: "AP still offline",
    resolved: false,
  },
  {
    timestamp: 1_700_000_900_000,
    module: "Client",
    severity: "warning",
    clientMac: "11-22-33-44-55",
    message: "Auth retries",
    resolved: true,
  },
];

describe("omada_alerts_list tool", () => {
  it("defaults to last 24h and forwards filters.timeStart / timeEnd", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/openapi/v1/oc/sites/s/alerts",
      body: { errorCode: 0, result: { totalRows: 3, data: SAMPLE_ALERTS } },
    });
    // Actual path from spec is .../alerts but operationId is getAlertLogsForSite;
    // intercept on any URL under the site so we don't need to look up the path.
    transport.route({
      urlMatch: /\/openapi\/v1\/oc\/sites\/s\//,
      body: { errorCode: 0, result: { totalRows: 3, data: SAMPLE_ALERTS } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaAlertsListTool.handler(
      { omadacId: "oc", siteId: "s", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls[0]?.url).toContain("filters.timeStart=");
    expect(transport.calls[0]?.url).toContain("filters.timeEnd=");
    expect(res.content[0]!.text).toMatch(/Found 3 alert\(s\)/);
    expect(res.content[0]!.text).toContain("AP offline");
  });

  it("forwards module + resolved filters", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/openapi\/v1\/oc\/sites\/s/,
      body: { errorCode: 0, result: { data: [] } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    await omadaAlertsListTool.handler(
      {
        omadacId: "oc",
        siteId: "s",
        page: 1,
        pageSize: 50,
        module: "Device",
        resolved: false,
      },
      { client, logger },
    );
    const url = transport.calls[0]?.url ?? "";
    expect(url).toContain("filters.module=Device");
    expect(url).toContain("filters.resolved=false");
  });

  it("empty window renders 'No alerts'", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/openapi\/v1\//,
      body: { errorCode: 0, result: { totalRows: 0, data: [] } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaAlertsListTool.handler(
      { omadacId: "oc", siteId: "s", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.content[0]?.text).toMatch(/No alerts/);
  });
});

describe("omada_alerts_triage tool", () => {
  it("groups alerts by severity / module / target, sorted by severity", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/openapi\/v1\//,
      body: { errorCode: 0, result: { totalRows: 3, data: SAMPLE_ALERTS } },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaAlertsTriageTool.handler(
      { omadacId: "oc", siteId: "s", pageSize: 500 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    const text = res.content[0]!.text;
    expect(text).toMatch(/Triaged 3 alert\(s\).*2 distinct issue\(s\)/);
    const structured = res.structuredContent as {
      groups: { key: string; severity: string; count: number }[];
    };
    expect(structured.groups).toHaveLength(2);
    expect(structured.groups[0]?.severity).toBe("critical");
    expect(structured.groups[0]?.count).toBe(2);
  });

  it("surfaces errorCode", async () => {
    const transport = new MockTransport().route({
      urlMatch: /\/openapi\/v1\//,
      body: { errorCode: -1007, msg: "forbidden" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaAlertsTriageTool.handler(
      { omadacId: "oc", siteId: "s", pageSize: 500 },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-1007/);
  });
});
