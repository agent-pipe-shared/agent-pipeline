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

// 2026-09-06 regression coverage: backlog/items/2026-09-06-backlog-item-
// strip-for-dispatch-does-not-remove-a-resolution-section.md. Three shapes
// this script was found to miss entirely (confirmed live against real,
// already-committed backlog items before this fix): a "## Resolution"
// heading, a "## Progress note (...)" heading whose content is verdict-
// shaped, and a verdict-shaped bold inline marker introduced by no heading
// at all.

test("stripBacklogVerdictProse strips a '## Resolution' heading and its content", () => {
  const body =
    "\n## Acceptance criteria\n\n- A.\n\n## Resolution\n\n" +
    "Fixed by NVA-B-TILDEFIX-1 (dispatch, claude-sonnet-5, xhigh), commit " +
    "afc6af70a5e3c474e23409e2388ce2e354e3416c. Full existing regression " +
    "suite for both touched files stays green.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "resolution");
  assert.ok(result.text.includes("## Acceptance criteria"));
  assert.ok(result.text.includes("- A."));
  assert.ok(!result.text.includes("NVA-B-TILDEFIX-1"));
  assert.ok(!result.text.includes("afc6af70a5e3c474e23409e2388ce2e354e3416c"));
  assert.ok(result.text.includes(BACKLOG_STRIP_FENCE));
});

test("stripBacklogVerdictProse strips a '## Progress note (...)' heading whose content is verdict-shaped, matching the real NVA-B-CODEXGUARDIMPORT-1 incident text", () => {
  // Verbatim in substance from backlog/items/2026-08-28-po-facing-commands-
  // are-not-uniformly-rendered-break-safe.md's "## Progress note (2026-09-06,
  // NVA-B-CODEXGUARDIMPORT-1)" section -- the exact contamination the Critic
  // itself flagged (2026-09-06). Note this text carries NO bold PASS/FAIL
  // marker at all, only "Resolved", "pass" and "Critic" as ordinary prose --
  // proving detection cannot rely on the bold-marker shape alone.
  const body =
    "\n## Acceptance criteria\n\n- A.\n\n" +
    "## Progress note (2026-09-06, NVA-B-CODEXGUARDIMPORT-1)\n\n" +
    "Resolved gap (1) above: codex-pretool-guard.mjs's import switched " +
    "(commit d398a662), the identical re-export already used elsewhere -- " +
    "byte-identical function, zero behavior change. Full existing " +
    "codex-pretool-guard.test.mjs: 38/38 pass, zero assertion changes.\n\n" +
    "Disclosed authorship note: this commit was authored directly by the " +
    "Elephant session rather than dispatched, submitted for the mandatory " +
    "Critic review any guardrail-hook diff requires.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "progress note");
  assert.ok(result.text.includes("## Acceptance criteria"));
  assert.ok(!result.text.includes("d398a662"));
  assert.ok(!result.text.includes("byte-identical function"));
  assert.ok(result.text.includes(BACKLOG_STRIP_FENCE));
});

test("stripBacklogVerdictProse does NOT strip a '## Progress note' section that reports only what was delivered, with no verdict word", () => {
  const body =
    "\n## Acceptance criteria\n\n- A.\n\n" +
    "## Progress note (2026-09-06, NVA-EXAMPLE-1)\n\n" +
    "Delivered: renamed `handleRequest` to `processRequest` across three " +
    "call sites; added a new helper module with two exported functions; " +
    "updated the caller in the CLI wrapper to use the new name.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, false);
  assert.equal(result.removedHeading, null);
  assert.equal(result.text, body);
});

test("stripBacklogVerdictProse strips a verdict-shaped bold inline marker introduced by no heading, up to the next heading", () => {
  // Verbatim in substance from commit bf274c39's diff to
  // backlog/items/2026-08-28-po-facing-commands-are-not-uniformly-rendered-
  // break-safe.md -- a prior Critic verdict added with a bold inline marker
  // and no heading at all, later manually corrected in that file.
  const body =
    "\n## Acceptance criteria\n\n- A.\n\n" +
    "Gap (2), the repository-wide audit, remains unperformed -- this item " +
    "stays `status: open`.\n\n" +
    "**T1 Critic round 1 (opus, max): FAIL.** Code confirmed correct and " +
    "inert (byte-identical re-export, no behavior change); the verdict " +
    "rested on two evidence gaps, not a code defect.\n\n" +
    "## A later section\n\nThis survives.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, true);
  assert.equal(result.removedHeading, "verdict-marker (no heading)");
  assert.ok(result.text.includes("## Acceptance criteria"));
  assert.ok(result.text.includes("Gap (2)"));
  assert.ok(!result.text.includes("T1 Critic round 1"));
  assert.ok(!result.text.includes("byte-identical re-export"));
  assert.ok(result.text.includes("## A later section"));
  assert.ok(result.text.includes("This survives."));
  assert.ok(result.text.includes(BACKLOG_STRIP_FENCE));
});

test("stripBacklogVerdictProse does not treat a bold list-item label as a headingless verdict marker", () => {
  // `- **Decision:** rejected` (already used inside the existing Triage
  // fixtures above): the verdict token sits OUTSIDE the bold span, and the
  // line does not start with `**` -- this must not independently trigger
  // the new headingless-marker detector outside of a verdict heading.
  const body =
    "\n## Acceptance criteria\n\n- **Decision:** rejected\n\n" +
    "## Design notes\n\nStill here.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, false);
  assert.equal(result.removedHeading, null);
});

test("stripBacklogVerdictProse does not strip plain (non-bold) prose that merely mentions a verdict word", () => {
  const body =
    "\n## Acceptance criteria\n\n" +
    "- The Critic will review this change before it merges.\n" +
    "- All tests must pass before closure.\n";
  const result = stripBacklogVerdictProse(body);
  assert.equal(result.wasStripped, false);
  assert.equal(result.removedHeading, null);
  assert.equal(result.text, body);
});
