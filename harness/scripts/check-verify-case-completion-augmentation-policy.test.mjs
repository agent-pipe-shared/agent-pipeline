#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
import { verifyCaseCompletionPolicySha256 } from "../../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs";
import { checkVerifyCaseCompletion, DEFAULT_SCHEMA } from "./check-verify-case-completion.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const POLICY_SCHEMA = "pipeline.verify-case-completion-policy.v1";
const VERIFY = "harness/scripts/verify.mjs";
const AUGMENTATIONS = "harness/config/verify-case-completion-augmentations.v1.json";
const SUITE = "plugins/pipeline-core/lib/slice-queue.test.mjs";
const CASES = [];
const policy = (caseIds = ["SQ01", "SQ02"], maxBytes = 65536) => ({ schema: POLICY_SCHEMA, caseIds, maxBytes });
const literal = (previous) => `{ schema: "${POLICY_SCHEMA}", caseIds: ${JSON.stringify(previous.caseIds)}, maxBytes: ${previous.maxBytes} }`;
function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function fixture(policySource) {
  const scratch = join(ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "verify-builtin-policy-"));
  write(root, VERIFY, `
const TEST_SUITES = [
  { name: "slice-queue-tests", file: join(libDir, "slice-queue.test.mjs")${policySource === null ? "" : `, caseCompletion: ${policySource}`} },
];
const SCOPED_VERIFY_SUITES = Object.freeze([
]);
const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
]);
`);
  write(root, DEFAULT_SCHEMA, readFileSync(join(ROOT, DEFAULT_SCHEMA)));
  write(root, "harness/config/verify-case-completion.v1.json", JSON.stringify({ schema: "pipeline.verify-case-completion-registry.v1", entries: [
    { name: "slice-queue-tests", path: SUITE, disposition: "required" },
  ] }));
  write(root, SUITE, `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
registerTestCaseCompletion({ cases: [], fd: 3, maxBytes: 65536 });
`);
  return root;
}
function augment(root, previous, next, digest = undefined) {
  write(root, AUGMENTATIONS, JSON.stringify({ schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
    { name: "slice-queue-tests", file: SUITE, ...(previous === null ? {} : { previousPolicySha256: digest ?? verifyCaseCompletionPolicySha256(previous) }), caseCompletion: next },
  ] }));
}
function withFixture(policySource, run) {
  const root = fixture(policySource);
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function accepted(root) {
  const result = checkVerifyCaseCompletion({ root });
  assert.equal(result.ok, true, result.findings.join("\n"));
  assert.equal(result.registeredCount, 1);
  assert.equal(result.registryCount, 1);
}
function rejected(root, code) {
  const result = checkVerifyCaseCompletion({ root });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.includes(code)), result.findings.join("\n"));
}
function check(id, name, run) { CASES.push({ id, name, run }); }

check("BCP01", "literal builtin policy survives exact digest-bound extension without rewriting the preimage", () => {
  const previous = policy();
  withFixture(literal(previous), (root) => {
    const before = readFileSync(join(root, VERIFY));
    augment(root, previous, policy(["SQ01", "SQ02", "SQ03"]));
    accepted(root);
    assert.deepEqual(readFileSync(join(root, VERIFY)), before);
  });
});
check("BCP02", "the real SQ01 through SQ34 generator preserves every ID and underscore byte budget", () => {
  const previous = policy(Array.from({ length: 34 }, (_, index) => `SQ${String(index + 1).padStart(2, "0")}`));
  const source = '{ schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 34 }, (_, index) => `SQ${String(index + 1).padStart(2, "0")}`), maxBytes: 65_536 }';
  withFixture(source, (root) => {
    augment(root, previous, policy([...previous.caseIds, "SQ35", "SQ36", "SQ37"]));
    accepted(root);
  });
});
check("BCP03", "wrong hashes and exact-prior budget or ID drift remain denied", () => {
  const previous = policy();
  for (const digest of ["0".repeat(64), verifyCaseCompletionPolicySha256(policy(previous.caseIds, 66048)), verifyCaseCompletionPolicySha256(policy(["SQ01"]))]) {
    withFixture(literal(previous), (root) => {
      augment(root, previous, policy([...previous.caseIds, "SQ03"]), digest);
      rejected(root, "VERIFY-AUGMENTATION AUG-PREIMAGE");
    });
  }
});
check("BCP04", "shrinking, replacement, equal case sets and budget reductions remain non-monotone", () => {
  const previous = policy();
  for (const next of [policy(["SQ01"]), policy(["SQ01", "SQ03", "SQ04"]), previous, policy(["SQ01", "SQ02", "SQ03"], 65024)]) {
    withFixture(literal(previous), (root) => {
      augment(root, previous, next);
      rejected(root, "VERIFY-AUGMENTATION AUG-NON-MONOTONE");
    });
  }
});
check("BCP05", "boolean and invalid present policies cannot be treated as absent or a bindable baseline", () => {
  const previous = policy();
  for (const source of ["true", "null", "{ ...runtimePolicy }", literal(previous).replace('maxBytes: 65536', 'maxBytes: 0')]) {
    withFixture(source, (root) => {
      augment(root, previous, policy([...previous.caseIds, "SQ03"]));
      rejected(root, "VERIFY-AUGMENTATION AUG-PREIMAGE");
      augment(root, null, policy([...previous.caseIds, "SQ03"]));
      rejected(root, "VERIFY-AUGMENTATION AUG-CONFLICT");
    });
  }
});
check("BCP06", "static parsing never executes unsupported generator callbacks or arbitrary expressions", () => {
  const previous = policy();
  globalThis.BCP_UNSAFE_EXECUTED = false;
  const source = '{ schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 2 }, (_, index) => (globalThis.BCP_UNSAFE_EXECUTED = true, `SQ${index}`)), maxBytes: 65536 }';
  withFixture(source, (root) => {
    augment(root, previous, policy([...previous.caseIds, "SQ03"]));
    rejected(root, "VERIFY-POLICY");
    assert.equal(globalThis.BCP_UNSAFE_EXECUTED, false);
  });
  delete globalThis.BCP_UNSAFE_EXECUTED;
});
check("BCP07", "existing valid policies and supplementary policy for genuinely absent registrations retain admission", () => {
  withFixture(literal(policy()), accepted);
  withFixture(null, (root) => {
    augment(root, null, policy());
    accepted(root);
  });
});
check("BCP08", "duplicate or unordered IDs and unbounded generators stay closed before allocation", () => {
  for (const source of [
    literal(policy(["SQ01", "SQ01"])),
    literal(policy(["SQ02", "SQ01"])),
    literal(policy()).replace('["SQ01","SQ02"]', '["SQ01" "SQ02"]'),
    literal(policy()).replace('maxBytes: 65536', 'maxBytes: 65__536'),
    '{ schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 9999999999 }, (_, index) => `SQ${String(index + 1).padStart(2, "0")}`), maxBytes: 65536 }',
    '{ schema: "pipeline.verify-case-completion-policy.v1", caseIds: Array.from({ length: 2 }, (_, index) => `SQ${String(index + 1).padStart(9999999999, "0")}`), maxBytes: 65536 }',
  ]) {
    withFixture(source, (root) => rejected(root, "VERIFY-POLICY"));
  }
});

assert.equal(CASES.length, 8);
const completionFd = Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? "3");
registerTestCaseCompletion({
  cases: CASES,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "8192"),
});
