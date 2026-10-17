#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { classifyTranscript, CATEGORIES } from "./elephant-context-measure.mjs";

const j = (o) => JSON.stringify(o);
const user = (content) => j({ type: "user", message: { role: "user", content } });
const asst = (content) => j({ type: "assistant", message: { role: "assistant", content } });
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const toolResult = (id, content, is_error = false) => ({ type: "tool_result", tool_use_id: id, content, is_error });

const fixture = [
  user("start the work"),
  asst([toolUse("t1", "Read", { file_path: "a.md" })]),
  user([toolResult("t1", "x".repeat(200))]),
  asst([toolUse("t2", "Bash", { command: "git status" })]),
  user([toolResult("t2", "clean")]),
  asst([toolUse("t3", "Edit", { file_path: "b.md", old_string: "a", new_string: "b" })]),
  user([toolResult("t3", "BLOCKED: GUARD-WRITE refused", true)]),
  user("<task-notification>agent finished</task-notification>"),
  asst([{ type: "text", text: "ok" }]),
  "not json",
].join("\n");

test("classifies wake-up, inline read, guard refusal and authoring with shares", () => {
  const r = classifyTranscript(fixture);
  assert.equal(r.schema, "pipeline.elephant-context-measurement.v1");
  assert.equal(r.malformedLines, 1);
  assert.equal(r.events.inlineRead, 4);
  assert.equal(r.events.guardRefusal, 1);
  assert.equal(r.events.authoring, 1);
  assert.equal(r.events.wakeUp, 2);
  assert.ok(r.units.inlineRead > r.units.wakeUp);
  const sum = CATEGORIES.reduce((s, c) => s + r.shares[c], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(r.adminShare - (r.shares.wakeUp + r.shares.guardRefusal + r.shares.authoring)) < 1e-9);
});

test("admin target flag and empty transcript", () => {
  assert.equal(classifyTranscript(fixture).withinAdminTarget, false);
  const empty = classifyTranscript("");
  assert.equal(empty.totalUnits, 0);
  assert.equal(empty.withinAdminTarget, false);
  const reads = classifyTranscript([asst([toolUse("r", "Read", {})]), user([toolResult("r", "y".repeat(5000))])].join("\n"));
  assert.equal(reads.withinAdminTarget, true);
});

test("sidechain events are excluded from main-thread measurement", () => {
  const side = j({ type: "assistant", isSidechain: true, message: { role: "assistant", content: [{ type: "text", text: "z".repeat(1000) }] } });
  assert.equal(classifyTranscript(side).totalUnits, 0);
});

import { CAUSES, compareMeasurements } from "./elephant-context-measure.mjs";

const GOLDFISH_PROMPT = ["### 1. Goal", "### 2. Context files", "### 3. DoD checks", "### 4. Forbidden", "### 5. Stop conditions", "### 6. Dispatch metadata"].join("\n");
const wake = () => user("<task-notification>agent finished</task-notification>");
const reply = () => asst([{ type: "text", text: "ok" }]);

// A "before" session carrying every cause of the item once: a refused Explore dispatch, a
// freehand briefing, a guard refusal that an admitted respelling then passes, a template-shaped
// dispatch, and three consecutive wake-up replies.
const beforeSession = [
  user("go"),
  asst([toolUse("e1", "Agent", { subagent_type: "Explore", prompt: "look around" })]),
  user([toolResult("e1", "BLOCKED: GUARD-DISPATCH Explore refused", true)]),
  asst([toolUse("e2", "Agent", { subagent_type: "pipeline-core:goldfish-implementor", prompt: GOLDFISH_PROMPT })]),
  user([toolResult("e2", "report ".repeat(50))]),
  asst([toolUse("b1", "Bash", { command: "rg -rn x f" })]),
  user([toolResult("b1", "BLOCKED: GUARD-READ-COMMAND-UNSUPPORTED", true)]),
  asst([toolUse("b2", "Bash", { command: "rg -n x f" })]),
  user([toolResult("b2", "match")]),
  wake(), reply(), wake(), reply(), wake(), reply(),
].join("\n");

