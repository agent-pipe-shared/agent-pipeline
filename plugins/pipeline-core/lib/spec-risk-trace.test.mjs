// SPDX-License-Identifier: SUL-1.0
// AC-112 (candidate 30k, lane K16, stage S1 of the accepted-risk trace plan): a pure reader derives, per row of one closed Spec table, whether an
// accepted risk is covered / residual-stated / not-applicable / untraced / stale / malformed. The cases come from the plan's failing-first list
// (specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md, stage S1), not from the reader. Nothing is stored, run or fetched.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectSpecRiskTrace, RISK_TRACE_HEADER } from "./spec-risk-trace.mjs";
import * as reader from "./spec-risk-trace.mjs";

const TEST_FILE = "plugins/pipeline-core/lib/x.test.mjs";
const BACKLOG = "backlog/items/2026-11-18-some-residual.md";
const present = (...paths) => ({ exists: (rel) => new Set(paths).has(rel) });
const table = (...rows) => ["| id | source | statement | trace |", "|---|---|---|---|", ...rows.map((r) => `| ${r} |`)].join("\n");
const spec = (...parts) => `# Spec\n\nSome text.\n\n${parts.join("\n")}\n\n## Next\n`;
const byId = (result) => Object.fromEntries(result.rows.map((r) => [r.id, r.status]));

test("AC-112 S1: the closed table header is one exported marker", () => {
  assert.equal(RISK_TRACE_HEADER, "| id | source | statement | trace |");
});

test("AC-112 S1: a covered row (the named test path resolves) and a residual row (the named backlog item exists)", () => {
  const result = inspectSpecRiskTrace(spec(table(`R-1 | PRD risks | a thing breaks | ${TEST_FILE}`, `R-2 | PRD risks | a gap we accept | residual: ${BACKLOG}`)), present(TEST_FILE, BACKLOG));
  assert.equal(result.status, "applicable");
  assert.deepEqual(byId(result), { "R-1": "covered", "R-2": "residual-stated" });
  assert.deepEqual(result.open, []);
  assert.equal(result.rows[0].trace, TEST_FILE);
});

test("AC-112 S1: an untraced row (the trace cell is empty or names nothing)", () => {
  const result = inspectSpecRiskTrace(spec(table("R-1 | PRD | s |  ", "R-2 | PRD | s | <test path> ", "R-3 | PRD | s | {{trace}}", "R-4 | PRD | s | not-applicable: ", "R-5 | PRD | s | residual:")), present());
  assert.deepEqual(byId(result), { "R-1": "untraced", "R-2": "untraced", "R-3": "untraced", "R-4": "untraced", "R-5": "untraced" });
  assert.deepEqual(result.open, ["R-1", "R-2", "R-3", "R-4", "R-5"]);
});

test("AC-112 S1: a stale row (a named path or backlog item no longer exists)", () => {
  const result = inspectSpecRiskTrace(spec(table(`R-1 | PRD | s | ${TEST_FILE}`, `R-2 | PRD | s | residual: ${BACKLOG}`)), present());
  assert.deepEqual(byId(result), { "R-1": "stale", "R-2": "stale" });
  assert.deepEqual(result.open, ["R-1", "R-2"]);
});

test("AC-112 S1: a malformed row (the trace fits no form, a bad shape, a duplicate id) is reported, never thrown", () => {
  const result = inspectSpecRiskTrace(spec(table(
    "R-1 | PRD | s | see the PRD",
    "R-2 | PRD | s | ../outside.test.mjs",
    "R-3 | PRD | s | /abs/x.test.mjs",
    "R-4 | PRD | s | residual: docs/state.md",
    "R-5 | PRD | s",
    "bad id | PRD | s | x.test.mjs",
    `R-6 | PRD | s | ${TEST_FILE}`,
    `R-6 | PRD | s | ${TEST_FILE}`,
  )), present(TEST_FILE, "docs/state.md"));
  assert.deepEqual(result.rows.map((r) => r.status), ["malformed", "malformed", "malformed", "malformed", "malformed", "malformed", "covered", "malformed"]);
  assert.ok(result.rows.every((r) => r.status === "covered" || typeof r.reason === "string" && r.reason !== ""));
  assert.deepEqual(result.open, ["R-1", "R-2", "R-3", "R-4", "R-5", "bad id", "R-6"]);
});

test("AC-112 S1: a not-applicable row carries its reason and is traced", () => {
  const result = inspectSpecRiskTrace(spec(table("R-1 | PRD | s | not-applicable: the runner never offers this")), present());
  assert.deepEqual(byId(result), { "R-1": "not-applicable" });
  assert.deepEqual(result.open, []);
});

test("AC-112 S1: a command:<id> row is covered by form; a supplied registry decides stale", () => {
  const text = spec(table("R-1 | PRD | s | command:verify-all"));
  assert.deepEqual(byId(inspectSpecRiskTrace(text, present())), { "R-1": "covered" });
  assert.deepEqual(byId(inspectSpecRiskTrace(text, { ...present(), isCommandRegistered: (id) => id === "verify-all" })), { "R-1": "covered" });
  assert.deepEqual(byId(inspectSpecRiskTrace(text, { ...present(), isCommandRegistered: () => false })), { "R-1": "stale" });
});

test("AC-112 S1: no table at all is not-applicable, never missing; a header-only table traces nothing", () => {
  assert.deepEqual(inspectSpecRiskTrace("# Spec\n\nno risk table here\n", present()), { status: "not-applicable", rows: [], open: [] });
  assert.deepEqual(inspectSpecRiskTrace("", present()).status, "not-applicable");
  assert.equal(inspectSpecRiskTrace(spec(table()), present()).status, "not-applicable");
  // A table with another header is not this table.
  assert.equal(inspectSpecRiskTrace(spec("| id | what | test |", "|---|---|---|", "| R-1 | a | b |"), present()).status, "not-applicable");
});

