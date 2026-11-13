// SPDX-License-Identifier: SUL-1.0
// ADR-0097 (D249, K-28): the maintenance delivery's binding, scope, red observation and red-before proofs on real git histories.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIGURED_VERIFY_CHECK, MAINTENANCE_ACK_LABEL, MAINTENANCE_BINDING_SCHEMA, maintenanceCheckSpelling, parseMaintenanceCheckSpelling,MAINTENANCE_RED_ACKNOWLEDGEMENT_KIND, buildMaintenanceAcknowledgementSubject,
  describeMaintenanceCheck, maintenanceAcknowledgement, maintenanceCheckSha256, maintenanceChecksDigest, maintenanceReceiptSuite, maintenanceRedProof,
  maintenanceScopeRefusal, planApprovalCommit, preApprovalRedReceipt, readMaintenanceRedObservation, validMaintenanceBinding,
  writeMaintenanceRedObservation, greenAfterDeliveryReceipt, maintenanceSlicesLackingGreenVerify } from "./maintenance-delivery.mjs";
import { CRITICAL_ACTION_KINDS } from "./critical-action-approval-request.mjs";
import { sealVerifySuiteReceipt } from "./verify-resume.mjs";

const roots = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const sha = (text) => createHash("sha256").update(text).digest("hex");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "mdl-"));
  roots.push(dir);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  const put = (path, text) => { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = (message, paths) => { git("add", "--all", "--", ...paths); git("commit", "-q", "--no-verify", "-m", message); return git("rev-parse", "HEAD"); };
  const head = () => ({ commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") });
  return { dir, git, put, commit, head, common: join(dir, ".git") };
}

const commandCheck = { id: "docs", path: "project/pipeline.json", command: "docs", dependencies: ["project/pipeline.json", "tests/unit/docs.test.mjs"] };
const configuredCheck = { id: "verify", path: "project/pipeline.json", verify: "configured", dependencies: ["project/pipeline.json", "tests/unit/docs.test.ts"] };

function receipt(r, { suite, commit, tree, exitCode, runId }) {
  const sealed = sealVerifySuiteReceipt({ runId, candidate: { commit, tree }, suite, implementationSha256: sha("impl"),
    inputs: { files: [{ path: "package.json", fileSha256: sha("pkg") }], nonFiles: [{ kind: "command", path: null, sha256: sha("cmd") }] },
    environmentContractSha256: sha("env"), policySha256: sha("policy"), status: "completed", exitCode,
    log: { path: `logs/${sha(suite)}.log`, fileSha256: sha("log"), byteLength: 3, truncated: false },
    caseCompletion: null, startedAt: "2026-11-13T10:00:00.000Z", completedAt: "2026-11-13T10:01:00.000Z" });
  const dir = join(r.common, "agent-pipeline", "verify", "runs", runId, "receipts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sha(suite)}.json`), `${JSON.stringify(sealed)}\n`);
  return sealed;
}

test("the kind is a critical action, the binding is closed and the receipt suite follows the check form", () => {
  assert.ok(CRITICAL_ACTION_KINDS.includes(MAINTENANCE_RED_ACKNOWLEDGEMENT_KIND));
  assert.equal(validMaintenanceBinding({ schema: MAINTENANCE_BINDING_SCHEMA }), true);
  for (const bad of [null, {}, { schema: "other" }, { schema: MAINTENANCE_BINDING_SCHEMA, proof: "x" }]) assert.equal(validMaintenanceBinding(bad), false, JSON.stringify(bad));
  assert.equal(maintenanceReceiptSuite(commandCheck), "project-docs");
  assert.equal(maintenanceReceiptSuite(configuredCheck), "configured-verify");
  assert.equal(maintenanceReceiptSuite({ id: "t", path: "tests/a.test.mjs", dependencies: ["tests/a.test.mjs"] }), null);
  assert.equal(describeMaintenanceCheck(configuredCheck), "the configured verify command");
  // The identity is what runs: the dispatch id and the dependency list of a later binding never change it, so a check observed red
  // before any binding exists is the same check the binding names. Another command, form or test file is another check.
  assert.equal(maintenanceCheckSha256(commandCheck), maintenanceCheckSha256({ ...commandCheck, id: "other", dependencies: [...commandCheck.dependencies, "tests/x.test.mjs"] }));
  assert.equal(maintenanceCheckSha256(commandCheck), maintenanceCheckSha256({ command: "docs" }));
  assert.notEqual(maintenanceCheckSha256(commandCheck), maintenanceCheckSha256({ ...commandCheck, command: "lint" }));
  assert.notEqual(maintenanceCheckSha256(commandCheck), maintenanceCheckSha256(configuredCheck));
  assert.notEqual(maintenanceCheckSha256({ path: "tests/a.test.mjs" }), maintenanceCheckSha256({ path: "tests/b.test.mjs" }));
  for (const notMaintenance of [{ id: "d", path: "docs/a.md", document: "docs/a.md", dependencies: ["docs/a.md"] }, { path: "src/app.ts" }, { verify: "other" }, null]) {
    assert.equal(maintenanceCheckSha256(notMaintenance), null, JSON.stringify(notMaintenance));
  }
  assert.deepEqual([CONFIGURED_VERIFY_CHECK, "command:docs", "tests/a.test.mjs"].map(parseMaintenanceCheckSpelling),
    [{ verify: "configured" }, { command: "docs" }, { path: "tests/a.test.mjs" }]);
  for (const spelling of ["document:docs/a.md", "src/app.ts", "/abs/a.test.mjs", "../a.test.mjs", "a/./b.test.mjs", "command:", "verify:other", ""]) {
    assert.equal(parseMaintenanceCheckSpelling(spelling), null, spelling);
  }
  for (const check of [commandCheck, configuredCheck, { id: "t", path: "tests/a.test.mjs", dependencies: ["tests/a.test.mjs"] }]) {
    assert.equal(maintenanceCheckSha256(parseMaintenanceCheckSpelling(maintenanceCheckSpelling(check))), maintenanceCheckSha256(check), "the spelling round-trips");
  }
});

test("the scope admits test and tooling paths only, never a gate-strength path or the approved specs", () => {
  assert.equal(maintenanceScopeRefusal(["tests/unit/docs.test.ts", "scripts/check-links.mjs", "src/a/__tests__/b.ts", "e2e/login.spec.ts", "test/fixtures/x.json"]), null);
  for (const [path, why] of [["src/app.ts", /neither a test file/u], ["package.json", /neither a test file/u], ["vitest.config.ts", /neither a test file/u],
    ["project/pipeline.json", /GS-10/u], ["pipeline.user.yaml", /GS-1\b/u], ["architecture/fitness-model.json", /GS-17/u],
    ["specs/2026-10-26-epic2/spec.md", /ADR-0095/u], ["specs/x/tests/a.test.mjs", /ADR-0095/u]]) {
    const refusal = maintenanceScopeRefusal(["tests/ok.test.mjs", path]);
    assert.equal(refusal?.code, "SQ-MAINTENANCE-SCOPE", path);
    assert.equal(refusal.path, path);
    assert.match(refusal.reason, why, path);
  }
  assert.equal(maintenanceScopeRefusal([])?.code, "SQ-MAINTENANCE-SCOPE");
});

test("a red observation is written once per check and candidate, read back only for exactly that check, commit and tree", () => {
  const r = repo();
  r.put("README.md", "x\n"); r.commit("chore: one", ["README.md"]);
  const candidate = r.head();
  const written = writeMaintenanceRedObservation({ commonDir: r.common, featureId: "epic2", check: configuredCheck, candidate, exitCode: 1, outputSha256: sha("out"), observedAt: "2026-11-13T10:00:00.000Z" });
  assert.equal(written.ok, true); assert.equal(written.record.red, true);
  const again = writeMaintenanceRedObservation({ commonDir: r.common, featureId: "epic2", check: configuredCheck, candidate, exitCode: 0, outputSha256: sha("green"), observedAt: "2026-11-13T10:05:00.000Z" });
  assert.equal(again.existing, true); assert.equal(again.record.exitCode, 1, "the first observation at a commit stands");
  assert.equal(readMaintenanceRedObservation({ commonDir: r.common, check: configuredCheck, candidate }).red, true);
  assert.equal(readMaintenanceRedObservation({ commonDir: r.common, check: commandCheck, candidate }), null, "another check");
  assert.equal(readMaintenanceRedObservation({ commonDir: r.common, check: configuredCheck, candidate: { ...candidate, tree: sha("t").slice(0, 40) } }), null, "another tree");
  assert.equal(writeMaintenanceRedObservation({ commonDir: r.common, featureId: "epic2", check: configuredCheck, candidate, exitCode: 1, outputSha256: "x", observedAt: "now" }).code, "MAINTENANCE-OBSERVATION-INPUT");
});

test("the receipt route: a red receipt at or before the plan-approval commit proves; a green one, a later one and another suite do not", () => {
  const r = repo();
  r.put("README.md", "x\n"); const early = r.commit("chore: early", ["README.md"]);
  const earlyTree = r.git("rev-parse", "HEAD^{tree}");
  r.put("specs/epic2/accepted-contract.json", "{}\n"); const approved = r.commit("chore: plan approval", ["specs/epic2/accepted-contract.json"]);
  r.put("src/a.ts", "a\n"); const later = r.commit("feat: item", ["src/a.ts"]);
  const laterTree = r.git("rev-parse", "HEAD^{tree}");
  const state = { planApproval: { acceptedContract: { path: "specs/epic2/accepted-contract.json" } } };
  assert.equal(planApprovalCommit({ root: r.dir, state }), approved);
  assert.equal(planApprovalCommit({ root: r.dir, state: { planApproval: { acceptedContract: { path: "../x" } } } }), null);
  receipt(r, { suite: "configured-verify", commit: later, tree: laterTree, exitCode: 1, runId: "run-3-later" });
  receipt(r, { suite: "project-docs", commit: early, tree: earlyTree, exitCode: 1, runId: "run-2-other-suite" });
  receipt(r, { suite: "configured-verify", commit: early, tree: earlyTree, exitCode: 0, runId: "run-1-green" });
  assert.equal(preApprovalRedReceipt({ commonDir: r.common, root: r.dir, check: configuredCheck, approvalCommit: approved }), null, "only a later red and an earlier green");
  const red = receipt(r, { suite: "configured-verify", commit: early, tree: earlyTree, exitCode: 2, runId: "run-0-red" });
  const found = preApprovalRedReceipt({ commonDir: r.common, root: r.dir, check: configuredCheck, approvalCommit: approved });
  assert.deepEqual({ ...found }, { kind: "verify-receipt", ref: red.receiptSha256, runId: "run-0-red", commit: early, suite: "configured-verify" });
  assert.equal(preApprovalRedReceipt({ commonDir: r.common, root: r.dir, check: { id: "t", path: "tests/a.test.mjs", dependencies: ["tests/a.test.mjs"] }, approvalCommit: approved }), null, "a .test check has no suite");
});

test("the acknowledgement route and the subject: only red observations without a proof are listed; an acknowledgement covers its checks", () => {
  const r = repo();
  r.put("README.md", "x\n"); r.commit("chore: one", ["README.md"]);
  const candidate = r.head();
  const approvalSha256 = sha("approval");
  writeMaintenanceRedObservation({ commonDir: r.common, featureId: "epic2", check: configuredCheck, candidate, exitCode: 1, outputSha256: sha("o"), observedAt: "2026-11-13T10:00:00.000Z" });
  writeMaintenanceRedObservation({ commonDir: r.common, featureId: "epic2", check: commandCheck, candidate, exitCode: 0, outputSha256: sha("g"), observedAt: "2026-11-13T10:00:00.000Z" });
  writeMaintenanceRedObservation({ commonDir: r.common, featureId: "other", check: { ...commandCheck, id: "x" }, candidate, exitCode: 1, outputSha256: sha("o"), observedAt: "2026-11-13T10:00:00.000Z" });
  const none = () => [];
  const built = buildMaintenanceAcknowledgementSubject({ commonDir: r.common, root: r.dir, featureId: "epic2", approvalSha256, approvalCommit: null, candidate, readApprovals: none });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.deepEqual(built.subject.checks.map((entry) => entry.checkSha256), [maintenanceCheckSha256(configuredCheck)], "the green check and the other feature's are not listed");
  assert.equal(built.subject.checksSha256, maintenanceChecksDigest(built.subject.checks));
  const envelope = { approval: { featureId: "epic2", approvalSha256, checks: built.subject.checks, checksSha256: built.subject.checksSha256, approvedBy: "PO", approvedAt: "2026-11-13T11:00:00.000Z", criticalProof: { proofSha256: sha("proof") } } };
  const acks = () => [envelope];
  const proof = maintenanceRedProof({ commonDir: r.common, root: r.dir, featureId: "epic2", approvalSha256, approvalCommit: null, check: configuredCheck, readApprovals: acks });
  assert.deepEqual({ ...proof }, { kind: "po-acknowledgement", ref: sha("proof"), mode: "signature", label: MAINTENANCE_ACK_LABEL });
  assert.equal(maintenanceAcknowledgement({ commonDir: r.common, featureId: "epic2", approvalSha256: sha("another approval"), checkSha256: maintenanceCheckSha256(configuredCheck), readApprovals: acks }), null, "another plan approval");
  const tampered = () => [{ approval: { ...envelope.approval, checks: [...envelope.approval.checks, { checkSha256: sha("x"), check: {}, observedExitCode: 1 }] } }];
  assert.equal(maintenanceAcknowledgement({ commonDir: r.common, featureId: "epic2", approvalSha256, checkSha256: sha("x"), readApprovals: tampered }), null, "a list that does not match its digest");
  const nothing = buildMaintenanceAcknowledgementSubject({ commonDir: r.common, root: r.dir, featureId: "epic2", approvalSha256, approvalCommit: null, candidate, readApprovals: acks });
  assert.equal(nothing.code, "MRA-NOTHING-TO-ACKNOWLEDGE");
});

test("green after the delivery: the close needs a sealed green configured-verify receipt after the red base and inside the candidate", () => {
  const r = repo();
  r.put("README.md", "x\n"); const base = r.commit("chore: red base", ["README.md"]);
  const baseTree = r.git("rev-parse", "HEAD^{tree}");
  r.put("tests/unit/docs.test.ts", "fixed\n"); const repaired = r.commit("test: repair", ["tests/unit/docs.test.ts"]);
  const repairedTree = r.git("rev-parse", "HEAD^{tree}");
  r.put("src/b.ts", "b\n"); const candidate = r.commit("feat: more", ["src/b.ts"]);
  r.git("checkout", "-q", "-b", "side", base);
  r.put("side.txt", "s\n"); const side = r.commit("chore: side branch", ["side.txt"]);
  const sideTree = r.git("rev-parse", "HEAD^{tree}");
  r.git("checkout", "-q", "main");
  const slices = [
    { id: "MAINT-1", state: "ready", delivery: { maintenance: { schema: MAINTENANCE_BINDING_SCHEMA }, baseCommit: base, checks: [configuredCheck] } },
    { id: "MAINT-TEST", state: "ready", delivery: { maintenance: { schema: MAINTENANCE_BINDING_SCHEMA }, baseCommit: base, checks: [{ id: "t", path: "tests/a.test.mjs", dependencies: ["tests/a.test.mjs"] }] } },
    { id: "MAINT-CANCELLED", state: "cancelled", delivery: { maintenance: { schema: MAINTENANCE_BINDING_SCHEMA }, baseCommit: base, checks: [configuredCheck] } },
    { id: "ITEM", state: "ready", delivery: { criteria: ["AC-1"], baseCommit: base, checks: [commandCheck] } },
  ];
  const lacking = () => maintenanceSlicesLackingGreenVerify({ commonDir: r.common, root: r.dir, slices, candidateCommit: candidate });
  assert.deepEqual(lacking(), ["MAINT-1"], "only a live maintenance slice of the configured verify needs it; the host ran the .test check");
  receipt(r, { suite: "configured-verify", commit: base, tree: baseTree, exitCode: 0, runId: "run-1-green-at-base" });
  receipt(r, { suite: "configured-verify", commit: side, tree: sideTree, exitCode: 0, runId: "run-2-green-off-candidate" });
  receipt(r, { suite: "configured-verify", commit: repaired, tree: repairedTree, exitCode: 1, runId: "run-3-red-after" });
  receipt(r, { suite: "project-docs", commit: repaired, tree: repairedTree, exitCode: 0, runId: "run-4-other-suite" });
  assert.deepEqual(lacking(), ["MAINT-1"], "green at the red base itself, green outside the candidate, red after, and another suite do not count");
  const green = receipt(r, { suite: "configured-verify", commit: repaired, tree: repairedTree, exitCode: 0, runId: "run-5-green-after" });
  assert.deepEqual(lacking(), []);
  assert.deepEqual({ ...greenAfterDeliveryReceipt({ commonDir: r.common, root: r.dir, check: configuredCheck, baseCommit: base, candidateCommit: candidate }) },
    { kind: "verify-receipt", ref: green.receiptSha256, runId: "run-5-green-after", commit: repaired, suite: "configured-verify" });
  assert.equal(greenAfterDeliveryReceipt({ commonDir: r.common, root: r.dir, check: configuredCheck, baseCommit: base, candidateCommit: side }).runId, "run-2-green-off-candidate",
    "for the side candidate only its own green counts, never the main line's");
  assert.equal(greenAfterDeliveryReceipt({ commonDir: r.common, root: r.dir, check: configuredCheck, baseCommit: base, candidateCommit: base }), null, "a candidate that contains no green commit after the base");
});
