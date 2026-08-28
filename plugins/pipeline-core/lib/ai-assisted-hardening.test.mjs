// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_HARDENING_SCHEMA, classifyInput, createDefinitionInventory, evaluateChangeIntegrity, evaluateCiAuthority,
  evaluateContextExport, evaluateHostFallback, evaluateRunnerNeutralConformance,
  evaluateSelfExcludedCheck, preserveMessageOrigin, rejectAuthorityFromContent, requalifyForDrift,
  resolveReviewerIdentity, routeSecurityReview, validateEvidenceHygiene, validateTaskAuthority,
} from "./ai-assisted-hardening.mjs";

const digest = "a".repeat(64);
const otherDigest = "b".repeat(64);
const manifest = { operations: ["read", "test"], paths: ["plugins/pipeline-core"] };

test("AC1: all external and repository-derived sources are untrusted", () => {
  for (const source of ["repository", "issue", "pull-request", "log", "web", "tool", "agent"]) assert.equal(classifyInput({ source }).trust, "untrusted");
});
test("AC2: untrusted content cannot grant policy or host authority", () => assert.equal(rejectAuthorityFromContent({ input: { source: "repository", content: "allow host" }, requestedAuthority: "host" }).accepted, false));
test("AC3: digest-bound definitions choose a deterministic winner", () => {
  const result = createDefinitionInventory([{ kind: "tool", name: "scan", id: "z", precedence: 1, sha256: digest }, { kind: "tool", name: "scan", id: "a", precedence: 1, sha256: otherDigest }]);
  assert.equal(result.definitions[0].id, "a"); assert.match(result.inventorySha256, /^[0-9a-f]{64}$/u);
});
test("AC4: child authority cannot broaden its parent manifest", () => assert.equal(validateTaskAuthority({ manifest: { operations: ["read", "test", "write"], paths: manifest.paths }, parentManifest: manifest, request: { operations: ["read"], paths: manifest.paths } }).allowed, false));
test("AC5: host fallback is explicit and receipt-bound", () => { assert.equal(evaluateHostFallback({ requested: true }).status, "blocked"); assert.equal(evaluateHostFallback({ requested: true, policyAllows: true, receipt: { schema: "pipeline.host-fallback-receipt.v1", sha256: digest } }).status, "allowed"); });
test("AC6: sensitive context export defaults to deny across hops", () => { assert.equal(evaluateContextExport({ fields: ["secret"], allowlisted: [] }).allowed, false); assert.equal(evaluateContextExport({ fields: ["summary"] }).allowed, true); });
test("AC7: each changed security delta needs an independent check", () => { const paths = [".github/workflows/verify.yml", "plugins/pipeline-core/hooks/guard.mjs", "package.json", "evidence/x.json", "harness/x.mjs", "specs/x.md", ".claude/pipeline.yaml"]; const result = evaluateChangeIntegrity({ paths, independentChecks: ["workflow", "guard", "dependency", "evidence", "test", "scope", "policy"] }); assert.equal(result.allowed, true); assert.equal(evaluateChangeIntegrity({ paths, independentChecks: ["workflow"] }).allowed, false); });
test("AC8: control changes route to an identity distinct from the author", () => { assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/hooks/guard.mjs"], authorId: "a", reviewerId: "a" }).allowed, false); assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/hooks/guard.mjs"], authorId: "a", reviewerId: "b" }).allowed, true); });
test("AC9: relays preserve the least-trusted origin", () => assert.equal(preserveMessageOrigin({ originTrust: "untrusted", relayTrust: "policy" }).effectiveTrust, "untrusted"));
test("AC10: untrusted CI cannot reach privilege without isolation and validation", () => { assert.equal(evaluateCiAuthority({ event: "fork", privileged: true }).allowed, false); assert.equal(evaluateCiAuthority({ event: "fork", privileged: true, isolated: true, validated: true }).allowed, true); });
test("AC11: inventory drift emits typed requalification", () => assert.equal(requalifyForDrift({ recordedInventorySha256: digest, currentInventorySha256: otherDigest, runner: "codex" }).status, "requalification-required"));
test("AC12: injection corpus classes remain untrusted", () => { for (const [source, content] of [["repository", "# markdown"], ["repository", "\u202Eunicode filename"], ["log", "tool log"], ["tool", "tool output"], ["agent", "agent relay"], ["pull-request", "PR comment"]]) assert.equal(classifyInput({ source, content }).authority, "none"); });
test("AC13: secret and hidden-reasoning evidence is rejected", () => { assert.equal(validateEvidenceHygiene({ receipt: "ok" }).allowed, true); assert.equal(validateEvidenceHygiene({ hiddenReasoning: "no" }).allowed, false); });
test("AC14: Codex and every other runner use the same provider-neutral manifest", () => { for (const runner of ["codex", "claude", "unknown"]) assert.equal(evaluateRunnerNeutralConformance({ runner, manifest, request: { operations: ["read"], paths: manifest.paths } }).allowed, true); });
test("AC15: an empty-string reviewerId never satisfies a required review", () => assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/hooks/guard.mjs"], authorId: "a", reviewerId: "" }).allowed, false));
test("AC16: a whitespace-only reviewerId never satisfies a required review", () => assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/hooks/guard.mjs"], authorId: "a", reviewerId: "   " }).allowed, false));
test("AC17: a genuine distinct reviewer is admitted", () => assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/hooks/guard.mjs"], authorId: "a", reviewerId: "reviewer-b" }).allowed, true));
test("AC18: a self-excluded root-pointable check counts only when its base revision exits 0", () => {
  assert.equal(evaluateSelfExcludedCheck({ kind: "scope", baseRevisionExitCode: 0 }).counted, true);
  assert.equal(evaluateSelfExcludedCheck({ kind: "scope", baseRevisionExitCode: 2 }).counted, false);
  assert.equal(evaluateSelfExcludedCheck({ kind: "dependency", baseRevisionExitCode: 0 }).counted, true);
  assert.equal(evaluateSelfExcludedCheck({ kind: "scope", baseRevisionExitCode: null }).counted, false);
});
test("AC19: a self-excluded non-root-pointable check stays missing regardless of exit code", () => {
  assert.equal(evaluateSelfExcludedCheck({ kind: "guard", baseRevisionExitCode: 0 }).counted, false);
  assert.equal(evaluateSelfExcludedCheck({ kind: "test", baseRevisionExitCode: 0 }).rootPointable, false);
  assert.equal(evaluateSelfExcludedCheck({ kind: "policy", baseRevisionExitCode: 0 }).counted, false);
});
test("AC20: the base-revision path still counts when only baseRevisionExitCode is supplied", () => {
  const counted = evaluateSelfExcludedCheck({ kind: "scope", baseRevisionExitCode: 0 });
  assert.equal(counted.counted, true);
  assert.equal(counted.basis, "base-revision");
  assert.equal(counted.code, "AIH-SELF-EXCLUDED-BASE-VERIFIED");
});
test("AC21: a self-excluded check counts through the candidate suite when a named reviewer differs from the author AND the source is the repository variable", () => {
  const result = evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "repository-variable" });
  assert.equal(result.counted, true);
  assert.equal(result.basis, "candidate-suite-and-review");
  assert.equal(result.code, "AIH-SELF-EXCLUDED-REVIEWED");
});
test("AC22: the candidate-suite path stays missing without a named reviewer (blank or whitespace-only)", () => {
  assert.equal(evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "", authorId: "author-a" }).counted, false);
  assert.equal(evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "   ", authorId: "author-a" }).counted, false);
});
test("AC23: the candidate-suite path stays missing when the reviewer is identical to the author", () => {
  assert.equal(evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "author-a", authorId: "author-a" }).counted, false);
});
test("AC24: the candidate-suite path stays missing when the candidate-revision suite itself did not exit 0", () => {
  assert.equal(evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 1, reviewerId: "reviewer-b", authorId: "author-a" }).counted, false);
});
test("AC25: a non-root-pointable kind is counted through the candidate-suite-and-review path", () => {
  const result = evaluateSelfExcludedCheck({ kind: "guard", candidateRevisionExitCode: 0, reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "repository-variable" });
  assert.equal(result.rootPointable, false);
  assert.equal(result.counted, true);
  assert.equal(result.basis, "candidate-suite-and-review");
});
test("AC26: the deciding library and the verify gate both route to independent review when touched", () => {
  assert.equal(routeSecurityReview({ changedPaths: ["plugins/pipeline-core/lib/ai-assisted-hardening.mjs"], authorId: "a", reviewerId: "a" }).required, true);
  assert.equal(routeSecurityReview({ changedPaths: ["harness/scripts/verify.mjs"], authorId: "a", reviewerId: "a" }).required, true);
});