// The same work after the measures: one template-shaped dispatch, one inline read, no refusal, no wake-up.
const afterSession = [
  user("go"),
  asst([toolUse("a1", "Agent", { subagent_type: "pipeline-core:goldfish-implementor", prompt: GOLDFISH_PROMPT })]),
  user([toolResult("a1", "ok")]),
  asst([toolUse("a2", "Read", { file_path: "a.md" })]),
  user([toolResult("a2", "y".repeat(5000))]),
].join("\n");

test("attributes events to the five causes of the item", () => {
  const { causes } = classifyTranscript(beforeSession);
  assert.deepEqual(Object.keys(causes), CAUSES);
  assert.equal(causes.wakeUpLoops.longestRun, 3);
  assert.equal(causes.wakeUpLoops.replyEvents, 3);
  assert.equal(causes.exploreOrPlanRefused.events, 1);
  assert.ok(causes.exploreOrPlanRefused.units > 0);
  // The Explore refusal is its own cause: it is neither a guard refusal of the ordinary kind nor a retried respelling.
  assert.equal(causes.guardRefusals.events, 1);
  assert.equal(causes.guardRefusals.retriedAdmittedEvents, 1);
  assert.equal(causes.delegationCost.events, 2);
  assert.equal(typeof causes.delegationCost.costRatio, "number");
  assert.equal(causes.delegationCost.costlierThanInline, causes.delegationCost.costRatio > 1);
  assert.equal(causes.handWrittenBriefings.briefingEvents, 2);
  assert.equal(causes.handWrittenBriefings.templateShapedEvents, 1);
  assert.equal(causes.handWrittenBriefings.events, 1);
  for (const key of CAUSES) assert.ok(causes[key].share >= 0 && causes[key].share <= 1, key);
});

test("per-cause before/after comparison reports each cause falling", () => {
  const before = classifyTranscript(beforeSession);
  const after = classifyTranscript(afterSession);
  const cmp = compareMeasurements(before, after);
  assert.equal(cmp.schema, "pipeline.elephant-context-comparison.v1");
  assert.deepEqual(Object.keys(cmp.causes), CAUSES);
  for (const key of CAUSES) {
    assert.equal(cmp.causes[key].improved, true, key);
    assert.ok(cmp.causes[key].deltaShare < 0, key);
  }
  assert.ok(cmp.adminShare.before > cmp.adminShare.after);
  assert.equal(cmp.withinAdminTarget, true);
});

test("a cause with no events before cannot be reported improved", () => {
  const none = compareMeasurements(classifyTranscript(""), classifyTranscript(""));
  for (const key of CAUSES) assert.equal(none.causes[key].improved, false, key);
  assert.equal(none.withinAdminTarget, false);
});

// ALF-C-C6D-CORR (Critic C6d F5). Three per-cause measures were imprecise.
// F5(a): the six-field Goldfish markers never match a Critic prompt, so every correctly filled
// Critic briefing was counted as hand-written. The Critic template has its own fixed headings.
const CRITIC_PROMPT = [
  "Review the fixed candidate range.",
  "## Fail-closed reference boundary (MUST)", "name paths only",
  "## Phase A — Adversarial hunt (be harsh; report nothing yet)", "hunt",
  "## Phase B — Evidence gate (be honest; report only what survives)", "gate",
  "## Report format (mandatory)", "findings table",
].join("\n");

