import type { ZudokuConfig } from "zudoku";

interface OpenApiParam {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: { type?: string };
}
interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParam[];
  requestBody?: unknown;
}

const config: ZudokuConfig = {
  site: {
    title: "Omada Skill Docs",
  },
  metadata: {
    title: "Omada Skill — Developer Portal",
    description:
      "AI-native developer portal for the TP-Link Omada Controller: typed @omada/sdk client, MCP server, Claude Agent Skills, and the full Omada Open API reference.",
  },
  navigation: [
    {
      type: "category",
      label: "Getting started",
      items: ["introduction", "quickstart", "authentication"],
    },
    {
      type: "category",
      label: "Reference",
      items: ["errors", "sdk-overview", "mcp-server"],
    },
    { type: "link", to: "/api", label: "API Reference" },
  ],
  redirects: [{ from: "/", to: "/docs/introduction" }],
  apis: {
    type: "file",
    input: "./apis/omada.json",
    path: "/api",
    options: {
      examplesLanguage: "shell",
      supportedLanguages: [
        { value: "shell", label: "cURL" },
        { value: "typescript", label: "TypeScript · @omada/sdk" },
        { value: "javascript", label: "JavaScript (fetch)" },
        { value: "python", label: "Python (httpx)" },
        { value: "go", label: "Go" },
      ],
      expandAllTags: false,
      disableSecurity: false,
      generateCodeSnippet: ({ selectedLang, selectedServer, operation }) => {
        if (selectedLang !== "typescript") return false;
        return renderOmadaSdkSnippet(operation as OpenApiOperation, selectedServer);
      },
    },
  },
  docs: {
    files: "/pages/**/*.{md,mdx}",
  },
};

function renderOmadaSdkSnippet(operation: OpenApiOperation, server: string): string {
  const id = operation.operationId ?? "<operationId>";
  const params = operation.parameters ?? [];
  const pathParams = params.filter((p) => p.in === "path");
  const queryParams = params.filter((p) => p.in === "query");
  const hasBody = !!operation.requestBody;

  const obj = (entries: Array<[string, string]>): string =>
    entries.length === 0
      ? "{}"
      : `{\n${entries.map(([k, v]) => `      ${k}: ${v},`).join("\n")}\n    }`;

  const sections: string[] = [];
  if (pathParams.length) {
    sections.push(`    path: ${obj(pathParams.map((p) => [p.name, placeholder(p)]))},`);
  }
  if (queryParams.length) {
    sections.push(`    query: ${obj(queryParams.map((p) => [p.name, placeholder(p)]))},`);
  }
  if (hasBody) {
    sections.push(`    body: {\n      // See request body schema in the right panel\n    },`);
  }

  const region = inferRegion(server);

  return `import { OmadaClient, ClientCredentialsAuth } from "@omada/sdk";

const client = new OmadaClient({
  region: "${region}",
  auth: new ClientCredentialsAuth({
    clientId: process.env.OMADA_CLIENT_ID!,
    clientSecret: process.env.OMADA_CLIENT_SECRET!,
  }),
});

const result = await client.call("${id}", {
${sections.length ? sections.join("\n") : "    // no params"}
});`;
}

function inferRegion(server: string): string {
  const match = server.match(/(use1|euw1|aps1|apne1|sa1)/);
  return match ? match[1]! : "use1";
}

function placeholder(p: OpenApiParam): string {
  const t = p.schema?.type;
  if (t === "integer" || t === "number") return "0";
  if (t === "boolean") return "false";
  if (t === "array") return "[]";
  return `"<${p.name}>"`;
}

export default config;
