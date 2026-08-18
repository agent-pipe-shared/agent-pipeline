#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression test for the 2026-08-18 `.gitignore` anchoring audit (backlog
 * `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`,
 * ADR-0063 point 2, dispatch NVA-SWEEP-I2).
 *
 * Deliberately narrow: this pins the specific bug this audit found and fixed,
 * not a generic scanner over every ignore rule. ADR-0063's own deferred
 * follow-up 3 -- a Verify gate asserting every ignore rule in the file is
 * anchored or justified -- needs `harness/scripts/verify.mjs`, which is
 * TP-3-protected (no in-session override); that gate is explicitly excluded
 * from this dispatch's scope and stays a named, unbuilt obligation.
 *
 * The bug: this repository's own root `.gitignore` carried a bare `scratch/`
 * line, matching the directory at ANY depth -- the same shape of bug that
 * once let an unanchored `evidence/` line swallow `backlog/evidence/`
 * (fixed 2026-08-09). `project-onboarding-v3.mjs`'s `PROJECT_IGNORE_SEED`
 * already writes `/scratch/` anchored for every consumer project this repo
 * onboards; the source repo that teaches the anchored form did not itself
 * follow it until this fix.
 *
 * This file is not wired into `verify.mjs`'s `TEST_SUITES` (TP-3, out of
 * reach here) and will show as "unaccounted" in
 * `check-suite-registration.mjs`'s diagnostic -- a disclosed, known gap,
 * the same shape already accepted for other standalone diagnostics in this
 * codebase.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ignoreText = readFileSync(join(repoRoot, ".gitignore"), "utf8");
const lines = ignoreText.split("\n");

test("scratch/ is anchored (/scratch/), matching the form onboarding writes for consumer projects", () => {
  assert.ok(!lines.includes("scratch/"), "a bare, unanchored `scratch/` line must not reappear");
  assert.ok(lines.includes("/scratch/"), "the anchored `/scratch/` line must be present");
});

test("the /scratch/ anchoring is explained and traceable to ADR-0063 and the consumer-seed precedent", () => {
  const scratchIndex = lines.indexOf("/scratch/");
  assert.ok(scratchIndex > 0, "/scratch/ must exist in the file");
  const nearby = lines.slice(Math.max(0, scratchIndex - 9), scratchIndex).join("\n");
  assert.match(nearby, /ADR-0063/u);
  assert.match(nearby, /PROJECT_IGNORE_SEED/u);
  assert.match(nearby, /ANCHORED/iu);
});

test(".vscode/ and .idea/ stay deliberately unanchored, with a stated justification rather than silence", () => {
  assert.ok(lines.includes(".vscode/"));
  assert.ok(lines.includes(".idea/"));
  const editorsIndex = lines.findIndex((line) => line.includes("# Editors"));
  assert.ok(editorsIndex >= 0, "the Editors section header must exist");
  const nearby = lines.slice(editorsIndex, editorsIndex + 6).join("\n");
  assert.match(nearby, /deliberately unanchored/u);
  assert.match(nearby, /ADR-0063/u);
});

test("every other directory-name-only pattern in the file is anchored with a leading slash", () => {
  // A directory-only pattern: ends in a single trailing slash and contains no
  // other slash (an internal slash already anchors a pattern to the .gitignore's
  // own directory per git's own semantics, regardless of a leading slash).
  const directoryOnly = (line) => /^[^#\s].*\/$/u.test(line) && line.slice(0, -1).indexOf("/") === -1;
  const justified = new Set([".vscode/", ".idea/"]); // audited and intentionally depth-unbounded, see above
  const offenders = lines.filter((line) => directoryOnly(line) && !line.startsWith("/") && !justified.has(line));
  assert.deepEqual(offenders, [], `unaudited, unanchored directory pattern(s): ${offenders.join(", ")}`);
});

process.stdout.write("check-gitignore-anchoring: root .gitignore anchoring audit checks passed\n");
