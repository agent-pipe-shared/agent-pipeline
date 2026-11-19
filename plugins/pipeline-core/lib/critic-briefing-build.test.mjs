// SPDX-License-Identifier: SUL-1.0
/**
 * C31-M9 (lane L3 part two, AC-112 binding): the Critic briefing carries ONE derived whole-line hint, "risks without behaviour: <ids>; ...".
 * Derived on read from the Spec through inspectSpecRiskTrace, never stored, never a gate: the line is absent when there is no table,
 * no untraced row, or the Spec cannot be read, and it carries only the ids and the fixed sentence, never Spec prose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCriticBriefings } from "./critic-briefing-build.mjs";
import { dispatchFindings } from "./dispatch-policy.mjs";

const VENDORED_URL = new URL("../templates/prompts/critic-review.md", import.meta.url);
const CANONICAL_URL = new URL("../../../templates/prompts/critic-review.md", import.meta.url);
const TEMPLATE = readFileSync(fileURLToPath(VENDORED_URL), "utf8");
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const SPEC_PATH = "specs/demo/spec.md";
const SENTENCE = "inspect whether the delivered behaviour or a stated residual covers each";

const preflight = () => ({
  status: "packet-ready",
  admitRequest: { trigger: "T1" },
  dispatch: { reviewerInput: { baseCommit: BASE, candidateCommit: HEAD, rulesetSha: "c".repeat(64), specPath: SPEC_PATH } },
});

function table(rows) {
  return ["| id | source | statement | trace |", "|---|---|---|---|", ...rows.map((cells) => `| ${cells.join(" | ")} |`)].join("\n");
}

/** A temp project root holding the Spec text (null = no Spec file), one covered test file and one backlog item. */
function projectRoot(specText) {
  const root = mkdtempSync(join(tmpdir(), "cbb-risk-"));
  mkdirSync(join(root, "specs", "demo"), { recursive: true });
  mkdirSync(join(root, "backlog", "items"), { recursive: true });
  writeFileSync(join(root, "demo.test.mjs"), "// covered\n");
  writeFileSync(join(root, "backlog", "items", "known-residual.md"), "# item\n");
  if (specText !== null) writeFileSync(join(root, SPEC_PATH), specText);
  return root;
}

function briefing(root, { runner = "claude", spec } = {}) {
  const input = preflight();
  if (spec !== undefined) input.dispatch.reviewerInput.specPath = spec;
  return renderCriticBriefings({ preflight: input, templateText: TEMPLATE, commits: [BASE, HEAD], runner, root, projectName: "p" }).briefings[0].text;
}

const hintLines = (text) => text.split("\n").filter((line) => /risks without behaviour/iu.test(line));
const withRoot = (specText, run) => { const root = projectRoot(specText); try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); } };

