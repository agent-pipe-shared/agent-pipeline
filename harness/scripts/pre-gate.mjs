#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-gate.mjs -- the fast, obligation-detecting subset of harness/scripts/verify.mjs's
 * TEST_SUITES, runnable in seconds instead of the full ~13-minute gate.
 *
 * WHY THIS EXISTS (NVA-B-PREGATE-1, backlog
 * `pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals`,
 * scratch/strip-pregate.md). A change at point A silently creates an obligation at
 * point B, and today the only thing that reliably surfaces the omission is a full
 * `verify.mjs` run. Four instances were measured on 2026-09-01, each costing the full
 * gate to surface a one-line fix: the vendored-canon copy after a `guardrails/`/
 * `templates/` edit; `DYNAMIC_IMPORT_EDGES` in the kernel-closure test after a new
 * dynamic import; the observation-governance documentation inventory after a new ADR;
 * the reference-path allowlist after untracking a file an entry pointed at. This
 * script runs those four checkers plus two more of the same shape (doc contracts,
 * suite registration) on their own, so the omission surfaces in seconds.
 *
 * EXACT INVOCATION PARITY. Each entry in CHECKS below names the identical file (and,
 * where present, identical args) verify.mjs's own `TEST_SUITES` array registers it
 * under, and this script spawns it the same way `runVerifyJournal`
 * (plugins/pipeline-core/scripts/verify-journal.mjs, `executeSuite`) does: a plain
 * `node <file> [...args]`, no shell, no `node --test`, no `--permission` flags (none of
 * these six suites is declared in verify-journal.mjs's `TIER_B_DECLARATIONS`, so the
 * gate itself grants them the unrestricted Tier A default -- confirmed by reading that
 * table on 2026-09-04). The one deliberate, disclosed difference: this script passes an
 * explicit `cwd: repoRoot` to each spawn, where verify.mjs's own suites carry no `cwd`
 * override at all (so their child inherits whatever process spawned `verify.mjs`
 * itself, which is this repository's convention of always running it from the repo
 * root). This is a no-op difference for all six: each of the six confirmed on
 * 2026-09-04 by direct source read resolves its own root from `import.meta.url`
 * (never from `process.cwd()`), so passing `repoRoot` explicitly only makes this
 * script's own working directory irrelevant to the checks it runs -- it does not change
 * what any of them evaluates. Two further, smaller differences, named rather than left
 * for a reader to find: this script spawns with `encoding: "utf8"` and a 32 MiB
 * `maxBuffer`, where `verify-journal.mjs`'s `executeSuite` uses `encoding: "buffer"` and
 * its own 16 MiB `MAX_LOG_BYTES`. Neither can change a child's exit code (both only
 * affect how already-produced stdout/stderr bytes are decoded/truncated for this
 * script's own report), so neither affects PASS/FAIL parity with the gate.
 * `pre-gate.test.mjs`'s drift-guard test additionally confirms, on every run, that each
 * of these six files is still literally present in verify.mjs's own `TEST_SUITES` -- if
 * a future edit to verify.mjs renames, removes, or re-args one of them, that test goes
 * red instead of this script silently drifting out of sync with the gate it is supposed
 * to preview. That drift-guard itself depends on
 * `check-suite-registration.mjs`'s `parseAllRegisteredSuiteFiles` continuing to
 * recognize verify.mjs's `file:` value shapes; a future `TEST_SUITES` entry written in
 * an unrecognized shape would turn `pre-gate.test.mjs` red for a reason unrelated to
 * pre-gate itself -- an intentional coupling, not an accident.
 *
 * READ-ONLY. This script and every check it runs is read-only with respect to the
 * repository (confirmed for all six by direct source read on 2026-09-04: the two
 * `.mjs` "check" scripts among them only write when passed an explicit, opt-in
 * `--report <file>` flag this script never passes; the four `.test.mjs` suites among
 * them only ever `writeFileSync` into their own `mkdtempSync` fixture directories,
 * never into the real repository tree). It never fixes, regenerates, or repairs
 * anything -- a pre-gate that silently repairs the omission it was meant to surface
 * removes the signal.
 *
 * NOT A GIT HOOK. Whether this becomes automatic (a pre-commit hook, wired into CI) is
 * a separate decision; this script only delivers the command.
 *
 * Usage: node harness/scripts/pre-gate.mjs
 * Exit 0: every check passed. Exit 1: at least one check failed or errored; the report
 * on stdout names which, and the concrete obligation each failing check protects.
 */
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../../plugins/pipeline-core/lib/entrypoint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..");
const scriptDir = HERE;
const libDir = join(REPO_ROOT, "plugins", "pipeline-core", "lib");

/**
 * The six fast obligation-detecting checkers, each mirroring one verify.mjs
 * `TEST_SUITES` entry verbatim (see verify.mjs, read 2026-09-04, for the exact source
 * lines each of these six reproduces):
 *   { name: "generate-vendored-canon-tests", file: join(scriptDir, "generate-vendored-canon.test.mjs") }
 *   { name: "reference-path-check", file: join(scriptDir, "check-reference-paths.mjs") }
 *   { name: "observation-governance-tests", file: join(scriptDir, "check-observation-governance.test.mjs") }
 *   { name: "guard-maintenance-window-kernel-closure-tests", file: join(libDir, "guard-maintenance-window-kernel-closure.test.mjs") }
 *   { name: "doc-contract-check", file: join(scriptDir, "check-doc-contracts.mjs") }
 *   { name: "verify-suite-registration-check", file: join(scriptDir, "check-verify-suite-registration.mjs") }
 * None carries `args` in verify.mjs (all default to `[]`); `obligation` below is this
 * script's own addition, naming in plain language what a failure of that check means
 * is owed elsewhere -- verify.mjs's own step names are the mechanical id, not a
 * description a reader unfamiliar with the checker can act on.
 */
