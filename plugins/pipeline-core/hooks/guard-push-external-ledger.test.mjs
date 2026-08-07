#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-external-ledger.test.mjs — PHX-2 read-side coverage for `guard-push.mjs`'s
 * additive external push-ledger consult (design doc §2).
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-push.test.mjs` -- for the exact same reason
 * `guard-push-v2.test.mjs` (CYB-2F) is a sibling and not an edit: `guard-push.test.mjs`
 * (and `guard-push-v2.test.mjs` itself) are `.claude/guard-config.json` `protectedTestPaths`
 * rule TP-5, enforced live by `guard-testpath.mjs`'s Edit/Write PreToolUse guard with no
 * in-session override available while `gates.push_approval` is `signature` (this repo's
 * configured value). Confirmed empirically before writing this file (WP5-phx2-implementation).
 * Adding a NEW file exercises the exact same real `guard-push.mjs` binary end-to-end.
 *
 * Run: node plugins/pipeline-core/hooks/guard-push-external-ledger.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 *
 * Hermetics: every case sets HOME/USERPROFILE to a fresh temp directory for the spawned
 * guard, so `appendExternalPushLedgerConsumption`'s default `rootDir = homedir()` never
 * touches this machine's real home directory (Restore-before-yield).
 *
 * NOT COVERED HERE (disclosed, not silently skipped): the `discoverRepository(...)` throw
 * path (`PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED`) is not exercised end-to-end through a
 * live guard-push.mjs subprocess -- reliably forcing `git worktree list --porcelain -z` (or
 * the common-dir rev-parse before it) to fail while every OTHER git call this hook makes
 * still succeeds would need a PATH-level git shim precise enough to distinguish call
 * signatures, which was judged disproportionate to this dispatch's remaining budget. The
 * try/catch itself is covered by direct code review (guard-push.mjs) and `discoverRepository`'s
 * own throw surface is covered by `worktree-lifecycle.test.mjs`'s existing `WT-*` fixtures.
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { appendExternalPushLedgerConsumption } from "../lib/external-push-ledger.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-xledger-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  return { dir, head };
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeProofPolicy(dir, policy) {
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "project", "critical-human-proof.json"), `${JSON.stringify(policy, null, 2)}\n`);
}
function writeUserYamlCommitted(dir, gatesYaml) {
  writeFileSync(join(dir, "pipeline.user.yaml"), `schema: "pipeline.user.v1"\n${gatesYaml}`);
  gitAt(dir, "add", "pipeline.user.yaml");
  gitAt(dir, "commit", "-q", "-m", "gates");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function manifestPush({ mode = "blocking", approval = "required" } = {}) {
  return `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
}

const PUSH_CMD = "git push origin main:refs/heads/feature-test";
const THREAT_MODEL_REL = "specs/fixture/threat-model.md";

function pushKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}

/**
 * Mirrors guard-push.test.mjs's `signedPushRepo` -- a repo whose recorded approval is
 * backed by a real Ed25519 signature over the actual push this suite issues. `userYamlGates`,
 * when given, is committed BEFORE `head` is captured, so the whole signed apparatus (evidence,
 * proof, approval) binds to the commit that already carries the gates file -- committing it
 * afterwards would move HEAD out from under the already-signed candidate.
 */
function signedPushRepo(prefix, { key = pushKeypair(), remote = "origin", destination = "refs/heads/feature-test", userYamlGates = null } = {}) {
  const { dir } = freshRepo(prefix);
  if (userYamlGates !== null) writeUserYamlCommitted(dir, userYamlGates);
  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  const tree = gitAt(dir, "rev-parse", `${head}^{tree}`).stdout.trim();

  const threatModelBody = "# fixture threat model\n";
  writeEvidence(dir, THREAT_MODEL_REL, threatModelBody);
  const threatModel = { path: THREAT_MODEL_REL, sha256: createHash("sha256").update(threatModelBody).digest("hex") };

  writeProofPolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push", "deploy", "publication"],
    trustAnchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 },
  });

  const candidate = { commit: head, tree };
  const action = {
    kind: "push",
    subjectSha256: criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, remote, destination, threatModel } }),
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  const intent = createPoApprovalIntent({
    kind: "critical-action", featureId: "fixture-feature", planSha256: "c".repeat(64), specSha256: "d".repeat(64),
    candidate, policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved",
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference: "po-key-1",
    publicKey: key.publicPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), key.privateKey).toString("base64"),
  };
  const proofSha256 = createHash("sha256").update(canonicalJson(proof)).digest("hex");

  writeState(dir, {
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture-feature" },
    planApproval: { poGateAuthority: { planSha256: "c".repeat(64), specSha256: "d".repeat(64) } },
    pushApproval: { lastApproved: {
      approvedBy: "po-test", approvedAt: "2026-08-06T06:00:00.000Z", forCommit: head,
      criticalProof: { proofSha256, intentSha256: intent.sha256, action, proof },
      remote, destination, threatModel,
    } },
    criticalProofConsumption: [{ proofSha256, kind: "push", consumedAt: "2026-08-06T06:00:00.000Z" }],
  });
  return { dir, head, proofSha256 };
}

