#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-devplan-design-approval.test.mjs -- RED contract for the v8 dev-plan boundary
 * (ADR-0085 row 3a; Rulings 73 and 77 of the Sprint Alfred execution order).
 *
 * Target path: plugins/pipeline-core/hooks/guard-devplan-design-approval.test.mjs
 *
 * Run: node --test plugins/pipeline-core/hooks/guard-devplan-design-approval.test.mjs
 *
 * The entrypoint under test is the Edit|Write dev-plan gate (the hook script, spawned with
 * CLAUDE_PROJECT_DIR set to a fresh temp repository, like guard-devplan.test.mjs). Every case
 * writes a `pipeline.plan-approval.v8` record into a state that is otherwise lifecycle-valid
 * ("implementation", planApproved, matching submission and authority digests) and asks the
 * gate whether `src/foo.ts` may be written.
 *
 * Contract (Ruling 77 (a), (b); Ruling 73):
 *   boundary order, the first failure wins:
 *     1. validateDesignApprovalBinding(planApproval.designApprovalBinding) passes and its
 *        sha equals designApproval.bindingSha256, else DAA-DESIGN-APPROVAL-BINDING-DRIFT;
 *     2. the mode check refuses only a downgrade: a chat record under configured `signature`
 *        is refused with DAA-PO-APPROVAL-MODE-MISMATCH; a signature record under configured
 *        `chat` is admitted;
 *     3. in signature mode the proof verifies against the trust anchor;
 *     4. the current PRD, Spec and bound companions, read by binding path, equal
 *        binding.sources, else DAA-DESIGN-SOURCE-DRIFT.
 *   The binding comes from the approval record itself, never from a request file, and the
 *   boundary re-reads no review receipt (their paths and digests live in the binding).
 *   Mini profile: designApprovalBinding and designApproval are both null and nothing else is
 *   needed. Mixed state (exactly one of the two null) is invalid.
 *
 * Cases (R = red today, G = green today).
 * RED reason for C1-C7:
 * v8 is not yet a current plan-approval schema (CURRENT_APPROVAL_SCHEMA is pipeline.plan-approval.v7), so the lifecycle layer rejects every v8 record as awaiting-approval before the boundary's own checks run. A v7-shaped approval in the same fixture is admitted (mini) or passes the lifecycle layer (feature, DWP-PACKAGE-PHYSICAL), so the fixture is sound and the DAA codes become reachable with the F slice.
 * The lifecycle block (not a code of this contract) is therefore what a case sees today, so a refusal case asserts its exact code in stderr and cannot pass on that block.
 *   C1  v8 chat record, configured chat -> admitted                          R (blocked, lifecycle)
 *   C2  v8 signature record, configured chat -> admitted                     R (blocked, lifecycle)
 *   C3  v8 chat record, configured signature -> DAA-PO-APPROVAL-MODE-MISMATCH   R (code absent)
 *   C4  binding object changed, sha differs -> DAA-DESIGN-APPROVAL-BINDING-DRIFT   R (code absent)
 *   C5  bound companion edited after approval -> DAA-DESIGN-SOURCE-DRIFT    R (code absent)
 *   C6  mini profile, both keys null, no design artifact -> admitted         R (blocked, lifecycle)
 *   C7  exactly one key null -> refused under any code                      R (the paired control
 *       in the same case, a valid v8 record, is blocked today; see A10)
 *   FX1 the signature proof verifies against the empty anchor set            G (fixture self-check)
 *   FX2 the configured mode resolves from the committed file                 G (fixture self-check)
 *
 * Assumptions -- fields and shapes the rulings do not fix (each is a judgment the
 * implementation slices may revisit, but the test is the contract until they do):
 *   A1  The v8 record carries exactly the Ruling 77 (a) key set: schema, approvedBy, approvedAt,
 *       submissionSha256, profileSha256, priorInvalidationSha256, poGateAuthority (all as in
 *       v7), plus designApprovalBinding and designApproval. The four v7 design fields are absent.
 *   A2  designApproval is the C4 a2 record: schema `pipeline.design-approval.v1` and the closed
 *       keys mode, approvedBy, approvedAt, bindingSha256, intentSha256, proofSha256, proof.
 *   A3  In chat mode proofSha256 and proof are null and intentSha256 is NON-null, because the
 *       design note C4 a2 says the chat record "binds the same bindingSha256 and intentSha256".
 *       This diverges from the T0c findings ("all three null") and from the v1 package
 *       approval (chat = all three null). If the implementation settles on a null intent in
 *       chat, C1 and C3..C5 must change with it; this is the one fixture shape to confirm.
 *   A4  designApproval.approvedBy equals planApproval.approvedBy ("PO"), as C1(a) requires for
 *       chat; approvedAt is a canonical ISO instant.
 *   A5  The binding is built by hand (closed shape of the U3 contract, section 4) and checked
 *       with validateDesignApprovalBinding, the boundary's own first step. It has one round-1
 *       review receipt, verdict pass, no open findings, one companion. The receipt digest is a
 *       made-up digest and neither the receipt nor the review report is written to disk, which
 *       also pins Ruling 77 (b): a boundary that re-reads receipts cannot admit these cases.
 *   A6  The intent candidate is the fixture HEAD commit and tree. Ruling 77 (b) names no
 *       candidate-versus-HEAD step, so a boundary that ignores the candidate and one that
 *       compares it to HEAD both admit the valid cases.
 *   A7  The signature fixture ships no trust-policy file. With project/critical-human-proof.json
 *       absent the boundary passes an empty anchor set, and verifyAgainstTrustAnchors then
 *       derives the trust policy from the proof's own key (FX1 pins that this verifies).
 *   A8  The configured mode is the committed `gates.human_approval` of the repo-root
 *       pipeline.user.yaml (readHumanApprovalMode). C6 leaves the file absent (default
 *       signature) to show that the mini profile needs no mode agreement. FX2 pins the
 *       resolution the cases rely on.
 *   A9  Only the exit code and the exact refusal code string are asserted. Remediation wording
 *       is not (Ruling 73 makes it code-specific), and only the Edit lane (the hook script) is
 *       exercised: the shell lane (GUARD-DEVPLAN-SHELL) is not pinned here.
 *   A10 C7 asserts "refused under any code". The lifecycle layer already refuses every v8
 *       record today, so a bare refusal assertion would pass vacuously. C7 therefore first
 *       requires the otherwise identical valid record to be admitted (the control), then
 *       requires both mixed variants to be refused. The case is red today because of the
 *       control and becomes a real pin once v8 records are recognised.
 *   A11 C4 swaps a receipt digest inside designApprovalBinding in the state only (the binding
 *       stays shape-valid; its sha differs from designApproval.bindingSha256). C5 rewrites a
 *       bound companion file and leaves PRD and Spec untouched, so poGateAuthority cannot
 *       catch the change for another reason.
 *   A12 A refusal is exit code 2 (blocking manifest).
 *
 * Production modules are imported dynamically inside each case (loadModules), so a module
 * that is missing or renamed fails that case instead of crashing the whole file.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS_DIR, "guard-devplan.mjs");
