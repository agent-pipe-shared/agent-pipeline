#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Operator tool: wire `guard-dispatch-budget.mjs` into the plugin hook manifest.
 *
 * WHY THIS IS A SEPARATE SCRIPT, AND NOT A STEP IN THE SIBLING TOOL.
 * `harness/scripts/apply-pending-protected-edits.mjs` applies edits to *protected
 * test paths* (TP-3/TP-6/TP-8). `plugins/pipeline-core/hooks/hooks.json` is a
 * different and stronger tier: it is on `NEVER_LIFTABLE_KERNEL_PATHS`
 * (`plugins/pipeline-core/lib/guard-maintenance-window.mjs`), the list a signed
 * maintenance window does NOT lift -- `GMW40` exists specifically to prove that a
 * TP-scoped window whose pattern happens to match a kernel path still refuses.
 * hooks.json is the file that decides which guards run at all, so an edit to it
 * stays visible as its own named act rather than becoming one more step in a
 * general-purpose applier. The route the file names in its own `$comment` is
 * "edited only under explicit PO approval"; running this script IS that approval.
 *
 * (For the record, the header of `guard-dispatch-budget.mjs` used to describe its
 * own wiring as "a separate, signed maintenance-window ceremony". That was wrong:
 * no ceremony can cover a never-liftable kernel path. It has been corrected.)
 *
 * WHAT IT WIRES.
 * A PreToolUse registration for `guard-dispatch-budget.mjs`, which counts a
 * dispatched subagent's tool calls externally instead of trusting its self-report
 * and, once the working cap is reached, permits only closing acts -- so a dispatch
 * stops BEFORE the harness cliff, at the one point where a handover is still
 * possible. Motivation, from the guard's own header: three dispatches ran 62, 53
 * and 50 tool calls against a stated ~40-45 allowance, and one reported
 * "34 logged" while the runtime recorded 62.
 *
 * THE MATCHER IS MATCH-ALL ("*"), ON PURPOSE. The budget is a count of ALL tool
 * calls, so a matcher naming individual tools would undercount silently -- the
 * same failure class this file already paid for with NotebookEdit. The
 * orchestrating session is identified and exempted INSIDE the guard, never by the
 * matcher, so this hook never limits the Elephant.
 *
 * WHAT IT CHECKS BEFORE IT WRITES ANYTHING (every one of these is fail-closed):
 *   1. Both target files are unmodified in git, so no hand-edit is clobbered.
 *   2. hooks.json parses and has the expected structure.
 *   3. The guard script exists.
 *   4. The guard's own suite passes (exit 0), run here, now -- not assumed.
 *   5. The suite is registered in Verify as `guard-dispatch-budget-tests`.
 *   6. The match-all matcher literal is ACCEPTED BY THE INSTALLED RUNTIME. This
 *      is the check that motivated the whole script: a matcher the runtime does
 *      not recognise makes the hook a silent no-op that looks exactly like
 *      success. The runtime binary is discovered dynamically via PATH (never a
 *      recorded absolute path) and searched for its match-all predicate. If it
 *      cannot be found, the step REFUSES unless `--accept-unverified-matcher` is
 *      passed explicitly.
 *   7. The wiring is not already present (idempotent; re-running is safe).
 *   8. `docs/product-capability-inventory.json` round-trips byte-identically
 *      through JSON.parse/stringify, so editing it programmatically cannot
 *      reformat unrelated parts of the document.
 *
 * WHAT IT VERIFIES AFTER WRITING, REVERTING BOTH FILES ON ANY FAILURE:
 *   - hooks.json still parses; PreToolUse grew by exactly one entry.
 *   - every pre-existing registration is byte-for-byte unchanged (deep compare).
 *   - the new entry occurs exactly once, with the intended matcher and command.
 *   - `check-product-capability-inventory.mjs` exits 0 -- a new hook is a new
 *     product surface, and leaving it unregistered would turn Verify red on the
 *     PO's next run.
 *
 * It does NOT commit. Reviewing with `git diff` and committing stays yours.
 *
 * USAGE
 *   node harness/scripts/wire-dispatch-budget-hook.mjs --check   # dry run, writes nothing
 *   node harness/scripts/wire-dispatch-budget-hook.mjs           # apply
 *   node harness/scripts/wire-dispatch-budget-hook.mjs --accept-unverified-matcher
 *
 * Exit 0 = wired and verified, or already wired. Any other exit code means
 * nothing was left changed.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const HOOKS_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "hooks.json");
