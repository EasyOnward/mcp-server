import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildHttpServer } from "../src/http-server.js";

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const httpServer = buildHttpServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

test("GET /health returns ok", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; transport: string };
    assert.equal(body.status, "ok");
    assert.equal(body.transport, "streamable-http");
  });
});

test("MCP client can initialize + list tools over Streamable HTTP", async () => {
  await withServer(async (base) => {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
    await client.connect(transport); // performs the initialize handshake
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["check_visa", "country_code"]);
    await client.close();
  });
});

test("non-MCP methods are rejected", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mcp`, { method: "GET" });
    assert.equal(res.status, 405);
  });
});
