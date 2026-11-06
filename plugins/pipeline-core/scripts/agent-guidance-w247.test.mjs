// SPDX-License-Identifier: SUL-1.0
// C19K-W247 agent guidance (AC-108): a refusal names the full working command, the stop-failure context names the dispatch that
// just stopped, and a failed native observation says why in the authority trace. Plain node:test; needs registration in Verify.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nativeGoldfishHookMessage, readNativeGoldfishStopFailure } from "../hooks/native-goldfish-host.mjs";
import { CANCEL_CLASSES } from "../lib/slice-queue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, "..");
const SCRATCH = resolve(PLUGIN, "..", "..", "scratch", "W247-guidance");
const sandboxes = [];
function sandbox() { mkdirSync(SCRATCH, { recursive: true }); const dir = mkdtempSync(join(SCRATCH, "t-")); sandboxes.push(dir); return dir; }
test.after(() => { for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true }); });

function cli(cwd, args) {
  const child = spawnSync(process.execPath, [join(HERE, "slice-queue.mjs"), ...args], { cwd, encoding: "utf8", timeout: 30_000 });
  let json = null; try { json = JSON.parse(child.stdout); } catch { /* asserted by the caller */ }
  return { status: child.status, json };
}
function queueFile(dir) {
  const rel = "specs/demo/slice-queue.json";
  mkdirSync(join(dir, "specs", "demo"), { recursive: true });
  writeFileSync(join(dir, ...rel.split("/")), `${JSON.stringify({ schema: "pipeline.slice-queue.v1", feature: "demo", slices: [{ id: "A", title: "a", state: "ready", writeScope: ["a.mjs"], tier: "implementor", commitMode: "diff-only", loadClass: "light" }] })}\n`);
  return rel;
}

test("W247-1 a bare cancel refusal names every required flag, the class list and --started in one message", () => {
  const dir = sandbox();
  const result = cli(dir, ["cancel", "A", "--queue", queueFile(dir)]);
  assert.equal(result.status, 2);
  const message = result.json.message;
  for (const part of ["--reason", "--class", "[--started]", ...CANCEL_CLASSES, "Full command: cancel <id>"]) assert.ok(message.includes(part), `names ${part}`);
});

test("W247-2 a refusal that misses only --reason or only --class still carries the full command and says when --started applies", () => {
  const dir = sandbox();
  const rel = queueFile(dir);
  for (const args of [["--class", "budget"], ["--reason", "x"]]) {
    const result = cli(dir, ["cancel", "A", "--queue", rel, ...args]);
    assert.equal(result.status, 2);
    assert.match(result.json.message, /Full command: cancel <id> \[--started\] --reason "<why>" --class </u);
    assert.match(result.json.message, /add --started only when the slice was already started/u);
  }
  const add = cli(dir, ["add", "--queue", rel]);
  assert.match(add.json.message, /--id, --title, --write-scope are required\. Full command: add --id/u, "add names all three missing flags at once");
});

test("W247-3 with two stop-failure records the hook context names the dispatch that just stopped and lists the other", () => {
  const dir = sandbox();
  const diagnostics = join(dir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
  mkdirSync(diagnostics, { recursive: true });
  const record = (id, observedAt, extra = {}) => writeFileSync(join(diagnostics, `stop-failure-${id}.json`), JSON.stringify({
    schema: "pipeline.native-goldfish-host-stop-failure.v1", code: "SDC-AUTHORITY-UNAVAILABLE", dispatchId: id, observedAt, stage: "authority-terminal-prepare", reason: "native-managed-repository-drift", ...extra }));
  record("gf-probe-34", "2026-11-06T09:00:00.000Z");
  record("gf-probe-41", "2026-11-06T10:00:00.000Z");
  const older = readNativeGoldfishStopFailure({ commonDir: dir, dispatchId: "gf-probe-34" });
  assert.equal(older.dispatchId, "gf-probe-34", "the record of the dispatch that just stopped wins over a newer one");
  assert.equal(older.others[0].dispatchId, "gf-probe-41");
  const newest = readNativeGoldfishStopFailure({ commonDir: dir });
  assert.equal(newest.dispatchId, "gf-probe-41", "without a dispatch id the newest record is shown");
  const message = nativeGoldfishHookMessage({ status: "not-applicable" }, { stopFailure: newest });
  for (const part of ["gf-probe-41", "SDC-AUTHORITY-UNAVAILABLE", "stage authority-terminal-prepare", "reason native-managed-repository-drift", "Other unresolved stop-failure records", "gf-probe-34"]) assert.ok(message.includes(part), `names ${part}`);
});

test("W247-4 a failed native observation appears in the trace line with operation, site and a bounded code, and no path", () => {
  const dir = sandbox();
  const traceFile = join(dir, "trace.jsonl");
  const state = pathToFileURL(join(PLUGIN, "lib", "windows-private-state.mjs")).href;
  const hook = pathToFileURL(join(PLUGIN, "lib", "authority-trace-hook.mjs")).href;
  const body = `import { installHookAuthorityTrace } from ${JSON.stringify(hook)};
await installHookAuthorityTrace({ hook: "w247" });
const { recordNativeFailure } = await import(${JSON.stringify(state)});
recordNativeFailure("publish-file", "exit 1, ETIMEDOUT");
`;
  const script = join(dir, "child.mjs");
  writeFileSync(script, body);
  const child = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PIPELINE_AUTHORITY_TRACE: "1", PIPELINE_AUTHORITY_TRACE_FILE: traceFile } });
  assert.equal(child.status, 0, child.stderr);
  const line = readFileSyncText(traceFile, "utf8").trim().split("\n").at(-1);
  const failures = JSON.parse(line).nativeObservations.failures;
  assert.equal(failures.length, 1);
  assert.equal(failures[0].operation, "publish-file");
  assert.equal(failures[0].code, "exit 1, ETIMEDOUT");
  assert.match(failures[0].site, /^child\.mjs:\d+$/u, "file:line only");
  assert.ok(!line.includes(dir), "the trace line carries no path");
});

import { readFileSync as readFileSyncText } from "node:fs";
