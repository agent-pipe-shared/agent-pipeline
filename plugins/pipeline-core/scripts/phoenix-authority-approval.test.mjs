#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * phoenix-authority-approval.test.mjs — first test coverage for
 * scripts/phoenix-authority-approval.mjs, scoped to
 * PHX-WP-POHUMAN-SIGNING-ERGO fix 4: the usage string must name the
 * interactive-terminal requirement for `approve`, so the requirement is
 * discoverable before the first attempt rather than after it (a bad `--kind`/
 * missing-flag call already surfaces the usage string through the existing
 * `args()` validation, which this test exercises rather than fixturing a full
 * prepare/approve/verify round trip — that ceremony already reads a real
 * external `trust-policy.json` and private key, out of scope here).
 *
 * A direct isTTY-precheck unit test is intentionally NOT included: spawnSync/
 * TTY behavior is awkward to fixture deterministically (process.stdin/stdout
 * are read-only accessors in Node, not writable for a substitute value from a
 * test), so this suite proves only the usage-string half of fix 4 per the
 * DoD's explicit "optional if awkward to construct" allowance.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { run } from "./phoenix-authority-approval.mjs";

test("a missing --proposal surfaces the usage string, which names the interactive-terminal requirement for approve", () => {
  assert.throws(
    () => run(["approve", "--repo-root", "/repo", "--directory", "/external"]),
    /interactive terminal/u,
  );
});

test("an unknown command surfaces the same usage string, naming the interactive-terminal requirement", () => {
  assert.throws(
    () => run(["bogus", "--repo-root", "/repo", "--directory", "/external", "--proposal", "p.json"]),
    /approve must run in an interactive terminal — it prompts for the private key passphrase/u,
  );
});
