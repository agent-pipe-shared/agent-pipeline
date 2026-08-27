#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Suite for the dispatch-budget hook wiring tool.
 *
 * WHY IT EXISTS. The tool's nine preconditions were all green and its anchored
 * insertion was correct, and it still reverted a good write: the post-write
 * predicate searched `JSON.stringify(registration.hooks)` for the raw command
 * string. That command contains literal double quotes
 * (`node "${CLAUDE_PLUGIN_ROOT}/..."`), which `JSON.stringify` escapes, so the
 * search answered "no" on a manifest that plainly did contain the registration.
 * Two consequences, one visible and one not: the run reported `found 0` and
 * rolled back (visible), and the identically-broken idempotency precondition
 * would have let a SECOND run insert a duplicate registration (not visible --
 * it fails open, in the direction that does damage).
 *
 * No precondition could have caught either. Only exercising the predicate
 * against the shape it actually receives can, which is what this does. It
 * writes nothing: the insertion is performed on an in-memory copy of the real
 * manifest, never on the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GUARD_COMMAND,
  HOOKS_ADDITION,
  HOOKS_ANCHOR,
  MATCHER,
  SUPERSEDED_MATCHER,
  anchoredInsert,
  invokesGuard,
} from "./wire-dispatch-budget-hook.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS_PATH = join(REPO_ROOT, "plugins", "pipeline-core", "hooks", "hooks.json");

/**
 * The manifest as it looks WITHOUT the dispatch-budget registration.
 *
 * The suite has to hold whether or not the live manifest is already wired --
 * it was written before the wiring landed and would otherwise start inserting
 * a second copy the moment it did, turning green tests red for the one reason
 * that is not a defect. So the baseline is derived: if the live file contains
 * the exact block the tool inserts, strip it back out; otherwise it is already
 * the baseline.
 */
function baselineText() {
  const live = readFileSync(HOOKS_PATH, "utf8");
  const marker = live.indexOf('"$comment": "Dispatch budget');
  if (marker === -1) return live; // not wired at all -- already the baseline
  // Cut the whole registration object, whatever matcher it currently carries.
  // Matching on HOOKS_ADDITION verbatim was not enough: while the matcher is
  // being repaired, the live block and the block the tool would insert
  // deliberately differ, and a verbatim test would then silently fall through
  // and insert a SECOND registration.
  const open = live.lastIndexOf("      {\n", marker);
  const close = live.indexOf("\n      },\n", marker);
  if (open === -1 || close === -1) throw new Error("could not delimit the dispatch-budget registration in the live manifest");
  return live.slice(0, open) + live.slice(close + "\n      },\n".length);
}

/** The baseline manifest, plus the tool's own insertion applied in memory. */
function wiredInMemory() {
  const original = baselineText();
  return {
    before: JSON.parse(original),
    after: JSON.parse(anchoredInsert(original, HOOKS_ANCHOR, HOOKS_ADDITION, "test")),
  };
}

test("WDB01: the guard command carries literal double quotes, which is the whole trap", () => {
  assert.ok(GUARD_COMMAND.includes('"'), "the command must contain a literal double quote for this suite to be meaningful");
  assert.ok(
    !JSON.stringify([{ command: GUARD_COMMAND }]).includes(GUARD_COMMAND),
    "a raw substring search of JSON.stringify output must NOT find the command -- if this ever passes, the original defect is no longer reachable and this suite needs rewriting",
  );
});

test("WDB02: invokesGuard recognises the registration the tool actually inserts", () => {
  const { after } = wiredInMemory();
  const matched = after.hooks.PreToolUse.filter(invokesGuard);
  assert.equal(matched.length, 1, "exactly one registration must be recognised -- `found 0` is the reverted-run defect");
});

test("WDB03: invokesGuard does not recognise any pre-existing registration", () => {
  const { before } = wiredInMemory();
  assert.equal(before.hooks.PreToolUse.filter(invokesGuard).length, 0);
});

test("WDB04: the inserted registration carries the intended matcher and exactly one command", () => {
  const { after } = wiredInMemory();
  const [added] = after.hooks.PreToolUse.filter(invokesGuard);
  assert.equal(added.matcher, MATCHER);
  assert.deepEqual(added.hooks.map((hook) => hook.command), [GUARD_COMMAND]);
});

test("WDB05: the insertion adds exactly one registration and alters none", () => {
  const { before, after } = wiredInMemory();
  assert.equal(after.hooks.PreToolUse.length, before.hooks.PreToolUse.length + 1);
  const survivors = after.hooks.PreToolUse.filter((entry) => !invokesGuard(entry));
  assert.deepEqual(survivors, before.hooks.PreToolUse, "every pre-existing registration must survive byte-identically");
});

test("WDB06: no hook event other than PreToolUse is touched", () => {
  const { before, after } = wiredInMemory();
  for (const event of Object.keys(before.hooks)) {
    if (event === "PreToolUse") continue;
    assert.deepEqual(after.hooks[event], before.hooks[event], `hooks.${event} must be untouched`);
  }
});

test("WDB07: idempotency is decided structurally, so a second run cannot duplicate the entry", () => {
  const { after } = wiredInMemory();
  assert.ok(
    after.hooks.PreToolUse.some(invokesGuard),
    "an already-wired manifest must report as wired; the text-search form answered no here and would have inserted a duplicate",
  );
});

test("WDB09: the live manifest carries the registration exactly once, never twice", () => {
  const live = JSON.parse(readFileSync(HOOKS_PATH, "utf8"));
  const matched = live.hooks.PreToolUse.filter(invokesGuard);
  assert.equal(matched.length, 1, "the guard must be wired exactly once -- 0 means the wiring was lost, 2 means a duplicate landed");
});

test("WDB10: the live registration carries either the intended matcher or the one known-superseded value", () => {
  const live = JSON.parse(readFileSync(HOOKS_PATH, "utf8"));
  const [wired] = live.hooks.PreToolUse.filter(invokesGuard);
  assert.ok(
    wired.matcher === MATCHER || wired.matcher === SUPERSEDED_MATCHER,
    `the live matcher is ${JSON.stringify(wired.matcher)}, which this tool neither writes nor recognises as its own superseded value -- resolve by hand rather than relaxing this assertion`,
  );
});

test("WDB11: the superseded matcher is not the intended one, so the repair path is reachable", () => {
  assert.notEqual(MATCHER, SUPERSEDED_MATCHER);
  assert.ok(
    /^[A-Za-z][A-Za-z0-9_]*(\|[A-Za-z][A-Za-z0-9_]*)*$/.test(MATCHER),
    "the intended matcher must be a plain alternation of tool names -- the form every matcher in this manifest that is known to fire uses, and the form the one that silently matched nothing did not",
  );
});

test("WDB08: the anchor occurs exactly once in the real manifest", () => {
  const original = readFileSync(HOOKS_PATH, "utf8");
  const first = original.indexOf(HOOKS_ANCHOR);
  assert.notEqual(first, -1, "anchor not found in the live manifest");
  assert.equal(original.indexOf(HOOKS_ANCHOR, first + HOOKS_ANCHOR.length), -1, "anchor is ambiguous in the live manifest");
});
