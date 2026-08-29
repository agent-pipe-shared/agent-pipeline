#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  resolveSessionIdFromInput,
  run,
  runScratchLifecycleForSessionStart,
} from "./staleness-check.mjs";

/**
 * NVA-W1-SCRATCHBIND fixture: a descriptor directory lives under the git common dir, so
 * exercising the real bind path needs a real repo -- mirrors
 * pipeline-start-scratch-lifecycle.test.mjs's own `freshRepo()`.
 */
function freshScratchRepo() {
  const root = mkdtempSync(join(tmpdir(), "staleness-scratchbind-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, "fixture repository could not be initialised");
  mkdirSync(join(root, "scratch"), { recursive: true });
  return root;
}

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

// ---- NVA-W1-SCRATCHBIND (backlog: 2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-
// event-calls-it.md, Point 1) -----------------------------------------------------------------

test("NVA-W1-SCRATCHBIND: resolveSessionIdFromInput is pure and never throws", () => {
  assert.equal(resolveSessionIdFromInput({ session_id: "sess-1" }), "sess-1");
  assert.equal(resolveSessionIdFromInput(null), null);
  assert.equal(resolveSessionIdFromInput({}), null);
  assert.equal(resolveSessionIdFromInput({ session_id: "" }), null);
  assert.equal(resolveSessionIdFromInput({ session_id: 123 }), null);
});

test("NVA-W1-SCRATCHBIND: a real session_id from this hook's stdin binds a scratch descriptor, no longer unbound-no-session-identity", () => {
  const root = freshScratchRepo();
  const result = runScratchLifecycleForSessionStart({
    projectDir: root,
    stdinPayload: { session_id: "nva-w1-fixture-session" },
  });
  assert.notEqual(result?.binding?.status, "unbound-no-session-identity");
  assert.equal(result.binding.status, "bound");
  assert.match(result.binding.scratchRelativePath, /^scratch\/nva-w1-fixture-session-/u);
});

test("NVA-W1-SCRATCHBIND: the bound descriptor records process.ppid, never this one-shot invocation's own process.pid", () => {
  const root = freshScratchRepo();
  runScratchLifecycleForSessionStart({
    projectDir: root,
    stdinPayload: { session_id: "nva-w1-pid-fixture" },
  });
  const descriptorPath = join(root, ".git", "agent-pipeline", "scratch-descriptors", "nva-w1-pid-fixture.json");
  const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
  assert.equal(descriptor.pid, process.ppid,
    "the descriptor must record process.ppid (the long-running host that outlives this hook's own invocation)");
  assert.notEqual(descriptor.pid, process.pid,
    "recording this one-shot hook's own pid would read back as orphaned on the very next sweep");
});

test("NVA-W1-SCRATCHBIND: absent stdin/session_id sweeps but binds nothing, and never throws (fail-open)", () => {
  const root = freshScratchRepo();
  const result = runScratchLifecycleForSessionStart({ projectDir: root, stdinPayload: null });
  assert.equal(result.binding.status, "unbound-no-session-identity");
});

test("NVA-W1-SCRATCHBIND: an unusable root is a typed fault, never a throw (runBootstrapScratchLifecycle's own fail-open contract, unchanged by this wiring)", () => {
  const result = runScratchLifecycleForSessionStart({
    projectDir: join(tmpdir(), "staleness-scratchbind-does-not-exist", `${process.pid}`),
    stdinPayload: { session_id: "nva-w1-unusable-root" },
  });
  assert.notEqual(result, null);
  assert.equal(result.binding.status, "unavailable");
  assert.ok(result.faults.length > 0);
});

test("NVA-W1-SCRATCHBIND: runSync/run wires the housekeeping through on stderr, never affecting exitCode or the stdout decision", async () => {
  const root = freshScratchRepo();
  const writes = [];
  const errWrites = [];
  const execution = await run({
    projectDir: root,
    stdout: { write(value) { writes.push(value); } },
    stderr: { write(value) { errWrites.push(value); } },
    stdinPayload: { session_id: "nva-w1-runsync-session" },
    inspect() {
      return availability("current", "stable", "refs/tags/v1.1.0");
    },
  });
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.scratchLifecycle.binding.status, "bound");
  assert.ok(writes.join("").includes("pipelineUpdateAvailability=current"),
    "the ordinary stdout decision must be unaffected by the housekeeping addition");
  assert.ok(errWrites.join("").includes("\"status\":\"bound\""),
    "the scratch lifecycle receipt travels on stderr, matching pipeline-start-preflight.mjs's own convention");
});
