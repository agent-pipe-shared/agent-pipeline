#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-W1-05 / pipeline.disjoint-signed-hgo-actions-invalidate-one-another (AC-160).
// Independently signed, disjoint native file actions (Edit, Write, apply_patch) must
// not invalidate one another when an unrelated authorized worktree edit lands between
// arming and consumption, while target, ancestry, denial-set, expiry and replay drift
// still fail closed.
//
// ALF-C-W1-05B coverage map for the original acceptance (backlog item, Acceptance bullet 3
// and the two bullets around it). Every row is driven through the real module:
//   three signed disjoint actions, sequential deliveries -> "three independently signed disjoint actions are delivered sequentially"
//   unrelated edit does not invalidate (bullet 2, native) -> "an unrelated worktree edit between arming and consumption does not invalidate"
//   target byte / absence / ancestry drift                -> "target byte, absence and ancestry drift still fail closed"
//   symlink drift (target / ancestor)                     -> "symlink replacement of a signed target" (skips where file symlinks are unavailable)
//                                                            and "ancestor replaced by a directory link" (junction on win32)
//   policy drift                                          -> "project guard-policy drift"
//   plugin drift                                          -> "plugin (override machinery) drift"
//   lifecycle state drift (bullet 1)                      -> "lifecycle state drift"
//   expiry / denial set / tool input                      -> "expiry, denial-set and tool-input drift"
//   HEAD/tree after arming (consumption boundary)         -> "HEAD/tree movement after arming"
//   HEAD/tree + target at the signed ARMING boundary      -> "HEAD movement between signing and arming" /
//                                                            "target byte drift between signing and arming" /
//                                                            "an unrelated worktree edit between signing and arming still arms"
//   third native tool (bullet 1: Edit, Write, apply_patch)-> the "Edit: ..." cases (Write and apply_patch ride the loops)
//   replay (consumed capability and replayed proof)       -> "replay of a consumed capability and of its signed proof"
//   audit-integrity drift                                 -> "audit-integrity drift"
//   explicit new contract (v4 plan) vs. legacy strictness -> the replay case pins the v4 plan schema, the Bash case pins the v3 plan schema
//   bullet 2, every Bash action                           -> "Bash: whole-repository binding"
//   bullet 2, plugin installation                         -> "plugin installation: binding follows the attested install source"
//   bullet 4, serial-dependence disclosure                -> "AC-160 serial-dependence disclosure"

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  appendFileSync, chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import nodeTest from "node:test";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import {
  authorizeHumanGuardOverride,
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  describeHumanGuardOverrideSelection,
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  prepareHumanGuardOverrideForSignature,
  recordHumanGuardDenial,
} from "./human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const KEY_REFERENCE = "hgo-disjoint-test-key";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const PLAN_SENTINEL = sha("pipeline.human-guard-override-signature-plan.v1");
const SPEC_SENTINEL = sha("pipeline.human-guard-override-signature-spec.v1");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

// The default OS tmpdir trips WIN-AUTH-ANCESTOR-MUTATION on Windows hosts; keep every fixture under scratch/.
const scratchBase = () => {
  const base = join(PLUGIN_ROOT, "..", "..", "scratch", "hgo-tmp");
  mkdirSync(base, { recursive: true });
  return base;
};

// CONTAINMENT (incident 2026-10-16): every fixture root is a direct child of scratchBase() and runs
// `git init` on itself before any other git call. The ceiling is the parent of every fixture root, so git
// can never discover and write into the enclosing project repository; it is inherited by every git call the
// module under test makes as well.
process.env.GIT_CEILING_DIRECTORIES = scratchBase();

