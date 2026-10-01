#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * stdio entry point — the default for the npm package (`npx -y
 * @easyonward/mcp-server`). Desktop/IDE clients (Claude Desktop, Cursor,
 * Windsurf, Cline) spawn this and speak MCP over stdio. For the hosted HTTP
 * transport, see http.ts.
 */
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport keeps the process alive; log to stderr so we never
  // corrupt the JSON-RPC stream on stdout.
  process.stderr.write("EasyOnward MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error starting EasyOnward MCP server: ${
      err instanceof Error ? err.stack : String(err)
    }\n`
  );
  process.exit(1);
});
