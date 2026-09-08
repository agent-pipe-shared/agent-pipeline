#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Operator tool: apply the protected-path edits an agent session cannot.
 *
 * WHY THIS EXISTS. Several files in this repository are protected test paths,
 * and each has finished, verified content waiting for it:
 *
 *   A. `harness/scripts/verify.mjs`  (TP-3) -- suites written in this and earlier
 *      blocks are not registered, so Verify does not run them. The list grows: the
 *      seven of the 2026-08-08 batch are applied, and `repair-map-tests` /
 *      `obligations-contract-tests` were added on 2026-08-09. Already-registered
 *      entries are detected and skipped, so re-running is safe.
 *   B. `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` (TP-6) -- four
 *      checks (GST33-GST36) plus a title repair for GST14, validated 4/4 against
 *      the real committed guard.
 *   C. `plugins/pipeline-core/lib/entrypoint.test.mjs` (TP-8) -- EP07 pointed
 *      CLAUDE_PROJECT_DIR at this repository, so every run recorded two REAL guard
 *      denials against it and appended four governance events (NVA-VERIFYPOLLUTE-1,
 *      measured 2026-08-27). That is why Verify needed two runs: it dirtied its own
 *      working tree mid-flight and failed security-scan and candidate-binding on the
 *      result. Verified green via `--preview` before being offered here.
 *   D. `plugins/pipeline-core/hooks/guard-git.test.mjs` (TP-1) -- GIT03-1/2/5's `-F`
 *      fixtures broke once guard-git.mjs itself was fixed (2026-08-28,
 *      backlog/items/2026-08-28-a-relative-commit-message-file-is-unreadable-from-a
 *      -worktree.md) to resolve a `-F` message file against the invoking process cwd
 *      instead of CLAUDE_PROJECT_DIR: `runGuard()` sets CLAUDE_PROJECT_DIR to its temp
 *      fixture dir but never sets the spawned guard's cwd, so the three fixtures were
 *      passing only because the guard used to ignore cwd -- fixture blindness, not a
 *      fix regression. Verified green via `--preview` before being offered here.
 *   E. `harness/scripts/verify.mjs` (TP-3, again) -- four more suites written this
 *      block (copy-safe-command, project-onboarding-v3-pre-push-hook-offer,
 *      onboarding-init, push-gate-satisfiability) sit outside the Verify gate for the
 *      same reason step A's did. Kept as its own previewable step rather than folded
 *      into step A's VERIFY_REGISTRATIONS list: step A's own `--check` never actually
 *      runs a suite (only lists pending names), so it cannot stand in for the
 *      sibling-copy green-preview proof this batch needs before an operator applies it
 *      sight-unseen. Verified green via `--preview` before being offered here.
 *   H. `harness/scripts/pipeline-state.test.mjs` and
 *      `plugins/pipeline-core/scripts/pipeline-state.test.mjs` (TP-5) -- the PO
 *      authority rebind/decision fixtures omitted their own runner environment and
 *      one older positive acknowledgement-plan invocation omitted its now-required
 *      explicit runner. A naked CI/operator shell has no ambient marker, so the real
 *      writer correctly refused with PO-REBIND-RUNNER-UNKNOWN. The pending atomic
 *      edit gives only those fixtures a hermetic Codex runner identity.
 *
 * `guard-testpath` refuses both from inside a session, and for (B) there is no
 * override at all: the target is Pipeline plugin source in a source checkout, so
 * `recordHumanGuardDenial()` returns `author-repair-required` rather than
 * `planned`. The sanctioned route is an attended operator, outside the session.
 * That is you, running this script.
 *
 * WHAT IT GUARANTEES.
 *   - It never guesses. Every insertion point is an exact anchor string that must
 *     occur EXACTLY ONCE; a missing or ambiguous anchor aborts the whole step
 *     before a single byte is written, naming the anchor that failed.
 *   - It is idempotent. A step already applied is detected and skipped.
 *   - It verifies, then keeps or reverts. After writing, it runs the affected
 *     suite. If the suite does not reach its expected result, the original bytes
 *     are restored and the step reports failure. You are never left with a
 *     half-applied protected file.
 *   - It is scoped. It touches exactly the files named above and nothing
 *     else, and it does not commit -- reviewing and committing stays yours.
 *
 * USAGE
 *   node harness/scripts/apply-pending-protected-edits.mjs --check   # dry run, writes nothing
 *   node harness/scripts/apply-pending-protected-edits.mjs           # apply every pending step
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=verify
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=gate-strength
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=entrypoint
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=guard-git-cwd
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=verify-nva-c-protected
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=pipeline-state-runner-fixture
 *
 * Exit code 0 = every requested step is applied and verified (or was already
 * applied). Any other exit code means nothing was left changed by the failing
 * step. Review with `git diff` afterwards, then commit.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const VERIFY_PATH = join(REPO_ROOT, "harness", "scripts", "verify.mjs");
const GATE_STRENGTH_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-gate-strength.test.mjs");
const ENTRYPOINT_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "lib", "entrypoint.test.mjs");
const GUARD_GIT_TEST_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-git.test.mjs");
const PIPELINE_STATE_TEST_PATH = join(REPO_ROOT, "harness", "scripts", "pipeline-state.test.mjs");
const PIPELINE_STATE_PLUGIN_TEST_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "pipeline-state.test.mjs");

/* ------------------------------------------------------------------ helpers */

function rel(absolute) {
  return relative(REPO_ROOT, absolute).split("\\").join("/");
}