const libUrl = (name) => pathToFileURL(join(HOOKS_DIR, "..", "lib", name)).href;

async function loadModules() {
  const [state, governance, binding, proof, policy] = await Promise.all([
    import(libUrl("plan-spec-state-v2.mjs")),
    import(libUrl("governance-scope.mjs")),
    import(libUrl("design-approval-binding.mjs")),
    import(libUrl("po-approval-proof.mjs")),
    import(libUrl("critical-human-proof-policy.mjs")),
  ]);
  return { state, governance, binding, proof, policy };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const FEATURE_ID = "authority-feature";
const PRD_PATH = "specs/feature/prd.md";
const SPEC_PATH = "specs/feature/spec.md";
const COMPANION_PATH = "specs/feature/notes.md";
const RECEIPT_PATH = "specs/feature/review/receipt-1.json";
const PRD_BYTES = "# PRD\n";
const SPEC_BYTES = "# Spec\n";
const COMPANION_BYTES = "# Design notes\n";
const COMPANION_EDITED_BYTES = "# Design notes\n\nEdited after the approval was recorded.\n";
const APPROVED_BY = "PO";
const APPROVED_AT = "2026-10-09T10:00:00.000Z";
const MANIFEST_BLOCKING = "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n";
const ADMIT = 0;
const BLOCK = 2;

const ALL_DIRS = [];
after(() => {
  for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
});

function git(cwd, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env, shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed (${result.status}): ${result.stderr}`);
  return String(result.stdout).trim();
}

function writeText(dir, relativePath, text) {
  const target = join(dir, ...relativePath.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** A git repository, enrolled in governance, whose HEAD commits README.md and, when given, the user config. */
function createRepository(mods, config) {
  const dir = mkdtempSync(join(tmpdir(), "guard-devplan-v8-"));
  ALL_DIRS.push(dir);
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "fixture@example.invalid"]);
  git(dir, ["config", "user.name", "Fixture"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  const governance = mods.governance.createGovernanceScopeController({ hostStateRoot: join(dir, "fixture-host-state") });
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.equal(active.state, "active", "fixture enrollment must become active");
  writeText(dir, "README.md", "fixture\n");
  const tracked = ["README.md"];
  if (config !== null) {
    writeText(dir, "pipeline.user.yaml", `gates:\n  human_approval: ${config}\n`);
    tracked.push("pipeline.user.yaml");
  }
  git(dir, ["add", "--", ...tracked]);
  git(dir, ["commit", "--quiet", "-m", "fixture"]);
  return dir;
}

function buildBinding(mods) {
  return {
    schema: mods.binding.DESIGN_APPROVAL_BINDING_SCHEMA,
    featureId: FEATURE_ID,
    sources: {
      prd: { path: PRD_PATH, sha256: sha256(PRD_BYTES) },
      spec: { path: SPEC_PATH, sha256: sha256(SPEC_BYTES) },
      companions: [{ path: COMPANION_PATH, sha256: sha256(COMPANION_BYTES) }],
    },
    reviewReceipts: [{ path: RECEIPT_PATH, sha256: "a".repeat(64), round: 1 }],
    verdict: "pass",
    openFindingIds: [],
  };
}

function buildRecord(mods, dir, binding, mode) {
  const validated = mods.binding.validateDesignApprovalBinding(binding);
  assert.equal(validated.ok, true, `fixture binding must validate: ${JSON.stringify(validated)}`);
  const candidate = { commit: git(dir, ["rev-parse", "HEAD"]), tree: git(dir, ["rev-parse", "HEAD^{tree}"]) };
  const requested = mods.binding.createDesignApprovalRequest({ binding, candidate });
  assert.equal(requested.ok, true, `fixture request must build: ${JSON.stringify(requested)}`);
  const record = {
    schema: mods.binding.DESIGN_APPROVAL_RECORD_SCHEMA,
    mode,
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    bindingSha256: validated.bindingSha256,
    intentSha256: requested.intentSha256,
    proofSha256: null,
    proof: null,
  };
  if (mode === "signature") {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: requested.intentSha256,
      keyReference: "fixture-po-key",
      publicKey: publicKey.export({ type: "spki", format: "pem" }),
      signatureBase64: sign(null, Buffer.from(requested.intentSha256, "utf8"), privateKey).toString("base64"),
    };
    record.proof = proof;
    record.proofSha256 = sha256(mods.proof.canonical(proof));
  }
  return record;
}

/**
 * Build a repository whose state carries a v8 approval. `mutate(handle)` may edit `handle.approval`
 * or the files under `handle.dir` before the state is written.
 */
function writeFixture(mods, { profile = "feature", mode = "chat", config = null, mutate = () => {} } = {}) {
  const dir = createRepository(mods, config);
  const mini = profile === "mini";
  writeText(dir, ".claude/pipeline.yaml", MANIFEST_BLOCKING);
  writeText(dir, PRD_PATH, PRD_BYTES);
  writeText(dir, SPEC_PATH, SPEC_BYTES);
  if (!mini) writeText(dir, COMPANION_PATH, COMPANION_BYTES);
  const submission = {
    schema: "pipeline.plan-submission.v1",
    featureId: FEATURE_ID,
    planPath: PRD_PATH,
    planSha256: sha256(PRD_BYTES),
    specPath: SPEC_PATH,
    specSha256: sha256(SPEC_BYTES),
    profile,
    profileSha256: "3".repeat(64),
    submittedBy: "Coordinator",
    submittedAt: "2026-10-09T09:30:00.000Z",
  };
  const binding = mini ? null : buildBinding(mods);
  const record = mini ? null : buildRecord(mods, dir, binding, mode);
  const approval = {
    schema: "pipeline.plan-approval.v8",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    submissionSha256: mods.state.sha256CanonicalJson(submission),
    profileSha256: submission.profileSha256,
    priorInvalidationSha256: null,
    designApprovalBinding: binding,
    designApproval: record,
    poGateAuthority: {
      schema: "pipeline.po-gate-authority.v2",
      humanFacing: "en",
      sourceSha256: "1".repeat(64),
      runtimeSha256: "2".repeat(64),
      receiptSha256: "3".repeat(64),
      repositoryFingerprint: "7".repeat(64),
      planPath: PRD_PATH,
      planSha256: submission.planSha256,
      specPath: SPEC_PATH,
      specSha256: submission.specSha256,
    },
  };
  const handle = { dir, binding, record, approval, submission };
  mutate(handle);
  writeText(dir, ".claude/pipeline-state.json", JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE_ID, planPath: PRD_PATH, phase: "implementation" },
    planApproved: true,
    planSubmission: submission,
    planApproval: handle.approval,
  }));
  return handle;
}

function runGuard(dir) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "src/foo.ts", old_string: "a", new_string: "b" } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    timeout: 30_000,
  });
  return { code: result.status, stderr: String(result.stderr ?? "") };
}

const excerpt = (text) => text.trim().replace(/\s+/gu, " ").slice(0, 260);

function assertAdmitted(run, what) {
  assert.equal(run.code, ADMIT, `${what}: expected the write to be admitted (exit ${ADMIT}), got exit ${run.code}: ${excerpt(run.stderr)}`);
}

function assertRefusedWith(run, code, what) {
  assert.equal(run.code, BLOCK, `${what}: expected the write to be refused (exit ${BLOCK}), got exit ${run.code}: ${excerpt(run.stderr)}`);
  assert.ok(run.stderr.includes(code), `${what}: the refusal must name ${code} in stderr, got: ${excerpt(run.stderr)}`);
}

// ---- C1 -------------------------------------------------------------------------------------
test("C1 admit  v8 chat record under configured chat", async () => {
  const mods = await loadModules();
  const { dir } = writeFixture(mods, { mode: "chat", config: "chat" });
  assertAdmitted(runGuard(dir), "C1");
});

// ---- C2 -------------------------------------------------------------------------------------
test("C2 admit  v8 signature record under configured chat (the stronger proof satisfies the weaker mode)", async () => {
  const mods = await loadModules();
  const { dir } = writeFixture(mods, { mode: "signature", config: "chat" });
  assertAdmitted(runGuard(dir), "C2");
});

// ---- C3 -------------------------------------------------------------------------------------
test("C3 refuse v8 chat record under configured signature with DAA-PO-APPROVAL-MODE-MISMATCH", async () => {
  const mods = await loadModules();
  const { dir } = writeFixture(mods, { mode: "chat", config: "signature" });
  assertRefusedWith(runGuard(dir), "DAA-PO-APPROVAL-MODE-MISMATCH", "C3");
});

// ---- C4 -------------------------------------------------------------------------------------
test("C4 refuse binding drift (binding sha differs from designApproval.bindingSha256) with DAA-DESIGN-APPROVAL-BINDING-DRIFT", async () => {
  const mods = await loadModules();
  const { dir } = writeFixture(mods, {
    mode: "chat",
    config: "chat",
    mutate: (handle) => {
      const drifted = structuredClone(handle.binding);
      drifted.reviewReceipts[0].sha256 = "b".repeat(64);
      const checked = mods.binding.validateDesignApprovalBinding(drifted);
      assert.equal(checked.ok, true, "the drifted binding must stay shape-valid so only the sha comparison can fail");
      assert.notEqual(checked.bindingSha256, handle.record.bindingSha256, "the drifted binding must have another sha");
      handle.approval.designApprovalBinding = drifted;
    },
  });
  assertRefusedWith(runGuard(dir), "DAA-DESIGN-APPROVAL-BINDING-DRIFT", "C4");
});

// ---- C5 -------------------------------------------------------------------------------------
test("C5 refuse companion drift (bound companion edited after approval) with DAA-DESIGN-SOURCE-DRIFT", async () => {
  const mods = await loadModules();
  const { dir } = writeFixture(mods, {
    mode: "chat",
    config: "chat",
    mutate: (handle) => {
      assert.notEqual(sha256(COMPANION_EDITED_BYTES), sha256(COMPANION_BYTES), "the edited companion must have another digest");
      writeText(handle.dir, COMPANION_PATH, COMPANION_EDITED_BYTES);
    },
  });
  assertRefusedWith(runGuard(dir), "DAA-DESIGN-SOURCE-DRIFT", "C5");
});

// ---- C6 -------------------------------------------------------------------------------------
test("C6 admit  mini profile with both design keys null and no design artifact", async () => {
  const mods = await loadModules();
  const { dir, approval } = writeFixture(mods, { profile: "mini", config: null });
  assert.equal(approval.designApprovalBinding, null);
  assert.equal(approval.designApproval, null);
  assertAdmitted(runGuard(dir), "C6");
});

// ---- C7 -------------------------------------------------------------------------------------
test("C7 refuse mixed state (exactly one of the two design keys null), paired with an admitted control", async () => {
  const mods = await loadModules();
  const control = writeFixture(mods, { mode: "chat", config: "chat" });
  assertAdmitted(runGuard(control.dir), "C7 control (the same record with both keys present)");
  const variants = [
    ["designApprovalBinding null, designApproval present", (handle) => { handle.approval.designApprovalBinding = null; }],
    ["designApproval null, designApprovalBinding present", (handle) => { handle.approval.designApproval = null; }],
  ];
  for (const [label, mutate] of variants) {
    const { dir } = writeFixture(mods, { mode: "chat", config: "chat", mutate });
    const run = runGuard(dir);
    assert.equal(run.code, BLOCK, `C7 ${label}: expected the write to be refused (exit ${BLOCK}), got exit ${run.code}: ${excerpt(run.stderr)}`);
  }
});

// ---- fixture self-checks (green controls: they show a red case is not red for a fixture reason) ----
test("FX1 fixture: the signature proof verifies against the empty anchor set", async () => {
  const mods = await loadModules();
  const { record } = writeFixture(mods, { mode: "signature", config: "chat" });
  const verified = mods.policy.verifyAgainstTrustAnchors({ intent: { sha256: record.intentSha256 }, anchors: [], proof: record.proof });
  assert.equal(verified.verified, true, `proof must verify: ${JSON.stringify(verified)}`);
  assert.equal(verified.proofSha256, record.proofSha256);
});

test("FX2 fixture: the configured mode resolves from the committed user config", async () => {
  const mods = await loadModules();
  for (const [config, expected] of [["chat", "chat"], ["signature", "signature"], [null, "signature"]]) {
    const dir = createRepository(mods, config);
    assert.equal(mods.policy.readHumanApprovalMode(dir).mode, expected, `committed config ${config === null ? "(absent)" : config} must resolve to ${expected}`);
  }
});
