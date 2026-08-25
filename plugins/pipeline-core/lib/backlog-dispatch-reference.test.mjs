#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKLOG_STRIP_FENCE,
  stripBacklogItemForDispatch,
  stripBacklogVerdictProse,
} from "./backlog-dispatch-reference.mjs";

const FRONTMATTER = "---\nschema: pipeline.backlog-item.v1\nid: pipeline.example\ntype: defect\nowner: pipeline\nstatus: open\ncreated: 2026-08-18\nsource: test\n---\n";

test("stripBacklogVerdictProse leaves untriaged content unchanged", () => {
  const body = "\n# Title\n\n## Description\n\nSomething happened.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, false);
  assert.equal(result.removedHeading, null);
  assert.equal(result.text, body);
});

test("stripBacklogVerdictProse removes a Triage section and everything below it", () => {
  const body = "\n# Title\n\n## Description\n\nSomething happened.\n\n## Triage (filled in by the Elephant)\n\n- **Decision:** rejected\n- **Rationale:** the prior Critic found this unfounded.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "triage");
  assert.ok(result.text.includes("## Description"));
  assert.ok(result.text.includes("Something happened."));
  assert.ok(!result.text.includes("Decision:"));
  assert.ok(!result.text.includes("prior Critic found this unfounded"));
  assert.ok(result.text.includes(BACKLOG_STRIP_FENCE));
});

test("stripBacklogVerdictProse strips from the EARLIEST verdict-shaped heading, covering an appended Closure/PO-decision section after Triage", () => {
  const body = "\n## Description\n\nD.\n\n## Triage\n\n- **Decision:** accepted\n\n### PO-decision implementation, 2026-08-18\n\nImplemented X, see commit abc123.\n\n## Closure\n\nDone.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "triage");
  assert.ok(!result.text.includes("PO-decision implementation"));
  assert.ok(!result.text.includes("Done."));
  assert.ok(!result.text.includes("abc123"));
});

test("stripBacklogVerdictProse matches heading level and case insensitively", () => {
  const body = "\n## Description\n\nD.\n\n### CLOSURE\n\nc.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "closure");
});

test("stripBacklogVerdictProse rejects a non-string body", () => {
  assert.throws(() => stripBacklogVerdictProse(null), TypeError);
});

test("stripBacklogVerdictProse strips only Triage's own body, preserving a later non-verdict decision section (2026-08-25 regression)", () => {
  // Mirrors the real-world sequence found on
  // backlog/items/2026-08-21-enforce-kickoff-po-questions.md: a "## Triage"
  // section followed by later, differently-named PO-decision sections that
  // are spec content, not verdict prose.
  const body =
    "\n## Description\n\nD.\n\n## Triage (filled in by the Elephant)\n\n" +
    "- **Decision:** deferred\n- **Rationale:** r.\n\n" +
    "## Design direction decided, 2026-08-24 (PO scoping conversation)\n\n" +
    "The PO scoped this directly.\n\n" +
    "## Mode decided, 2026-08-25 (PO decision)\n\nMode X.\n\n" +
    "## Option picked, 2026-08-25 (PO decision)\n\nOption Y.\n\n" +
    "## Scope widened, 2026-08-25 (PO clarification, chat)\n\nWidened.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "triage");
  assert.ok(result.text.includes("## Description"));
  assert.ok(!result.text.includes("**Decision:** deferred"));
  assert.ok(result.text.includes("## Design direction decided, 2026-08-24"));
  assert.ok(result.text.includes("The PO scoped this directly."));
  assert.ok(result.text.includes("## Mode decided, 2026-08-25"));
  assert.ok(result.text.includes("Mode X."));
  assert.ok(result.text.includes("## Option picked, 2026-08-25"));
  assert.ok(result.text.includes("Option Y."));
  assert.ok(result.text.includes("## Scope widened, 2026-08-25"));
  assert.ok(result.text.includes("Widened."));
});

test("stripBacklogVerdictProse strips a later, independently verdict-shaped Closure section too while keeping an in-between non-verdict section", () => {
  const body =
    "\n## Description\n\nD.\n\n## Triage\n\n- **Decision:** accepted\n\n" +
    "## Design direction decided\n\nkept content.\n\n" +
    "## Closure\n\nDone.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "triage");
  assert.ok(!result.text.includes("**Decision:** accepted"));
  assert.ok(result.text.includes("## Design direction decided"));
  assert.ok(result.text.includes("kept content."));
  assert.ok(!result.text.includes("Done."));
});

test("stripBacklogVerdictProse does not treat a '#'-prefixed line inside a fenced code block as a section boundary", () => {
  const body =
    "\n## Description\n\nD.\n\n## Triage\n\n" +
    "- **Decision:** accepted\n\n```\n# not a heading, a shell comment\n" +
    "echo hi\n```\n\nstill Triage prose after the fence.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.ok(!result.text.includes("not a heading"));
  assert.ok(!result.text.includes("still Triage prose after the fence"));
});

test("stripBacklogItemForDispatch preserves frontmatter and strips the body's verdict prose", () => {
  const raw = `${FRONTMATTER}\n# Title\n\n## Description\n\nD.\n\n## Triage\n\n- **Decision:** accepted\n`;
  const result = stripBacklogItemForDispatch(raw);
  assert.equal(result.wasStripped, true);
  assert.ok(result.text.startsWith(FRONTMATTER));
  assert.ok(result.text.includes("## Description"));
  assert.ok(!result.text.includes("Decision:"));
  assert.ok(result.text.includes(BACKLOG_STRIP_FENCE));
});

test("stripBacklogItemForDispatch is a pure function that never mutates its input", () => {
  const raw = `${FRONTMATTER}\n## Triage\n\n- **Decision:** accepted\n`;
  const copy = `${raw}`;
  stripBacklogItemForDispatch(raw);
  assert.equal(raw, copy);
});

test("stripBacklogItemForDispatch rejects text with no frontmatter", () => {
  assert.throws(() => stripBacklogItemForDispatch("# Title\n\nno frontmatter here\n"), /frontmatter/);
});

test("stripBacklogItemForDispatch rejects an unterminated frontmatter block", () => {
  assert.throws(() => stripBacklogItemForDispatch("---\nschema: x\n"), /closing delimiter/);
});
