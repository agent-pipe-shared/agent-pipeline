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
  ingestAntigravityUsage,
  summarizeUsageAttribution,
  validateUsageAttributionBundle,
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

const agyRawBytes = Buffer.from(JSON.stringify({
  type: "turn.completed",
  usage: {
    input_tokens: 150,
    output_tokens: 300,
    cached_tokens: 100
  }
}), "utf8");
const agyEnvelope = ingestAntigravityUsage({
  version: "antigravity-exec-json.v1",
  nativeEventBytes: agyRawBytes,
  sourceContext: {
    schema: "pipeline.usage-source-context.v1",
    trust: "runner-wrapper",
    runner: "antigravity",
    scope: { kind: "turn" },
    source: { threadId: "t1", turnId: "t2" }
  }
});

check("U31 Antigravity turn.completed maps tokens correctly", () => {
  assert.equal(agyEnvelope.schema, "pipeline.runner-usage.v1");
  assert.equal(agyEnvelope.runner, "antigravity");
  assert.equal(agyEnvelope.common.inputTokens.value, 150);
  assert.equal(agyEnvelope.common.outputTokens.value, 300);
  assert.equal(agyEnvelope.common.cachedInputTokens.value, 100);
  assert.deepEqual(agyEnvelope.raw, JSON.parse(agyRawBytes).usage);
  assert.equal(agyEnvelope.source.eventSha256, sha256(agyRawBytes));
  assert.deepEqual(agyEnvelope.common.cachedInputTokens, { status: "observed", value: 100, sourceField: "cached_tokens", comparison: "same-runner-only" });
});

check("U32 Antigravity preserves an explicit zero cached-token counter", () => {
  const bytes = Buffer.from('{"type":"turn.completed","usage":{"input_tokens":7,"output_tokens":0,"cached_tokens":0}}');
  const result = ingestAntigravityUsage({
    version: "antigravity-exec-json.v1",
    nativeEventBytes: bytes,
    sourceContext: {
      schema: "pipeline.usage-source-context.v1",
      trust: "runner-wrapper",
      runner: "antigravity",
      scope: { kind: "turn" },
      source: { threadId: "zero-thread", turnId: "zero-turn" },
    },
  });
  assert.deepEqual(result.raw, JSON.parse(bytes).usage);
  assert.equal(result.source.eventSha256, sha256(bytes));
  assert.deepEqual(result.common.cachedInputTokens, { status: "observed", value: 0, sourceField: "cached_tokens", comparison: "same-runner-only" });
});

check("U33 Antigravity preserves an omitted cached-token counter as omitted", () => {
  const bytes = Buffer.from('{"type":"turn.completed","usage":{"input_tokens":7,"output_tokens":0}}');
  const result = ingestAntigravityUsage({
    version: "antigravity-exec-json.v1",
    nativeEventBytes: bytes,
    sourceContext: {
      schema: "pipeline.usage-source-context.v1",
      trust: "runner-wrapper",
      runner: "antigravity",
      scope: { kind: "turn" },
      source: { threadId: "omitted-thread", turnId: "omitted-turn" },
    },
  });
  assert.deepEqual(result.raw, JSON.parse(bytes).usage);
  assert.equal(result.source.eventSha256, sha256(bytes));
  assert.deepEqual(result.common.cachedInputTokens, { status: "unknown", reasonCode: "source-omitted" });
});

rejects("U34 Antigravity rejects the Codex cached-input field", () => ingestAntigravityUsage({
  version: "antigravity-exec-json.v1",
  nativeEventBytes: Buffer.from('{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":1}}'),
  sourceContext: {
    schema: "pipeline.usage-source-context.v1",
    trust: "runner-wrapper",
    runner: "antigravity",
    scope: { kind: "turn" },
    source: { threadId: "wrong-field-thread", turnId: "wrong-field-turn" },
  },
}), "usage-subobject-invalid");

