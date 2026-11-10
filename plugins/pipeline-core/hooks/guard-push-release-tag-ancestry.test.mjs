#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-release-tag-ancestry.test.mjs -- NVA-B-TAGPROV / ADR-0078 D5.
 *
 * Covers `checkReleaseTagAncestry()` in guard-push.mjs: a push whose destination is a
 * release tag (`refs/tags/vX.Y.Z` or `vX.Y.Z-beta.N`, the exact grammar `ruleset-
 * freshness.mjs`'s `validTag` already uses) must be refused unless the tagged commit is
 * reachable from `refs/remotes/origin/main`.
 *
 * Lives in its own file rather than `guard-push.test.mjs` because that file is a
 * protected test path (TP-5, `project/guard-config.json`) -- the same convention already
 * used by `guard-push-attestation-diagnostics.test.mjs`, `guard-push-external-ledger.
 * test.mjs`, and `guard-push-scratch-advisory.test.mjs`.
 *
 * Same hermetics discipline as guard-push.test.mjs: every spawn gets a fresh temp repo
 * with its own real git history, never this machine's real state; no manifest is written
 * for these fixtures, so the ancestry check's own "unconditional, before the manifest-
 * absent opt-in exit" placement is exercised directly.
 *
 * Run: node plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeAuditProofFollowUp, authorizeReleaseIncludedPush, writeCriticalApproval } from "../lib/critical-action-authorization.mjs";
import { applyInstall } from "../scripts/pre-push-hook-install.mjs";
import { canonical } from "../lib/critical-action-authorization-read.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";

function enrollFixtureGovernance(root) {
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture governance was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-tagprov-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  const initialized = git("init", "-q", "-b", "main");
  if (initialized.status !== 0) throw new Error(`fixture Git initialization failed: ${initialized.stderr}`);
  enrollFixtureGovernance(dir);
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

// Mirrors guard-push.test.mjs's own `writeManifest`/`manifestPush`/`writeEvidence` fixture
// shape exactly (not imported from that file -- it is a protected test path, TP-5, and this
// file already keeps its own independent fixture helpers per its header comment above).
function writeManifest(dir, yamlText) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), yamlText);
}
function manifestPush({ mode = "blocking", approval = "required" } = {}) {
  return `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

function runGuard(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    timeout: 10000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
// C20E-AP: a refused follow-up must be refused for the RIGHT reason, not merely refused (the full gate refuses every raw main push without an approval,
// so the exit code alone would pass for a broken fixture). The case id names the typed code `authorizeAuditProofFollowUp` has to return for its fixture.
const FOLLOWUP_REFUSALS = Object.freeze({
  "C20E-AP2": "AUDIT-FOLLOWUP-PATH", "C20E-AP3": "AUDIT-FOLLOWUP-NOT-ADD-ONLY", "C20E-AP4": "AUDIT-FOLLOWUP-NO-RELEASE-APPROVAL", "C20E-AP5": "AUDIT-FOLLOWUP-RELEASE-TAG",
  "C20E-AP6": "AUDIT-FOLLOWUP-NO-APPROVAL", "C20E-AP7": "AUDIT-FOLLOWUP-CONTENT", "C20E-AP8": "AUDIT-FOLLOWUP-PARENT-NOT-PUBLISHED", "C20E-AP10": "AUDIT-FOLLOWUP-CONTENT",
  "C20E-AP11": "AUDIT-FOLLOWUP-CONTENT", "C20E-AP12": "AUDIT-FOLLOWUP-CONTENT",
});
function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
  const wantRefusal = FOLLOWUP_REFUSALS[id.split(" ")[0]];
  if (wantRefusal !== undefined) {
    const got = authorizeAuditProofFollowUp({ projectDir: dir, anchorDir: dir, commit: gitAt(dir, "rev-parse", "HEAD").stdout.trim(), remote: "origin", destination: "refs/heads/main" });
    if (got.ok !== false || got.code !== wantRefusal) problems.push(`the follow-up check returned ${JSON.stringify(got).slice(0, 200)}, expected the refusal ${wantRefusal}`);
  }
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 500)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 500)}`);
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
const BLOCK = 2, ALLOW = 0, WARN = 1; // WARN = hooks.json's own "1 = allow + warn" contract (guard-push.mjs).

