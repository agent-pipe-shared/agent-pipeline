// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: Goldfish briefs carry targeted and quick command routes (AC-187).
 * Item: pipeline.goldfish-test-briefs-lack-targeted-and-quick-command-routes.
 *
 * The original item body is not present in this repository (legacy-origin only);
 * acceptance points are taken from the matrix row (stage 25, implemented-guidance):
 *  P1 field 3 requires concrete targeted commands per acceptance criterion, never
 *     just "run relevant tests", and a quick check cannot clear a failed/missing one;
 *  P2 the quick route is the actual configured command OR honestly absent
 *     ("missing - unknown, no quick PASS") OR invalid (report the problem);
 *  P3 a quick command is never invented from a lifecycle profile named `quick`,
 *     an invalid route is never run, an absent command is never reported as PASS;
 *  P4 final integrated Verify is Coordinator-owned; worker results do not certify it;
 *  P5 root template and vendored copy are byte-identical;
 *  P6 the three routes appear in order targeted -> quick -> final Verify.
 * Emitted briefs: the briefing generator (lib/dispatch-briefing-build.mjs) now renders the same three routes; its
 * output is pinned in scripts/dispatch-briefing.test.mjs ("... targeted, quick and final Verify routes in order ...").
 * This file pins the template text only.
 * Reads the real template files; the only mirror is the RED mirror of the checker input.
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

const line = (text, prefix) => {
  const l = text.split("\n").find((x) => x.startsWith(prefix));
  assert.ok(l, `template line starting with "${prefix}" present`);
  return flat(l);
};

// Checkers under test (pure functions over a field line; used on real text and RED mirrors).
const targetedOk = (l) =>
  /TARGETED_CHECK_COMMANDS_AND_AC_IMPACT_SCOPE: concrete meaningful commands, each with its acceptance criteria/.test(l) &&
  /never just "run relevant tests"/.test(l) &&
  /cannot be cleared by a quick check/.test(l);
const quickRoutesOk = (l) =>
  /actual configured command, configuration\/source reference, scope and owner/.test(l) &&
  /"missing . unknown, no quick PASS"/.test(l) &&
  /"invalid . report the exact source\/validation problem"/.test(l);
const quickNoFabricationOk = (l) =>
  /Do not invent a command from a lifecycle profile named `quick`/.test(l) &&
  /run an invalid route/.test(l) &&
  /report an absent command as PASS/.test(l) &&
  /Missing quick configuration does not remove the targeted checks/.test(l);
const verifyOk = (l) =>
  /Final integrated Verify . Coordinator owner/.test(l) &&
  /worker targeted\/quick results do not certify it/.test(l) &&
  /never substitute impacted work evidence for full candidate evidence/.test(l);

test("P1 targeted-check field demands concrete commands (both copies)", () => {
  for (const rel of TEMPLATES) {
    assert.ok(targetedOk(line(read(rel), "- Targeted checks")), rel);
  }
});

test("P2 quick-check field offers configured / absent / invalid routes (both copies)", () => {
  for (const rel of TEMPLATES) {
    assert.ok(quickRoutesOk(line(read(rel), "- Quick check:")), rel);
  }
});

test("P3 quick route is never fabricated, run invalid, or reported PASS when absent", () => {
  for (const rel of TEMPLATES) {
    assert.ok(quickNoFabricationOk(line(read(rel), "- Quick check:")), rel);
  }
});

test("P4 final integrated Verify is Coordinator-owned and not certified by worker results", () => {
  for (const rel of TEMPLATES) {
    assert.ok(verifyOk(line(read(rel), "- Final integrated Verify")), rel);
  }
});

test("P5 root template and vendored copy are byte-identical", () => {
  assert.equal(read(TEMPLATES[0]), read(TEMPLATES[1]));
});

test("P6 field order is targeted, quick, final Verify", () => {
  for (const rel of TEMPLATES) {
    const t = read(rel);
    const a = t.indexOf("- Targeted checks");
    const b = t.indexOf("- Quick check:");
    const c = t.indexOf("- Final integrated Verify");
    assert.ok(a >= 0 && a < b && b < c, rel);
  }
});

test("RED mirror: the checkers fail on a pre-fix brief that has no explicit routes", () => {
  const preFix = "- Checks: run relevant tests, then the quick check if there is one.";
  assert.equal(targetedOk(preFix), false);
  assert.equal(quickRoutesOk(preFix), false);
  assert.equal(quickNoFabricationOk(preFix), false);
  assert.equal(verifyOk(preFix), false);
  // A fabricating variant must also fail.
  const fabricating = "- Quick check: use the quick lifecycle profile; report PASS if absent.";
  assert.equal(quickNoFabricationOk(fabricating), false);
  assert.equal(quickRoutesOk(fabricating), false);
  // Real text passes (guards against checkers that can never fail or never pass).
  assert.ok(targetedOk(line(read(TEMPLATES[0]), "- Targeted checks")));
});
