#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOTSTRAP_LINE,
  PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
  UPDATE_TIMEOUT_MS,
  decideOutput,
  inspectSessionStartUpdateAvailability,
  isExactSecurityPolicyBlock,
  normalizePipelineUpdateAvailability,
  run,
} from "./staleness-check.mjs";

function availability(status, channel, ref, fields = {}) {
  return {
    schema: PIPELINE_UPDATE_AVAILABILITY_SCHEMA,
    status,
    pipelineUpdateAvailability: status,
    channel,
    channelSource: fields.channelSource ?? "project-config",
    ref,
    version: fields.version ?? null,
    commit: fields.commit ?? "a".repeat(40),
    updateAvailable: status === "update-available",
    updateRecommended: fields.updateRecommended ?? status === "update-available",
    blocking: fields.blocking ?? false,
    policyDisposition: fields.policyDisposition ?? null,
    reason: fields.reason ?? null,
  };
}

for (const [channel, ref] of [
  ["alpha", "refs/heads/main"],
  ["beta", "refs/tags/v1.2.0-beta.3"],
  ["stable", "refs/tags/v1.1.0"],
]) {
  test(`current ${channel} output names channel/ref and separates repository freshness`, () => {
    const result = decideOutput(availability("current", channel, ref));
    assert.equal(result.json, false);
    assert.match(result.stdout, new RegExp(`pipelineUpdateAvailability=current.*channel=${channel}.*ref=${ref}`, "u"));
    assert.match(result.stdout, /repositoryFreshness=not-observed \(writeAdmission=not-evaluated\)/u);
    assert.match(result.stdout, new RegExp(BOOTSTRAP_LINE, "u"));
    assert.doesNotMatch(result.stdout, /fresh repository|write permitted|write blocked/iu);
  });

  test(`update-available ${channel} remains advisory and never claims write authority`, () => {
    const result = decideOutput(availability("update-available", channel, ref));
    assert.equal(result.json, true);
    assert.equal(result.payload.hookSpecificOutput.pipelineUpdateAvailability.channel, channel);
    assert.equal(result.payload.hookSpecificOutput.pipelineUpdateAvailability.ref, ref);
    assert.deepEqual(result.payload.hookSpecificOutput.repositoryFreshness, {
      status: "not-observed",
      writeAdmission: "not-evaluated",
    });
    assert.equal(result.payload.hookSpecificOutput.pipelineUpdateAvailability.blocking, false);
    assert.match(result.payload.systemMessage, /advisory distribution metadata/u);
    assert.match(result.payload.systemMessage, /No update runs automatically/u);
    assert.doesNotMatch(result.payload.systemMessage, /write permitted|write blocked/iu);
  });
}

test("offline/timeout is visible unknown and fail-open without false freshness", async () => {
  const writes = [];
  const execution = await run({
    projectDir: "/consumer",
    stdout: { write(value) { writes.push(value); } },
    inspect() {
      return availability("unknown", "beta", null, {
        channelSource: "project-config",
        reason: "timeout",
        commit: null,
      });
    },
  });
  assert.equal(execution.exitCode, 0);
  assert.match(writes.join(""), /pipelineUpdateAvailability=unknown/u);
  assert.match(writes.join(""), /channel=beta/u);
  assert.match(writes.join(""), /ref=unavailable/u);
  assert.match(writes.join(""), /reason=timeout/u);
  assert.doesNotMatch(writes.join(""), /pipelineUpdateAvailability=current|repositoryFreshness=fresh/iu);
});

test("only an exact loaded-plugin security-policy disposition becomes F2 metadata", () => {
  const disposition = {
    schema: "pipeline.ruleset-update-policy-disposition.v1",
    status: "matched",
    policyId: "security-floor",
    policyVersion: 1,
    policySha256: "b".repeat(64),
    entryId: "unsafe-build",
    disposition: "blocking",
    blocking: true,
    publicSecurityReason: "This loaded build has a published security defect.",
    reason: "exact-security-policy-match",
  };
  const observed = availability("current", "stable", "refs/tags/v1.1.0", {
    blocking: true,
    updateRecommended: true,
    policyDisposition: disposition,
  });
  assert.equal(isExactSecurityPolicyBlock(observed), true);
  const result = decideOutput(observed);
  assert.equal(result.json, true);
  assert.match(result.payload.systemMessage, /F2 security update required/u);
  assert.equal(result.payload.hookSpecificOutput.pipelineUpdateAvailability.blocking, true);

  const ordinary = { ...observed, policyDisposition: { ...disposition, status: "not-matched" } };
  assert.equal(isExactSecurityPolicyBlock(ordinary), false);
  assert.equal(decideOutput(ordinary).json, false);
});

test("malformed helper output fails open as unknown", () => {
  const normalized = normalizePipelineUpdateAvailability({ status: "behind", blocking: true });
  assert.equal(normalized.status, "unknown");
  assert.equal(normalized.blocking, false);
  assert.equal(decideOutput(normalized).json, false);
});

test("SessionStart delegates channel/ref selection to the shared update helper", async () => {
  const calls = [];
  const observed = availability("current", "stable", "refs/tags/v1.1.0");
  const result = await inspectSessionStartUpdateAvailability("/consumer", {
    inspect(repo, options) {
      calls.push({ repo, options });
      return observed;
    },
  });
  assert.equal(result, observed);
  assert.deepEqual(calls, [{
    repo: "/consumer",
    options: {
      distributionTopology: "installed-consumer",
      timeoutMs: UPDATE_TIMEOUT_MS,
    },
  }]);
});