test("F5(a): a correctly filled Critic briefing is template-shaped, a freehand Critic prompt is still hand-written", () => {
  const dispatch = (id, prompt) => [asst([toolUse(id, "Agent", { subagent_type: "pipeline-core:critic", prompt })]), user([toolResult(id, "findings")])];
  const filled = classifyTranscript(dispatch("c1", CRITIC_PROMPT).join("\n")).causes.handWrittenBriefings;
  assert.equal(filled.briefingEvents, 1);
  assert.equal(filled.templateShapedEvents, 1);
  assert.equal(filled.events, 0);
  assert.equal(filled.units, 0);
  const freehand = classifyTranscript(dispatch("c2", "Please review commit abc123 and tell me what is wrong with it.").join("\n")).causes.handWrittenBriefings;
  assert.equal(freehand.briefingEvents, 1);
  assert.equal(freehand.templateShapedEvents, 0);
  assert.equal(freehand.events, 1);
  // One Critic heading quoted inside a freehand prompt is not the template.
  const quoted = classifyTranscript(dispatch("c3", "Follow the Fail-closed reference boundary (MUST) section, whatever it says.").join("\n")).causes.handWrittenBriefings;
  assert.equal(quoted.events, 1);
});

// F5(b): the transcript cannot tell a false-positive refusal from a true one (a true refusal is
// also followed by an admitted respelling), so the cause counts guard REFUSALS and says so.
test("F5(b): the guard cause is named for what it counts: refusals, with the retried-and-admitted subset", () => {
  assert.ok(CAUSES.includes("guardRefusals"));
  assert.ok(!CAUSES.includes("guardFalsePositives"));
  const session = [
    asst([toolUse("g1", "Bash", { command: "rg -rn x f" })]),
    user([toolResult("g1", "BLOCKED: GUARD-READ-COMMAND-UNSUPPORTED", true)]),
    asst([toolUse("g2", "Bash", { command: "rg -n x f" })]),
    user([toolResult("g2", "match")]),
    asst([toolUse("g3", "Edit", { file_path: "p.md", old_string: "a", new_string: "b" })]),
    user([toolResult("g3", "BLOCKED: GUARD-WRITE refused", true)]),
    asst([{ type: "text", text: "stopping" }]),
  ].join("\n");
  const { causes } = classifyTranscript(session);
  assert.equal(causes.guardFalsePositives, undefined);
  assert.equal(causes.guardRefusals.events, 2);
  assert.equal(causes.guardRefusals.retriedAdmittedEvents, 1);
  assert.ok(causes.guardRefusals.units > causes.guardRefusals.retriedAdmittedUnits);
  assert.ok(Object.keys(compareMeasurements(classifyTranscript(session), classifyTranscript("")).causes).includes("guardRefusals"));
});

// F5(c): a cause's share can fall only because the rest of the transcript grew. That is not an improvement.
test("F5(c): a falling share at unchanged absolute cost is not improved; the share change is reported separately", () => {
  const exchange = [user("go"), wake(), reply()];
  const small = [asst([toolUse("r1", "Read", { file_path: "a.md" })]), user([toolResult("r1", "y".repeat(100))])];
  const large = [asst([toolUse("r1", "Read", { file_path: "a.md" })]), user([toolResult("r1", "y".repeat(20000))])];
  const before = classifyTranscript([...exchange, ...small].join("\n"));
  const after = classifyTranscript([...exchange, ...large].join("\n"));
  assert.equal(after.causes.wakeUpLoops.events, before.causes.wakeUpLoops.events);
  assert.equal(after.causes.wakeUpLoops.units, before.causes.wakeUpLoops.units);
  const cmp = compareMeasurements(before, after).causes.wakeUpLoops;
  assert.ok(cmp.deltaShare < 0);
  assert.equal(cmp.shareFell, true);
  assert.equal(cmp.unitsFell, false);
  assert.equal(cmp.deltaUnits, 0);
  assert.equal(cmp.improved, false);
  // Control: the same share fall with a real fall in absolute cost is an improvement.
  const gone = compareMeasurements(before, classifyTranscript([user("go"), ...large].join("\n"))).causes.wakeUpLoops;
  assert.equal(gone.shareFell, true);
  assert.equal(gone.unitsFell, true);
  assert.equal(gone.eventsFell, true);
  assert.equal(gone.improved, true);
});
