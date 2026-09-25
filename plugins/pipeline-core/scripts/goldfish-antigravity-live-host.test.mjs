// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LIVE_REQUEST_SCHEMA, LIVE_REQUEST_SEAL, parseArgs, runGoldfishAntigravityLiveHost } from "./goldfish-antigravity-live-host.mjs";
import { verifyAgySessionResultReadback } from "../lib/agy-session-dispatch.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { buildSignatureIntent, consentSubject, digest } from "../lib/agy-session-authority.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { runConsentCommand } from "./agy-session-consent.mjs";
import { publishAgyInterruptedRecord, publishAgyUndeliveredRecord } from "./agy-undelivered-record.mjs";

const request = {
  schema: LIVE_REQUEST_SCHEMA,
  seal: LIVE_REQUEST_SEAL,
  root: "/repo",
  resultRoot: "/repo",
  resultPath: "results/out.json",
  packet: { role: "pipeline-core:goldfish-implementor", transport: "antigravity" },
  sessionId: "session-1",
  descriptorSha256: "a".repeat(64),
  consent: null,
  requestedModel: "gemini-3.8-flash-high",
  effort: "high",
  scope: "implementation-scope",
  inputSha256: "a".repeat(64),
  routePolicySha256: "b".repeat(64),
  timeoutMs: 1000,
};