export const CHECKS = Object.freeze([
  Object.freeze({
    name: "generate-vendored-canon-tests",
    obligation: "the vendored canon copy under plugins/pipeline-core/ is out of sync with its guardrails/ or templates/ source -- regenerate it",
    file: join(scriptDir, "generate-vendored-canon.test.mjs"),
    args: Object.freeze([]),
  }),
  Object.freeze({
    name: "reference-path-check",
    obligation: "a tracked file names a script path check-reference-paths.mjs's ALLOWLIST cannot resolve -- update the allowlist or the reference",
    file: join(scriptDir, "check-reference-paths.mjs"),
    args: Object.freeze([]),
  }),
  Object.freeze({
    name: "observation-governance-tests",
    obligation: "the observation-governance documentation inventory (governance/observation-doc-governance.json) is incomplete or drifted -- likely a new doc or ADR that was never classified",
    file: join(scriptDir, "check-observation-governance.test.mjs"),
    args: Object.freeze([]),
  }),
  Object.freeze({
    name: "guard-maintenance-window-kernel-closure-tests",
    obligation: "DYNAMIC_IMPORT_EDGES is stale against a kernel file's actual dynamic import()s -- a new dynamic import needs a declared edge",
    file: join(libDir, "guard-maintenance-window-kernel-closure.test.mjs"),
    args: Object.freeze([]),
  }),
  Object.freeze({
    name: "doc-contract-check",
    obligation: "a documentation contract (a tracked Markdown link/anchor, or the calibrated handover authority) is broken",
    file: join(scriptDir, "check-doc-contracts.mjs"),
    args: Object.freeze([]),
  }),
  Object.freeze({
    name: "verify-suite-registration-check",
    obligation: "a *.test.mjs suite is unregistered, names a missing file, or is duplicated in verify.mjs's TEST_SUITES/SCOPED_VERIFY_SUITES/WINDOWS_ASSURANCE_VERIFY_SUITES",
    file: join(scriptDir, "check-verify-suite-registration.mjs"),
    args: Object.freeze([]),
  }),
]);

const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/**
 * Runs one check exactly the way verify.mjs's own journal would: `node <file>
 * [...args]`, cwd pinned to repoRoot (see the module header for why that pin is a
 * no-op for all six real entries). A check whose `file` does not exist on disk is
 * reported as a distinct `"error"` status with a named, non-crashing message --
 * never a thrown exception that would abort the whole run before the remaining
 * checks get a chance to report.
 */
export function runCheck(check, { repoRoot = REPO_ROOT, spawn = nodeSpawnSync } = {}) {
  const startedAt = Date.now();
  if (!existsSync(check.file)) {
    return {
      name: check.name,
      obligation: check.obligation,
      file: check.file,
      status: "error",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      message: `PRE-GATE-SCRIPT-MISSING: ${check.file} does not exist -- this check cannot run`,
    };
  }
  const result = spawn(process.execPath, [check.file, ...check.args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const durationMs = Date.now() - startedAt;
  if (result.error) {
    return {
      name: check.name,
      obligation: check.obligation,
      file: check.file,
      status: "error",
      exitCode: null,
      durationMs,
      message: `PRE-GATE-SPAWN-FAILED: ${result.error.message}`,
    };
  }
  const exitCode = result.status ?? (result.signal ? 1 : 0);
  return {
    name: check.name,
    obligation: check.obligation,
    file: check.file,
    status: exitCode === 0 ? "pass" : "fail",
    exitCode,
    durationMs,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Runs every check in `checks` in sequence (deterministic per-check timing, no shared
 * fixture/tmp-dir contention between checks) and returns the aggregate outcome. Never
 * short-circuits on the first failure -- every check runs and reports, matching "naming
 * which" in the plural.
 */
export function runPreGate({ checks = CHECKS, repoRoot = REPO_ROOT, spawn = nodeSpawnSync } = {}) {
  const startedAt = Date.now();
  const results = checks.map((check) => runCheck(check, { repoRoot, spawn }));
  const totalDurationMs = Date.now() - startedAt;
  return {
    ok: results.every((result) => result.status === "pass"),
    results,
    totalDurationMs,
  };
}

/** Human-readable stdout report: every check's name, status and duration, then the
 *  unmet obligation for each failing or erroring check, then a one-line summary. */
export function formatReport({ results, totalDurationMs, ok }) {
  const lines = [];
  for (const result of results) {
    const label = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "ERROR";
    lines.push(`${label} ${result.name} (${result.durationMs}ms)`);
    if (result.status === "fail") {
      lines.push(`  obligation unmet: ${result.obligation}`);
      const tail = (result.stderr || result.stdout || "").trim().split("\n").slice(-10).join("\n  ");
      if (tail) lines.push(`  ${tail}`);
    } else if (result.status === "error") {
      lines.push(`  ${result.message}`);
    }
  }
  const passed = results.filter((result) => result.status === "pass").length;
  lines.push(`Pre-gate: ${results.length} check(s), ${passed} passed, total ${totalDurationMs}ms -> ${ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

function main() {
  const outcome = runPreGate();
  process.stdout.write(`${formatReport(outcome)}\n`);
  process.exit(outcome.ok ? 0 : 1);
}

if (isDirectInvocation(import.meta.url)) main();
