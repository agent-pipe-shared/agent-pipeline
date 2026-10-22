// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: the Goldfish BUGFIX template module must not conflict with QG-04 (AC-186).
 * Item: pipeline.goldfish-bugfix-module-conflicts-with-qg-04.
 *
 * Acceptance points (item Proposal option (b), read against current QG-04):
 *  P1 the BUGFIX module lets the item owner write a NEW repro test and run it RED
 *     before the fix, and keep it (no mandatory test-only dispatch split);
 *  P2 guardrails QG-04 and roles/goldfish.md GF-04 say the same rule;
 *  P3 the BUGFIX module itself carries the hard ban: existing acceptance
 *     examiners are not weakened/skipped/deleted, and the repro assertions are not
 *     rewritten merely to reach GREEN (RED evidence preserved);
 *  P4 root template and vendored copy are byte-identical;
 *  P5 no document still demands that an implementing Goldfish may NOT create tests.
 * Reads real repository files; the only mirror is the RED mirror of the checker input.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const flat = (s) => s.replace(/\s+/g, " ");

const TEMPLATES = [
  "templates/prompts/goldfish-task.md",
  "plugins/pipeline-core/templates/prompts/goldfish-task.md",
];

function bugfixModule(text) {
  const start = text.indexOf("## Optional module: BUGFIX briefing");
  assert.ok(start >= 0, "BUGFIX module heading present");
  const end = text.indexOf("\n---", start);
  return flat(text.slice(start, end < 0 ? undefined : end));
}

// Checkers under test (pure functions over module text; used on real text and RED mirrors).
const allowsOwnerRepro = (m) =>
  /prepare and run a meaningful RED test\/repro/.test(m) &&
  /keep the new regression test/.test(m) &&
  /Do not split test authoring from the fix by default/.test(m);
const carriesExaminerBan = (m) =>
  /MUST NOT weaken, skip or delete existing acceptance examiners/.test(m) &&
  /Do not rewrite the repro assertions merely to make the fix GREEN/.test(m);

test("P1 BUGFIX module (both copies) lets the owner write, RED-run and keep the repro", () => {
  for (const rel of TEMPLATES) {
    assert.ok(allowsOwnerRepro(bugfixModule(read(rel))), rel);
  }
});

test("P2 QG-04 and GF-04 state the same outcome-owned-regression rule", () => {
  const qg = flat(read("guardrails/quality-gates.md"));
  const gf = flat(read("roles/goldfish.md"));
  assert.match(qg, /QG-04 [^\n]*?Preserve independent acceptance while allowing outcome-owned regression tests/);
  for (const t of [qg, gf]) {
    assert.match(t, /MAY add (?:a )?new regression tests?/);
    assert.match(t, /MUST NOT weaken, skip or delete (?:them|existing acceptance examiners)/);
  }
  assert.match(qg, /independent Critic remains a separate fresh-context evaluator/);
  assert.match(gf, /independent Critic remains separate and read-only \(QG-04\)/);
});

test("P3 BUGFIX module itself carries the examiner/repro hard ban (item option b)", () => {
  for (const rel of TEMPLATES) {
    const m = bugfixModule(read(rel));
    assert.ok(
      carriesExaminerBan(m),
      `${rel}: BUGFIX module lacks the explicit 'MUST NOT weaken, skip or delete existing acceptance examiners' and 'do not rewrite repro assertions to reach GREEN' text (prepared postimage under specs/sprint-alfred-epic/implementation/checkpoint-2026-10-12/prepared-source)`,
    );
  }
});

test("P4 root template and vendored copy are byte-identical", () => {
  assert.equal(read(TEMPLATES[0]), read(TEMPLATES[1]));
});

test("P5 no document still forbids the implementing Goldfish from creating tests", () => {
  const stale = /must not create or modify the tests that validate its own implementation|test change is a separate dispatch/i;
  for (const rel of [...TEMPLATES, "guardrails/quality-gates.md", "roles/goldfish.md"]) {
    assert.doesNotMatch(flat(read(rel)), stale, rel);
  }
});

test("RED mirror: the checkers fail on the pre-fix and a split-dispatch module", () => {
  const preFix =
    "## Optional module: BUGFIX briefing Write a failing repro test, run it RED, then fix and keep the test.";
  const splitFirst =
    "## Optional module: BUGFIX briefing Split every bugfix into a test-only dispatch followed by an implementation dispatch.";
  assert.equal(allowsOwnerRepro(splitFirst), false);
  assert.equal(allowsOwnerRepro(preFix), false);
  assert.equal(carriesExaminerBan(preFix), false);
  const good =
    "prepare and run a meaningful RED test/repro keep the new regression test Do not split test authoring from the fix by default MUST NOT weaken, skip or delete existing acceptance examiners Do not rewrite the repro assertions merely to make the fix GREEN";
  assert.ok(allowsOwnerRepro(good) && carriesExaminerBan(good));
});