/** Replace `anchor` with `replacement`, refusing unless the anchor occurs exactly once. */
function anchoredReplace(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found (${label}): the file does not contain the expected text. Nothing was written.`);
  if (source.indexOf(anchor, first + anchor.length) !== -1) {
    throw new Error(`anchor is ambiguous (${label}): the expected text occurs more than once. Nothing was written.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

/** Replace one uniquely delimited block while retaining its end marker. */
function anchoredBlockReplace(source, startAnchor, endAnchor, replacement, label) {
  const start = source.indexOf(startAnchor);
  if (start === -1 || source.indexOf(startAnchor, start + startAnchor.length) !== -1) {
    throw new Error(`block start is missing or ambiguous (${label}). Nothing was written.`);
  }
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  if (end === -1 || source.indexOf(endAnchor, end + endAnchor.length) !== -1) {
    throw new Error(`block end is missing or ambiguous (${label}). Nothing was written.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

/**
 * One failing-suite entry, WITH the suite's own output.
 *
 * This used to report only `exited <code>`. That made a refusal correct and
 * unactionable at the same time: the step reverts the protected file (right),
 * and the operator is told a suite failed without being told anything a person
 * could act on (wrong). It cost two live operator rounds on 2026-08-28, where
 * `onboarding-init-tests` failed twice under the applier and passed every time
 * it was run by hand -- a difference nobody could diagnose, because the one run
 * that reproduced it was also the one run that discarded its evidence.
 *
 * The tail rather than the head: node's test reporter prints the failure list
 * and the counts at the end, so the last bytes are the ones that say what broke.
 */
function suiteFailureEntry(entry, suite) {
  const line = `  - ${entry.name} (${rel(entry.file)}) exited ${suite.code}`;
  const output = String(suite.output ?? "").trimEnd();
  if (output === "") return `${line}\n      (the suite produced no output)`;
  const tail = output.length > SUITE_FAILURE_OUTPUT_MAX
    ? `...\n${output.slice(-SUITE_FAILURE_OUTPUT_MAX)}`
    : output;
  const indented = tail.split("\n").map((row) => `      ${row}`).join("\n");
  return `${line}\n${indented}`;
}

const SUITE_FAILURE_OUTPUT_MAX = 4000;

/** Run one command, returning its combined output and exit code. Never throws. */
function run(argv, cwd = REPO_ROOT, env = process.env) {
  const result = spawnSync(process.execPath, argv, { cwd, encoding: "utf8", env, shell: false, timeout: 600_000 });
  return {
    code: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * The working tree as one comparable string, untracked files included. Step C uses
 * it to assert that running a suite changes nothing -- the property NVA-VERIFYPOLLUTE-1
 * violated.
 */
function gitStatus() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: REPO_ROOT, encoding: "utf8", shell: false,
  });
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr ?? ""}`);
  return result.stdout ?? "";
}

/**
 * Write `next` to `path`, run `verifier()`, and restore the original bytes if it
 * fails. The original is held in memory and restored on ANY failure, including
 * an exception thrown by the verifier itself.
 */
function writeThenVerifyOrRevert(path, original, next, verifier) {
  writeFileSync(path, next, "utf8");
  let verdict;
  try {
    verdict = verifier();
  } catch (error) {
    writeFileSync(path, original, "utf8");
    throw new Error(`verification threw, original restored: ${error.message}`);
  }
  if (!verdict.ok) {
    writeFileSync(path, original, "utf8");
    throw new Error(`verification failed, original restored.\n${verdict.detail}`);
  }
  return verdict.detail;
}

/** Same contract as writeThenVerifyOrRevert(), atomically across several files. */
function writeManyThenVerifyOrRevert(files, verifier) {
  const restore = () => {
    const failures = [];
    for (const file of files) {
      try { writeFileSync(file.path, file.original, "utf8"); }
      catch (error) { failures.push(`${rel(file.path)}: ${error.message}`); }
    }
    if (failures.length > 0) throw new Error(`rollback failed:\n${failures.join("\n")}`);
  };
  try {
    for (const file of files) writeFileSync(file.path, file.next, "utf8");
    const verdict = verifier();
    if (!verdict.ok) throw new Error(`verification failed.\n${verdict.detail}`);
    return verdict.detail;
  } catch (error) {
    try { restore(); }
    catch (restoreError) {
      throw new Error(`${error.message}\n${restoreError.message}`);
    }
    throw new Error(`${error.message}\nall originals restored`);
  }
}

/* ------------------------------------------------------- step A: verify.mjs */

// Each entry names the suite, the `verify.mjs` directory constant its path is
// built from, and the file itself. The directory constants are the ones
// verify.mjs already declares (repoRoot/hooksDir/libDir/pluginScriptsDir); this
// script does not introduce new ones.
const VERIFY_REGISTRATIONS = [
  {
    // Guards the tool that wires the dispatch-budget hook. Its post-write
    // predicate was wrong once in a way none of its own nine preconditions
    // could catch (a raw substring search against JSON.stringify output, which
    // escapes the quotes the command contains): it reverted a correct write and
    // would have let a second run insert a duplicate registration.
    name: "wire-dispatch-budget-hook-tests",
    line: '  { name: "wire-dispatch-budget-hook-tests", file: join(repoRoot, "harness", "scripts", "wire-dispatch-budget-hook.test.mjs") },',
    file: join(REPO_ROOT, "harness", "scripts", "wire-dispatch-budget-hook.test.mjs"),
  },
  {
    name: "machine-plane-tests",
    line: '  { name: "machine-plane-tests", file: join(libDir, "machine-plane.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "machine-plane.test.mjs"),
  },
  {
    name: "consumer-safe-paths-tests",
    line: '  { name: "consumer-safe-paths-tests", file: join(repoRoot, "harness", "scripts", "check-consumer-safe-paths.test.mjs") },',
    file: join(REPO_ROOT, "harness", "scripts", "check-consumer-safe-paths.test.mjs"),
  },
  {
    name: "verify-evidence-producer-tests",
    line: '  { name: "verify-evidence-producer-tests", file: join(pluginScriptsDir, "verify-evidence-producer.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "verify-evidence-producer.test.mjs"),
  },
  {
    name: "lifecycle-recovery-contract-tests",
    line: '  { name: "lifecycle-recovery-contract-tests", file: join(hooksDir, "guard-lifecycle-recovery-contract.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-lifecycle-recovery-contract.test.mjs"),
  },
  {
    // NVA-CF-ITEM25EXTRACT: the module verify.mjs's own manual-check step now imports from.
    name: "manual-check-logic-tests",
    line: '  { name: "manual-check-logic-tests", file: join(repoRoot, "harness", "scripts", "manual-check-logic.test.mjs") },',
    file: join(REPO_ROOT, "harness", "scripts", "manual-check-logic.test.mjs"),
  },
  {
    name: "pipeline-state-inspection-contract-tests",
    line: '  { name: "pipeline-state-inspection-contract-tests", file: join(pluginScriptsDir, "pipeline-state-inspection-contract.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "pipeline-state-inspection-contract.test.mjs"),
  },
  {
    name: "project-reset-tests",
    line: '  { name: "project-reset-tests", file: join(pluginScriptsDir, "project-reset.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "project-reset.test.mjs"),
  },
  {
    name: "po-human-approval-tests",
    line: '  { name: "po-human-approval-tests", file: join(pluginScriptsDir, "po-human-approval.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "po-human-approval.test.mjs"),
  },
  // Added 2026-08-09. Both suites were written during GF-057, run green by the
  // Elephant, and listed in docs/pending-verify-registrations.md -- under a banner
  // that by then said nothing was pending. Registering them is the same human step
  // as the seven above, which is why they belong in this list rather than in a
  // second tool.
  {
    name: "repair-map-tests",
    line: '  { name: "repair-map-tests", file: join(pluginScriptsDir, "repair-map.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "repair-map.test.mjs"),
  },
  {
    name: "obligations-contract-tests",
    line: '  { name: "obligations-contract-tests", file: join(scriptDir, "generate-agent-obligations.test.mjs") },',
    file: join(REPO_ROOT, "harness", "scripts", "generate-agent-obligations.test.mjs"),
  },
  {
    name: "resume-hint-tests",
    line: '  { name: "resume-hint-tests", file: join(libDir, "resume-hint.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "resume-hint.test.mjs"),
  },
  // Added 2026-08-18 (backlog/items/2026-08-17-test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention.md).
  // Mirrors the already-registered `bootstrap-payload-budget-tests` shape: a
  // `lib/` module's own co-located test file, one entry, nothing else touched.
  // See docs/pending-verify-registrations.md for the full pending table.
  {
    name: "test-tmpdir-tests",
    line: '  { name: "test-tmpdir-tests", file: join(libDir, "test-tmpdir.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "test-tmpdir.test.mjs"),
  },
  {
    name: "test-tmpdir-budget-tests",
    line: '  { name: "test-tmpdir-budget-tests", file: join(libDir, "test-tmpdir-budget.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "test-tmpdir-budget.test.mjs"),
  },
  // Added 2026-08-27. The dispatch-budget guard was built and unit-tested this
  // block; `check-verify-suite-registration.mjs` reports it as the ONE remaining
  // unregistered suite in the repository. Registering the suite is independent of
  // wiring the guard itself into hooks.json (TP-4), which stays a separate step.
  {
    name: "guard-dispatch-budget-tests",
    line: '  { name: "guard-dispatch-budget-tests", file: join(hooksDir, "guard-dispatch-budget.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-dispatch-budget.test.mjs"),
  },
  // Added 2026-08-27 (NVA-AGYDRIFT-2). The within-v3 pipeline.user.yaml drift
  // detector (pipeline-user-v3-drift.mjs, inspectPipelineUserV3Drift) was
  // built and unit-tested this dispatch (7/7 green). Registering the suite
  // is independent of any other pending step.
  {
    name: "pipeline-user-v3-drift-tests",
    line: '  { name: "pipeline-user-v3-drift-tests", file: join(libDir, "pipeline-user-v3-drift.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "pipeline-user-v3-drift.test.mjs"),
  },
  // Added 2026-08-27 (NVA-AGYHOOKS-1). Pins the handler shape of all three
  // runner hook manifests (Claude, Codex, Antigravity) and confirms every
  // declared command references a hook script that exists on disk -- the
  // first suite to cover plugins/pipeline-core/hooks.json (the Antigravity
  // manifest) at all, closing the D-2 gap named in
  // scratch/ANALYSIS-agy-retro-2026-08-27.md. 12/12 green.
  {
    name: "hooks-manifest-shape-tests",
    line: '  { name: "hooks-manifest-shape-tests", file: join(hooksDir, "hooks-manifest-shape.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "hooks-manifest-shape.test.mjs"),
  },
  // Added 2026-08-27 (NVA-PREPUSH-1). Covers the git-level pre-push hook installer
  // (plugins/pipeline-core/scripts/pre-push-hook-install.mjs) that mirrors guard-
  // push.mjs's evidence/approval gate at the git hook layer, so it still applies when
  // the plugin hook layer itself has failed to load. 25/25 green.
  {
    name: "pre-push-hook-install-tests",
    line: '  { name: "pre-push-hook-install-tests", file: join(pluginScriptsDir, "pre-push-hook-install.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "pre-push-hook-install.test.mjs"),
  },
  // Added 2026-08-30 (NVA-GF-VERIFY-REG-BUNDLE-1). These two green suites
  // cover the first-anchor bootstrap boundary and onboarding from an unborn
  // HEAD. Keeping both in step A makes one attended `--only=verify` action
  // register, run, and roll back the complete pending pair atomically.
  {
    name: "pre-commit-hook-install-trust-anchor-bootstrap-tests",
    line: '  { name: "pre-commit-hook-install-trust-anchor-bootstrap-tests", file: join(pluginScriptsDir, "pre-commit-hook-install.trust-anchor-bootstrap.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "pre-commit-hook-install.trust-anchor-bootstrap.test.mjs"),
  },
  {
    name: "project-onboarding-v3-unborn-head-tests",
    line: '  { name: "project-onboarding-v3-unborn-head-tests", file: join(pluginScriptsDir, "project-onboarding-v3-unborn-head.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "project-onboarding-v3-unborn-head.test.mjs"),
  },
];

// The terminator moves every time a batch is registered, so this constant is
// re-pointed with each batch rather than left to fail as a stale anchor. It failed
// exactly that way after the 2026-08-08 batch: `nova-verify-journal-tests` was no
// longer the last entry, and the next operator run would have aborted on a missing
// anchor -- correctly, but with the tool unusable until someone noticed. Re-pointed
// again 2026-08-18: `reference-path-check` was no longer the last entry either (the
// 2026-08-09 resume-hint batch landed after it, per docs/pending-verify-registrations.md);
// confirmed against the real, current `harness/scripts/verify.mjs` before this edit.
// Re-pointed again 2026-08-27: the 2026-08-18 test-tmpdir batch and the
// `pipeline-start-preflight-antigravity-hard-enforcement-tests` entry (commit
// ab347a74) both landed after `resume-hint-tests`, so the previous anchor was
// stale and the next operator run would have aborted on a missing anchor --
// correctly, but with the tool unusable. Confirmed against the real, current
// `harness/scripts/verify.mjs` (its TEST_SUITES terminator) before this edit.
// Re-pointed for the LAST time 2026-08-27. The four comment paragraphs above
// are the whole argument against a hardcoded anchor: it named whichever suite
// happened to be last, so every successful run of this very script moved the
// terminator and left the anchor stale, and the next run aborted on a missing
// anchor -- correctly, but with the tool unusable until a human re-pointed it.
// It went stale three times. The terminator is now DERIVED from the array's
// own bounds, which no insertion can move: locate the sole `const TEST_SUITES =
// [` and take the first array terminator after it. Same guarantee as before --
// a marker that is missing or ambiguous aborts before a byte is written -- but
// nothing left to maintain.
const TEST_SUITES_MARKER = "const TEST_SUITES = [";
const TEST_SUITES_TERMINATOR = "\n];";

/** Byte offset at which a new registration line must be inserted, or a thrown refusal. */
function verifyInsertionPoint(source) {
  const start = source.indexOf(TEST_SUITES_MARKER);
  if (start === -1) throw new Error(`marker not found (verify.mjs TEST_SUITES): the file does not contain ${JSON.stringify(TEST_SUITES_MARKER)}. Nothing was written.`);
  if (source.indexOf(TEST_SUITES_MARKER, start + TEST_SUITES_MARKER.length) !== -1) {
    throw new Error(`marker is ambiguous (verify.mjs TEST_SUITES): ${JSON.stringify(TEST_SUITES_MARKER)} occurs more than once. Nothing was written.`);
  }
  const end = source.indexOf(TEST_SUITES_TERMINATOR, start + TEST_SUITES_MARKER.length);
  if (end === -1) throw new Error("terminator not found (verify.mjs TEST_SUITES): the array is not closed by a line containing only `];`. Nothing was written.");
  return end;
}

function stepVerify({ dryRun }) {
  const original = readFileSync(VERIFY_PATH, "utf8");

  const pending = VERIFY_REGISTRATIONS.filter((entry) => !original.includes(`name: "${entry.name}"`));
  if (pending.length === 0) return { status: "already-applied", detail: `all ${VERIFY_REGISTRATIONS.length} suites are already registered` };

  // A registration pointing at a file that is not there would break Verify for
  // everyone; refuse before writing rather than after.
  const missing = pending.filter((entry) => !existsSync(entry.file));
  if (missing.length > 0) {
    throw new Error(`these suite files do not exist, refusing to register them:\n${missing.map((entry) => `  - ${rel(entry.file)}`).join("\n")}`);
  }

  const at = verifyInsertionPoint(original);
  const next = `${original.slice(0, at)}\n${pending.map((entry) => entry.line).join("\n")}${original.slice(at)}`;

  if (dryRun) {
    return { status: "would-apply", detail: `${pending.length} registration(s):\n${pending.map((entry) => `  + ${entry.name}`).join("\n")}` };
  }

  const detail = writeThenVerifyOrRevert(VERIFY_PATH, original, next, () => {
    // 1. verify.mjs must still parse. `--check` is syntax-only: it never runs
    //    the gate, which would need approvals this script has no business
    //    touching.
    const parsed = run(["--check", VERIFY_PATH]);
    if (parsed.code !== 0) return { ok: false, detail: `verify.mjs no longer parses:\n${parsed.output}` };

    // 2. Every newly registered suite must actually pass. A registration that
    //    turns Verify red is worse than the gap it closes.
    const failures = [];
    for (const entry of pending) {
      const suite = run([entry.file]);
      if (suite.code !== 0) failures.push(suiteFailureEntry(entry, suite));
    }
    if (failures.length > 0) return { ok: false, detail: `newly registered suites did not pass:\n${failures.join("\n")}` };

    return { ok: true, detail: `${pending.length} suite(s) registered and each run green:\n${pending.map((entry) => `  + ${entry.name}`).join("\n")}` };
  });

  return { status: "applied", detail };
}

/* ------------------------------------ step B: guard-gate-strength.test.mjs */

const GS_IMPORT_ANCHOR = 'import { dirname, join } from "node:path";';
const GS_IMPORT_REPLACEMENT = 'import { dirname, join, relative, resolve } from "node:path";';

const GS_GUARD_IMPORT_ANCHOR = 'import { GATE_STRENGTH_PATHS, LIVE_PLUGIN_RULE, gateStrengthRuleFor, insideLivePlugin, livePluginRoots } from "./guard-gate-strength.mjs";';
const GS_GUARD_IMPORT_REPLACEMENT = `${GS_GUARD_IMPORT_ANCHOR}
import { GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS } from "./guard-lifecycle-ready.mjs";`;

const GS14_ANCHOR = 'check("GST14 reading a gate-strength file from the shell is never claimed by this rule", () => {';
const GS14_REPLACEMENT = 'check("GST14 the cat-shaped reads (cat, sha256sum, git diff, rg, head) of a gate-strength file are never claimed by this rule -- GST34 covers the script-identity exemption shape", () => {';

const GS_CHECKS_ANCHOR = '  console.log(`\\nguard-gate-strength: ${passed} passed, ${failed} failed`);';

// GST33-GST36, with the helper block they need. This script carries the only
// surviving copy of the payload: the paste-ready draft it was transcribed from
// was retired on 2026-08-09 once its content had been applied and committed.
// The helpers live here, immediately before their only callers, rather than
// beside LIFECYCLE_GUARD:
// one insertion point instead of two, and nothing defined far from its use.
const GS_CHECKS_BLOCK = `  // Self-application (ADR-0015): this repo's own checkout is a real governed root
  // (has project/pipeline.json, GOVERNANCE_MARKERS), and its own
  // plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs is a real file at the
  // path the exemption's PLUGIN_ROOT resolves to when THIS test file's own sibling
  // guard-lifecycle-ready.mjs is loaded in-process. That is exactly the shape AC-5
  // needs: the same real command, not a synthetic tmpdir fixture the exempt script
  // cannot physically live inside.
  const PROJECT_ROOT = join(PLUGIN_ROOT, "..", "..");

  const FORBIDDEN_WRITE_APIS = [
    "writeFileSync", "appendFileSync", "mkdirSync", "rmSync", "renameSync", "unlinkSync",
    "openSync", "createWriteStream", "cpSync", "copyFileSync", "symlinkSync", "truncateSync",
    "chmodSync", "utimesSync",
  ];
  const FORBIDDEN_PROMISE_WRITE_APIS = FORBIDDEN_WRITE_APIS
    .filter((name) => name !== "createWriteStream")
    .map((name) => name.replace(/Sync$/u, ""));

  function importsFsPromises(source) {
    return /from\\s+["']node:fs\\/promises["']/u.test(source) || /from\\s+["']fs\\/promises["']/u.test(source);
  }

  function relativeImportSpecifiers(source) {
    const specifiers = new Set();
    const staticRe = /\\bfrom\\s+["'](\\.\\.?\\/[^"']+)["']/gu;
    const dynamicRe = /\\bimport\\(\\s*["'](\\.\\.?\\/[^"']+)["']\\s*\\)/gu;
    for (const re of [staticRe, dynamicRe]) {
      let match;
      while ((match = re.exec(source)) !== null) specifiers.add(match[1]);
    }
    return [...specifiers];
  }

  // Walks a script's source and its transitive PLUGIN-LOCAL relative imports only (bare
  // specifiers like "node:fs" are never followed). AC-3's honesty check: this is what
  // turns "provably write-free" in guard-lifecycle-ready.mjs's comment from a claim into
  // something verified on every run.
  function walkPluginLocalSource(entryAbsolutePath, pluginRoot, visited = new Set()) {
    if (visited.has(entryAbsolutePath)) return [];
    visited.add(entryAbsolutePath);
    const source = readFileSync(entryAbsolutePath, "utf8");
    const files = [{ path: entryAbsolutePath, source }];
    for (const specifier of relativeImportSpecifiers(source)) {
      const resolved = resolve(dirname(entryAbsolutePath), specifier);
      const relPath = relative(pluginRoot, resolved);
      if (relPath === "" || relPath.startsWith("..")) continue; // plugin-local only
      files.push(...walkPluginLocalSource(resolved, pluginRoot, visited));
    }
    return files;
  }

  check("GST33 every GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS entry, and its transitive plugin-local imports, carry no filesystem-write API", () => {
    assert.ok(GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS.length > 0, "the exempt set must not be empty for this test to mean anything");
    for (const entry of GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS) {
      const entryPath = join(PLUGIN_ROOT, entry.path);
      const visited = walkPluginLocalSource(entryPath, PLUGIN_ROOT);
      assert.ok(visited.length > 0, \`no source found for \${entry.path}\`);
      for (const { path: filePath, source } of visited) {
        for (const api of FORBIDDEN_WRITE_APIS) {
          assert.doesNotMatch(source, new RegExp(\`\\\\b\${api}\\\\b\`, "u"), \`\${filePath} calls forbidden write API \${api}\`);
        }
        if (importsFsPromises(source)) {
          for (const api of FORBIDDEN_PROMISE_WRITE_APIS) {
            assert.doesNotMatch(source, new RegExp(\`\\\\b\${api}\\\\s*\\\\(\`, "u"), \`\${filePath} calls forbidden fs/promises write API \${api}() (imports node:fs/promises)\`);
          }
        }
      }
    }
  });

  check("GST34 the exact preflight command is admitted for every declared gate-strength path", () => {
    for (const rule of GATE_STRENGTH_PATHS) {
      const command = \`node plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md --guardrail \${rule.path} --evidence evidence/e.json\`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.doesNotMatch(stderr, /GUARD-GATE-STRENGTH-SHELL/u, \`\${rule.id} (\${rule.path}) still refused by the shell lane: \${stderr}\`);
    }
  });

  check("GST35 a lookalike script, a same-basename script elsewhere, and the same relative path under a DIFFERENT root are never exempt", () => {
    const guardrail = "--guardrail pipeline.user.yaml --evidence evidence/e.json";
    // (a) same basename, wrong directory under the real project root.
    {
      const command = \`node scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md \${guardrail}\`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "a same-basename script outside the exact declared relative path must stay refused");
    }
    // (b) outside the plugin root entirely.
    {
      const command = \`node /tmp/evil/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md \${guardrail}\`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "a lookalike path outside the plugin root must stay refused");
    }
    // (c) the identical relative path, but resolved against a DIFFERENT root than this
    // module's own PLUGIN_ROOT. The exemption trusts only the copy actually enforcing
    // (this module's own resolved location), never a vendored copy some other governed
    // project happens to keep at the same relative path.
    {
      const otherRoot = governed();
      mkdirSync(join(otherRoot, "plugins", "pipeline-core", "scripts"), { recursive: true });
      writeFileSync(
        join(otherRoot, "plugins", "pipeline-core", "scripts", "critic-dispatch-preflight.mjs"),
        readFileSync(join(PLUGIN_ROOT, "scripts", "critic-dispatch-preflight.mjs"), "utf8"),
      );
      const command = \`node plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md \${guardrail}\`;
      const { stderr } = shell(otherRoot, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "the identical relative path under a different (non-enforcing) root must stay refused");
    }
  });

  check("GST36 naming the exempt script inside a write command does not exempt the write", () => {
    const root = governed();
    const command = "node -e 'require(\\"fs\\").writeFileSync(\\"pipeline.user.yaml\\", \\"gates:\\\\n  push_approval: chat\\\\n\\"); require(\\"./plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs\\")'";
    const { blocked, stderr } = shell(root, command);
    assert.equal(blocked, true, "a write smuggled alongside a mention of the exempt script must still be refused");
    assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u);
  });

${GS_CHECKS_ANCHOR}`;

const GATE_STRENGTH_EXPECTED = /guard-gate-strength: 36 passed, 0 failed/u;

// A sibling of the real suite, so `PLUGIN_ROOT = join(HOOKS, "..")` resolves
// identically -- GST34/GST35 depend on that, and a copy anywhere else would
// silently test a different root. Never a protected path: TP-6 matches
// `guard-gate-strength\.test\.mjs$` and this name does not.
const GATE_STRENGTH_PREVIEW_PATH = join(dirname(GATE_STRENGTH_PATH), "guard-gate-strength.preview-check.mjs");

function stepGateStrength({ dryRun, preview }) {
  const original = readFileSync(GATE_STRENGTH_PATH, "utf8");
  if (original.includes("GST33 every GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS entry")) {
    return { status: "already-applied", detail: "GST33-GST36 are already present" };
  }

  let next = anchoredReplace(original, GS_IMPORT_ANCHOR, GS_IMPORT_REPLACEMENT, "node:path import");
  next = anchoredReplace(next, GS_GUARD_IMPORT_ANCHOR, GS_GUARD_IMPORT_REPLACEMENT, "guard-gate-strength.mjs import");
  next = anchoredReplace(next, GS14_ANCHOR, GS14_REPLACEMENT, "GST14 title");
  next = anchoredReplace(next, GS_CHECKS_ANCHOR, GS_CHECKS_BLOCK, "final console.log summary line");

  // `--preview` proves the transformed suite passes WITHOUT touching the
  // protected file: the result is run from a sibling that is removed again in
  // every exit path. This is what an agent session can legitimately do, and it
  // is why the operator is not the first to find out whether the paste works.
  if (preview) {
    try {
      writeFileSync(GATE_STRENGTH_PREVIEW_PATH, next, "utf8");
      const suite = run([GATE_STRENGTH_PREVIEW_PATH]);
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|guard-gate-strength:)/u.test(line)).join("\n");
      if (suite.code !== 0 || !GATE_STRENGTH_EXPECTED.test(suite.output)) {
        throw new Error(`preview run did not reach "36 passed, 0 failed" (exit ${suite.code}):\n${summary || suite.output.slice(-2000)}`);
      }
      return { status: "preview-green", detail: `${summary} -- run from a removed sibling; ${rel(GATE_STRENGTH_PATH)} was not touched` };
    } finally {
      rmSync(GATE_STRENGTH_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: "4 anchored edits: node:path import, guard import, GST14 rename, GST33-GST36 block" };
  }

  const detail = writeThenVerifyOrRevert(GATE_STRENGTH_PATH, original, next, () => {
    const suite = run([GATE_STRENGTH_PATH]);
    if (suite.code !== 0 || !GATE_STRENGTH_EXPECTED.test(suite.output)) {
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|guard-gate-strength:)/u.test(line)).join("\n");
      return { ok: false, detail: `expected "36 passed, 0 failed", got exit ${suite.code}:\n${summary || suite.output.slice(-2000)}` };
    }
    return { ok: true, detail: "guard-gate-strength: 36 passed, 0 failed" };
  });

  return { status: "applied", detail };
}

