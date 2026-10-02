// SPDX-License-Identifier: SUL-1.0
import { fail, pass, own, parsePageBytes } from "./model-family-discovery.mjs";
import { createModelFamilyMainPrelaunch } from "./model-family-main-prelaunch.mjs";

/** Structural parser only: neither the anchored grammar nor catalogue flags
 * qualify provider family, release, selectability or compatibility semantics. */
export function parseCodexRawCoverage(raw) {
  const entries = [], cursors = new Set(); let expected = null;
  for (let index = 0; index < raw.pages.length; index += 1) {
    const page = raw.pages[index], q = page.request;
    if (!own(q, ["id", "method", "params"]) || !Number.isSafeInteger(q.id) || q.id < 1 || q.method !== "model/list"
      || !q.params || Object.keys(q.params).some((k) => !["cursor", "limit", "includeHidden"].includes(k))
      || q.params.includeHidden !== true || q.params.limit !== 100 || (q.params.cursor ?? null) !== expected)
      return fail("CATALOGUE_REQUEST_CHAIN_INVALID");
    if (raw.pages.slice(0, index).some((x) => x.request.id === q.id)) return fail("CATALOGUE_REQUEST_ID_DUPLICATE");
    const parsed = parsePageBytes(page); if (!parsed.ok) return parsed;
    const message = parsed.value;
    if (!own(message, ["id", "result"]) || message.id !== q.id || !own(message.result, ["data", "nextCursor"])
      || !Array.isArray(message.result.data) || message.result.data.length > 100
      || !(message.result.nextCursor === null || typeof message.result.nextCursor === "string"
        && message.result.nextCursor.length > 0 && message.result.nextCursor.length <= 512)) return fail("CATALOGUE_PAGE_INVALID");
    for (const entry of message.result.data) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.id !== "string" || typeof entry.model !== "string"
        || typeof entry.hidden !== "boolean" || entry.supportedReasoningEfforts !== undefined
        && (!Array.isArray(entry.supportedReasoningEfforts) || entry.supportedReasoningEfforts.some((e) => !e
          || typeof e.reasoningEffort !== "string"))) return fail("CATALOGUE_ENTRY_INVALID");
      // Preserve unknown tokens and absent capability as unknown; do not effort-filter discovery.
      entries.push({ ...entry, rawPageIndex: index });
    }
    expected = message.result.nextCursor;
    if (expected === null && index !== raw.pages.length - 1) return fail("CATALOGUE_AFTER_TERMINAL");
    if (expected !== null) { if (cursors.has(expected)) return fail("CATALOGUE_CURSOR_LOOP"); cursors.add(expected); }
  }
  if (expected !== null) return fail("CATALOGUE_INCOMPLETE", true);
  return pass("CODEX_COVERAGE_STRUCTURAL", { entries, terminal: true, source: raw.source });
}

export function parseCodexNumericIdentity(modelId) {
  if (typeof modelId !== "string") return fail("FAMILY_COVERAGE_UNKNOWN");
  // Canonical structural shape only. The family token is not an assignment:
  // S2 host rule qualification must independently admit it before normalization.
  const m = /^gpt-((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,7})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/u.exec(modelId);
  if (!m || /(?:^|-)preview(?:-|$)/u.test(m[2])) return fail("FAMILY_COVERAGE_UNKNOWN");
  const version = m[1].split(".").map(Number);
  if (version.some((n) => !Number.isSafeInteger(n))) return fail("VERSION_UNORDERABLE");
  return pass("CODEX_IDENTITY_STRUCTURAL", { familyToken: m[2], version, authority: "none" });
}

export function createCodexFamilyAdapter(host, { mainLaunchPort } = {}) {
  const main = createModelFamilyMainPrelaunch({ runner: "codex", port: mainLaunchPort,
    renderConfiguration: ({ modelId, effort, packetBindingSha256 }) => ({
      schema: "codex.main-session-config.v1", operation: "configure-main-session",
      model: modelId, config: { model_reasoning_effort: effort }, packetBindingSha256 }) });
  return Object.freeze({ runner: "codex",
    captureRawDiscovery: (context) => host.captureRawDiscovery("codex", context),
    verifyCoverage: (raw, context, contract) => host.verifyCoverage("codex", raw, context, contract, parseCodexRawCoverage),
    normalizeReleases: (raw, contract, coverage) => host.normalizeReleases("codex", raw, contract, coverage),
    verifyCompatibility: (head, slot, context, contract) => host.verifyCompatibility("codex", head, slot, context, contract),
    renderExactLaunch: (selection, packet) => host.renderExactLaunch("codex", selection, packet,
      ({ modelId, effort, packet: binding }) => pass("EXACT_LAUNCH_RENDERED", { runner: "codex", operation: "thread/start",
        params: { model: modelId, config: { model_reasoning_effort: effort } }, invocationReceiptSha256: binding.invocationReceiptSha256 })),
    readActualExecutionIdentity: (raw, context) => host.readActualExecutionIdentity("codex", raw, context),
    launchMainFromDriverContext: main.launchFromDriverContext,
  });
}
