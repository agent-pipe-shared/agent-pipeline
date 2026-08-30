#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-CF-CRITICFIX-F2F5F7: first test coverage for
 * scripts/measure-tofu-push-e2e.mjs, added after an independent Critic review
 * (task wdnfwnx1t) found the file had grown to ~350 lines of new logic with zero
 * automated coverage (F5) -- and that gap is exactly how a real infinite-loop bug
 * in `parseJsonStdout` (F2) went undetected. Scope, per the fix dispatch's own
 * briefing: cover `parseJsonStdout`'s normal case and the F2 regression case, and
 * `fakeSetupSpawn`'s genpkey/pkey interception (mirroring
 * `po-human-approval.test.mjs`'s own `fakeSetupSpawn` test pattern).  The
 * current suite also executes the full disposable Driver path, so a new
 * onboarding handover shape cannot make the measurement silently stop before
 * the real TOFU push ceremony.
 */
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fakeSetupSpawn, main, parseJsonStdout } from "./measure-tofu-push-e2e.mjs";

test("parseJsonStdout: normal case -- clean JSON stdout with no leading prompt text parses straight through", () => {
  const value = { subjectSha256: "a".repeat(64), ok: true };
  const result = parseJsonStdout({ stdout: JSON.stringify(value) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, value);
});

test("parseJsonStdout: recovers the trailing JSON object from stdout carrying a leading human-readable prompt", () => {
  const value = { paths: { request: "/tmp/r.json", proof: "/tmp/p.json" } };
  const stdout = `About to sign. Type "approve" to continue.\n${JSON.stringify(value)}`;
  const result = parseJsonStdout({ stdout });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, value);
});

test("parseJsonStdout: F2 regression -- a leading '{' at index 0 with no valid full-string-tail JSON returns {ok:false} instead of hanging", { timeout: 5_000 }, () => {
  // The exact hanging shape from the Critic finding: the FIRST "{" sits at index 0,
  // and no suffix of the string parses as JSON. Before the fix,
  // `stdout.lastIndexOf("{", i - 1)` with i === 0 clamps its position argument to 0
  // (ECMA-262) and returns 0 again forever -- the loop never reaches -1.
  const stdout = '{"a": ';
  const result = parseJsonStdout({ stdout });
  assert.equal(result.ok, false);
  assert.equal(result.error, stdout);
});

test("parseJsonStdout: no '{' anywhere in stdout returns {ok:false} without looping", { timeout: 5_000 }, () => {
  const stdout = "no json here at all";
  const result = parseJsonStdout({ stdout });
  assert.equal(result.ok, false);
  assert.equal(result.error, stdout);
});

test("parseJsonStdout: missing stdout field defaults to empty string and returns {ok:false}", { timeout: 5_000 }, () => {
  const result = parseJsonStdout({});
  assert.equal(result.ok, false);
  assert.equal(result.error, "");
});

function fixtureDirs() {
  return {
    keyDir: mkdtempSync(join(tmpdir(), "measure-tofu-e2e-fakesetup-key-")),
  };
}

function cleanup({ keyDir }) {
  rmSync(keyDir, { recursive: true, force: true });
}

test("fakeSetupSpawn: intercepts 'openssl genpkey' and writes a real, readable Ed25519 private key", () => {
  const dirs = fixtureDirs();
  try {
    const outPath = join(dirs.keyDir, "private.pem");
    const result = fakeSetupSpawn("openssl", ["genpkey", "-algorithm", "ed25519", "-out", outPath]);
    assert.equal(result.status, 0);
    assert.equal(existsSync(outPath), true);
    const pem = readFileSync(outPath, "utf8");
    // A real, readable private key: node:crypto must be able to parse it back.
    const key = createPrivateKey(pem);
    assert.equal(key.asymmetricKeyType, "ed25519");
  } finally {
    cleanup(dirs);
  }
});

test("fakeSetupSpawn: intercepts 'openssl pkey -pubout' and derives a matching public key from the private key on disk", () => {
  const dirs = fixtureDirs();
  try {
    const privPath = join(dirs.keyDir, "private.pem");
    const pubPath = join(dirs.keyDir, "public.pem");
    const genResult = fakeSetupSpawn("openssl", ["genpkey", "-algorithm", "ed25519", "-out", privPath]);
    assert.equal(genResult.status, 0);

    const pubResult = fakeSetupSpawn("openssl", ["pkey", "-in", privPath, "-pubout", "-out", pubPath]);
    assert.equal(pubResult.status, 0);
    assert.equal(existsSync(pubPath), true);

    const derivedPublicKey = createPublicKey(readFileSync(pubPath, "utf8"));
    const expectedPublicKey = createPublicKey(createPrivateKey(readFileSync(privPath, "utf8")));
    assert.equal(
      derivedPublicKey.export({ type: "spki", format: "pem" }),
      expectedPublicKey.export({ type: "spki", format: "pem" }),
    );
  } finally {
    cleanup(dirs);
  }
});

test("fakeSetupSpawn: every other openssl invocation falls through to a real spawnSync (unrecognized args return a real status)", () => {
  // `openssl version` is a real, side-effect-free subcommand every environment running
  // this suite already has available -- proves the fall-through branch actually invokes
  // a real subprocess rather than being silently swallowed.
  const result = fakeSetupSpawn("openssl", ["version"]);
  assert.equal(typeof result.status, "number");
  assert.equal(result.status, 0);
});

test("full TOFU measurement follows Driver-provided design answers through to a recorded signed push", { timeout: 120_000 }, () => {
  let stdout = "";
  const status = main([], { write: (chunk) => { stdout += chunk; } });
  assert.equal(status, 0, stdout);
  const result = JSON.parse(stdout);
  assert.equal(result.outcome, "signed-push-recorded", stdout);
  assert.equal(result.steps[0]?.step, "onboarding");
  assert.equal(result.steps[0]?.outcome, "ready", stdout);
  assert.ok(result.steps.some((step) => step.step === "approve-push" && step.exitCode === 0), stdout);
  // This measurement deliberately ends at approve-push.  The already accepted
  // separate TOFU boundary is the real git-push guard interception, where a
  // v1 policy would be upgraded and pinned; do not claim that unexecuted hook
  // path as evidence here.
  assert.equal(result.trustAnchorPinned, false, stdout);
  assert.equal(result.policy?.schema, "pipeline.critical-human-proof-policy.v1", stdout);
});
