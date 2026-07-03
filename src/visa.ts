import { resolveCountry } from "./countries.js";

export const DEFAULT_API_BASE = "https://easyonward.com/api/v1";

export function apiBase(): string {
  const base = process.env.EASYONWARD_API_BASE?.trim() || DEFAULT_API_BASE;
  return base.replace(/\/+$/, "");
}

export interface Reason {
  title: string;
  detail: string;
  severity: string;
  source_urls?: string[];
}

export interface VisaPairResponse {
  origin_country: string;
  origin_country_name?: string;
  destination_country: string;
  destination_country_name?: string;
  result?: { reasons?: Reason[] };
}

export type CheckVisaSuccess = {
  ok: true;
  passport_country: string;
  passport_country_name: string;
  destination_country: string;
  destination_country_name: string;
  verdict: string;
  worst_severity: "BLOCK" | "WARN" | "INFO" | "NONE";
  requirements: Array<{
    severity: string;
    title: string;
    detail: string;
  }>;
  official_sources: string[];
  deep_link: string;
  // Attributed link to the EasyOnward page that compares visa services, travel
  // insurance, and eSIM options alongside the official/free path (#894). The
  // ?ref=mcp tag makes MCP-sourced traffic attributable. Affiliate revenue
  // flows from that page — never from biasing the verdict above.
  prepare_link: string;
  disclaimer: string;
  text: string;
};

export type CheckVisaError = {
  ok: false;
  error: string;
  text: string;
};

export type CheckVisaResult = CheckVisaSuccess | CheckVisaError;

const SEVERITY_RANK: Record<string, number> = { BLOCK: 3, WARN: 2, INFO: 1 };

function worstSeverity(reasons: Reason[]): "BLOCK" | "WARN" | "INFO" | "NONE" {
  let worst = 0;
  for (const r of reasons) {
    const rank = SEVERITY_RANK[(r.severity || "").toUpperCase()] ?? 0;
    if (rank > worst) worst = rank;
  }
  if (worst === 3) return "BLOCK";
  if (worst === 2) return "WARN";
  if (worst === 1) return "INFO";
  return "NONE";
}

function buildVerdict(
  origin: string,
  destination: string,
  worst: "BLOCK" | "WARN" | "INFO" | "NONE"
): string {
  if (worst === "BLOCK") {
    return `Travel from ${origin} to ${destination} is restricted — see blockers.`;
  }
  if (worst === "WARN") {
    return `Travel from ${origin} to ${destination} is conditional — see requirements.`;
  }
  return `Travel from ${origin} to ${destination} is straightforward.`;
}

/**
 * Format the structured result into a human-readable block. Public-facing copy:
 * sources are "official government sources" — never name the internal
 * verification tooling.
 */
function buildText(s: Omit<CheckVisaSuccess, "text">): string {
  const lines: string[] = [];
  lines.push(s.verdict);
  lines.push("");

  if (s.requirements.length > 0) {
    lines.push("Requirements:");
    for (const req of s.requirements) {
      lines.push(`  [${req.severity}] ${req.title} — ${req.detail}`);
    }
  } else {
    lines.push(
      "No specific entry or transit requirements were flagged for this pair."
    );
  }
  lines.push("");

  if (s.official_sources.length > 0) {
    lines.push("Official government sources:");
    for (const url of s.official_sources) {
      lines.push(`  - ${url}`);
    }
    lines.push("");
  }

  lines.push(`Full details: ${s.deep_link}`);
  lines.push(
    `Compare visa services, travel insurance & eSIM options: ${s.prepare_link}`
  );
  lines.push("");
  lines.push(s.disclaimer);

  return lines.join("\n");
}

/**
 * Transform a raw visa-pair API payload into the structured + textual result.
 * Pure function — no network — so it is unit-testable.
 */
