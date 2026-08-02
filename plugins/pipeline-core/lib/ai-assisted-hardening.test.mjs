// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInput, createDefinitionInventory, evaluateChangeIntegrity, evaluateCiAuthority,
  evaluateContextExport, evaluateHostFallback, evaluateRunnerNeutralConformance,
  preserveMessageOrigin, rejectAuthorityFromContent, requalifyForDrift, routeSecurityReview,
  validateEvidenceHygiene, validateTaskAuthority,
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
