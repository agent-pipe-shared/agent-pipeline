#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * verify-evidence-root.test.mjs -- regression coverage for the evidence-path region of
 * verify.mjs (harness/scripts/verify.mjs, evidenceDir/evidencePath near line 91): those
 * two paths must resolve against the PRIMARY worktree root (the parent of
 * `git rev-parse --path-format=absolute --git-common-dir`), never against the invoking
 * worktree's own root -- while candidateIdentity()'s dirty-check, and every other
 * `repoRoot` consumer, keeps inspecting the INVOKING worktree exactly as before. This is
 * the narrow fix (PO Decision, Option B, 2026-08-18) for backlog
 * 2026-08-09-push-gate-reads-evidence-from-a-location-the-prescribed-verify-run-never-writes-to.md:
 * `guard-push.mjs`'s `resolveEvidenceProject` only ever reads evidence from the primary
 * checkout, but the prescribed clean-candidate route runs verify.mjs from the detached
 * `.git/phx-verify` worktree.
 *
 * Mechanism: a real, disposable, detached `git worktree add` fixture (mirrors the
 * `.git/phx-verify` convention this repo already uses), checked out at HEAD~1 -- a commit
 * deliberately DIFFERENT from the primary worktree's current HEAD -- with the CURRENT
 * on-disk (possibly not-yet-committed) verify.mjs copied over the checked-out one, so the
 * fixture always exercises the exact code under review, not whatever the last commit
 * happened to contain. Copying that one tracked file, plus one untracked marker file,
 * makes the fixture worktree dirty, which forces the real, unmodified verify.mjs down its
 * fast VERIFY-CANDIDATE-PREFLIGHT branch (no suite started) -- so this test runs in well
 * under the 30s bound below and never risks entering the full suite journal, even though
 * this file is itself registered in verify.mjs's own TEST_SUITES and therefore runs on
 * every future verify invocation, including from inside its own fixture worktree's copy.
 *
 * Because the fixture is checked out at a commit distinct from the primary's HEAD, the
 * evidence's recorded `commit` field is a direct, deterministic witness of which worktree
 * candidateIdentity() actually inspected: it can only equal the fixture's commit if the
 * git calls ran with `cwd: repoRoot` (the invoking worktree) as before this fix, never a
 * new `primaryRoot`.
 *
 * The evidence written at the PRIMARY root's `evidence/verify-latest.json` is backed up
 * before the run and restored (or removed, if absent before) in a `finally` block, since
 * this shared repository may run concurrent dispatches that read that file's content.
 *
 * Run:  node --test harness/scripts/verify-evidence-root.test.mjs
 * Exit: 0 = the assertion below passes, non-zero = it failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const currentVerifyScriptPath = join(scriptDir, "verify.mjs");

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

function tryGit(cwd, args) {
  try { return git(cwd, args); } catch { return null; }
}