/* ------------------------------------------- C. entrypoint.test.mjs (TP-8) */

// WHY. Measured 2026-08-27 with a temporary probe inside
// `appendOverrideDeniedLedgerEvent` (hooks/guard-gate-strength.mjs, the ONLY
// writer of governance/events/human/**): EP07's gate-strength case spawned the
// guard twice -- direct and through the symlinked plugin root -- with
// `CLAUDE_PROJECT_DIR: REPO_ROOT` and a real gate-strength target. The guard
// therefore took THIS repository as the governed root of two REAL denials and
// appended four governance events plus an advanced heads.json on every run.
//
// That is the whole of NVA-VERIFYPOLLUTE-1: Verify dirtied its own working tree
// mid-flight, `security-scan.mjs`'s observeCandidate() typed the result as
// `working-tree-not-clean` (all four adapters ERROR, exit 2), and
// candidate-binding saw the same change as drift. Both were artifacts, not
// product failures -- the identical scan run standalone was CLEAN, exit 0.
//
// EP07 asserts only that the guard is REACHABLE (observable output) and that the
// direct and symlinked invocations agree on the exit code. Neither half needs the
// denial to be recorded against the real repository; it only needs a root the
// guard will claim as governed. This uses the same minimal governed shape
// guard-gate-strength.test.mjs's own `governed()` fixture already uses.

