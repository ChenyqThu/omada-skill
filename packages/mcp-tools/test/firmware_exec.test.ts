import { describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import { omadaExecReportTool, omadaFirmwarePlanTool } from "../src/index.js";

const logger = rootLogger.child("test");

describe("omada_firmware_plan tool", () => {
  it("aggregates firmware pool + upgrade plans", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: "/upgrade/firmwares",
        body: {
          errorCode: 0,
          result: {
            data: [
              { model: "EAP670", version: "5.5.0" },
              { model: "SG2428", version: "1.6.0" },
            ],
          },
        },
      })
      .route({
        urlMatch: "/upgrade/overview/plans",
        body: {
          errorCode: 0,
          result: {
            data: [
              { planId: "p1", name: "weekly-APs", status: "scheduled", targetVersion: "5.5.0" },
            ],
          },
        },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaFirmwarePlanTool.handler(
      { omadacId: "oc", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(2);
    const text = res.content[0]!.text;
    expect(text).toContain("Firmware pool: 2 image(s)");
    expect(text).toContain("EAP670 5.5.0");
    expect(text).toContain("Upgrade plans: 1 configured");
    expect(text).toContain("weekly-APs");
  });

  it("surfaces errorCode", async () => {
    const transport = new MockTransport()
      .route({
        urlMatch: "/upgrade/firmwares",
        body: { errorCode: 0, result: { data: [] } },
      })
      .route({
        urlMatch: "/upgrade/overview/plans",
        body: { errorCode: -15000, msg: "upgrade module disabled" },
      });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaFirmwarePlanTool.handler(
      { omadacId: "oc", page: 1, pageSize: 100 },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/errorCode=-15000/);
  });
});

describe("omada_exec_report tool", () => {
  it("renders MSP dashboard KPIs", async () => {
    const transport = new MockTransport().route({
      urlMatch: "/msp/msp-1/dashboard/client/overview-diagram",
      body: {
        errorCode: 0,
        result: {
          customerTotal: 4,
          siteTotal: 12,
          deviceTotal: 48,
          deviceConnectedTotal: 46,
          clientTotal: 210,
          criticalAlertTotal: 3,
        },
      },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaExecReportTool.handler({ mspId: "msp-1" }, { client, logger });
    expect(res.isError).toBeUndefined();
    const text = res.content[0]!.text;
    expect(text).toContain("MSP msp-1");
    expect(text).toContain("customers=4");
    expect(text).toContain("total=48");
    expect(text).toContain("critical=3");
  });
});