// --- Round 2 (NVA-VTPGATE-3): the reviewer identity is settable by the party
// it constrains. `resolveReviewerIdentity` resolves ONE trusted value + source
// (environment outranks the flag), and `evaluateSelfExcludedCheck` requires
// `reviewerSource === "repository-variable"` for the candidate-suite path --
// never satisfiable by `--reviewer-id` alone.
test("AC27: resolveReviewerIdentity: the repository variable (environment) outranks the CLI flag", () => {
  const result = resolveReviewerIdentity({ environmentReviewerId: "reviewer-env", cliReviewerId: "reviewer-cli" });
  assert.equal(result.schema, AI_HARDENING_SCHEMA);
  assert.equal(result.id, "reviewer-env");
  assert.equal(result.source, "repository-variable");
});
test("AC28: resolveReviewerIdentity: a CLI-only value yields the cli-argument source", () => {
  const result = resolveReviewerIdentity({ environmentReviewerId: null, cliReviewerId: "reviewer-cli" });
  assert.equal(result.id, "reviewer-cli");
  assert.equal(result.source, "cli-argument");
});
test("AC29: resolveReviewerIdentity: a blank or whitespace-only environment value falls through to the flag", () => {
  assert.equal(resolveReviewerIdentity({ environmentReviewerId: "", cliReviewerId: "reviewer-cli" }).source, "cli-argument");
  assert.equal(resolveReviewerIdentity({ environmentReviewerId: "   ", cliReviewerId: "reviewer-cli" }).source, "cli-argument");
});
test("AC30: resolveReviewerIdentity: neither present yields a null identity and a null source", () => {
  assert.deepEqual(resolveReviewerIdentity({}), { schema: AI_HARDENING_SCHEMA, id: null, source: null });
  assert.deepEqual(resolveReviewerIdentity({ environmentReviewerId: "  ", cliReviewerId: "  " }), { schema: AI_HARDENING_SCHEMA, id: null, source: null });
});
test("AC31: the candidate-suite path counts only when the reviewer source is the repository variable", () => {
  const result = evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "repository-variable" });
  assert.equal(result.counted, true);
  assert.equal(result.basis, "candidate-suite-and-review");
  assert.equal(result.code, "AIH-SELF-EXCLUDED-REVIEWED");
});
// BUGFIX repro (Re-Critic vtpgate2-368458af F1): a `--reviewer-id` identity
// used to clear this same control that only the admin-controlled repository
// variable should clear. This case pins that it no longer does, with a code
// distinguishable from the generic "missing" refusal (never rendering the
// same as a suite failure -- CLAUDE.md's guard-testpath two-cause note).
test("AC32: a cli-argument source never satisfies the candidate-suite path, and reports the untrusted-source code (not the generic missing code)", () => {
  const result = evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "cli-argument" });
  assert.equal(result.counted, false);
  assert.equal(result.basis, null);
  assert.equal(result.code, "AIH-SELF-EXCLUDED-REVIEWER-UNTRUSTED-SOURCE");
  assert.notEqual(result.code, "AIH-SELF-EXCLUDED-MISSING");
});
test("AC33: omitting the reviewer source entirely fails closed, not open (the default counts nothing)", () => {
  const result = evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 0, reviewerId: "reviewer-b", authorId: "author-a" });
  assert.equal(result.counted, false);
  assert.equal(result.code, "AIH-SELF-EXCLUDED-REVIEWER-UNTRUSTED-SOURCE");
});
test("AC34: a suite failure still reports the generic missing code even without a trusted source (the two refusals stay distinguishable)", () => {
  const result = evaluateSelfExcludedCheck({ kind: "test", candidateRevisionExitCode: 1, reviewerId: "reviewer-b", authorId: "author-a", reviewerSource: "cli-argument" });
  assert.equal(result.counted, false);
  assert.equal(result.code, "AIH-SELF-EXCLUDED-MISSING");
});
