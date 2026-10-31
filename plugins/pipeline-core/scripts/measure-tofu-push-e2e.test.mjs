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
 * current suite also executes the full disposable Driver path up to the
 * ADR-0085 single-review design-course boundary and asserts the typed stop it
 * reaches there, so a new onboarding handover shape cannot silently move that
 * stop (PO row 23, option (b)); the signed push is measured by the Greenfield test.
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

// QG-04 (bounded justification, PO row 23 of the AFK list, decided 2026-10-23 as option (b), D63 decision): the claim of this case changes from
// "TOFU through a recorded signed push" to "TOFU up to the ADR-0085 single-review design-course boundary, stopping typed". The real Driver cannot reach a
// recorded signed push without the design course itself (author the staging PRD/Spec, submit-plan, review receipt, present-plan --review-receipt, signed
// approval), which a disposable in-process measurement cannot supply. The assertions of the old claim (outcome "signed-push-recorded", a successful
// approve-push step, trustAnchorPinned false, the critical-human-proof-policy schema) are therefore not carried over; the signed push is measured by the
// Greenfield test instead, and this case asserts the typed stop the walk actually reaches: setup ok, onboarding ends typed at the PO signature request of
// the plan acknowledgement (the signing step refuses the disposable unencrypted key; restated W7-R6 after 5e939278b moved the earlier stop, see below),
// within the measured six turns, and no later ceremony step ran.
test("TOFU measurement stops typed at the ADR-0085 single-review design-course boundary; the Greenfield test measures the signed push", { timeout: 120_000 }, () => {
  let stdout = "";
  const status = main([], { write: (chunk) => { stdout += chunk; } });
  const result = JSON.parse(stdout);
  // Typed stop: the measurement is not a signed push, so main() reports status 1 with the onboarding-not-ready outcome.
  assert.equal(status, 1, stdout);
  assert.equal(result.outcome, "onboarding-not-ready", stdout);
  assert.equal(result.steps[0]?.step, "setup", stdout);
  assert.equal(result.steps[0]?.ok, true, stdout);
  assert.equal(result.steps[1]?.step, "onboarding", stdout);
  assert.equal(result.steps[1]?.outcome, "external-operator-failed", stdout);
  // Turn count bound as the existing case measured it (six turns up to the boundary).
  assert.ok(result.steps[1]?.turns <= 6, stdout);
  assert.equal(result.onboarding?.turns, result.steps[1]?.turns, stdout);
  // Restated for the contract change 5e939278b (stagingDesignNeedsAuthoring; sibling restatement W7-R5, project-onboarding-e2e.test.mjs): the Driver now
  // stops at `design-authoring-required` BEFORE the bind, and the helper (measure-fresh-repo-onboarding-turns.mjs) authors the staging PRD, Spec and
  // architecture block there as the stand-in PO (round `authored-staging-design`), so the old stop (the plan acknowledgement refusing the generated
  // placeholder content, via an `authored-architecture-design` round with ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE) is no longer reached. The walk
  // gets one step further and stops typed at the PO's signature request for the plan acknowledgement (`signature-required`, a returned `sign-intent`
  // external action): the disposable fixture key is unencrypted, so the real signing step refuses it (PO-KEY-UNENCRYPTED, passphrase-protected keys
  // only). The intent is unchanged: setup ok, onboarding ends typed before the signed push, within the six turns, and no later ceremony step ran.
  assert.ok(result.onboarding?.rounds.some((round) => round.resolved === "authored-staging-design" && round.ok === true), stdout);
  assert.equal(result.onboarding?.rounds.some((round) => round.resolved === "authored-architecture-design"), false, stdout);
  assert.equal(result.onboarding?.rounds.at(-1)?.resolved, "executed-driver-provided-external-action", stdout);
  assert.equal(result.onboarding?.rounds.at(-1)?.appliedExitCode, 2, stdout);
  assert.equal(result.onboarding?.outcome, "external-operator-failed", stdout);
  assert.equal(result.onboarding?.final?.schema, "pipeline.bootstrap-plan-acknowledgement-plan.v1", stdout);
  assert.equal(result.onboarding?.final?.status, "signature-required", stdout);
  assert.equal(result.onboarding?.final?.nextAction?.argv?.[1], "sign-intent", stdout);
  assert.match(result.onboarding?.error?.stderr ?? "", /PO-KEY-UNENCRYPTED/, stdout);
  // No ceremony step after onboarding ran: the signed push is out of this measurement's bound.
  assert.equal(result.steps.length, 2, stdout);
  assert.equal(result.steps.some((step) => step.step === "approve-push"), false, stdout);
});
