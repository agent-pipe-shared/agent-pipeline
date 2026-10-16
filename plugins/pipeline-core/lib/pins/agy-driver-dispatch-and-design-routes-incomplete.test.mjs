// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.agy-driver-dispatch-and-design-routes-incomplete (AC-108),
// slice ALF-C-P20-12B: Antigravity bootstrap lock freshness and per-session isolation.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
// Env seam: lets a scratch mirror of an older hook file be pinned for RED runs.
const LOCK_MODULE = process.env.AGY_BOOTSTRAP_LOCK_MODULE
  || join(REPO, "plugins/pipeline-core/hooks/antigravity-bootstrap-lock.mjs");
const { armAntigravityBootstrapSession } = await import(pathToFileURL(LOCK_MODULE).href);

const FIXTURES = join(REPO, "scratch", "p2012b");
const VERSION = "9.9.9-fixture";
const STALE_MS = 40 * 60 * 1000;

function sessionDir(name) {
  const dir = join(FIXTURES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
function age(file, ms) {
  const t = new Date(Date.now() - ms);
  utimesSync(file, t, t);
}

test("an expired lock of the SAME session is refreshed on re-arm without re-arming the barrier", () => {
  const dir = sessionDir("same-session");
  armAntigravityBootstrapSession(dir, VERSION);
  const lock = join(dir, "requires-bootstrap.lock");
  const pending = join(dir, "requires-bootstrap.pending");
  rmSync(pending); // barrier already consumed
  age(lock, STALE_MS);
  const before = statSync(lock).mtimeMs;
  const result = armAntigravityBootstrapSession(dir, VERSION);
  assert.equal(result.status, "already-armed");
  assert.ok(statSync(lock).mtimeMs > before + 30 * 60 * 1000, "stale lock mtime must be renewed");
  assert.equal(existsSync(pending), false, "a consumed barrier is never re-armed");
});

test("re-arming one session never touches another session's lock", () => {
  const a = sessionDir("session-a");
  const b = sessionDir("session-b");
  armAntigravityBootstrapSession(a, VERSION);
  armAntigravityBootstrapSession(b, VERSION);
  const lockB = join(b, "requires-bootstrap.lock");
  age(lockB, STALE_MS);
  const beforeB = statSync(lockB).mtimeMs;
  age(join(a, "requires-bootstrap.lock"), STALE_MS);
  armAntigravityBootstrapSession(a, VERSION);
  assert.equal(statSync(lockB).mtimeMs, beforeB, "session B lock mtime is untouched by session A re-arm");
});

test("a fresh lock is not rewritten by a ready re-arm", () => {
  const dir = sessionDir("fresh");
  armAntigravityBootstrapSession(dir, VERSION);
  const lock = join(dir, "requires-bootstrap.lock");
  const t = new Date(Date.now() - 60 * 1000);
  utimesSync(lock, t, t);
  const before = statSync(lock).mtimeMs;
  const result = armAntigravityBootstrapSession(dir, VERSION);
  assert.equal(result.wrote, false);
  assert.equal(statSync(lock).mtimeMs, before);
  writeFileSync(join(dir, ".done"), "");
});