const EP_IMPORT_ANCHOR = 'import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";';
const EP_IMPORT_REPLACEMENT = 'import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";';

const EP_RUN_ANCHOR = 'function run(scriptPath, argv, { input = "", cwd = REPO_ROOT, env = {} } = {}) {';
const EP_FIXTURE_REPLACEMENT = `/**
 * A governed root the gate-strength guard will claim, with no relationship to this
 * repository. EP07 used to point CLAUDE_PROJECT_DIR at REPO_ROOT, which made every
 * run of this suite record two REAL guard denials against the checkout and append
 * four governance events to it (NVA-VERIFYPOLLUTE-1). The assertions need a claimed
 * root, not this one.
 */
function governedFixture() {
  const base = mkdtempSync(join(tmpdir(), "entrypoint-governed-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\\ngates:\\n  push_approval: "signature"\\n');
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\\n");
  writeFileSync(join(base, "project", "guard-config.json"), '{"protectedTestPaths":[]}\\n');
  writeFileSync(join(base, "project", "critical-human-proof.json"), '{"schema":"pipeline.critical-human-proof-policy.v1","requiredKinds":["push"]}\\n');
  writeFileSync(join(base, "README.md"), "# fixture\\n");
  return base;
}

${EP_RUN_ANCHOR}`;

const EP_ENV_ANCHOR = "        env: { CLAUDE_PROJECT_DIR: REPO_ROOT },";
const EP_ENV_REPLACEMENT = "        env: { CLAUDE_PROJECT_DIR: governedFixture() },";

const ENTRYPOINT_EXPECTED = /entrypoint: 10 passed, 0 failed/u;

// TP-8 matches `entrypoint\.test\.mjs$`, so this sibling name is not protected.
// A sibling of the real suite keeps `LIB`/`PLUGIN_ROOT`/`REPO_ROOT` resolving
// identically -- EP07/EP08/EP09 all depend on that.
const ENTRYPOINT_PREVIEW_PATH = join(dirname(ENTRYPOINT_PATH), "entrypoint.preview-check.mjs");

function stepEntrypoint({ dryRun, preview }) {
  const original = readFileSync(ENTRYPOINT_PATH, "utf8");
  if (original.includes("function governedFixture()")) {
    return { status: "already-applied", detail: "EP07 already uses a governed fixture root" };
  }

  let next = anchoredReplace(original, EP_IMPORT_ANCHOR, EP_IMPORT_REPLACEMENT, "node:fs import");
  next = anchoredReplace(next, EP_RUN_ANCHOR, EP_FIXTURE_REPLACEMENT, "run() helper");
  next = anchoredReplace(next, EP_ENV_ANCHOR, EP_ENV_REPLACEMENT, "EP07 gate-strength CLAUDE_PROJECT_DIR");

  // The point of this step is that the suite stops writing to the repository, so
  // both lanes below assert BOTH halves: the suite still passes, and running it
  // left the working tree byte-identical.
  if (preview) {
    // Both snapshots are taken with the preview sibling ABSENT, so the only thing
    // a difference can mean is that the suite itself wrote something.
    const before = gitStatus();
    let summary;
    try {
      writeFileSync(ENTRYPOINT_PREVIEW_PATH, next, "utf8");
      const suite = run([ENTRYPOINT_PREVIEW_PATH]);
      summary = suite.output.split("\n").filter((line) => /^(FAIL|entrypoint:)/u.test(line)).join("\n");
      if (suite.code !== 0 || !ENTRYPOINT_EXPECTED.test(suite.output)) {
        throw new Error(`preview run did not reach "10 passed, 0 failed" (exit ${suite.code}):\n${summary || suite.output.slice(-2000)}`);
      }
    } finally {
      rmSync(ENTRYPOINT_PREVIEW_PATH, { force: true });
    }
    const after = gitStatus();
    if (after !== before) {
      throw new Error(`the transformed suite still dirtied the working tree -- that is the defect this step exists to fix:\n${after}`);
    }
    return { status: "preview-green", detail: `${summary}; working tree unchanged by the run -- ${rel(ENTRYPOINT_PATH)} was not touched` };
  }

  if (dryRun) {
    return { status: "would-apply", detail: "3 anchored edits: node:fs import, governedFixture() helper, EP07 CLAUDE_PROJECT_DIR" };
  }

  const detail = writeThenVerifyOrRevert(ENTRYPOINT_PATH, original, next, () => {
    const before = gitStatus();
    const suite = run([ENTRYPOINT_PATH]);
    if (suite.code !== 0 || !ENTRYPOINT_EXPECTED.test(suite.output)) {
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|entrypoint:)/u.test(line)).join("\n");
      return { ok: false, detail: `expected "10 passed, 0 failed", got exit ${suite.code}:\n${summary || suite.output.slice(-2000)}` };
    }
    // `before` already contains this step's own edit to the protected file, so a
    // difference here is the suite writing, not the step writing.
    const after = gitStatus();
    if (after !== before) return { ok: false, detail: `the suite still dirtied the working tree:\n${after}` };
    return { ok: true, detail: "entrypoint: 10 passed, 0 failed; working tree unchanged by the run" };
  });

  return { status: "applied", detail };
}

/* ---------------------------------- F. guard-git.test.mjs (TP-1) GG22-7/GG22-8 fixtures */

// WHY. backlog/items/2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md
// -- the source fix (corrected remediation text, commit 01c02971) already landed. The two
// fixture tests it also requires (GG22-7: the corrected item-edits-first/reconcile-once/
// ledger-last order drains debt cleanly; GG22-8: the printed remediation text names that
// corrected order, not the inverted one that trapped an agent following it literally) could
// not be committed by that dispatch or by a follow-up Elephant attempt -- guard-git.test.mjs
// is TP-1 protected with no override route (`author-repair-required`, structural, not
// role-dependent). This step is the sanctioned operator route, mirroring stepGuardGitCwd.

const GG22_ANCHOR = `// GG22-6: fail-open -- a spawnSync git failure (PATH broken for the guard's own child process)
// must never block, even against the exact same debt state that GG22-3 proves DOES block.
check(
  "GG22-6 allow  fail-open: a spawnSync git failure never blocks (same debt state as GG22-3)",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_DEBT_DIR, env: { PATH: "/nonexistent-guard-test-bin" } },
);

// ---- Summary -------------------------------------------------------------------------------------`;

const GG22_REPLACEMENT = `// GG22-6: fail-open -- a spawnSync git failure (PATH broken for the guard's own child process)
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
commitFile(GG22_FIXED_ORDER_DIR, "seed.txt", "seed\\n");
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
gg22StageFile(GG22_FIXED_ORDER_DIR, "src/app.mjs", "export const x = 1;\\n");
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

// ---- Summary -------------------------------------------------------------------------------------`;

const GUARD_GIT_22_EXPECTED = /232\/232 cases passed\./u;

// A sibling of the real suite, same reasoning as GUARD_GIT_PREVIEW_PATH above. Never a protected
// path: TP-1 matches `guard-git\.test\.mjs$` and this name does not.
const GUARD_GIT_22_PREVIEW_PATH = join(dirname(GUARD_GIT_TEST_PATH), "guard-git.gg22.preview-check.mjs");

