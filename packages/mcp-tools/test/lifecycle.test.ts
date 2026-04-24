import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import {
  omadaBatchChangeTool,
  omadaDeviceActionTool,
  omadaFirmwareRolloutTool,
} from "../src/index.js";

const logger = rootLogger.child("test");

const PREV_SECRET = process.env["OMADA_MCP_CONFIRM_SECRET"];
beforeAll(() => {
  process.env["OMADA_MCP_CONFIRM_SECRET"] = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete process.env["OMADA_MCP_CONFIRM_SECRET"];
  else process.env["OMADA_MCP_CONFIRM_SECRET"] = PREV_SECRET;
});

describe("omada_device_action tool (HIGH-RISK, two-phase)", () => {
  it("phase 1 preview for reboot mentions outage risk and makes no HTTP call", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaDeviceActionTool.handler(
      { omadacId: "oc", siteId: "s", deviceMac: "AA-01", action: "reboot" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]!.text).toMatch(/HIGH-RISK/);
    expect(res.content[0]!.text).toContain("reboot device AA-01");
    expect(res.content[0]!.text).toContain("outage");
  });

  it("phase 2 POSTs rebootDevice with the captured mac", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/openapi/v1/oc/sites/s/devices/AA-01/reboot",
      body: { errorCode: 0 },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const preview = await omadaDeviceActionTool.handler(
      { omadacId: "oc", siteId: "s", deviceMac: "AA-01", action: "reboot" },
      { client, logger },
    );
    const token = (preview.structuredContent as { confirmToken: string }).confirmToken;
    const res = await omadaDeviceActionTool.handler(
      {
        omadacId: "oc",
        siteId: "s",
        deviceMac: "AA-01",
        action: "reboot",
        confirmToken: token,
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(1);
    expect(res.content[0]!.text).toMatch(/REBOOT issued/);
  });
});

describe("omada_firmware_rollout tool (HIGH-RISK, two-phase)", () => {
  it("preview lists the first few macs", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaFirmwareRolloutTool.handler(
      { omadacId: "oc", siteId: "s", macs: ["AA-01", "AA-02", "AA-03"] },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toMatch(/HIGH-RISK/);
    expect(res.content[0]!.text).toContain("3 device(s)");
    expect(res.content[0]!.text).toContain("AA-01");
  });
});

describe("omada_batch_change tool (HIGH-RISK, two-phase)", () => {
  it("preview enumerates method + path and respects interrupt default", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaBatchChangeTool.handler(
      {
        omadacId: "oc",
        interrupt: true,
        actions: [
          { method: "POST", path: "/openapi/v1/oc/sites/s/wireless/ssids" },
          { method: "DELETE", path: "/openapi/v1/oc/sites/s/wireless/ssids/abc" },
        ],
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    const text = res.content[0]!.text;
    expect(text).toMatch(/HIGH-RISK/);
    expect(text).toMatch(/2 action\(s\).*interrupt=true/);
    expect(text).toContain("POST /openapi/v1/oc/sites/s/wireless/ssids");
    expect(text).toContain("DELETE /openapi/v1/oc/sites/s/wireless/ssids/abc");
  });

  it("rejects mismatched confirm_token", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const preview = await omadaBatchChangeTool.handler(
      {
        omadacId: "oc",
        interrupt: true,
        actions: [{ method: "POST", path: "/a" }],
      },
      { client, logger },
    );
    const token = (preview.structuredContent as { confirmToken: string }).confirmToken;
    // Tamper: change interrupt flag -> different plan -> token should be rejected.
    const res = await omadaBatchChangeTool.handler(
      {
        omadacId: "oc",
        interrupt: false,
        actions: [{ method: "POST", path: "/a" }],
        confirmToken: token,
      },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/does not match/);
  });
});
