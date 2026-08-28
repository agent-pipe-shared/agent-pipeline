#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-attestation-diagnostics.test.mjs -- NVA-N-PUSHDIAG.
 *
 * Covers the two `attestedMainPublication()`-specific fixes `guard-push.test.mjs` (a
 * protected test path, TP-5) does not: that function's own refusal message used to
 * discard `authorizeRecordedPush()`'s typed `code` entirely, and its colon-less-refspec
 * handling returned a bare `false` identical to a real attestation failure, whether or
 * not the destination ever resolved at all.
 *
 * `guard-push.test.mjs`'s existing PG12s* family (specifically PG12s7) already covers
 * `PUSH-PROOF-TRUST-ANCHOR-MISSING` for the *general*, non-main push-approval flow
 * (`checkCriticalHumanProofPolicy`-adjacent code around line ~1955 of guard-push.mjs,
 * which already carried its `attested.code` into the message before this task). This
 * file exercises the SAME code surfacing for `attestedMainPublication()` specifically --
 * a route that discarded it until now -- plus the new `PUSH-PROOF-DESTINATION-UNRESOLVED`
 * predicate.
 *
 * Same hermetics discipline as guard-push.test.mjs: every spawn gets a fresh temp repo
 * with its own real git history, never this machine's real state.
 *
 * Run: node plugins/pipeline-core/hooks/guard-push-attestation-diagnostics.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-attest-${prefix}-`));
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

function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
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

function runGuard(command, dir, { env = {} } = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: dir },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 400)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 400)}`);
  }
  for (const needle of [].concat(stderrNotIncludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}
const BLOCK = 2, ALLOW = 0;

// ---- MB1 (task a) -- attestedMainPublication() names the refusal's real predicate, ------
// same as the general (non-main) push flow already did before this task. A v1 policy
// document with no trustAnchor is the exact backlog fixture: the route is unavailable,
// and the fully-qualified main push must say so by name, not render the generic
// "no such proof verified here" every other refusal shares.
{
  const { dir } = freshRepo("mb1-trust-anchor-missing");
  writeState(dir, { schema: "pipeline.state.v0" });
  writeProofPolicy(dir, { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"] });
  check(
    "MB1 block  main-boundary refusal names PUSH-PROOF-TRUST-ANCHOR-MISSING, not a generic message",
    "git push origin main:refs/heads/main",
    dir,
    BLOCK,
    { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main", "PUSH-PROOF-TRUST-ANCHOR-MISSING"] },
  );
}

// ---- MB2 (task c) -- a colon-less refspec whose destination cannot be resolved at all ---
// (a configured remote.<name>.push override, mirroring guard-push.test.mjs's own PG12y
// fixture) is refused as a NAMED, distinct predicate -- PUSH-PROOF-DESTINATION-UNRESOLVED
// -- with guidance toward the one form that always resolves, rather than rendering
// identically to an attestation that was actually checked and failed.
{
  const { dir } = freshRepo("mb2-destination-unresolved");
  gitAt(dir, "config", "--add", "remote.origin.push", "refs/heads/main:refs/heads/elsewhere");
  writeState(dir, { schema: "pipeline.state.v0" });
  check(
    "MB2 block  a colon-less main push whose destination cannot be resolved names PUSH-PROOF-DESTINATION-UNRESOLVED",
    "git push origin main",
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "raw Bash/Git cannot publish refs/heads/main",
        "PUSH-PROOF-DESTINATION-UNRESOLVED",
        "git push origin main:refs/heads/main",
      ],
      stderrNotIncludes: ["PUSH-PROOF-TRUST-ANCHOR-MISSING"],
    },
  );
}

// ---- MB3 (task a+c regression) -- a fully signed, correctly attested push to main, ------
// issued with the ORDINARY colon-less form, still resolves and attests exactly like the
// fully-qualified form -- the "same footing" the pre-existing docstring always claimed,
// now genuinely true for the case that resolves cleanly, and pinned as a regression test
// against the attestedMainPublication() return-shape refactor this task made.
function pushKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}
const THREAT_MODEL_REL = "specs/fixture/threat-model.md";
{
  const { dir } = freshRepo("mb3-bare-form-attests");
  const key = pushKeypair();
  const threatModelBody = "# fixture threat model\n";
  mkdirSync(join(dir, "specs", "fixture"), { recursive: true });
  writeFileSync(join(dir, THREAT_MODEL_REL), threatModelBody);
  gitAt(dir, "add", "-A");
  gitAt(dir, "commit", "-q", "-m", "fixture: threat model");
  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  const tree = gitAt(dir, "rev-parse", `${head}^{tree}`).stdout.trim();
  const threatModel = { path: THREAT_MODEL_REL, sha256: createHash("sha256").update(threatModelBody).digest("hex") };

  writeProofPolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 },
  });

  const candidate = { commit: head, tree };
  const remote = "origin";
  const destination = "refs/heads/main";
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
  const approval = {
    approvedBy: "po-test", approvedAt: "2026-08-06T06:00:00.000Z", forCommit: candidate.commit,
    criticalProof: { proofSha256, intentSha256: intent.sha256, action, proof },
    remote, destination, threatModel,
  };
  writeState(dir, {
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture-feature" },
    planApproval: { poGateAuthority: { planSha256: "c".repeat(64), specSha256: "d".repeat(64) } },
    pushApproval: { lastApproved: approval },
    criticalProofConsumption: [{ proofSha256, kind: "push", consumedAt: "2026-08-06T06:00:00.000Z" }],
  });

  check("MB3 allow  a colon-less `git push origin main` attests identically to the fully-qualified form",
    "git push origin main", dir, ALLOW);
}

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  - ${failure}`);
  for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
process.exit(0);