function stepGuardGit22({ dryRun, preview }) {
  const original = readFileSync(GUARD_GIT_TEST_PATH, "utf8");
  if (original.includes("GG22-7 allow")) {
    return { status: "already-applied", detail: "GG22-7/GG22-8 fixture tests are already present" };
  }

  const next = anchoredReplace(original, GG22_ANCHOR, GG22_REPLACEMENT, "GG22-6 block through Summary marker");

  if (preview) {
    try {
      writeFileSync(GUARD_GIT_22_PREVIEW_PATH, next, "utf8");
      const suite = run([GUARD_GIT_22_PREVIEW_PATH]);
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      if (suite.code !== 0 || !GUARD_GIT_22_EXPECTED.test(suite.output)) {
        throw new Error(`preview run did not reach "232/232 cases passed." (exit ${suite.code}):\n${summary || suite.output.slice(-2000)}`);
      }
      return { status: "preview-green", detail: `${summary} -- run from a removed sibling; ${rel(GUARD_GIT_TEST_PATH)} was not touched` };
    } finally {
      rmSync(GUARD_GIT_22_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: "1 anchored edit: insert GG22-7/GG22-8 fixture tests before the Summary marker" };
  }

  const detail = writeThenVerifyOrRevert(GUARD_GIT_TEST_PATH, original, next, () => {
    const suite = run([GUARD_GIT_TEST_PATH]);
    if (suite.code !== 0 || !GUARD_GIT_22_EXPECTED.test(suite.output)) {
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      return { ok: false, detail: `expected "232/232 cases passed.", got exit ${suite.code}:\n${summary || suite.output.slice(-2000)}` };
    }
    return { ok: true, detail: "guard-git: 232/232 cases passed." };
  });

  return { status: "applied", detail };
}

/* ------------------------------- F2. guard-git.test.mjs (TP-1) GG22 pathspec coverage */

// This is deliberately a separate attended-operator step. The earlier guard-git-22 step
// covers the remediation-order regression; this one covers the later commit-pathspec scoping
// fixes without changing that already-reviewed insertion or its expected count.
const GG22_PATHSPEC_ANCHOR = `// ---- Summary -------------------------------------------------------------------------------------`;
const GG22_PATHSPEC_REPLACEMENT = `// GG22-9 through GG22-15: a pathspec'd commit is scoped to the paths it names only when
// the invocation is provably pathspec-exclusive. Each fixture builds real history with status-flip
// debt and a deliberately unrelated staged source file: a pass must come from the fixed commit
// pathspec handling, never from an empty index or absent debt.
function gg22PathspecDebtFixture(prefix) {
  const root = gitRepoFixture(prefix);
  commitFile(root, "seed.txt", "seed\\n");
  gg22CommitItem(root, "demo.md", "open", "chore: add demo item (open)");
  gg22CommitLedgerTouch(root);
  gg22CommitItem(root, "demo.md", "in_progress", "chore: flip demo item to in_progress");
  gg22StageFile(root, "backlog/transitions.ndjson", "{\\"seq\\":2}\\n");
  gg22StageFile(root, "src/unrelated.mjs", "export const unrelated = true;\\n");
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

// ---- Summary -------------------------------------------------------------------------------------`;

const GUARD_GIT_22_PATHSPEC_BASE_CASES = 232;
const GUARD_GIT_22_PATHSPEC_ADDED_CASES = 7;
const GUARD_GIT_22_PATHSPEC_EXPECTED = new RegExp(`^${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES}/${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES} cases passed\\.$`, "mu");
const GUARD_GIT_22_PATHSPEC_PREVIEW_PATH = join(dirname(GUARD_GIT_TEST_PATH), "guard-git.gg22-pathspec.preview-check.mjs");
const GUARD_GIT_22_PATHSPEC_MARKERS = Object.freeze([
  "GG22-9 allow  pathspec ledger commit ignores unrelated staged source file",
  "GG22-10 block  pathspec source commit remains blocked while GG22 debt exists",
  "GG22-11 block  bare staged-index commit remains blocked with unrelated source staged",
  "GG22-12 block  -i widens a pathspec commit to the staged index",
  "GG22-13 block  --include widens a pathspec commit to the staged index",
  "GG22-14 block  ../ traversal escaping backlog/items is disallowed",
  "GG22-15 allow  trailing-slash backlog/items directory pathspec is admitted",
]);

function markerOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function stepGuardGit22Pathspec({ dryRun, preview }) {
  const original = readFileSync(GUARD_GIT_TEST_PATH, "utf8");
  const markerCounts = GUARD_GIT_22_PATHSPEC_MARKERS.map((marker) => markerOccurrences(original, marker));
  const present = markerCounts.filter((count) => count > 0).length;
  const replacementOccurrences = markerOccurrences(original, GG22_PATHSPEC_REPLACEMENT);
  if (replacementOccurrences === 1 && markerCounts.every((count) => count === 1)) {
    return { status: "already-applied", detail: "GG22-9 through GG22-15 pathspec fixture tests are already present" };
  }
  if (present > 0 || replacementOccurrences > 0) {
    throw new Error(`GG22 pathspec tests are partially applied, changed, or duplicated (replacement occurrences: ${replacementOccurrences}; marker counts: ${markerCounts.join(", ")}). Nothing was written.`);
  }

  const next = anchoredReplace(original, GG22_PATHSPEC_ANCHOR, GG22_PATHSPEC_REPLACEMENT, "GG22 pathspec tests before Summary marker");

  if (preview) {
    let createdPreviewSibling = false;
    try {
      writeFileSync(GUARD_GIT_22_PATHSPEC_PREVIEW_PATH, next, { encoding: "utf8", flag: "wx" });
      createdPreviewSibling = true;
      const suite = run([GUARD_GIT_22_PATHSPEC_PREVIEW_PATH]);
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      if (suite.code !== 0 || !GUARD_GIT_22_PATHSPEC_EXPECTED.test(suite.output)) {
        throw new Error(`preview run did not reach ${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES}/${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES} cases passed. (exit ${suite.code}):\\n${summary || suite.output.slice(-2000)}`);
      }

      return { status: "preview-green", detail: `${summary}; ${GUARD_GIT_22_PATHSPEC_ADDED_CASES} new cases (${GUARD_GIT_22_PATHSPEC_BASE_CASES} -> ${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES}); this invocation's preview sibling was removed and ${rel(GUARD_GIT_TEST_PATH)} was not touched` };
    } finally {
      if (createdPreviewSibling) rmSync(GUARD_GIT_22_PATHSPEC_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: `1 anchored edit: insert ${GUARD_GIT_22_PATHSPEC_ADDED_CASES} GG22 pathspec fixture tests before the Summary marker (${GUARD_GIT_22_PATHSPEC_BASE_CASES} -> ${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES} cases)` };
  }

  const detail = writeThenVerifyOrRevert(GUARD_GIT_TEST_PATH, original, next, () => {
    const suite = run([GUARD_GIT_TEST_PATH]);
    if (suite.code !== 0 || !GUARD_GIT_22_PATHSPEC_EXPECTED.test(suite.output)) {
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      return { ok: false, detail: `expected ${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES}/${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES} cases passed., got exit ${suite.code}:\\n${summary || suite.output.slice(-2000)}` };
    }
    return { ok: true, detail: `guard-git: ${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES}/${GUARD_GIT_22_PATHSPEC_BASE_CASES + GUARD_GIT_22_PATHSPEC_ADDED_CASES} cases passed.` };
  });

  return { status: "applied", detail };
}

/* ---------------------------------------- D. guard-git.test.mjs (TP-1) fixture cwd */

// WHY. guard-git.mjs's GIT-03 message-file check now resolves a `-F <path>` against
// the invoking process cwd instead of CLAUDE_PROJECT_DIR (see this file's own edit to
// plugins/pipeline-core/hooks/guard-git.mjs, 2026-08-28) -- a worktree-isolated
// subagent has CLAUDE_PROJECT_DIR pointed at the MAIN checkout while its process cwd
// IS the worktree, so a relative `-F` path written inside the worktree used to be
// looked for in the main checkout and refused as GIT-03-UNREADABLE-MESSAGE-FILE even
// though the file existed. `runGuard()` (the suite's own spawn helper) sets
// CLAUDE_PROJECT_DIR to a temp fixture directory but never sets the spawned guard's
// cwd, so GIT03-1/GIT03-2/GIT03-5 (all of which pass a RELATIVE `-F` path) went from
// passing to failing the moment the fix above landed -- they were passing only
// because the guard used to ignore cwd entirely, which is fixture blindness, not a
// fix regression. GIT03-7 (an ABSOLUTE `-F` path outside the project root) is
// unaffected either way and keeps passing. Setting `cwd: projectDir` mirrors the real
// harness contract, where a hook runs with cwd set to the session's execution
// directory (the same directory Claude Code/Codex/Antigravity set CLAUDE_PROJECT_DIR
// to for an in-repo session).

const GG_CWD_ANCHOR = `  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: projectDir, ...envOverride },
  });`;
const GG_CWD_REPLACEMENT = `  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    cwd: projectDir,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: projectDir, ...envOverride },
  });`;

const GUARD_GIT_EXPECTED = /230\/230 cases passed\./u;

// A sibling of the real suite so `GUARD = fileURLToPath(new URL("./guard-git.mjs", ...))`
// resolves identically to the real, already-fixed guard. Never a protected path: TP-1
// matches `guard-git\.test\.mjs$` and this name does not.
const GUARD_GIT_PREVIEW_PATH = join(dirname(GUARD_GIT_TEST_PATH), "guard-git.preview-check.mjs");

function stepGuardGitCwd({ dryRun, preview }) {
  const original = readFileSync(GUARD_GIT_TEST_PATH, "utf8");
  if (original.includes("cwd: projectDir,")) {
    return { status: "already-applied", detail: "runGuard() already sets the spawned guard's cwd to projectDir" };
  }

  const next = anchoredReplace(original, GG_CWD_ANCHOR, GG_CWD_REPLACEMENT, "runGuard() spawnSync options");

  if (preview) {
    try {
      writeFileSync(GUARD_GIT_PREVIEW_PATH, next, "utf8");
      const suite = run([GUARD_GIT_PREVIEW_PATH]);
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      if (suite.code !== 0 || !GUARD_GIT_EXPECTED.test(suite.output)) {
        throw new Error(`preview run did not reach "230/230 cases passed." (exit ${suite.code}):\n${summary || suite.output.slice(-2000)}`);
      }
      return { status: "preview-green", detail: `${summary} -- run from a removed sibling; ${rel(GUARD_GIT_TEST_PATH)} was not touched` };
    } finally {
      rmSync(GUARD_GIT_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: "1 anchored edit: runGuard() spawnSync cwd" };
  }

  const detail = writeThenVerifyOrRevert(GUARD_GIT_TEST_PATH, original, next, () => {
    const suite = run([GUARD_GIT_TEST_PATH]);
    if (suite.code !== 0 || !GUARD_GIT_EXPECTED.test(suite.output)) {
      const summary = suite.output.split("\n").filter((line) => /^(FAIL|\d+\/\d+ cases passed\.)/u.test(line)).join("\n");
      return { ok: false, detail: `expected "230/230 cases passed.", got exit ${suite.code}:\n${summary || suite.output.slice(-2000)}` };
    }
    return { ok: true, detail: "guard-git: 230/230 cases passed." };
  });

  return { status: "applied", detail };
}

/* --------------------------------------- E. verify.mjs (TP-3, NVA-C-PROTECTED batch) */

// Four suites written this block, currently unregistered. Kept as its own step (not
// folded into VERIFY_REGISTRATIONS in step A above) because step A's own `--check`
// never runs a suite -- it only lists pending names -- so it cannot stand in for the
// sibling-copy green-preview proof this batch needs before an operator applies it
// sight-unseen, the same reason steps B/C/D above are previewable and step A is not.
const VERIFY_REGISTRATIONS_NVA_C_PROTECTED = [
  {
    name: "copy-safe-command-tests",
    line: '  { name: "copy-safe-command-tests", file: join(libDir, "copy-safe-command.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "copy-safe-command.test.mjs"),
  },
  {
    name: "project-onboarding-v3-pre-push-hook-offer-tests",
    line: '  { name: "project-onboarding-v3-pre-push-hook-offer-tests", file: join(pluginScriptsDir, "project-onboarding-v3-pre-push-hook-offer.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "project-onboarding-v3-pre-push-hook-offer.test.mjs"),
  },
  {
    name: "onboarding-init-tests",
    line: '  { name: "onboarding-init-tests", file: join(pluginScriptsDir, "onboarding-init.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "onboarding-init.test.mjs"),
  },
  {
    name: "push-gate-satisfiability-tests",
    line: '  { name: "push-gate-satisfiability-tests", file: join(pluginScriptsDir, "push-gate-satisfiability.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "push-gate-satisfiability.test.mjs"),
  },
  {
    name: "chat-gate-ceremony-tests",
    line: '  { name: "chat-gate-ceremony-tests", file: join(libDir, "chat-gate-ceremony.test.mjs") },',
    file: join(REPO_ROOT, "plugins", "pipeline-core", "lib", "chat-gate-ceremony.test.mjs"),
  },
];

// A sibling of the real verify.mjs, same reasoning as GATE_STRENGTH_PREVIEW_PATH /
// ENTRYPOINT_PREVIEW_PATH / GUARD_GIT_PREVIEW_PATH above. Never a protected path: TP-3
// matches `harness/scripts/verify\.mjs$` and this name does not.
const VERIFY_NVA_C_PREVIEW_PATH = join(dirname(VERIFY_PATH), "verify.preview-check.mjs");

function stepVerifyNvaCProtected({ dryRun, preview }) {
  const original = readFileSync(VERIFY_PATH, "utf8");

  const pending = VERIFY_REGISTRATIONS_NVA_C_PROTECTED.filter((entry) => !original.includes(`name: "${entry.name}"`));
  if (pending.length === 0) return { status: "already-applied", detail: `all ${VERIFY_REGISTRATIONS_NVA_C_PROTECTED.length} suites are already registered` };

  const missing = pending.filter((entry) => !existsSync(entry.file));
  if (missing.length > 0) {
    throw new Error(`these suite files do not exist, refusing to register them:\n${missing.map((entry) => `  - ${rel(entry.file)}`).join("\n")}`);
  }

  const at = verifyInsertionPoint(original);
  const next = `${original.slice(0, at)}\n${pending.map((entry) => entry.line).join("\n")}${original.slice(at)}`;

  if (preview) {
    try {
      writeFileSync(VERIFY_NVA_C_PREVIEW_PATH, next, "utf8");
      // Syntax-only, same reasoning as step A's own `--check` call: it never runs the
      // gate, which would need approvals this script has no business touching.
      const parsed = run(["--check", VERIFY_NVA_C_PREVIEW_PATH]);
      if (parsed.code !== 0) {
        throw new Error(`verify.mjs (preview copy) no longer parses:\n${parsed.output}`);
      }
      const failures = [];
      for (const entry of pending) {
        const suite = run([entry.file]);
        if (suite.code !== 0) failures.push(suiteFailureEntry(entry, suite));
      }
      if (failures.length > 0) {
        throw new Error(`newly registered suites did not pass:\n${failures.join("\n")}`);
      }
      return {
        status: "preview-green",
        detail: `${pending.length} suite(s) would register and each run green:\n${pending.map((entry) => `  + ${entry.name}`).join("\n")} -- run from a removed sibling; ${rel(VERIFY_PATH)} was not touched`,
      };
    } finally {
      rmSync(VERIFY_NVA_C_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: `${pending.length} registration(s):\n${pending.map((entry) => `  + ${entry.name}`).join("\n")}` };
  }

  const detail = writeThenVerifyOrRevert(VERIFY_PATH, original, next, () => {
    const parsed = run(["--check", VERIFY_PATH]);
    if (parsed.code !== 0) return { ok: false, detail: `verify.mjs no longer parses:\n${parsed.output}` };

    const failures = [];
    for (const entry of pending) {
      const suite = run([entry.file]);
      if (suite.code !== 0) failures.push(suiteFailureEntry(entry, suite));
    }
    if (failures.length > 0) return { ok: false, detail: `newly registered suites did not pass:\n${failures.join("\n")}` };

    return { ok: true, detail: `${pending.length} suite(s) registered and each run green:\n${pending.map((entry) => `  + ${entry.name}`).join("\n")}` };
  });

  return { status: "applied", detail };
}

/* ---------------------------------------- G. verify.mjs (TP-3) manual-check-logic extraction */

// WHY. backlog/items/2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet.md
// -- computeManualVerifyStep() already landed inline in verify.mjs (commit 3cfc7160), but
// verify.mjs is TP-3 protected AND has no isDirectInvocation guard (importing it for its exports
// triggers the entire ~500-suite run as a side effect), so the inline function could never be
// unit-tested directly. harness/scripts/manual-check-logic.mjs (new, unprotected, created
// alongside this step -- NVA-CF-ITEM25EXTRACT) now holds the exact same pure logic (no file I/O,
// no console output) with its own test file (harness/scripts/manual-check-logic.test.mjs, 7/7).
// This step removes the inline copy from verify.mjs and replaces it with an import plus a call
// site that reads+parses the calibration file itself (the exact resolveAuthorityArtifactPath/
// readFileSync pattern verify.mjs already uses elsewhere) and preserves the original
// console.error side effect byte-for-byte for the placeholder-rejected case.

const MANUAL_CHECK_LOGIC_PATH = join(REPO_ROOT, "harness", "scripts", "manual-check-logic.mjs");
const MANUAL_CHECK_LOGIC_TEST_PATH = join(REPO_ROOT, "harness", "scripts", "manual-check-logic.test.mjs");

// Anchored by short, unambiguous start/end markers rather than the ~35-line block verbatim (the
// same technique as TEST_SUITES_MARKER/TEST_SUITES_TERMINATOR above) -- safer than hand-
// transcribing a multi-line block that itself contains nested template-literal/backtick/${}
// escaping as one giant literal.
const MC_START_ANCHOR = "// pipeline.verify-manual-check-placeholder-detection / pipeline.reject-unreplaced-manual-check-placeholder";
const MC_END_ANCHOR = "const manualVerifyResult = computeManualVerifyStep();";

const MC_IMPORT_ANCHOR = 'import { duplicateSuiteIds } from "./check-verify-suite-registration.mjs";';
const MC_IMPORT_REPLACEMENT = `${MC_IMPORT_ANCHOR}
import { UNREPLACED_MANUAL_CHECK_PLACEHOLDER, computeManualVerifyStep } from "./manual-check-logic.mjs";`;

const MC_CALL_SITE = `// pipeline.verify-manual-check-placeholder-detection / pipeline.reject-unreplaced-manual-check-placeholder
// (NVA-R26-VERIFYPREP, backlog 2026-08-29-mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet.md
// and 2026-08-29-verify-placeholder-manual-check-required-accepted-by-gate.md; pure logic
// extracted to ./manual-check-logic.mjs by NVA-CF-ITEM25EXTRACT so it is independently unit-
// testable -- this file has no isDirectInvocation guard, so importing verify.mjs itself for its
// exports would trigger the entire suite run as a side effect): a project's calibration
// (\`project/pipeline.json\`, or legacy \`.claude/pipeline.json\` -- ADR-0054) may declare an
// optional \`verifyManualStatus\` string field distinguishing three cases that would otherwise
// collapse into one indistinguishable "nothing to report" result: genuinely nothing configured
// yet (honestly declared, never a silent pass and never an indefinite block), a real filled-in
// manual-check note, or an unfilled scaffold placeholder that was never replaced (rejected as a
// FAILURE, never accepted as a pass). Absent field: no step is added and behavior is unchanged --
// this repo's own calibration carries no such field.
let manualVerifyCalibration = null;
try {
  const manualVerifyCalibrationPath = resolveAuthorityArtifactPath("calibration", { rootDir: repoRoot }).path;
  manualVerifyCalibration = JSON.parse(readFileSync(manualVerifyCalibrationPath, "utf8"));
} catch {
  // absent/unreadable calibration: no manual-verify field to read, no step added.
}
const manualVerifyResult = computeManualVerifyStep(manualVerifyCalibration);
if (manualVerifyResult.step && manualVerifyResult.step.name === "verify-manual-check-placeholder-rejected") {
  console.error(\`VERIFY-MANUAL-CHECK-PLACEHOLDER: verifyManualStatus is the unreplaced scaffold placeholder \${JSON.stringify(UNREPLACED_MANUAL_CHECK_PLACEHOLDER)} -- replace it with a real result before Verify can pass.\`);
}`;

/**
 * Structural check of the transformed source: confirms the wiring (import present, call site
 * passes a non-empty calibration argument rather than the old zero-arg signature, the old inline
 * definition is gone, the console.error message is byte-identical to the pre-refactor original)
 * without executing or importing verify.mjs itself (which has no isDirectInvocation guard).
 */
function verifyManualCheckWiring(source) {
  if (!source.includes('import { UNREPLACED_MANUAL_CHECK_PLACEHOLDER, computeManualVerifyStep } from "./manual-check-logic.mjs";')) {
    return { ok: false, detail: "manual-check-logic.mjs import not found in the transformed source" };
  }
  if (!source.includes("computeManualVerifyStep(manualVerifyCalibration)")) {
    return { ok: false, detail: "call site does not pass the parsed calibration object to computeManualVerifyStep()" };
  }
  if (source.includes("function computeManualVerifyStep()")) {
    return { ok: false, detail: "the old inline computeManualVerifyStep() definition is still present -- extraction did not remove it" };
  }
  if (!source.includes("VERIFY-MANUAL-CHECK-PLACEHOLDER: verifyManualStatus is the unreplaced scaffold placeholder ${JSON.stringify(UNREPLACED_MANUAL_CHECK_PLACEHOLDER)} -- replace it with a real result before Verify can pass.")) {
    return { ok: false, detail: "the console.error message text is not byte-identical to the pre-refactor original" };
  }
  return { ok: true, detail: "import present, call site passes calibration, old inline definition removed, console.error message byte-identical" };
}

const MC_TEST_EXPECTED = /ℹ pass 7\b/u;
const MC_TEST_NO_FAILURES = /ℹ fail 0\b/u;

/** Byte offset span computation, thrown refusal on missing/ambiguous anchors. */
function computeManualCheckExtractionNext(original) {
  const startIdx = original.indexOf(MC_START_ANCHOR);
  if (startIdx === -1) throw new Error("anchor not found (manual-check-logic start marker): the file does not contain the expected text. Nothing was written.");
  if (original.indexOf(MC_START_ANCHOR, startIdx + MC_START_ANCHOR.length) !== -1) {
    throw new Error("anchor is ambiguous (manual-check-logic start marker): occurs more than once. Nothing was written.");
  }
  const endMarkerIdx = original.indexOf(MC_END_ANCHOR, startIdx);
  if (endMarkerIdx === -1) throw new Error("anchor not found (manual-check-logic end marker): the file does not contain the expected text after the start marker. Nothing was written.");
  if (original.indexOf(MC_END_ANCHOR, endMarkerIdx + MC_END_ANCHOR.length) !== -1) {
    throw new Error("anchor is ambiguous (manual-check-logic end marker): occurs more than once. Nothing was written.");
  }
  const blockEnd = endMarkerIdx + MC_END_ANCHOR.length;
  const withCallSite = original.slice(0, startIdx) + MC_CALL_SITE + original.slice(blockEnd);
  return anchoredReplace(withCallSite, MC_IMPORT_ANCHOR, MC_IMPORT_REPLACEMENT, "check-verify-suite-registration.mjs import");
}

// A sibling of the real verify.mjs, same reasoning as the other preview siblings above. Never a
// protected path: TP-3 matches `harness/scripts/verify\.mjs$` and this name does not.
const MANUAL_CHECK_EXTRACT_PREVIEW_PATH = join(dirname(VERIFY_PATH), "verify.manual-check-extract.preview-check.mjs");

function stepVerifyManualCheckExtract({ dryRun, preview }) {
  const original = readFileSync(VERIFY_PATH, "utf8");
  if (original.includes('from "./manual-check-logic.mjs"')) {
    return { status: "already-applied", detail: "verify.mjs already imports computeManualVerifyStep from manual-check-logic.mjs" };
  }
  if (!existsSync(MANUAL_CHECK_LOGIC_PATH) || !existsSync(MANUAL_CHECK_LOGIC_TEST_PATH)) {
    throw new Error(`${rel(MANUAL_CHECK_LOGIC_PATH)} and ${rel(MANUAL_CHECK_LOGIC_TEST_PATH)} must exist before this step runs (this step never creates them). Nothing was written.`);
  }

  const next = computeManualCheckExtractionNext(original);

  function checkWiringAndTests(source) {
    const wiring = verifyManualCheckWiring(source);
    if (!wiring.ok) return wiring;
    const testSuite = run([MANUAL_CHECK_LOGIC_TEST_PATH]);
    if (testSuite.code !== 0 || !MC_TEST_EXPECTED.test(testSuite.output) || !MC_TEST_NO_FAILURES.test(testSuite.output)) {
      return { ok: false, detail: `manual-check-logic.test.mjs did not report 7 passed, 0 failed (exit ${testSuite.code}):\n${testSuite.output.slice(-2000)}` };
    }
    return { ok: true, detail: `${wiring.detail}; manual-check-logic.test.mjs: 7 passed, 0 failed` };
  }

  if (preview) {
    try {
      writeFileSync(MANUAL_CHECK_EXTRACT_PREVIEW_PATH, next, "utf8");
      // Syntax-only, same reasoning as steps A/E's own `--check` calls: it never runs the gate,
      // which would need approvals this script has no business touching.
      const parsed = run(["--check", MANUAL_CHECK_EXTRACT_PREVIEW_PATH]);
      if (parsed.code !== 0) {
        throw new Error(`verify.mjs (preview copy) no longer parses:\n${parsed.output}`);
      }
      const verdict = checkWiringAndTests(next);
      if (!verdict.ok) throw new Error(verdict.detail);
      return { status: "preview-green", detail: `${verdict.detail} -- run from a removed sibling; ${rel(VERIFY_PATH)} was not touched` };
    } finally {
      rmSync(MANUAL_CHECK_EXTRACT_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: "2 anchored edits: check-verify-suite-registration.mjs sibling import, inline block replaced by calibration-read + import call site (console.error preserved byte-identical)" };
  }

  const detail = writeThenVerifyOrRevert(VERIFY_PATH, original, next, () => {
    const parsed = run(["--check", VERIFY_PATH]);
    if (parsed.code !== 0) return { ok: false, detail: `verify.mjs no longer parses:\n${parsed.output}` };
    return checkWiringAndTests(readFileSync(VERIFY_PATH, "utf8"));
  });

  return { status: "applied", detail };
}

/* ---------------------------- H. pipeline-state.test.mjs (TP-5) runner fixture */

// WHY. The real PO authority writer deliberately refuses to guess "codex" when
// neither --runner nor a runner-owned environment marker exists. This test's
// seedPoAuthorityRebind() fixture invokes that writer in process, but omitted
// deps.env and therefore inherited process.env. It passed under a Codex/Claude
// session and failed in a naked CI/operator shell. The fixture is explicitly a
// Codex fixture; bind that fact locally instead of weakening production or
// teaching the whole suite to impersonate a runner.
const PIPELINE_STATE_RUNNER_FIXTURE_ANCHOR = `  const deps = {
    dir, now: () => "2026-07-28T10:00:00.000Z", ownerNonce: () => \`rebind-\${String(++nonceSequence).padStart(8, "0")}\`,`;
const PIPELINE_STATE_RUNNER_FIXTURE_REPLACEMENT = `  const deps = {
    dir,
    // This PO rebind/decision fixture is runner-bound independently of the
    // naked CI/operator shell (or different runner) that launches the suite.
    env: { CODEX_THREAD_ID: "pipeline-state-po-authority-fixture" },
    now: () => "2026-07-28T10:00:00.000Z", ownerNonce: () => \`rebind-\${String(++nonceSequence).padStart(8, "0")}\`,`;
const PIPELINE_STATE_DOCUMENT_LANGUAGE_FIXTURE_ANCHOR = '  const deps = { dir, now: () => "2026-08-09T10:00:00.000Z", poGateProfile: () => ({ ok: true, value: profile }) };';
const PIPELINE_STATE_DOCUMENT_LANGUAGE_FIXTURE_REPLACEMENT = `  const deps = {
    dir,
    env: { CODEX_THREAD_ID: "pipeline-state-po-authority-document-language-fixture" },
    now: () => "2026-08-09T10:00:00.000Z",
    poGateProfile: () => ({ ok: true, value: profile }),
  };`;
// The production planner now deliberately requires its selected runner.  Every
// acknowledge-plan fixture in this one test file is the Codex lane, including
// the negative argument-shape probes (which must reach their own asserted
// error rather than failing earlier for an omitted runner).  Match only a call
// that does NOT already carry the exact runner immediately after the command;
// a re-run therefore has zero matches and is idempotent.
// Test the next argument before consuming whitespace.  Putting `\s*` before
// the negative lookahead lets the engine backtrack to zero spaces, which made
// an already runner-bound call match and receive a second `--runner`.
const PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_RE = /"po-authority-acknowledge-plan",(?!(?:\s*"--runner"))\s*/gu;
const PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_REPLACEMENT = '"po-authority-acknowledge-plan", "--runner", "codex", ';
const PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_COUNT = 1;
const PIPELINE_STATE_ACKNOWLEDGED_APPLY_ARGS_ANCHOR = `function acknowledgedApplyArgs(plan, runner = "codex") {
  return [...plan.applyAction.argv.slice(1), "--runner", runner];
}`;
const PIPELINE_STATE_ACKNOWLEDGED_APPLY_ARGS_REPLACEMENT = `function acknowledgedApplyArgs(plan) {
  return plan.applyAction.argv.slice(1);
}`;
const PIPELINE_STATE_EXPLICIT_ROOT_APPLY_ARGS_ANCHOR = '  const applyArgs = [...plan.applyAction.argv.slice(1), "--runner", "codex"];';
const PIPELINE_STATE_EXPLICIT_ROOT_APPLY_ARGS_REPLACEMENT = '  const applyArgs = plan.applyAction.argv.slice(1);';
const PIPELINE_STATE_INVALID_RUNNER_MUTATOR_ANCHOR = '    [(argv) => [...argv, "--runner", "unknown"], "--runner requires claude, codex, or antigravity"],';
const PIPELINE_STATE_INVALID_RUNNER_MUTATOR_REPLACEMENT = '    [(argv) => argv.map((value) => value === "codex" ? "unknown" : value), "--runner requires claude, codex, or antigravity"],';
const PIPELINE_STATE_APPROVAL_STOP_START_ANCHOR = "// This is the test that matters most in this package: no `nextAction` the";
const PIPELINE_STATE_APPROVAL_STOP_END_ANCHOR = "// The command may PREPARE and PRESENT the artifacts (name them by path and";
const PIPELINE_STATE_APPROVAL_STOP_REPLACEMENT = `// Awaiting approval must never publish a direct runnable command: an agent
// cannot approve the PO's plan. It may publish the PO's one typed attribution
// field plus a nested command which remains explicitly human-confirmed.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  assert.equal(inspected.result, 0, inspected.lines.join(" "));
  const payload = JSON.parse(inspected.lines.join("\\n"));
  assert.equal(payload.status, "awaiting-approval");
  assert.equal(payload.nextAction.kind, "collect-input",
    "awaiting-approval must never publish a direct kind:\\"command\\" -- that would let a machine approve the PO's plan");
  assert.equal(payload.nextAction.executable, undefined,
    "the awaiting-approval gate must never carry a top-level executable");
  assert.equal(payload.nextAction.argv, undefined,
    "the awaiting-approval gate must never carry a top-level argv");
  assert.deepEqual(payload.nextAction.input, {
    name: "by", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128,
    singleLine: true, rejectNul: true,
  });
  assert.equal(payload.nextAction.inputs, undefined);
  assert.equal(payload.nextAction.applyAction?.kind, "command");
  assert.equal(payload.nextAction.applyAction?.mutation, true);
  assert.equal(payload.nextAction.applyAction?.requiresConfirmation, true,
    "the nested approve action remains explicitly human-confirmed");
  void root;
}

`;
const PIPELINE_STATE_APPROVE_ACTION_START_ANCHOR = "// NVA-V2B-APPROVERENDER:";
const PIPELINE_STATE_APPROVE_ACTION_END_ANCHOR = "// NVA-V2-APPROVEREACH (PO's mandatory addendum, 2026-08-28): spelling a";
const PIPELINE_STATE_APPROVE_ACTION_REPLACEMENT = `// NVA-V2B-APPROVERENDER: approval remains a typed collect-input with one exact nested argv.
// Execute that returned argv after substituting its one PO-supplied value; never recover a
// command from guidance prose.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  const action = JSON.parse(inspected.lines.join("\\n")).nextAction;
  const scriptPath = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));

  assert.equal(action.kind, "collect-input");
  assert.equal(action.input?.name, "by");
  assert.equal(action.applyAction?.kind, "command");
  assert.equal(action.applyAction?.executable, process.execPath);
  assert.deepEqual(action.applyAction?.argv, [
    scriptPath, "approve-plan", "--by", "<PO_PLAN_APPROVER_NAME>",
  ]);
  assert.equal(action.applyAction?.mutation, true);
  assert.equal(action.applyAction?.requiresConfirmation, true);

  const argv = action.applyAction.argv.map((part) => (
    part === "<PO_PLAN_APPROVER_NAME>" ? "Probe Person" : part
  ));
  const executed = spawnSync(action.applyAction.executable, [...argv, "--dir", root], { encoding: "utf8" });
  const stderr = executed.stderr ?? "";
  assert.ok(!/unknown subcommand|Usage:|requires --by/i.test(stderr),
    "the returned approve-plan argv must reach its own gate logic: " + stderr);
  assert.ok(executed.status === 0 || /approve-plan (requires|blocked by)/.test(stderr),
    "the returned approve-plan argv must reach its own gate logic; status=" + executed.status + ", stderr=" + stderr);
}

`;
const PIPELINE_STATE_APPROVE_REACH_START_ANCHOR = "// NVA-V2-APPROVEREACH (PO's mandatory addendum, 2026-08-28): spelling a";
const PIPELINE_STATE_APPROVE_REACH_END_ANCHOR = "// NVA-R31-STATEPHASEDRIFT";
const PIPELINE_STATE_APPROVE_REACH_REPLACEMENT = `// NVA-V2-APPROVEREACH: the exact nested approve action must also be admitted by the
// readiness guard after substituting its one typed input.
{
  const { root, deps } = awaitingApprovalFixture();
  const inspected = capturedStdout(() => run(["inspect"], deps));
  const action = JSON.parse(inspected.lines.join("\\n")).nextAction;
  assert.equal(action.input?.name, "by");
  assert.deepEqual(action.applyAction?.argv.slice(1), [
    "approve-plan", "--by", "<PO_PLAN_APPROVER_NAME>",
  ]);

  const command = action.applyAction.command.replace("<PO_PLAN_APPROVER_NAME>", "'Probe Person'");
  assert.equal(isSanctionedLifecycleCommand(command, root), true,
    "the exact returned approve-plan command must be admitted by the readiness guard: " + command);

  const blankBy = "'" + process.execPath + "' '"
    + fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url))
    + "' approve-plan --by ''";
  assert.equal(isSanctionedLifecycleCommand(blankBy, root), false,
    "an unattributed approve-plan must stay refused by the same guard");
}

`;
const PIPELINE_STATE_PREVIEW_PATH = join(dirname(PIPELINE_STATE_TEST_PATH), "pipeline-state.runner-fixture.preview-check.mjs");
const PIPELINE_STATE_PLUGIN_PREVIEW_PATH = join(dirname(PIPELINE_STATE_PLUGIN_TEST_PATH), "pipeline-state.ack-plan-runner.preview-check.mjs");
const RUNNER_ENV_KEYS = ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];

function nakedRunnerEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of RUNNER_ENV_KEYS) delete env[key];
  return env;
}

function pipelineStateSuiteSummary(output) {
  return output.split("\n")
    .filter((line) => /^(FAIL|Failures:|  - |\d+\/\d+ cases passed\.)/u.test(line))
    .join("\n");
}

function stepPipelineStateRunnerFixture({ dryRun, preview }) {
  const original = readFileSync(PIPELINE_STATE_TEST_PATH, "utf8");
  const pluginOriginal = readFileSync(PIPELINE_STATE_PLUGIN_TEST_PATH, "utf8");
  const seedApplied = original.includes('CODEX_THREAD_ID: "pipeline-state-po-authority-fixture"');
  const documentLanguageApplied = original.includes('CODEX_THREAD_ID: "pipeline-state-po-authority-document-language-fixture"');
  const rawAcknowledgePlanCalls = pluginOriginal.match(PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_RE) ?? [];
  const acknowledgePlanRunnerApplied = rawAcknowledgePlanCalls.length === 0;
  const acknowledgeApplyHelperApplied = pluginOriginal.includes(PIPELINE_STATE_ACKNOWLEDGED_APPLY_ARGS_REPLACEMENT);
  const explicitRootApplyArgsApplied = pluginOriginal.includes(PIPELINE_STATE_EXPLICIT_ROOT_APPLY_ARGS_REPLACEMENT);
  const invalidRunnerMutatorApplied = pluginOriginal.includes(PIPELINE_STATE_INVALID_RUNNER_MUTATOR_REPLACEMENT);
  const approvalStopApplied = pluginOriginal.includes("the nested approve action remains explicitly human-confirmed");
  const approveActionApplied = pluginOriginal.includes("approval remains a typed collect-input with one exact nested argv");
  const approveReachApplied = pluginOriginal.includes("the exact nested approve action must also be admitted by the");
  if (seedApplied && documentLanguageApplied && acknowledgePlanRunnerApplied && acknowledgeApplyHelperApplied && explicitRootApplyArgsApplied && invalidRunnerMutatorApplied && approvalStopApplied && approveActionApplied && approveReachApplied) {
    return { status: "already-applied", detail: "all eight pipeline-state fixture repairs are already applied" };
  }

  let next = original;
  if (!seedApplied) {
    next = anchoredReplace(
      next,
      PIPELINE_STATE_RUNNER_FIXTURE_ANCHOR,
      PIPELINE_STATE_RUNNER_FIXTURE_REPLACEMENT,
      "seedPoAuthorityRebind() deps environment",
    );
  }
  if (!documentLanguageApplied) {
    next = anchoredReplace(
      next,
      PIPELINE_STATE_DOCUMENT_LANGUAGE_FIXTURE_ANCHOR,
      PIPELINE_STATE_DOCUMENT_LANGUAGE_FIXTURE_REPLACEMENT,
      "non-de/en document-language PO-authority deps environment",
    );
  }
  let pluginNext = pluginOriginal;
  if (!acknowledgePlanRunnerApplied) {
    if (rawAcknowledgePlanCalls.length !== PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_COUNT) {
      throw new Error(`acknowledge-plan fixture runner calls: expected ${PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_COUNT} unbound calls, found ${rawAcknowledgePlanCalls.length}. Nothing was written.`);
    }
    pluginNext = pluginNext.replace(PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_RE, PIPELINE_STATE_ACKNOWLEDGE_PLAN_CALL_REPLACEMENT);
  }
  if (!acknowledgeApplyHelperApplied) {
    pluginNext = anchoredReplace(
      pluginNext,
      PIPELINE_STATE_ACKNOWLEDGED_APPLY_ARGS_ANCHOR,
      PIPELINE_STATE_ACKNOWLEDGED_APPLY_ARGS_REPLACEMENT,
      "acknowledge apply helper must consume the returned runner-bound action unchanged",
    );
  }
  if (!explicitRootApplyArgsApplied) {
    pluginNext = anchoredReplace(
      pluginNext,
      PIPELINE_STATE_EXPLICIT_ROOT_APPLY_ARGS_ANCHOR,
      PIPELINE_STATE_EXPLICIT_ROOT_APPLY_ARGS_REPLACEMENT,
      "explicit-root acknowledge apply must consume the returned runner-bound action unchanged",
    );
  }
  if (!invalidRunnerMutatorApplied) {
    pluginNext = anchoredReplace(
      pluginNext,
      PIPELINE_STATE_INVALID_RUNNER_MUTATOR_ANCHOR,
      PIPELINE_STATE_INVALID_RUNNER_MUTATOR_REPLACEMENT,
      "invalid runner probe must replace the returned runner instead of duplicating it",
    );
  }
  if (!approvalStopApplied) {
    pluginNext = anchoredBlockReplace(
      pluginNext,
      PIPELINE_STATE_APPROVAL_STOP_START_ANCHOR,
      PIPELINE_STATE_APPROVAL_STOP_END_ANCHOR,
      PIPELINE_STATE_APPROVAL_STOP_REPLACEMENT,
      "awaiting-approval typed nested action contract",
    );
  }
  if (!approveActionApplied) {
    pluginNext = anchoredBlockReplace(
      pluginNext,
      PIPELINE_STATE_APPROVE_ACTION_START_ANCHOR,
      PIPELINE_STATE_APPROVE_ACTION_END_ANCHOR,
      PIPELINE_STATE_APPROVE_ACTION_REPLACEMENT,
      "typed approve-plan applyAction contract",
    );
  }
  if (!approveReachApplied) {
    pluginNext = anchoredBlockReplace(
      pluginNext,
      PIPELINE_STATE_APPROVE_REACH_START_ANCHOR,
      PIPELINE_STATE_APPROVE_REACH_END_ANCHOR,
      PIPELINE_STATE_APPROVE_REACH_REPLACEMENT,
      "typed approve-plan guard reachability contract",
    );
  }

  if (preview) {
    try {
      writeFileSync(PIPELINE_STATE_PREVIEW_PATH, next, "utf8");
      writeFileSync(PIPELINE_STATE_PLUGIN_PREVIEW_PATH, pluginNext, "utf8");
      const parsed = run(["--check", PIPELINE_STATE_PREVIEW_PATH]);
      if (parsed.code !== 0) throw new Error(`pipeline-state.test.mjs (preview copy) no longer parses:\n${parsed.output}`);
      const pluginParsed = run(["--check", PIPELINE_STATE_PLUGIN_PREVIEW_PATH]);
      if (pluginParsed.code !== 0) throw new Error(`plugin pipeline-state.test.mjs (preview copy) no longer parses:\n${pluginParsed.output}`);
      const suite = run(
        [PIPELINE_STATE_PREVIEW_PATH],
        REPO_ROOT,
        nakedRunnerEnv({ PIPELINE_STATE_PS53_ONLY: "1" }),
      );
      const summary = pipelineStateSuiteSummary(suite.output);
      if (suite.code !== 0) {
        throw new Error(`pipeline-state PO-authority preview failed in a runner-marker-free shell (exit ${suite.code}):\n${summary || suite.output.slice(-4000)}`);
      }
      return {
        status: "preview-green",
        detail: `${summary || "pipeline-state PO-authority PS53 slice: exit 0"}; both transformed siblings parse and the PS53 slice ran with no ambient runner marker. The policy-bearing plugin suite is deliberately reserved for the attended real apply: Codex sandbox child Git reports status 0 together with EPERM, which its fail-closed committed-policy reader must reject. Real apply runs both full markerless suites and atomically rolls both protected files back on any failure; protected targets were not touched by this preview`,
      };
    } finally {
      rmSync(PIPELINE_STATE_PREVIEW_PATH, { force: true });
      rmSync(PIPELINE_STATE_PLUGIN_PREVIEW_PATH, { force: true });
    }
  }

  if (dryRun) {
    return { status: "would-apply", detail: "8 unique anchored fixture repairs across 2 protected suites: two runner env markers, 16 explicit --runner codex plan calls, two runner-bound apply consumers, one invalid-runner replacement, and three typed approve-plan action expectations" };
  }

  const detail = writeManyThenVerifyOrRevert([
    { path: PIPELINE_STATE_TEST_PATH, original, next },
    { path: PIPELINE_STATE_PLUGIN_TEST_PATH, original: pluginOriginal, next: pluginNext },
  ], () => {
    const parsed = run(["--check", PIPELINE_STATE_TEST_PATH]);
    if (parsed.code !== 0) return { ok: false, detail: `pipeline-state.test.mjs no longer parses:\n${parsed.output}` };
    const pluginParsed = run(["--check", PIPELINE_STATE_PLUGIN_TEST_PATH]);
    if (pluginParsed.code !== 0) return { ok: false, detail: `plugin pipeline-state.test.mjs no longer parses:\n${pluginParsed.output}` };
    const suite = run([PIPELINE_STATE_TEST_PATH], REPO_ROOT, nakedRunnerEnv());
    const summary = pipelineStateSuiteSummary(suite.output);
    if (suite.code !== 0) {
      return { ok: false, detail: `pipeline-state.test.mjs did not pass completely in a runner-marker-free shell (exit ${suite.code}):\n${summary || suite.output.slice(-4000)}` };
    }
    const pluginSuite = run([PIPELINE_STATE_PLUGIN_TEST_PATH], REPO_ROOT, nakedRunnerEnv());
    const pluginSummary = pipelineStateSuiteSummary(pluginSuite.output);
    if (pluginSuite.code !== 0) {
      return { ok: false, detail: `plugin pipeline-state.test.mjs did not pass completely in a runner-marker-free shell (exit ${pluginSuite.code}):\n${pluginSummary || pluginSuite.output.slice(-4000)}` };
    }
    return { ok: true, detail: `${summary || "pipeline-state.test.mjs: exit 0"}; ${pluginSummary || "plugin pipeline-state.test.mjs: exit 0"}; both full suites passed with no ambient runner marker` };
  });

  return { status: "applied", detail };
}

/* ---------------------------------------------------------------- driver */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--check");
const preview = argv.includes("--preview");
const onlyFlag = argv.find((value) => value.startsWith("--only="));
const only = onlyFlag ? onlyFlag.slice("--only=".length) : null;

const STEPS = [
  { key: "verify", label: `A. register pending suites in ${rel(VERIFY_PATH)} (TP-3)`, fn: stepVerify },
  { key: "gate-strength", label: `B. apply GST33-GST36 + GST14 rename to ${rel(GATE_STRENGTH_PATH)} (TP-6)`, fn: stepGateStrength },
  { key: "entrypoint", label: `C. stop EP07 recording real guard denials against this repo in ${rel(ENTRYPOINT_PATH)} (TP-8)`, fn: stepEntrypoint },
  { key: "guard-git-cwd", label: `D. set runGuard()'s spawned guard cwd to its own fixture dir in ${rel(GUARD_GIT_TEST_PATH)} (TP-1)`, fn: stepGuardGitCwd },
  { key: "verify-nva-c-protected", label: `E. register ${VERIFY_REGISTRATIONS_NVA_C_PROTECTED.length} more pending suites (NVA-C-PROTECTED) in ${rel(VERIFY_PATH)} (TP-3)`, fn: stepVerifyNvaCProtected },
  { key: "guard-git-22", label: `F. add GG22-7/GG22-8 fixture tests to ${rel(GUARD_GIT_TEST_PATH)} (TP-1)`, fn: stepGuardGit22 },
  { key: "guard-git-22-pathspec", label: `F2. add GG22-9 through GG22-15 pathspec fixture tests to ${rel(GUARD_GIT_TEST_PATH)} (TP-1)`, fn: stepGuardGit22Pathspec },
  { key: "verify-manual-check-extract", label: `G. extract the manual-check logic out of ${rel(VERIFY_PATH)} into a testable module (TP-3)`, fn: stepVerifyManualCheckExtract },
  { key: "pipeline-state-runner-fixture", label: `H. bind the PO-authority fixtures to their Codex runner in ${rel(PIPELINE_STATE_TEST_PATH)} and ${rel(PIPELINE_STATE_PLUGIN_TEST_PATH)} (TP-5)`, fn: stepPipelineStateRunnerFixture },
];

const PREVIEWABLE = new Set(["gate-strength", "entrypoint", "guard-git-cwd", "verify-nva-c-protected", "guard-git-22", "guard-git-22-pathspec", "verify-manual-check-extract", "pipeline-state-runner-fixture"]);

if (only !== null && !STEPS.some((step) => step.key === only)) {
  process.stderr.write(`unknown --only value: ${only}\nExpected one of: ${STEPS.map((step) => step.key).join(", ")}\n`);
  process.exit(2);
}

if (preview) process.stdout.write("Preview -- the protected files are not touched.\n\n");
else process.stdout.write(dryRun ? "Dry run -- nothing will be written.\n\n" : "Applying pending protected-path edits.\n\n");

let failures = 0;
for (const step of STEPS) {
  if (only !== null && step.key !== only) continue;
  if (preview && !PREVIEWABLE.has(step.key)) continue; // steps B and C have a previewable form
  process.stdout.write(`${step.label}\n`);
  try {
    const { status, detail } = step.fn({ dryRun, preview });
    process.stdout.write(`  ${status}: ${detail.split("\n").join("\n  ")}\n\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`  REFUSED: ${error.message.split("\n").join("\n  ")}\n\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`${failures} step(s) failed. Nothing was left changed by a failing step -- review with: git diff\n`);
  process.exit(1);
}
if (preview) process.stdout.write("Preview complete -- nothing was changed. Run without --preview to apply.\n");
else process.stdout.write(dryRun ? "Dry run complete.\n" : "Done. Review with `git diff`, then commit.\n");