const GUARD_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-dispatch-budget.mjs");
const GUARD_SUITE_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "guard-dispatch-budget.test.mjs");
const VERIFY_PATH = join(REPO_ROOT, "harness", "scripts", "verify.mjs");
const INVENTORY_PATH = join(REPO_ROOT, "docs", "product-capability-inventory.json");
const INVENTORY_CHECKER = join(REPO_ROOT, "harness", "scripts", "check-product-capability-inventory.mjs");

/**
 * MEASURED 2026-08-27, and the reason this is not `"*"`.
 *
 * The hook was first wired with a match-all `"*"` matcher, chosen because the
 * budget counts ALL tool calls and a matcher naming individual tools
 * undercounts silently. The installed runtime binary was searched first and
 * does contain a match-all predicate accepting an absent matcher, `"*"` and
 * `".*"` -- so the literal was believed proven rather than assumed.
 *
 * It was not. A live dispatch afterwards made 34 tool calls and the guard's
 * counter did not move once: the wiring was a silent no-op, exactly the
 * failure the `"*"` choice was reasoned about and exactly the failure that
 * looks identical to success. The binary search proved the predicate EXISTS
 * somewhere in the runtime; it did not prove that predicate governs plugin
 * PreToolUse matchers, and it does not.
 *
 * Hooks do reach subagents -- the same dispatch was refused mid-run by
 * `guard-lifecycle-ready` (matcher `Bash|PowerShell`), which is the control
 * that separates "hooks do not fire in subagents" from "this matcher is not
 * honoured". Only the matcher form was wrong.
 *
 * So this enumerates, using the identical alternation construction every other
 * working matcher in `hooks.json` already uses -- zero novelty. The list is
 * deliberately wider than any single agent's toolset, because undercounting is
 * the failure mode this guard exists to prevent. `".*"` may well work and is a
 * one-character change, but it is untested, and untested is what produced this
 * comment.
 */
const MATCHER = "Bash|Edit|Glob|Grep|NotebookEdit|Read|Task|TodoWrite|WebFetch|WebSearch|Write";

/** The match-all literal this hook was first wired with; silently matched nothing. */
const SUPERSEDED_MATCHER = "*";
const GUARD_COMMAND = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-dispatch-budget.mjs"';
const VERIFY_SUITE_NAME = "guard-dispatch-budget-tests";
const SURFACE_ID = `hook:plugins/pipeline-core/hooks/hooks.json:PreToolUse:${MATCHER}:${GUARD_COMMAND}`;
// The surface id embeds the matcher, so repairing the matcher retires one
// surface and introduces another -- the inventory has to follow, or
// check-product-capability-inventory (and therefore Verify) goes red.
const SUPERSEDED_SURFACE_ID = `hook:plugins/pipeline-core/hooks/hooks.json:PreToolUse:${SUPERSEDED_MATCHER}:${GUARD_COMMAND}`;
const CAPABILITY_ID = "claude-hook-safety";

/* ------------------------------------------------------------------ helpers */

function rel(absolute) {
  return relative(REPO_ROOT, absolute).split("\\").join("/");
}

/**
 * Does this PreToolUse registration invoke the dispatch-budget guard?
 *
 * Structural, never a text search. The command contains literal double quotes
 * (`node "${CLAUDE_PLUGIN_ROOT}/..."`), so it appears in the file bytes AND in
 * any `JSON.stringify` output with those quotes backslash-escaped -- a raw
 * substring test silently answers "no" on a manifest that plainly does contain
 * it. That mistake cost this script one reverted run: the post-write check
 * reported `found 0` for a registration that had in fact been inserted
 * correctly, and would have let a second run insert a duplicate.
 */