function attributionEnvelope(runner, threadId, turnId, inputTokens = 10) {
  const bytes = Buffer.from(JSON.stringify({ type: "turn.completed", usage: runner === "antigravity"
    ? { input_tokens: inputTokens, output_tokens: 2, cached_tokens: 1 }
    : { input_tokens: inputTokens, output_tokens: 2, cached_input_tokens: 1, reasoning_output_tokens: 1 } }));
  const sourceContext = runner === "codex"
    ? { schema: "pipeline.usage-source-context.v1", trust: "codex-app-server", runner, source: { threadId, turnId }, scope: { kind: "turn", dispatchId: "dispatch-attribution" } }
    : { schema: "pipeline.usage-source-context.v1", trust: "runner-wrapper", runner, source: { threadId, turnId }, scope: { kind: "turn", dispatchId: "dispatch-attribution" } };
  return runner === "codex"
    ? ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: bytes, sourceContext })
    : ingestAntigravityUsage({ version: "antigravity-exec-json.v1", nativeEventBytes: bytes, sourceContext });
}

function attributionBundle(runner, envelope, classification = "administration", taskId = "same-task") {
  const provenanceKind = {
    administration: "sanitized-control-evidence",
    product: "sanitized-product-evidence",
    mixed: "sanitized-mixed-evidence",
    unknown: "insufficient-evidence",
  }[classification];
  return {
    schema: "pipeline.usage-attribution-bundle.v1",
    runner,
    taskId,
    taskEvidenceSha256: "f".repeat(64),
    scopeKind: "turn",
    events: [{
      envelope,
      attribution: {
        eventSha256: envelope.source.eventSha256,
        class: classification,
        provenance: { kind: provenanceKind, evidenceSha256: "e".repeat(64) },
      },
    }],
  };
}

check("U35 attribution reducer preserves whole-event classes, metrics, and supplied-label boundaries", () => {
  const admin = attributionBundle("codex", attributionEnvelope("codex", "attribution-thread", "admin", 10));
  const product = attributionBundle("antigravity", attributionEnvelope("antigravity", "attribution-thread", "product", 20), "product");
  admin.taskId = "/home/private-user/task-secret";
  product.taskId = admin.taskId;
  const result = summarizeUsageAttribution([admin, product]);
  assert.equal(result.comparison.status, "route-unbound");
  assert.equal(result.comparison.executionEvidence.status, "not-attested-by-reducer");
  assert.match(result.task.matchSemantics, /side-by-side/u);
  assert.equal(typeof result.task.taskIdSha256, "string");
  assert.equal("taskId" in result.task, false);
  assert.equal(result.runners[0].classes.administration.metrics.inputTokens.observed.value, 10);
  assert.equal(result.runners[0].classes.administration.metrics.outputTokens.observed.value, 2);
  assert.equal(result.runners[0].classes.product.eventCount, 0);
  assert.equal(result.runners[0].fieldShares.inputTokens.status, "observed");
  assert.equal(result.runners[0].fieldShares.inputTokens.administration, 1);
  assert.equal(result.runners[0].toolCalls.reasonCode, "runner-usage-event-does-not-emit-tool-use");
  assert.equal(result.runners[0].elapsed.reasonCode, "no-exclusive-interval-source");
  assert.equal(JSON.stringify(result).includes("attribution-thread"), false);
  assert.equal(JSON.stringify(result).includes("/home/private-user/task-secret"), false);
  assert.equal(JSON.stringify(result).includes("input_tokens"), false);
});

check("U36 attribution validation deduplicates exact events and rejects conflicting cumulative identity", () => {
  const envelope = attributionEnvelope("codex", "dedup-thread", "dedup-turn", 5);
  const bundle = attributionBundle("codex", envelope);
  bundle.events.push(JSON.parse(JSON.stringify(bundle.events[0])));
  assert.equal(validateUsageAttributionBundle(bundle).valid, true);
  const result = summarizeUsageAttribution([bundle]);
  assert.equal(result.runners[0].eventCount, 1);
  assert.equal(result.runners[0].deduplicatedEventCount, 1);
  bundle.events[1].attribution.class = "product";
  bundle.events[1].attribution.provenance.kind = "sanitized-product-evidence";
  assert.equal(validateUsageAttributionBundle(bundle).valid, false);
  rejects("U36a conflicting duplicate is rejected by reducer", () => summarizeUsageAttribution([bundle]), "usage-attribution-invalid");
});

