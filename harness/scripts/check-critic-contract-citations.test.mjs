// SPDX-License-Identifier: SUL-1.0
/**
 * Falsifiability pin for check-critic-contract-citations.mjs.
 *
 * A citation check that cannot go red is decoration: it reports "every citation
 * resolves" whether or not the targets still carry the cited content. This test
 * pins the property the check claims, class by class:
 *
 *   A. TARGET-SIDE — breaking only the CITED TARGET (never the citing line)
 *      turns that class red. This is the direction that matters, because the
 *      normal way a citation rots is that the target moves while the pointer
 *      stays put.
 *   B. COORDINATE-SIDE — rewriting a single coordinate to a bogus one turns the
 *      check red. Two coordinate forms were once unchecked while the success
 *      line claimed completeness; each mutation here names the exact coordinate,
 *      so a matcher that stops parsing that form fails this test rather than
 *      going quietly green.
 *   C. NO NARROWING — every coordinate the earlier matcher found is still found.
 *      Widening the claim and shrinking the corpus produce the same green.
 *   D. THE SUCCESS LINE — states its blind spots (QG-05) and reports measured
 *      counts, so a shrinking corpus shows up as a smaller number.
 *
 * All fault injection happens in a materialized temp root (the check resolves
 * every path against `root`); no tracked file is touched, not even transiently.
 *
 * NOT REGISTERED in harness/scripts/verify.mjs on purpose (that file's
 * maintenance window is closed); run it directly with `node`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CITATION_SOURCE_FILES,
  COORDINATE_RE,
  checkCriticContractCitations,
  successLine,
} from "./check-critic-contract-citations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

const tmp = mkdtempSync(join(tmpdir(), "citation-check-test-"));
for (const rel of CITATION_SOURCE_FILES) {
  mkdirSync(join(tmp, dirname(rel)), { recursive: true });
  writeFileSync(join(tmp, rel), readFileSync(join(ROOT, rel), "utf8"));
}
const run = () => checkCriticContractCitations({ root: tmp });

/** Literal replacement; refuses to let a no-op edit masquerade as a break. */
function mutate(rel, from, to) {
  const path = join(tmp, rel);
  const before = readFileSync(path, "utf8");
  assert.ok(before.includes(from), `break not applicable: ${rel} does not contain ${JSON.stringify(from.slice(0, 70))}`);
  writeFileSync(path, before.replace(from, to));
  return { path, before };
}

/** Apply the edits, assert the expected finding, restore, assert green again. */
function redWhenBroken(id, expected, edits) {
  check(`${id} goes red when its cited target is broken, and green again after restore`, () => {
    const snaps = edits.map(([rel, from, to]) => mutate(rel, from, to));
    const broken = run();
    assert.equal(broken.ok, false, `${id}: check stayed green with the target broken`);
    assert.ok(
      broken.findings.some((f) => expected.test(f)),
      `${id}: expected a finding matching ${expected}; got:\n  ${broken.findings.join("\n  ") || "(none)"}`,
    );
    for (const s of [...snaps].reverse()) writeFileSync(s.path, s.before);
    const restored = run();
    assert.deepEqual(restored.findings, [], `${id}: findings survived the restore`);
  });
}

const PROTOCOL = "harness/review-protocol.md";
const SKILL = "plugins/pipeline-core/skills/critic-review/SKILL.md";
const ROLE = "roles/critic.md";

// ---------------------------------------------------------------- baseline
check("the real checkout is green (the matrix below measures departures from this)", () => {
  const real = checkCriticContractCitations();
  assert.deepEqual(real.findings, []);
  assert.equal(real.ok, true);
});
check("the materialized temp root reproduces that green", () => {
  assert.equal(run().ok, true);
});

