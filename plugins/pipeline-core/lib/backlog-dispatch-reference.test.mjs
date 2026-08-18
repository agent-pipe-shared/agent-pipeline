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
