// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.feature-branch-push-admitted-without-signature-approval (AC-172).
 *
 * Original acceptance (backlog item, Description/Proposal):
 *   A1. In `signature` mode a push of ANY branch without a current, commit-bound approval is
 *       refused -- including a feature-branch checkpoint push (the previously unsigned lane).
 *   A2. The non-release prerequisite set is slimmed to the approval alone: a checkpoint push
 *       with a valid signed approval is admitted with NO Verify/security/Critic evidence.
 *   A3. The approval must be bound to this exact commit, remote and destination, current, and
 *       carry a verifying Ed25519 proof (a stale / rebound / expired / forged one is refused).
 *   A4. The pre-push hook mirrors the lane: it enforces the same approval (it used to verify none).
 *   A5. Release/main promotion keeps the full chain; `chat` mode is unchanged.
 *
 * Every case spawns the REAL session guard (hooks/guard-push.mjs) or the REAL rendered
 * pre-push hook implementation against a real throwaway repository with a freshly generated
 * Ed25519 key and a real signature. Nothing about the behaviour under test is mocked.
 * Fixtures live under the repository's scratch/ (never the OS temp dir). No case here needs
 * directory mode bits or directory symlinks, so none is skipped on native Windows.
 *
 * The final case is a mutation canary: a scratch MIRROR of the plugin with the guard's
 * signature-mode branch disabled must ADMIT the unapproved checkpoint, proving the A1 case can
 * go RED. Production is never edited.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criticalActionSha256, criticalActionSubjectSha256 } from "../critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../po-approval-proof.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { renderImpl } from "../../scripts/pre-push-hook-install.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch", `pin-fbp-${process.pid}-${Date.now()}`);
mkdirSync(SCRATCH, { recursive: true });
after(() => { rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 3 }); });

const BRANCH = "feat/checkpoint";
const DEST = `refs/heads/${BRANCH}`;
const CMD = `git push origin ${BRANCH}:${DEST}`;
const STATE_REL = ".claude/pipeline-state.json";
const POLICY_REL = "project/critical-human-proof.json";
const TM_REL = "project/push-threat-model.md";
const TM_BODY = "# fixture threat model\n";
const FEATURE = "fixture-feature";
const PLAN_SHA = "c".repeat(64);
const SPEC_SHA = "d".repeat(64);
const ZERO40 = "0".repeat(40);
const NEEDS = /signature mode requires a current approval bound to this exact commit, remote and destination/;

const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const canonical = (v) => Array.isArray(v)
  ? `[${v.map(canonical).join(",")}]`
  : v !== null && typeof v === "object"
    ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
    : JSON.stringify(v);

let counter = 0;
function put(dir, rel, text) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}
const gitAt = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

function operatorKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: sha256(publicPem) };
}

/**
 * Feature-branch repo whose HEAD is an intent-bearing checkpoint commit. `signedFor`:
 * "head" | "parent" (stale) | "none". `mode`: "signature" | "chat" (committed push waiver).
 * With a signed approval the state record is rewritten AFTER the commit, leaving the single
 * ` M <state>` entry a real approve-push leaves behind.
 */