test("live wrapper rejects a malformed request without launcher/model calls", async () => {
  const result = await runGoldfishAntigravityLiveHost({ schema: LIVE_REQUEST_SCHEMA }, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-LIVE-REQUEST-SHAPE");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("live wrapper keeps no-consent at zero calls", async () => {
  const result = await runGoldfishAntigravityLiveHost(request, { agyPath: "/unused" });
  assert.equal(result.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(result.modelCalls, 0);
  assert.equal(result.launcherCalls, 0);
});

test("argument parser is closed", () => {
  assert.deepEqual(parseArgs(["--request", "request.json"]), "request.json");
  assert.throws(() => parseArgs([]), /usage/u);
  assert.throws(() => parseArgs(["--request", "a", "extra"]), /usage/u);
});

test("non-authoring Agy producer binds its interrupted record to exact writer bytes", () => {
  const input = { root: "/fixture", taskId: "interrupted-direct", role: "pipeline-core:goldfish-mechanic",
    candidateCommit: "a".repeat(40), observedModel: "unknown", requestedEffort: "high",
    routePolicySha256: "b".repeat(64), modelCalls: 1, reasonCode: "private untrusted text" };
  let published = 0;
  const writer = ({ target, record }) => {
    published += 1;
    assert.equal(target, "evidence/dispatch-record-interrupted-direct.json");
    assert.equal(record.agentType, "goldfish-mechanic");
    assert.equal(record.outcome, "stopped-without-commit");
    assert.deepEqual(record.commits, []);
    assert.equal(record.criticRequired.appliedRow, "T4");
    assert.match(record.report.text, /AGY-INTERRUPTED-UNKNOWN/u);
    assert.equal(JSON.stringify(record).includes("private untrusted text"), false);
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    return { schema: "pipeline.dispatch-record-write-receipt.v2", target,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
      taskId: record.taskId, candidateCommit: record.candidateCommit,
      resultSha256: record.resultSha256, outcomeClassification: record.outcomeClassification };
  };
  const accepted = publishAgyInterruptedRecord(input, { writeDispatchRecordObject: writer });
  assert.equal(accepted.ok, true);
  assert.equal(published, 1);
  const mismatched = publishAgyInterruptedRecord(input, { writeDispatchRecordObject: (request) => ({
    ...writer(request), sha256: "0".repeat(64),
  }) });
  assert.equal(mismatched.code, "AGY-INTERRUPTION-RECORD-READBACK");
  assert.equal(published, 2);
  const rejected = publishAgyInterruptedRecord({ ...input, modelCalls: 0 }, {
    writeDispatchRecordObject: () => { throw new Error("must not publish"); },
  });
  assert.equal(rejected.code, "AGY-INTERRUPTION-RECORD-INPUT");
});

test("completed-undelivered producer refuses a writer receipt for another path", () => {
  const result = publishAgyUndeliveredRecord({ root: "/fixture", taskId: "undelivered-direct",
    role: "pipeline-core:goldfish-implementor", candidateCommit: "a".repeat(40),
    observedModel: "unknown", requestedEffort: "high", routePolicySha256: "b".repeat(64),
    status: "completed-undelivered", modelCalls: 1 }, {
    writeDispatchRecordObject: ({ record }) => ({
      schema: "pipeline.dispatch-record-write-receipt.v2", target: "evidence/another.json",
      sha256: "0".repeat(64), bytes: 1, taskId: record.taskId,
      candidateCommit: record.candidateCommit, resultSha256: null,
      outcomeClassification: record.outcomeClassification,
      observationIdentity: record.observationIdentity,
    }),
  });
  assert.equal(result.code, "AGY-UNDELIVERED-RECORD-READBACK");
});

test("real temporary session admits two distinct bounded fixture tasks and reuses stored consent", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-live-e2e-")); writeFileSync(join(root, "input.txt"), "input\n"); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "E2E"], { cwd: root }); execFileSync("git", ["add", "input.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "one"], { cwd: root }); const first = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
  writeFileSync(join(root, "second.txt"), "second\n"); execFileSync("git", ["add", "second.txt"], { cwd: root }); execFileSync("git", ["commit", "-q", "-m", "two"], { cwd: root }); const second = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
  mkdirSync(join(root, "evidence"));
  const started = startSessionDescriptor(root, { sessionId: "live-e2e" }); const session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 }; const expiresAtMs = Date.now() + 60_000; const subject = consentSubject({ repository: { primaryRoot: started.repo.primaryRoot, commonDir: started.repo.commonDir }, session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"], allowedPaths: ["input.txt", "second.txt"], scope: "implementation", fallbackPolicy: "none", expiresAtMs, decisionNonce: "live-decision-nonce" }); const intent = buildSignatureIntent({ featureId: "live-e2e", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate: first, subjectSha256: digest(subject) }); const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const publicKeyText = publicKey.export({ type: "spki", format: "pem" }); const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "live-decision-nonce", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof: { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "live-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") }, approvedAtMs: Date.now(), expiresAtMs };
  const recordFile = join(root, "record.json"); writeFileSync(recordFile, JSON.stringify(record)); const policy = { ok: true, trustAnchors: [{ keyReference: "live-key", publicKeySha256: createHash("sha256").update(publicKeyText).digest("hex") }], trustAnchor: null }; await runConsentCommand(["record", "--root", root, "--session-id", started.sessionId, "--descriptor-sha256", started.descriptorSha256, "--record", recordFile], { policy });
  const agy = join(root, "agy-mock"); writeFileSync(agy, "#!/usr/bin/env node\nif (process.argv[process.argv.indexOf('--output-format') + 1] !== 'stream-json') process.exit(9); console.log(JSON.stringify({event:'init',conversation_id:'mock-conversation',init:{model:'gemini-3.8-flash-high'}})); console.log(JSON.stringify({event:'step_update',step_update:{text_delta:'private tool data'}})); console.log(JSON.stringify({event:'result',result:{conversation_id:'mock-conversation',status:'SUCCESS',response:'ok'}}));\n"); chmodSync(agy, 0o755); mkdirSync(join(root, "results")); const packet = (candidate, dispatchId, path, role = "pipeline-core:goldfish-implementor") => ({ schema: "pipeline.role-dispatch-request.v1", dispatchId, transport: "antigravity", role, prompt: "## Briefing\n### 1. Goal\nImplement bounded task.\n### 2. Context files\n- input.txt\n### 3. DoD checks\n- bounded\n### 4. Forbidden\n- unrelated\n### 5. Stop conditions\n- missing\n### 6. Dispatch-Metadata\nModel: gemini-3.8-flash-high; effort high; Ruleset-SHA: local-test.\n- **Tool budget (hard cap, first-class field):** <=40 tool uses.", candidate, requiredPaths: [path], requiredPathSha256: { [path]: createHash("sha256").update(readFileSync(join(root, path))).digest("hex") }, resultDestination: { kind: "return" } });
  const base = { schema: LIVE_REQUEST_SCHEMA, seal: LIVE_REQUEST_SEAL, root, resultRoot: root, sessionId: started.sessionId, descriptorSha256: started.descriptorSha256, consent: "stored", requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "implementation", timeoutMs: 10_000, inputSha256: createHash("sha256").update("implementation").digest("hex"), routePolicySha256: "c".repeat(64) };
  const one = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/one.json", packet: packet(second, "one", "input.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() });
  assert.equal(one.status, "completed-undelivered", JSON.stringify(one));
  const two = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/two.json", packet: packet(second, "two", "second.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() });
  assert.equal(two.status, "completed-undelivered", JSON.stringify(two));
  const mechanic = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/mechanic.json",
    packet: packet(second, "mechanic", "input.txt", "pipeline-core:goldfish-mechanic") },
  { agyPath: agy, policy, nowEpochMs: Date.now() });
  assert.equal(mechanic.status, "completed-undelivered", JSON.stringify(mechanic));
  assert.equal(JSON.parse(readFileSync(join(root, mechanic.record.target), "utf8")).agentType,
    "goldfish-mechanic");
  assert.equal(one.record?.target, "evidence/dispatch-record-one.json");
  assert.equal(two.record?.target, "evidence/dispatch-record-two.json");
  const undelivered = JSON.parse(readFileSync(join(root, one.record.target), "utf8"));
  assert.equal(undelivered.outcomeClassification.kind, "completed-undelivered");
  assert.equal(undelivered.runner, "antigravity");
  assert.equal(undelivered.model, "gemini-3.8-flash-high");
  assert.deepEqual(undelivered.commits, []);
  assert.equal(undelivered.resultSha256, null);
  assert.equal(undelivered.report, null);
  const duplicate = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/one-retry.json", packet: packet(second, "one", "input.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() });
  assert.equal(duplicate.code, "AGY-RECORD-TARGET-EXISTS");
  assert.equal(duplicate.modelCalls, 0);
  assert.equal(duplicate.launcherCalls, 0);
  assert.equal(one.consent.subjectSha256, record.subjectSha256);
  assert.equal(two.consent.subjectSha256, record.subjectSha256);
  const wrongModelAgy = join(root, "agy-wrong-model-mock");
  writeFileSync(wrongModelAgy, "#!/usr/bin/env node\nconsole.log(JSON.stringify({event:'init',conversation_id:'wrong-model',init:{model:'gemini-unapproved'}})); console.log(JSON.stringify({event:'result',result:{conversation_id:'wrong-model',status:'SUCCESS',response:'no structured final'}}));\n");
  chmodSync(wrongModelAgy, 0o755);
  const wrongModel = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/wrong-model.json", packet: packet(second, "wrong-model", "input.txt"),
  }, { agyPath: wrongModelAgy, policy, nowEpochMs: Date.now(),
    publishUndeliveredRecord: () => { throw new Error("must not publish a wrong-model observation"); } });
  assert.equal(wrongModel.status, "recovery-required", JSON.stringify(wrongModel));
  assert.equal(wrongModel.processClosed, false);
  assert.equal(wrongModel.record, null);
  for (const [dispatchId, launched, expected] of [
    ["wrong-model-return", { status: "completed-undelivered", modelCalls: 1,
      observed: { model: "gemini-unapproved" }, final: null }, "AGY-UNDELIVERED-MODEL-UNVERIFIED"],
    ["contradictory-final", { status: "completed-undelivered", modelCalls: 1,
      observed: { model: base.requestedModel }, final: { outcome: "succeeded" } }, "AGY-UNDELIVERED-FINAL-CONFLICT"],
  ]) {
    const contradiction = await runGoldfishAntigravityLiveHost({ ...base,
      resultPath: `results/${dispatchId}.json`, packet: packet(second, dispatchId, "input.txt"),
    }, { agyPath: agy, policy, nowEpochMs: Date.now(), dispatchAgySession: async () => launched,
      publishUndeliveredRecord: () => { throw new Error("must not publish a contradictory observation"); } });
    assert.equal(contradiction.status, "recovery-required", JSON.stringify(contradiction));
    assert.equal(contradiction.code, expected);
    assert.equal(contradiction.record, null);
  }
  const changedHead = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/head-drift.json", packet: packet(second, "head-drift", "input.txt"),
  }, { agyPath: agy, policy, nowEpochMs: Date.now(),
    observeAgyHostHead: () => ({ ok: false, code: "AGY-HOST-HEAD-DRIFT" }) });
  assert.equal(changedHead.status, "recovery-required", JSON.stringify(changedHead));
  assert.equal(changedHead.code, "AGY-UNDELIVERED-HEAD-UNVERIFIED");
  assert.equal(changedHead.record, null);
  for (const [dispatchId, publishUndeliveredRecord] of [
    ["publish-rejected", () => ({ ok: false, code: "injected-private-error" })],
    ["publish-threw", () => { throw new Error("injected-private-error"); }],
  ]) {
    const failed = await runGoldfishAntigravityLiveHost({ ...base,
      resultPath: `results/${dispatchId}.json`, packet: packet(second, dispatchId, "input.txt"),
    }, { agyPath: agy, policy, nowEpochMs: Date.now(), publishUndeliveredRecord });
    assert.equal(failed.status, "recovery-required", JSON.stringify(failed));
    assert.equal(failed.code, "AGY-UNDELIVERED-RECORD-UNVERIFIED");
    assert.equal(failed.record, null);
    assert.equal(failed.modelCalls, 1);
    assert.equal(JSON.stringify(failed).includes("injected-private-error"), false);
  }
  const failingAgy = join(root, "agy-failing-mock");
  writeFileSync(failingAgy, "#!/usr/bin/env node\nconsole.log(JSON.stringify({event:'init',conversation_id:'failed-conversation',init:{model:'gemini-3.8-flash-high'}})); process.exit(7);\n");
  chmodSync(failingAgy, 0o755);
  const interrupted = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/interrupted.json", packet: packet(second, "interrupted", "input.txt",
      "pipeline-core:goldfish-mechanic"),
  }, { agyPath: failingAgy, policy, nowEpochMs: Date.now() });
  assert.equal(interrupted.status, "interrupted-recorded", JSON.stringify(interrupted));
  assert.equal(interrupted.code, "AGY-INTERRUPTION-RECORDED");
  assert.equal(interrupted.modelCalls, 1);
  const interruptionRecord = JSON.parse(readFileSync(join(root, interrupted.record.target), "utf8"));
  assert.equal(interruptionRecord.agentType, "goldfish-mechanic");
  assert.equal(interruptionRecord.outcomeClassification.kind, "stopped-without-commit");
  // A nonzero CLI exit is an attempted launch, not a trustworthy model attestation.
  assert.equal(interruptionRecord.model, "unknown");
  assert.deepEqual(interruptionRecord.commits, []);
  assert.deepEqual(interruptionRecord.report.changedFiles, []);
  assert.equal(interruptionRecord.criticRequired.appliedRow, "T4");
  assert.match(interruptionRecord.report.text, /AGY-NONZERO-EXIT/u);
  assert.equal(JSON.stringify(interruptionRecord).includes("private tool data"), false);
  const interruptedHeadDrift = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/interrupted-head-drift.json", packet: packet(second, "interrupted-head-drift", "input.txt"),
  }, { agyPath: failingAgy, policy, nowEpochMs: Date.now(),
    observeAgyHostHead: () => ({ ok: false, code: "AGY-HOST-HEAD-DRIFT" }),
    publishInterruptedRecord: () => { throw new Error("must not publish after HEAD drift"); } });
  assert.equal(interruptedHeadDrift.status, "recovery-required");
  assert.equal(interruptedHeadDrift.code, "AGY-INTERRUPTION-HEAD-UNVERIFIED");
  assert.equal(interruptedHeadDrift.record, null);
  const committingAgy = join(root, "agy-commit-then-fail-mock");
  writeFileSync(committingAgy, "#!/usr/bin/env node\nconst {execFileSync}=require('node:child_process'); execFileSync('git',['commit','--allow-empty','-qm','simulated child commit'],{cwd:process.cwd()}); process.exit(7);\n");
  chmodSync(committingAgy, 0o755);
  try {
    const childCommitted = await runGoldfishAntigravityLiveHost({ ...base,
      resultPath: "results/child-committed.json", packet: packet(second, "child-committed", "input.txt"),
    }, { agyPath: committingAgy, policy, nowEpochMs: Date.now(),
      publishInterruptedRecord: () => { throw new Error("must not claim no commit after child commit"); } });
    assert.notEqual(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), second.commit);
    assert.equal(childCommitted.status, "recovery-required", JSON.stringify(childCommitted));
    assert.equal(childCommitted.code, "AGY-INTERRUPTION-HEAD-UNVERIFIED");
    assert.equal(childCommitted.record, null);
  } finally {
    // Restore only this disposable fixture's HEAD for the remaining cases.
    execFileSync("git", ["update-ref", "HEAD", second.commit], { cwd: root });
  }
  const contradictoryInterrupted = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/interrupted-final.json", packet: packet(second, "interrupted-final", "input.txt"),
  }, { agyPath: agy, policy, nowEpochMs: Date.now(),
    dispatchAgySession: async () => ({ status: "unavailable", modelCalls: 1, launcherCalls: 1,
      final: { outcome: "succeeded" }, result: null, observed: { model: base.requestedModel } }),
    publishInterruptedRecord: () => { throw new Error("must not contradict delivered final"); } });
  assert.equal(contradictoryInterrupted.status, "recovery-required");
  assert.equal(contradictoryInterrupted.code, "AGY-MODEL-CALL-NO-DURABLE-CLOSURE");
  assert.equal(contradictoryInterrupted.record, null);
  const unstarted = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/unstarted.json", packet: packet(second, "unstarted", "input.txt"),
  }, { agyPath: agy, policy, nowEpochMs: Date.now(),
    dispatchAgySession: async () => ({ status: "unavailable", processStarted: false,
      modelCalls: 1, launcherCalls: 1, final: null, result: null }),
    publishInterruptedRecord: () => { throw new Error("must not claim a started call"); } });
  assert.equal(unstarted.status, "recovery-required");
  assert.equal(unstarted.record, null);
  const unclosed = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/unclosed.json", packet: packet(second, "unclosed", "input.txt"),
  }, { agyPath: agy, policy, nowEpochMs: Date.now(),
    dispatchAgySession: async () => ({ status: "unavailable", processStarted: true,
      processClosed: false, modelCalls: 1, launcherCalls: 1, final: null, result: null }),
    publishInterruptedRecord: () => { throw new Error("must not claim a closed process"); } });
  assert.equal(unclosed.status, "recovery-required");
  assert.equal(unclosed.record, null);
  const interruptedPublicationFailure = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/interrupted-write-fail.json", packet: packet(second, "interrupted-write-fail", "input.txt"),
  }, { agyPath: failingAgy, policy, nowEpochMs: Date.now(),
    publishInterruptedRecord: () => { throw new Error("private interrupted writer detail"); } });
  assert.equal(interruptedPublicationFailure.status, "recovery-required");
  assert.equal(interruptedPublicationFailure.code, "AGY-INTERRUPTION-RECORD-UNVERIFIED");
  assert.equal(interruptedPublicationFailure.record, null);
  assert.equal(JSON.stringify(interruptedPublicationFailure).includes("private interrupted writer detail"), false);

  const resultThenFailureAgy = join(root, "agy-result-then-failure-mock");
  writeFileSync(resultThenFailureAgy, "#!/usr/bin/env node\nconsole.log(JSON.stringify({event:'init',conversation_id:'result-before-failure',init:{model:'gemini-3.8-flash-high'}})); console.log(JSON.stringify({event:'result',result:{conversation_id:'result-before-failure',status:'SUCCESS',response:'final-like payload'}})); process.exit(7);\n");
  chmodSync(resultThenFailureAgy, 0o755);
  const resultThenFailure = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/result-then-failure.json", packet: packet(second, "result-then-failure", "input.txt"),
  }, { agyPath: resultThenFailureAgy, policy, nowEpochMs: Date.now(),
    publishInterruptedRecord: () => { throw new Error("must not assert no Final after a transport result"); } });
  assert.equal(resultThenFailure.status, "recovery-required");
  assert.equal(resultThenFailure.transportResultObserved, true);
  assert.equal(resultThenFailure.record, null);
  const resultThenTimeoutAgy = join(root, "agy-result-then-timeout-mock");
  writeFileSync(resultThenTimeoutAgy, "#!/usr/bin/env node\nconsole.log(JSON.stringify({event:'init',conversation_id:'result-before-timeout',init:{model:'gemini-3.8-flash-high'}})); console.log(JSON.stringify({event:'result',result:{conversation_id:'result-before-timeout',status:'SUCCESS',response:'final-like payload'}})); setInterval(() => {}, 1000);\n");
  chmodSync(resultThenTimeoutAgy, 0o755);
  const resultThenTimeout = await runGoldfishAntigravityLiveHost({ ...base,
    timeoutMs: 250, resultPath: "results/result-then-timeout.json",
    packet: packet(second, "result-then-timeout", "input.txt"),
  }, { agyPath: resultThenTimeoutAgy, policy, nowEpochMs: Date.now(),
    publishInterruptedRecord: () => { throw new Error("must not assert no Final after a transport result"); } });
  assert.equal(resultThenTimeout.status, "recovery-required");
  assert.equal(resultThenTimeout.processClosed, true);
  assert.equal(resultThenTimeout.transportResultObserved, true);
  assert.equal(resultThenTimeout.record, null);

  const structuredAgy = join(root, "agy-structured-mock");
  writeFileSync(structuredAgy, `#!/usr/bin/env node
const fs = require('node:fs');
const schema = JSON.parse(process.argv[process.argv.indexOf('--json-schema') + 1]);
fs.writeFileSync('input.txt', 'implemented\\n');
if (process.env.AGY_TEST_REVOKE_PATH) fs.writeFileSync(process.env.AGY_TEST_REVOKE_PATH, process.env.AGY_TEST_REVOKE_CONTENT);
const dispatchId = process.argv.at(-1).slice('--print='.length).includes('dispatchId revoked') ? 'revoked' : 'success';
const final = {schema:'pipeline.agy-final-return.v1',dispatchId,candidateCommit:'${second.commit}',outcome:'succeeded',report:'Implemented the consent-bound file.',changedPaths:['input.txt']};
console.log(JSON.stringify({event:'init',conversation_id:'structured-conversation',init:{model:'gemini-3.8-flash-high'}}));
console.log(JSON.stringify({event:'result',result:{conversation_id:'structured-conversation',status:'SUCCESS',response:JSON.stringify(final),structured_output:final,json_schema:schema}}));
`);
  chmodSync(structuredAgy, 0o755);
  const success = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/success.json", packet: packet(second, "success", "input.txt") }, { agyPath: structuredAgy, policy, nowEpochMs: Date.now() });
  assert.equal(success.status, "final-pending-host-commit", JSON.stringify(success));
  assert.deepEqual(success.commitAdmission?.paths, ["input.txt"]);
  assert.equal(success.commitAdmission?.final?.report, "Implemented the consent-bound file.");
  assert.equal(success.commitAdmission?.final?.reportSha256, success.final.reportSha256);
  assert.equal(success.commitAdmission?.criticRequired?.appliedRow, "T3");
  assert.equal(success.commitAdmission?.recordPreflight?.code, "AGY-RECORD-PREFLIGHT-READY");
  assert.equal(success.commitAdmission?.modelWitness?.model, "gemini-3.8-flash-high");
  assert.equal(success.commitAdmission?.modelWitness?.dispatchId, "success");
  assert.equal(success.commitAdmission?.modelWitness?.candidateCommit, second.commit);
  assert.equal(success.commitAdmission?.modelWitness?.candidateTree, second.tree);
  assert.equal(success.commitAdmission?.modelWitness?.descriptorSha256, started.descriptorSha256);
  assert.equal(success.commitAdmission?.modelWitness?.routePolicySha256, base.routePolicySha256);
  assert.equal(success.commitAdmission?.modelWitness?.consentDecisionId, record.decisionId);
  assert.equal(success.commitAdmission?.modelWitness?.resultSha256, success.result.sha256);
  assert.equal(success.commitAdmission?.modelWitness?.resultPath, "results/success.json");
  assert.equal(success.commitAdmission?.modelWitness?.resultBytes, success.result.bytes);
  assert.equal(success.commitAdmission?.modelWitness?.consentSubjectSha256, record.subjectSha256);
  assert.equal(success.commitAdmission?.modelWitness?.consentRecordSha256,
    digest(record));
  assert.equal(success.commitAdmission?.modelWitness?.scope, "implementation");
  assert.equal(success.commitAdmission?.modelWitness?.inputSha256, base.inputSha256);
  assert.equal(success.commitAdmission?.modelWitness?.observedAtMs > 0, true);
  const readbackInput = { resultRoot: root, resultPath: "results/success.json", receipt: success.result,
    dispatchId: "success", candidate: second, sessionId: started.sessionId,
    requestedModel: base.requestedModel, expectedFinal: success.final };
  const exactReadback = verifyAgySessionResultReadback(readbackInput);
  assert.equal(exactReadback.code, "AGY-RESULT-READBACK-VERIFIED");
  assert.equal(exactReadback.final.report, "Implemented the consent-bound file.");
  assert.equal(exactReadback.final.reportSha256, success.final.reportSha256);
  assert.equal(verifyAgySessionResultReadback({ ...readbackInput,
    expectedFinal: { ...success.final, outcome: "failed" } }).code, "AGY-RESULT-READBACK-FINAL");
  assert.equal(verifyAgySessionResultReadback({ ...readbackInput, requestedModel: "forged-model" }).code, "AGY-RESULT-READBACK-BINDING");
  writeFileSync(join(root, "results/success.json"), "tampered\n");
  assert.equal(verifyAgySessionResultReadback(readbackInput).code, "AGY-RESULT-READBACK-DRIFT");
  const duplicateJson = Buffer.from('{"schema":"x","schema":"y"}\n');
  writeFileSync(join(root, "results/success.json"), duplicateJson);
  assert.equal(verifyAgySessionResultReadback({ ...readbackInput,
    receipt: { ...success.result, bytes: duplicateJson.length,
      sha256: createHash("sha256").update(duplicateJson).digest("hex") },
  }).code, "AGY-RESULT-READBACK-MALFORMED");
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).includes(" M input.txt"), true);

  writeFileSync(join(root, "input.txt"), "input\n");
  const failedFinalAgy = join(root, "agy-failed-final-mock");
  writeFileSync(failedFinalAgy, `#!/usr/bin/env node
const schema = JSON.parse(process.argv[process.argv.indexOf('--json-schema') + 1]);
const final = {schema:'pipeline.agy-final-return.v1',dispatchId:'failed-final',candidateCommit:'${second.commit}',outcome:'failed',report:'The bounded task could not be completed.',changedPaths:[]};
console.log(JSON.stringify({event:'init',conversation_id:'failed-final-conversation',init:{model:'gemini-3.8-flash-high'}}));
console.log(JSON.stringify({event:'result',result:{conversation_id:'failed-final-conversation',status:'SUCCESS',response:JSON.stringify(final),structured_output:final,json_schema:schema}}));
`);
  chmodSync(failedFinalAgy, 0o755);
  const failedFinal = await runGoldfishAntigravityLiveHost({ ...base,
    resultPath: "results/failed-final.json", packet: packet(second, "failed-final", "input.txt"),
  }, { agyPath: failedFinalAgy, policy, nowEpochMs: Date.now() });
  assert.equal(failedFinal.status, "recovery-required", JSON.stringify(failedFinal));
  assert.equal(failedFinal.code, "AGY-FINAL-NONAUTHORING");
  assert.equal(failedFinal.final?.outcome, "failed");
  assert.equal(failedFinal.record, null);
  assert.equal(verifyAgySessionResultReadback({ resultRoot: root,
    resultPath: "results/failed-final.json", receipt: failedFinal.result,
    dispatchId: "failed-final", candidate: second, sessionId: started.sessionId,
    requestedModel: base.requestedModel, expectedFinal: failedFinal.final }).code,
  "AGY-RESULT-READBACK-VERIFIED");
  assert.equal(verifyAgySessionResultReadback({ resultRoot: root,
    resultPath: "results/failed-final.json", receipt: failedFinal.result,
    dispatchId: "failed-final", candidate: second, sessionId: started.sessionId,
    requestedModel: base.requestedModel,
    expectedFinal: { ...failedFinal.final, outcome: "succeeded" } }).code,
  "AGY-RESULT-READBACK-FINAL");
  const revokePath = join(started.repo.commonDir, "agent-pipeline", "run", "agy-session-consent", `${started.sessionId}.json.revoked`);
  const revoked = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/revoked.json", packet: packet(second, "revoked", "input.txt") }, {
    agyPath: structuredAgy, policy, nowEpochMs: Date.now(),
    env: { ...process.env, AGY_TEST_REVOKE_PATH: revokePath, AGY_TEST_REVOKE_CONTENT: JSON.stringify([{ decisionId: record.decisionId, subjectSha256: record.subjectSha256 }]) },
  });
  assert.equal(revoked.status, "recovery-required", JSON.stringify(revoked));
  assert.equal(revoked.commitAdmission, undefined);
  assert.equal(revoked.record, null);
  const crashedRevoke = await runGoldfishAntigravityLiveHost({ ...base, resultPath: "results/crashed.json", packet: packet(second, "crashed", "second.txt") }, { agyPath: agy, policy, nowEpochMs: Date.now() });
  assert.equal(crashedRevoke.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(crashedRevoke.modelCalls, 0);
  assert.equal(crashedRevoke.launcherCalls, 0);
});
