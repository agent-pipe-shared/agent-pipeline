// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./continuity-status.mjs", import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), "continuity-status-test-"));
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function project(name, payload) {
  const root = join(ROOT, name);
  mkdirSync(join(root, ".claude"), { recursive: true });
  const path = join(root, ".claude", "pipeline-state.json");
  writeFileSync(path, payload);
  return { root, path };
}

function run(root, args = []) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env },
  });
}

check("CLI reads the sanctioned state without closing, revoking, or rewriting it", () => {
  const payload = `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "storm-operational-control", planPath: "specs/storm/implementation-plan.md", phase: "implementation" },
    planApproved: true,
    planApproval: { approvedBy: "po", approvedAt: "2026-07-17T21:18:45.687Z" },
    closedFeatures: [{ id: "p3b", planPath: "specs/p3b.md", phaseAtClose: "close", closedAt: "2026-07-17T20:00:00.000Z", closedBy: "po", forCommit: "d".repeat(40) }],
    updatedAt: "2026-07-17T21:18:45.687Z",
  }, null, 2)}\n`;
  const { root, path } = project("read-only", payload);
  const before = readFileSync(path, "utf8");
  const result = run(root);
  const after = readFileSync(path, "utf8");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(after, before, "reader must preserve pipeline-state bytes exactly");
  assert.equal(existsSync(join(root, ".claude", "pipeline-state.json.lock")), false, "reader must not acquire a writer lock");
  const output = JSON.parse(result.stdout);
  assert.equal(output.activeFeature.id, "storm-operational-control");
  assert.equal(output.activeFeature.phase, "implementation");
  assert.deepEqual(output.resume, { mode: "resume-on-next-turn", reasonCode: "host-no-background-wakeup" });
  assert.equal(output.eta.state, "unknown");
  const persisted = JSON.parse(after);
  assert.equal(persisted.planApproved, true, "reader must not revoke plan approval");
  assert.equal(persisted.activeFeature.id, "storm-operational-control", "reader must not close current work");
  assert.equal(persisted.closedFeatures.length, 1, "reader must not append a closure");
});

check("CLI reports a malformed state without attempting a repair", () => {
  const { root, path } = project("malformed", "{ bad json\n");
  const before = readFileSync(path, "utf8");
  const result = run(root);
  assert.equal(result.status, 2);
  assert.equal(readFileSync(path, "utf8"), before);
  const output = JSON.parse(result.stdout);
  assert.equal(output.code, "CS-STATUS-STATE-MALFORMED");
});

check("CLI has no implicit background capability; it must be explicitly supplied", () => {
  const payload = `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "storm-operational-control", planPath: "specs/storm/implementation-plan.md", phase: "implementation" },
  })}\n`;
  const { root } = project("host-mode", payload);
  const defaultOutput = JSON.parse(run(root).stdout);
  const evidencedOutput = JSON.parse(run(root, ["--host-supports-background"]).stdout);
  assert.equal(defaultOutput.resume.mode, "resume-on-next-turn");
  assert.equal(evidencedOutput.resume.mode, "immediate");
});

rmSync(ROOT, { recursive: true, force: true });
process.stdout.write(`1..${passed}\n`);
