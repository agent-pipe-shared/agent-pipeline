// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.design-trailer-verifier-lost-after-closure (ALF-C-P1-14, AC-156).
 *
 * Original acceptance (backlog/items/2026-10-04-design-trailer-verifier-lost-after-closure.md):
 *   A. The trailer grammar is fixed in one place; the `design (elephant)` form is either admitted
 *      and verified, or removed from every printed example and generator.
 *   B. A merge-survival check compares code needles of closed items against HEAD and fails when a
 *      needle disappears.
 *   (The "identify the dropping merge" point is a one-off forensic act, not a code property.)
 *
 * Decision pinned here (PO T12, as for the sibling trailer item): NO design-trailer verifier
 * remains. The single direct-Elephant form is `stage-0 (elephant)`. This pin proves the removal
 * is complete and the stage-0 route stays admitted. Nothing is mocked: the real policy module,
 * the real source tree and the real done_when predicate evaluator are exercised.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { commitMessageFindings, finishedCommitMessageFindings } from "../commit-message-policy.mjs";
import { checkBacklogDonePredicate, evaluateDoneWhen, exitCodeFor, parseDoneWhen } from "../../scripts/check-backlog-done-predicate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
// Built by concatenation so this file never contains the needles it hunts for.
const LOST_SYMBOL = ["ELEPHANT", "DESIGN", "ID"].join("_");
const REJECTED_FORM = ["design", "(elephant)"].join(" ");

const msg = (dispatch) => `feat(x): change\n\nBody.\n\nAI-Assisted: true\nDispatch: ${dispatch}`;
const codes = (message) =>
  finishedCommitMessageFindings(message, { requireMarker: true, requireDispatch: true }).findings.map((f) => f.code);

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(?:mjs|js|json|md|ps1|sh)$/u.test(entry.name) && !/\.test\.mjs$/u.test(entry.name)) out.push(full);
  }
  return out;
}

test("AC-A1: the stage-0 Elephant route stays admitted (finished message)", () => {
  assert.deepEqual(codes(msg("stage-0 (elephant)")), []);
});

test("AC-A2: the design (elephant) form is rejected as a malformed Dispatch binding", () => {
  assert.deepEqual(codes(msg(REJECTED_FORM)), ["GIT-03-DISPATCH-MALFORMED"]);
});

test("AC-A3: the same verdicts hold through the --trailer commit lane", () => {
  const run = (value) => commitMessageFindings(
    `git commit -m "fix(y): tidy up" --trailer "AI-Assisted: true" --trailer "Dispatch: ${value}"`,
    { readFile: () => { throw new Error("no file expected"); }, requireMarker: true, requireDispatch: true },
  );
  const ok = run("stage-0 (elephant)");
  assert.equal(ok.inspected, true);
  assert.deepEqual(ok.findings, []);
  const bad = run(REJECTED_FORM);
  assert.deepEqual(bad.findings.map((f) => f.code), ["GIT-03-DISPATCH-MALFORMED"]);
});

test("AC-A4: no non-test source, generator or printed template emits or requires the lost form", () => {
  const roots = ["plugins/pipeline-core", "harness", "templates", "roles", "guardrails", "policies"].map((p) => join(ROOT, p));
  const offenders = [];
  let scanned = 0;
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      scanned += 1;
      const text = readFileSync(file, "utf8");
      if (text.includes(LOST_SYMBOL) || text.includes(REJECTED_FORM)) offenders.push(file.slice(ROOT.length + 1));
    }
  }
  assert.ok(scanned > 100, `scan must cover the real tree (scanned ${scanned})`);
  assert.deepEqual(offenders, []);
});

test("AC-A5: the printed agent obligations document the single stage-0 form and no separate design form", () => {
  const text = readFileSync(join(ROOT, "templates/prompts/agent-obligations.md"), "utf8");
  assert.ok(text.includes("Dispatch: stage-0 (elephant)"));
  assert.ok(text.includes("There is no separate design-phase trailer form."));
});

