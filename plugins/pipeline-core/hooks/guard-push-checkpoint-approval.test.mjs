// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-checkpoint-approval.test.mjs -- guard-level suite for PUSHSIG slice S2.
 *
 * Design: specs/sprint-alfred-epic/design/feature-branch-push-signature-design.md (sections
 * 2, 3.3, 3.4 and the guard-level cases C1-C12 of section 5). Run:
 *   node plugins/pipeline-core/hooks/guard-push-checkpoint-approval.test.mjs
 * Exit: 0 = all cases pass, 1 = at least one case failed (the failure list is printed).
 *
 * WHAT IS PINNED. In `signature` mode a feature-checkpoint push (the lower-rigor lane that
 * needs no Verify, security or Critic evidence) additionally needs a CURRENT Ed25519 `push`
 * approval bound to exactly this commit, remote and destination. `chat` and `standing-approved`
 * keep today's behaviour, and every protected lane (main, release, tag, force, malformed
 * policy) is untouched. Evidence files are deliberately ABSENT in every case: the point of
 * the lane is that the approval, not the evidence chain, is what it adds.
 *
 * FIXTURES ARE REAL. Every spawn is a subprocess of the real guard in a fresh temp repository
 * (the style of guard-push.test.mjs). The signed fixtures use a freshly generated throwaway
 * Ed25519 keypair and a real signature over the real subject digest, because a fixture that
 * faked the crypto would assert nothing about the property claimed. No real key is involved.
 *
 * WHY THE STATE FILE IS COMMITTED BEFORE IT IS SIGNED. `approve-push` rewrites the tracked
 * state record AFTER the signed subject was computed, so the record can never be inside the
 * commit it covers. The realistic post-approval picture is therefore a tracked state file
 * that is modified in the work tree (` M <state>`), which is the one dirty entry the lane
 * tolerates in `signature` mode (design 3.4). Fixtures reproduce exactly that.
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCheckpointPorcelain } from "../lib/checkpoint-push-approval.mjs";
import { createCriticalActionApprovalRequest, criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { run as runPipelineState } from "../scripts/pipeline-state.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];
const BLOCK = 2;
const ALLOW = 0;

const BRANCH = "feat/checkpoint";
const DEST = `refs/heads/${BRANCH}`;
const CHECKPOINT_CMD = `git push origin ${BRANCH}:${DEST}`;
const STATE_REL = ".claude/pipeline-state.json";
const POLICY_REL = "project/critical-human-proof.json";
const THREAT_MODEL_REL = "project/push-threat-model.md";
const FEATURE_ID = "fixture-feature";
const PLAN_SHA = "c".repeat(64);
const SPEC_SHA = "d".repeat(64);
const CHECKPOINT_POLICY_YAML =
  "pushDestinationPolicy:\n  schema: pipeline.push-destination-policy.v1\n  checkpointNamespace: refs/heads/feat/\n";

// ---- fixture plumbing --------------------------------------------------------------------

function enrollFixtureGovernance(root) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture governance was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function put(dir, rel, text) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-ckpt-${prefix}-`));
  ALL_DIRS.push(dir);
  const initialized = gitAt(dir, "init", "-q", "-b", "main");
  if (initialized.status !== 0) throw new Error(`fixture Git initialization failed: ${initialized.stderr}`);
  enrollFixtureGovernance(dir);
  gitAt(dir, "config", "user.email", "goldfish@example.invalid");
  gitAt(dir, "config", "user.name", "Goldfish");
  gitAt(dir, "config", "commit.gpgSign", "false");
  put(dir, "README.md", "fixture\n");
  gitAt(dir, "add", "README.md");
  gitAt(dir, "commit", "-q", "-m", "init");
  return dir;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function pushKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: sha256(publicPem) };
}

function manifestYaml({ approval }) {
  return `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: ${approval}\n${CHECKPOINT_POLICY_YAML}`;
}

const PUSH_WAIVER = {
  schema: "pipeline.critical-human-proof-policy.v2",
  requiredKinds: ["push", "deploy", "publication"],
  waivedKinds: [{ kind: "push", reason: "operator decision recorded for this fixture" }],
};

/**
 * A feature-branch repository whose HEAD is an intent-bearing checkpoint commit, with the
 * proof policy, threat model and a PLACEHOLDER state record all committed BEFORE the
 * checkpoint commit. Afterwards the state record is rewritten with the signed approval, so
 * `git status --porcelain` reads exactly ` M .claude/pipeline-state.json`, which is what a
 * real `approve-push` leaves behind. Every knob a negative case needs to move is an option,
 * so each fixture differs from the allow case in exactly one respect.
 *
 * mode:      "signature" (anchored policy) | "chat" (push waiver) | "standing" (approval:
 *            standing-approved) | "unreadable-policy" (committed policy that is not JSON)
 * signedFor: "head" (the pushed commit) | "parent" (a stale approval) | "none" (no approval)
 * stateMode: "tracked" (committed placeholder, then modified) | "ignored" (never committed,
 *            excluded, so the tree is perfectly clean) | "absent" (no state file at all)
 */
function checkpointRepo(prefix, {
  key = pushKeypair(), anchorKey = null, remote = "origin", destination = DEST,
  expiresAt = "2099-01-01T00:00:00.000Z", signedFor = "head", mode = "signature",
  stateMode = "tracked", intent = true, threatModelBody = "# fixture threat model\n",
  signedThreatModelBody = null, recordProof = true, consume = true,
  mutateApproval = null, mutateProof = null,
} = {}) {
  const dir = freshRepo(prefix);
  gitAt(dir, "checkout", "-q", "-b", BRANCH);
  put(dir, ".claude/pipeline.yaml", manifestYaml({ approval: mode === "standing" ? "standing-approved" : "required" }));
  const anchor = anchorKey ?? key;
  if (mode === "signature") {
    put(dir, POLICY_REL, `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push", "deploy", "publication"],
      trustAnchor: { keyReference: "po-key-1", publicKeySha256: anchor.publicKeySha256 },
    }, null, 2)}\n`);
  } else if (mode === "chat") {
    put(dir, POLICY_REL, `${JSON.stringify(PUSH_WAIVER, null, 2)}\n`);
  } else if (mode === "unreadable-policy") {
    put(dir, POLICY_REL, "{ this is not json\n");
  }
  put(dir, THREAT_MODEL_REL, threatModelBody);

  const baseState = {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE_ID },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
  };
  if (stateMode === "ignored") {
    mkdirSync(join(dir, ".git", "info"), { recursive: true });
    appendFileSync(join(dir, ".git", "info", "exclude"), `${STATE_REL}\n`);
  }
  if (stateMode !== "absent") put(dir, STATE_REL, JSON.stringify(baseState));
  gitAt(dir, "add", "-A");
  gitAt(dir, "commit", "-q", "-m", "fixture: base");
  const parent = gitAt(dir, "rev-parse", "HEAD").stdout.trim();

  put(dir, "checkpoint.txt", "checkpoint\n");
  gitAt(dir, "add", "checkpoint.txt");
  gitAt(dir, "commit", "-q", "-m", intent ? "checkpoint\n\nCheckpoint-Intent: remote backup before refactor" : "checkpoint");
  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();

  if (signedFor !== "none" && stateMode !== "absent") {
    const signedCommit = signedFor === "parent" ? parent : head;
    const candidate = { commit: signedCommit, tree: gitAt(dir, "rev-parse", `${signedCommit}^{tree}`).stdout.trim() };
    const threatModel = { path: THREAT_MODEL_REL, sha256: sha256(signedThreatModelBody ?? threatModelBody) };
    const action = {
      kind: "push",
      subjectSha256: criticalActionSubjectSha256({
        kind: "push", candidate,
        subject: { sourceCommit: candidate.commit, remote, destination, threatModel },
      }),
      expiresAt,
    };
    const approvalIntent = createPoApprovalIntent({
      kind: "critical-action", featureId: FEATURE_ID, planSha256: PLAN_SHA, specSha256: SPEC_SHA, candidate,
      policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved",
    });
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: approvalIntent.sha256,
      keyReference: "po-key-1",
      publicKey: key.publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), key.privateKey).toString("base64"),
    };
    if (mutateProof) mutateProof(proof, { key });
    const proofSha256 = sha256(canonicalJson(proof));
    const approval = {
      approvedBy: "po-test", approvedAt: "2026-08-06T06:00:00.000Z", forCommit: candidate.commit,
      criticalProof: { proofSha256, intentSha256: approvalIntent.sha256, action, ...(recordProof ? { proof } : {}) },
      remote, destination, threatModel,
    };
    if (mutateApproval) mutateApproval(approval);
    put(dir, STATE_REL, JSON.stringify({
      ...baseState,
      pushApproval: { lastApproved: approval },
      criticalProofConsumption: consume ? [{ proofSha256, kind: "push", consumedAt: "2026-08-06T06:00:00.000Z" }] : [],
    }));
  }
  return { dir, head, parent, key };
}

function runGuard(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];

function record(id, problems) {
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}

function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes, stderrEmpty } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 300)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 300)}`);
  }
  for (const needle of [].concat(stderrNotIncludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 200)}`);
  record(id, problems);
}

const auditPath = (dir) => join(dir, ".git", "agent-pipeline", "feature-checkpoint-audit.jsonl");
const auditText = (dir) => (existsSync(auditPath(dir)) ? readFileSync(auditPath(dir), "utf8") : "");

const NEEDS_APPROVAL = "signature mode requires";
const NOT_CLEAN = "checkpoint working tree is not clean";

// ---- C1: signature mode, no approval -> BLOCK (the flip of today's ALLOW) -------------------
{
  const { dir } = checkpointRepo("c1a", { signedFor: "none" });
  check("C1a block signature-mode checkpoint with a state record but no approval", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: ["BLOCKED (guard-push feature checkpoint)", NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-STALE"],
  });
  record("C1a no audit record is written for a refused checkpoint", auditText(dir) === "" ? [] : ["audit ledger exists although the push was refused"]);
}
{
  const { dir } = checkpointRepo("c1b", { stateMode: "absent" });
  check("C1b block signature-mode checkpoint when no state record exists at all", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-STATE-MISSING"],
  });
}

// ---- C2: a stale approval (recorded for the parent commit) -> BLOCK -------------------------
{
  const { dir } = checkpointRepo("c2", { signedFor: "parent" });
  check("C2 block an approval recorded for the parent commit, not the pushed one", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-STALE"],
  });
}

// ---- C3: a valid signed approval, no Verify/security evidence -> ALLOW ----------------------
{
  const { dir, head } = checkpointRepo("c3", { stateMode: "ignored" });
  check("C3 allow a valid signed approval on a perfectly clean tree, with no Verify/security evidence", CHECKPOINT_CMD, dir, ALLOW, { stderrEmpty: true });
  record("C3 the admitted checkpoint's audit record names the pushed commit", auditText(dir).includes(head) ? [] : ["audit ledger is missing the pushed commit"]);
  record("C3 premise: the fixture really carries no Verify or security evidence",
    !existsSync(join(dir, "evidence", "verify-latest.json")) && !existsSync(join(dir, "evidence", "security-latest.json")) ? [] : ["evidence file present"]);
}

// ---- C4: approval bound to another destination / another remote -> BLOCK --------------------
{
  const { dir } = checkpointRepo("c4a", { destination: "refs/heads/feat/other" });
  check("C4a block an approval given for another destination ref", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-BINDING"],
  });
}
{
  const { dir } = checkpointRepo("c4b", { remote: "upstream" });
  check("C4b block an approval given for another remote, and never echo that remote", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-BINDING"],
    stderrNotIncludes: ["upstream"],
  });
}

// ---- C5: an expired approval -> BLOCK -------------------------------------------------------
{
  const { dir } = checkpointRepo("c5", { expiresAt: "2026-01-01T00:00:00.000Z" });
  check("C5 block an approval whose proof has expired", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-EXPIRED"],
  });
}

// ---- C6: a record that does not carry a verifying signature -> BLOCK ------------------------
{
  // Fields rewritten to agree with the push while the signed subject still names another ref:
  // the binding fields alone cannot catch this, the recomputed subject digest does.
  const { dir } = checkpointRepo("c6a", {
    destination: "refs/heads/feat/other",
    mutateApproval: (approval) => { approval.destination = DEST; },
  });
  check("C6a block a record whose stated binding contradicts the signed subject", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-SUBJECT-MISMATCH"],
  });
}
{
  const { dir } = checkpointRepo("c6b", { recordProof: false });
  check("C6b block an approval record that carries no proof object", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-RECORD-INCOMPLETE"],
  });
}
{
  const { dir } = checkpointRepo("c6c", {
    mutateProof: (proof, { key }) => {
      proof.signatureBase64 = sign(null, Buffer.from("not the signed intent", "utf8"), key.privateKey).toString("base64");
    },
  });
  check("C6c block an approval whose signature does not verify over the signed intent", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-SIGNATURE-MISMATCH"],
  });
}
{
  const { dir } = checkpointRepo("c6d", { anchorKey: pushKeypair() });
  check("C6d block a record signed by a key the project never anchored", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-TRUST-MISMATCH"],
  });
}
{
  const { dir } = checkpointRepo("c6e", { consume: false });
  check("C6e block an approval whose proof was never consumed by the approval writer", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-NOT-CONSUMED"],
  });
}

// ---- C7: the bound threat model changed after approval -> BLOCK -----------------------------
{
  // The committed bytes differ from the digest the signature covers, which is exactly what an
  // edit after approval looks like; editing the tracked file in place would instead trip the
  // clean-tree check first and prove nothing about this property.
  const { dir } = checkpointRepo("c7", { threatModelBody: "# threat model as committed\n", signedThreatModelBody: "# threat model as signed\n" });
  check("C7 block when the bound threat model no longer matches the signed digest", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "PUSH-PROOF-THREAT-MODEL"],
  });
}

// ---- C8: chat and standing-approved keep today's behaviour -> ALLOW without an approval -----
{
  const { dir } = checkpointRepo("c8a", { mode: "chat", signedFor: "none" });
  check("C8a allow a chat-waived checkpoint without any approval (unchanged)", CHECKPOINT_CMD, dir, ALLOW, { stderrEmpty: true });
}
{
  const { dir } = checkpointRepo("c8b", { mode: "standing", signedFor: "none", stateMode: "absent" });
  check("C8b allow a standing-approved checkpoint without any approval (unchanged)", CHECKPOINT_CMD, dir, ALLOW, { stderrEmpty: true });
}

// ---- C9: every protected lane is unchanged; an approval is not sufficient there -------------
{
  const { dir } = checkpointRepo("c9a", { signedFor: "none" });
  check("C9a block main never receives checkpoint relaxation", `git push origin ${BRANCH}:refs/heads/main`, dir, BLOCK, {
    stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"],
  });
  check("C9a block tags remain on the strict evidence lane", `git push origin ${BRANCH}:refs/tags/v0.6.2`, dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
  });
  check("C9a block a force refspec before any checkpoint classification", `git push origin +${BRANCH}:${DEST}`, dir, BLOCK, {
    stderrIncludes: ["push target is not unambiguous"],
  });
}
{
  // A fully valid approval that names a release destination must NOT carry that push: the
  // protected lane treats an approval as necessary, never sufficient.
  const { dir } = checkpointRepo("c9b", { destination: "refs/heads/release/0.6.2" });
  check("C9b block release destination stays on the evidence lane even with a valid approval", `git push origin ${BRANCH}:refs/heads/release/0.6.2`, dir, BLOCK, {
    stderrIncludes: ["evidence/verify-latest.json missing"],
    stderrNotIncludes: [NEEDS_APPROVAL],
  });
}
{
  const { dir } = checkpointRepo("c9c", { signedFor: "none" });
  put(dir, ".claude/pipeline.yaml", manifestYaml({ approval: "required" }).replace("push-destination-policy.v1", "push-destination-policy.v2"));
  check("C9c block a malformed policy cannot select the checkpoint lane", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: ["destination policy"],
    stderrNotIncludes: [NEEDS_APPROVAL],
  });
}

// ---- C10: the one tolerated dirty entry (design 3.4) ----------------------------------------
{
  const { dir, head } = checkpointRepo("c10a");
  const status = gitAt(dir, "status", "--porcelain").stdout;
  record("C10a premise: after approval the work tree reads exactly ` M <state record>`", status.replace(/\r?\n$/u, "") === ` M ${STATE_REL}` ? [] : [`porcelain was ${JSON.stringify(status)}`]);
  check("C10a allow a valid approval when the only dirty entry is the modified tracked state record", CHECKPOINT_CMD, dir, ALLOW, { stderrEmpty: true });
  record("C10a the admitted checkpoint's audit record names the pushed commit", auditText(dir).includes(head) ? [] : ["audit ledger is missing the pushed commit"]);
}
{
  const { dir } = checkpointRepo("c10b");
  appendFileSync(join(dir, "checkpoint.txt"), "edited after approval\n");
  check("C10b block when another tracked file is dirty next to the state record", CHECKPOINT_CMD, dir, BLOCK, { stderrIncludes: [NOT_CLEAN] });
}
{
  const { dir } = checkpointRepo("c10c");
  put(dir, "stray-untracked.txt", "stray\n");
  check("C10c block when an untracked file is present next to the state record", CHECKPOINT_CMD, dir, BLOCK, { stderrIncludes: [NOT_CLEAN] });
}
{
  const { dir } = checkpointRepo("c10d");
  gitAt(dir, "add", STATE_REL);
  check("C10d block when the state record is staged", CHECKPOINT_CMD, dir, BLOCK, { stderrIncludes: [NOT_CLEAN] });
}
{
  const { dir } = checkpointRepo("c10e");
  gitAt(dir, "add", STATE_REL);
  appendFileSync(join(dir, STATE_REL), "\n");
  check("C10e block when the state record is both staged and modified again", CHECKPOINT_CMD, dir, BLOCK, { stderrIncludes: [NOT_CLEAN] });
}
{
  const { dir } = checkpointRepo("c10f");
  unlinkSync(join(dir, STATE_REL));
  check("C10f block when the state record is deleted rather than modified", CHECKPOINT_CMD, dir, BLOCK, { stderrIncludes: [NOT_CLEAN] });
}
{
  // The exemption is a clean-tree exemption only: a dirty state record with no valid approval
  // behind it is still refused, and for the approval reason, not for being dirty.
  const { dir } = checkpointRepo("c10g", { signedFor: "parent" });
  check("C10g block a tolerated dirty state record that carries no current approval", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL, "CHECKPOINT-APPROVAL-STALE"],
    stderrNotIncludes: [NOT_CLEAN],
  });
}

// ---- C11: an unreadable proof policy fails closed to `signature` -----------------------------
{
  const { dir } = checkpointRepo("c11a", { mode: "unreadable-policy", signedFor: "none" });
  check("C11a block (never allow) when the proof policy is unreadable and no approval exists", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL],
  });
}
{
  const { dir } = checkpointRepo("c11b", { mode: "unreadable-policy" });
  check("C11b block (never allow) when the proof policy is unreadable even with a signed approval on record", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NEEDS_APPROVAL],
  });
}

// ---- C12: ordering -- the existing eligibility messages still come first ---------------------
{
  const { dir } = checkpointRepo("c12a", { signedFor: "none", intent: false });
  check("C12a an unapproved checkpoint without an intent trailer still reports the eligibility failure first", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: ["Checkpoint-Intent"],
    stderrNotIncludes: [NEEDS_APPROVAL],
  });
}
{
  const { dir } = checkpointRepo("c12b", { signedFor: "none" });
  put(dir, "stray-untracked.txt", "stray\n");
  check("C12b an unapproved checkpoint on a dirty tree still reports the clean-tree failure first", CHECKPOINT_CMD, dir, BLOCK, {
    stderrIncludes: [NOT_CLEAN],
    stderrNotIncludes: [NEEDS_APPROVAL],
  });
}

// ---- C13: the exemption belongs to the directory the approval is READ from (review finding F1) ---
// `git -C <X> push` binds the command to X, and the approval is read from X's state record. The
// pushed branch may be attached in a DIFFERENT worktree W, which is where the clean-tree check
// runs. The single-entry exemption exists because the verifier reads the work-tree state file,
// so it may only apply when W and X are the same directory; a dirty state record in a checkout
// the verifier never reads is simply a dirty tree.
const forwardSlashes = (path) => path.replace(/\\/gu, "/");

function splitSourceRepo(prefix) {
  // `dir` is the session project directory. It carries the valid approval as its own
  // ` M <state>` but is moved OFF the pushed branch, so the pushed branch is attached only in
  // `source`, a separate linked worktree that starts out clean.
  const fx = checkpointRepo(prefix);
  const moved = gitAt(fx.dir, "checkout", "-q", "-b", "feat/session-holder");
  if (moved.status !== 0) throw new Error(`fixture could not move the session directory off the pushed branch: ${moved.stderr}`);
  const holder = mkdtempSync(join(tmpdir(), `guard-push-ckpt-${prefix}-src-`));
  ALL_DIRS.push(holder);
  const source = join(holder, "source");
  const added = gitAt(fx.dir, "worktree", "add", "-q", source, BRANCH);
  if (added.status !== 0) throw new Error(`fixture could not attach the pushed branch in a second worktree: ${added.stderr}`);
  return { ...fx, source };
}

{
  const fx = splitSourceRepo("c13a");
  appendFileSync(join(fx.source, STATE_REL), "\n");
  const sourceStatus = gitAt(fx.source, "status", "--porcelain").stdout.replace(/\r?\n$/u, "");
  const sessionStatus = gitAt(fx.dir, "status", "--porcelain").stdout.replace(/\r?\n$/u, "");
  record(
    "C13a premise: the attached source worktree reads exactly ` M <state record>` and the session directory holds the approval as its own ` M <state record>`",
    sourceStatus === ` M ${STATE_REL}` && sessionStatus === ` M ${STATE_REL}` ? [] : [`source ${JSON.stringify(sourceStatus)}, session ${JSON.stringify(sessionStatus)}`],
  );
  check(
    "C13a block a dirty state record in the attached source worktree when the approval is read from a different directory",
    `git -C ${forwardSlashes(fx.dir)} push origin ${BRANCH}:${DEST}`, fx.dir, BLOCK, { stderrIncludes: [NOT_CLEAN] },
  );
  record("C13a no audit record is written for the refused checkpoint", auditText(fx.dir) === "" ? [] : ["audit ledger exists although the push was refused"]);
}
{
  // The mirror image keeps the fix honest: tightening must not refuse a clean source worktree.
  const fx = splitSourceRepo("c13b");
  check(
    "C13b allow a strictly clean attached source worktree when the approval is read from a different directory",
    `git -C ${forwardSlashes(fx.dir)} push origin ${BRANCH}:${DEST}`, fx.dir, ALLOW, { stderrEmpty: true },
  );
}
{
  // Same directory, other spelling: the exemption must still apply. A directory alias (a junction
  // on Windows, a symlink elsewhere) names the session directory without sharing its path string.
  const { dir, head } = checkpointRepo("c13c");
  const holder = mkdtempSync(join(tmpdir(), "guard-push-ckpt-c13c-alias-"));
  ALL_DIRS.push(holder);
  const alias = join(holder, "alias");
  let aliasMade = true;
  try {
    symlinkSync(dir, alias, "junction");
  } catch {
    aliasMade = false;
  }
  if (aliasMade) {
    check(
      "C13c allow the single dirty state record when the -C directory is the session directory under another spelling",
      `git -C ${forwardSlashes(alias)} push origin ${BRANCH}:${DEST}`, dir, ALLOW, { stderrEmpty: true },
    );
    record("C13c the admitted checkpoint's audit record names the pushed commit", auditText(dir).includes(head) ? [] : ["audit ledger is missing the pushed commit"]);
  } else {
    console.log("SKIP  C13c -- this platform refused to create a directory alias; the same-directory-other-spelling case was NOT exercised");
  }
}

// ---- C14: the REAL approve-push writer leaves exactly one ` M <state>` entry (review finding F2) --
// Design 3.4 asks for this to be confirmed on a real repository rather than assumed. The writer is
// pipeline-state.mjs's own `run(["approve-push", ...])` driven in-process against a fixture
// repository with the NEUTRAL state path, using a real throwaway Ed25519 proof (no human, no real
// key). Nothing about the writer is stubbed: git, the state lock, the proof verification and the
// state write are the production ones.
{
  const NEUTRAL_STATE_REL = "project/pipeline-state.json";
  const problems = [];
  const stderrSeen = [];
  const realConsoleError = console.error;
  try {
    const key = pushKeypair();
    const dir = freshRepo("c14");
    gitAt(dir, "checkout", "-q", "-b", BRANCH);
    const threatModelBody = "# fixture threat model\n";
    put(dir, POLICY_REL, `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["push", "deploy", "publication"],
      trustAnchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 },
    }, null, 2)}\n`);
    put(dir, THREAT_MODEL_REL, threatModelBody);
    const planBytes = Buffer.from("c14-plan");
    const specBytes = Buffer.from("c14-spec");
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    // Plan/spec digests as the request builder itself derives them, so the committed state
    // record carries exactly the authority the signed intent will name.
    const probe = createCriticalActionApprovalRequest({
      candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, featureId: FEATURE_ID, planBytes, specBytes,
      action: { kind: "push", subjectSha256: "e".repeat(64), expiresAt },
    });
    const { planSha256, specSha256 } = probe.approvalIntent.value;
    put(dir, NEUTRAL_STATE_REL, JSON.stringify({
      schema: "pipeline.state.v0", activeFeature: { id: FEATURE_ID }, planApproval: { poGateAuthority: { planSha256, specSha256 } },
    }));
    gitAt(dir, "add", "-A");
    gitAt(dir, "commit", "-q", "-m", "fixture: checkpoint\n\nCheckpoint-Intent: remote backup before refactor");
    const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
    const candidate = { commit: head, tree: gitAt(dir, "rev-parse", `${head}^{tree}`).stdout.trim() };
    const threatModel = { path: THREAT_MODEL_REL, sha256: sha256(threatModelBody) };
    const subjectSha256 = criticalActionSubjectSha256({
      kind: "push", candidate, subject: { sourceCommit: head, remote: "origin", destination: DEST, threatModel },
    });
    const request = createCriticalActionApprovalRequest({
      candidate, featureId: FEATURE_ID, planBytes, specBytes, action: { kind: "push", subjectSha256, expiresAt },
    });
    const authority = { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 };
    const proof = {
      schema: "pipeline.po-approval-proof.v1",
      intentSha256: request.approvalIntent.sha256,
      keyReference: "po-key-1",
      publicKey: key.publicPem,
      signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), key.privateKey).toString("base64"),
    };
    const external = mkdtempSync(join(tmpdir(), "guard-push-ckpt-c14-external-"));
    ALL_DIRS.push(external);
    const requestPath = join(external, "request.json");
    const authorityPath = join(external, "authority.json");
    const proofPath = join(external, "proof.json");
    writeFileSync(requestPath, JSON.stringify(request));
    writeFileSync(authorityPath, JSON.stringify(authority));
    writeFileSync(proofPath, JSON.stringify(proof));

    const before = gitAt(dir, "status", "--porcelain").stdout;
    if (before !== "") problems.push(`premise: the fixture was not clean before approve-push: ${JSON.stringify(before)}`);
    console.error = (...parts) => { stderrSeen.push(parts.join(" ")); };
    let exitCode;
    try {
      exitCode = runPipelineState([
        "approve-push", "--by", "po-test", "--remote", "origin", "--destination", DEST,
        "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath,
      ], { dir, now: () => new Date().toISOString() });
    } finally {
      console.error = realConsoleError;
    }
    if (exitCode !== 0) problems.push(`the real approve-push exited ${exitCode}: ${stderrSeen.join(" | ").slice(0, 300)}`);
    const porcelain = gitAt(dir, "status", "--porcelain").stdout;
    if (porcelain.replace(/\r?\n$/u, "") !== ` M ${NEUTRAL_STATE_REL}`) problems.push(`porcelain after approve-push was ${JSON.stringify(porcelain)}`);
    if (gitAt(dir, "ls-files", "--error-unmatch", NEUTRAL_STATE_REL).status !== 0) problems.push("the neutral state record is not tracked");
    if (existsSync(join(dir, STATE_REL))) problems.push("the writer also created the legacy state path");
    const written = JSON.parse(readFileSync(join(dir, NEUTRAL_STATE_REL), "utf8"));
    if (written.pushApproval?.lastApproved?.forCommit !== head) problems.push("the written state record does not name the approved commit");
    if (written.pushApproval?.lastApproved?.pendingAuditWrite !== true) problems.push("the written state record does not carry pendingAuditWrite: true");
    if (!classifyCheckpointPorcelain(porcelain, [NEUTRAL_STATE_REL]).approvalRecordOnly) problems.push("the checkpoint classifier does not read the real writer's porcelain as the one tolerated entry");
  } catch (error) {
    problems.push(`fixture or writer threw: ${error?.message ?? error}`);
  } finally {
    console.error = realConsoleError;
  }
  record("C14 the real approve-push writer leaves exactly ` M project/pipeline-state.json` on the neutral path (design 3.4 premise)", problems);
}

// ---- cleanup and summary ---------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* temp cleanup is best-effort */
  }
}
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
