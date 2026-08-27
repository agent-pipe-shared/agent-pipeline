#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

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

/**
 * NVA-STALENESSTLA-1. Measured on a live Claude Code session on Windows, 2026-08-27:
 *
 *   SessionStart:startup hook error
 *   Failed with non-blocking status code: Warning: Detected unsettled top-level
 *   await at .../hooks/staleness-check.mjs:208
 *
 * A session-start hook that carries a top-level await can leave the module's own promise
 * pending when the loop drains, and the runner reports the hook as failed at every single
 * session start. Every hook on this path does synchronous work (spawnSync throughout), so
 * none of them needs one.
 *
 * Derived from hooks.json rather than naming staleness-check.mjs, so a hook added to the
 * SessionStart wiring later is covered without anyone remembering to extend this test --
 * the same single-source discipline GUARDDERIVE-1 applies to the onboarding allowlist.
 *
 * Its limit, stated rather than implied: this is a source-shape check, not a parse. It
 * catches a top-level `await` written as its own statement -- the shape that actually
 * failed, and the shape a module entry point takes -- and would miss one buried inside an
 * expression on a line that starts with something else.
 */
test("NVA-STALENESSTLA-1: no SessionStart hook carries a top-level await", () => {
  const wiring = JSON.parse(readFileSync(join(HOOKS_DIR, "hooks.json"), "utf8"));
  const commands = (wiring.hooks?.SessionStart ?? [])
    .flatMap((entry) => entry.hooks ?? [])
    .map((hook) => hook.command ?? "");
  assert.ok(commands.length >= 4, `expected the SessionStart wiring to carry hooks, got ${commands.length}`);

  const scripts = commands
    .map((command) => command.match(/\/hooks\/([A-Za-z0-9._-]+\.mjs)/u)?.[1])
    .filter((name) => name !== undefined);
  assert.equal(scripts.length, commands.length, "every SessionStart hook command must name a hooks/*.mjs script");
  assert.ok(scripts.includes("staleness-check.mjs"), "the regression's own hook must be among those checked");

  for (const script of scripts) {
    const source = readFileSync(join(HOOKS_DIR, script), "utf8");
    // Everything from the `isDirectInvocation(import.meta.url)` entry-point guard onwards is
    // module top level, in both spellings these hooks use (a braced block and a single-line
    // call). Checking that tail keeps the assertion exact: an `await` inside an async
    // function body above it is legitimate and is deliberately not matched.
    const marker = source.indexOf("isDirectInvocation(import.meta.url)");
    assert.notEqual(marker, -1, `${script}: no isDirectInvocation entry point found to check`);
    const entryPoint = source.slice(marker);
    assert.ok(!/\bawait\b/u.test(entryPoint),
      `${script}: the SessionStart entry point awaits, which is a top-level await:\n${entryPoint.trim()}`);
  }
});
