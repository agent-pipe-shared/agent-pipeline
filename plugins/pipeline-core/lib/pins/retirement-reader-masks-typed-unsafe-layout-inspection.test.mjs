#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.retirement-reader-masks-typed-unsafe-layout-inspection (AC-243).
// inspectProjectOnboardingV3 must return its already-typed `unsafe` result for a
// rejected physical layout and must not run the enrollment retirement reader
// against it; admitted roots keep the reader and its error discipline.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { inspectProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { readGovernanceEnrollmentRetirement } from "../governance-scope.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
// Host fact: fixtures live under the repository scratch/, never the OS temp dir.
const BASE = join(REPO, "scratch", "retirement-reader-unsafe-pin");

function fixture() { mkdirSync(BASE, { recursive: true }); return mkdtempSync(join(BASE, "fx-")); }
// Directory symlinks need privilege on native Windows; a junction is the
// unprivileged equivalent and lstat reports it as a symbolic link. When neither
// can be created the case is skipped with a typed host-limitation reason.
function dirLink(target, path) {
  try { symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir"); return null; }
  catch (error) { return `host-limitation: directory link unavailable (${error.code})`; }
}
function cleanup() { rmSync(BASE, { recursive: true, force: true }); }

test("a symlink/junction root yields the typed unsafe result, not a GS-ALIAS throw", (t) => {
  const real = fixture(); const alias = join(fixture(), "alias");
  try {
    const skip = dirLink(real, alias); if (skip) return t.skip(skip);
    // Precondition: the retirement reader on this alias DOES throw GS-ALIAS, so a
    // regression that calls it first would mask the typed result.
    assert.throws(() => readGovernanceEnrollmentRetirement({ rootDir: alias }), (e) => e.code === "GS-ALIAS" || /GS-ALIAS/.test(String(e.message)));
    const result = inspectProjectOnboardingV3({ runner: "codex", rootDir: alias });
    assert.equal(result.status, "unsafe");
    assert.equal(result.root, null);
    assert.equal(result.diagnostics[0].code, "root_symlink_rejected");
    assert.equal(result.repository.status, "unavailable");
  } finally { cleanup(); }
});

test("an unsafe descendant layout yields the typed unsafe result with its root and repository diagnostics", (t) => {
  const outside = fixture(); const unsafe = fixture(); const unsafeClaude = fixture();
  try {
    let skip = dirLink(outside, join(unsafe, "linked")); if (skip) return t.skip(skip);
    skip = dirLink(outside, join(unsafeClaude, ".claude")); if (skip) return t.skip(skip);
    for (const rootDir of [unsafe, unsafeClaude]) {
      const result = inspectProjectOnboardingV3({ runner: "codex", rootDir });
      assert.equal(result.status, "unsafe", rootDir);
      assert.ok(result.root !== null, "descendant rejection keeps the resolved root");
      assert.ok(Array.isArray(result.diagnostics) && result.diagnostics.length > 0);
      assert.ok(result.repository && typeof result.repository.status === "string");
    }
  } finally { cleanup(); }
});

test("the unsafe-layout inspection does not mutate the rejected layout", (t) => {
  const outside = fixture(); const unsafe = fixture();
  try {
    const skip = dirLink(outside, join(unsafe, "linked")); if (skip) return t.skip(skip);
    inspectProjectOnboardingV3({ runner: "codex", rootDir: unsafe });
    assert.deepEqual(readdirNames(unsafe), ["linked"]);
  } finally { cleanup(); }
});
function readdirNames(path) { return Array.from(readdirSyncCompat(path)).sort(); }
import { readdirSync as readdirSyncCompat } from "node:fs";

test("an admitted root still reaches the retirement reader and does not read as unsafe", () => {
  const admitted = fixture();
  try {
    writeFileSync(join(admitted, "README.md"), "existing\n");
    const result = inspectProjectOnboardingV3({ runner: "codex", rootDir: admitted });
    assert.notEqual(result.status, "unsafe");
    assert.notEqual(result.root, null);
  } finally { cleanup(); }
});

test("structural: the typed early return precedes the reader and enrollment errors on admitted roots are not swallowed", () => {
  // Structural pin (the retired-history refusal path cannot be provoked from a
  // scratch fixture on this host): order and rethrow discipline of the source.
  const source = readFileSync(join(HERE, "..", "project-onboarding-v3.mjs"), "utf8");
  const start = source.indexOf("export function inspectProjectOnboardingV3");
  const body = source.slice(start, source.indexOf("export function planProjectOnboardingV3", start));
  const early = body.indexOf('if (result.root === null || result.status === "unsafe") return result;');
  const read = body.indexOf("readGovernanceEnrollmentRetirement(");
  assert.ok(early > 0 && read > early, "early typed return must precede the retirement reader call");
  assert.match(body, /if\(!\["GS-NONGIT-RETAINED-HISTORY","GS-HOST-MANAGED-RETAINED-HISTORY"\]\.includes\(error\.code\)\)throw error;/);
});