function checkpointRepo(label, {
  signedFor = "head", mode = "signature", remote = "origin", destination = DEST,
  expiresAt = "2099-01-01T00:00:00.000Z", anchorKey = null, forgeSignature = false,
} = {}) {
  const dir = join(SCRATCH, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  gitAt(dir, "init", "-q", "-b", "main");
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "pin-fixture" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  gitAt(dir, "config", "user.email", "goldfish@example.invalid");
  gitAt(dir, "config", "user.name", "Goldfish");
  gitAt(dir, "config", "commit.gpgSign", "false");
  put(dir, "README.md", "fixture\n");
  gitAt(dir, "add", "README.md");
  gitAt(dir, "commit", "-q", "-m", "init");
  gitAt(dir, "checkout", "-q", "-b", BRANCH);

  const key = operatorKey();
  const anchor = anchorKey ?? key;
  put(dir, ".claude/pipeline.yaml",
    "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n"
    + "pushDestinationPolicy:\n  schema: pipeline.push-destination-policy.v1\n  checkpointNamespace: refs/heads/feat/\n");
  if (mode === "signature") {
    put(dir, POLICY_REL, `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push", "deploy", "publication"],
      trustAnchor: { keyReference: "po-key-1", publicKeySha256: anchor.publicKeySha256 },
    }, null, 2)}\n`);
  } else {
    put(dir, POLICY_REL, `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v2",
      requiredKinds: ["push", "deploy", "publication"],
      waivedKinds: [{ kind: "push", reason: "operator decision recorded for this fixture" }],
    }, null, 2)}\n`);
  }
  put(dir, TM_REL, TM_BODY);
  const baseState = {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
  };
  put(dir, STATE_REL, JSON.stringify(baseState));
  gitAt(dir, "add", "-A");
  gitAt(dir, "commit", "-q", "-m", "fixture: base");
  const parent = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  put(dir, "checkpoint.txt", "checkpoint\n");
  gitAt(dir, "add", "checkpoint.txt");
  gitAt(dir, "commit", "-q", "-m", "checkpoint\n\nCheckpoint-Intent: remote backup before refactor");
  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();

  if (signedFor !== "none") {
    const commit = signedFor === "parent" ? parent : head;
    const candidate = { commit, tree: gitAt(dir, "rev-parse", `${commit}^{tree}`).stdout.trim() };
    const threatModel = { path: TM_REL, sha256: sha256(TM_BODY) };
    const action = {
      kind: "push",
      subjectSha256: criticalActionSubjectSha256({
        kind: "push", candidate, subject: { sourceCommit: commit, remote, destination, threatModel },
      }),
      expiresAt,
    };
    const intent = createPoApprovalIntent({
      kind: "critical-action", featureId: FEATURE, planSha256: PLAN_SHA, specSha256: SPEC_SHA, candidate,
      policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved",
    });
    const signed = forgeSignature ? "not the signed intent" : intent.sha256;
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: intent.sha256,
      keyReference: "po-key-1",
      publicKey: key.publicPem,
      signatureBase64: sign(null, Buffer.from(signed, "utf8"), key.privateKey).toString("base64"),
    };
    const proofSha256 = sha256(canonical(proof));
    put(dir, STATE_REL, JSON.stringify({
      ...baseState,
      pushApproval: {
        lastApproved: {
          approvedBy: "po-test", approvedAt: "2026-08-06T06:00:00.000Z", forCommit: commit,
          criticalProof: { proofSha256, intentSha256: intent.sha256, action, proof },
          remote, destination, threatModel,
        },
      },
      criticalProofConsumption: [{ proofSha256, kind: "push", consumedAt: "2026-08-06T06:00:00.000Z" }],
    }));
  }
  return { dir, head, parent };
}

