#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-scratch-advisory.test.mjs — NVA-W1-SCRATCHBIND (backlog: 2026-08-08-the-scratch-
 * cleanup-mechanism-exists-but-no-event-calls-it.md, Point 3): `guard-push.mjs`'s all-green
 * path now surfaces a non-blocking advisory when orphaned scratch descriptors exist for the
 * governed session root.
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-push.test.mjs` -- `guard-push.test.mjs` (and
 * `guard-push-v2.test.mjs`) are `.claude/guard-config.json` `protectedTestPaths` rule TP-5,
 * enforced live by `guard-testpath.mjs`'s Edit/Write PreToolUse guard with no in-session
 * override available. Mirrors the exact same sibling-file precedent
 * `guard-push-external-ledger.test.mjs` documents in its own header, including reusing its
 * proven `signedPushRepo` fixture (trimmed here to what this suite needs) so the baseline
 * (no-orphan) case is known to already reach ALLOW through the real guard-push.mjs binary.
 *
 * Run: node plugins/pipeline-core/hooks/guard-push-scratch-advisory.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { bindScratchDescriptor } from "../lib/session-cleanup-recovery.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-scratchadv-${prefix}-`));
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

/** Trimmed copy of guard-push-external-ledger.test.mjs's own `signedPushRepo` fixture. */
function signedPushRepo(prefix) {
  const { dir } = freshRepo(prefix);
  const key = pushKeypair();
  const remote = "origin";
  const destination = "refs/heads/feature-test";

  const threatModelBody = "# fixture threat model\n";
  writeEvidence(dir, THREAT_MODEL_REL, threatModelBody);
  gitAt(dir, "add", THREAT_MODEL_REL);
  gitAt(dir, "commit", "-q", "-m", "threat model");
  const threatModel = { path: THREAT_MODEL_REL, sha256: createHash("sha256").update(threatModelBody).digest("hex") };

  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  const tree = gitAt(dir, "rev-parse", `${head}^{tree}`).stdout.trim();

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
  return { dir, head };
}

function runGuard(command, dir, home) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, home, expectExit, { stderrIncludes, stderrExcludes } = {}) {
  const { code, stderr } = runGuard(command, dir, home);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 400)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 400)}`);
  }
  for (const needle of [].concat(stderrExcludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}" -- got: ${stderr.trim().slice(0, 400)}`);
  }
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}

const ALLOW = 0, ADVISORY = 1;

// ---- PGSA01: baseline -- signed push, no scratch descriptors at all -> plain ALLOW, no advisory
{
  const { dir } = signedPushRepo("baseline");
  const home = mkdtempSync(join(tmpdir(), "guard-push-scratchadv-home-"));
  ALL_DIRS.push(home);
  check("PGSA01 allow  signed push, no scratch descriptors at all -- no advisory", PUSH_CMD, dir, home, ALLOW);
}

// ---- PGSA02: an orphaned scratch descriptor -> ADVISORY (exit 1), push still allowed --------
{
  const { dir } = signedPushRepo("orphan");
  const home = mkdtempSync(join(tmpdir(), "guard-push-scratchadv-home-"));
  ALL_DIRS.push(home);
  // An obviously-dead pid: the real defaultProcessAlive check inside the guard's own
  // subprocess (no dependency injection possible across a spawn boundary) will find no such
  // process and verify this descriptor as an orphan, exactly as a crashed prior session would.
  bindScratchDescriptor({
    rootDir: dir,
    sessionId: "orphan-nva-w1-fixture",
    deps: { pidFn: () => 999999999, processIdentityFn: () => null },
  });
  check("PGSA02 advisory (exit 1, still allowed)  an orphaned scratch descriptor is surfaced non-blocking", PUSH_CMD, dir, home, ADVISORY, {
    stderrIncludes: [
      "[guard-push] ADVISORY (non-blocking)",
      "orphan-nva-w1-fixture",
      "scratch/orphan-nva-w1-fixture-",
    ],
  });
}

// ---- PGSA03: a LIVE (non-orphaned) scratch descriptor -> plain ALLOW, no advisory ------------
{
  const { dir } = signedPushRepo("live");
  const home = mkdtempSync(join(tmpdir(), "guard-push-scratchadv-home-"));
  ALL_DIRS.push(home);
  // This test process's own real pid is genuinely alive for the whole duration of this check.
  bindScratchDescriptor({
    rootDir: dir,
    sessionId: "live-nva-w1-fixture",
    deps: { pidFn: () => process.pid, processIdentityFn: () => null },
  });
  check("PGSA03 allow  a live (non-orphaned) scratch descriptor never triggers the advisory", PUSH_CMD, dir, home, ALLOW, {
    stderrExcludes: ["ADVISORY"],
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