// ---- AC-1/AC-5 -- a release tag AT the same commit as origin/main is reachable (trivial
// ancestor-of-itself case) -- ALLOWED, unchanged behaviour. -------------------------------
{
  const { dir, head } = freshRepo("reachable");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  gitAt(dir, "tag", "v1.0.0", head);
  check("TAGPROV1 allow  a release tag at the exact origin/main commit is reachable", "git push origin v1.0.0", dir, ALLOW, {
    stderrNotIncludes: ["release-tag ancestry"],
  });
}

// ---- AC-1/AC-2 -- a release tag cut on a commit NOT reachable from origin/main is -------
// refused, naming the tag ref, the commit, ADR-0078 D5, and a next step. ------------------
{
  const { dir, head } = freshRepo("unreachable");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  gitAt(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "feature.txt"), "divergent work\n");
  gitAt(dir, "add", "feature.txt");
  gitAt(dir, "commit", "-q", "-m", "feature work");
  const featureHead = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  gitAt(dir, "tag", "v1.0.0", featureHead);
  check(
    "TAGPROV2 block  a release tag cut on a commit not reachable from origin/main is refused",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "BLOCKED (guard-push release-tag ancestry, plugin pipeline-core)",
        "refs/tags/v1.0.0",
        featureHead,
        "not reachable from refs/remotes/origin/main",
        "ADR-0078 D5",
        "Fix:",
      ],
    },
  );
}

// ---- AC-2 (ADR-0078 D5 correction, NVA-B-TAGFIX) -- refs/remotes/origin/main missing ----
// locally is NOT refused: main is not necessarily the published line in every repository ---
// this guard ships to, and ADR-0078 D5 only governs a repository where it is. AC-1/AC-2 -----
// (NVA-B-TAGNOTICE, rework of a `major` review finding): the skip is no longer silent -- it -
// now carries a NOTICE naming what was skipped, why, and the remedy. AC-1 (NVA-B-TAGNOTICE2,
// rework of a `major` review finding): with NO manifest present in this fixture, the notice --
// no longer terminates the hook at WARN=1 -- execution continues to the manifest-absent exit
// just past the call site. See TAGPROV3d below for the case that proves execution continues
// into a check that is NOT a fast allow. AC-1/AC-4 (NVA-B-TAGNOTICE3, rework of a `major` ----
// finding from an independent re-review): that manifest-absent exit used to be a bare -------
// `process.exit(0)`, and hooks.json's own exit-code contract assigns stderr NO reader at ----
// exit 0 -- so the notice text landed on the child process's fd 2 but the host never showed
// it to the operator, on exactly the ordinary clean-allow path the notice exists for. The ---
// notice is now deferred and emitted at that same terminal allow via `emit(1, ...)` (WARN, --
// still an allow under the contract's own "1 = allow + config warning, stderr to the user"),
// so this case now asserts WARN=1, the exit the code actually produces on this path. --------
{
  const { dir, head } = freshRepo("no-origin-main");
  gitAt(dir, "tag", "v1.0.0", head);
  check(
    "TAGPROV3 warn-allow  refs/remotes/origin/main missing locally is not refused, and the notice reaches the operator (exit 1, not silently discarded at exit 0)",
    "git push origin v1.0.0",
    dir,
    WARN,
    {
      stderrIncludes: [
        "release-tag ancestry check was skipped",
        "refs/tags/v1.0.0",
        "refs/remotes/origin/main is not present locally",
        "git fetch origin main",
      ],
    },
  );
}

// ---- AC-3 (NVA-B-TAGNOTICE2) -- this is the assertion that actually pins the fix. -------
// TAGPROV3 alone proves the notice text appears; it does not prove the hook kept running --
// afterward (a defective `emit(1, ...)` skip would ALSO have printed the same text before --
// terminating). Here the fixture combines the same origin/main-absent skip path with a -----
// manifest that requires push approval and no recorded approval at all -- the downstream ---
// approval gate (guard-push.mjs's check (c), chosen because it is the cheapest downstream ---
// check to trigger in this fixture style: one manifest, one evidence file, no state file at
// all) must still fire and BLOCK. A hook that terminated at the notice, as `emit(1, ...)` ---
// used to, would exit WARN=1 here and never reach it. -----------------------------------------
{
  const { dir, head } = freshRepo("no-origin-main-approval-required");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  gitAt(dir, "tag", "v1.0.0", head);
  check(
    "TAGPROV3d block  origin/main missing (notice fires) still reaches the downstream approval gate, which blocks",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "release-tag ancestry check was skipped",
        "Push approval missing",
      ],
    },
  );
}