function runGuard(command, dir, pluginRoot = PLUGIN_ROOT) {
  const res = spawnSync(process.execPath, [join(pluginRoot, "hooks", "guard-push.mjs")], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

/** Runs the REAL rendered pre-push hook implementation exactly as git would (stdin = ref updates). */
function runHook(dir, head, { remote = "origin" } = {}) {
  const home = join(dir, ".git", "fixture-home");
  const controller = createGovernanceScopeController({ hostStateRoot: join(home, ".local", "state", "agent-pipeline", "activation") });
  const probe = controller.observe({ rootDir: dir });
  if (!probe.requiresEnforcement) {
    const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "pin-fixture" });
    controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  }
  const implFile = join(SCRATCH, `hook-impl-${counter++}.mjs`);
  writeFileSync(implFile, renderImpl(join(PLUGIN_ROOT, "lib")));
  const res = spawnSync(process.execPath, [implFile, remote, "https://example.invalid/repo.git"], {
    cwd: dir,
    input: `${DEST} ${head} ${DEST} ${ZERO40}\n`,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// ---- A1: signature mode, no current commit-bound approval -> refused --------------------------
test("A1 guard: a signature-mode feature-checkpoint push with no approval record is refused", () => {
  const { dir } = checkpointRepo("a1a", { signedFor: "none" });
  const r = runGuard(CMD, dir);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, NEEDS);
  assert.match(r.stderr, /CHECKPOINT-APPROVAL-STALE/);
  assert.equal(existsSync(join(dir, ".git", "agent-pipeline", "feature-checkpoint-audit.jsonl")), false, "a refused push writes no audit record");
});

test("A1 guard: a stale approval (recorded for the parent commit) is refused", () => {
  const { dir } = checkpointRepo("a1b", { signedFor: "parent" });
  const r = runGuard(CMD, dir);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, NEEDS);
  assert.match(r.stderr, /CHECKPOINT-APPROVAL-STALE/);
});

test("A1 guard: pushes outside the checkpoint namespace (main, other branch, tag) are refused without evidence or approval", () => {
  const { dir } = checkpointRepo("a1c", { signedFor: "none" });
  const main = runGuard(`git push origin ${BRANCH}:refs/heads/main`, dir);
  assert.equal(main.code, 2, main.stderr);
  const other = runGuard(`git push origin ${BRANCH}:refs/heads/topic/other`, dir);
  assert.equal(other.code, 2, other.stderr);
  assert.doesNotMatch(other.stderr, /feature checkpoint/);
  const tag = runGuard(`git push origin ${BRANCH}:refs/tags/v0.0.1`, dir);
  assert.equal(tag.code, 2, tag.stderr);
});

// ---- A2: the approval alone suffices (slim prerequisites) -------------------------------------
test("A2 guard: a valid commit-bound signed approval admits the checkpoint with no Verify/security evidence", () => {
  const { dir, head } = checkpointRepo("a2");
  assert.equal(gitAt(dir, "status", "--porcelain").stdout.replace(/\r?\n$/u, ""), ` M ${STATE_REL}`, "premise: only the approval record is dirty");
  assert.equal(existsSync(join(dir, "evidence")), false, "premise: no evidence directory exists");
  const r = runGuard(CMD, dir);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stderr.trim(), "");
  const audit = join(dir, ".git", "agent-pipeline", "feature-checkpoint-audit.jsonl");
  assert.ok(readFileSync(audit, "utf8").includes(head), "audit record names the pushed commit");
});

// ---- A3: approval binding and proof strength ---------------------------------------------------
test("A3 guard: approvals bound to another destination, another remote, or expired are refused", () => {
  const rebound = checkpointRepo("a3a", { destination: "refs/heads/feat/other" });
  const r1 = runGuard(CMD, rebound.dir);
  assert.equal(r1.code, 2, r1.stderr);
  assert.match(r1.stderr, /CHECKPOINT-APPROVAL-BINDING/);
  const remote = checkpointRepo("a3b", { remote: "upstream" });
  const r2 = runGuard(CMD, remote.dir);
  assert.equal(r2.code, 2, r2.stderr);
  assert.match(r2.stderr, /CHECKPOINT-APPROVAL-BINDING/);
  assert.doesNotMatch(r2.stderr, /upstream/, "the remote operand is never echoed");
  const expired = checkpointRepo("a3c", { expiresAt: "2026-01-01T00:00:00.000Z" });
  const r3 = runGuard(CMD, expired.dir);
  assert.equal(r3.code, 2, r3.stderr);
  assert.match(r3.stderr, /PUSH-PROOF-EXPIRED/);
});

