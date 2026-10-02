// SPDX-License-Identifier: SUL-1.0
import { fail, pass, own, parsePageBytes } from "./model-family-discovery.mjs";
import { createModelFamilyMainPrelaunch } from "./model-family-main-prelaunch.mjs";

/** A deployed SDK's fresh direct response is a candidate structural source.
 * A single modelUsage observation cannot establish newest family coverage. */
export function parseClaudeRawCoverage(raw) {
  if (raw.pages.length !== 1) return fail("CLAUDE_CATALOGUE_INCOMPLETE");
  const page = raw.pages[0];
  if (!own(page.request, ["operation", "sdkVersion"]) || page.request.operation !== "reinitialize"
    || typeof page.request.sdkVersion !== "string" || !/^\d+\.\d+\.\d+$/u.test(page.request.sdkVersion))
    return fail("CLAUDE_REFRESH_UNVERIFIED");
  const parsed = parsePageBytes(page); if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value !== "object" || !Array.isArray(parsed.value.models))
    return fail("CLAUDE_CATALOGUE_UNKNOWN");
  if (parsed.value.models.length > 2048) return fail("DISCOVERY_BOUNDS");
  const entries = [];
  for (const entry of parsed.value.models) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.value !== "string"
      || entry.resolvedModel !== undefined && typeof entry.resolvedModel !== "string"
      || entry.supportsEffort !== undefined && typeof entry.supportsEffort !== "boolean"
      || entry.supportedEffortLevels !== undefined && (!Array.isArray(entry.supportedEffortLevels)
        || entry.supportedEffortLevels.some((x) => typeof x !== "string"))) return fail("CLAUDE_CATALOGUE_ENTRY_INVALID");
    entries.push({ ...entry, rawPageIndex: 0 });
  }
  return pass("CLAUDE_COVERAGE_STRUCTURAL", { entries, terminal: null, source: raw.source,
    deployedSdkVersion: page.request.sdkVersion });
}

export function createClaudeFamilyAdapter(host, { mainLaunchPort } = {}) {
  const main = createModelFamilyMainPrelaunch({ runner: "claude", port: mainLaunchPort,
    renderConfiguration: ({ modelId, effort, packetBindingSha256 }) => ({
      schema: "claude.main-session-config.v1", operation: "configure-main-session",
      argv: ["--model", modelId, "--effort", effort], packetBindingSha256 }) });
  return Object.freeze({ runner: "claude",
    captureRawDiscovery: (context) => host.captureRawDiscovery("claude", context),
    verifyCoverage: (raw, context, contract) => host.verifyCoverage("claude", raw, context, contract, parseClaudeRawCoverage),
    normalizeReleases: (raw, contract, coverage) => host.normalizeReleases("claude", raw, contract, coverage),
    verifyCompatibility: (head, slot, context, contract) => host.verifyCompatibility("claude", head, slot, context, contract),
    renderExactLaunch: (selection, packet) => host.renderExactLaunch("claude", selection, packet,
      ({ modelId, effort, packet: binding }) => pass("EXACT_LAUNCH_RENDERED", { runner: "claude",
        argv: ["--model", modelId, "--effort", effort], invocationReceiptSha256: binding.invocationReceiptSha256 })),
    readActualExecutionIdentity: (raw, context) => host.readActualExecutionIdentity("claude", raw, context),
    launchMainFromDriverContext: main.launchFromDriverContext,
  });
}