// ---- G20-42 -- the same shape as TAGPROV3d with an ANNOTATED release tag in a consumer-shaped project: the consumer release check judges it and
// refuses it by name (no release approval recorded), naming the release command. A lightweight tag (TAGPROV3d) keeps the general gate. -----------
{
  const { dir, head } = freshRepo("annotated-consumer-release-tag");
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  gitAt(dir, "tag", "-a", "v1.0.0", "-m", "version tag", head);
  check(
    "G20-42b block  an annotated release tag in a consumer project needs the release approval (named refusal with the release command)",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["RELEASE-APPROVAL-MISSING", "release-preflight-cli.mjs"] },
  );
}

// ---- G20-42 -- the same shape, but a Pipeline SOURCE checkout (the plugin manifests are present): the consumer release check does not apply,
// and the original downstream approval gate still blocks an annotated tag with its original message, unchanged. -------------------------------
{
  const { dir, head } = freshRepo("no-origin-main-approval-required-source");
  for (const manifest of ["plugins/pipeline-core/.codex-plugin/plugin.json", "plugins/pipeline-core/.claude-plugin/plugin.json", "plugins/pipeline-core/plugin.json"]) {
    writeEvidence(dir, manifest, { name: "pipeline-core", version: "1.0.0" });
  }
  writeManifest(dir, manifestPush({ approval: "required" }));
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  gitAt(dir, "tag", "-a", "v1.0.0", "-m", "version tag", head);
  check(
    "G20-42a block  a Pipeline source checkout keeps the general approval gate for a release tag (the consumer release check does not apply)",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    { stderrIncludes: ["release-tag ancestry check was skipped", "Push approval missing"] },
  );
}

// ---- AC-3 -- with refs/remotes/origin/main PRESENT, an unreachable release tag is still --
// refused exactly as before -- the new early-return above must not affect this path. --------
{
  const { dir, head } = freshRepo("origin-main-present-unreachable");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  gitAt(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "feature.txt"), "divergent work, present origin/main\n");
  gitAt(dir, "add", "feature.txt");
  gitAt(dir, "commit", "-q", "-m", "feature work");
  const featureHead = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  gitAt(dir, "tag", "v1.0.0", featureHead);
  check(
    "TAGPROV3b block  with origin/main present, an unreachable release tag is still refused",
    "git push origin v1.0.0",
    dir,
    BLOCK,
    {
      stderrIncludes: [
        "BLOCKED (guard-push release-tag ancestry, plugin pipeline-core)",
        "refs/tags/v1.0.0",
        featureHead,
        "not reachable from refs/remotes/origin/main",
        "ADR-0078 D5",
        "Fix:",
      ],
    },
  );
}

// ---- AC-3/AC-5 (NVA-B-TAGNOTICE) -- with refs/remotes/origin/main PRESENT, the skip ------
// notice never fires: a repository with a normal remote sees no new output at all, whether -
// the ancestry check itself then passes (reachable, like TAGPROV1) or fails (like TAGPROV3b).
{
  const { dir, head } = freshRepo("origin-main-present-notice-absent");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  gitAt(dir, "tag", "v1.0.0", head);
  check(
    "TAGPROV3c allow  with origin/main present, the skip notice does not appear",
    "git push origin v1.0.0",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry check was skipped", "NOTICE"] },
  );
}

// ---- AC-4 -- a non-release-shaped tag is unaffected, even with no origin/main at all. ----
{
  const { dir, head } = freshRepo("non-release-tag");
  gitAt(dir, "tag", "nightly-3", head);
  check(
    "TAGPROV4 allow  a non-release tag (nightly-3) is unaffected",
    "git push origin nightly-3",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry"] },
  );
}
{
  const { dir, head } = freshRepo("non-release-tag-archive");
  gitAt(dir, "tag", "archive/v1.0.0-not-a-real-release", head);
  check(
    "TAGPROV4b allow  a non-grammar-matching tag with a version-like fragment is unaffected",
    "git push origin archive/v1.0.0-not-a-real-release",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry"] },
  );
}

