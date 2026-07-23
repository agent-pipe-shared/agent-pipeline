#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  UsageIngestionError,
  ingestClaudeUsage,
  ingestCodexUsage,
  validateRunnerUsageEnvelope,
  validateUsageRouteBinding,
} from "./runner-usage-v1.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "runner-usage-v1");
const CLAUDE_TURN = readFileSync(join(FIXTURES, "claude-turn.json"));
const CLAUDE_SESSION = readFileSync(join(FIXTURES, "claude-session.json"));
const CODEX_TURN = readFileSync(join(FIXTURES, "codex-turn-completed.json"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function rejects(name, fn, code) {
  check(name, () => assert.throws(fn, (error) => error instanceof UsageIngestionError && (!code || error.code === code)));
}

function codexSourceContext(overrides = {}) {
  return {
    schema: "pipeline.usage-source-context.v1",
    trust: "codex-app-server",
    runner: "codex",
    source: { threadId: "thread-codex-001", turnId: "turn-codex-001" },
    scope: { kind: "turn", dispatchId: "dispatch-usage-001" },
    ...overrides,
  };
}

function claudeSourceContext(scope = { kind: "turn" }) {
  return {
    schema: "pipeline.usage-source-context.v1",
    trust: "runner-wrapper",
    runner: "claude",
    source: { threadId: "thread-claude-001", turnId: "turn-claude-001" },
    scope,
  };
}

function boundReceiptFixture({
  runner,
  nativeBytes,
  sourceContext,
  requested,
  duty,
  effectiveModelId,
  effectiveEffort,
  evidenceSource,
}) {
  const root = mkdtempSync(join(tmpdir(), "pipeline-runner-usage-v1-"));
  const receipts = join(root, "receipts");
  mkdirSync(receipts);
  const candidateCommit = "a".repeat(40);
  const candidateTree = "b".repeat(40);
  const resultSha256 = "c".repeat(64);
  const routeEvidenceSha256 = "d".repeat(64);
  const provider = runner === "claude" ? "anthropic" : "openai";
  const dispatchBinding = {
    dispatchId: sourceContext.scope.dispatchId,
    queueRevision: 0,
    candidateCommit,
    candidateTree,
    requestedDuty: duty,
    requestedWorktype: null,
  };
  const trustedEvidence = {
    source: evidenceSource,
    sha256: routeEvidenceSha256,
    resultSha256,
    effectiveDuty: duty,
    effectiveWorktype: null,
    effectiveRunner: runner,
    effectiveSelector: { kind: "model-id", value: effectiveModelId },
    effectiveProvider: provider,
    effectiveModelId,
    effectiveEffort,
  };
  const receipt = {
    schema: "pipeline.route-receipt.v1",
    ...dispatchBinding,
    resultSha256,
    requestedRunner: runner,
    requestedProvider: provider,
    requestedSelector: { ...requested.selector },
    requestedEffort: requested.effort,
    effectiveDuty: duty,
    effectiveWorktype: null,
    effectiveRunner: runner,
    effectiveSelector: { kind: "model-id", value: effectiveModelId },
    effectiveProvider: provider,
    effectiveModelId,
    effectiveEffort,
    resolutionEvidence: { source: evidenceSource, sha256: routeEvidenceSha256 },
    attestationAvailable: true,
    effectiveRouteStatus: "attested",
  };
  const receiptPath = join(receipts, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  const routeContext = {
    schema: "pipeline.usage-route-context.v1",
    trust: "trusted-runner-wrapper",
    runner,
    requested: { selector: { ...requested.selector }, effort: requested.effort },
    binding: {
      schema: "pipeline.usage-route-binding.v1",
      dispatchId: dispatchBinding.dispatchId,
      threadId: sourceContext.source.threadId,
      turnId: sourceContext.source.turnId,
      cell: { kind: "duty", dutyId: duty },
      candidateCommit,
      candidateTree,
      usageEventSha256: sha256(nativeBytes),
    },
    receipt: {
      schema: "pipeline.route-receipt.v1",
      repoRelativePath: "receipts/receipt.json",
      sha256: sha256(readFileSync(receiptPath)),
      resultSha256,
      routeEvidenceSha256,
    },
    dispatchBinding,
    trustedEvidence,
  };
  return { root, routeContext, sourceContext, receiptPath };
}

function boundCodexFixture({
  nativeBytes = CODEX_TURN,
  requested = { selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "max" },
  duty = "critic_high_risk",
  effectiveModelId = "gpt-5.6-sol",
  effectiveEffort = "max",
} = {}) {
  return boundReceiptFixture({
    runner: "codex",
    nativeBytes,
    sourceContext: codexSourceContext(),
    requested,
    duty,
    effectiveModelId,
    effectiveEffort,
    evidenceSource: "host",
  });
}

function boundClaudeFixture() {
  return boundReceiptFixture({
    runner: "claude",
    nativeBytes: CLAUDE_TURN,
    sourceContext: claudeSourceContext({ kind: "turn", dispatchId: "dispatch-usage-001" }),
    requested: { selector: { kind: "alias", value: "fable" }, effort: "max" },
    duty: "critic_high_risk",
    effectiveModelId: "claude-observed-fixture-model",
    effectiveEffort: "max",
    evidenceSource: "cli",
  });
}

function boundCodexTerraFixture() {
  return boundCodexFixture({
    requested: { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" },
    duty: "implement",
    effectiveModelId: "gpt-5.6-terra",
    effectiveEffort: "xhigh",
  });
}

function codexWithRoute(fixture, nativeEventBytes = CODEX_TURN) {
  return ingestCodexUsage({
    version: "codex-exec-json.v1",
    nativeEventBytes,
    sourceContext: fixture.sourceContext,
    routeContext: fixture.routeContext,
    repoRoot: fixture.root,
  });
}

check("U01 Claude turn fixture preserves the exact native usage object and event bytes", () => {
  const result = ingestClaudeUsage({ version: "claude-transcript-usage.v1", nativeEventBytes: CLAUDE_TURN });
  assert.deepEqual(result.raw, JSON.parse(CLAUDE_TURN).message.usage);
  assert.equal(result.source.eventSha256, sha256(CLAUDE_TURN));
  assert.deepEqual(result.source, {
    kind: "claude-transcript-usage",
    version: "claude-transcript-usage.v1",
    eventSha256: sha256(CLAUDE_TURN),
    threadId: "thread-claude-001",
    turnId: "turn-claude-001",
  });
  assert.deepEqual(result.scope, { kind: "turn" });
  assert.equal(result.common.inputTokens.value, 0);
  assert.equal(result.common.inputTokens.sourceField, "input_tokens");
  assert.equal(result.common.cacheReadInputTokens.value, 0);
  assert.equal(result.common.cachedInputTokens.status, "unavailable");
  assert.equal(result.common.reasoningOutputTokens.status, "unavailable");
  assert.equal(result.common.billedCost.reasonCode, "scope-unbound");
  assert.equal(validateRunnerUsageEnvelope(result).valid, true);
});

check("U02 Claude session fixture has the closed session source/scope pair", () => {
  const context = {
    schema: "pipeline.usage-source-context.v1",
    trust: "runner-wrapper",
    runner: "claude",
    source: { threadId: "thread-claude-session-001" },
    scope: { kind: "session", dispatchId: "dispatch-session-001" },
  };
  const result = ingestClaudeUsage({ version: "claude-transcript-session-usage.v1", nativeEventBytes: CLAUDE_SESSION, sourceContext: context });
  assert.deepEqual(result.source, {
    kind: "claude-transcript-usage",
    version: "claude-transcript-session-usage.v1",
    eventSha256: sha256(CLAUDE_SESSION),
    threadId: "thread-claude-session-001",
  });
  assert.deepEqual(result.scope, { kind: "session", dispatchId: "dispatch-session-001" });
  assert.equal(result.common.outputTokens.value, 0);
  assert.equal(result.common.cacheCreationInputTokens.reasonCode, "source-omitted");
  assert.equal(result.route.effective.reasonCode, "receipt-missing");
});

check("U03 Codex turn.completed fixture requires trusted source IDs and keeps cached input distinct", () => {
  const result = ingestCodexUsage({
    version: "codex-exec-json.v1",
    nativeEventBytes: CODEX_TURN,
    sourceContext: codexSourceContext({ scope: { kind: "turn" } }),
  });
  assert.deepEqual(result.raw, JSON.parse(CODEX_TURN).usage);
  assert.equal(result.source.eventSha256, sha256(CODEX_TURN));
  assert.equal(result.source.threadId, "thread-codex-001");
  assert.equal(result.source.turnId, "turn-codex-001");
  assert.equal(result.common.cachedInputTokens.value, 0);
  assert.equal(result.common.cachedInputTokens.sourceField, "cached_input_tokens");
  assert.equal(result.common.cacheCreationInputTokens.status, "unavailable");
  assert.equal(result.common.cacheReadInputTokens.status, "unavailable");
  assert.equal(result.common.reasoningOutputTokens.value, 2);
  assert.equal(result.route.effective.reasonCode, "dispatch-context-missing");
  assert.equal(validateRunnerUsageEnvelope(result).valid, true);
});

check("U04 omitted native metrics remain source-omitted rather than invented zero", () => {
  const bytes = Buffer.from('{"type":"turn.completed","usage":{"input_tokens":0}}');
  const result = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: bytes, sourceContext: codexSourceContext({ scope: { kind: "turn" } }) });
  assert.deepEqual(result.common.inputTokens, { status: "observed", value: 0, sourceField: "input_tokens", comparison: "same-runner-only" });
  assert.deepEqual(result.common.outputTokens, { status: "unknown", reasonCode: "source-omitted" });
  assert.deepEqual(result.common.cachedInputTokens, { status: "unknown", reasonCode: "source-omitted" });
  assert.deepEqual(result.common.reasoningOutputTokens, { status: "unknown", reasonCode: "source-omitted" });
});

rejects("U05 a parsed event cannot replace exact native bytes", () => ingestClaudeUsage({ version: "claude-transcript-usage.v1", nativeEventBytes: JSON.parse(CLAUDE_TURN) }), "native-event-bytes-required");
rejects("U06 full Claude transcript content is not an accepted event shape", () => ingestClaudeUsage({ version: "claude-transcript-usage.v1", nativeEventBytes: Buffer.from('{"type":"assistant","sessionId":"a","message":{"id":"b","usage":{"input_tokens":1}},"prompt":"secret"}') }), "native-event-shape");
rejects("U07 full Codex tool content is not an accepted event shape", () => ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: Buffer.from('{"type":"turn.completed","usage":{"input_tokens":1},"tool_output":"secret"}'), sourceContext: codexSourceContext() }), "native-event-shape");
rejects("U08 native usage strings and unknown fields are rejected before raw projection", () => ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: Buffer.from('{"type":"turn.completed","usage":{"input_tokens":"1","environment":2}}'), sourceContext: codexSourceContext() }), "usage-subobject-invalid");
rejects("U09 unknown native versions are rejected", () => ingestCodexUsage({ version: "codex-exec-json.v9", nativeEventBytes: CODEX_TURN, sourceContext: codexSourceContext() }), "native-source-unsupported");
rejects("U10 Codex cannot derive ids from its model event", () => ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_TURN }), "source-context-missing");
rejects("U11 untrusted Codex source context is rejected", () => ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_TURN, sourceContext: codexSourceContext({ trust: "runner-wrapper" }) }), "source-context-untrusted");
rejects("U12 Claude wrapper ids must match Claude-native ids", () => ingestClaudeUsage({ version: "claude-transcript-usage.v1", nativeEventBytes: CLAUDE_TURN, sourceContext: { ...claudeSourceContext({ kind: "turn", dispatchId: "d" }), source: { threadId: "different", turnId: "turn-claude-001" } } }), "source-context-mismatch");