// ------------------------------------------- A. target-side, class by class
redWhenBroken("PHX-CITE-1", /PHX-CITE-1 /, [
  [PROTOCOL, '> "Every architecture/guardrail/security diff', '> "Any architecture/guardrail/security diff'],
]);
redWhenBroken("PHX-CITE-2a (rung anchor)", /PHX-CITE-2 ANCHOR-ABSENT/, [
  [PROTOCOL, "| Rung | Owner |", "| Level | Owner |"],
]);
redWhenBroken("PHX-CITE-2b (ladder pointer)", /PHX-CITE-2 TARGET-MISSING/, [
  ["PIPELINE_FLOW.md", "## 5. Close deliberately; recover with a bound", "## 5. Closing and recovery"],
]);
redWhenBroken("PHX-CITE-3 (operationalization map)", /PHX-CITE-3 MAPPING-MISMATCH/, [
  ["CLAUDE.md", "review system (*Evidence, review and recovery*", "review system (*Operating shapes*"],
]);
redWhenBroken("PHX-CITE-3 (ladder attribution)", /PHX-CITE-3 LADDER-ABSENT/, [
  [PROTOCOL, "| Rung | Owner |", "| Level | Owner |"],
]);
redWhenBroken("PHX-CITE-4", /PHX-CITE-4 DEFINITION-ABSENT/, [
  ["docs/operating-model.md", "**Risk** answers", "**Exposure** answers"],
]);
redWhenBroken("PHX-CITE-5", /PHX-CITE-5 PATTERN-ABSENT/, [
  [PROTOCOL, "**Rule:** Search harshly, report honestly.", "**Rule:** Look hard, report honestly."],
]);
redWhenBroken("PHX-CITE-6", /PHX-CITE-6 ATTRIBUTION-ABSENT/, [
  ["README.md", "[Dave Rensin, **“Elephants", "[Dave R., **“Elephants"],
]);
redWhenBroken("PHX-CITE-8 (§-number)", /PHX-CITE-8 SECTION-MISSING/, [
  [PROTOCOL, "### 2.1 Trigger decision table", "### 2.9 Trigger decision table"],
  [PROTOCOL, "word-identical in this file's §2.1", "word-identical in this file's §2.9"],
]);
redWhenBroken("PHX-CITE-8 (title on a numbered section)", /PHX-CITE-8 TITLE-MISMATCH/, [
  [PROTOCOL, "### 2.1 Trigger decision table", "### 2.1 Trigger table"],
]);
redWhenBroken("PHX-CITE-8 (title-only coordinate)", /PHX-CITE-8 HEADING-MISSING/, [
  ["docs/operating-model.md", "## 4. The lifecycle", "## 4. The delivery lifecycle"],
]);

// PHX-CITE-7 is a PROHIBITION class: in the green state no citing line exists,
// so its red cannot be produced by breaking a target — the ordinal usage IS the
// violation. Target sensitivity is shown the other way round: with the usage in
// place, anchoring the enumeration in a canon target clears it.
check("PHX-CITE-7 goes red on an unanchored ordinal and clears when a target defines the enumeration", () => {
  const usage = mutate(SKILL, "You are the **Critic** of the Agent-Pipeline", "Report findings in transfer format 3.\n\nYou are the **Critic** of the Agent-Pipeline");
  const red = run();
  assert.ok(red.findings.some((f) => /PHX-CITE-7 ORDINAL-UNANCHORED/.test(f)), `expected PHX-CITE-7; got:\n  ${red.findings.join("\n  ")}`);
  const anchor = mutate("PIPELINE_FLOW.md", "## 5. Close deliberately", "The transfer formats are enumerated here: 1 findings, 2 handover, 3 verdict.\n\n## 5. Close deliberately");
  assert.ok(!run().findings.some((f) => /PHX-CITE-7/.test(f)), "PHX-CITE-7 ignored the anchoring target");
  for (const s of [anchor, usage]) writeFileSync(s.path, s.before);
  assert.deepEqual(run().findings, []);
});

// ----------------------------------------------------- B. coordinate-side
// Each mutation names one coordinate uniquely, so a matcher that stops parsing
// that separator shape fails here instead of going quietly green. Both forms
// below were measured GREEN under an earlier matcher while the success line
// claimed every cross-file coordinate was resolved.
for (const [id, rel, from, to, expected] of [
  [
    "em-dash separator before the §-number",
    ROLE,
    "`harness/session-bootstrap.md` — §6.3 (Critic variant).",
    "`harness/session-bootstrap.md` — §99.9 (Critic variant).",
    /PHX-CITE-8 SECTION-MISSING.*§99\.9/,
  ],
  [
    "parenthesised title after the §-number",
    SKILL,
    "`harness/review-protocol.md` §2.1 (*Trigger decision table*)",
    "`harness/review-protocol.md` §2.1 (*Bogus decision table*)",
    /PHX-CITE-8 TITLE-MISMATCH.*Bogus decision table/,
  ],
  [
    "title-only coordinate with an em-dash separator",
    PROTOCOL,
    "`README.md` — *Acknowledgments*",
    "`README.md` — *Bogus section*",
    /PHX-CITE-8 HEADING-MISSING.*Bogus section/,
  ],
]) {
  check(`a bogus ${id} is caught`, () => {
    const snap = mutate(rel, from, to);
    const broken = run();
    assert.ok(
      broken.findings.some((f) => expected.test(f)),
      `expected a finding matching ${expected}; got:\n  ${broken.findings.join("\n  ") || "(none)"}`,
    );
    writeFileSync(snap.path, snap.before);
    assert.deepEqual(run().findings, []);
  });
}