// ---- AC-4 -- an explicit branch push is unaffected, even with no origin/main at all. -----
{
  const { dir } = freshRepo("branch-push");
  check(
    "TAGPROV5 allow  a branch push is unaffected",
    "git push origin main:refs/heads/other-branch",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry"] },
  );
}

// ---- AC-4 -- a tag DELETE is unaffected (`--delete` already fails parsePushBinding for ---
// unrelated reasons -- the ancestry check never even sees it). -----------------------------
{
  const { dir, head } = freshRepo("tag-delete");
  gitAt(dir, "tag", "v1.0.0", head);
  check(
    "TAGPROV6 allow  a tag delete is unaffected",
    "git push origin --delete v1.0.0",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry"] },
  );
}

// ---- AC-4 -- an ANNOTATED tag is peeled to the commit it targets before the ancestry -----
// test: the refusal names the peeled COMMIT sha, never the tag object's own sha. -----------
{
  const { dir, head } = freshRepo("annotated-peeled");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  gitAt(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "feature.txt"), "divergent annotated work\n");
  gitAt(dir, "add", "feature.txt");
  gitAt(dir, "commit", "-q", "-m", "feature work for annotated tag");
  const featureHead = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  gitAt(dir, "tag", "-a", "v2.0.0", "-m", "annotated release", featureHead);
  const tagObjectSha = gitAt(dir, "rev-parse", "v2.0.0").stdout.trim();
  if (tagObjectSha === featureHead) {
    failures.push("TAGPROV7 fixture invariant broken -- annotated tag object sha equals commit sha, peeling is untestable");
  }
  check(
    "TAGPROV7 block  an annotated tag is peeled to its commit, never the tag object sha, before the ancestry test",
    "git push origin v2.0.0",
    dir,
    BLOCK,
    {
      stderrIncludes: ["refs/tags/v2.0.0", featureHead, "ADR-0078 D5"],
      stderrNotIncludes: [tagObjectSha],
    },
  );
}

// ---- AC-1/AC-4 -- explicit refs/tags/<name> colon-form destination, reachable case. ------
{
  const { dir, head } = freshRepo("explicit-colon-reachable");
  gitAt(dir, "update-ref", "refs/remotes/origin/main", head);
  check(
    "TAGPROV8 allow  an explicit HEAD:refs/tags/<name> push reachable from origin/main is allowed",
    "git push origin HEAD:refs/tags/v3.0.0",
    dir,
    ALLOW,
    { stderrNotIncludes: ["release-tag ancestry"] },
  );
}

