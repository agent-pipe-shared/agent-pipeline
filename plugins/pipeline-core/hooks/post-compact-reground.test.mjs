#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRegroundMessage,
  decideOutput,
  extractLiveStateNarrative,
  loadStateNarrativeExcerptSafe,
  loadStateSafe,
  resolveRegroundProjection,
  shouldActivate,
} from "./post-compact-reground.mjs";
import {
  buildModelIdentityObservation,
  readModelIdentityObservation,
  writeModelIdentityObservation,
} from "../lib/main-session-route-attestation.mjs";
import { STATE_EXCERPT_MAX_BYTES, STATE_EXCERPT_TRUNCATION_MARKER } from "../lib/bootstrap-payload-budget.mjs";

const SCRIPT = fileURLToPath(new URL("./post-compact-reground.mjs", import.meta.url));
const FEATURE = "phase26-test";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const ROOTS = [];
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function identity(overrides = {}) {
  return {
    featureId: FEATURE,
    queueRevision: 4,
    packageId: "P1",
    actionId: "post-compact-reground",
    dispatchId: "dispatch-p1-04",
    attemptId: "attempt-01",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: D,
    mayDelegate: false,
    ...overrides,
  };
}

function queueHead(overrides = {}) {
  return {
    packageId: "P1",
    actionId: "post-compact-reground",
    nextAction: "dispatch",
    productRetryCount: 0,
    environmentRerouteCount: 0,
    dispatch: null,
    ...overrides,
  };
}

function continuity(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 4,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: queueHead(),
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "resume-on-next-turn", sourceRevision: 4, reasonCode: "compact-reload" },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 3,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    ...overrides,
  };
}

function outer(continuityOverrides = {}, outerOverrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: FEATURE, planPath: "specs/prd.md", phase: "implementation" },
    continuity: continuity(continuityOverrides),
    ...outerOverrides,
  };
}

function blocker() {
  return {
    type: "course",
    signature: "repeat-product-v1",
    resumeCondition: { kind: "po-decision", evidenceSha256: A },
    decisionBrief: {
      decisionBriefId: "brief-01",
      decisionBriefSha256: B,
      resultPath: "specs/result.md",
    },
  };
}

function freshRoot(name) {
  const root = mkdtempSync(join(tmpdir(), `post-compact-${name}-`));
  ROOTS.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  return root;
}

