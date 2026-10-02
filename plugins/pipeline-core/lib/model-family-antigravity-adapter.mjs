// SPDX-License-Identifier: SUL-1.0
import { fail, pass, own } from "./model-family-discovery.mjs";
import { createModelFamilyMainPrelaunch } from "./model-family-main-prelaunch.mjs";

/** Two displayed columns establish observed IDs only. They supply no completeness,
 * ordering, release grouping or effort semantics; no Argon inference exists. */
export function parseAntigravityRawCoverage(raw) {
  if (raw.pages.length !== 1 || !own(raw.pages[0].request, ["argv"])
    || JSON.stringify(raw.pages[0].request.argv) !== '["models"]') return fail("AGY_CATALOGUE_SOURCE_INVALID");
  const entries = [];
  for (const line of raw.pages[0].responseBytes.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\s+(.+)$/u.exec(line.trim());
    if (!match) return fail("AGY_CATALOGUE_SHAPE_UNKNOWN");
    entries.push({ modelId: match[1], displayName: match[2], rawPageIndex: 0, rawLine: line });
  }
  if (!entries.length || entries.length > 2048) return fail("AGY_CATALOGUE_SHAPE_UNKNOWN");
  return pass("AGY_IDS_STRUCTURAL", { entries, terminal: null, source: raw.source,
    completeness: "unknown", order: "unknown", effort: "unknown" });
}

export function createAntigravityFamilyAdapter(host, { mainLaunchPort } = {}) {
  const main = createModelFamilyMainPrelaunch({ runner: "antigravity", port: mainLaunchPort,
    renderConfiguration: ({ modelId, effort, packetBindingSha256 }) => ({
      schema: "antigravity.main-session-config.v1", operation: "configure-profile-main",
      modelSelector: { id: modelId, reasoning: effort }, packetBindingSha256 }) });
  return Object.freeze({ runner: "antigravity",
    captureRawDiscovery: (context) => host.captureRawDiscovery("antigravity", context),
    verifyCoverage: (raw, context, contract) => host.verifyCoverage("antigravity", raw, context, contract, parseAntigravityRawCoverage),
    normalizeReleases: (raw, contract, coverage) => host.normalizeReleases("antigravity", raw, contract, coverage),
    verifyCompatibility: (head, slot, context, contract) => host.verifyCompatibility("antigravity", head, slot, context, contract),
    renderExactLaunch: (selection, packet) => host.renderExactLaunch("antigravity", selection, packet,
      ({ modelId, effort, packet: binding }) => pass("EXACT_LAUNCH_RENDERED", { runner: "antigravity",
        argv: ["--model", modelId, "--effort", effort], invocationReceiptSha256: binding.invocationReceiptSha256 })),
    readActualExecutionIdentity: (raw, context) => host.readActualExecutionIdentity("antigravity", raw, context),
    launchMainFromDriverContext: main.launchFromDriverContext,
  });
}