// ---- C20E-AP (AC-108) -- the evidence-only follow-up commit. A consumer release approval is recorded for commit P (the closed, pushed feature
// commit that already carries audit-bundles/<feature>/<C>/); the push approval signs P, so the PO's approval proofs can only reach the remote in ONE
// commit on top of P that ONLY adds proofs/ files of that bundle. The guard admits that single commit WITHOUT a second approval; every other content,
// and every other shape, falls through to the full gate unchanged. -------------------------------------------------------------------------------
const FOLLOWUP_FEATURE = "feature-x";
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
function followUpProof(intentSha256) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: "po-key-1", publicKey: publicKey.export({ type: "spki", format: "pem" }), signatureBase64: cryptoSign(null, Buffer.from(intentSha256, "utf8"), privateKey).toString("base64") };
}
/** A consumer project at P (bundle committed, release approval + push approval recorded, annotated tag at P, origin/main = P) and the follow-up files on disk. */
function followUpScenario(prefix, { tag = true, releaseApproval = true, origin = "published", recordedPushIntent = "a".repeat(64), foreignKey = null, destination = "refs/heads/main", pushApproval = true, carry = ["push", "release-preflight"] } = {}) {
  const { dir, head: bundleCommit } = freshRepo(prefix);
  writeManifest(dir, manifestPush({ approval: "required" }));
  const bundle = `audit-bundles/${FOLLOWUP_FEATURE}/${bundleCommit}`;
  writeEvidence(dir, `${bundle}/manifest.json`, { schema: "pipeline.audit-bundle-manifest.v1", bundleId: FOLLOWUP_FEATURE, candidate: { commit: bundleCommit, tree: gitAt(dir, "rev-parse", `${bundleCommit}^{tree}`).stdout.trim() } });
  gitAt(dir, "add", "-A");
  gitAt(dir, "commit", "-q", "-m", "close commit carrying the bundle");
  const approved = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  const common = join(dir, ".git");
  const approvedAt = "2026-11-08T10:00:00.000Z";
  const pushProof = followUpProof("a".repeat(64));
  const releaseProof = followUpProof("b".repeat(64));
  // the push approval's recorded proof: the guard admits only the very proof the private store holds for it (a proof signed by any other key is refused)
  const recorded = recordedPushIntent === "a".repeat(64) ? pushProof : followUpProof(recordedPushIntent);
  if (pushApproval && writeCriticalApproval({ gitCommonDir: common, kind: "push", approval: { forCommit: approved, remote: "origin", destination, approvedAt, criticalProof: { proofSha256: sha256Hex(canonical(recorded)), proof: recorded } } }).ok !== true) throw new Error("fixture push approval was not recorded");
  if (releaseApproval) {
    // the digest the private store really holds: sha256 over the canonical proof object (release-preflight-cli.mjs, verified.proofSha256)
    const proofSha256 = sha256Hex(canonical(releaseProof));
    if (writeCriticalApproval({ gitCommonDir: common, kind: "release-preflight", approval: { schema: "pipeline.consumer-release-approval.v1", forCommit: approved, version: "1.0.0", tag: "v1.0.0", mode: "signature", criticalProof: { proofSha256 }, approvedAt } }).ok !== true) throw new Error("fixture release approval was not recorded");
  }
  if (tag) gitAt(dir, "tag", "-a", "v1.0.0", "-m", "version tag", approved);
  if (origin === "published") gitAt(dir, "update-ref", `refs/remotes/origin/${destination.slice("refs/heads/".length)}`, approved);
  // foreignKey: the carried file holds the recorded intent, validly signed, but under a key the private store never saw
  const carriedPush = foreignKey === "push" ? followUpProof(pushProof.intentSha256) : pushProof;
  const carriedRelease = foreignKey === "release" ? followUpProof(releaseProof.intentSha256) : releaseProof;
  const files = [["proofs/003-push.json", carriedPush, "push"], ["proofs/004-release-preflight.json", carriedRelease, "release-preflight"]].filter(([, , kind]) => carry.includes(kind)).map(([path, proof, kind]) => {
    const bytes = Buffer.from(`${JSON.stringify(proof)}\n`);
    return { path, bytes, kind, sha256: sha256Hex(bytes), intentSha256: proof.intentSha256 };
  });
  const list = { schema: "pipeline.audit-bundle-followup.v1", candidate: { commit: bundleCommit, tree: gitAt(dir, "rev-parse", `${bundleCommit}^{tree}`).stdout.trim() }, approvedCommit: approved,
    proofs: files.map((f) => ({ kind: f.kind, path: f.path, sha256: f.sha256, intentSha256: f.intentSha256 })), attributions: [] };
  const write = (extra = {}) => {
    for (const f of files) { mkdirSync(join(dir, bundle, "proofs"), { recursive: true }); writeFileSync(join(dir, bundle, f.path), f.bytes); }
    writeFileSync(join(dir, bundle, "proofs", "follow-up.json"), `${JSON.stringify({ ...list, ...extra })}\n`);
  };
  const commit = (message = "evidence: approval proofs of the approved commit") => { gitAt(dir, "add", "-A"); gitAt(dir, "commit", "-q", "-m", message); };
  return { dir, bundle, approved, bundleCommit, files, list, write, commit };
}
const FOLLOWUP_PUSH = "git push origin HEAD:refs/heads/main";
{
  const s = followUpScenario("followup-admitted");
  s.write(); s.commit();
  check("C20E-AP1 allow  one commit on top of the approved commit that only adds the bundle's proofs/ files is pushed with no second approval", FOLLOWUP_PUSH, s.dir, ALLOW, {
    stderrNotIncludes: ["BLOCKED"],
  });
}
{
  const s = followUpScenario("followup-other-path");
  s.write(); writeEvidence(s.dir, "src/app.js", "console.log(1);\n"); s.commit();
  check("C20E-AP2 block  a follow-up commit that also touches any other path falls through to the full gate", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-modifies-bundle");
  s.write();
  writeFileSync(join(s.dir, s.bundle, "manifest.json"), `${JSON.stringify({ tampered: true })}\n`);
  s.commit();
  check("C20E-AP3 block  a follow-up commit that changes the bundle's own manifest (create-only: only files are added) is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-no-release-approval", { releaseApproval: false });
  s.write(); s.commit();
  check("C20E-AP4 block  without the recorded release approval for the parent the follow-up is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-no-tag", { tag: false });
  s.write(); s.commit();
  check("C20E-AP5 block  without the annotated release tag at the approved commit the follow-up is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-two-commits");
  s.write(); s.commit();
  writeEvidence(s.dir, `${s.bundle}/proofs/005-extra.json`, "{}\n"); s.commit("a second follow-up commit");
  check("C20E-AP6 block  two commits on top of the approved commit are not THE follow-up (exactly one commit is admitted)", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-private-key");
  s.write();
  const leaked = { ...JSON.parse(readFileSync(join(s.dir, s.bundle, s.files[0].path), "utf8")), privateKey: "-----BEGIN PRIVATE KEY-----" };
  writeFileSync(join(s.dir, s.bundle, s.files[0].path), `${JSON.stringify(leaked)}\n`);
  s.commit();
  check("C20E-AP7 block  a proofs/ file that is not exactly a public proof object (a private key rides along) is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-origin-moved", { origin: "absent" });
  s.write(); s.commit();
  check("C20E-AP8 block  when the parent is not the published tip of the destination the follow-up is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-forged-proof", { recordedPushIntent: "c".repeat(64) });
  s.write(); s.commit();
  check("C20E-AP10 block  a validly self-signed push proof that is not the proof the private store recorded for the push approval is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-foreign-push-key", { foreignKey: "push" });
  s.write(); s.commit();
  check("C20E-AP11 block  the recorded push intent signed under a key the store never saw (the agent's own) is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  const s = followUpScenario("followup-foreign-release-key", { foreignKey: "release" });
  s.write(); s.commit();
  check("C20E-AP12 block  a release proof signed under a key the store never saw (the agent's own) is refused", FOLLOWUP_PUSH, s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
}
{
  // the tag push of the same release is untouched by the follow-up: the annotated tag still peels to the approved commit and is admitted by G20-42b
  const s = followUpScenario("followup-tag-push");
  s.write(); s.commit();
  check("C20E-AP9 allow  the annotated release tag at the approved commit is still admitted after the follow-up commit exists", "git push origin refs/tags/v1.0.0", s.dir, ALLOW, { stderrNotIncludes: ["BLOCKED"] });
}

// ---- PO tiles 2026-11-10 -- the follow-up after ANY signed push, the push a release includes, and the same three decisions in the generated pre-push hook. ----------------
const VERIFY_SCHEMA = "pipeline.verify-evidence.v0";
function hookOf(dir) { const installed = applyInstall({ rootDir: dir }); if (installed.status === "failed") throw new Error(JSON.stringify(installed)); return join(dir, ".git", "hooks", "pre-push"); }
function runHook(dir, sha, remoteRef, localRef = "HEAD") {
  return spawnSync(hookOf(dir), ["origin", "file:///not-used"], { cwd: dir, encoding: "utf8", timeout: 60_000, input: `${localRef} ${sha} ${remoteRef} ${"0".repeat(40)}\n`, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
}
function checkHook(id, result, expectExit, { includes = [], notIncludes = [] } = {}) {
  const problems = [];
  if (result.status !== expectExit) problems.push(`hook exit ${result.status} (expected ${expectExit}): ${String(result.stderr).slice(0, 500)}`);
  for (const needle of includes) if (!String(result.stderr).includes(needle)) problems.push(`stderr missing "${needle}": ${String(result.stderr).slice(0, 500)}`);
  for (const needle of notIncludes) if (String(result.stderr).includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  if (problems.length === 0) { pass++; console.log(`  ok  ${id}`); } else failures.push(`${id}: ${problems.join("; ")}`);
}
const headOf = (dir) => gitAt(dir, "rev-parse", "HEAD").stdout.trim();
function recordClose(s, { candidateOid = s.approved, verifySha256 = "0".repeat(64), securitySha256 = "0".repeat(64) } = {}) {
  const directory = join(s.dir, ".git", "agent-pipeline", "publication-close", "close-x", "evidence");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "final-verification.json"), `${JSON.stringify({ schema: "pipeline.close-final-verification.v1", candidateOid, candidateTree: "t".repeat(40), verifyStatus: "green", verifySha256, securityStatus: "green", securitySha256 })}\n`);
}
function branchFollowUp(prefix, overrides = {}) {
  return followUpScenario(prefix, { destination: "refs/heads/feat-x", releaseApproval: false, tag: false, carry: ["push"], ...overrides });
}
{
  const s = branchFollowUp("followup-branch"); s.write(); s.commit();
  check("PO-F1 allow  after a signed push to a feature branch the one follow-up commit goes to the same branch with no further approval and no release", "git push origin HEAD:refs/heads/feat-x", s.dir, ALLOW, { stderrNotIncludes: ["BLOCKED"] });
  checkHook("PO-F1h allow  the generated pre-push hook admits the same follow-up commit before its checkpoint lane", runHook(s.dir, headOf(s.dir), "refs/heads/feat-x"), 0);
  check("PO-F2 block  the follow-up goes only to the destination the push approval names", "git push origin HEAD:refs/heads/other", s.dir, BLOCK);
  const otherBranch = authorizeAuditProofFollowUp({ projectDir: s.dir, anchorDir: s.dir, commit: headOf(s.dir), remote: "origin", destination: "refs/heads/other" });
  if (otherBranch.code === "AUDIT-FOLLOWUP-NO-APPROVAL") { pass++; } else failures.push(`PO-F2b: expected the typed refusal, got ${JSON.stringify(otherBranch)}`);
}
{
  const s = branchFollowUp("followup-evidence");
  const bytes = Buffer.from(`${JSON.stringify({ schema: VERIFY_SCHEMA, commit: s.approved, status: "passed" })}\n`);
  recordClose(s, { verifySha256: sha256Hex(bytes) });
  s.write({ evidence: [{ kind: "final-verify", path: "proofs/005-final-verify.json", sha256: sha256Hex(bytes) }] });
  writeFileSync(join(s.dir, s.bundle, "proofs/005-final-verify.json"), bytes); s.commit();
  check("PO-F3 allow  the follow-up may carry the final Verify record the close recorded", "git push origin HEAD:refs/heads/feat-x", s.dir, ALLOW, { stderrNotIncludes: ["BLOCKED"] });
}
for (const [id, mutate, why, close, expected] of [
  ["PO-F4", (record) => record, "a well-formed record of the right schema whose digest no close recorded", () => ({}), "AUDIT-FOLLOWUP-CONTENT"],
  ["PO-F4b", (record) => record, "a record whose digest only a close of another history recorded", (s, digest) => ({ verifySha256: digest, candidateOid: "e".repeat(40) }), "AUDIT-FOLLOWUP-CONTENT"],
  ["PO-F5", (record) => ({ ...record, schema: "pipeline.something-else.v1" }), "a record of an unknown schema", (s, digest) => ({ verifySha256: digest }), "AUDIT-FOLLOWUP-CONTENT"],
  ["PO-F6", (record) => ({ ...record, note: "-----BEGIN PRIVATE KEY-----" }), "a record holding a private key", (s, digest) => ({ verifySha256: digest }), "AUDIT-FOLLOWUP-CONTENT"],
  ["PO-F7", (record) => record, "a kind the close records no digest for", (s, digest) => ({ verifySha256: digest }), "AUDIT-FOLLOWUP-LIST"],
]) {
  const s = branchFollowUp(`followup-evidence-${id.toLowerCase()}`);
  const bytes = Buffer.from(`${JSON.stringify(mutate({ schema: VERIFY_SCHEMA, commit: s.approved, status: "passed" }))}\n`);
  recordClose(s, close(s, sha256Hex(bytes)));
  const entryKind = id === "PO-F7" ? "push-verify" : "final-verify";
  s.write({ evidence: [{ kind: entryKind, path: `proofs/005-${entryKind}.json`, sha256: sha256Hex(bytes) }] });
  writeFileSync(join(s.dir, s.bundle, `proofs/005-${entryKind}.json`), bytes); s.commit();
  const got = authorizeAuditProofFollowUp({ projectDir: s.dir, anchorDir: s.dir, commit: headOf(s.dir), remote: "origin", destination: "refs/heads/feat-x" });
  if (got.code === expected) { pass++; console.log(`  ok  ${id} block  ${why}`); } else failures.push(`${id}: ${why} returned ${JSON.stringify(got)}`);
}
{
  // The release includes its push: only the release approval exists, nothing is on origin yet.
  const s = followUpScenario("release-included", { pushApproval: false, tag: false, origin: "absent" });
  const included = authorizeReleaseIncludedPush({ projectDir: s.dir, anchorDir: s.dir, commit: s.approved, remote: "origin", destination: "refs/heads/main" });
  if (included.ok === true) { pass++; console.log("  ok  PO-R1 a signed release approval stands in for the push approval of its own commit"); } else failures.push(`PO-R1: ${JSON.stringify(included)}`);
  checkHook("PO-R1h the generated hook no longer asks for a push approval for that commit, and still demands the evidence", runHook(s.dir, s.approved, "refs/heads/main"), 1, { includes: ["verify"], notIncludes: ["push approval missing or stale"] });
  writeEvidence(s.dir, "src/other.js", "x\n"); s.commit("a later commit the release did not approve");
  check("PO-R2 block  a commit the release approval does not name is outside the included push", "git push origin HEAD:refs/heads/main", s.dir, BLOCK, { stderrIncludes: ["raw Bash/Git cannot publish refs/heads/main"] });
  checkHook("PO-R2h the generated hook still asks for a push approval for that commit", runHook(s.dir, headOf(s.dir), "refs/heads/main"), 1, { includes: ["push approval"] });
}
{
  // A chat-mode release approval is written with no human input, so it never stands in for the push approval, whatever the project waives.
  const s = followUpScenario("release-chat", { pushApproval: false, tag: false, origin: "absent", releaseApproval: false });
  if (writeCriticalApproval({ gitCommonDir: join(s.dir, ".git"), kind: "release-preflight", approval: { schema: "pipeline.consumer-release-approval.v1", forCommit: s.approved, version: "1.0.0", tag: "v1.0.0", mode: "chat-attributed-unattested", criticalProof: null, approvedAt: "2026-11-08T10:00:00.000Z" } }).ok !== true) throw new Error("fixture chat release approval was not recorded");
  const got = authorizeReleaseIncludedPush({ projectDir: s.dir, anchorDir: s.dir, commit: s.approved, remote: "origin", destination: "refs/heads/main" });
  if (got.code === "RELEASE-PUSH-NOT-SIGNED") { pass++; console.log("  ok  PO-R4 a chat-mode release approval does not include the push"); } else failures.push(`PO-R4: ${JSON.stringify(got)}`);
}
{
  const s = followUpScenario("release-diverged", { pushApproval: false, tag: false, origin: "absent" });
  gitAt(s.dir, "update-ref", "refs/remotes/origin/main", gitAt(s.dir, "rev-parse", "HEAD~1").stdout.trim());
  gitAt(s.dir, "checkout", "-q", "-b", "side", "HEAD~1"); writeEvidence(s.dir, "src/side.js", "x\n"); gitAt(s.dir, "add", "-A"); gitAt(s.dir, "commit", "-q", "-m", "elsewhere");
  gitAt(s.dir, "update-ref", "refs/remotes/origin/main", headOf(s.dir));
  const got = authorizeReleaseIncludedPush({ projectDir: s.dir, anchorDir: s.dir, commit: s.approved, remote: "origin", destination: "refs/heads/main" });
  if (got.code === "RELEASE-PUSH-NOT-FAST-FORWARD") { pass++; console.log("  ok  PO-R3 the included push is a fast-forward or nothing"); } else failures.push(`PO-R3: ${JSON.stringify(got)}`);
}
{
  const s = followUpScenario("hook-chain");
  s.write(); s.commit();
  checkHook("PO-H1 allow  the generated hook admits the follow-up commit of a release", runHook(s.dir, headOf(s.dir), "refs/heads/main"), 0);
  const tagObject = gitAt(s.dir, "rev-parse", "refs/tags/v1.0.0").stdout.trim();
  checkHook("PO-H2 allow  the generated hook admits the annotated release tag, reading the tag object git really passes it", runHook(s.dir, tagObject, "refs/tags/v1.0.0", "refs/tags/v1.0.0"), 0);
}
{
  const s = followUpScenario("hook-other-path");
  s.write(); writeEvidence(s.dir, "src/app.js", "console.log(1);\n"); s.commit();
  checkHook("PO-H3 block  a follow-up that touches anything else meets the hook's full gate", runHook(s.dir, headOf(s.dir), "refs/heads/main"), 1, { includes: ["push approval"] });
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
