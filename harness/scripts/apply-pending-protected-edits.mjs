#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Operator tool: apply the protected-path edits an agent session cannot.
 *
 * WHY THIS EXISTS. Three files in this repository are protected test paths, and
 * each has finished, verified content waiting for it:
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
function run(argv, cwd = REPO_ROOT) {
  const result = spawnSync(process.execPath, argv, { cwd, encoding: "utf8", shell: false, timeout: 600_000 });
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
];

const PREVIEWABLE = new Set(["gate-strength", "entrypoint", "guard-git-cwd", "verify-nva-c-protected"]);

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
