#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Sanctioned fixture-tmpdir helper for this repository's OWN Node test suites.
 *
 * WHY. `mkdtempSync(join(tmpdir(), prefix))` -- the idiomatic Node pattern --
 * points at the HOST `/tmp`, not this repo's own `scratch/` convention
 * (`session-bootstrap.md`; `skills/pipeline-start/SKILL.md` "Scratch space":
 * "Never a host-temp path -- the guard refuses a write outside the project
 * root"). Test suites that skip cleanup -- deliberately, for crash-simulation
 * fixtures that must survive to prove recovery, or simply because nobody
 * wired an afterEach -- accumulate invisibly on host `/tmp`, shared across
 * every repo and session on the machine, until the host's own inode/byte
 * budget is exhausted. Confirmed 2026-08-17: two suites alone
 * (`onboarding-continuity`, `pipeline-state-inspection-contract`) left roughly
 * 13,000+ directories in host `/tmp` over ~28h of test runs, driving a tmpfs
 * mount from 1,048,576 inodes to 100% used and eventually blocking `git`
 * itself with ENOSPC -- a genuine work stoppage, not just test-suite untidiness
 * (backlog/items/2026-08-17-test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention.md).
 *
 * `scratch/` is already gitignore-covered at the project root (`/scratch/` in
 * `.gitignore`) and already exempt, unconditionally, from every write guard
 * (`guard-devplan.mjs`: "scratch/: UNCONDITIONAL allow, before any gate
 * evaluation"). `scratch/test-tmp/` is this helper's own leaf under that
 * existing convention, so every fixture it creates is inspectable and
 * cleanable in bulk with ordinary repo mechanisms (`git clean -fdx --
 * scratch/test-tmp/`, or a narrower sweep) instead of being lost among
 * unrelated host `/tmp` content shared by other repos and tools.
 *
 * SCOPE. This is the sanctioned pattern for NEW or touched suites going
 * forward -- a full repo-wide migration of every existing
 * `mkdtempSync(tmpdir())` call site is a separate, deliberately deferred
 * follow-up (too large/risky to land in one dispatch; see the backlog item
 * above). This module does not add automatic cleanup: a suite that
 * deliberately never cleans up its fixtures (crash-simulation tests proving
 * recovery-from-interruption) keeps that behaviour, just relocated under
 * `scratch/test-tmp/` where it is bounded and bulk-cleanable rather than lost
 * in host `/tmp`. Pair with `test-tmpdir-budget.mjs` to catch runaway
 * accumulation before it becomes a host-exhaustion incident again.
 */
import { mkdirSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** plugins/pipeline-core/lib -> repository root is three levels up. */
export const DEFAULT_TEST_TMP_ROOT_BASE = resolve(HERE, "..", "..", "..");

/** The repo-local root every fixture this helper creates lives under. */
export function testTmpRoot(base = DEFAULT_TEST_TMP_ROOT_BASE) {
  return join(base, "scratch", "test-tmp");
}

/**
 * Create a fresh, uniquely-named fixture directory under this repo's own
 * `scratch/test-tmp/`, mirroring `mkdtempSync(join(tmpdir(), prefix))`'s call
 * shape so existing call sites are a near-drop-in swap: replace
 *
 *   mkdtempSync(join(tmpdir(), prefix))
 *
 * with
 *
 *   mkdtempTestScratch(prefix)
 *
 * `prefix` is sanitized to a single path segment (no separators, no `..`) so
 * a caller cannot escape `scratch/test-tmp/` by passing a path-shaped prefix;
 * this is a defensive guard for a fixture helper invoked by test code, not a
 * security boundary against an adversarial caller.
 *
 * @param {string} prefix   same shape as the `mkdtempSync` prefix argument
 * @param {string} [base]   repository root override, for this module's own tests
 * @returns {string} absolute path to the newly created directory
 */
export function mkdtempTestScratch(prefix, base = DEFAULT_TEST_TMP_ROOT_BASE) {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new TypeError("mkdtempTestScratch: prefix must be a non-empty string");
  }
  if (prefix.includes("/") || prefix.includes("\\") || prefix.includes("..")) {
    throw new TypeError("mkdtempTestScratch: prefix must not contain path separators or '..'");
  }
  const root = testTmpRoot(base);
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, prefix));
}
