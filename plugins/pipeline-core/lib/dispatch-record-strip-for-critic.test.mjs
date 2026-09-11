#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";

import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import {
  DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS,
  stripDispatchRecordForCritic,
} from "./dispatch-record-strip-for-critic.mjs";

const cases = [];
function check(id, name, run) {
  cases.push({ id, name, run });
}

// Realistic shape mirroring the real corpus under evidence/dispatch-record-*.json:
// a bare-string changedFiles entry with a " - <rationale>" suffix (house style, e.g.
// evidence/dispatch-record-NVA-B-SCANNER.json), an object-shaped {path, rationale}
// entry (e.g. evidence/dispatch-record-NVA-B-DRPATH-1.json), a bare path string with
// no suffix at all, non-empty report.text implementor prose, and model-selection
// metadata that the authorship-only projection does not need.
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

check("DRS01", "stripDispatchRecordForCritic drops narrative and model metadata, and normalizes changedFiles to bare path strings", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  const serialized = JSON.stringify(stripped);

  assert.equal(stripped.report.text, undefined);
  assert.equal(stripped.log, undefined);
  assert.equal(stripped.dispatcher, undefined);
  assert.equal(stripped.criticSkip, undefined);
  assert.equal(stripped.taskId, undefined);
  assert.equal(stripped.model, undefined);
  assert.equal(stripped.modelOverride, undefined);

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

check("DRS02", "stripDispatchRecordForCritic passes the declared safe top-level fields through unchanged", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  assert.equal(stripped.taskId, undefined);
  assert.equal(stripped.rulesetSha, "5b2ce43");
  assert.deepEqual(stripped.commits, ["a1b2c3d4"]);
  // Nothing beyond the declared safe set (plus the normalized report) survives.
  for (const key of Object.keys(stripped)) {
    assert.ok(
      DISPATCH_RECORD_SAFE_TOP_LEVEL_FIELDS.includes(key) || key === "report",
      `unexpected surviving top-level key: ${key}`,
    );
  }
});

check("DRS03", "stripDispatchRecordForCritic drops outcome entirely, even when it carries real-corpus free-text prose", () => {
  assert.equal(stripDispatchRecordForCritic(FULL_RECORD).outcome, undefined);
  assert.ok(!("outcome" in stripDispatchRecordForCritic(FULL_RECORD)));

  for (const outcome of [
    "committed-not-fully-verified",
    "stopped-mechanism-established-no-fix-applied",
    "completed-with-open-items",
  ]) {
    const record = { taskId: "NVA-X-OUTCOME-1", outcome };
    const stripped = stripDispatchRecordForCritic(record);
    assert.ok(!("outcome" in stripped), `outcome "${outcome}" must not survive the strip`);
  }
});

check("DRS04", "stripDispatchRecordForCritic omits all model override fields including hyphenated prose", () => {
  const stripped = stripDispatchRecordForCritic(FULL_RECORD);
  assert.equal(stripped.modelOverride, undefined);
});

check("DRS05", "stripDispatchRecordForCritic omits hyphenated model prose and rejects a hyphenated ruleset claim", () => {
  const stripped = stripDispatchRecordForCritic({
    taskId: "this-task-id-claims-the-entire-change-is-correct",
    model: "selected-because-this-model-is-fast",
    modelOverride: { model: "chosen-because-this-change-is-risky", effort: "very-high" },
  });
  assert.equal(stripped.model, undefined);
  assert.equal(stripped.modelOverride, undefined);
  assert.equal(stripped.taskId, undefined);
  assert.ok(!JSON.stringify(stripped).includes("claims-the-entire-change"));
  assert.ok(!JSON.stringify(stripped).includes("selected-because"));
  assert.ok(!JSON.stringify(stripped).includes("chosen-because"));

  assert.throws(
    () => stripDispatchRecordForCritic({ taskId: "NVA-X-TOKEN-2", rulesetSha: "ruleset-selected-because-it-is-current" }),
    /Git digest or a SHA-256 digest/u,
  );
});

check("DRS06", "stripDispatchRecordForCritic fails closed on unsafe object paths while retaining only a safe legacy string path", () => {
  const unsafeEntries = [
    { path: "src/file.mjs because I fixed the guard" },
    { path: "../private/notes.md" },
    { path: "src//file.mjs" },
    { path: "C:/Users/Alice/private.txt" },
    { path: "src/file.mjs", unexpected: "implementor prose" },
  ];
  for (const entry of unsafeEntries) {
    assert.throws(
      () => stripDispatchRecordForCritic({ taskId: "NVA-X-PATH-1", report: { changedFiles: [entry] } }),
      TypeError,
    );
  }

  assert.deepEqual(
    stripDispatchRecordForCritic({
      taskId: "NVA-X-PATH-2",
      report: { changedFiles: ["src/safe-file.mjs - fixed traversal without exposing the rationale"] },
    }).report.changedFiles,
    ["src/safe-file.mjs"],
  );
});

check("DRS07", "stripDispatchRecordForCritic does not throw on a record missing every optional field", () => {
  const minimal = { taskId: "NVA-X-MIN-1" };
  const stripped = stripDispatchRecordForCritic(minimal);
  assert.deepEqual(stripped, {});
});

check("DRS08", "stripDispatchRecordForCritic omits report when report.changedFiles is absent, and omits modelOverride when absent", () => {
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
  assert.equal(stripped.taskId, undefined);
});

check("DRS09", "stripDispatchRecordForCritic throws (not silently drops) on a changedFiles entry with an out-of-contract shape", () => {
  for (const malformed of [42, null, { rationale: "no path field on this entry" }]) {
    const record = {
      taskId: "NVA-X-MALFORMED-1",
      report: {
        changedFiles: ["plugins/pipeline-core/scripts/real-path.mjs", malformed],
      },
    };
    assert.throws(() => stripDispatchRecordForCritic(record), TypeError);
  }
});

check("DRS10", "stripDispatchRecordForCritic rejects a non-object record", () => {
  assert.throws(() => stripDispatchRecordForCritic(null), TypeError);
  assert.throws(() => stripDispatchRecordForCritic("not an object"), TypeError);
  assert.throws(() => stripDispatchRecordForCritic(["array"]), TypeError);
});

check("DRS11", "stripDispatchRecordForCritic is a pure function that never mutates its input", () => {
  const copy = JSON.parse(JSON.stringify(FULL_RECORD));
  stripDispatchRecordForCritic(FULL_RECORD);
  assert.deepEqual(FULL_RECORD, copy);
});

assert.equal(cases.length, 11, "the complete dispatch-record strip corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
