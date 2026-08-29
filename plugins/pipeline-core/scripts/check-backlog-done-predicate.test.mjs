#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-backlog-done-predicate.test.mjs -- covers checkBacklogDonePredicate() and its pure
 * helpers against SYNTHETIC fixture directories only. Deliberately never run against this
 * repository's real backlog/items/ (unlike check-backlog-sprint-assignment.test.mjs's own real-
 * repository test) -- NVA-DONEWHEN-1's briefing scopes the real-backlog smoke run to a manual
 * CLI invocation outside this suite, precisely because no real item declares `done_when` yet.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { join } from "node:path";

import {
  checkBacklogDonePredicate,
  describePredicate,
  evaluateDoneWhen,
  exitCodeFor,
  isAllowedScriptPath,
  isSafeRepoRelativePath,
  parseDoneWhen,
  DEFAULT_ROOT,
} from "./check-backlog-done-predicate.mjs";

/**
 * A minimal `backlog/items/` fixture, optionally alongside arbitrary extra files (used to plant
 * synthetic `plugins/pipeline-core/scripts/`/`harness/scripts/` scripts for `script-exit-zero`
 * fixtures) -- the checker under test reads only item frontmatter plus whatever `done_when`
 * itself points at, all resolved relative to the returned synthetic root.
 */
