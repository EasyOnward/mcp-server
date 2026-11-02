import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkVisa } from "./visa.js";
import { resolveCountry } from "./countries.js";

/** Kept in sync with package.json `version`. */
export const SERVER_VERSION = "0.2.0";

/**
 * Build a fully-configured EasyOnward MCP server with the read-only tools.
 * Shared by the stdio entry point (index.ts) and the HTTP entry point
 * (http.ts) so both transports expose an identical tool surface.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "easyonward",
    version: SERVER_VERSION,
  });

  server.registerTool(
    "check_visa",
    {
      title: "Check visa & entry requirements",
      description:
        "Check whether a traveler holding a given passport needs a visa, and " +
        "what entry & transit requirements apply, for a destination country — " +
        "with official government sources. Accepts ISO 3166-1 alpha-2 codes " +
        '(e.g. "US", "KE") or common country names (e.g. "United States", ' +
        '"Kenya"). Returns a plain-language verdict, the specific requirements ' +
        "by severity, deduped official source links, and a deep link to the " +
        "full EasyOnward analysis. Read-only and PII-free; the analysis is " +
        "generic for any citizen of the passport country.",
      inputSchema: {
        passport_country: z
          .string()
          .describe(
            'The traveler\'s passport-issuing country. ISO 3166-1 alpha-2 code (e.g. "US") or country name (e.g. "United States").'
          ),
        destination_country: z
          .string()
          .describe(
            'The destination country. ISO 3166-1 alpha-2 code (e.g. "KE") or country name (e.g. "Kenya").'
          ),
      },
    },
    async ({ passport_country, destination_country }) => {
      const result = await checkVisa(passport_country, destination_country);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.text }],
          structuredContent: { ok: false, error: result.error },
          isError: true,
        };
      }

      const { text, ...structured } = result;
      return {
        content: [{ type: "text", text }],
        structuredContent: structured,
      };
    }
  );

  server.registerTool(
    "country_code",
    {
      title: "Resolve a country name to its ISO-2 code",
      description:
        "Resolve a country name (or an existing ISO 3166-1 alpha-2 code) to its " +
        'uppercase ISO 3166-1 alpha-2 code — e.g. "Kenya" → "KE". Useful before ' +
        "calling check_visa. Returns an error if the name can't be resolved.",
      inputSchema: {
        name: z
          .string()
          .describe('A country name or ISO-2 code, e.g. "Kenya" or "KE".'),
      },
    },
    async ({ name }) => {
      const code = resolveCountry(name);
      if (!code) {
        const msg =
          `Could not resolve "${name}" to a country code. ` +
          `Try a common country name (e.g. "Kenya") or an ISO 3166-1 ` +
          `alpha-2 code (e.g. "KE").`;
        return {
          content: [{ type: "text", text: msg }],
          structuredContent: { ok: false, error: msg },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: code }],
        structuredContent: { ok: true, name, code },
      };
    }
  );

  return server;
}