function runGuard(command, dir, home, extraEnv = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, ...extraEnv, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, home, expectExit, { stderrIncludes } = {}) {
  const { code, stderr } = runGuard(command, dir, home);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 400)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 400)}`);
  }
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}

function fingerprintFor(dir) {
  const repo = discoverRepository(dir);
  return derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
}

const ALLOW = 0, BLOCK = 2;

// ---- PGXL01: no pipeline.user.yaml at all -> gate off -> unaffected allow -----------------
{
  const { dir } = signedPushRepo("no-user-yaml");
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  check("PGXL01 allow  signed push, no gates.push_external_ledger configured at all", PUSH_CMD, dir, home, ALLOW);
}

// ---- PGXL02: gate explicitly off (committed) -> unaffected allow --------------------------
{
  const { dir } = signedPushRepo("gate-off", { userYamlGates: "gates:\n  push_external_ledger: \"off\"\n" });
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  check("PGXL02 allow  signed push, gates.push_external_ledger: off", PUSH_CMD, dir, home, ALLOW);
}

// ---- PGXL03: gate required, no ledger record -> block MISSING -----------------------------
{
  const { dir } = signedPushRepo("gate-required-missing", { userYamlGates: "gates:\n  push_external_ledger: \"required\"\n" });
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  check("PGXL03 block  gates.push_external_ledger required, no ledger record", PUSH_CMD, dir, home, BLOCK, {
    stderrIncludes: ["External push ledger consumption is PUSH-EXTERNAL-LEDGER-MISSING"],
  });
}

// ---- PGXL04: gate required, correct ledger record present -> allow ------------------------
{
  const { dir, proofSha256 } = signedPushRepo("gate-required-present", { userYamlGates: "gates:\n  push_external_ledger: \"required\"\n" });
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  const appended = appendExternalPushLedgerConsumption({
    repositoryFingerprint: fingerprintFor(dir), proofSha256, consumedAt: "2026-08-06T06:05:00.000Z", rootDir: home,
  });
  if (!appended.ok) throw new Error(`fixture setup failed: ${appended.code}`);
  check("PGXL04 allow  gates.push_external_ledger required, matching ledger record present", PUSH_CMD, dir, home, ALLOW);
}

// ---- PGXL05: gate required, ledger record present but for a DIFFERENT proof -> block MISMATCH
{
  const { dir, proofSha256 } = signedPushRepo("gate-required-mismatch", { userYamlGates: "gates:\n  push_external_ledger: \"required\"\n" });
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  const fp = fingerprintFor(dir);
  // Seed a record for a DIFFERENT fingerprint under the same proofSha256, so the file the
  // real check reads (keyed on THIS repo's fingerprint) is still absent -- then corrupt the
  // one it does read directly, to exercise MISMATCH rather than MISSING.
  const appended = appendExternalPushLedgerConsumption({
    repositoryFingerprint: fp, proofSha256, consumedAt: "2026-08-06T06:05:00.000Z", rootDir: home,
  });
  if (!appended.ok) throw new Error(`fixture setup failed: ${appended.code}`);
  const ledgerFile = join(home, ".pipeline", "push-ledger", fp, `${proofSha256}.json`);
  writeFileSync(ledgerFile, JSON.stringify({
    schema: "pipeline.external-push-ledger.v1", repositoryFingerprint: fp, proofSha256: "0".repeat(64), consumedAt: "2026-08-06T06:05:00.000Z",
  }));
  check("PGXL05 block  gates.push_external_ledger required, ledger record present but mismatched", PUSH_CMD, dir, home, BLOCK, {
    stderrIncludes: ["External push ledger consumption is PUSH-EXTERNAL-LEDGER-MISMATCH"],
  });
}

// ---- PGXL06: an UNCOMMITTED attempt to weaken a committed "required" gate to "off" ---------
// stays required end-to-end through the real hook (mirrors external-push-ledger.test.mjs's
// EPL16 unit case, but through guard-push.mjs itself).
{
  const { dir } = signedPushRepo("gate-uncommitted-weaken", { userYamlGates: "gates:\n  push_external_ledger: \"required\"\n" });
  writeFileSync(join(dir, "pipeline.user.yaml"), "schema: \"pipeline.user.v1\"\ngates:\n  push_external_ledger: \"off\"\n"); // uncommitted
  const home = mkdtempSync(join(tmpdir(), "guard-push-xledger-home-"));
  ALL_DIRS.push(home);
  check("PGXL06 block  uncommitted working-tree edit to \"off\" cannot weaken a committed \"required\" gate", PUSH_CMD, dir, home, BLOCK, {
    stderrIncludes: ["External push ledger consumption is PUSH-EXTERNAL-LEDGER-MISSING"],
  });
}

for (const dir of ALL_DIRS) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(`\n${pass}/${pass + failures.length} passed.`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}
process.exit(0);
