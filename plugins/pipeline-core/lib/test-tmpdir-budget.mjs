#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Size/count budget check for `scratch/test-tmp/` (`test-tmpdir.mjs`'s own
 * root), mirroring `bootstrap-payload-budget.mjs`'s measurement pattern: a
 * pure function returning a frozen, schema-tagged measurement object with an
 * explicit `withinBudget` boolean, plus a single owning constant per bound
 * so no call site restates the number.
 *
 * WHY. Relocating test fixtures off host `/tmp` and onto `scratch/test-tmp/`
 * (`test-tmpdir.mjs`) removes the *host-exhaustion* failure mode but not the
 * *accumulation* itself -- suites that never clean up (crash-simulation
 * fixtures, by design; anything else, by omission) still grow without bound,
 * just inside this repo's own tree instead of the host's shared one. This
 * module is the loud, early failure the backlog item asked for: a check that
 * fails long before the next `/tmp`-style exhaustion incident, by bounding
 * `scratch/test-tmp/`'s own byte and entry count directly
 * (backlog/items/2026-08-17-test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention.md).
 *
 * WIRING NOTE. This repository's own canonical verify entry point (in its
 * harness scripts directory) is TP-3-protected (self-documented at its own
 * file head); a Goldfish dispatch does not hold the ceremony to edit it. This
 * module is written to be registered there exactly like the existing
 * `state-budget-tests`/`state-budget-check` pair
 * (`{ name: "test-tmp-budget-tests", file: join(libDir,
 * "test-tmpdir-budget.test.mjs") }` and `{ name: "test-tmp-budget-check",
 * file: join(libDir, "test-tmpdir-budget.mjs") }`) -- but that registration
 * itself is deliberately left to whoever next holds edit access to
 * `verify.mjs` (an Elephant session, or a future dispatch carrying the
 * ceremony), not performed here. Until then this check is runnable directly:
 * `node plugins/pipeline-core/lib/test-tmpdir-budget.mjs`.
 */
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { DEFAULT_TEST_TMP_ROOT_BASE, testTmpRoot } from "./test-tmpdir.mjs";
import { isDirectInvocation } from "./entrypoint.mjs";

export const TEST_TMP_BUDGET_SCHEMA = "pipeline.test-tmp-budget-measurement.v1";

/**
 * First-cut canary bounds, deliberately well below the host-exhaustion event
 * that motivated this check (a tmpfs mount driven from 1,048,576 inodes to
 * 100% used): an order of magnitude fewer entries, and a byte bound generous
 * enough for normal fixture content but tight enough to catch a runaway
 * suite within a day or two of unattended test runs. Like
 * `BOOTSTRAP_PAYLOAD_MAX_BYTES`, THE single owner of these numbers is this
 * module -- raise them here, on an explicit PO decision, not at a call site.
 *
 * ENTRIES BOUND REVISED 2026-08-26 (VFX3-TMPDIR, sprint_phoenix merge into
 * feat/sprint-nova-codex-v046): this module existed only on the Nova side
 * pre-merge, so 40,000 was calibrated to Nova's own corpus alone. Measured
 * usage right after the merge landed was 68,488 entries / ~51.6 MB (well
 * under the byte bound) -- both branches' crash-simulation fixture suites
 * (`onboarding-continuity.test.mjs` and others, none of which clean up their
 * `mkdtempTestScratch()` output by design; see `test-tmpdir.mjs`) now share
 * one `scratch/test-tmp/` accumulation point across repeated verify runs.
 * Raised to 150,000 -- still an order of magnitude below the historical
 * 1,048,576-inode incident, with headroom over the measured post-merge
 * figure for continued accumulation across a verify-fixing session. Bytes
 * left untouched: 51.6 MB is nowhere near the existing 500 MiB bound. This
 * remains a canary for runaway growth, not a structural corpus-size fact --
 * periodic bulk cleanup (`git clean -fdx -- scratch/test-tmp/`, an
 * operator/Elephant action, not a Goldfish one) is the actual maintenance
 * step; raising the bound only buys headroom, it does not stop the growth.
 */
export const TEST_TMP_MAX_BYTES = 500 * 1024 * 1024; // 500 MiB
export const TEST_TMP_MAX_ENTRIES = 150_000; // files + directories, combined (was 40_000 pre-merge)

function walk(root) {
  let bytes = 0;
  let entries = 0;
  const findings = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let listing;
    try {
      listing = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      findings.push(`unreadable directory: ${current} (${error.code ?? error.message})`);
      continue;
    }
    for (const entry of listing) {
      entries += 1;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue; // counted above; never followed
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      try {
        bytes += statSync(full).size;
      } catch {
        // Entry vanished between readdir and stat (a concurrent test run
        // cleaning up its own fixture) -- not a measurement failure.
      }
    }
  }
  return { bytes, entries, findings };
}

/**
 * Measure `scratch/test-tmp/`'s current on-disk footprint.
 *
 * @param {string} [base] repository root override, for this module's own tests
 * @param {object} [options]
 * @param {number} [options.maxBytes] bound override, for this module's own tests --
 *   production call sites (including the direct-invocation CLI below) always use
 *   `TEST_TMP_MAX_BYTES`; exercising the real 500 MiB/20,000-entry "exceeds" branches
 *   would mean manufacturing that much real fixture content in a test, which is
 *   exactly the accumulation this check exists to catch.
 * @param {number} [options.maxEntries] bound override, same rationale as `maxBytes`
 * @returns {Readonly<object>} frozen measurement, schema `pipeline.test-tmp-budget-measurement.v1`
 */
export function measureTestTmpUsage(base = DEFAULT_TEST_TMP_ROOT_BASE, { maxBytes = TEST_TMP_MAX_BYTES, maxEntries = TEST_TMP_MAX_ENTRIES } = {}) {
  const root = testTmpRoot(base);
  let bytes = 0;
  let entries = 0;
  let findings = [];
  try {
    statSync(root);
    ({ bytes, entries, findings } = walk(root));
  } catch {
    // scratch/test-tmp/ does not exist yet: zero usage, not a failure.
  }
  return Object.freeze({
    schema: TEST_TMP_BUDGET_SCHEMA,
    root,
    bytes,
    entries,
    maxBytes,
    maxEntries,
    withinBudget: findings.length === 0 && bytes <= maxBytes && entries <= maxEntries,
    findings: Object.freeze(findings),
  });
}

if (isDirectInvocation(import.meta.url)) {
  let base = DEFAULT_TEST_TMP_ROOT_BASE;
  if (process.argv.length > 2) {
    if (process.argv.length !== 4 || process.argv[2] !== "--base" || process.argv[3].length === 0) {
      console.error("Usage: node test-tmpdir-budget.mjs [--base <repository-root>]");
      process.exit(2);
    }
    base = resolve(process.argv[3]);
  }
  const measured = measureTestTmpUsage(base);
  for (const finding of measured.findings) console.error(`FAIL test-tmp budget: ${finding}`);
  if (measured.bytes > measured.maxBytes) {
    console.error(`FAIL test-tmp budget: ${measured.bytes} bytes under ${measured.root} exceeds max ${measured.maxBytes}`);
  }
  if (measured.entries > measured.maxEntries) {
    console.error(`FAIL test-tmp budget: ${measured.entries} entries under ${measured.root} exceeds max ${measured.maxEntries}`);
  }
  if (!measured.withinBudget) process.exit(2);
  console.log(`test-tmp budget OK: ${measured.bytes} bytes, ${measured.entries} entries under ${measured.root}`);
}