function runCli(root, input) {
  return spawnSync(process.execPath, [SCRIPT], {
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

check("only exact compact activates", () => {
  assert.equal(shouldActivate({ source: "compact" }), true);
  for (const input of [{ source: "startup" }, { source: "resume" }, {}, null, "compact"]) {
    assert.equal(shouldActivate(input), false);
  }
});

check("non-compact output remains silent", () => {
  assert.deepEqual(decideOutput({ source: "startup" }, outer()), { stdout: "", json: false });
});

check("English runtime projects complete validated queue state", () => {
  const projection = resolveRegroundProjection(outer());
  assert.equal(projection.code, "PCR-READY");
  assert.equal(projection.workResumptionAllowed, true);
  assert.equal(projection.phase, "implementation");
  assert.deepEqual(projection.runtime, { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null });
  assert.deepEqual(projection.authority, continuity().authority);
  assert.deepEqual(projection.queueHead, continuity().queueHead);
  assert.equal(projection.revision, 4);
  assert.equal(projection.nextAction, "dispatch");
  assert.deepEqual(projection.dispatchEligibility, { allowed: true, code: "CS-DISPATCHABLE" });
  assert.deepEqual(projection.resume, continuity().resume);
});

check("German runtime renders German without an inferred language", () => {
  const projection = resolveRegroundProjection(outer({
    runtime: { humanFacingLanguage: "de", activeDuty: "Koordinator", sessionCleanup: null },
  }));
  const message = buildRegroundMessage(projection);
  assert.match(message, /^Re-Grounding nach \/compact\./);
  assert.match(message, /Aktive Duty: "Koordinator"/);
  assert.match(message, /CONTINUATION feature="phase26-test" phase="implementation" queueRevision=4 nextAction="dispatch"/);
  assert.match(message, /Answer informational messages, then continue the persisted next action\./);
  assert.doesNotMatch(message, /Active duty|Validated continuity/);
});

check("extractLiveStateNarrative finds the top-of-file-to-heading boundary", () => {
  const withHeading = "# Title\n\nLive paragraph one.\n\nLive paragraph two.\n\n## Archived history\n\n| Date | Summary |\n|---|---|\n";
  const extracted = extractLiveStateNarrative(withHeading);
  assert.equal(extracted, "# Title\n\nLive paragraph one.\n\nLive paragraph two.");
  assert.equal(extracted.includes("Archived history"), false);
  assert.equal(extracted.includes("Date | Summary"), false);

  const withoutHeading = "# Title\n\nOnly live content, nothing archived yet.";
  assert.equal(extractLiveStateNarrative(withoutHeading), withoutHeading);

  for (const empty of ["", "   \n\n  ", null, undefined, 42]) {
    assert.equal(extractLiveStateNarrative(empty), null);
  }
});

check("loadStateNarrativeExcerptSafe fails closed on a missing path, never throws", () => {
  const root = freshRoot("narrative-missing");
  assert.doesNotThrow(() => {
    assert.equal(loadStateNarrativeExcerptSafe(join(root, "docs", "state.md")), null);
  });
});

check("decideOutput with rootDir embeds the docs/state.md live excerpt bilingually and respects the archive boundary", () => {
  const root = freshRoot("narrative-e2e");
  mkdirSync(join(root, "docs"), { recursive: true });
  const liveNarrative = "**Last updated:** today -- something happened.\n\nA live paragraph with real content.";
  const archivedTail = "## Archived history\n\n| Date range | Summary | Archive |\n|---|---|---|\n| old | old stuff | old.md |\n";
  writeFileSync(join(root, "docs", "state.md"), `# Project state\n\n${liveNarrative}\n\n${archivedTail}`);

  const enResult = decideOutput({ source: "compact" }, outer(), { rootDir: root });
  const enMessage = enResult.payload.systemMessage;
  assert.ok(enMessage.includes("A live paragraph with real content."));
  assert.equal(enMessage.includes("old stuff"), false);
  assert.match(enMessage, /If anything above is unclear or looks incomplete, read docs\/state\.md directly before risking duplicate work\./);

  const deValue = outer({ runtime: { humanFacingLanguage: "de", activeDuty: "Koordinator", sessionCleanup: null } });
  const deResult = decideOutput({ source: "compact" }, deValue, { rootDir: root });
  const deMessage = deResult.payload.systemMessage;
  assert.ok(deMessage.includes("A live paragraph with real content."));
  assert.equal(deMessage.includes("old stuff"), false);
  assert.match(deMessage, /Falls hier etwas unklar ist oder unvollständig wirkt, lies docs\/state\.md direkt, bevor du doppelte Arbeit riskierst\./);
});

check("host payload mirrors deterministic context and exposes pure projection", () => {
  const decided = decideOutput({ source: "compact" }, outer());
  const parsed = JSON.parse(decided.stdout);
  assert.equal(decided.json, true);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(parsed.systemMessage, parsed.hookSpecificOutput.additionalContext);
  assert.deepEqual(decided.projection, resolveRegroundProjection(outer()));
});

check("a compact projects a host-attested main-session drift without changing the route", () => {
  const decided = decideOutput({
    source: "compact",
    pipelineMainSessionRoute: {
      profile: "feature",
      runner: "codex",
      observed: {
        subject: "main-session",
        source: "host-introspection",
        eventId: "main-session-route-compact-01",
        runner: "codex",
        modelId: "gpt-5.6-sol",
        effort: "high",
      },
      reportedEventIds: [],
    },
  }, outer());
  assert.equal(decided.projection.mainSessionRoute.code, "MSR-DRIFT-RETURN-REQUESTED");
  assert.equal(decided.projection.mainSessionRoute.action.automatic, false);
  assert.deepEqual(decided.projection.mainSessionRoute.action.target, {
    runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "medium",
  });
});

check("compact never treats an absent host main-session identity as route evidence", () => {
  const projection = resolveRegroundProjection(outer());
  assert.equal(projection.mainSessionRoute.code, "MSR-UNVERIFIED");
  assert.equal(projection.mainSessionRoute.action, null);
});

check("model identity evidence is session-bound without effort or candidate binding", () => {
  const root = freshRoot("model-identity");
  const input = {
    source: "compact",
    session_id: "session-a",
    model: { display_name: "gpt-5.6-sol" },
  };
  const observation = buildModelIdentityObservation(input, {
    nowIso: "2026-08-20T20:00:00.000Z",
    eventId: "statusline-session-a-01",
  });
  assert.deepEqual(observation, {
    schema: "pipeline.main-session-model-identity.v1",
    subject: "main-session",
    source: "host-introspection",
    sessionId: "session-a",
    eventId: "statusline-session-a-01",
    modelId: "gpt-5.6-sol",
    observedAt: "2026-08-20T20:00:00.000Z",
  });
  assert.equal(Object.hasOwn(observation, "effort"), false);
  assert.equal(writeModelIdentityObservation(root, observation), true);
  assert.deepEqual(readModelIdentityObservation(root, "session-a"), observation);
  assert.equal(readModelIdentityObservation(root, "session-b"), null);

  const decided = decideOutput(input, outer(), { rootDir: root });
  assert.deepEqual(decided.projection.mainSessionRoute.modelIdentity, observation);
  assert.equal(decided.projection.mainSessionRoute.code, "MSR-UNVERIFIED");
  assert.equal(Object.hasOwn(decided.projection.mainSessionRoute.modelIdentity, "effort"), false);
});

check("stringify-write-reload preserves semantic projection and state bytes", () => {
  const root = freshRoot("roundtrip");
  const path = join(root, ".claude", "pipeline-state.json");
  const value = outer({ runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null } });
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, raw);
  const before = resolveRegroundProjection(value);
  const loaded = loadStateSafe(path);
  const after = resolveRegroundProjection(loaded);
  assert.deepEqual(after, before);
  assert.equal(readFileSync(path, "utf8"), raw);
  decideOutput({ source: "compact" }, loaded);
  assert.equal(readFileSync(path, "utf8"), raw);
});

check("typed blocker is exact and explicitly prevents work resumption", () => {
  const projection = resolveRegroundProjection(outer({ queueHead: null, blocker: blocker() }));
  assert.equal(projection.code, "PCR-BLOCKED");
  assert.equal(projection.workResumptionAllowed, false);
  assert.equal(projection.phase, "implementation");
  assert.equal(buildRegroundMessage(projection).includes("CONTINUATION"), false);
  assert.deepEqual(projection.blocker, blocker());
  assert.equal(projection.queueHead, null);
  assert.equal(projection.nextAction, null);
  assert.deepEqual(projection.dispatchEligibility, { allowed: false, code: "CS-BLOCKED" });
});

check("pending decision transaction remains visible and non-runnable", () => {
  const decisionTxn = {
    idempotencyKey: "decision-01",
    briefSha256: A,
    intentSha256: B,
    selectedOptionId: "option-01",
    preSelectionRevision: 3,
    selectedRevision: 4,
    dispatchableRevision: 5,
    phase: "state-applied",
  };
  const projection = resolveRegroundProjection(outer({ decisionTxn }));
  assert.equal(projection.code, "PCR-DECISION-PENDING");
  assert.equal(projection.workResumptionAllowed, false);
  assert.deepEqual(projection.decisionTxn, decisionTxn);
  assert.deepEqual(projection.dispatchEligibility, { allowed: false, code: "CS-DECISION-PENDING" });
});

check("one-shot recovery is projected without inventing isolation assurance", () => {
  const fallback = identity({ dispatchId: "fallback-dispatch", attemptId: "fallback-attempt" });
  const recovery = {
    originLaneId: "origin-lane",
    originDispatchId: "origin-dispatch",
    originAttemptId: "origin-attempt",
    environmentEvidenceSha256: A,
    sameLaneRetryProhibited: true,
    fallbackStatus: "running",
    fallbackLaneId: "fallback-lane",
    fallbackDispatchId: "fallback-dispatch",
    narrowingContractSha256: B,
    originProductRetryCount: 0,
    resultDigest: null,
    count: 1,
  };
  const value = outer({
    queueHead: queueHead({ nextAction: "poll", environmentRerouteCount: 1, dispatch: fallback }),
    recovery,
  });
  const projection = resolveRegroundProjection(value);
  assert.equal(projection.code, "PCR-READY");
  assert.deepEqual(projection.recovery, recovery);
  assert.equal(JSON.stringify(projection).includes("isolation"), false);
  assert.equal(JSON.stringify(projection).includes("fresh"), false);
});

check("failed fallback with a retained queue fails closed after compact", () => {
  const fallback = identity({ dispatchId: "fallback-dispatch", attemptId: "fallback-attempt" });
  const recovery = {
    originLaneId: "origin-lane",
    originDispatchId: "origin-dispatch",
    originAttemptId: "origin-attempt",
    environmentEvidenceSha256: A,
    sameLaneRetryProhibited: true,
    fallbackStatus: "failed",
    fallbackLaneId: "fallback-lane",
    fallbackDispatchId: "fallback-dispatch",
    narrowingContractSha256: B,
    originProductRetryCount: 0,
    resultDigest: null,
    count: 1,
  };
  const projection = resolveRegroundProjection(outer({
    queueHead: queueHead({ nextAction: "poll", environmentRerouteCount: 1, dispatch: fallback }),
    recovery,
  }));
  assert.equal(projection.code, "PCR-CONTINUITY-INVALID");
  assert.equal(projection.workResumptionAllowed, false);
});

for (const [name, value, code] of [
  ["null state", null, "PCR-OUTER-INVALID"],
  ["wrong outer schema", { ...outer(), schema: "pipeline.state.v1" }, "PCR-OUTER-INVALID"],
  ["missing active feature", { ...outer(), activeFeature: undefined }, "PCR-ACTIVE-FEATURE-INVALID"],
  ["missing continuity", { schema: "pipeline.state.v0", activeFeature: { id: FEATURE, phase: "implementation" } }, "PCR-CONTINUITY-MISSING"],
  ["mismatched feature", outer({}, { activeFeature: { id: "other", phase: "implementation" } }), "PCR-FEATURE-MISMATCH"],
]) {
  check(`${name} emits a log-safe non-runnable disposition`, () => {
    const projection = resolveRegroundProjection(value);
    assert.equal(projection.code, code);
    assert.equal(projection.workResumptionAllowed, false);
    assert.match(buildRegroundMessage(projection), /^POST_COMPACT_REGROUND \{/);
  });
}

for (const [name, mutate] of [
  ["missing runtime", (value) => { delete value.continuity.runtime; }],
  ["unsupported language", (value) => { value.continuity.runtime.humanFacingLanguage = "fr"; }],
  ["unsafe duty", (value) => { value.continuity.runtime.activeDuty = "Coordinator duty"; }],
  ["malformed queue", (value) => { value.continuity.queueHead.nextAction = "guess"; }],
]) {
  check(`${name} fails closed for resumption`, () => {
    const value = outer();
    mutate(value);
    const projection = resolveRegroundProjection(value);
    assert.equal(projection.code, "PCR-CONTINUITY-INVALID");
    assert.equal(projection.workResumptionAllowed, false);
  });
}

check("real compact CLI returns host JSON, exit zero, and leaves state byte-identical", () => {
  const root = freshRoot("cli-valid");
  const path = join(root, ".claude", "pipeline-state.json");
  const raw = `${JSON.stringify(outer({ runtime: { humanFacingLanguage: "de", activeDuty: "Coordinator", sessionCleanup: null } }), null, 2)}\n`;
  writeFileSync(path, raw);
  const result = runCli(root, JSON.stringify({ source: "compact" }));
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /^Re-Grounding nach \/compact\./);
  assert.equal(payload.hookSpecificOutput.bootstrapPayloadMeasurement.metric, "utf8-byte-upper-bound");
  assert.equal(payload.hookSpecificOutput.bootstrapPayloadMeasurement.withinBudget, true);
  assert.equal(payload.hookSpecificOutput.bootstrapPayloadMeasurement.exactModelTokens, false);
  assert.equal(readFileSync(path, "utf8"), raw);
});

check("real compact CLI with missing state emits explicit stop but stays exit zero", () => {
  const root = freshRoot("cli-missing");
  const result = runCli(root, JSON.stringify({ source: "compact" }));
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.systemMessage, /"code":"PCR-OUTER-INVALID"/);
  assert.match(payload.systemMessage, /"workResumptionAllowed":false/);
});

check("real non-compact and malformed-input CLI calls remain silent", () => {
  const root = freshRoot("cli-silent");
  for (const input of [JSON.stringify({ source: "startup" }), "{bad", ""]) {
    const result = runCli(root, input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  }
});

for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
process.stdout.write(`${passed} post-compact reground tests passed\n`);
