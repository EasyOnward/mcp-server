import { buildHttpServer } from "./http-server.js";

/**
 * Hosted HTTP entry point — runs the EasyOnward MCP server over Streamable HTTP
 * so web-based AI clients can use it with no local install. Intended to run as a
 * container behind a reverse proxy at https://mcp.easyonward.com/mcp. The npm
 * package keeps stdio (index.ts) for desktop clients.
 */
const PORT = Number(process.env.PORT ?? 8200);

const server = buildHttpServer();
server.listen(PORT, () => {
  process.stderr.write(
    `EasyOnward MCP server (Streamable HTTP) listening on :${PORT}\n`
  );
});