test("AC-112 S1: a table inside a fenced block is ignored, the real table beside it is read", () => {
  const fenced = ["```", table(`F-1 | PRD | s | ${TEST_FILE}`), "```"].join("\n");
  assert.equal(inspectSpecRiskTrace(spec(fenced), present()).status, "not-applicable");
  assert.equal(inspectSpecRiskTrace(spec(["~~~md", table("F-1 | PRD | s | x"), "~~~"].join("\n")), present()).status, "not-applicable");
  assert.equal(inspectSpecRiskTrace(spec(["````", "```", table("F-1 | PRD | s | x"), "```", "````"].join("\n")), present()).status, "not-applicable", "a longer fence is not closed by a shorter one");
  const both = inspectSpecRiskTrace(spec(fenced, "", table(`R-1 | PRD | s | ${TEST_FILE}`)), present(TEST_FILE));
  assert.deepEqual(byId(both), { "R-1": "covered" });
});

test("AC-112 S1: the table ends at its first non-table line; backticks and escaped pipes in cells are read", () => {
  const text = spec(table(`R-1 | PRD | a \\| b | \`${TEST_FILE}\``), "", "| other | table | here | x |", "|---|---|---|---|", "| R-9 | a | b | c |");
  const result = inspectSpecRiskTrace(text, present(TEST_FILE));
  assert.deepEqual(byId(result), { "R-1": "covered" });
});

test("AC-112 S1: the reader never claims what it cannot read, is pure, and leaves its input alone", () => {
  assert.throws(() => inspectSpecRiskTrace(spec(table(`R-1 | PRD | s | ${TEST_FILE}`)), {}), /exists/u);
  assert.throws(() => inspectSpecRiskTrace(spec(table(`R-1 | PRD | s | ${TEST_FILE}`)), { exists: () => { throw new Error("boom"); } }), /boom/u);
  // No path row, so no read is needed: the absent reader is not asked.
  assert.deepEqual(byId(inspectSpecRiskTrace(spec(table("R-1 | PRD | s | not-applicable: n/a")), {})), { "R-1": "not-applicable" });
  const text = spec(table(`R-1 | PRD | s | ${TEST_FILE}`));
  const frozen = Object.freeze({ exists: () => true });
  assert.deepEqual(inspectSpecRiskTrace(text, frozen), inspectSpecRiskTrace(text, frozen));
});

// AC-112 stage S3 (candidate 31, lane L3): the template texts quote the reader's own constants, so a text and the reader cannot drift. The cases come from
// the plan's stage S3 row (the Spec template gets the table skeleton, the PRD template an "Assumptions" line, the readiness reviewer ONE question),
// never from the texts. Text only: no gate, no stored status.
const root = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

test("AC-112 S3: the accepted trace forms are one exported list the reader's malformed reason quotes", () => {
  assert.deepEqual(reader.RISK_TRACE_FORMS, ["a test path", "command:<id>", "residual: backlog/items/<item>.md", "not-applicable: <reason>"]);
  const malformed = inspectSpecRiskTrace(spec(table("R-1 | PRD | s | see the PRD")), present());
  assert.equal(malformed.rows[0].reason, `the trace is none of: ${reader.RISK_TRACE_FORMS.join(", ")}`);
});

test("AC-112 S3: the Spec template carries the table skeleton the reader recognises, with the reader's header and forms", () => {
  const text = root("templates/spec.md");
  assert.ok(text.includes(RISK_TRACE_HEADER), "the template quotes the reader's header marker");
  for (const form of reader.RISK_TRACE_FORMS) assert.ok(text.includes(form), `the template names the trace form: ${form}`);
  const read = inspectSpecRiskTrace(text, present());
  assert.equal(read.status, "applicable", "the reader finds the skeleton as a closed table outside a fence");
  assert.ok(read.rows.length >= 1 && read.rows.every((row) => row.status === "untraced"), "an unfilled skeleton row reads untraced, never malformed");
});

test("AC-112 S3: the PRD template has an Assumptions line that points to the Spec table by the reader's header", () => {
  const text = root("templates/prd.md");
  assert.match(text, /^## Assumptions\b/mu);
  assert.equal(count(text, RISK_TRACE_HEADER), 1, "one technical line names the Spec table");
  assert.ok(text.indexOf("## Assumptions") < text.indexOf("## Alternatives considered"), "it sits with Non-goals and Risks, before the alternatives");
});

test("AC-112 S3: the readiness reviewer asks exactly ONE question about untraced accepted risks, never a block, inside its delta contract", () => {
  const text = root("plugins/pipeline-core/agents/readiness-reviewer.md");
  assert.equal(count(text, RISK_TRACE_HEADER), 1, "exactly one place names the risk table");
  const paragraph = text.split(/\n\n/u).find((block) => block.includes(RISK_TRACE_HEADER)) ?? "";
  for (const form of reader.RISK_TRACE_FORMS) assert.ok(paragraph.includes(form), `the question names the trace form: ${form}`);
  assert.match(paragraph, /question/u);
  assert.match(paragraph, /never a block/u);
  assert.match(paragraph, /full round/u);
  assert.match(paragraph, /delta round/u, "the delta contract: asked again only when the correction changed the table");
  assert.equal(count(text.slice(0, text.indexOf("## What to check")), RISK_TRACE_HEADER), 0, "the blocking-finding definition is unchanged");
});
