// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S11: the close-block skill carries the fan-out utilisation step, and the
// `slice-queue.mjs report` output fields that step tells the reader to copy really exist.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appendEvent } from "../../lib/fanout-ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = readFileSync(join(HERE, "SKILL.md"), "utf8");
const CLI = resolve(HERE, "..", "..", "scripts", "slice-queue.mjs");
const SCRATCH = resolve(HERE, "..", "..", "..", "..", "scratch", "FANOUT-S11");
const NOW = "2026-10-05T12:00:00.000Z";

const STEP_HEADING = "Fan-out utilisation";
const stepStart = SKILL.indexOf(STEP_HEADING);
const STEP = stepStart === -1 ? "" : SKILL.slice(stepStart, stepStart + 2500);

// Output fields the SKILL step tells the reader to copy into the handover/retro.
const COPIED_FIELDS = [
  "queue.feature", "queue.size", "queue.counts", "queue.ready",
  "ledger.slotIdleMinutesWithReady", "ledger.meanLiveOverTargetWhileReady", "ledger.blocks",
  "ledger.defied", "ledger.declaredDefers", "ledger.pauseMinutes", "ledger.slicesLaunched",
];

const pick = (object, path) => path.split(".").reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), object);

test("SKILL.md carries the fan-out utilisation step with the exact report invocation", () => {
  assert.notEqual(stepStart, -1, "a 'Fan-out utilisation' step is missing");
  assert.match(STEP, /node plugins\/pipeline-core\/scripts\/slice-queue\.mjs report --queue /);
  assert.match(STEP, /only when a slice queue exists/i);
  assert.match(STEP, /skip(ped)? silently/i);
  assert.match(STEP, /never a blocker/i);
  assert.match(STEP, /handover/i);
  assert.match(STEP, /retro/i);
  assert.match(STEP, /evidence\/fanout-utilization-<date>\.json/);
  assert.match(STEP, /hash-only/i);
  for (const field of COPIED_FIELDS) assert.ok(STEP.includes(field), `SKILL step does not name ${field}`);
});

test("slice-queue report emits every field the SKILL step tells the reader to copy", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "report-"));
  try {
    const rel = "specs/demo/slice-queue.json";
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    const slice = (id) => ({ id, title: `slice ${id}`, state: "ready", writeScope: [`${id}.mjs`], tier: "implementor", commitMode: "diff-only", loadClass: "light" });
    writeFileSync(abs, `${JSON.stringify({ schema: "pipeline.slice-queue.v1", feature: "demo", slices: [slice("A"), slice("B")] }, null, 2)}\n`);
    const common = join(dir, "git-common");
    appendEvent(common, "claude", "sess-1", { type: "stop-eval", live: 0, target: 2, ready: 2, decision: "block", reason: "FANOUT-UNDERFILLED", mode: "enforce", at: "2026-10-05T11:00:00.000Z" });
    appendEvent(common, "claude", "sess-1", { type: "block", reasonCode: "FANOUT-UNDERFILLED", live: 0, target: 2, ready: 2, at: "2026-10-05T11:00:00.000Z" });
    const ledger = ["--common-dir", common, "--runner", "claude", "--session", "sess-1"];
    // Relative and absolute --queue forms must both work.
    for (const queue of [rel, abs]) {
      const child = spawnSync(process.execPath, [CLI, "report", "--queue", queue, "--now", NOW, ...ledger], { cwd: dir, encoding: "utf8", timeout: 60_000 });
      assert.equal(child.status, 0, child.stdout + child.stderr);
      const json = JSON.parse(child.stdout);
      assert.equal(json.ok, true);
      assert.equal(json.verb, "report");
      for (const field of COPIED_FIELDS) assert.notEqual(pick(json, field), undefined, `report output lacks ${field} (queue form ${queue === rel ? "relative" : "absolute"})`);
      assert.equal(json.queue.size, 2);
    }
    // No ledger flags: queue half only, ledger is null (the SKILL step must tolerate this).
    const bare = spawnSync(process.execPath, [CLI, "report", "--queue", rel, "--now", NOW], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    assert.equal(bare.status, 0);
    assert.equal(JSON.parse(bare.stdout).ledger, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