// Mirror verify.mjs's own primaryRoot resolution (harness/scripts/verify.mjs,
// gitCommonDirectory()/primaryRoot near line 84-104) exactly, instead of a
// naive scriptDir-relative guess: the evidence path this test backs up,
// restores, and asserts against must be computed the SAME way verify.mjs
// computes it. The two diverge whenever THIS test file itself is executing
// from inside a worktree other than the actual primary checkout -- which is
// exactly what happens on every real full-Verify run launched through the
// prescribed clean-candidate route (clean-candidate-run.mjs always runs
// verify.mjs, and therefore this suite, from inside a detached worktree,
// never from the primary checkout directly, since the primary checkout's
// permanently-runtime-modified tracked files make it fail the same candidate
// preflight this test exercises). A standalone `node --test` invocation run
// directly from the primary checkout has repoRoot === primaryRoot, which is
// exactly why this fixture passed standalone yet failed inside every full
// clean-candidate batch run: the assertion checked the wrong file.
const gitCommonDir = tryGit(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const primaryRoot = gitCommonDir !== null ? dirname(gitCommonDir) : repoRoot;
const realEvidenceDir = join(primaryRoot, "evidence");
const realEvidencePath = join(realEvidenceDir, "verify-latest.json");

const primaryHeadCommit = tryGit(repoRoot, ["rev-parse", "HEAD"]);
const fixtureCommit = tryGit(repoRoot, ["rev-parse", "HEAD~1"]);
const fixtureAvailable = primaryHeadCommit !== null && fixtureCommit !== null && fixtureCommit !== primaryHeadCommit;

test(
  "verify.mjs writes evidence to the PRIMARY worktree root while the dirty-check still inspects the INVOKING worktree",
  { skip: fixtureAvailable ? false : "primary repository lacks a distinguishable HEAD~1 fixture commit" },
  () => {
    const originalEvidence = existsSync(realEvidencePath) ? readFileSync(realEvidencePath) : null;
    const parent = mkdtempSync(join(tmpdir(), "verify-evidence-root-"));
    const worktreeDir = join(parent, "invoking-worktree"); // git creates this; must not pre-exist
    try {
      git(repoRoot, ["worktree", "add", "--detach", worktreeDir, fixtureCommit]);

      // Run the EXACT current on-disk verify.mjs (possibly uncommitted), not whatever
      // fixtureCommit's tree happened to contain -- this also makes the fixture worktree
      // dirty (a modified tracked file), independent of the marker file below.
      writeFileSync(join(worktreeDir, "harness", "scripts", "verify.mjs"), readFileSync(currentVerifyScriptPath));
      // Belt-and-suspenders dirtiness signal, explicit and independent of the copy above.
      writeFileSync(join(worktreeDir, ".verify-evidence-root-test-dirty-marker"), "dirty\n");

      const run = spawnSync(process.execPath, [join(worktreeDir, "harness", "scripts", "verify.mjs")], {
        cwd: worktreeDir,
        encoding: "utf8",
        shell: false,
        timeout: 30000,
      });

      assert.equal(
        run.status,
        1,
        `expected the candidate-preflight fast path (exit 1), got status=${run.status} signal=${run.signal} stderr=${(run.stderr || "").slice(0, 500)}`,
      );
      assert.match(run.stderr || "", /VERIFY-CANDIDATE-PREFLIGHT/, "must take the dirty-candidate preflight branch, not run any suite");

      // Evidence write LOCATION: must land at the PRIMARY root, never inside the invoking worktree.
      assert.equal(existsSync(join(worktreeDir, "evidence")), false, "must not create an evidence/ directory inside the invoking worktree");
      assert.ok(existsSync(realEvidencePath), "must write evidence/verify-latest.json at the primary worktree root");
      const escapedPath = realEvidencePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(run.stdout || "", new RegExp(`Evidence written: ${escapedPath}`), "must log the primary evidence path");

      const evidence = JSON.parse(readFileSync(realEvidencePath, "utf8"));
      assert.equal(evidence.exitCode, 1);
      assert.equal(evidence.candidate.start.status, "dirty");
      assert.ok(
        evidence.steps.some((s) => s.name === "candidate-preflight" && s.exitCode === 1),
        "steps must record the candidate-preflight failure",
      );

      // Candidate-identity SOURCE: the recorded commit is the INVOKING worktree's checked-out
      // commit (fixtureCommit), not the primary worktree's own current HEAD -- only possible if
      // candidateIdentity()'s git calls ran with cwd:repoRoot (the invoking worktree), exactly as
      // before this fix, and never against the new primaryRoot.
      assert.equal(evidence.candidate.start.commit, fixtureCommit, "candidate identity must reflect the INVOKING worktree, not the primary");
      assert.notEqual(evidence.candidate.start.commit, primaryHeadCommit, "candidate identity must not silently fall back to the primary worktree's HEAD");
      assert.equal(evidence.commit, fixtureCommit);
    } finally {
      try { spawnSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: repoRoot, shell: false }); } catch { /* best-effort */ }
      try { rmSync(parent, { recursive: true, force: true }); } catch { /* best-effort */ }
      // Restore the shared primary evidence file exactly as found -- this repo runs concurrent
      // dispatches that may depend on its current content; never leave this test's fixture
      // result sitting there as if it were a genuine verify run.
      try {
        if (originalEvidence === null) { if (existsSync(realEvidencePath)) rmSync(realEvidencePath, { force: true }); }
        else writeFileSync(realEvidencePath, originalEvidence);
      } catch { /* best-effort restore; a stale evidence file is a non-durable status snapshot */ }
    }
  },
);