test("AC-B1: the done_when `contains` predicate is the merge-survival needle check and fails when a needle disappears", () => {
  const scratch = join(ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const fixtureRoot = mkdtempSync(join(scratch, "design-trailer-survival-"));
  try {
    mkdirSync(join(fixtureRoot, "lib"), { recursive: true });
    const target = join(fixtureRoot, "lib", "verifier.mjs");
    const parsed = parseDoneWhen("contains lib/verifier.mjs export const NEEDLE_SYMBOL");
    assert.equal(parsed.malformed, undefined);
    writeFileSync(target, "export const NEEDLE_SYMBOL = 1;\n");
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, true);
    // A merge/import drops the needle: the same predicate must now fail.
    writeFileSync(target, "export const OTHER = 1;\n");
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, false);
    // File vanishing entirely also fails.
    rmSync(target);
    assert.equal(evaluateDoneWhen(parsed, { root: fixtureRoot }).satisfied, false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("AC-B2: the all-items sweep reports a REGRESSION when a closed item's needle vanishes, and passes while it survives", () => {
  const scratch = join(ROOT, "scratch");
  mkdirSync(scratch, { recursive: true });
  const fixtureRoot = mkdtempSync(join(scratch, "design-trailer-sweep-"));
  try {
    mkdirSync(join(fixtureRoot, "backlog", "items"), { recursive: true });
    mkdirSync(join(fixtureRoot, "lib"), { recursive: true });
    const item = (id, status, doneWhen) =>
      `---\nschema: pipeline.backlog-item.v1\nid: ${id}\ntype: defect\nowner: pipeline\nstatus: ${status}\ncreated: 2026-10-04\nsource: "fixture"\nsprint: alfred\ndone_when: ${doneWhen}\n---\n\n# ${id}\n`;
    writeFileSync(join(fixtureRoot, "backlog", "items", "2026-10-04-closed-a.md"), item("p.a", "closed", '"contains lib/a.mjs export const KEPT_A"'));
    writeFileSync(join(fixtureRoot, "backlog", "items", "2026-10-04-closed-b.md"), item("p.b", "closed", '"contains lib/b.mjs export const LOST_B"'));
    writeFileSync(join(fixtureRoot, "lib", "a.mjs"), "export const KEPT_A = 1;\n");
    writeFileSync(join(fixtureRoot, "lib", "b.mjs"), "export const LOST_B = 1;\n");
    const intact = checkBacklogDonePredicate(fixtureRoot);
    assert.equal(intact.total, 2);
    assert.equal(intact.ok, true);
    assert.deepEqual(intact.regressionItems, []);
    // A merge drops one closed item's needle: the sweep must fail naming exactly that item.
    writeFileSync(join(fixtureRoot, "lib", "b.mjs"), "export const OTHER = 1;\n");
    const dropped = checkBacklogDonePredicate(fixtureRoot);
    assert.equal(dropped.ok, false);
    assert.equal(exitCodeFor(dropped), 1);
    assert.deepEqual(dropped.regressionItems, ["backlog/items/2026-10-04-closed-b.md"]);
    // A vanished file fails the other item too.
    rmSync(join(fixtureRoot, "lib", "a.mjs"));
    assert.equal(checkBacklogDonePredicate(fixtureRoot).regression, 2);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// Closed items whose needle was ALREADY gone when this sweep was first run against HEAD
// (2026-10-16). They are real merge-survival losses, tracked as open functional work, not
// exemptions: the ratchet below tolerates only these and fails on any NEW disappearance.
const KNOWN_LOST_AT_FIRST_SWEEP = new Set([
  "backlog/items/2026-08-28-a-heredoc-refusal-teaches-no-substitute.md",
  "backlog/items/2026-08-28-the-guards-root-admission-compares-a-typed-path-to-a-realpathed-one.md",
  "backlog/items/2026-08-29-approve-announce-test-fixture-missing-present-plan-step.md",
  "backlog/items/2026-08-29-scratch-write-exemption-does-not-cover-restart-required.md",
  "backlog/items/2026-09-03-the-unparsed-command-lane-still-carries-the-false-denial-claim.md",
]);

test("AC-B3: the sweep over the real backlog at HEAD evaluates closed items and no closed item loses a needle beyond the recorded set", () => {
  const result = checkBacklogDonePredicate(ROOT);
  assert.notEqual(result.usageError, true);
  assert.ok(result.total > 100, `sweep must enumerate the real backlog (total ${result.total})`);
  assert.equal(result.malformed, 0, result.findings.join("\n"));
  const closedMachine = result.total - result.undeclared;
  assert.ok(closedMachine > 50, `sweep must evaluate declared predicates (declared ${closedMachine})`);
  const newLosses = result.regressionItems.filter((p) => !KNOWN_LOST_AT_FIRST_SWEEP.has(p));
  assert.deepEqual(newLosses, [], `closed items lost their needle at HEAD:\n${result.findings.join("\n")}`);
});