function fixture({ pushApproval = "signature" } = {}) {
  const root = mkdtempSync(join(scratchBase(), "hgo-disjoint-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${pushApproval}"\n`);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256: sha(publicKey) },
  }));
  writeFileSync(join(root, "existing-a.md"), "a\n");
  writeFileSync(join(root, "existing-b.md"), "b\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

const writeInput = (file, content = "signed\n") => ({ file_path: file, content });
const patchInput = (file) => ({ command: `*** Begin Patch\n*** Update File: ${file}\n@@\n-old\n+new\n*** End Patch` });
const editInput = (file) => ({ file_path: file, old_string: "fixture", new_string: "edited" });

/** denial -> plan -> prepare -> real Ed25519 proof -> armed capability. */
function signAndArm(root, { toolName, toolInput, denials = denial, nowMs = 1000, ttlMs, pluginRoot = PLUGIN_ROOT, arm = true } = {}) {
  const shared = { rootDir: root, pluginRoot, scriptPath: join(pluginRoot, "scripts", "guard-human-override.mjs") };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials, nowMs, ttlMs });
  assert.equal(recorded.status, "planned", JSON.stringify(recorded));
  const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: nowMs + 500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, nowMs: nowMs + 1000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: PLAN_SENTINEL,
    specSha256: SPEC_SENTINEL,
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: KEY_REFERENCE,
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
  };
  const signed = { recorded, plan, proof, shared };
  if (!arm) return signed; // signed but not armed: lets a case move the world across the arming boundary itself
  const armed = armSigned(signed, nowMs + 2000);
  assert.equal(armed.status, "armed", JSON.stringify(armed));
  return signed;
}

/** Arms a signed-but-unarmed action; a refusal that the module throws is folded into the result. */
function armSigned({ recorded, plan, proof, shared }, nowMs) {
  try {
    return authorizeHumanGuardOverrideBySignature({
      ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs,
    });
  } catch (error) { return { status: "refused", code: error?.code }; }
}

const consume = (root, toolName, toolInput, { denials = denial, nowMs = 10_000, pluginRoot = PLUGIN_ROOT } = {}) =>
  consumeHumanGuardOverride({ rootDir: root, pluginRoot, toolName, toolInput, denials, nowMs });

/** The authenticated audit ledger the module itself writes; read-only access for assertions. */
const auditPath = (root) =>
  join(git(root, "rev-parse", "--path-format=absolute", "--git-common-dir"), "agent-pipeline", "human-guard-overrides", "audit.jsonl");

function lastRejection(root, requestSha256 = null) {
  const rows = readFileSync(auditPath(root), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  // Each ledger row is { schema, sequence, previousMac, event, mac }; the typed record is the nested `event`.
  // With several armed capabilities one consumption audits every candidate it examines, so a case that arms
  // more than one action names the request whose rejection it asserts.
  const rejected = rows.map((row) => row.event)
    .filter((event) => event?.type === "rejected" && (requestSha256 === null || event.requestSha256 === requestSha256));
  assert.ok(rejected.length > 0, `no rejected audit row; last rows: ${JSON.stringify(rows.slice(-2))}`);
  return rejected.at(-1);
}

/** Drift is refused with the module's replan/HGO-DRIFT result and the authenticated audit names the exact failed check. */
function assertDriftRefusal(root, result, label, driftedChecks, requestSha256 = null) {
  assert.equal(result.status, "replan", `${label}: ${JSON.stringify(result)}`);
  assert.equal(result.code, "HGO-DRIFT", label);
  assert.deepEqual(lastRejection(root, requestSha256).driftedChecks, driftedChecks, label);
}

// ---------------------------------------------------------------------------------------------
// Execution model (ALF-C-HGO-FAST2). Every case below owns a private fixture root and arming one
// action costs tens of seconds on native Windows (record, plan and authorize each write private
// files behind PowerShell DACL probes, all synchronous). The cases are independent, so each body
// runs unchanged inside its own worker thread (this same file, re-entered with workerData) while
// the main thread only registers one node:test case per body and awaits that body's result. Every
// assertion still executes, in the same code, against the same real module; a failure in a worker
// is rethrown in the matching case with its message and stack. HGO_DISJOINT_WORKERS bounds the pool.
// ---------------------------------------------------------------------------------------------

const CASES = new Map();
const WORKERS = Math.max(1, Number(process.env.HGO_DISJOINT_WORKERS) || Math.min(8, Math.max(2, availableParallelism())));
const jobs = new Map();
const waiting = [];
let running = 0;

function pump() {
  while (running < WORKERS && waiting.length > 0) {
    const { name, resolve } = waiting.shift();
    running += 1;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      running -= 1;
      resolve(result);
      pump();
    };
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { hgoCase: name } });
    worker.once("message", finish);
    worker.once("error", (error) => finish({ ok: false, message: String(error?.stack ?? error) }));
    worker.once("exit", (code) => finish({ ok: false, message: `worker for "${name}" exited (${code}) without a result` }));
  }
}

function runCase(name) {
  if (!jobs.has(name)) jobs.set(name, new Promise((resolve) => { waiting.push({ name, resolve }); pump(); }));
  return jobs.get(name);
}

function test(name, body) {
  assert.ok(!CASES.has(name), `duplicate case name: ${name}`);
  CASES.set(name, body);
  if (!isMainThread) return;
  nodeTest(name, async (t) => {
    const result = await runCase(name);
    if (!result.ok) throw new Error(result.message);
    if (result.skipped) t.skip(result.skipped);
  });
}

for (const [toolName, build] of [["Write", writeInput], ["apply_patch", patchInput]]) {
  test(`${toolName}: three independently signed disjoint actions are delivered sequentially without re-signing`, () => {
    const root = fixture();
    try {
      const files = ["one.md", "two.md", "three.md"];
      for (const file of files) signAndArm(root, { toolName, toolInput: build(file) });
      for (const file of files) {
        // Each delivery changes the whole-repository status seen by the next one.
        const consumed = consume(root, toolName, build(file));
        assert.equal(consumed.status, "consumed", `${file}: ${JSON.stringify(consumed)}`);
        writeFileSync(join(root, file), "delivered\n");
      }
      // Replay: a consumed capability is single-use.
      assert.notEqual(consume(root, toolName, build(files[0])).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: an unrelated worktree edit between arming and consumption does not invalidate`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("target.md") });
      writeFileSync(join(root, "unrelated-untracked.md"), "other action delivered\n");
      writeFileSync(join(root, "existing-a.md"), "modified elsewhere\n");
      assert.equal(consume(root, toolName, build("target.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: target byte, absence and ancestry drift still fail closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("existing-a.md") });
      signAndArm(root, { toolName, toolInput: build("absent.md") });
      signAndArm(root, { toolName, toolInput: build("sub/dir/deep.md") });
      writeFileSync(join(root, "existing-a.md"), "target bytes changed\n");
      writeFileSync(join(root, "absent.md"), "appeared\n");
      mkdirSync(join(root, "sub"), { recursive: true });
      for (const [file, label] of [["existing-a.md", "byte"], ["absent.md", "absence"], ["sub/dir/deep.md", "ancestry"]]) {
        const result = consume(root, toolName, build(file));
        assert.notEqual(result.status, "consumed", `${label} drift must not consume`);
        assert.equal(result.code, "HGO-DRIFT", label);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: symlink replacement of a signed target fails closed`, (t) => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("existing-b.md") });
      unlinkSync(join(root, "existing-b.md"));
      try { symlinkSync(join(root, "README.md"), join(root, "existing-b.md")); }
      catch { t.skip("file symlinks unavailable on this host"); return; }
      const result = consume(root, toolName, build("existing-b.md"));
      assert.notEqual(result.status, "consumed");
      assert.equal(result.code, "HGO-DRIFT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: expiry, denial-set and tool-input drift still fail closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("exp.md") });
      const otherDenial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DIFFERENT-REASON" }];
      assert.equal(consume(root, toolName, build("exp.md"), { denials: otherDenial }).status, "absent");
      assert.notEqual(consume(root, toolName, build("other-input.md")).status, "consumed");
      const expired = consume(root, toolName, build("exp.md"), { nowMs: 100_000_000_000_000 });
      assert.equal(expired.status, "replan");
      assert.equal(expired.code, "HGO-EXPIRED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: HEAD/tree movement after arming still fails closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("headbound.md") });
      writeFileSync(join(root, "committed-later.md"), "x\n");
      git(root, "add", "committed-later.md");
      git(root, "commit", "-q", "-m", "move head");
      const result = consume(root, toolName, build("headbound.md"));
      assert.notEqual(result.status, "consumed");
      assert.equal(result.code, "HGO-DRIFT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ALF-C-W1-05B: the remaining members of the original acceptance's drift matrix.
for (const [toolName, build] of [["Write", writeInput], ["apply_patch", patchInput]]) {
  test(`${toolName}: ancestor replaced by a directory link fails closed`, (t) => {
    const root = fixture();
    try {
      mkdirSync(join(root, "sub", "dir"), { recursive: true });
      signAndArm(root, { toolName, toolInput: build("sub/dir/linked.md") });
      rmSync(join(root, "sub"), { recursive: true, force: true });
      mkdirSync(join(root, "elsewhere", "dir"), { recursive: true });
      // A junction needs no privilege on win32; every other platform gets a plain directory symlink.
      try { symlinkSync(join(root, "elsewhere"), join(root, "sub"), process.platform === "win32" ? "junction" : "dir"); }
      catch { t.skip("directory links unavailable on this host"); return; }
      assertDriftRefusal(root, consume(root, toolName, build("sub/dir/linked.md")), "ancestor link", ["nativeTargets"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: project guard-policy drift after arming fails closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("policy.md") });
      writeFileSync(join(root, "project", "guard-config.json"), '{"drift":true}\n');
      assertDriftRefusal(root, consume(root, toolName, build("policy.md")), "policy", ["policy"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: plugin (override machinery) drift after arming fails closed`, () => {
    const root = fixture();
    // The plugin identity binds the plugin root's location as well as its bytes, so the mirror is the
    // plugin root for the WHOLE flow: only its content differs between arming and consumption.
    const mirror = mkdtempSync(join(scratchBase(), "hgo-plugin-"));
    try {
      for (const file of [
        ".codex-plugin/plugin.json",
        "hooks/codex-pretool-guard.mjs",
        "hooks/guard-command-grammar.mjs",
        "hooks/guard-lifecycle-ready.mjs",
        "lib/human-guard-override.mjs",
        "lib/windows-private-state.mjs",
        "scripts/guard-human-override.mjs",
      ]) {
        mkdirSync(dirname(join(mirror, file)), { recursive: true });
        copyFileSync(join(PLUGIN_ROOT, file), join(mirror, file));
      }
      signAndArm(root, { toolName, toolInput: build("plugin-a.md"), pluginRoot: mirror });
      signAndArm(root, { toolName, toolInput: build("plugin-b.md"), pluginRoot: mirror });
      // Control: the untouched mirror is a stable identity, so the drift below is the content change alone.
      assert.equal(consume(root, toolName, build("plugin-a.md"), { pluginRoot: mirror }).status, "consumed");
      appendFileSync(join(mirror, "hooks", "guard-command-grammar.mjs"), "\n// drift\n");
      assertDriftRefusal(root, consume(root, toolName, build("plugin-b.md"), { pluginRoot: mirror }), "plugin", ["plugin"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(mirror, { recursive: true, force: true });
    }
  });

  test(`${toolName}: lifecycle state drift after arming fails closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("state.md") });
      writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({ continuity: { revision: 7 } }));
      assertDriftRefusal(root, consume(root, toolName, build("state.md")), "state", ["repository"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: replay of a consumed capability and of its signed proof fails closed`, () => {
    const root = fixture();
    try {
      const { recorded, plan, proof, shared } = signAndArm(root, { toolName, toolInput: build("replay.md") });
      // The explicit new contract: a native action plans under the v4 schema, not the legacy v3 one.
      assert.equal(plan.schema, "pipeline.human-guard-override-plan.v4");
      assert.equal(consume(root, toolName, build("replay.md")).status, "consumed");
      assert.equal(consume(root, toolName, build("replay.md")).status, "absent");
      let rearmed;
      try {
        rearmed = authorizeHumanGuardOverrideBySignature({
          ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: 12_000,
        });
      } catch (error) { rearmed = { status: "refused", code: error?.code }; }
      assert.notEqual(rearmed.status, "armed", `a consumed signature must not re-arm: ${JSON.stringify(rearmed)}`);
      assert.notEqual(consume(root, toolName, build("replay.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: audit-integrity drift after arming fails closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("audit.md") });
      const audit = auditPath(root);
      const tampered = readFileSync(audit, "utf8").replace('"type":"denied"', '"type":"allowed"');
      assert.notEqual(tampered, readFileSync(audit, "utf8"), "the fixture must actually alter the ledger");
      writeFileSync(audit, tampered, { mode: 0o600 });
      const result = consume(root, toolName, build("audit.md"));
      assert.equal(result.status, "invalid", JSON.stringify(result));
      assert.equal(result.code, "HGO-AUDIT");
      assert.notEqual(consume(root, toolName, build("audit.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Acceptance bullet 1: the native Edit tool is the third member of the closed file-action set
// (Edit, Write, apply_patch). The loops above drive Write and apply_patch; this one drives Edit.
// ---------------------------------------------------------------------------------------------

test("Edit: three independently signed disjoint actions are delivered sequentially without re-signing", () => {
  const root = fixture();
  try {
    const files = ["README.md", "existing-a.md", "existing-b.md"];
    for (const file of files) signAndArm(root, { toolName: "Edit", toolInput: editInput(file) });
    for (const file of files) {
      const consumed = consume(root, "Edit", editInput(file));
      assert.equal(consumed.status, "consumed", `${file}: ${JSON.stringify(consumed)}`);
      writeFileSync(join(root, file), "edited\n"); // the delivery changes whole-repository status for the next one
    }
    assert.notEqual(consume(root, "Edit", editInput(files[0])).status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Edit: an unrelated worktree edit does not invalidate, a target byte change fails closed", () => {
  const root = fixture();
  try {
    signAndArm(root, { toolName: "Edit", toolInput: editInput("README.md") });
    signAndArm(root, { toolName: "Edit", toolInput: editInput("existing-a.md") });
    writeFileSync(join(root, "unrelated-untracked.md"), "other action delivered\n");
    writeFileSync(join(root, "existing-b.md"), "modified elsewhere\n");
    assert.equal(consume(root, "Edit", editInput("README.md")).status, "consumed");
    writeFileSync(join(root, "existing-a.md"), "target bytes changed\n");
    assertDriftRefusal(root, consume(root, "Edit", editInput("existing-a.md")), "edit target byte", ["nativeTargets"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Acceptance bullet 1: HEAD/tree conditions are preserved at the signed arming boundary, while an
// unrelated worktree edit before arming does not void a signature over a disjoint action.
// ---------------------------------------------------------------------------------------------

for (const [toolName, build] of [["Write", writeInput], ["apply_patch", patchInput]]) {
  test(`${toolName}: HEAD movement between signing and arming is refused at the arming boundary`, () => {
    const root = fixture();
    try {
      const signed = signAndArm(root, { toolName, toolInput: build("arming-head.md"), arm: false });
      writeFileSync(join(root, "moved.md"), "x\n");
      git(root, "add", "moved.md");
      git(root, "commit", "-q", "-m", "move head before arming");
      const outcome = armSigned(signed, 3000);
      assert.notEqual(outcome.status, "armed", JSON.stringify(outcome));
      assert.equal(outcome.code, "HGO-CANDIDATE-DRIFT", JSON.stringify(outcome));
      assert.notEqual(consume(root, toolName, build("arming-head.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: target byte drift between signing and arming is refused at the arming boundary`, () => {
    const root = fixture();
    try {
      const signed = signAndArm(root, { toolName, toolInput: build("existing-a.md"), arm: false });
      writeFileSync(join(root, "existing-a.md"), "target bytes changed before arming\n");
      const outcome = armSigned(signed, 3000);
      assert.notEqual(outcome.status, "armed", JSON.stringify(outcome));
      assert.equal(outcome.code, "HGO-NATIVE-TARGET-DRIFT", JSON.stringify(outcome));
      assert.notEqual(consume(root, toolName, build("existing-a.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: an unrelated worktree edit between signing and arming still arms and consumes`, () => {
    const root = fixture();
    try {
      const signed = signAndArm(root, { toolName, toolInput: build("arming-disjoint.md"), arm: false });
      writeFileSync(join(root, "unrelated-before-arming.md"), "another action delivered\n");
      const outcome = armSigned(signed, 3000);
      assert.equal(outcome.status, "armed", JSON.stringify(outcome));
      assert.equal(consume(root, toolName, build("arming-disjoint.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Acceptance bullet 2: every Bash action and a plugin installation stay on the legacy contract.
// ---------------------------------------------------------------------------------------------

test("Bash: whole-repository binding -- an unrelated worktree edit between arming and consumption fails closed", () => {
  const root = fixture();
  try {
    const commands = ["node --version", "node --help", "node --v8-options"].map((command) => ({ command }));
    const armed = commands.map((toolInput) => signAndArm(root, { toolName: "Bash", toolInput }));
    // Legacy contract stays explicit: a Bash action is never planned under the native v4 schema.
    for (const { plan } of armed) assert.equal(plan.schema, "pipeline.human-guard-override-plan.v3");
    // Control: with the worktree untouched since arming, the first action is consumed.
    assert.equal(consume(root, "Bash", commands[0]).status, "consumed");
    // An unrelated authorized worktree edit lands (for instance the delivery of the preceding action).
    writeFileSync(join(root, "unrelated-delivery.md"), "preceding action delivered\n");
    assertDriftRefusal(root, consume(root, "Bash", commands[1]), "second Bash action", ["repository"], armed[1].recorded.requestSha256);
    assertDriftRefusal(root, consume(root, "Bash", commands[2]), "third Bash action", ["repository"], armed[2].recorded.requestSha256);
    // Serial dependence in practice: only a fresh denial and signature, taken after the delivery, is consumable.
    signAndArm(root, { toolName: "Bash", toolInput: commands[1], nowMs: 20_000 });
    assert.equal(consume(root, "Bash", commands[1], { nowMs: 30_000 }).status, "consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A closed codex registry: the host's real marketplace registration must not decide this test's outcome. */
function withClosedCodexRegistry(fn) {
  const dir = mkdtempSync(join(scratchBase(), "hgo-codex-"));
  if (process.platform === "win32") copyFileSync(process.execPath, join(dir, "codex.exe"));
  else { writeFileSync(join(dir, "codex"), "#!/bin/sh\nexit 1\n"); chmodSync(join(dir, "codex"), 0o755); }
  // A worker thread gets a plain-object copy of the environment, which is case-sensitive even on win32
  // ("Path"), so the existing spelling of the variable is reused rather than adding a second "PATH".
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const original = process.env[key];
  process.env[key] = `${dir}${delimiter}${original ?? ""}`;
  try { return fn(); }
  finally { process.env[key] = original; rmSync(dir, { recursive: true, force: true }); }
}

test("plugin installation: binding follows the attested install source, planned on the legacy v3 contract, never target-bound", () => {
  withClosedCodexRegistry(() => {
    const root = fixture({ pushApproval: "chat" });
    try {
      mkdirSync(join(root, "harness", "scripts"), { recursive: true });
      mkdirSync(join(root, "plugins", "pipeline-core", ".codex-plugin"), { recursive: true });
      mkdirSync(join(root, ".claude-plugin"), { recursive: true });
      writeFileSync(join(root, "harness", "scripts", "verify.mjs"), "// verify\n");
      writeFileSync(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"), JSON.stringify({ name: "pipeline-core", version: "0.0.0-test" }));
      const marketplace = (extra = {}) => JSON.stringify({
        name: "agent-pipeline",
        plugins: [{ name: "pipeline-core", source: "./plugins/pipeline-core" }],
        ...extra,
      });
      writeFileSync(join(root, ".claude-plugin", "marketplace.json"), marketplace());
      const toolInput = { command: "codex plugin add pipeline-core@agent-pipeline-local" };
      const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: SCRIPT_PATH };
      const arm = (nowMs) => {
        const recorded = recordHumanGuardDenial({ ...shared, toolName: "Bash", toolInput, denials: denial, nowMs });
        assert.equal(recorded.status, "planned", JSON.stringify(recorded));
        const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: nowMs + 500 });
        assert.equal(plan.mode, "global-plugin-install");
        assert.equal(plan.schema, "pipeline.human-guard-override-plan.v3");
        const reason = "PO approves the exact local plugin installation (AC-160 fixture)";
        const prepared = prepareHumanGuardOverrideAuthorization({
          ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason, nowMs: nowMs + 1000,
        });
        // Arming a plugin installation is the attended-terminal ceremony (CHAT-GATE-NOT-ATTENDED: it takes a real
        // TTY and offers no injectable seam), so this case pins the contract at the planning boundary only.
        assert.equal(typeof prepared.selectionSha256, "string");
        return plan;
      };
      const plan = arm(1000);
      // A capability's schema follows its plan's schema, and only the native Edit/Write/apply_patch plan is
      // target-bound: a plugin installation keeps the strict whole-repository (install-source) binding.
      assert.equal(Object.hasOwn(plan, "nativeTargets"), false, "a plugin installation must never plan target-bound preimages");
      // OPEN (evidence, not a failure of this case): consumption-time drift of the attested install source needs
      // an armed capability, which only the attended-terminal ceremony can produce.
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Acceptance bullet 4: the signing preparer discloses the serial dependence of status-bound actions.
// ---------------------------------------------------------------------------------------------

test("AC-160 serial-dependence disclosure: status-bound Bash signing preparation discloses it, a native Write does not", () => {
  const root = fixture();
  try {
    // The disclosure index is judged against the wall clock, so this case records with the real time.
    const nowMs = Date.now();
    const disclosure = (toolName, toolInput) => {
      const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: SCRIPT_PATH };
      const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials: denial, nowMs });
      assert.equal(recorded.status, "planned", JSON.stringify(recorded));
      const prepared = prepareHumanGuardOverrideForSignature({
        ...shared,
        requestSha256: recorded.requestSha256,
        nowMs: nowMs + 500,
        humanApprovalScriptPath: join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs"),
      });
      const described = describeHumanGuardOverrideSelection({ ...shared, intentSha256: prepared.intentSha256 });
      assert.equal(described.resolved, true, JSON.stringify(described));
      return described.lines;
    };
    const bash = disclosure("Bash", { command: "node --version" });
    assert.match(bash[0], /^recorded request: pipeline\.human-guard-override-request\.v3 \(tool Bash/u);
    const serial = bash.filter((line) => /serial/iu.test(line));
    assert.equal(serial.length, 1, JSON.stringify(bash));
    assert.equal(
      serial[0],
      "legacy whole-worktree binding: sign and deliver serially; unrelated worktree edits invalidate this authorization",
    );
    const native = disclosure("Write", writeInput("native-disclosure.md"));
    assert.match(native[0], /^recorded request: pipeline\.human-guard-override-request\.v5 \(tool Write/u);
    assert.equal(native.some((line) => /serial|whole-worktree/iu.test(line)), false, JSON.stringify(native));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Worker entry and eager scheduling (see the execution model above). Registration is complete here.
// ---------------------------------------------------------------------------------------------

if (!isMainThread) {
  const body = CASES.get(workerData?.hgoCase);
  let message;
  if (typeof body !== "function") {
    message = { ok: false, message: `unknown case: ${workerData?.hgoCase}` };
  } else {
    let skipped = null;
    try {
      body({ skip: (reason) => { skipped = String(reason ?? "skipped"); } });
      message = { ok: true, skipped };
    } catch (error) {
      message = { ok: false, message: String(error?.stack ?? error) };
    }
  }
  parentPort.postMessage(message);
} else if (!process.execArgv.some((arg) => arg.startsWith("--test-name-pattern") || arg.startsWith("--test-skip-pattern"))) {
  // Start every body now so the pool overlaps them; with a name filter only the selected cases start (lazily).
  for (const name of CASES.keys()) void runCase(name);
}
