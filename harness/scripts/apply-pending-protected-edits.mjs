#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Operator tool: apply the two protected-path edits an agent session cannot.
 *
 * WHY THIS EXISTS. Two files in this repository are protected test paths, and
 * both have finished, reviewed content waiting for them:
 *
 *   A. `harness/scripts/verify.mjs`  (TP-3) -- seven suites written in this and
 *      an earlier block are not registered, so Verify does not run them.
 *   B. `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` (TP-6) -- four
 *      checks (GST33-GST36) plus a title repair for GST14, validated 4/4 against
 *      the real committed guard.
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
 *   - It is scoped. It touches exactly the two files named above and nothing
 *     else, and it does not commit -- reviewing and committing stays yours.
 *
 * USAGE
 *   node harness/scripts/apply-pending-protected-edits.mjs --check   # dry run, writes nothing
 *   node harness/scripts/apply-pending-protected-edits.mjs           # apply both steps
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=verify
 *   node harness/scripts/apply-pending-protected-edits.mjs --only=gate-strength
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

/** Run one command, returning its combined output and exit code. Never throws. */
function run(argv, cwd = REPO_ROOT) {
  const result = spawnSync(process.execPath, argv, { cwd, encoding: "utf8", shell: false, timeout: 600_000 });
  return {
    code: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
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
];

const VERIFY_ANCHOR = '  { name: "nova-verify-journal-tests", file: join(pluginScriptsDir, "verify-journal.test.mjs") },\n];';

function stepVerify({ dryRun }) {
  const original = readFileSync(VERIFY_PATH, "utf8");

  const pending = VERIFY_REGISTRATIONS.filter((entry) => !original.includes(`name: "${entry.name}"`));
  if (pending.length === 0) return { status: "already-applied", detail: "all seven suites are already registered" };

  // A registration pointing at a file that is not there would break Verify for
  // everyone; refuse before writing rather than after.
  const missing = pending.filter((entry) => !existsSync(entry.file));
  if (missing.length > 0) {
    throw new Error(`these suite files do not exist, refusing to register them:\n${missing.map((entry) => `  - ${rel(entry.file)}`).join("\n")}`);
  }

  const next = anchoredReplace(
    original,
    VERIFY_ANCHOR,
    `${VERIFY_ANCHOR.slice(0, -2)}${pending.map((entry) => entry.line).join("\n")}\n];`,
    "verify.mjs TEST_SUITES terminator",
  );

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
      if (suite.code !== 0) failures.push(`  - ${entry.name} (${rel(entry.file)}) exited ${suite.code}`);
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

/* ---------------------------------------------------------------- driver */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--check");
const preview = argv.includes("--preview");
const onlyFlag = argv.find((value) => value.startsWith("--only="));
const only = onlyFlag ? onlyFlag.slice("--only=".length) : null;

const STEPS = [
  { key: "verify", label: `A. register pending suites in ${rel(VERIFY_PATH)} (TP-3)`, fn: stepVerify },
  { key: "gate-strength", label: `B. apply GST33-GST36 + GST14 rename to ${rel(GATE_STRENGTH_PATH)} (TP-6)`, fn: stepGateStrength },
];

if (only !== null && !STEPS.some((step) => step.key === only)) {
  process.stderr.write(`unknown --only value: ${only}\nExpected one of: ${STEPS.map((step) => step.key).join(", ")}\n`);
  process.exit(2);
}

if (preview) process.stdout.write("Preview -- the protected files are not touched.\n\n");
else process.stdout.write(dryRun ? "Dry run -- nothing will be written.\n\n" : "Applying pending protected-path edits.\n\n");

let failures = 0;
for (const step of STEPS) {
  if (only !== null && step.key !== only) continue;
  if (preview && step.key !== "gate-strength") continue; // only step B has a previewable form
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
