// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { parseClaudeRawCoverage, createClaudeFamilyAdapter } from "./model-family-claude-adapter.mjs";
const raw = (response, request = { operation: "reinitialize", sdkVersion: "0.3.220" }) => ({ source: "synthetic-fixture-only", pages: [{ request, responseBytes: JSON.stringify(response) }] });
completionCases.push({ id: "MFCLA" + String(completionCases.length + 1).padStart(3, "0"), name: "Claude fresh direct structural response preserves optional absence and unknown effort", run: () => {
  const r = parseClaudeRawCoverage(raw({ models: [{ value: "sonnet" }, { value: "fixture-alias", resolvedModel: "fixture-6.1", supportsEffort: true, supportedEffortLevels: ["future-effort"] }] }));
  assert.equal(r.ok, true); assert.equal(Object.hasOwn(r.value.entries[0], "resolvedModel"), false);
  assert.equal(Object.hasOwn(r.value.entries[0], "supportedEffortLevels"), false);
  assert.deepEqual(r.value.entries[1].supportedEffortLevels, ["future-effort"]);
  assert.equal(r.value.terminal, null); // Structure is never an account-completeness assertion.
} });
completionCases.push({ id: "MFCLA" + String(completionCases.length + 1).padStart(3, "0"), name: "Claude absent optional catalogue and one modelUsage alias never imply latest", run: () => {
  assert.equal(parseClaudeRawCoverage(raw({ modelUsage: { "fixture-6.1": {} } })).code, "CLAUDE_CATALOGUE_UNKNOWN");
  assert.equal(parseClaudeRawCoverage(raw({})).code, "CLAUDE_CATALOGUE_UNKNOWN");
  assert.equal(parseClaudeRawCoverage(raw({ models: [] }, { operation: "supportedModels", sdkVersion: "0.3.220" })).code, "CLAUDE_REFRESH_UNVERIFIED");
  assert.equal(parseClaudeRawCoverage(raw({ models: [{ value: "sonnet", supportedEffortLevels: false }] })).code, "CLAUDE_CATALOGUE_ENTRY_INVALID");
  const r = raw({ models: [] }); r.pages.push(r.pages[0]); assert.equal(parseClaudeRawCoverage(r).code, "CLAUDE_CATALOGUE_INCOMPLETE");
} });

completionCases.push({ id: "MFCLA" + String(completionCases.length + 1).padStart(3, "0"), name: "Claude main-session source port is distinct and absent defaults fail closed", run: async () => {
  const adapter = createClaudeFamilyAdapter({});
  assert.equal(typeof adapter.launchMainFromDriverContext, "function");
  assert.deepEqual(await adapter.launchMainFromDriverContext(Object.freeze(Object.create(null))),
    { ok: false, code: "MAIN_PRELAUNCH_UNQUALIFIED", retryable: false });
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