// ------------------------------------------------------- C. no narrowing
/**
 * The matcher in force before the coordinate forms above were added. Kept
 * verbatim so the corpus can only grow: closing a coverage gap by dropping
 * citations from the matcher is the failure mode this pins.
 */
const PRIOR_MATCHER = /`?((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md)`?\s*§(\d+(?:\.\d+)*)(?:\s*,\s*\*([^*]+)\*)?/g;

check("every §-coordinate the earlier matcher found is still found (corpus never shrinks)", () => {
  const key = (m) => `${m[1]} §${m[2]}`;
  for (const rel of [PROTOCOL, ROLE, SKILL]) {
    const doc = readFileSync(join(ROOT, rel), "utf8");
    const now = new Set([...doc.matchAll(COORDINATE_RE)].filter((m) => m[2]).map(key));
    for (const m of doc.matchAll(PRIOR_MATCHER)) {
      assert.ok(now.has(key(m)), `${rel}: coordinate ${key(m)} was resolved before and is not resolved now`);
    }
  }
});

check("the matcher covers strictly more than it did: both repaired forms are new", () => {
  // roles/critic.md cites session-bootstrap §6.3 twice — once plainly, once
  // behind an em-dash. The earlier matcher saw one of the two; that second,
  // unseen coordinate could be renumbered to anything and stay green.
  const role = readFileSync(join(ROOT, ROLE), "utf8");
  const bootstrap = (re) => [...role.matchAll(re)].filter((m) => /session-bootstrap/.test(m[1]) && m[2] === "6.3").length;
  assert.equal(bootstrap(PRIOR_MATCHER), 1, "the earlier matcher's blind spot is no longer reproducible from this file");
  assert.equal(bootstrap(COORDINATE_RE), 2, "the em-dash coordinate in roles/critic.md is still not matched");

  // SKILL.md cites the same section twice — `§2.1, *Title*` and `§2.1 (*Title*)`.
  // The earlier matcher captured the title of the first only.
  const skill = readFileSync(join(ROOT, SKILL), "utf8");
  const titled = (re) => [...skill.matchAll(re)].filter((m) => m[2] === "2.1" && /Trigger decision table/.test(m[3] ?? "")).length;
  assert.equal(titled(PRIOR_MATCHER), 1, "the earlier matcher's title blind spot is no longer reproducible from this file");
  assert.equal(titled(COORDINATE_RE), 2, "the parenthesised title in SKILL.md is still not captured");
});

// ------------------------------------------------------ D. success line
check("the success line reports measured coverage and names its blind spots", () => {
  const real = checkCriticContractCitations();
  const text = successLine(real);
  assert.ok(real.coverage.coordinatesResolved > 0, "no coordinates resolved at all");
  assert.ok(text.includes(String(real.coverage.coordinatesResolved)), "the resolved count is not reported");
  assert.ok(/NOT checked:/.test(text), "the success line names no blind spots (QG-05)");
  assert.ok(/rule-ID/.test(text), "the rule-ID exception is not named");
  assert.ok(
    !/every cited target contains its cited content \(8 citation classes checked\)/.test(text),
    "the unqualified completeness claim is back",
  );
});

check("the success line's coverage count tracks the corpus rather than a constant", () => {
  const before = run().coverage.coordinatesResolved;
  const snap = mutate(ROLE, "`harness/session-bootstrap.md` — §6.3 (Critic variant).", "the bootstrap protocol's Critic variant.");
  const after = run().coverage.coordinatesResolved;
  writeFileSync(snap.path, snap.before);
  assert.equal(after, before - 1, "removing one coordinate did not lower the reported count");
  assert.equal(run().coverage.coordinatesResolved, before);
});

rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`# ${passed} checks passed\n`);