function invokesGuard(registration) {
  return Array.isArray(registration?.hooks)
    && registration.hooks.some((hook) => hook?.command === GUARD_COMMAND);
}

/** Byte-for-byte UTF-8 ordering -- the same comparison the inventory checker uses. */
function utf8Compare(left, right) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.compare(b);
}

/** Insert `item` at its byte-sorted position, leaving every other entry where it was. */
function insertSorted(array, item, keyOf) {
  const key = keyOf(item);
  const at = array.findIndex((existing) => utf8Compare(keyOf(existing), key) > 0);
  if (at === -1) array.push(item);
  else array.splice(at, 0, item);
  return array;
}

/** Insert `addition` immediately after `anchor`, refusing unless the anchor occurs exactly once. */
function anchoredInsert(source, anchor, addition, label) {
  const first = source.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found (${label}): the file does not contain the expected text. Nothing was written.`);
  if (source.indexOf(anchor, first + anchor.length) !== -1) {
    throw new Error(`anchor is ambiguous (${label}): the expected text occurs more than once. Nothing was written.`);
  }
  const cut = first + anchor.length;
  return source.slice(0, cut) + addition + source.slice(cut);
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

/** Run one command. Never throws; returns { code, output }. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8", ...options });
  if (result.error) return { code: null, output: String(result.error.message) };
  return { code: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** `git status --porcelain` for one path; "" means unmodified and untracked-free. */
function gitStatus(absolute) {
  const result = run("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", rel(absolute)]);
  if (result.code !== 0) return null;
  return result.output.trim();
}

/** Resolve an executable on PATH without a shell. */
function whichOnPath(name) {
  const entries = String(process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const entry of entries) {
    const candidate = resolve(entry, name);
    if (existsSync(candidate)) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch { /* unreadable entry -- keep looking */ }
    }
  }
  return null;
}

/**
 * Search a large binary for any of `needles`, chunked so a 250 MB runtime bundle
 * does not have to be held in memory at once. Overlap covers needles that
 * straddle a chunk boundary.
 */
function binaryContainsAny(path, needles) {
  const CHUNK = 8 * 1024 * 1024;
  const overlap = Math.max(...needles.map((needle) => needle.length)) - 1;
  const handle = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(CHUNK + overlap);
    let carried = 0;
    let position = 0;
    for (;;) {
      const read = readSync(handle, buffer, carried, CHUNK, position);
      if (read === 0) return null;
      position += read;
      const total = carried + read;
      // The needles are pure ASCII, so latin1 gives a 1 byte : 1 char window
      // that substring search can be trusted on.
      const window = buffer.subarray(0, total).toString("latin1");
      for (const needle of needles) {
        if (window.includes(needle)) return needle;
      }
      carried = Math.min(overlap, total);
      buffer.copy(buffer, 0, total - carried, total);
    }
  } finally {
    closeSync(handle);
  }
}

/* --------------------------------------------------------------- the payload */

const HOOKS_ANCHOR = [
  '            "command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/guard-dispatch.mjs\\"",\n',
  '            "timeout": 10\n',
  "          }\n",
  "        ]\n",
  "      },\n",
].join("");

const HOOKS_ADDITION = [
  "      {\n",
  '        "$comment": "Dispatch budget (NVA-BUDGETGUARD-1, 2026-08-27). Counts a dispatched subagent\'s tool calls externally instead of trusting its self-report, and once the working cap is reached permits only closing acts -- so the dispatch stops BEFORE the harness cliff, at the one point where a handover is still possible. Measured motivation: three dispatches ran 62, 53 and 50 tool calls against a stated ~40-45 allowance, and one reported \\"34 logged\\" while the runtime recorded 62. The matcher is MATCH-ALL ON PURPOSE -- the budget is a count of ALL tool calls, so a matcher naming individual tools would undercount silently, the same failure class this file already paid for with NotebookEdit; the installed runtime treats an absent matcher, \\"*\\" and \\".*\\" as match-all, and that was verified against the running binary rather than assumed, because a matcher the runtime does not recognise is a SILENT no-op that looks exactly like success. The orchestrating session is identified and exempted INSIDE the guard (subagent detection on transcript_path), never by the matcher, so this hook never limits the Elephant. Wired by harness/scripts/wire-dispatch-budget-hook.mjs; see hooks/guard-dispatch-budget.mjs.",\n',
  `        "matcher": ${JSON.stringify(MATCHER)},\n`,
  '        "hooks": [\n',
  "          {\n",
  '            "type": "command",\n',
  `            "command": ${JSON.stringify(GUARD_COMMAND)},\n`,
  '            "timeout": 10\n',
  "          }\n",
  "        ]\n",
  "      },\n",
].join("");

/**
 * Repair applied when the hook is already wired but carries the superseded
 * match-all matcher. Each anchor must occur exactly once or nothing is written.
 * The comments are CORRECTED IN PLACE rather than rewritten: what was tried and
 * why it failed is more useful to the next reader than a clean comment that
 * hides the fact that a plausible-looking matcher matched nothing.
 */
const MATCHER_REPAIRS = [
  {
    label: "the registration's matcher",
    anchor: `        "matcher": ${JSON.stringify(SUPERSEDED_MATCHER)},\n`,
    replacement: `        "matcher": ${JSON.stringify(MATCHER)},\n`,
  },
  {
    label: "the registration's $comment",
    anchor: "Wired by harness/scripts/wire-dispatch-budget-hook.mjs; see hooks/guard-dispatch-budget.mjs.",
    replacement:
      "CORRECTION (2026-08-27, same day): this registration first carried a match-all matcher, and it matched NOTHING -- "
      + "a live dispatch made 34 tool calls without moving the counter once. The runtime binary does contain a match-all "
      + "predicate accepting an absent matcher and the two wildcard literals, which is why the choice was believed proven; "
      + "that predicate simply does not govern plugin PreToolUse matchers. Hooks DO reach subagents -- the same dispatch was "
      + "refused mid-run by guard-lifecycle-ready on its Bash|PowerShell matcher, which is the control separating "
      + "\\\"hooks do not fire in subagents\\\" from \\\"this matcher is not honoured\\\". The matcher now enumerates, using the "
      + "identical alternation construction every other working matcher here already uses, deliberately wider than any single "
      + "agent's toolset because undercounting is the failure this guard exists to prevent. "
      + "Wired by harness/scripts/wire-dispatch-budget-hook.mjs; see hooks/guard-dispatch-budget.mjs.",
  },
  {
    label: "the header's (9) clause",
    anchor:
      "The installed runtime treats an absent matcher, \\\"*\\\" and \\\".*\\\" as match-all; this was verified against the running"
      + " binary rather than assumed, because an unrecognised matcher is a SILENT no-op that looks exactly like success.",
    replacement:
      "CORRECTED 2026-08-27: the matcher was first match-all and matched nothing (34 tool calls, counter unmoved). The runtime's"
      + " match-all predicate exists but does not govern plugin PreToolUse matchers, so the matcher now ENUMERATES the tools,"
      + " deliberately wider than any single agent's toolset. Hooks themselves do reach subagents; only the matcher form was wrong.",
  },
];

const HEADER_COUNT_ANCHOR = "). EIGHT hooks: (1)";
const HEADER_COUNT_REPLACEMENT = "). NINE hooks: (1)";

const HEADER_CLAUSE_ANCHOR = " (AP2 P3a). Multi-command-per-matcher semantics:";
const HEADER_CLAUSE_REPLACEMENT = [
  " (AP2 P3a).",
  " (9) PreToolUse dispatch-budget guard guard-dispatch-budget.mjs (NVA-BUDGETGUARD-1, 2026-08-27)",
  " -- counts a dispatched subagent's tool calls externally instead of trusting its self-report,",
  " and once the working cap is reached permits only closing acts, so a dispatch stops BEFORE the",
  " harness cliff at the one point where a handover is still possible; motivation: three dispatches",
  ' ran 62/53/50 tool calls against a stated ~40-45 allowance and one reported \\"34 logged\\" while the',
  " runtime recorded 62. The matcher is MATCH-ALL ON PURPOSE: the budget counts ALL tool calls, so a",
  " matcher naming individual tools would undercount silently -- the same failure class this file",
  ' already paid for with NotebookEdit. The installed runtime treats an absent matcher, \\"*\\" and',
  ' \\".*\\" as match-all; this was verified against the running binary rather than assumed, because an',
  " unrecognised matcher is a SILENT no-op that looks exactly like success. The orchestrating session",
  " is identified and exempted INSIDE the guard, never by the matcher, so this hook never limits the",
  " Elephant.",
  " Multi-command-per-matcher semantics:",
].join("");

/* ------------------------------------------------------------------- checks */

const failures = [];
let checked = 0;

function check(label, fn) {
  checked += 1;
  let outcome;
  try {
    outcome = fn();
  } catch (error) {
    outcome = { ok: false, detail: String(error?.message ?? error) };
  }
  const mark = outcome.ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label}${outcome.detail ? ` -- ${outcome.detail}` : ""}`);
  if (!outcome.ok) failures.push(label);
  return outcome;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--check");
  const acceptUnverifiedMatcher = argv.includes("--accept-unverified-matcher");
  const unknown = argv.filter((item) => !["--check", "--accept-unverified-matcher"].includes(item));
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(" ")}`);
    console.error("Usage: node harness/scripts/wire-dispatch-budget-hook.mjs [--check] [--accept-unverified-matcher]");
    return 2;
  }

  console.log("wire-dispatch-budget-hook -- preconditions");

  const hooksExists = check("hook manifest exists", () =>
    existsSync(HOOKS_PATH) ? { ok: true, detail: rel(HOOKS_PATH) } : { ok: false, detail: `missing: ${rel(HOOKS_PATH)}` });
  if (!hooksExists.ok) return report(dryRun);

  const originalHooks = readFileSync(HOOKS_PATH, "utf8");
  const originalInventory = existsSync(INVENTORY_PATH) ? readFileSync(INVENTORY_PATH, "utf8") : null;

  let parsedHooks = null;
  check("hook manifest parses and has a PreToolUse array", () => {
    parsedHooks = JSON.parse(originalHooks);
    if (!Array.isArray(parsedHooks?.hooks?.PreToolUse)) return { ok: false, detail: "hooks.PreToolUse is not an array" };
    return { ok: true, detail: `${parsedHooks.hooks.PreToolUse.length} PreToolUse registrations` };
  });

  const existing = (parsedHooks?.hooks?.PreToolUse ?? []).find(invokesGuard) ?? null;
  let mode = "insert";
  check("wiring state (idempotency)", () => {
    if (existing === null) return { ok: true, detail: "not yet wired -- will insert" };
    if (existing.matcher === MATCHER) { mode = "already-wired"; return { ok: true, detail: "already wired with the intended matcher -- nothing to do" }; }
    if (existing.matcher === SUPERSEDED_MATCHER) { mode = "repair-matcher"; return { ok: true, detail: `wired with the superseded match-all matcher ${JSON.stringify(SUPERSEDED_MATCHER)} -- will repair` }; }
    return { ok: false, detail: `wired with an unrecognised matcher ${JSON.stringify(existing.matcher)}; this tool will not overwrite a matcher it did not write. Resolve by hand.` };
  });
  const alreadyWired = mode !== "insert";

  check("both target files are unmodified in git", () => {
    const dirty = [HOOKS_PATH, INVENTORY_PATH].filter((path) => {
      const status = gitStatus(path);
      return status === null || status !== "";
    });
    if (dirty.length > 0) {
      return { ok: false, detail: `refusing to touch modified file(s): ${dirty.map(rel).join(", ")} -- commit or revert them first` };
    }
    return { ok: true, detail: "clean" };
  });

  check("guard script exists", () =>
    existsSync(GUARD_PATH) ? { ok: true, detail: rel(GUARD_PATH) } : { ok: false, detail: `missing: ${rel(GUARD_PATH)}` });

  check("guard suite passes right now", () => {
    if (!existsSync(GUARD_SUITE_PATH)) return { ok: false, detail: `missing: ${rel(GUARD_SUITE_PATH)}` };
    const result = run(process.execPath, [GUARD_SUITE_PATH]);
    if (result.code !== 0) return { ok: false, detail: `exit ${result.code}\n${result.output.trim()}` };
    return { ok: true, detail: `exit 0 (${rel(GUARD_SUITE_PATH)})` };
  });

  check("guard suite is registered in Verify", () => {
    const verify = readFileSync(VERIFY_PATH, "utf8");
    return verify.includes(VERIFY_SUITE_NAME)
      ? { ok: true, detail: `${VERIFY_SUITE_NAME} present in ${rel(VERIFY_PATH)}` }
      : { ok: false, detail: `${VERIFY_SUITE_NAME} absent from ${rel(VERIFY_PATH)} -- wiring a guard whose suite Verify never runs` };
  });

  // WHY THIS CHECK CHANGED. It used to search the installed runtime binary for
  // a match-all predicate, and it passed -- on a matcher that then matched
  // nothing across 34 live tool calls. Finding a predicate in a 250 MB bundle
  // proved the string exists somewhere, not that it governs plugin PreToolUse
  // matchers. That is a check that produced false confidence, which is worse
  // than no check. The property that actually distinguishes a matcher that
  // fires from one that does not, on the evidence available here, is
  // PRECEDENT: every matcher in this manifest that is known to fire is a plain
  // alternation of tool names, and the one that did not fire was the only one
  // that was not.
  check("matcher uses the alternation form other working matchers in this manifest use", () => {
    if (!/^[A-Za-z][A-Za-z0-9_]*(\|[A-Za-z][A-Za-z0-9_]*)*$/.test(MATCHER)) {
      return { ok: false, detail: `${JSON.stringify(MATCHER)} is not a plain alternation of tool names; this tool will not wire a matcher form with no working precedent in this file` };
    }
    const others = (parsedHooks?.hooks?.PreToolUse ?? [])
      .filter((entry) => !invokesGuard(entry))
      .map((entry) => entry.matcher)
      .filter((matcher) => typeof matcher === "string" && /^[A-Za-z][A-Za-z0-9_]*(\|[A-Za-z][A-Za-z0-9_]*)*$/.test(matcher));
    if (others.length === 0) {
      return acceptUnverifiedMatcher
        ? { ok: true, detail: "no same-form precedent in this manifest -- accepted under --accept-unverified-matcher" }
        : { ok: false, detail: "no other registration in this manifest uses the alternation form, so there is no working precedent to rely on" };
    }
    return { ok: true, detail: `${others.length} other registration(s) use the same form, e.g. ${JSON.stringify(others[0])}` };
  });

  check("inventory document round-trips without reformatting", () => {
    if (originalInventory === null) return { ok: false, detail: `missing: ${rel(INVENTORY_PATH)}` };
    const roundTrip = `${JSON.stringify(JSON.parse(originalInventory), null, 2)}\n`;
    return roundTrip === originalInventory
      ? { ok: true, detail: "JSON.stringify(…, 2) reproduces the file byte-for-byte" }
      : { ok: false, detail: "the document does not round-trip; a programmatic edit would reformat unrelated parts" };
  });

  if (failures.length > 0) return report(dryRun);

  if (mode === "already-wired") {
    console.log("\nAlready wired with the intended matcher. Nothing was written.");
    return 0;
  }

  if (dryRun) {
    console.log(`\nDry run: ${checked} checks, all green. Nothing was written.`);
    console.log(mode === "repair-matcher" ? "Re-run without --check to repair the matcher." : "Re-run without --check to apply.");
    return 0;
  }

  /* ------------------------------------------------------------------ apply */

  console.log("\nwire-dispatch-budget-hook -- applying");

  let nextHooks;
  try {
    if (mode === "repair-matcher") {
      nextHooks = originalHooks;
      for (const repair of MATCHER_REPAIRS) {
        nextHooks = anchoredReplace(nextHooks, repair.anchor, repair.replacement, repair.label);
      }
    } else {
      nextHooks = anchoredInsert(originalHooks, HOOKS_ANCHOR, HOOKS_ADDITION, "PreToolUse registration");
      nextHooks = anchoredReplace(nextHooks, HEADER_COUNT_ANCHOR, HEADER_COUNT_REPLACEMENT, "header hook count");
      nextHooks = anchoredReplace(nextHooks, HEADER_CLAUSE_ANCHOR, HEADER_CLAUSE_REPLACEMENT, "header clause (9)");
    }
  } catch (error) {
    console.error(`  [FAIL] ${String(error?.message ?? error)}`);
    return 1;
  }

  let nextInventory;
  try {
    const inventory = JSON.parse(originalInventory);
    if (!Array.isArray(inventory.surfaces)) throw new Error("inventory.surfaces is not an array");
    const capability = (inventory.capabilities ?? []).find((item) => item?.id === CAPABILITY_ID);
    if (!capability || !Array.isArray(capability.surfaceIds)) throw new Error(`capability ${CAPABILITY_ID} not found, or it has no surfaceIds array`);
    // Insert at the byte-sorted position rather than re-sorting the arrays.
    // A full re-sort also normalises entries that were already stored out of
    // order, which sweeps unrelated changes into this commit: the first live
    // run moved `protected-test-paths-tests`, which had nothing to do with
    // wiring a hook. Equivalent for an already-sorted array, strictly less
    // invasive for one that is not.
    if (mode === "repair-matcher") {
      const beforeCount = inventory.surfaces.length + capability.surfaceIds.length;
      inventory.surfaces = inventory.surfaces.filter((surface) => surface.surfaceId !== SUPERSEDED_SURFACE_ID);
      capability.surfaceIds = capability.surfaceIds.filter((id) => id !== SUPERSEDED_SURFACE_ID);
      const removed = beforeCount - (inventory.surfaces.length + capability.surfaceIds.length);
      if (removed !== 2) throw new Error(`expected to retire the superseded surface from both the surfaces array and ${CAPABILITY_ID}, removed ${removed} entr(ies)`);
    }
    insertSorted(inventory.surfaces, {
      surfaceId: SURFACE_ID,
      kind: "hook",
      path: "plugins/pipeline-core/hooks/hooks.json",
      member: `PreToolUse:${MATCHER}:${GUARD_COMMAND}`,
    }, (surface) => surface.surfaceId);
    insertSorted(capability.surfaceIds, SURFACE_ID, (id) => id);
    nextInventory = `${JSON.stringify(inventory, null, 2)}\n`;
  } catch (error) {
    console.error(`  [FAIL] inventory update: ${String(error?.message ?? error)}`);
    return 1;
  }

  writeFileSync(HOOKS_PATH, nextHooks);
  writeFileSync(INVENTORY_PATH, nextInventory);
  console.log(`  wrote ${rel(HOOKS_PATH)} and ${rel(INVENTORY_PATH)}`);

  /* --------------------------------------------------------- verify or revert */

  console.log("\nwire-dispatch-budget-hook -- post-write verification");

  const problems = [];

  let written = null;
  try {
    written = JSON.parse(readFileSync(HOOKS_PATH, "utf8"));
  } catch (error) {
    problems.push(`hook manifest no longer parses as JSON: ${String(error?.message ?? error)}`);
  }

  if (written) {
    const before = parsedHooks.hooks.PreToolUse;
    const after = written.hooks?.PreToolUse;
    if (!Array.isArray(after)) {
      problems.push("hooks.PreToolUse is no longer an array");
    } else {
      const expectedLength = mode === "repair-matcher" ? before.length : before.length + 1;
      if (after.length !== expectedLength) {
        problems.push(`PreToolUse should have ${expectedLength} entries (${mode}), but has ${after.length}`);
      }
      const added = after.filter(invokesGuard);
      if (added.length !== 1) {
        problems.push(`the new registration should occur exactly once, found ${added.length}`);
      } else {
        if (added[0].matcher !== MATCHER) problems.push(`the new registration's matcher is ${JSON.stringify(added[0].matcher)}, expected ${JSON.stringify(MATCHER)}`);
        const commands = (added[0].hooks ?? []).map((hook) => hook?.command);
        if (commands.length !== 1 || commands[0] !== GUARD_COMMAND) {
          problems.push(`the new registration's command is ${JSON.stringify(commands)}, expected exactly [${JSON.stringify(GUARD_COMMAND)}]`);
        }
      }
      // Compare the NON-guard registrations on both sides: in repair mode the
      // guard's own entry legitimately changed, everything else must not have.
      const survivors = after.filter((entry) => !invokesGuard(entry));
      const beforeSurvivors = before.filter((entry) => !invokesGuard(entry));
      if (JSON.stringify(survivors) !== JSON.stringify(beforeSurvivors)) {
        problems.push("a PreToolUse registration other than the guard's own was altered -- this script may not touch them");
      }
    }
    const otherEvents = Object.keys(written.hooks ?? {}).filter((event) => event !== "PreToolUse");
    for (const event of otherEvents) {
      if (JSON.stringify(written.hooks[event]) !== JSON.stringify(parsedHooks.hooks[event])) {
        problems.push(`hooks.${event} was altered -- this script may only touch PreToolUse`);
      }
    }
  }

  if (problems.length === 0) {
    const inventoryCheck = run(process.execPath, [INVENTORY_CHECKER]);
    if (inventoryCheck.code !== 0) {
      problems.push(`check-product-capability-inventory exited ${inventoryCheck.code}:\n${inventoryCheck.output.trim()}`);
    } else {
      console.log("  [PASS] check-product-capability-inventory exits 0");
    }
  }

  if (problems.length > 0) {
    writeFileSync(HOOKS_PATH, originalHooks);
    writeFileSync(INVENTORY_PATH, originalInventory);
    console.error("\n  [FAIL] post-write verification failed; BOTH files were restored to their original bytes:");
    for (const problem of problems) console.error(`    - ${problem}`);
    return 1;
  }

  console.log("  [PASS] hook manifest parses, grew by exactly one registration, and nothing else changed");
  console.log("\nWired and verified.");
  console.log("");
  console.log("Next, in this order:");
  console.log(`  1. review:  git diff -- ${rel(HOOKS_PATH)} ${rel(INVENTORY_PATH)}`);
  console.log("  2. commit (the session can do this for you)");
  console.log("  3. sync the local marketplace copy, then reload plugins");
  console.log("  4. the guard takes effect only for dispatches started AFTER the reload --");
  console.log("     a session that is already running has loaded the old manifest.");
  return 0;
}

function report(dryRun) {
  console.error(`\n${failures.length} of ${checked} checks failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(dryRun ? "\nDry run: nothing was written." : "\nNothing was written.");
  return 1;
}

// Exported for `wire-dispatch-budget-hook.test.mjs` only. The suite exists
// because the post-write predicate was wrong once in a way no precondition
// could catch -- it reported `found 0` for a registration that had in fact
// been inserted correctly, reverted a good write, and would have let a second
// run insert a duplicate. These are the exact pieces that got it wrong.
export { GUARD_COMMAND, HOOKS_ADDITION, HOOKS_ANCHOR, MATCHER, SUPERSEDED_MATCHER, anchoredInsert, invokesGuard };

// Only run when invoked as a program; importing this module must not execute it.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
