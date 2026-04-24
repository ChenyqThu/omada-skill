import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MockAuth, MockTransport, OmadaClient } from "@omada/sdk";
import { rootLogger } from "@omada/shared";

import {
  omadaApplySiteTemplateTool,
  omadaBulkOnboardTool,
  omadaPortalWizardTool,
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

describe("omada_apply_site_template tool (two-phase)", () => {
  it("phase 1 returns a preview + confirm_token and makes no HTTP call", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaApplySiteTemplateTool.handler(
      { omadacId: "oc", siteTemplateId: "tmpl-1", siteId: "site-001" },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]!.text).toMatch(/confirm required/);
    expect(res.content[0]!.text).toContain("tmpl-1");
    const structured = res.structuredContent as { phase: string; confirmToken: string };
    expect(structured.phase).toBe("preview");
    expect(structured.confirmToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("phase 2 executes when the same plan + token are replayed", async () => {
    const transport = new MockTransport().route({
      method: "post",
      urlMatch: "/openapi/v1/oc/sitetemplates/tmpl-1/bind-site",
      body: { errorCode: 0, msg: "Success" },
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const preview = await omadaApplySiteTemplateTool.handler(
      { omadacId: "oc", siteTemplateId: "tmpl-1", siteId: "site-001" },
      { client, logger },
    );
    const token = (preview.structuredContent as { confirmToken: string }).confirmToken;

    const res = await omadaApplySiteTemplateTool.handler(
      { omadacId: "oc", siteTemplateId: "tmpl-1", siteId: "site-001", confirmToken: token },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.method).toBe("post");
    expect(res.content[0]!.text).toMatch(/Bound site-template tmpl-1/);
  });

  it("phase 2 with a tampered plan fails verification", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const preview = await omadaApplySiteTemplateTool.handler(
      { omadacId: "oc", siteTemplateId: "tmpl-1", siteId: "site-001" },
      { client, logger },
    );
    const token = (preview.structuredContent as { confirmToken: string }).confirmToken;

    const res = await omadaApplySiteTemplateTool.handler(
      { omadacId: "oc", siteTemplateId: "tmpl-1", siteId: "site-OTHER", confirmToken: token },
      { client, logger },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/does not match/);
    expect(transport.calls).toHaveLength(0);
  });
});

describe("omada_bulk_onboard tool (two-phase)", () => {
  it("preview lists first few sites", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaBulkOnboardTool.handler(
      {
        omadacId: "oc",
        fileServerConfig: { protocol: "SFTP", hostname: "fs.example.com", port: 22 },
        siteImportConfigList: [
          { filePath: "/backups/a.tar", siteName: "Store-A" },
          { filePath: "/backups/b.tar", siteName: "Store-B" },
        ],
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]!.text).toContain("Would import 2 site(s)");
    expect(res.content[0]!.text).toContain("SFTP://fs.example.com:22");
  });
});

describe("omada_portal_wizard tool (two-phase)", () => {
  it("preview names the portal", async () => {
    const transport = new MockTransport();
    const client = new OmadaClient({ auth: new MockAuth(), transport });
    const res = await omadaPortalWizardTool.handler(
      {
        omadacId: "oc",
        siteId: "s",
        portalSetting: { name: "guest-wifi", authType: "hotspot" },
      },
      { client, logger },
    );
    expect(res.isError).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
    expect(res.content[0]!.text).toContain(`portal "guest-wifi"`);
    expect(res.content[0]!.text).toContain("authType=hotspot");
  });
});
