#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads
 * (AC-168). The item's Acceptance asks for a repeatable measurement tool and ONE measure
 * per cause, each with a before/after measurement. Its Description names five causes:
 * wake-up loops, delegation costlier per action than inline work, refused Explore/Plan
 * dispatch, guard false positives, hand-written briefings.
 *
 * One case per cause. Each case holds the cause's measure in BOTH role copies (the root
 * and the plugin copy, byte-identical bullet) with its telemetry check, and drives the real
 * measurement tool over a synthetic before/after pair to show the cause's own share falling.
 * No transcript here is a real session: real before/after numbers are host evidence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CAUSES, classifyTranscript, compareMeasurements } from "../../scripts/elephant-context-measure.mjs";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const ROLE_COPIES = { root: read("../../../../roles/elephant.md"), plugin: read("../../roles/elephant.md") };
const HEADING = "### Main-context economy — one measure per administration cause";

function sectionOf(text) {
  const start = text.indexOf(HEADING);
  if (start < 0) return "";
  const rest = text.slice(start + HEADING.length);
  const end = rest.search(/\n#{2,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

const measureOf = (text, key) => sectionOf(text).split("\n").find((line) => line.startsWith(`- **\`${key}\``)) ?? "";

const j = (o) => JSON.stringify(o);
const user = (content) => j({ type: "user", message: { role: "user", content } });
const asst = (content) => j({ type: "assistant", message: { role: "assistant", content } });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const toolResult = (id, content, is_error = false) => ({ type: "tool_result", tool_use_id: id, content, is_error });
const wake = () => user("<task-notification>agent finished</task-notification>");
const reply = () => asst([{ type: "text", text: "ok" }]);
const GOLDFISH_PROMPT = ["### 1. Goal", "### 2. Context files", "### 3. DoD checks", "### 4. Forbidden", "### 5. Stop conditions", "### 6. Dispatch metadata"].join("\n");
const read1 = (id) => [asst([toolUse(id, "Read", { file_path: "a.md" })]), user([toolResult(id, "y".repeat(3000))])];

/** Per cause: a transcript that exhibits it and the same work with the measure applied. */
const PAIRS = {
  wakeUpLoops: {
    before: [...read1("r1"), wake(), reply(), wake(), reply(), wake(), reply()],
    after: [...read1("r1")],
  },
  delegationCost: {
    // One read dispatched with a full briefing versus the same read done inline.
    before: [asst([toolUse("d1", "Agent", { subagent_type: "pipeline-core:goldfish-implementor", prompt: `${GOLDFISH_PROMPT}\n${"x".repeat(4000)}` })]), user([toolResult("d1", "z".repeat(2000))]), ...read1("r1")],
    after: [...read1("r1")],
  },
  exploreOrPlanRefused: {
    before: [asst([toolUse("e1", "Agent", { subagent_type: "Explore", prompt: "look around" })]), user([toolResult("e1", "BLOCKED: GUARD-DISPATCH Explore refused", true)]), ...read1("r1")],
    after: [...read1("r1")],
  },
  guardRefusals: {
    before: [asst([toolUse("b1", "Bash", { command: "rg -rn x f" })]), user([toolResult("b1", "BLOCKED: GUARD-READ-COMMAND-UNSUPPORTED", true)]), asst([toolUse("b2", "Bash", { command: "rg -n x f" })]), user([toolResult("b2", "match ".repeat(300))])],
    after: [asst([toolUse("b2", "Bash", { command: "rg -n x f" })]), user([toolResult("b2", "match ".repeat(300))])],
  },
  handWrittenBriefings: {
    before: [asst([toolUse("h1", "Agent", { subagent_type: "pipeline-core:goldfish-implementor", prompt: "just do the thing, you know the repo" })]), user([toolResult("h1", "done")]), ...read1("r1")],
    after: [asst([toolUse("h1", "Agent", { subagent_type: "pipeline-core:goldfish-implementor", prompt: GOLDFISH_PROMPT })]), user([toolResult("h1", "done")]), ...read1("r1")],
  },
};

test("the pin covers exactly the causes the measurement tool reports", () => {
  assert.deepEqual(Object.keys(PAIRS), CAUSES);
  assert.deepEqual(Object.keys(classifyTranscript("").causes), CAUSES);
});

for (const key of CAUSES) {
  test(`${key}: role measure with a telemetry check in both copies, and its own share falls`, () => {
    for (const [copy, text] of Object.entries(ROLE_COPIES)) {
      const bullet = measureOf(text, key);
      assert.notEqual(bullet, "", `${copy} role copy carries no measure for ${key}`);
      assert.ok(bullet.includes(`Check: \`causes.${key}.`), `${copy} measure for ${key} names no telemetry check`);
    }
    assert.equal(measureOf(ROLE_COPIES.root, key), measureOf(ROLE_COPIES.plugin, key), `${key} measure differs between role copies`);

    const before = classifyTranscript(PAIRS[key].before.join("\n"));
    const after = classifyTranscript(PAIRS[key].after.join("\n"));
    assert.ok(before.causes[key].events > 0, `${key} is not exhibited by its before transcript`);
    assert.equal(after.causes[key].events, 0, `${key} is still exhibited after the measure`);
    const cmp = compareMeasurements(before, after);
    assert.equal(cmp.causes[key].improved, true);
    assert.ok(cmp.causes[key].deltaShare < 0);
  });
}

test("delegationCost: a single-action dispatch is measured as costlier than the inline read", () => {
  const { delegationCost } = classifyTranscript(PAIRS.delegationCost.before.join("\n")).causes;
  assert.equal(delegationCost.costlierThanInline, true);
  assert.ok(delegationCost.costRatio > 1);
});

/** Cause keys the role section names: its bullet heads and every `causes.<key>` reference. */
function roleCauseKeys(sectionText) {
  const heads = sectionText.split("\n").map((line) => /^- \*\*`([A-Za-z]+)`/u.exec(line)?.[1]).filter(Boolean);
  const refs = [...sectionText.matchAll(/`causes\.([A-Za-z]+)[.`]/gu)].map((m) => m[1]);
  return { heads, refs: [...new Set(refs)] };
}

/** Drift report between the measure's CAUSES and one role section; an empty list means parity. */
function causeKeyDrift(sectionText) {
  const { heads, refs } = roleCauseKeys(sectionText);
  const drift = [];
  for (const key of CAUSES) if (!heads.includes(key)) drift.push(`role text has no bullet for measured cause ${key}`);
  for (const key of heads) if (!CAUSES.includes(key)) drift.push(`role text names ${key}, which the measure does not report`);
  for (const key of refs) if (!CAUSES.includes(key)) drift.push(`role text checks causes.${key}, which the measure does not report`);
  if (JSON.stringify(heads) !== JSON.stringify(CAUSES) && drift.length === 0) drift.push("role text lists the causes in a different order than the measure");
  return drift;
}

test("key parity: the causes the role text lists and the causes the measure reports cannot drift apart", () => {
  for (const [copy, text] of Object.entries(ROLE_COPIES)) {
    assert.deepEqual(causeKeyDrift(sectionOf(text)), [], `${copy} role copy and measure disagree on the cause keys`);
    assert.deepEqual(roleCauseKeys(sectionOf(text)).heads, CAUSES, copy);
  }
  // Negative controls: the same check must fail for each way the two sides can diverge.
  const section = sectionOf(ROLE_COPIES.root);
  const bulletOf = (key) => measureOf(ROLE_COPIES.root, key);
  assert.notEqual(bulletOf("guardRefusals"), "", "control precondition");
  assert.ok(causeKeyDrift(section.replace(`${bulletOf("guardRefusals")}\n`, "")).length > 0, "a measured cause with no role bullet");
  assert.ok(causeKeyDrift(section.replaceAll("wakeUpLoops", "wakeUpStorms")).length > 0, "a role cause the measure does not report");
  assert.ok(causeKeyDrift(`${section}\n- **\`invented\`** — a cause only the role text names. Check: \`causes.invented.share\`.`).length > 0, "an extra role bullet");
  assert.ok(causeKeyDrift(section.replace("`causes.delegationCost.costRatio`", "`causes.delegationCosts.costRatio`")).length > 0, "a check key that is not a measured cause");
});

test("the role section is the same in both copies and states the PO target", () => {
  assert.notEqual(sectionOf(ROLE_COPIES.root), "");
  assert.equal(sectionOf(ROLE_COPIES.root), sectionOf(ROLE_COPIES.plugin));
  assert.match(sectionOf(ROLE_COPIES.root), /at most 10 %/);
  assert.match(sectionOf(ROLE_COPIES.root), /elephant-context-measure\.mjs/);
});
