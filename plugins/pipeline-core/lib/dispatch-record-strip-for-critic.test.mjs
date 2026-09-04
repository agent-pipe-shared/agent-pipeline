#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS,
  stripDispatchRecordForCritic,
} from "./dispatch-record-strip-for-critic.mjs";

// Realistic shape mirroring the real corpus under evidence/dispatch-record-*.json:
// a bare-string changedFiles entry with a " - <rationale>" suffix (house style, e.g.
// evidence/dispatch-record-NVA-B-SCANNER.json), an object-shaped {path, rationale}
// entry (e.g. evidence/dispatch-record-NVA-B-DRPATH-1.json), a bare path string with
// no suffix at all, non-empty report.text implementor prose, and a modelOverride
// carrying a free-text rationale alongside its bounded model/effort fields.
const FULL_RECORD = {
  taskId: "NVA-B-CRITICINPUT-1",
  agentType: "goldfish-deep",
  model: "claude-sonnet-5",
  effort: "xhigh",
  rulesetSha: "5b2ce43",
  dispatcher: "elephant",
  outcome: "completed",
  commits: ["a1b2c3d4"],
  criticSkip: true,
  log: [
    { phase: "opening", toolUseCount: 2 },
    { phase: "implemented the fix", toolUseCount: 18 },
  ],
  modelOverride: {
    model: "claude-opus-5",
    effort: "max",
    rationale:
      "Escalated per MP-07 because the diff touches a guardrail hook; the implementor judged the standard tier insufficient for this class of change.",
  },
  report: {
    text: "F1 fixed by adding a null-guard in guard-lifecycle-ready.mjs before the .split() call that crashed on an empty trailer block. F2 fixed by widening the safe-path regex in check-consumer-safe-paths.mjs to admit a trailing slash. Both verified green locally before commit.",
    changedFiles: [
      "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs - added a null-guard before the .split() call that crashed on an empty trailer block",
      {
        path: "plugins/pipeline-core/scripts/check-consumer-safe-paths.mjs",
        rationale: "widened the safe-path regex to admit a trailing slash",
      },
      "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs",
    ],
  },
};

test("stripDispatchRecordForCritic drops report.text, log, dispatcher, criticSkip and modelOverride.rationale, and normalizes changedFiles to bare path strings", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  const serialized = JSON.stringify(stripped);

  assert.equal(stripped.report.text, undefined);
  assert.equal(stripped.log, undefined);
  assert.equal(stripped.dispatcher, undefined);
  assert.equal(stripped.criticSkip, undefined);

  assert.ok(!serialized.includes("F1 fixed"));
  assert.ok(!serialized.includes("crashed on an empty trailer block"));
  assert.ok(!serialized.includes("Escalated per MP-07"));
  assert.ok(!serialized.includes("widened the safe-path regex to admit a trailing slash"));
  assert.ok(!serialized.includes("toolUseCount"));

  assert.deepEqual(stripped.report.changedFiles, [
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs",
    "plugins/pipeline-core/scripts/check-consumer-safe-paths.mjs",
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs",
  ]);
});

test("stripDispatchRecordForCritic passes the declared safe top-level fields through unchanged", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  assert.equal(stripped.taskId, "NVA-B-CRITICINPUT-1");
  assert.equal(stripped.agentType, "goldfish-deep");
  assert.equal(stripped.model, "claude-sonnet-5");
  assert.equal(stripped.effort, "xhigh");
  assert.equal(stripped.rulesetSha, "5b2ce43");
  assert.deepEqual(stripped.commits, ["a1b2c3d4"]);
  assert.equal(stripped.outcome, "completed");
  // Nothing beyond the declared safe set (plus report/modelOverride) survives.
  for (const key of Object.keys(stripped)) {
    assert.ok(
      DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS.includes(key) || key === "report" || key === "modelOverride",
      `unexpected surviving top-level key: ${key}`,
    );
  }
});

test("stripDispatchRecordForCritic keeps modelOverride.model/.effort while dropping modelOverride.rationale", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  assert.deepEqual(stripped.modelOverride, { model: "claude-opus-5", effort: "max" });
});

test("stripDispatchRecordForCritic does not throw on a record missing every optional field", () => {
  const minimal = { taskId: "NVA-X-MIN-1" };
  const stripped = stripDispatchRecordForCritic(minimal);
  assert.deepEqual(stripped, { taskId: "NVA-X-MIN-1" });
});

test("stripDispatchRecordForCritic omits report when report.changedFiles is absent, and omits modelOverride when absent", () => {
  const record = {
    taskId: "NVA-X-NOREPORT-1",
    model: "claude-sonnet-5",
    rulesetSha: "abc1234",
    outcome: "in-progress",
    report: { text: "prose with no changedFiles field at all" },
  };
  const stripped = stripDispatchRecordForCritic(record);
  assert.equal(stripped.report, undefined);
  assert.equal(stripped.modelOverride, undefined);
  assert.equal(stripped.taskId, "NVA-X-NOREPORT-1");
});

test("stripDispatchRecordForCritic drops a changedFiles entry whose shape carries no recognisable path", () => {
  const record = {
    taskId: "NVA-X-MALFORMED-1",
    report: {
      changedFiles: [
        "plugins/pipeline-core/scripts/real-path.mjs",
        42,
        null,
        { rationale: "no path field on this entry" },
      ],
    },
  };
  const stripped = stripDispatchRecordForCritic(record);
  assert.deepEqual(stripped.report.changedFiles, ["plugins/pipeline-core/scripts/real-path.mjs"]);
});

test("stripDispatchRecordForCritic rejects a non-object record", () => {
  assert.throws(() => stripDispatchRecordForCritic(null), TypeError);
  assert.throws(() => stripDispatchRecordForCritic("not an object"), TypeError);
  assert.throws(() => stripDispatchRecordForCritic(["array"]), TypeError);
});

test("stripDispatchRecordForCritic is a pure function that never mutates its input", () => {
  const copy = JSON.parse(JSON.stringify(FULL_RECORD));
  stripDispatchRecordForCritic(FULL_RECORD);
  assert.deepEqual(FULL_RECORD, copy);
});