test("a Spec with an untraced risk row yields one hint line naming only that id", () => {
  const spec = `# Spec\n\n${table([
    ["R-1", "PRD", "Deleted browser data PRIVATE-PROSE-ONE is accepted", ""],
    ["R-2", "PRD", "Covered statement", "demo.test.mjs"],
    ["R-3", "PRD", "Residual statement", "residual: backlog/items/known-residual.md"],
    ["R-4", "PRD", "Stale statement", "missing.test.mjs"],
    ["R-5", "PRD", "Malformed statement", "some prose"],
    ["R-6", "PRD", "Not applicable statement", "not-applicable: platform-only"],
    ["R-7", "PRD", "Placeholder statement", "<test path or residual>"],
  ])}\n`;
  const text = withRoot(spec, (root) => briefing(root));
  assert.deepEqual(hintLines(text), [`- risks without behaviour: R-1, R-7; ${SENTENCE}`]);
  for (const forbidden of ["PRIVATE-PROSE-ONE", "R-2", "R-3", "R-4", "R-5", "R-6", "Deleted browser data"]) {
    assert.equal(text.includes(forbidden), false, `the briefing never carries ${forbidden}`);
  }
  assert.equal(/\{\{|RISKS_WITHOUT_BEHAVIOUR_LINE/u.test(text), false, "no placeholder is left behind");
});

test("the rendered hint trips none of the dispatch-side contamination checks", () => {
  const spec = `# Spec\n\n${table([["R-1", "PRD", "x", ""]])}\n`;
  const text = withRoot(spec, (root) => briefing(root));
  assert.equal(hintLines(text).length, 1);
  const contamination = dispatchFindings({ subagentType: "critic", prompt: text }).findings.filter((finding) => finding.code.startsWith("DISPATCH-CONTAMINATION-"));
  assert.deepEqual(contamination, []);
});

test("no table, or only covered, residual-stated and not-applicable rows, yields no hint line", () => {
  const covered = `# Spec\n\n${table([["R-1", "PRD", "x", "demo.test.mjs"], ["R-2", "PRD", "y", "residual: backlog/items/known-residual.md"], ["R-3", "PRD", "z", "not-applicable: reason"]])}\n`;
  const noTable = "# Spec\n\nNo risk table here.\n";
  const none = withRoot(noTable, (root) => briefing(root));
  const allCovered = withRoot(covered, (root) => briefing(root));
  assert.deepEqual(hintLines(none), []);
  assert.deepEqual(hintLines(allCovered), []);
  assert.equal(allCovered, none, "a fully traced table leaves the briefing byte-identical to one without a table");
});

test("a stale or malformed row alone yields no hint line (only the reader's untraced rows are listed)", () => {
  const spec = `# Spec\n\n${table([["R-1", "PRD", "x", "missing.test.mjs"], ["R-2", "PRD", "y", "prose"]])}\n`;
  assert.deepEqual(hintLines(withRoot(spec, (root) => briefing(root))), []);
});

test("the briefing for a Spec the reader cannot read is unchanged", () => {
  const untraced = `${table([["R-1", "PRD", "x", ""]])}\n`;
  const baseline = withRoot("# Spec\n", (root) => briefing(root));
  assert.equal(withRoot(null, (root) => briefing(root)), baseline, "missing Spec file");
  const noRoot = renderCriticBriefings({ preflight: preflight(), templateText: TEMPLATE, commits: [BASE, HEAD], runner: "claude", root: null, projectName: "p" }).briefings[0].text;
  assert.equal(noRoot, baseline, "no project root, nothing to read");
  // A Spec path that leaves the root, or names a directory, is never read, whatever the outside file holds.
  const outer = mkdtempSync(join(tmpdir(), "cbb-outer-"));
  try {
    const root = join(outer, "root");
    mkdirSync(join(root, "specs", "demo"), { recursive: true });
    writeFileSync(join(outer, "spec.md"), untraced);
    const escaping = briefing(root, { spec: "../spec.md" });
    assert.deepEqual(hintLines(escaping), [], "a Spec path leaving the root is not read");
    assert.deepEqual(hintLines(briefing(root, { spec: "specs/demo" })), [], "a Spec path that is a directory is not readable");
    writeFileSync(join(outer, "spec.md"), "# Spec\n");
    assert.equal(briefing(root, { spec: "../spec.md" }), escaping, "the escaping path yields the same briefing whatever the outside file holds");
  } finally { rmSync(outer, { recursive: true, force: true }); }
});

test("the hint is the same for the Codex carrier and is absent from the Antigravity paths-only envelope", () => {
  const spec = `# Spec\n\n${table([["R-1", "PRD", "x", ""]])}\n`;
  const root = projectRoot(spec);
  try {
    assert.deepEqual(hintLines(briefing(root, { runner: "codex" })), [`- risks without behaviour: R-1; ${SENTENCE}`]);
    const withSpec = briefing(root, { runner: "antigravity" });
    writeFileSync(join(root, SPEC_PATH), "# Spec\n");
    const without = briefing(root, { runner: "antigravity" });
    assert.deepEqual(hintLines(withSpec), []);
    assert.equal(withSpec, without, "the envelope does not depend on the Spec text");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a template without the hint line is refused with the template-shape code, like the other whole-line slots", () => {
  const stripped = TEMPLATE.replace(/^- \{\{RISKS_WITHOUT_BEHAVIOUR_LINE:[^}]*\}\}\n/mu, "");
  assert.ok(stripped !== TEMPLATE, "the template carries the line");
  assert.throws(() => renderCriticBriefings({ preflight: preflight(), templateText: stripped, commits: [BASE, HEAD], runner: "claude", root: null, projectName: "p" }), { code: "CBB-TEMPLATE-MARKER" });
});

test("the vendored template copy stays byte-identical to the canonical one", () => {
  assert.equal(readFileSync(fileURLToPath(VENDORED_URL), "utf8"), readFileSync(fileURLToPath(CANONICAL_URL), "utf8"));
});