function fixture(items, extraFiles = {}) {
  const base = mkdtempSync(join(tmpdir(), "check-backlog-done-predicate-"));
  mkdirSync(join(base, "backlog", "items"), { recursive: true });
  for (const item of items) {
    const meta = { schema: "pipeline.backlog-item.v1", ...item.metadata };
    const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    writeFileSync(join(base, "backlog", "items", item.name), `---\n${lines.join("\n")}\n---\n\n# ${meta.id}\n\nFixture body.\n`);
  }
  for (const [relPath, content] of Object.entries(extraFiles)) {
    const abs = join(base, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return base;
}

const ITEM = (id, extra = {}) => ({
  name: `2026-08-29-${id}.md`,
  metadata: { id: `pipeline.${id}`, type: "defect", owner: "pipeline", status: "open", created: "2026-08-29", source: "fixture", ...extra },
});

/**
 * Like fixture(), but appends a `done_when:` line VERBATIM instead of through JSON.stringify --
 * fixture()'s own stringification can only ever emit a validly quoted scalar, so it can never
 * construct the bare-comma/brace case this suite needs to cover (NVA-R8-PARSEBLIND).
 */
function fixtureWithRawDoneWhen(id, rawDoneWhenLine, extra = {}) {
  const base = mkdtempSync(join(tmpdir(), "check-backlog-done-predicate-raw-"));
  mkdirSync(join(base, "backlog", "items"), { recursive: true });
  const meta = { schema: "pipeline.backlog-item.v1", id: `pipeline.${id}`, type: "defect", owner: "pipeline", status: "open", created: "2026-08-29", source: "fixture", ...extra };
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  lines.push(`done_when: ${rawDoneWhenLine}`);
  writeFileSync(join(base, "backlog", "items", `2026-08-29-${id}.md`), `---\n${lines.join("\n")}\n---\n\n# ${meta.id}\n\nFixture body.\n`);
  return base;
}

const EXIT_ZERO_SCRIPT = "process.exit(0);\n";
const EXIT_ONE_SCRIPT = "process.exit(1);\n";
const SLEEP_SCRIPT = "setTimeout(() => {}, 60000);\n"; // keeps the event loop alive past a short injected timeout

test("checkBacklogDonePredicate: DEFAULT_ROOT resolves to the repository root", () => {
  const path = DEFAULT_ROOT;
  assert.ok(typeof path === "string" && path.length > 0);
});

// --- parseDoneWhen: grammar-level parsing -----------------------------------------------------

test("parseDoneWhen: manual parses with no arguments", () => {
  assert.deepEqual(parseDoneWhen("manual"), { verb: "manual" });
});

test("parseDoneWhen: path-exists parses its single path argument", () => {
  assert.deepEqual(parseDoneWhen("path-exists backlog/README.md"), { verb: "path-exists", path: "backlog/README.md" });
});

test("parseDoneWhen: contains splits path from needle on the first space only, preserving inner spaces", () => {
  assert.deepEqual(
    parseDoneWhen("contains backlog/README.md the done_when field is documented here"),
    { verb: "contains", path: "backlog/README.md", needle: "the done_when field is documented here" },
  );
});

test("parseDoneWhen: script-exit-zero parses its single script-path argument", () => {
  assert.deepEqual(
    parseDoneWhen("script-exit-zero plugins/pipeline-core/scripts/x.mjs"),
    { verb: "script-exit-zero", path: "plugins/pipeline-core/scripts/x.mjs" },
  );
});

test("parseDoneWhen: an unknown verb is malformed", () => {
  const result = parseDoneWhen("frobnicate backlog/README.md");
  assert.equal(result.malformed, true);
  assert.match(result.reason, /unknown verb "frobnicate"/);
});

test("parseDoneWhen: path-exists with no argument is malformed", () => {
  const result = parseDoneWhen("path-exists");
  assert.equal(result.malformed, true);
  assert.match(result.reason, /requires a <repo-relative-path> argument/);
});

test("parseDoneWhen: contains with only a path and no needle is malformed", () => {
  const result = parseDoneWhen("contains backlog/README.md");
  assert.equal(result.malformed, true);
  assert.match(result.reason, /requires <repo-relative-path> <needle>/);
});

test("parseDoneWhen: script-exit-zero with no argument is malformed", () => {
  const result = parseDoneWhen("script-exit-zero");
  assert.equal(result.malformed, true);
  assert.match(result.reason, /requires a <repo-relative-script-path> argument/);
});

test("parseDoneWhen: an empty string is malformed", () => {
  assert.equal(parseDoneWhen("").malformed, true);
  assert.equal(parseDoneWhen("   ").malformed, true);
});

// --- isSafeRepoRelativePath / isAllowedScriptPath ---------------------------------------------

test("isSafeRepoRelativePath: rejects an absolute path", () => {
  assert.equal(isSafeRepoRelativePath("/etc/passwd", "/repo"), false);
});

test("isSafeRepoRelativePath: rejects any .. segment", () => {
  assert.equal(isSafeRepoRelativePath("../outside.md", "/repo"), false);
  assert.equal(isSafeRepoRelativePath("a/../../outside.md", "/repo"), false);
});

test("isSafeRepoRelativePath: accepts an ordinary repo-relative path", () => {
  assert.equal(isSafeRepoRelativePath("backlog/README.md", "/repo"), true);
});

test("isAllowedScriptPath: accepts the two allowed directories and rejects anything else", () => {
  assert.equal(isAllowedScriptPath("plugins/pipeline-core/scripts/x.mjs"), true);
  assert.equal(isAllowedScriptPath("harness/scripts/x.mjs"), true);
  assert.equal(isAllowedScriptPath("backlog/items/x.mjs"), false);
  assert.equal(isAllowedScriptPath("plugins/pipeline-core/lib/x.mjs"), false);
});

// --- evaluateDoneWhen: the three machine verbs, satisfied and unsatisfied ----------------------

test("evaluateDoneWhen: path-exists is satisfied when the path exists", () => {
  const root = fixture([], { "docs/present.md": "x" });
  const evaluated = evaluateDoneWhen(parseDoneWhen("path-exists docs/present.md"), { root });
  assert.equal(evaluated.satisfied, true);
});

test("evaluateDoneWhen: path-exists is unsatisfied when the path is absent", () => {
  const root = fixture([]);
  const evaluated = evaluateDoneWhen(parseDoneWhen("path-exists docs/absent.md"), { root });
  assert.equal(evaluated.satisfied, false);
});

test("evaluateDoneWhen: contains is satisfied when the needle is present as a fixed string", () => {
  const root = fixture([], { "docs/note.md": "before a.b*c after" });
  const evaluated = evaluateDoneWhen(parseDoneWhen("contains docs/note.md a.b*c"), { root });
  assert.equal(evaluated.satisfied, true);
});

test("evaluateDoneWhen: contains is unsatisfied when the needle is absent", () => {
  const root = fixture([], { "docs/note.md": "nothing relevant here" });
  const evaluated = evaluateDoneWhen(parseDoneWhen("contains docs/note.md missing-needle"), { root });
  assert.equal(evaluated.satisfied, false);
});

test("evaluateDoneWhen: contains treats a needle with regex metacharacters literally, never as a regex", () => {
  // "a.b*c" as a regex would match "aXbbbbc"; as a fixed string it must NOT.
  const root = fixture([], { "docs/regex-trap.md": "this file contains aXbbbbc but not the literal needle" });
  const evaluated = evaluateDoneWhen(parseDoneWhen("contains docs/regex-trap.md a.b*c"), { root });
  assert.equal(evaluated.satisfied, false, "a regex interpretation of a.b*c would match aXbbbbc; the literal check must not");

  const rootWithBracket = fixture([], { "docs/bracket-trap.md": "this file contains x but not the literal needle [x]" });
  const evaluatedBracket = evaluateDoneWhen(parseDoneWhen("contains docs/bracket-trap.md [x]"), { root: rootWithBracket });
  assert.equal(evaluatedBracket.satisfied, true, "the literal bracket needle IS present verbatim in this fixture");
});

test("evaluateDoneWhen: contains reads a needle with inner spaces to end of line", () => {
  const root = fixture([], { "docs/spaced.md": "the exact phrase with several words appears here" });
  const evaluated = evaluateDoneWhen(parseDoneWhen("contains docs/spaced.md the exact phrase with several words"), { root });
  assert.equal(evaluated.needle, "the exact phrase with several words");
  assert.equal(evaluated.satisfied, true);
});

test("evaluateDoneWhen: script-exit-zero is satisfied when the script exits 0", () => {
  const root = fixture([], { "plugins/pipeline-core/scripts/exit-zero.mjs": EXIT_ZERO_SCRIPT });
  const evaluated = evaluateDoneWhen(parseDoneWhen("script-exit-zero plugins/pipeline-core/scripts/exit-zero.mjs"), { root });
  assert.equal(evaluated.satisfied, true);
});

test("evaluateDoneWhen: script-exit-zero is unsatisfied when the script exits non-zero", () => {
  const root = fixture([], { "harness/scripts/exit-one.mjs": EXIT_ONE_SCRIPT });
  const evaluated = evaluateDoneWhen(parseDoneWhen("script-exit-zero harness/scripts/exit-one.mjs"), { root });
  assert.equal(evaluated.satisfied, false);
});

test("evaluateDoneWhen: manual never evaluates to a satisfied/unsatisfied outcome", () => {
  const evaluated = evaluateDoneWhen(parseDoneWhen("manual"), { root: fixture([]) });
  assert.equal(evaluated.verb, "manual");
  assert.equal(evaluated.satisfied, null);
});

// --- evaluateDoneWhen: MALFORMED at evaluation time (path safety, allowed dirs, timeout) -------

test("evaluateDoneWhen: an absolute path is malformed", () => {
  const evaluated = evaluateDoneWhen(parseDoneWhen("path-exists /etc/passwd"), { root: fixture([]) });
  assert.equal(evaluated.malformed, true);
});

test("evaluateDoneWhen: a .. escape is malformed", () => {
  const evaluated = evaluateDoneWhen(parseDoneWhen("path-exists ../outside.md"), { root: fixture([]) });
  assert.equal(evaluated.malformed, true);
});

test("evaluateDoneWhen: script-exit-zero pointing outside the two allowed directories is malformed", () => {
  const root = fixture([], { "backlog/items/not-a-script.mjs": EXIT_ZERO_SCRIPT });
  const evaluated = evaluateDoneWhen(parseDoneWhen("script-exit-zero backlog/items/not-a-script.mjs"), { root });
  assert.equal(evaluated.malformed, true);
  assert.match(evaluated.reason, /must resolve inside/);
});

test("evaluateDoneWhen: a script timeout is malformed, never merely unsatisfied", () => {
  const root = fixture([], { "plugins/pipeline-core/scripts/sleeper.mjs": SLEEP_SCRIPT });
  // A short injected timeoutMs exercises the real timeout code path without waiting on the real
  // 120000ms hard cap the CLI itself uses (DEFAULT_SCRIPT_TIMEOUT_MS).
  const evaluated = evaluateDoneWhen(
    parseDoneWhen("script-exit-zero plugins/pipeline-core/scripts/sleeper.mjs"),
    { root, timeoutMs: 300 },
  );
  assert.equal(evaluated.malformed, true);
  assert.match(evaluated.reason, /timed out/);
});

// --- checkBacklogDonePredicate: item-level classification --------------------------------------

test("checkBacklogDonePredicate: manual produces no finding for an open item", () => {
  const root = fixture([ITEM("manual-open", { done_when: "manual" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.undeclared, 0);
});

test("checkBacklogDonePredicate: manual produces no finding for a closed item", () => {
  const root = fixture([ITEM("manual-closed", { status: "closed", done_when: "manual" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("checkBacklogDonePredicate: an open item with an already-satisfied predicate is STALE-OPEN and fails", () => {
  const root = fixture(
    [ITEM("stale-open", { done_when: "path-exists docs/already-there.md" })],
    { "docs/already-there.md": "x" },
  );
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.staleOpen, 1);
  assert.deepEqual(result.staleOpenItems, ["backlog/items/2026-08-29-stale-open.md"]);
  assert.match(result.findings[0], /^STALE-OPEN backlog\/items\/2026-08-29-stale-open\.md:/);
});

test("checkBacklogDonePredicate: a closed item with an unsatisfied predicate is REGRESSION and fails", () => {
  const root = fixture([ITEM("regressed", { status: "closed", done_when: "path-exists docs/never-existed.md" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.regression, 1);
  assert.deepEqual(result.regressionItems, ["backlog/items/2026-08-29-regressed.md"]);
  assert.match(result.findings[0], /^REGRESSION backlog\/items\/2026-08-29-regressed\.md:/);
});

// The single most important assertion in this suite: the graduation boundary. An open item that
// declares nothing at all is reported, never fatal, today.
test("checkBacklogDonePredicate: an open item with no done_when at all is UNDECLARED and exit stays 0", () => {
  const root = fixture([ITEM("undeclared-open")]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true, "UNDECLARED must never be fatal today -- graduation is a later, separate commit");
  assert.equal(exitCodeFor(result), 0);
  assert.equal(result.undeclared, 1);
  assert.equal(result.openUndeclared, 1);
  assert.deepEqual(result.openUndeclaredItems, ["backlog/items/2026-08-29-undeclared-open.md"]);
  assert.match(result.findings[0], /^UNDECLARED backlog\/items\/2026-08-29-undeclared-open\.md:/);
});

test("checkBacklogDonePredicate: an open item correctly declaring an unsatisfied predicate produces no finding", () => {
  const root = fixture([ITEM("open-not-yet", { done_when: "path-exists docs/not-yet.md" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("checkBacklogDonePredicate: a closed item correctly declaring a satisfied predicate produces no finding", () => {
  const root = fixture(
    [ITEM("closed-done", { status: "closed", done_when: "path-exists docs/finished.md" })],
    { "docs/finished.md": "x" },
  );
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("checkBacklogDonePredicate: rejected and deferred items with no done_when are counted, never a finding", () => {
  // backlog/README.md's Triage rules: there is no status: rejected value in the real schema
  // (rejects/merges become status: closed); deferred stays status: open with a Triage note. This
  // checker still classifies purely by the literal status string, so both are exercised directly
  // against the enum this module actually reads (BACKLOG_STATUSES includes "rejected"/"deferred").
  const root = fixture([
    ITEM("no-field-rejected", { status: "rejected" }),
    ITEM("no-field-deferred", { status: "deferred" }),
  ]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.undeclared, 2, "counted for reporting");
  assert.equal(result.openUndeclared, 0, "never a finding for a non-open/in_progress status");
});

test("checkBacklogDonePredicate: rejected/deferred items with a MALFORMED declaration still fail -- vocabulary errors are unconditional", () => {
  const root = fixture([ITEM("rejected-malformed", { status: "rejected", done_when: "frobnicate x" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
  assert.match(result.findings[0], /^MALFORMED/);
});

test("checkBacklogDonePredicate: an unknown verb is MALFORMED and fails", () => {
  const root = fixture([ITEM("bad-verb", { done_when: "frobnicate backlog/README.md" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
  assert.match(result.findings[0], /unknown verb "frobnicate"/);
});

test("checkBacklogDonePredicate: a missing argument is MALFORMED and fails", () => {
  const root = fixture([ITEM("missing-arg", { done_when: "path-exists" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
});

test("checkBacklogDonePredicate: an absolute path is MALFORMED and fails", () => {
  const root = fixture([ITEM("abs-path", { done_when: "path-exists /etc/passwd" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
});

test("checkBacklogDonePredicate: a .. escape is MALFORMED and fails", () => {
  const root = fixture([ITEM("dotdot-path", { done_when: "path-exists ../outside.md" })]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
});

test("checkBacklogDonePredicate: script-exit-zero outside the two allowed directories is MALFORMED and fails", () => {
  const root = fixture(
    [ITEM("script-outside", { done_when: "script-exit-zero backlog/items/rogue.mjs" })],
    { "backlog/items/rogue.mjs": EXIT_ZERO_SCRIPT },
  );
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
  assert.match(result.findings[0], /must resolve inside/);
});

test("checkBacklogDonePredicate: a mix of classes counts each bucket independently", () => {
  const root = fixture(
    [
      ITEM("mix-stale", { done_when: "path-exists docs/mix-present.md" }),
      ITEM("mix-regressed", { status: "closed", done_when: "path-exists docs/mix-absent.md" }),
      ITEM("mix-malformed", { done_when: "not-a-real-verb x" }),
      ITEM("mix-undeclared"),
      ITEM("mix-correct-open", { done_when: "path-exists docs/mix-absent.md" }),
      ITEM("mix-manual", { status: "closed", done_when: "manual" }),
    ],
    { "docs/mix-present.md": "x" },
  );
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.total, 6);
  assert.equal(result.staleOpen, 1);
  assert.equal(result.regression, 1);
  assert.equal(result.malformed, 1);
  assert.equal(result.undeclared, 1);
  assert.equal(result.openUndeclared, 1);
  assert.equal(result.findings.length, 4, "manual and the correctly-declared-but-unsatisfied-open item contribute no finding");
});

// --- checkBacklogDonePredicate: a present-but-unparseable done_when is MALFORMED, never
// UNDECLARED (NVA-R8-PARSEBLIND) ------------------------------------------------------------

test("checkBacklogDonePredicate: a done_when value containing a bare comma is MALFORMED, and the finding names JSON quoting", () => {
  const root = fixtureWithRawDoneWhen("bare-comma", "contains backlog/README.md a, b");
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
  assert.deepEqual(result.malformedItems, ["backlog/items/2026-08-29-bare-comma.md"]);
  assert.equal(result.undeclared, 0, "a present-but-unparseable declaration must never be counted as undeclared");
  assert.equal(result.openUndeclared, 0);
  assert.match(result.findings[0], /^MALFORMED backlog\/items\/2026-08-29-bare-comma\.md:/);
  assert.match(result.findings[0], /JSON/, "the remedy must name JSON quoting");
});

test("checkBacklogDonePredicate: a done_when value containing a bare brace is MALFORMED, not UNDECLARED", () => {
  const root = fixtureWithRawDoneWhen("bare-brace", "contains backlog/README.md {needle}");
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, false);
  assert.equal(result.malformed, 1);
  assert.equal(result.undeclared, 0);
  assert.match(result.findings[0], /^MALFORMED backlog\/items\/2026-08-29-bare-brace\.md:/);
});

test("checkBacklogDonePredicate: an item with no done_when line at all is still UNDECLARED (contrast with the two cases above)", () => {
  const root = fixture([ITEM("no-done-when-at-all")]);
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.equal(result.malformed, 0);
  assert.equal(result.undeclared, 1);
  assert.equal(result.openUndeclared, 1);
  assert.deepEqual(result.openUndeclaredItems, ["backlog/items/2026-08-29-no-done-when-at-all.md"]);
});

test("checkBacklogDonePredicate: a correctly JSON-quoted done_when value containing a comma evaluates normally -- neither MALFORMED nor UNDECLARED", () => {
  const root = fixtureWithRawDoneWhen("quoted-comma", JSON.stringify("contains backlog/README.md a, b"));
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.ok, true);
  assert.equal(result.malformed, 0);
  assert.equal(result.undeclared, 0);
  assert.deepEqual(result.findings, []);
});

// --- exitCodeFor / usage error --------------------------------------------------------------

test("exitCodeFor: usageError yields 3 regardless of ok", () => {
  assert.equal(exitCodeFor({ usageError: true, ok: false }), 3);
  assert.equal(exitCodeFor({ usageError: true, ok: true }), 3);
});

test("exitCodeFor: ok yields 0, a fatal finding yields 1", () => {
  assert.equal(exitCodeFor({ ok: true }), 0);
  assert.equal(exitCodeFor({ ok: false }), 1);
});

test("checkBacklogDonePredicate: an unreadable items directory produces a usage error, exit 3 -- not exit 1", () => {
  const root = join(mkdtempSync(join(tmpdir(), "check-backlog-done-predicate-missing-")), "does-not-exist");
  const result = checkBacklogDonePredicate(root);
  assert.equal(result.usageError, true);
  assert.equal(exitCodeFor(result), 3);
});

// --- describePredicate -------------------------------------------------------------------------

test("describePredicate: renders each verb into readable prose", () => {
  assert.equal(describePredicate({ verb: "manual" }), "manual (no machine predicate)");
  assert.equal(describePredicate({ verb: "path-exists", path: "a/b.md" }), "path-exists a/b.md");
  assert.equal(describePredicate({ verb: "contains", path: "a/b.md", needle: "x y" }), 'contains a/b.md "x y"');
  assert.equal(describePredicate({ verb: "script-exit-zero", path: "harness/scripts/x.mjs" }), "script-exit-zero harness/scripts/x.mjs");
});
