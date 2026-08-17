#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Unit coverage for the NVA-A1214-SUCCESS-1 parameterization of
 * `execution-plane-launch.mjs`: the `--fixture-exit-code` flag and the fixture
 * block it feeds. Deterministic and pure -- this suite spawns no child
 * process, drives no supervisor, and seals no evidence.
 *
 * WHY IT CAN IMPORT THE LAUNCHER AT ALL. Until this dispatch the launcher ran
 * `await main()` unconditionally at module load, so importing it for any
 * reason performed a real run. The `isDirectInvocation` guard added alongside
 * this suite is what makes the import inert; the last check below asserts that
 * guard directly rather than trusting it.
 *
 * WHAT THIS SUITE DOES NOT COVER, stated plainly: the real spawn path. That is
 * exercised by an actual invocation of the script, whose sealed artifact lives
 * under specs/sprint-nova-epic/evidence/nova-a/a4/ -- re-running the full
 * supervisor pipeline inside a unit suite would make it slow, environment-
 * dependent, and a writer of evidence files as a side effect of `verify`.
 *
 * PORTABILITY NOTE for whoever registers this suite in `verify.mjs`: importing
 * the launcher resolves `realpathSync("/usr/bin/git")` at module load. That
 * constant is the launcher's own, pre-existing and untouched by this dispatch,
 * but it does mean both the script and this suite are POSIX-only today.
 */

import assert from "node:assert/strict";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  DEFAULT_FIXTURE_EXIT_CODE,
  FIXTURE_EXIT_CODE_FLAG,
  FIXTURE_EXIT_CODE_MAX,
  FIXTURE_EXIT_CODE_MIN,
  buildRunnerFixture,
  main,
  parseFixtureExitCode,
} from "./execution-plane-launch.mjs";

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

/** The exact fixture literal the script carried BEFORE parameterization, key order included. */
const ORIGINAL_FIXTURE_LITERAL = { delayMs: 200, exitCode: 7, behavior: "none" };

// --- (a) no flag still selects the deliberate failure-path default ----------

check("no-flag argv selects the documented default exit code 7", () => {
  assert.equal(DEFAULT_FIXTURE_EXIT_CODE, 7);
  assert.equal(parseFixtureExitCode([]), 7);
});

check("no-flag fixture block equals the pre-change literal, key order included", () => {
  const fixture = buildRunnerFixture(parseFixtureExitCode([]));
  assert.deepEqual(fixture, ORIGINAL_FIXTURE_LITERAL);
  assert.deepEqual(Object.keys(fixture), Object.keys(ORIGINAL_FIXTURE_LITERAL));
});

check("only exitCode is parameterized -- delayMs and behavior are not reachable from the CLI", () => {
  const fixture = buildRunnerFixture(0);
  assert.equal(fixture.delayMs, ORIGINAL_FIXTURE_LITERAL.delayMs);
  assert.equal(fixture.behavior, ORIGINAL_FIXTURE_LITERAL.behavior);
});

// --- (b) --fixture-exit-code 0 is accepted and threaded through -------------

check("--fixture-exit-code 0 (space form) parses to 0", () => {
  assert.equal(parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, "0"]), 0);
});

check("--fixture-exit-code=0 (equals form) parses to 0", () => {
  assert.equal(parseFixtureExitCode([`${FIXTURE_EXIT_CODE_FLAG}=0`]), 0);
});

check("the parsed 0 is threaded into the fixture block the supervisor receives", () => {
  const fixture = buildRunnerFixture(parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, "0"]));
  assert.deepEqual(fixture, { delayMs: 200, exitCode: 0, behavior: "none" });
});

check("a non-default nonzero value is threaded through unchanged", () => {
  assert.deepEqual(buildRunnerFixture(parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, "3"])), { delayMs: 200, exitCode: 3, behavior: "none" });
});

check("the last occurrence of a repeated flag wins", () => {
  assert.equal(parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, "5", `${FIXTURE_EXIT_CODE_FLAG}=0`]), 0);
});

// --- fail-closed: never silently fall back to the default ------------------

check("the supervisor's own bound is honoured at both ends", () => {
  assert.equal(FIXTURE_EXIT_CODE_MIN, 0);
  assert.equal(FIXTURE_EXIT_CODE_MAX, 125);
  assert.equal(parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, String(FIXTURE_EXIT_CODE_MAX)]), 125);
  assert.throws(() => parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, "126"]), /CLI-OUT-OF-RANGE:126/u);
});

check("a typo'd flag is refused, never silently ignored into the default", () => {
  assert.throws(() => parseFixtureExitCode(["--fixture-exitcode", "0"]), /CLI-UNKNOWN-ARGUMENT:--fixture-exitcode/u);
});

check("a missing value is refused", () => {
  assert.throws(() => parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG]), /CLI-MISSING-VALUE/u);
});

check("non-integer, signed and padded values are refused", () => {
  for (const bad of ["abc", "0.5", "-1", "+0", " 0", "0x0", "", "007"]) {
    assert.throws(() => parseFixtureExitCode([FIXTURE_EXIT_CODE_FLAG, bad]), /CLI-INVALID-VALUE/u, `expected refusal for ${JSON.stringify(bad)}`);
  }
});

check("a non-array argv is refused", () => {
  assert.throws(() => parseFixtureExitCode("--fixture-exit-code=0"), /CLI-ARGV-SHAPE/u);
});

// --- the guard that makes this suite possible ------------------------------

check("importing the launcher does not make it the entrypoint", () => {
  assert.equal(isDirectInvocation(new URL("./execution-plane-launch.mjs", import.meta.url).href), false);
  assert.equal(typeof main, "function");
});

console.log(`\nexecution-plane-launch: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