export function formatVisaPair(
  data: VisaPairResponse,
  passportCode: string,
  destCode: string
): CheckVisaSuccess {
  const originCode = (data.origin_country || passportCode).toUpperCase();
  const destinationCode = (data.destination_country || destCode).toUpperCase();
  const originName = data.origin_country_name || originCode;
  const destinationName = data.destination_country_name || destinationCode;

  const reasons = data.result?.reasons ?? [];
  const worst = worstSeverity(reasons);
  const verdict = buildVerdict(originName, destinationName, worst);

  const requirements = reasons.map((r) => ({
    severity: (r.severity || "INFO").toUpperCase(),
    title: r.title,
    detail: r.detail,
  }));

  // Dedupe source URLs, preserving first-seen order.
  const seen = new Set<string>();
  const official_sources: string[] = [];
  for (const r of reasons) {
    for (const url of r.source_urls ?? []) {
      if (url && !seen.has(url)) {
        seen.add(url);
        official_sources.push(url);
      }
    }
  }

  const deep_link = `https://easyonward.com/visa/${originCode}-${destinationCode}`;
  const prepare_link = `${deep_link}?ref=mcp`;
  const disclaimer = `Generic analysis for any ${originName} citizen. Not legal or immigration advice — verify with your airline and the destination's authorities before travel.`;

  const base = {
    ok: true as const,
    passport_country: originCode,
    passport_country_name: originName,
    destination_country: destinationCode,
    destination_country_name: destinationName,
    verdict,
    worst_severity: worst,
    requirements,
    official_sources,
    deep_link,
    prepare_link,
    disclaimer,
  };

  return { ...base, text: buildText(base) };
}

/**
 * Resolve inputs, call the visa-pair endpoint, and return a formatted result.
 * Never throws — all failure modes are returned as a CheckVisaError.
 */
export async function checkVisa(
  passportInput: string,
  destinationInput: string,
  fetchImpl: typeof fetch = fetch
): Promise<CheckVisaResult> {
  const passportCode = resolveCountry(passportInput);
  const destCode = resolveCountry(destinationInput);

  const unresolved: string[] = [];
  if (!passportCode) unresolved.push(`passport_country="${passportInput}"`);
  if (!destCode) unresolved.push(`destination_country="${destinationInput}"`);

  if (unresolved.length > 0) {
    const msg =
      `Could not resolve ${unresolved.join(" and ")}. ` +
      `Use an ISO 3166-1 alpha-2 country code (e.g. "US", "KE", "GB") ` +
      `or a common country name (e.g. "United States", "Kenya").`;
    return { ok: false, error: msg, text: msg };
  }

  // Both resolved (the early return above guarantees it); narrow for TS.
  const origin = passportCode as string;
  const dest = destCode as string;
  const url = `${apiBase()}/programmatic/visa-pair/${origin}/${dest}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const msg =
      `Could not reach the EasyOnward service to check ` +
      `${origin} → ${dest}. Please try again shortly. ` +
      `(network error: ${err instanceof Error ? err.message : String(err)})`;
    return { ok: false, error: msg, text: msg };
  }

  if (res.status === 404) {
    const msg =
      `No catalogued requirements for ${origin} → ${dest} yet. ` +
      `This country pair may not be covered, or a code may be invalid. ` +
      `Try ISO 3166-1 alpha-2 codes like "US-KE" (United States passport → Kenya).`;
    return { ok: false, error: msg, text: msg };
  }

  if (!res.ok) {
    const msg =
      `The EasyOnward service returned an unexpected status (${res.status}) ` +
      `for ${origin} → ${dest}. Please try again shortly.`;
    return { ok: false, error: msg, text: msg };
  }

  let data: VisaPairResponse;
  try {
    data = (await res.json()) as VisaPairResponse;
  } catch (err) {
    const msg =
      `Received an unreadable response for ${origin} → ${dest}. ` +
      `Please try again shortly.`;
    return { ok: false, error: msg, text: msg };
  }

  return formatVisaPair(data, origin, dest);
}
