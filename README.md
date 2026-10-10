# EasyOnward MCP Server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server that lets any
MCP-capable AI assistant (Claude Desktop, Cursor, ChatGPT desktop, …) check **passport visa,
entry, and transit requirements** for a country pair — with **official government sources** and a
deep link to the full [EasyOnward](https://easyonward.com) analysis.

It wraps EasyOnward's public, unauthenticated visa-pair endpoint. It is **read-only**, sends **no
PII**, and requires **no API key**.

> **Not legal or immigration advice.** Results are a generic analysis for *any* citizen of the
> passport country. Always verify with your airline and the destination's authorities before
> travel.

## Tools

### `check_visa`

> Check whether a traveler holding a given passport needs a visa, and what entry & transit
> requirements apply, for a destination country — with official government sources.

**Inputs**

| Field                  | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `passport_country`     | The traveler's passport country. ISO 3166-1 alpha-2 code (`US`) or name (`United States`). |
| `destination_country`  | The destination country. ISO 3166-1 alpha-2 code (`KE`) or name (`Kenya`).  |

**Output** — both human-readable text and a structured object containing:

- `verdict` — a one-line plain-language summary (restricted / conditional / straightforward).
- `worst_severity` — `BLOCK` | `WARN` | `INFO` | `NONE`.
- `requirements[]` — each flagged requirement as `severity`, `title`, `detail`.
- `official_sources[]` — deduped official government source URLs.
- `deep_link` — `https://easyonward.com/visa/{ORIGIN}-{DEST}` for the full analysis.
- `prepare_link` — the same page tagged `?ref=mcp`, comparing visa services, travel insurance, and eSIM options alongside the official/free path.
- `disclaimer`.

### `country_code`

Helper that resolves a country name (or an existing ISO-2 code) to its uppercase ISO 3166-1
alpha-2 code — e.g. `Kenya` → `KE`. Handy before calling `check_visa`.

## Example

Calling `check_visa` with `{ "passport_country": "US", "destination_country": "KE" }`:

```
Travel from United States to Kenya is conditional — see requirements.

Requirements:
  [INFO] US travel advisory: Kenya — Level 2 (Exercise Increased Caution) — …
  [INFO] Be ready to show proof of funds for Kenya (KE) — …
  [WARN] An electronic travel authorization (eta) for Kenya on your United States (US) passport — …

Official government sources:
  - https://www.etakenya.go.ke
  - https://immigration.go.ke
  - https://travel.state.gov/…/kenya-travel-advisory.html
  …

Full details: https://easyonward.com/visa/US-KE

Generic analysis for any United States citizen. Not legal or immigration advice — verify with
your airline and the destination's authorities before travel.
```

## Install & run

Two ways to connect, same tools:

- **Hosted (remote)** — no install, nothing to run. Point any HTTP-capable MCP
  client at `https://mcp.easyonward.com/mcp` (Streamable HTTP). Best for most
  users.
- **Local (stdio)** — runs on Node 18+ via `npx` (no install needed):
  ```bash
  npx -y @easyonward/mcp-server
  ```
  The server speaks MCP over **stdio**. Best for offline/air-gapped setups or
  clients without remote transport.

### Hosted (remote) — Claude Code / any HTTP client

```bash
claude mcp add --transport http easyonward https://mcp.easyonward.com/mcp
```

Or in a client config that supports remote servers:

```json
{
  "mcpServers": {
    "easyonward": {
      "type": "streamable-http",
      "url": "https://mcp.easyonward.com/mcp"
    }
  }
}
```

The hosted server is read-only, stateless, and PII-free — same two tools as
the local build.

### Claude Desktop (local stdio)

Add to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "easyonward": {
      "command": "npx",
      "args": ["-y", "@easyonward/mcp-server"]
    }
  }
}
```

Restart Claude Desktop, then ask: *"Do I need a visa to fly from the US to Kenya?"*

### Cursor

Add to `~/.cursor/mcp.json` (or **Settings → MCP → Add new server**):

```json
{
  "mcpServers": {
    "easyonward": {
      "command": "npx",
      "args": ["-y", "@easyonward/mcp-server"]
    }
  }
}
```

### Smithery

This server ships a [`smithery.yaml`](./smithery.yaml) manifest, so it can be installed from the
[Smithery](https://smithery.ai) registry:

```bash
npx -y @smithery/cli install @easyonward/mcp-server --client claude
```

### Windsurf, Cline & other stdio clients

Any client that supports local stdio MCP servers uses the **same block** —
`command: npx`, `args: ["-y", "@easyonward/mcp-server"]`. In Windsurf it's
*Settings → Cascade → MCP Servers*; in Cline it's the MCP settings JSON. No
client-specific setup.

## Configuration

| Env var               | Default                          | Purpose                                              |
| --------------------- | -------------------------------- | ---------------------------------------------------- |
| `EASYONWARD_API_BASE` | `https://easyonward.com/api/v1`  | API base URL. Point at a dev/staging host for testing. |

Example (point at a dev host):

```json
{
  "mcpServers": {
    "easyonward": {
      "command": "npx",
      "args": ["-y", "@easyonward/mcp-server"],
      "env": { "EASYONWARD_API_BASE": "https://dev.easyonward.com/api/v1" }
    }
  }
}
```

## Security & privacy

- **Read-only.** The server only performs GET lookups against the public EasyOnward
  API — it never writes, books, or mutates anything.
- **No secrets, no auth.** There's no API key or token to configure, so there's
  nothing to leak.
- **No PII.** It sends only a passport country + a destination country (ISO-2 codes
  or country names). It never asks for or transmits passport numbers, names, dates
  of birth, or any personal data.
- **Public data only.** Everything returned is public visa/entry/transit reference
  information, with links to official government sources.
- **Fail-safe.** An unreachable API or an uncatalogued country pair returns a clear
  message, not a crash. Requests are subject to the public API's rate limits.

## Develop

```bash
npm install      # install deps
npm run build    # tsc -> dist/
npm test         # unit tests (mocked fetch)
npm start        # run the built server on stdio
```

This package lives in its own directory and is intentionally isolated from the EasyOnward
frontend/backend tooling and CI.

## License

MIT
