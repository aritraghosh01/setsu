import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSetsuMcpServer } from './server.js';

export { createSetsuMcpServer, type SetsuMcpHandle } from './server.js';

/** Serve over stdio; no network listener (spec section 57). */
export async function serveStdio(repoRoot: string, version: string): Promise<void> {
  const handle = createSetsuMcpServer(repoRoot, version);
  await handle.server.connect(new StdioServerTransport());
}
