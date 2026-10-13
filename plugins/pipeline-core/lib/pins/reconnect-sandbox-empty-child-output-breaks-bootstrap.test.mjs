#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.reconnect-sandbox-empty-child-output-breaks-bootstrap (AC-242).
// A zero-exit nested child with empty stdout must become a typed, read-only host
// recovery (not an opaque JSON.parse failure), stay distinguishable from a valid
// result and from malformed private state, and the real bootstrap readback must
// still complete on an ordinary root.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readGovernanceEnrollmentRetirement } from "../governance-scope.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const LIB = resolve(HERE, "..");
const WRITER = resolve(LIB, "..", "scripts", "pipeline-state.mjs");
const CLI = resolve(LIB, "..", "scripts", "project-onboarding-v3.mjs");
// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const BASE = join(REPO, "scratch", "reconnect-empty-child-output-pin");

function gitRoot() {
  mkdirSync(BASE, { recursive: true });
  const root = mkdtempSync(join(BASE, "fx-"));
  const r = spawnSync("git", ["init", "--initial-branch=main"], { cwd: root, encoding: "utf8", timeout: 20000, shell: false });
  if (r.status !== 0) { rmSync(root, { recursive: true, force: true }); return { skip: `host-limitation: git init unavailable (${r.error?.code ?? r.status})` }; }
  return { root };
}
const cleanup = (root) => rmSync(root, { recursive: true, force: true });
const VALID = JSON.stringify({ schema: "pipeline.enrollment-retirement-inspection.v1", journal: null });

test("zero-exit empty, whitespace-only and non-string child output yield the typed EMPTY error with an exact read-only retry", (t) => {
  const g = gitRoot(); if (g.skip) return t.skip(g.skip);
  try {
    for (const out of ["", "  \n\t ", undefined, null]) {
      let caught;
      try { readGovernanceEnrollmentRetirement({ rootDir: g.root, exec: () => out }); } catch (e) { caught = e; }
      assert.ok(caught, `no throw for ${JSON.stringify(out)}`);
      assert.equal(caught.code, "GS-RETIREMENT-READBACK-EMPTY");
      assert.ok(!(caught instanceof SyntaxError), "must not be an opaque JSON parse failure");
      const na = caught.nextAction;
      assert.equal(na.kind, "command");
      assert.equal(na.mutation, false);
      assert.equal(na.requiresConfirmation, false);
      assert.equal(na.retry.maxAttempts, 1);
      assert.ok(typeof na.executionBoundary === "string" && na.executionBoundary.length > 0);
      assert.deepEqual(na.argv, [WRITER, "inspect-enrollment-retirement", "--root", g.root]);
      assert.equal(na.expected.schema, "pipeline.enrollment-retirement-inspection.v1");
    }
  } finally { cleanup(g.root); }
});

test("an ordinary valid child result is returned and is not any readback error", (t) => {
  const g = gitRoot(); if (g.skip) return t.skip(g.skip);
  try {
    assert.equal(readGovernanceEnrollmentRetirement({ rootDir: g.root, exec: () => VALID }), null);
    const journal = { phase: "pending" };
    const got = readGovernanceEnrollmentRetirement({ rootDir: g.root, exec: () => JSON.stringify({ schema: "pipeline.enrollment-retirement-inspection.v1", journal }) });
    assert.deepEqual(got, journal);
  } finally { cleanup(g.root); }
});

test("malformed or wrong-schema child output is a different typed failure from empty and fails closed", (t) => {
  const g = gitRoot(); if (g.skip) return t.skip(g.skip);
  try {
    const code = (out) => { try { readGovernanceEnrollmentRetirement({ rootDir: g.root, exec: () => out }); } catch (e) { return e; } return null; };
    const bad = code("{");
    assert.equal(bad.code, "GS-RETIREMENT-READBACK-INVALID");
    assert.equal(bad.nextAction, undefined, "malformed private state must not offer a transport retry");
    assert.equal(code("not json").code, "GS-RETIREMENT-READBACK-INVALID");
    assert.equal(code(JSON.stringify({ schema: "other.v1", journal: null })).code, "GS-RETIREMENT-INSPECTION");
    assert.notEqual(bad.code, "GS-RETIREMENT-READBACK-EMPTY");
  } finally { cleanup(g.root); }
});

test("a throwing child is propagated, not rewritten as empty output", (t) => {
  const g = gitRoot(); if (g.skip) return t.skip(g.skip);
  try {
    const boom = new Error("child failed");
    assert.throws(() => readGovernanceEnrollmentRetirement({ rootDir: g.root, exec: () => { throw boom; } }), (e) => e === boom);
  } finally { cleanup(g.root); }
});

test("structural: inspect maps EMPTY to the typed host recovery, rethrows malformed readback, and never offers approval", () => {
  const source = readFileSync(join(LIB, "project-onboarding-v3.mjs"), "utf8");
  const start = source.indexOf("export function inspectProjectOnboardingV3");
  const body = source.slice(start, source.indexOf("export function planProjectOnboardingV3", start));
  const empty = body.indexOf('error.code==="GS-RETIREMENT-READBACK-EMPTY"');
  assert.ok(empty > 0);
  const branch = body.slice(empty, body.indexOf('if(!["GS-NONGIT-RETAINED-HISTORY"', empty));
  assert.match(branch, /status:"enrollment-history-recovery-required"/);
  assert.match(branch, /mutation:false,requiresConfirmation:false/);
  assert.match(branch, /executionBoundary:"host-authorized-wsl"/);
  assert.match(branch, /"inspect","--root",root,"--intent",intent,"--runner",runner/);
  // INVALID is not in the recovery allow-list, so it reaches `throw error` (fail closed).
  assert.ok(!/READBACK-INVALID/.test(body));
  assert.match(body, /\.includes\(error\.code\)\)throw error;/);
});

test("real bootstrap readback: the CLI inspect on an ordinary Git root completes with parseable JSON and no recovery status", (t) => {
  const g = gitRoot(); if (g.skip) return t.skip(g.skip);
  try {
    const r = spawnSync(process.execPath, [CLI, "inspect", "--root", g.root, "--runner", "codex", "--intent", "session"], { encoding: "utf8", timeout: 60000, shell: false });
    assert.ok(r.stdout.trim().length > 0, `empty stdout; stderr=${String(r.stderr).slice(0, 300)}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(typeof parsed.status === "string");
    assert.notEqual(parsed.status, "enrollment-history-recovery-required");
    assert.ok(!/Unexpected end of JSON input/.test(r.stderr ?? ""));
  } finally { cleanup(g.root); }
});