check("U13 accepted whole-file receipt and all caller-held bindings make Sol observed", () => {
  const fixture = boundCodexFixture();
  try {
    const result = codexWithRoute(fixture);
    assert.equal(result.route.status, "bound");
    assert.deepEqual(result.route.requested, { selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "max" });
    assert.deepEqual(result.route.effective, { status: "observed", modelId: "gpt-5.6-sol" });
    assert.equal(result.common.billedCost.reasonCode, "billing-unavailable");
    assert.equal(validateRunnerUsageEnvelope(result).valid, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

check("U13a Claude exposes an observed identity only after exact native and receipt bindings match", () => {
  const fixture = boundClaudeFixture();
  try {
    const result = ingestClaudeUsage({
      version: "claude-transcript-usage.v1",
      nativeEventBytes: CLAUDE_TURN,
      sourceContext: fixture.sourceContext,
      routeContext: fixture.routeContext,
      repoRoot: fixture.root,
    });
    assert.equal(result.route.status, "bound");
    assert.deepEqual(result.route.requested, { selector: { kind: "alias", value: "fable" }, effort: "max" });
    assert.deepEqual(result.route.effective, { status: "observed", modelId: "claude-observed-fixture-model" });
    assert.deepEqual(result.source, {
      kind: "claude-transcript-usage",
      version: "claude-transcript-usage.v1",
      eventSha256: sha256(CLAUDE_TURN),
      threadId: "thread-claude-001",
      turnId: "turn-claude-001",
    });
    assert.deepEqual(result.scope, { kind: "turn", dispatchId: "dispatch-usage-001" });
    assert.deepEqual(result.route.binding, fixture.routeContext.binding);
    assert.deepEqual(result.route.receipt, fixture.routeContext.receipt);
    assert.equal(validateRunnerUsageEnvelope(result).valid, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

check("U13b Codex Terra becomes observed only with host-attested same-dispatch evidence", () => {
  const fixture = boundCodexTerraFixture();
  try {
    const result = codexWithRoute(fixture);
    assert.equal(result.route.status, "bound");
    assert.deepEqual(result.route.requested, { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" });
    assert.deepEqual(result.route.effective, { status: "observed", modelId: "gpt-5.6-terra" });
    assert.deepEqual(result.source, {
      kind: "codex-turn-completed-usage",
      version: "codex-exec-json.v1",
      eventSha256: sha256(CODEX_TURN),
      threadId: "thread-codex-001",
      turnId: "turn-codex-001",
    });
    assert.deepEqual(result.scope, { kind: "turn", dispatchId: "dispatch-usage-001" });
    assert.deepEqual(result.route.binding, fixture.routeContext.binding);
    assert.deepEqual(result.route.receipt, fixture.routeContext.receipt);
    assert.equal(validateRunnerUsageEnvelope(result).valid, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

check("U13c critic_high_risk cannot bind a Terra/xhigh request in place of its frozen Sol/max Codex cell", () => {
  const fixture = boundCodexFixture({
    requested: { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" },
    effectiveModelId: "gpt-5.6-terra",
    effectiveEffort: "xhigh",
  });
  try {
    const result = codexWithRoute(fixture);
    assert.equal(result.route.status, "unbound");
    assert.deepEqual(result.route.effective, { status: "unknown", reasonCode: "binding-mismatch" });
    assert.equal("modelId" in result.route.effective, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

check("U14 all binding facade fields are structurally checked, including closed cells", () => {
  const fixture = boundCodexFixture();
  try {
    assert.equal(validateUsageRouteBinding(fixture.routeContext.binding).valid, true);
    assert.equal(validateUsageRouteBinding({ ...fixture.routeContext.binding, extra: true }).valid, false);
    assert.equal(validateUsageRouteBinding({ ...fixture.routeContext.binding, cell: { kind: "duty", dutyId: "unregistered" } }).valid, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function unboundReason(name, mutate, reason) {
  check(name, () => {
    const fixture = boundCodexFixture();
    try {
      mutate(fixture);
      const result = codexWithRoute(fixture);
      assert.equal(result.route.status, "unbound");
      assert.deepEqual(result.route.effective, { status: "unknown", reasonCode: reason });
      assert.equal("requested" in result.route, false);
      assert.equal("binding" in result.route, false);
      assert.equal("receipt" in result.route, false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

unboundReason("U15 a missing route context never searches for a receipt", (fixture) => { fixture.routeContext = undefined; }, "receipt-missing");
unboundReason("U16 usage-event hash mismatch stays unbound", (fixture) => { fixture.routeContext.binding.usageEventSha256 = "e".repeat(64); }, "binding-mismatch");
unboundReason("U17 binding thread mismatch stays unbound", (fixture) => { fixture.routeContext.binding.threadId = "different-thread"; }, "binding-mismatch");
unboundReason("U18 binding turn mismatch stays unbound", (fixture) => { fixture.routeContext.binding.turnId = "different-turn"; }, "binding-mismatch");
unboundReason("U19 binding dispatch mismatch stays unbound", (fixture) => { fixture.routeContext.binding.dispatchId = "different-dispatch"; }, "binding-mismatch");
unboundReason("U20 binding candidate mismatch stays unbound", (fixture) => { fixture.routeContext.dispatchBinding.candidateTree = "f".repeat(40); }, "binding-mismatch");
unboundReason("U21 duty-cell encoding mismatch stays unbound", (fixture) => { fixture.routeContext.dispatchBinding.requestedDuty = "implement"; }, "binding-mismatch");
unboundReason("U22 missing exact receipt path stays unbound", (fixture) => { fixture.routeContext.receipt.repoRelativePath = "receipts/missing.json"; }, "receipt-missing");
unboundReason("U23 receipt digest mismatch stays unbound", (fixture) => { fixture.routeContext.receipt.sha256 = "e".repeat(64); }, "receipt-invalid");
unboundReason("U24 receipt result mismatch stays unbound", (fixture) => { fixture.routeContext.receipt.resultSha256 = "e".repeat(64); }, "binding-mismatch");
unboundReason("U25 receipt route-evidence mismatch stays unbound", (fixture) => { fixture.routeContext.receipt.routeEvidenceSha256 = "e".repeat(64); }, "binding-mismatch");
unboundReason("U26 malformed route context remains a closed binding mismatch", (fixture) => { fixture.routeContext.trustedEvidence = null; }, "binding-mismatch");
unboundReason("U27 caller-held effective evidence mismatch stays unbound", (fixture) => { fixture.routeContext.trustedEvidence.effectiveModelId = "gpt-5.6-terra"; }, "binding-mismatch");

check("U28 a Terra request does not become an effective Terra identity without a P3B-compatible receipt", () => {
  const fixture = boundCodexFixture({ requested: { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" } });
  try {
    fixture.routeContext.binding.cell = { kind: "duty", dutyId: "implement" };
    fixture.routeContext.dispatchBinding.requestedDuty = "implement";
    fixture.routeContext.trustedEvidence = {
      ...fixture.routeContext.trustedEvidence,
      effectiveDuty: "implement",
      effectiveSelector: { kind: "model-id", value: "gpt-5.6-terra" },
      effectiveModelId: "gpt-5.6-terra",
      effectiveEffort: "xhigh",
    };
    const result = codexWithRoute(fixture);
    assert.equal(result.route.status, "unbound");
    assert.equal(result.route.effective.status, "unknown");
    assert.equal("modelId" in result.route.effective, false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

check("U29 the validator covers the frozen workspace aggregate pair and rejects a runner/scope mismatch", () => {
  const aggregate = {
    schema: "pipeline.runner-usage.v1",
    runner: "codex",
    source: { kind: "workspace-analytics-export", version: "workspace-export.v1", eventSha256: "a".repeat(64) },
    scope: { kind: "workspace-account-aggregate" },
    route: { status: "unbound", effective: { status: "unknown", reasonCode: "dispatch-context-missing" } },
    raw: { input_tokens: 0 },
    common: {
      inputTokens: { status: "observed", value: 0, sourceField: "input_tokens", comparison: "same-runner-only" },
      outputTokens: { status: "unknown", reasonCode: "source-omitted" },
      cachedInputTokens: { status: "unavailable", reasonCode: "runner-does-not-emit" },
      cacheCreationInputTokens: { status: "unavailable", reasonCode: "runner-does-not-emit" },
      cacheReadInputTokens: { status: "unavailable", reasonCode: "runner-does-not-emit" },
      reasoningOutputTokens: { status: "unavailable", reasonCode: "runner-does-not-emit" },
      billedCost: { status: "unknown", reasonCode: "billing-unavailable" },
      estimatedCost: { status: "unknown", reasonCode: "billing-unavailable" },
    },
  };
  assert.equal(validateRunnerUsageEnvelope(aggregate).valid, true);
  assert.equal(validateRunnerUsageEnvelope({ ...aggregate, runner: "claude" }).valid, false);
  assert.equal(validateRunnerUsageEnvelope({ ...aggregate, source: { ...aggregate.source, threadId: "forbidden" } }).valid, false);
  const emptyRaw = validateRunnerUsageEnvelope({ ...aggregate, raw: {} });
  assert.equal(emptyRaw.valid, false);
  assert.match(emptyRaw.errors.join("\n"), /^\$\.raw: too few properties$/u);
});

check("U30 ingestion has no repository persistence side effect", () => {
  const before = readFileSync(join(FIXTURES, "codex-turn-completed.json"));
  const result = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_TURN, sourceContext: codexSourceContext({ scope: { kind: "turn" } }) });
  assert.equal(result.schema, "pipeline.runner-usage.v1");
  assert.deepEqual(readFileSync(join(FIXTURES, "codex-turn-completed.json")), before);
});

console.log(`runner-usage-v1: ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