check("U37 attribution rejects task mismatch, repeated runner bundles, and aggregate scope", () => {
  const codex = attributionBundle("codex", attributionEnvelope("codex", "mismatch-thread", "one"));
  const antigravity = attributionBundle("antigravity", attributionEnvelope("antigravity", "mismatch-thread", "two"), "product", "other-task");
  assert.throws(() => summarizeUsageAttribution([codex, antigravity]), (error) => error instanceof UsageIngestionError && error.code === "comparison-task-mismatch");
  assert.throws(() => summarizeUsageAttribution([codex, JSON.parse(JSON.stringify(codex))]), (error) => error instanceof UsageIngestionError && error.code === "usage-attribution-duplicate-runner");
  const aggregate = JSON.parse(JSON.stringify(codex));
  aggregate.events[0].envelope.scope = { kind: "workspace-account-aggregate" };
  assert.equal(validateUsageAttributionBundle(aggregate).valid, false);
  const forged = JSON.parse(JSON.stringify(codex));
  forged.events[0].attribution.eventSha256 = "0".repeat(64);
  assert.equal(validateUsageAttributionBundle(forged).valid, false);
  const unsafe = JSON.parse(JSON.stringify(codex));
  unsafe.events[0].envelope.common.inputTokens.value = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(validateUsageAttributionBundle(unsafe).valid, false);
});

check("U38 mixed and unknown classes never receive a token allocation or share", () => {
  const mixed = attributionBundle("codex", attributionEnvelope("codex", "mixed-thread", "mixed", 7), "mixed");
  const result = summarizeUsageAttribution([mixed]);
  assert.equal(result.runners[0].classes.mixed.metrics.inputTokens.observed.value, 7);
  assert.equal(result.runners[0].fieldShares.inputTokens.status, "not-computable");
  assert.equal(result.runners[0].fieldShares.inputTokens.reasonCode, "mixed-or-unknown-events-present");
});

check("U39 attribution rejects an overflow that appears only when class totals are combined", () => {
  const bundle = attributionBundle("codex", attributionEnvelope("codex", "overflow-thread", "administration", Number.MAX_SAFE_INTEGER));
  const product = JSON.parse(JSON.stringify(bundle.events[0]));
  product.envelope.source.turnId = "product";
  product.envelope.source.eventSha256 = "1".repeat(64);
  product.attribution.eventSha256 = "1".repeat(64);
  product.attribution.class = "product";
  product.attribution.provenance.kind = "sanitized-product-evidence";
  bundle.events.push(product);
  rejects("U39a cross-class share denominator overflow is rejected", () => summarizeUsageAttribution([bundle]), "usage-attribution-invalid");
});

check("U40 attribution rejects forged common projections and does not emit hostile projection text", () => {
  const bundle = attributionBundle("codex", attributionEnvelope("codex", "projection-thread", "projection"));
  bundle.events[0].envelope.common.inputTokens.value = 99;
  assert.equal(validateUsageAttributionBundle(bundle).valid, false);
  bundle.events[0].envelope.common.inputTokens.value = 10;
  bundle.events[0].envelope.common.inputTokens.sourceField = "/home/private-user/hostile-source-field";
  assert.equal(validateUsageAttributionBundle(bundle).valid, false);
  assert.throws(() => summarizeUsageAttribution([bundle]), (error) => error instanceof UsageIngestionError && error.code === "usage-attribution-invalid");
});

check("U41 structured event identities do not alias embedded separator characters", () => {
  const bundle = attributionBundle("codex", attributionEnvelope("codex", "a\u0000b", "c"));
  const distinct = JSON.parse(JSON.stringify(bundle.events[0]));
  distinct.envelope.source.threadId = "a";
  distinct.envelope.source.turnId = "b\u0000c";
  distinct.envelope.source.eventSha256 = "2".repeat(64);
  distinct.attribution.eventSha256 = "2".repeat(64);
  bundle.events.push(distinct);
  assert.equal(validateUsageAttributionBundle(bundle).valid, true);
  assert.equal(summarizeUsageAttribution([bundle]).runners[0].eventCount, 2);
});

check("U42 malformed embedded envelopes fail validation without identity dereference", () => {
  const bundle = attributionBundle("codex", attributionEnvelope("codex", "invalid-envelope-thread", "invalid-envelope"));
  bundle.events[0].envelope = {};
  bundle.events[0].attribution.eventSha256 = "0".repeat(64);
  assert.doesNotThrow(() => validateUsageAttributionBundle(bundle));
  assert.equal(validateUsageAttributionBundle(bundle).valid, false);
});

console.log(`runner-usage-v1: ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
