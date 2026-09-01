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
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));

const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-tagprov-${prefix}-`));
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
function check(id, command, dir, expectExit, { stderrIncludes, stderrNotIncludes } = {}) {
  const { code, stderr } = runGuard(command, dir);
  const problems = [];
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

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  - ${failure}`);
  for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
process.exit(0);
