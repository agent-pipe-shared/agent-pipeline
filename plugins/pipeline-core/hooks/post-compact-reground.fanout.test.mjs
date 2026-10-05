// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S9: the post-compact re-ground prints one fan-out summary line when a slice queue is configured.
// In-process contract tests; every fixture lives in a temp directory, nothing is written to the repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import { decideOutput } from "./post-compact-reground.mjs";

const FEATURE = "s9-test";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const SESSION = "s9-session";
const ROOTS = [];
after(() => { for (const root of ROOTS) rmSync(root, { recursive: true, force: true }); });

function state() {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE, planPath: "specs/prd.md", phase: "implementation" },
    continuity: {
      schema: "pipeline.continuity.v0",
      featureId: FEATURE,
      revision: 4,
      runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
      authority: {
        prd: { path: "specs/prd.md", sha256: A },
        spec: { path: "specs/spec.md", sha256: B },
        result: { path: "specs/result.md", sha256: C },
      },
      queueHead: {
        packageId: "P1", actionId: "post-compact-reground", nextAction: "dispatch",
        productRetryCount: 0, environmentRerouteCount: 0, dispatch: null,
      },
      blocker: null,
      acknowledgedFinal: null,
      resume: { mode: "resume-on-next-turn", sourceRevision: 4, reasonCode: "compact-reload" },
      recovery: null,
      decisionTxn: null,
      capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    },
  };
}

const slice = (id) => ({
  id, title: `title of ${id}`, state: "ready", dependsOn: [], writeScope: [`lib/${id.toLowerCase()}.mjs`],
  tier: "implementor", commitMode: "diff-only", loadClass: "light", briefing: { ref: `specs/unit/briefings/${id}.md` },
});
const queueOf = (count) => ({
  schema: "pipeline.slice-queue.v1", feature: "unit",
  defaults: { commitMode: "diff-only", tier: "implementor" }, monoliths: [],
  slices: Array.from({ length: count }, (_, index) => slice(`A${index + 1}`)),
});

function box({ queue = queueOf(3), liveIds = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "reground-s9-"));
  ROOTS.push(root);
  const common = join(root, "common");
  mkdirSync(common);
  mkdirSync(join(root, "evidence"));
  if (queue !== null) writeFileSync(join(root, "queue.json"), typeof queue === "string" ? queue : JSON.stringify(queue));
  for (const id of liveIds) {
    writeFileSync(join(root, "evidence", `dispatch-record-${id}.json`), JSON.stringify({ taskId: id, outcome: "in-progress" }));
  }
  return { root, common };
}
const env = (b, extra = {}) => ({
  PIPELINE_FANOUT_CONFIG: JSON.stringify({ queuePath: join(b.root, "queue.json"), commonDir: b.common, ...extra }),
});
const run = (b, environment) => decideOutput({ source: "compact", session_id: SESSION }, state(), { rootDir: b.root, env: environment });
const lines = (output) => output.payload.systemMessage.split("\n");
const fanoutLines = (output) => lines(output).filter((line) => line.startsWith("Fan-out:"));

test("no config: output is byte-identical to the unconfigured hook output", () => {
  const b = box();
  const baseline = decideOutput({ source: "compact", session_id: SESSION }, state(), { rootDir: b.root });
  const noEnv = run(b, {});
  const emptyEnv = run(b, { PIPELINE_FANOUT_CONFIG: "" });
  assert.equal(noEnv.stdout, baseline.stdout);
  assert.equal(emptyEnv.stdout, baseline.stdout);
  assert.deepEqual(fanoutLines(noEnv), []);
});

test("configured queue with ready and live slices: exactly one added line with the expected counts", () => {
  const b = box({ liveIds: ["A1"] });
  const baseline = run(b, {});
  const output = run(b, env(b));
  const added = fanoutLines(output);
  assert.equal(added.length, 1);
  assert.match(added[0], /^Fan-out: 2 ready, 1 live, 3 free of target 4\.$/u);
  assert.deepEqual(lines(output).filter((line) => !line.startsWith("Fan-out:")), lines(baseline));
  assert.equal(added[0].includes(b.root), false);
  assert.equal(added[0].includes("title of"), false);
});

test("corrupt queue: no added line, the rest is unchanged", () => {
  const b = box({ queue: "{ not json" });
  assert.equal(run(b, env(b)).stdout, run(b, {}).stdout);
});

test("invalid queue schema: no added line, the rest is unchanged", () => {
  const b = box({ queue: { schema: "wrong", slices: "nope" } });
  assert.equal(run(b, env(b)).stdout, run(b, {}).stdout);
});

test("unreadable ledger / bad config: no added line, the rest is unchanged", () => {
  const b = box({ liveIds: ["A1"] });
  const baseline = run(b, {}).stdout;
  assert.equal(run(b, env(b, { commonDir: "relative/not-absolute" })).stdout, baseline);
  assert.equal(run(b, { PIPELINE_FANOUT_CONFIG: "{ not json" }).stdout, baseline);
  assert.equal(run(b, { PIPELINE_FANOUT_CONFIG: "[]" }).stdout, baseline);
  const noQueue = box({ queue: null });
  assert.equal(run(noQueue, env(noQueue)).stdout, run(noQueue, {}).stdout);
});
