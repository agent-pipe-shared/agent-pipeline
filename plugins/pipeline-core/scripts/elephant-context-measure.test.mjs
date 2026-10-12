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