test("A3 guard: a forged signature and an un-anchored signing key are refused", () => {
  const forged = checkpointRepo("a3d", { forgeSignature: true });
  const r1 = runGuard(CMD, forged.dir);
  assert.equal(r1.code, 2, r1.stderr);
  assert.match(r1.stderr, /PUSH-PROOF-SIGNATURE-MISMATCH/);
  const foreign = checkpointRepo("a3e", { anchorKey: operatorKey() });
  const r2 = runGuard(CMD, foreign.dir);
  assert.equal(r2.code, 2, r2.stderr);
  assert.match(r2.stderr, /PUSH-PROOF-TRUST-MISMATCH/);
});

test("A3 guard: the approval is no excuse for any other dirt in the tree", () => {
  const { dir } = checkpointRepo("a3f");
  put(dir, "stray-untracked.txt", "stray\n");
  const r = runGuard(CMD, dir);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /checkpoint working tree is not clean/);
});

// ---- A4: the installed pre-push hook enforces the same approval --------------------------------
test("A4 hook: signature mode, no approval -> blocked, and no publication evidence is demanded", () => {
  const { dir, head } = checkpointRepo("a4a", { signedFor: "none" });
  const r = runHook(dir, head);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stderr, NEEDS);
  assert.match(r.stderr, /CHECKPOINT-APPROVAL-STALE/);
  assert.doesNotMatch(r.stderr, /verify-latest|security-latest/);
});

test("A4 hook: stale, rebound and forged approvals are blocked", () => {
  const stale = checkpointRepo("a4b", { signedFor: "parent" });
  const r1 = runHook(stale.dir, stale.head);
  assert.equal(r1.code, 1, r1.stderr);
  assert.match(r1.stderr, /CHECKPOINT-APPROVAL-STALE/);
  const rebound = checkpointRepo("a4c", { destination: "refs/heads/feat/other" });
  const r2 = runHook(rebound.dir, rebound.head);
  assert.equal(r2.code, 1, r2.stderr);
  assert.match(r2.stderr, /CHECKPOINT-APPROVAL-BINDING/);
  const forged = checkpointRepo("a4d", { forgeSignature: true });
  const r3 = runHook(forged.dir, forged.head);
  assert.equal(r3.code, 1, r3.stderr);
  assert.match(r3.stderr, /PUSH-PROOF-SIGNATURE-MISMATCH/);
});

test("A4 hook: a valid approval admits the checkpoint with no Verify evidence", () => {
  const { dir, head } = checkpointRepo("a4e");
  const r = runHook(dir, head);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(existsSync(join(dir, "evidence")), false);
});

// ---- A5: chat mode unchanged --------------------------------------------------------------------
test("A5 guard: chat mode (committed push waiver) keeps admitting a clean exact checkpoint without an approval", () => {
  const { dir } = checkpointRepo("a5", { mode: "chat", signedFor: "none" });
  const r = runGuard(CMD, dir);
  assert.equal(r.code, 0, r.stderr);
});

// ---- Mutation canary: the A1 case can go RED ---------------------------------------------------
test("CANARY a scratch mirror with the signature-mode approval branch disabled admits the unapproved checkpoint", () => {
  const mirror = join(SCRATCH, "mirror-plugin");
  cpSync(PLUGIN_ROOT, mirror, {
    recursive: true,
    filter: (src) => !/[\\/]node_modules([\\/]|$)/u.test(src),
  });
  const guardPath = join(mirror, "hooks", "guard-push.mjs");
  const text = readFileSync(guardPath, "utf8");
  const needle = "  if (checkpointSignatureMode) {\n    // Same state source as the protected lane's approval check";
  assert.ok(text.includes(needle), "mutation anchor present in the mirror");
  writeFileSync(guardPath, text.replace(needle, "  if (false) {\n    // Same state source as the protected lane's approval check"));
  const { dir } = checkpointRepo("canary", { signedFor: "none" });
  const mutated = runGuard(CMD, dir, mirror);
  assert.equal(mutated.code, 0, `mutant must admit (this is the RED the real A1 case guards against): ${mutated.stderr}`);
  const real = runGuard(CMD, dir);
  assert.equal(real.code, 2, "the unmutated production guard still refuses the same fixture");
});
