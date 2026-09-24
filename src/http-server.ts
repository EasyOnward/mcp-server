import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const MAX_BODY_BYTES = 256 * 1024;

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, mcp-session-id, mcp-protocol-version, last-event-id"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length ? JSON.parse(raw) : undefined;
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

/**
 * Build the hosted HTTP server exposing the EasyOnward MCP tools over the
 * Streamable HTTP transport in **stateless** mode (read-only, no auth, no
 * sessions): each POST /mcp gets a fresh server + transport, so there's no
 * session store and no long-lived SSE stream to hold open. GET /health is a
 * plain liveness probe. Returns the http.Server without listening, so tests can
 * bind an ephemeral port.
 */
export function buildHttpServer(): Server {
  return createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "easyonward-mcp",
          transport: "streamable-http",
        })
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp") {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true, // plain JSON responses (no SSE stream)
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        const body = await readJsonBody(req);
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        process.stderr.write(
          `MCP request error: ${err instanceof Error ? err.stack : String(err)}\n`
        );
        jsonRpcError(res, 500, -32603, "Internal server error");
      }
      return;
    }

    // Stateless mode has no long-lived GET stream or session DELETE.
    jsonRpcError(
      res,
      405,
      -32000,
      "Method not allowed. Use POST /mcp for the MCP endpoint, or GET /health."
    );
  });
}
