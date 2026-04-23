import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Logger } from "@omada/shared";

export interface TransportHandle {
  stop: () => Promise<void>;
  closed: Promise<void>;
}

export interface StartStdioOptions {
  server: Server;
  logger: Logger;
}

export async function startStdioTransport(opts: StartStdioOptions): Promise<TransportHandle> {
  const transport = new StdioServerTransport();
  let resolveClosed = (): void => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  transport.onclose = () => {
    opts.logger.debug("stdio transport closed");
    resolveClosed();
  };
  await opts.server.connect(transport);
  opts.logger.info("stdio transport connected");
  return {
    closed,
    stop: async () => {
      await transport.close();
    },
  };
}
