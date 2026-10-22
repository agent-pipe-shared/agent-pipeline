#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-git-gg22.test.mjs -- the GG-22 (backlog status-flip debt) cases, split out of guard-git.test.mjs
 * (architecture boundary ratchet: split it rather than raise it). The cases below are moved verbatim and keep
 * their ids (GG22-1 .. GG22-15, GG22-T51a-f, GG22-T5F1a-c, GG22-T5F4a-b). The fixture helpers (runGuard,
 * check, gitIn, gitRepoFixture, commitFile) are minimal verbatim copies of the ones in guard-git.test.mjs,
 * which does not export them.
 *
 * Run:   node plugins/pipeline-core/hooks/guard-git-gg22.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a temp dir so a real project
 * guard-config on the machine can never leak into union expectations.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createGovernanceScopeController } from "../lib/governance-scope.mjs";

const enrolledFixtureRoots = new Set();
function enrollFixtureGovernance(root) {
  if (enrolledFixtureRoots.has(root)) return;
  const initialized = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  if (initialized.status !== 0) throw new Error(`fixture Git initialization failed: ${initialized.stderr}`);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture governance was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
  enrolledFixtureRoots.add(root);
}

const GUARD = fileURLToPath(new URL("./guard-git.mjs", import.meta.url));

/**
 * Run the guard exactly like Claude Code does: tool-input JSON on stdin.
 *
 * Hermetics (P4-01): the base env is stripped of PIPELINE_GUARD_OVERRIDE before
 * spreading, so a machine/session-level arming can never leak into a case that
 * didn't ask for it. `envOverride` lets an override-mechanism case opt back into a
 * session-level arming deliberately (AC-1 env-fallback path).
 */
function runGuard(command, projectDir, envOverride = {}) {
  enrollFixtureGovernance(projectDir);
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...baseEnv } = process.env;
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    cwd: projectDir,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: projectDir, ...envOverride },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// Hermetic default project dir for tests unrelated to provenance. Those cases
// opt out explicitly so the mandatory GIT-03 default cannot mask the rule each
// case is intended to exercise.
const EMPTY_DIR = mkdtempSync(join(tmpdir(), "guard-test-empty-"));
mkdirSync(join(EMPTY_DIR, ".claude"), { recursive: true });
writeFileSync(join(EMPTY_DIR, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: "off" }));

let pass = 0;
const failures = [];
function check(id, command, expectExit, { projectDir = EMPTY_DIR, stderrIncludes, stderrExcludes, stderrEmpty, env = {} } = {}) {
  const { code, stderr } = runGuard(command, projectDir, env);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  for (const needle of [].concat(stderrExcludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")} — cmd: ${command}`);
    console.log(`FAIL  ${id} — ${problems.join("; ")}`);
  }
}
const BLOCK = 2, ALLOW = 0;

// Fixture repos created by gitRepoFixture are removed in the summary below.
const SIGNED_ROOTS = [];
function gitIn(root) {
  return (...args) => spawnSync(
    "git",
    ["-C", root, "-c", "user.email=guard-test@example.invalid", "-c", "user.name=Guard Test", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  );
}
function gitRepoFixture(prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  SIGNED_ROOTS.push(root);
  gitIn(root)("init", "--quiet");
  // Enroll before signed fixtures write legacy lifecycle/history records.
  enrollFixtureGovernance(root);
  return root;
}
function commitFile(root, name, body) {
  writeFileSync(join(root, name), body);
  gitIn(root)("add", "--", name);
  gitIn(root)("commit", "--quiet", "-m", `seed ${name}`);
}

// ---- GG-22: a commit must not leave an earlier backlog status-flip unreconciled since -----
// the last backlog/transitions.ndjson touch -------------------------------------------------
//
// Builds on the already-established real-git-repo primitives above (gitRepoFixture/gitIn/
// commitFile, used unmodified for the SIG-* cases) rather than a second git-repo mechanism.
// New, additive helpers used only by the GG22-* cases below -- the plain-temp-dir fixtures
// elsewhere in this file (EMPTY_DIR and friends) are untouched.
function gg22ItemBody(status, triage = "Demo triage text.") {
  return `---\nid: demo-item\nstatus: ${status}\ntitle: demo backlog item\n---\n\nTriage: ${triage}\n`;
}
function gg22CommitItem(root, name, status, message, triage) {
  mkdirSync(join(root, "backlog", "items"), { recursive: true });
  writeFileSync(join(root, "backlog", "items", name), gg22ItemBody(status, triage));
  gitIn(root)("add", "--", `backlog/items/${name}`);
  gitIn(root)("commit", "--quiet", "-m", message);
}
function gg22CommitLedgerTouch(root, message = "chore: reconcile backlog ledger", seq = 1) {
  mkdirSync(join(root, "backlog"), { recursive: true });
  writeFileSync(join(root, "backlog", "transitions.ndjson"), `{"seq":${seq}}\n`);
  gitIn(root)("add", "--", "backlog/transitions.ndjson");
  gitIn(root)("commit", "--quiet", "-m", message);
}
function gg22StageFile(root, relPath, body) {
  // These fixtures isolate GG-22. Keep the independent GIT-03 default from
  // masking the rule and remediation text each case is designed to exercise.
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "guard-config.json"), JSON.stringify({ commitTrailerPolicy: "off" }));
  const segments = relPath.split("/").slice(0, -1);
  if (segments.length > 0) mkdirSync(join(root, ...segments), { recursive: true });
  writeFileSync(join(root, relPath), body);
  gitIn(root)("add", "--", relPath);
}

