import { test } from "node:test";
import assert from "node:assert/strict";
import { formatVisaPair, checkVisa } from "../src/visa.js";
import { resolveCountry } from "../src/countries.js";

function makeResponse(reasons: any[]) {
  return {
    origin_country: "US",
    origin_country_name: "United States",
    destination_country: "KE",
    destination_country_name: "Kenya",
    result: { reasons },
  };
}

// --- verdict logic -------------------------------------------------------

test("BLOCK reason yields a restricted verdict", () => {
  const out = formatVisaPair(
    makeResponse([
      { title: "Entry ban", detail: "Banned.", severity: "BLOCK" },
      { title: "Note", detail: "info", severity: "INFO" },
    ]),
    "US",
    "KE"
  );
  assert.equal(out.worst_severity, "BLOCK");
  assert.match(out.verdict, /restricted — see blockers/);
});

test("WARN (no BLOCK) yields a conditional verdict", () => {
  const out = formatVisaPair(
    makeResponse([
      { title: "eTA required", detail: "Get an eTA.", severity: "WARN" },
      { title: "Note", detail: "info", severity: "INFO" },
    ]),
    "US",
    "KE"
  );
  assert.equal(out.worst_severity, "WARN");
  assert.match(out.verdict, /conditional — see requirements/);
});

test("only INFO reasons yield a straightforward verdict", () => {
  const out = formatVisaPair(
    makeResponse([{ title: "Weather", detail: "mild", severity: "INFO" }]),
    "US",
    "KE"
  );
  assert.equal(out.worst_severity, "INFO");
  assert.match(out.verdict, /straightforward/);
});

test("no reasons yields a straightforward verdict", () => {
  const out = formatVisaPair(makeResponse([]), "US", "KE");
  assert.equal(out.worst_severity, "NONE");
  assert.match(out.verdict, /straightforward/);
});

// --- deep link -----------------------------------------------------------

test("deep link uses uppercase ISO-2 ORIGIN-DEST", () => {
  const out = formatVisaPair(makeResponse([]), "us", "ke");
  assert.equal(out.deep_link, "https://easyonward.com/visa/US-KE");
});

test("prepare link is the deep link tagged ?ref=mcp (attribution)", () => {
  const out = formatVisaPair(makeResponse([]), "us", "ke");
  assert.equal(out.prepare_link, "https://easyonward.com/visa/US-KE?ref=mcp");
  // It is surfaced in the human-readable text, with neutral compare language.
  assert.ok(out.text.includes("?ref=mcp"));
  assert.ok(/compare visa services/i.test(out.text));
});

// --- source dedupe -------------------------------------------------------

test("official sources are deduped, order-preserving", () => {
  const out = formatVisaPair(
    makeResponse([
      {
        title: "A",
        detail: "a",
        severity: "WARN",
        source_urls: ["https://x.gov", "https://y.gov"],
      },
      {
        title: "B",
        detail: "b",
        severity: "INFO",
        source_urls: ["https://x.gov", "https://z.gov"],
      },
    ]),
    "US",
    "KE"
  );
  assert.deepEqual(out.official_sources, [
    "https://x.gov",
    "https://y.gov",
    "https://z.gov",
  ]);
});

// --- requirements formatting + official-source framing -------------------

test("requirements render as [SEVERITY] title — detail and cite official government sources", () => {
  const out = formatVisaPair(
    makeResponse([
      {
        title: "eTA required",
        detail: "Apply online.",
        severity: "WARN",
        source_urls: ["https://www.etakenya.go.ke"],
      },
    ]),
    "US",
    "KE"
  );
  assert.match(out.text, /\[WARN\] eTA required — Apply online\./);
  // Public copy cites official government sources only; never internal
  // verification tooling. Asserting the positive framing is the guardrail.
  assert.match(out.text, /official government sources/i);
});

test("text includes the disclaimer and deep link", () => {
  const out = formatVisaPair(makeResponse([]), "US", "KE");
  assert.match(out.text, /Not legal or immigration advice/);
  assert.match(out.text, /https:\/\/easyonward\.com\/visa\/US-KE/);
});

// --- country resolution --------------------------------------------------

test("resolveCountry maps names and codes", () => {
  assert.equal(resolveCountry("United States"), "US");
  assert.equal(resolveCountry("kenya"), "KE");
  assert.equal(resolveCountry("us"), "US");
  assert.equal(resolveCountry("UK"), "GB");
  assert.equal(resolveCountry("not a country!!"), null);
});

// --- checkVisa with mocked fetch -----------------------------------------

function mockFetch(status: number, body?: any): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response)) as unknown as typeof fetch;
}

test("checkVisa resolves a name input and formats success", async () => {
  const res = await checkVisa(
    "United States",
    "Kenya",
    mockFetch(
      200,
      makeResponse([
        { title: "eTA required", detail: "Apply.", severity: "WARN" },
      ])
    )
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.worst_severity, "WARN");
    assert.equal(res.deep_link, "https://easyonward.com/visa/US-KE");
  }
});

test("checkVisa returns a graceful error on 404", async () => {
  const res = await checkVisa("US", "ZZ", mockFetch(404));
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /No catalogued requirements/);
    assert.doesNotMatch(res.error, /undefined/);
  }
});

test("checkVisa returns a graceful error on unresolvable input", async () => {
  const res = await checkVisa("Narnia", "Kenya", mockFetch(200));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /Could not resolve/);
});

test("checkVisa returns a graceful error on network failure", async () => {
  const failing = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const res = await checkVisa("US", "KE", failing);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /Could not reach/);
});