// GG22-1: bootstrap/no-op -- backlog/transitions.ndjson never existed in this repo's history.
const GG22_BOOT_DIR = gitRepoFixture("guard-test-gg22-bootstrap-");
commitFile(GG22_BOOT_DIR, "seed.txt", "seed\n");
gg22StageFile(GG22_BOOT_DIR, "notes.txt", "hello\n");
check(
  "GG22-1 allow  bootstrap: backlog/transitions.ndjson never existed in history",
  'git commit -m "chore: add notes"',
  ALLOW,
  { projectDir: GG22_BOOT_DIR },
);

// GG22-2: clean -- the status flip is reconciled by a LATER ledger touch, nothing outstanding.
const GG22_CLEAN_DIR = gitRepoFixture("guard-test-gg22-clean-");
commitFile(GG22_CLEAN_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_CLEAN_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitItem(GG22_CLEAN_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22CommitLedgerTouch(GG22_CLEAN_DIR);
gg22StageFile(GG22_CLEAN_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-2 allow  clean: status flip reconciled by a later ledger touch, nothing outstanding",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_CLEAN_DIR },
);

// GG22-3: debt -- the status flip happened AFTER the last ledger touch, disallowed path staged.
const GG22_DEBT_DIR = gitRepoFixture("guard-test-gg22-debt-");
commitFile(GG22_DEBT_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_DEBT_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_DEBT_DIR);
gg22CommitItem(GG22_DEBT_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22StageFile(GG22_DEBT_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-3 block  debt: status flip after the last ledger touch, disallowed path staged",
  'git commit -m "feat: add app"',
  BLOCK,
  { projectDir: GG22_DEBT_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md", "reconcile-backlog-ledger.mjs --activate"] },
);

// GG22-4: the reconciliation commit itself -- only backlog/items/**+ledger paths staged, debt
// exists but this IS the fixing commit and must not be blocked from happening.
const GG22_FIX_DIR = gitRepoFixture("guard-test-gg22-fixcommit-");
commitFile(GG22_FIX_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_FIX_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_FIX_DIR);
gg22CommitItem(GG22_FIX_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22StageFile(GG22_FIX_DIR, "backlog/transitions.ndjson", `{"seq":2}\n`);
check(
  "GG22-4 allow  reconciliation commit: staged commit touches only backlog/items+ledger paths",
  'git commit -m "chore: reconcile backlog ledger"',
  ALLOW,
  { projectDir: GG22_FIX_DIR },
);

// GG22-5: item touched since reconcile, but its status: line did not change (Triage-only edit).
const GG22_TRIAGE_DIR = gitRepoFixture("guard-test-gg22-triage-only-");
commitFile(GG22_TRIAGE_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_TRIAGE_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_TRIAGE_DIR);
gg22CommitItem(GG22_TRIAGE_DIR, "demo.md", "open", "chore: update demo item triage prose", "Updated triage prose, no status change.");
gg22StageFile(GG22_TRIAGE_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-5 allow  non-status edit: item touched since reconcile but its status: line did not change",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_TRIAGE_DIR },
);

// GG22-6: fail-open -- a spawnSync git failure (PATH broken for the guard's own child process)
// must never block, even against the exact same debt state that GG22-3 proves DOES block.
check(
  "GG22-6 allow  fail-open: a spawnSync git failure never blocks (same debt state as GG22-3)",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_DEBT_DIR, env: { PATH: "/nonexistent-guard-test-bin" } },
);

// GG22-7: the corrected remediation order (item edits committed FIRST, reconciler run ONCE, ledger
// commit LAST) drains debt cleanly -- this is the exact sequence that trapped an agent following the
// OLD (reconcile-first) printed order live on 2026-08-29
// (backlog/items/2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md). Batches
// two item closures into one commit (the guard's own code comment: "batched multi-item closures ...
// before one shared reconciliation commit are an established, legitimate pattern").
const GG22_FIXED_ORDER_DIR = gitRepoFixture("guard-test-gg22-fixed-order-");
commitFile(GG22_FIXED_ORDER_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_FIXED_ORDER_DIR, "one.md", "open", "chore: add item one (open)");
gg22CommitItem(GG22_FIXED_ORDER_DIR, "two.md", "open", "chore: add item two (open)");
gg22CommitLedgerTouch(GG22_FIXED_ORDER_DIR, "chore: reconcile backlog ledger", 1);
// Batch-close both items in one commit -- item edits committed FIRST, per the corrected order.
mkdirSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items"), { recursive: true });
writeFileSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items", "one.md"), gg22ItemBody("closed"));
writeFileSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items", "two.md"), gg22ItemBody("closed"));
gitIn(GG22_FIXED_ORDER_DIR)("add", "--", "backlog/items/one.md", "backlog/items/two.md");
gitIn(GG22_FIXED_ORDER_DIR)("commit", "--quiet", "-m", "chore: close items one and two");
// Reconcile ONCE, ledger commit LAST -- after the item commit, not before it.
gg22CommitLedgerTouch(GG22_FIXED_ORDER_DIR, "chore: reconcile backlog ledger", 2);
gg22StageFile(GG22_FIXED_ORDER_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-7 allow  fixed order: item edits committed first, reconciler run once, ledger commit last -- no debt",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_FIXED_ORDER_DIR },
);

// GG22-8: the remediation guidance TEXT itself states the corrected order -- item edits first,
// reconciler once, ledger commit last -- and reuses GG22-3's own debt fixture (same BLOCK case) to
// prove the printed message no longer tells an agent to commit the ledger "before any other commit"
// (the phrasing that forced the inverted, debt-trapping order) and instead names the item-edits-first,
// ledger-last sequence.
check(
  "GG22-8 block  remediation text states the corrected reconcile-last order, not reconcile-first",
  'git commit -m "feat: add app"',
  BLOCK,
  {
    projectDir: GG22_DEBT_DIR,
    stderrIncludes: [
      "GG-22",
      "Commit any pending backlog/items/ status edits first",
      "then commit the resulting backlog/STATUS.md / backlog/index.json / backlog/transitions.ndjson changes last.",
    ],
  },
);

// GG22-9 through GG22-15: a pathspec'd commit is scoped to the paths it names only when
// the invocation is provably pathspec-exclusive. Each fixture builds real history with status-flip
// debt and a deliberately unrelated staged source file: a pass must come from the fixed commit
// pathspec handling, never from an empty index or absent debt.
function gg22PathspecDebtFixture(prefix) {
  const root = gitRepoFixture(prefix);
  commitFile(root, "seed.txt", "seed\n");
  gg22CommitItem(root, "demo.md", "open", "chore: add demo item (open)");
  gg22CommitLedgerTouch(root);
  gg22CommitItem(root, "demo.md", "in_progress", "chore: flip demo item to in_progress");
  gg22StageFile(root, "backlog/transitions.ndjson", "{\"seq\":2}\n");
  gg22StageFile(root, "src/unrelated.mjs", "export const unrelated = true;\n");
  return root;
}

const GG22_PATHSPEC_ALLOWED_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-allowed-");
check(
  "GG22-9 allow  pathspec ledger commit ignores unrelated staged source file",
  'git commit -m "chore: reconcile ledger" -- backlog/transitions.ndjson',
  ALLOW,
  { projectDir: GG22_PATHSPEC_ALLOWED_DIR },
);

const GG22_PATHSPEC_DISALLOWED_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-disallowed-");
check(
  "GG22-10 block  pathspec source commit remains blocked while GG22 debt exists",
  'git commit -m "feat: source change" -- src/unrelated.mjs',
  BLOCK,
  { projectDir: GG22_PATHSPEC_DISALLOWED_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);

const GG22_PATHSPEC_BARE_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-bare-");
check(
  "GG22-11 block  bare staged-index commit remains blocked with unrelated source staged",
  'git commit -m "feat: source change"',
  BLOCK,
  { projectDir: GG22_PATHSPEC_BARE_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);

const GG22_PATHSPEC_INCLUDE_SHORT_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-include-short-");
check(
  "GG22-12 block  -i widens a pathspec commit to the staged index",
  'git commit -i -m "chore: reconcile ledger" -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: GG22_PATHSPEC_INCLUDE_SHORT_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);

const GG22_PATHSPEC_INCLUDE_LONG_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-include-long-");
check(
  "GG22-13 block  --include widens a pathspec commit to the staged index",
  'git commit --include -m "chore: reconcile ledger" -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: GG22_PATHSPEC_INCLUDE_LONG_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);

const GG22_PATHSPEC_TRAVERSAL_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-traversal-");
check(
  "GG22-14 block  ../ traversal escaping backlog/items is disallowed",
  'git commit -m "feat: source change" -- backlog/items/../../src/unrelated.mjs',
  BLOCK,
  { projectDir: GG22_PATHSPEC_TRAVERSAL_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);

const GG22_PATHSPEC_TRAILING_DIR = gg22PathspecDebtFixture("guard-test-gg22-pathspec-trailing-");
gg22StageFile(GG22_PATHSPEC_TRAILING_DIR, "backlog/items/repair.md", gg22ItemBody("closed"));
check(
  "GG22-15 allow  trailing-slash backlog/items directory pathspec is admitted",
  'git commit -m "chore: close item" -- backlog/items/',
  ALLOW,
  { projectDir: GG22_PATHSPEC_TRAILING_DIR },
);

// ---- TR-C: GG-22 pathspec fast path admits --trailer (toil-resolution row T51) -------------------
// Added by the tranche-2 post-image of dispatch TR-C-T-20261009. Today --trailer (and its value token) is in
// neither PATHSPEC_EXCLUSIVE_SAFE_FLAGS nor the value-flag lists, so a pathspec ledger commit that carries
// trailers is not provably exclusive, falls through to git diff --cached and is blocked by an unrelated staged
// source file (GG22-9 shows the same commit without trailers is allowed). T51a and T51b are RED on that account.
// T51c to T51e pin that the addition widens nothing (I3): a source path stays blocked, -i stays widening, and
// --no-verify stays a hook bypass (GG-17). -n and -c are deliberately not pinned: -n is already in the GG-22
// safe list (a message/display flag there, unrelated to hook bypass) and which guard rule catches -n is unverified.
const GG22_T51_LEDGER_TRAILERS = 'git commit -m "chore: reconcile ledger" --trailer "AI-Assisted: true" --trailer "Dispatch: TR-C-T-20261009 (goldfish)" -- backlog/transitions.ndjson';
check(
  "GG22-T51a allow  pathspec ledger commit carrying --trailer values ignores the unrelated staged source file",
  GG22_T51_LEDGER_TRAILERS,
  ALLOW,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51a-") },
);
check(
  "GG22-T51b allow  the --trailer=<value> spelling is equally a safe flag on a pathspec ledger commit",
  'git commit -m "chore: reconcile ledger" --trailer="AI-Assisted: true" -- backlog/transitions.ndjson',
  ALLOW,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51b-") },
);
check(
  "GG22-T51c block  --trailer does not let a source-path pathspec commit past GG-22",
  'git commit -m "feat: source change" --trailer "AI-Assisted: true" -- src/unrelated.mjs',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51c-"), stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);
check(
  "GG22-T51d block  -i beside --trailer still widens a pathspec commit to the staged index",
  'git commit -i -m "chore: reconcile ledger" --trailer "AI-Assisted: true" -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51d-"), stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);
check(
  "GG22-T51e block  --no-verify beside --trailer stays blocked (I3, hook bypass; exit code only)",
  'git commit --no-verify -m "chore: reconcile ledger" --trailer "AI-Assisted: true" -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51e-") },
);
check(
  "GG22-T51f text   --no-verify beside --trailer is still reported as GG-17 (RED until T51a/b land: today another rule answers first, exit 2 but no GG-17 text)",
  'git commit --no-verify -m "chore: reconcile ledger" --trailer "AI-Assisted: true" -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t51f-"), stderrIncludes: ["GG-17"] },
);

// ---- TR-C-T5: consumed-value flags before -i, and git --help (TR-C Critic findings F1 and F4) -----
// Added by the tranche-2 post-image of dispatch TR-C-T5-20261009. F1: the GG-22 pathspec fast path skips a token
// whenever the PREVIOUS token is a value-taking flag, even when that previous token was itself consumed as a value.
// git reads the second --trailer in "--trailer --trailer -i" as the VALUE of the first, and the second -m in
// "-m <subject> -m -m -i" likewise, so the following -i is a real --include that widens the commit to the staged index
// (the unrelated staged source file of the fixture). T5F1a and T5F1b are RED while the skip stays unconditional.
// T5F1c is a GREEN control: an ordinary second -m paragraph stays admitted. The subject is a conventional one on
// purpose: GIT-01 answers first for a bare x subject, which would make the pin pass for the wrong rule.
// NOT pinned: "-m <subject> -m -i -- <ledger>" (the briefed second spelling). There git takes -i as the VALUE of the
// second -m, a message paragraph, so no --include exists; admitting it is correct and a block would be a false positive.
// F4: git --help is pinned as TR-C-F-MANIFEST.md declares it: collapsed like --version, so alone it is a bare git word
// and a following dangerous subcommand stays visible. Both are GREEN by design (the behaviour exists; it had no pin).
check(
  "GG22-T5F1a block  --trailer --trailer -i: the second --trailer is the first one's value, so -i is a real --include",
  'git commit -m "chore: reconcile ledger" --trailer --trailer -i -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t5f1a-"), stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);
check(
  "GG22-T5F1b block  -m <subject> -m -m -i: the third -m is the second one's value, so -i is a real --include",
  'git commit -m "chore: reconcile ledger" -m -m -i -- backlog/transitions.ndjson',
  BLOCK,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t5f1b-"), stderrIncludes: ["GG-22", "backlog/items/demo.md"] },
);
check(
  "GG22-T5F1c allow  control: an ordinary second -m paragraph on a pathspec ledger commit stays admitted",
  'git commit -m "chore: reconcile ledger" -m "second paragraph" -- backlog/transitions.ndjson',
  ALLOW,
  { projectDir: gg22PathspecDebtFixture("guard-test-gg22-t5f1c-") },
);
check(
  "GG22-T5F4a allow  git --help alone collapses to a bare git word and blocks nothing",
  "git --help",
  ALLOW,
);
check(
  "GG22-T5F4b block  git --help collapses like --version, so a following reset --hard stays visible to the destructive rules",
  "git --help reset --hard HEAD~1",
  BLOCK,
);

// ---- Summary -------------------------------------------------------------------------------------
for (const dir of [EMPTY_DIR, ...SIGNED_ROOTS]) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
