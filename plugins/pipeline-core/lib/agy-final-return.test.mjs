// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join } from "node:path";
import { AGY_FINAL_RETURN_JSON_SCHEMA, AGY_FINAL_RETURN_SCHEMA, agyAgentTypeForRole, draftAgyAuthoredRecordAfterCommit, preflightAgyAuthoredRecord, validateAgyFinalReturn } from "./agy-final-return.mjs";
import { agyAuthoredRecordBytes, draftAgyHostObservedReceipt,
  validateAgyHostObservedReceiptShape } from "./agy-host-observed-receipt.mjs";
import { persistAgyHostObservedReceipt, readAgyHostObservedReceipt } from "./agy-host-observed-store.mjs";
import { inspectAgyHostObservedLocalReadback } from "./agy-host-observed-local-readback.mjs";
import { buildSignatureIntent, consentStoragePath, consentSubject, digest } from "./agy-session-authority.mjs";
import { startSessionDescriptor } from "./worktree-lifecycle.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { writeDispatchRecordObject, writeHostObservedAgyDispatchRecord } from "../scripts/dispatch-record-write.mjs";
import { captureAgyHostCommitBaseline, assessAgyHostCommit } from "./agy-host-commit-admission.mjs";
import { finalizeAgyHostObservedReturn } from "../scripts/agy-host-observed-finalize.mjs";
import { gitDeps } from "../scripts/dispatch-authorship-verify.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "./critic-skip-decision.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: name.slice(0, 5), name: name.slice(6), run }); }

const dispatchId = "agy-final-1";
const candidateCommit = "a".repeat(40);
const final = { schema: AGY_FINAL_RETURN_SCHEMA, dispatchId, candidateCommit, outcome: "succeeded", report: "Implemented bounded change.", changedPaths: ["src/one.mjs"] };
const envelope = (value = final) => ({ conversation_id: "conversation-one", status: "SUCCESS", response: JSON.stringify(value), structured_output: value, json_schema: AGY_FINAL_RETURN_JSON_SCHEMA });
const validate = (value) => validateAgyFinalReturn(value, { dispatchId, candidateCommit });

test("AFR01 accepts a bound successful final and computes the exact report digest", () => {
  const result = validate(envelope());
  assert.equal(result.ok, true);
  assert.equal(result.changedPaths[0], "src/one.mjs");
  assert.match(result.reportSha256, /^[a-f0-9]{64}$/u);
});

test("AFR02 refuses free text, fake CLI status and missing schema enforcement", () => {
  for (const value of [
    { ...envelope(), structured_output: undefined },
    { ...envelope(), status: "ERROR" },
    { ...envelope(), json_schema: null },
    { ...envelope(), json_schema: { type: "object" } },
  ]) assert.equal(validate(value).ok, false);
});

test("AFR03 binds dispatch and candidate, refusing a return for a different task", () => {
  assert.equal(validate(envelope({ ...final, dispatchId: "other" })).code, "AGY-FINAL-BINDING-MISMATCH");
  assert.equal(validate(envelope({ ...final, candidateCommit: "b".repeat(40) })).code, "AGY-FINAL-BINDING-MISMATCH");
});

test("AFR04 rejects escaping, duplicated and non-normalized paths", () => {
  for (const changedPaths of [["../outside"], ["/tmp/private"], ["C:/private"], ["src\\one.mjs"], ["src/one.mjs", "src/one.mjs"], ["src/./one.mjs"]]) {
    assert.equal(validate(envelope({ ...final, changedPaths })).code, "AGY-FINAL-SHAPE-INVALID");
  }
});

test("AFR05 unsuccessful finals cannot authorize a changed path or a commit", () => {
  for (const outcome of ["failed", "blocked"]) {
    assert.equal(validate(envelope({ ...final, outcome, changedPaths: [] })).ok, true);
    assert.equal(validate(envelope({ ...final, outcome })).code, "AGY-FINAL-SHAPE-INVALID");
  }
  assert.equal(validate(envelope({ ...final, changedPaths: [] })).code, "AGY-FINAL-SHAPE-INVALID");
});

test("AFR06 rejects extra fields and an overlong or empty report", () => {
  assert.equal(validate(envelope({ ...final, note: "unbound" })).code, "AGY-FINAL-ENVELOPE-INVALID");
  assert.equal(validate(envelope({ ...final, report: " " })).code, "AGY-FINAL-SHAPE-INVALID");
  assert.equal(validate(envelope({ ...final, report: "x".repeat(16385) })).code, "AGY-FINAL-SHAPE-INVALID");
});

test("AFR07 accepts v4-sized multiline reports but rejects private paths before host commit", () => {
  const report = `Implemented the change.\n${"Verified exact paths. ".repeat(80)}`;
  assert.equal(validate(envelope({ ...final, report })).report, report);
  for (const unsafe of ["read /home/alice/private/report", "opened C:\\Users\\Alice\\secret.txt",
    "ran at /mnt/c/Users/Andre/private", "x\r\ny", "x\0y"]) {
    assert.equal(validate(envelope({ ...final, report: unsafe })).code, "AGY-FINAL-SHAPE-INVALID");
  }
});

test("AFR08 refuses paths that v4 authorship would reject or read as another path", () => {
  assert.deepEqual(validate(envelope({ ...final, changedPaths: ["src/name-with-dash.mjs"] })).changedPaths,
    ["src/name-with-dash.mjs"]);
  for (const changedPaths of [["src/file name.mjs"], ["src/file.mjs - description"],
    ["src/file.mjs,"], ["src/$FILE"], ["src/file[1].mjs"], ["src/file?.mjs"],
    ["src/file.mjs;"], ["src/`generated`.mjs"]]) {
    assert.equal(validate(envelope({ ...final, changedPaths })).code, "AGY-FINAL-SHAPE-INVALID");
  }
});

test("AFR09 checks the whole authored v4 shape before commit without returning a publishable record", () => {
  const required = { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA,
    rigorLevel: 2, riskClass: "low", riskFlag: false,
    diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" };
  const input = { taskId: dispatchId, agentType: "goldfish-implementor", observedModel: "gemini-observed",
    effort: "high", rulesetSha: "ruleset-1", baselineCommit: candidateCommit,
    final: validate(envelope({ ...final, report: `Done.\n${"Verified. ".repeat(180)}` })), criticRequired: required };
  const ready = preflightAgyAuthoredRecord(input);
  assert.equal(ready.code, "AGY-RECORD-PREFLIGHT-READY");
  assert.equal(Object.hasOwn(ready, "record"), false);
  assert.equal(Object.hasOwn(ready, "report"), false);
  assert.equal(preflightAgyAuthoredRecord({ ...input, observedModel: "" }).code, "AGY-RECORD-PREFLIGHT-INVALID");
  assert.equal(preflightAgyAuthoredRecord({ ...input, final: { ...input.final, reportSha256: "0".repeat(64) } }).code,
    "AGY-RECORD-PREFLIGHT-FINAL");
  for (const altered of [{ ...input, taskId: "another-task" },
    { ...input, baselineCommit: "b".repeat(40) },
    { ...input, final: { ...input.final, changedPaths: [] } }]) {
    assert.equal(preflightAgyAuthoredRecord(altered).code, "AGY-RECORD-PREFLIGHT-FINAL");
  }
  const guarded = validate(envelope({ ...final, changedPaths: ["policies/security.mjs"] }));
  assert.deepEqual(preflightAgyAuthoredRecord({ ...input, final: guarded }), {
    ok: false, code: "AGY-RECORD-PREFLIGHT-CRITIC-PATH", reasonCode: "critic-trigger-underdeclared",
  });
});

function authoredDraftInput() {
  const validatedFinal = validate(envelope());
  const rulesetSha = "d".repeat(64);
  const resultSha256 = "e".repeat(64);
  const descriptorSha256 = "f".repeat(64);
  const consentSubjectSha256 = "a".repeat(64);
  const consentRecordSha256 = "9".repeat(64);
  const inputSha256 = "8".repeat(64);
  const observedAtMs = 1_790_000_000_000;
  const scope = { schema: "pipeline.agy-implementation-scope.v1", dispatchId,
    candidate: { commit: candidateCommit, tree: "1".repeat(40) },
    role: "pipeline-core:goldfish-implementor", requiredPaths: ["src/one.mjs"],
    requiredPathSha256: { "src/one.mjs": "7".repeat(64) }, resultDestination: "results/agy-final.json",
    routePolicySha256: rulesetSha };
  const consentDecisionId = "decision-1";
  const sessionId = "session-1";
  return { taskId: dispatchId, agentType: "goldfish-implementor", observedModel: "gemini-observed",
    effort: "high", rulesetSha, baselineCommit: candidateCommit, candidateTree: "1".repeat(40),
    resultPath: "results/agy-final.json", resultBytes: 128, resultSha256,
    descriptorSha256, consentSubjectSha256, consentDecisionId, consentRecordSha256,
    inputSha256, observedAtMs, scope, sessionId,
    final: validatedFinal, modelWitness: {
      schema: "pipeline.agy-host-model-witness.v1", sessionId,
      descriptorSha256, dispatchId, candidateCommit, candidateTree: "1".repeat(40),
      role: "pipeline-core:goldfish-implementor", model: "gemini-observed", effort: "high",
      routePolicySha256: rulesetSha, resultSha256, resultPath: "results/agy-final.json",
      resultBytes: 128, reportSha256: validatedFinal.reportSha256,
      consentSubjectSha256, consentDecisionId, consentRecordSha256,
      inputSha256, observedAtMs, scope,
    }, criticRequired: { schema: CRITIC_REQUIRED_SCHEMA,
      trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false,
        diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" },
    commitReadback: { ok: true, code: "AGY-HOST-COMMIT-READBACK-VERIFIED", commit: "b".repeat(40),
      parent: candidateCommit, tree: "c".repeat(40), paths: ["src/one.mjs"] } };
}

test("AFR10 drafts exact authored v4 bytes from a validated final and committed host readback", () => {
  const result = draftAgyAuthoredRecordAfterCommit(authoredDraftInput());
  assert.equal(result.code, "AGY-RECORD-DRAFT-READY");
  assert.equal(result.modelAuthority, "unverified");
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.record.candidateCommit, "b".repeat(40));
  assert.deepEqual(result.record.commits, ["b".repeat(40)]);
  assert.equal(result.record.report.text, final.report);
  assert.deepEqual(result.record.report.changedFiles, ["src/one.mjs"]);
});

test("AFR11 rejects a stale, unrelated or path-divergent host commit before drafting", () => {
  const input = authoredDraftInput();
  for (const commitReadback of [
    { ...input.commitReadback, parent: "d".repeat(40) },
    { ...input.commitReadback, commit: candidateCommit },
    { ...input.commitReadback, paths: ["src/other.mjs"] },
    { ...input.commitReadback, tree: "not-an-oid" },
    { ...input.commitReadback, ok: false },
  ]) assert.equal(draftAgyAuthoredRecordAfterCommit({ ...input, commitReadback }).code,
    "AGY-RECORD-DRAFT-COMMIT-BINDING");
});

test("AFR12 never turns a failed final, changed role or malformed input into an authored draft", () => {
  const input = authoredDraftInput();
  assert.equal(draftAgyAuthoredRecordAfterCommit(null).code, "AGY-RECORD-DRAFT-INPUT");
  assert.equal(draftAgyAuthoredRecordAfterCommit({ ...input, agentType: "critic" }).code,
    "AGY-RECORD-PREFLIGHT-FINAL");
  assert.equal(draftAgyAuthoredRecordAfterCommit({ ...input,
    final: validate(envelope({ ...final, outcome: "failed", changedPaths: [] })) }).code,
    "AGY-RECORD-PREFLIGHT-FINAL");
  for (const modelWitness of [null,
    { ...input.modelWitness, model: "self-declared-other" },
    { ...input.modelWitness, resultSha256: "0".repeat(64) },
    { ...input.modelWitness, resultPath: "other/agy-final.json" },
    { ...input.modelWitness, resultBytes: 129 },
    { ...input.modelWitness, candidateTree: "0".repeat(40) },
    { ...input.modelWitness, consentSubjectSha256: "0".repeat(64) },
    { ...input.modelWitness, consentRecordSha256: "0".repeat(64) },
    { ...input.modelWitness, scope: { ...input.scope, resultDestination: "results/other.json" } },
    { ...input.modelWitness, candidateCommit: "0".repeat(40) },
    { ...input.modelWitness, routePolicySha256: "0".repeat(64) },
    { ...input.modelWitness, extra: true }]) {
    assert.equal(draftAgyAuthoredRecordAfterCommit({ ...input, modelWitness }).code,
      "AGY-RECORD-DRAFT-MODEL-WITNESS");
  }
});

test("AFR13 private host receipt draft binds record bytes, witness and commit without granting authority", () => {
  const input = authoredDraftInput();
  const record = draftAgyAuthoredRecordAfterCommit(input).record;
  const result = draftAgyHostObservedReceipt({ modelWitness: input.modelWitness,
    commitReadback: input.commitReadback, record });
  assert.equal(result.code, "AGY-HOST-RECEIPT-DRAFT-READY");
  assert.equal(result.authority, "unverified-until-private-readback");
  assert.equal(validateAgyHostObservedReceiptShape(result.receipt,
    { record, recordBytes: agyAuthoredRecordBytes(record) }), true);
  for (const changed of [
    { ...result.receipt, model: "forged" },
    { ...result.receipt, resultSha256: "0".repeat(64) },
    { ...result.receipt, resultPath: "../forged.json" },
    { ...result.receipt, candidateTree: "0".repeat(40) },
    { ...result.receipt, commit: "0".repeat(40) },
    { ...result.receipt, extra: true },
  ]) assert.equal(validateAgyHostObservedReceiptShape(changed), false);
  assert.equal(validateAgyHostObservedReceiptShape(result.receipt,
    { record, recordBytes: Buffer.from("replaced record\n") }), false);
  assert.equal(draftAgyHostObservedReceipt({ modelWitness: input.modelWitness,
    commitReadback: { ...input.commitReadback, parent: "0".repeat(40) }, record }).code,
    "AGY-HOST-RECEIPT-BINDING");
  assert.equal(draftAgyHostObservedReceipt({ modelWitness: input.modelWitness,
    commitReadback: input.commitReadback, record: { ...record, model: "forged" } }).code,
    "AGY-HOST-RECEIPT-BINDING");
});

test("AFR14 private host receipt writes exclusively and rejects changed bytes or aliases", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "agy-host-receipt-"));
  try {
    const input = authoredDraftInput();
    const record = draftAgyAuthoredRecordAfterCommit(input).record;
    const recordBytes = agyAuthoredRecordBytes(record);
    const receipt = draftAgyHostObservedReceipt({ modelWitness: input.modelWitness,
      commitReadback: input.commitReadback, record }).receipt;
    const args = { commonDir, receipt, record, recordBytes };
    const stored = persistAgyHostObservedReceipt(args);
    assert.equal(stored.code, "AGY-HOST-RECEIPT-STORED");
    assert.match(stored.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(persistAgyHostObservedReceipt(args).code, "AGY-HOST-STORE-EXISTS");
    const readback = readAgyHostObservedReceipt({ commonDir, taskId: input.taskId, record, recordBytes });
    assert.equal(readback.code, "AGY-HOST-RECEIPT-LOCAL-BYTES-BOUND");
    assert.equal(readback.authority, "not-yet-independently-verified");
    assert.equal(readback.sha256, stored.sha256);
    assert.equal(readAgyHostObservedReceipt({ commonDir, taskId: input.taskId,
      record, recordBytes: Buffer.from("changed record\n") }).code, "AGY-HOST-STORE-BINDING");
    const target = join(commonDir, stored.relativePath);
    const saved = readFileSync(target, "utf8");
    writeFileSync(target, saved.replace('"sessionId": "session-1",', '"sessionId": "session-1", "sessionId": "other",'));
    assert.equal(readAgyHostObservedReceipt({ commonDir, taskId: input.taskId, record, recordBytes }).ok, false);
    rmSync(target);
    symlinkSync(join(commonDir, "outside.json"), target);
    assert.equal(readAgyHostObservedReceipt({ commonDir, taskId: input.taskId, record, recordBytes }).ok, false);
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("AFR15 local reader independently checks signed consent, result bytes and Git before host-observed authority", () => {
  const root = mkdtempSync(join(tmpdir(), "agy-local-readback-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Agy Host Test");
    writeFileSync(join(root, "src.txt"), "before\n");
    git("add", "src.txt"); git("commit", "-q", "-m", "baseline");
    const candidate = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
    const started = startSessionDescriptor(root, { sessionId: "agy-local-proof" });
    const session = { id: started.sessionId, descriptorSha256: started.descriptorSha256 };
    const model = "gemini-observed";
    const role = "pipeline-core:goldfish-implementor";
    const taskId = "agy-local-proof-task";
    const resultPath = "results/final.json";
    const routePolicySha256 = "d".repeat(64);
    const scope = { schema: "pipeline.agy-implementation-scope.v1", dispatchId: taskId,
      candidate, role, requiredPaths: ["src.txt"], requiredPathSha256: { "src.txt": sha("before\n") },
      resultDestination: resultPath, routePolicySha256 };
    const expiresAtMs = Date.now() + 60_000;
    const subject = consentSubject({ repository: { primaryRoot: started.repo.primaryRoot,
      commonDir: started.repo.commonDir }, session, model, roles: [role],
      allowedPaths: ["src.txt"], scope, fallbackPolicy: "none", expiresAtMs,
      decisionNonce: "agy-local-proof-nonce" });
    const intent = buildSignatureIntent({ featureId: "agy-local-proof", planSha256: "a".repeat(64),
      specSha256: "b".repeat(64), candidate, subjectSha256: digest(subject) });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyText = publicKey.export({ type: "spki", format: "pem" });
    const consent = { schema: "pipeline.agy-session-consent.v1", status: "approved",
      decisionId: "agy-local-proof-nonce", mode: "signature", session, provider: "google",
      model, roles: subject.roles, allowedPaths: subject.allowedPaths, subject,
      subjectSha256: digest(subject), intent,
      proof: { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256,
        keyReference: "test-key", publicKey: publicKeyText,
        signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") },
      approvedAtMs: Date.now(), expiresAtMs };
    const policyPath = join(root, "project", "critical-human-proof.json");
    mkdirSync(dirname(policyPath), { recursive: true });
    writeFileSync(policyPath, JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3",
      requiredKinds: ["push", "deploy", "publication"], waivedKinds: [],
      trustAnchors: [{ keyReference: "test-key", publicKeySha256: sha(publicKeyText) }] }));
    const consentPath = consentStoragePath(root, session.id);
    mkdirSync(dirname(consentPath), { recursive: true });
    writeFileSync(consentPath, JSON.stringify(consent));
    mkdirSync(join(root, "results"));
    mkdirSync(join(root, "evidence"));
    const baseline = captureAgyHostCommitBaseline({ root, candidateCommit: candidate.commit, resultPath });
    assert.equal(baseline.ok, true, JSON.stringify(baseline));
    const structured = { schema: AGY_FINAL_RETURN_SCHEMA, dispatchId: taskId,
      candidateCommit: candidate.commit, outcome: "succeeded", report: "Changed the approved file.",
      changedPaths: ["src.txt"] };
    const payload = { conversation_id: "local-proof-conversation", status: "SUCCESS",
      response: JSON.stringify(structured), structured_output: structured,
      json_schema: AGY_FINAL_RETURN_JSON_SCHEMA };
    const resultValue = { schema: "pipeline.agy-session-dispatch-result.v1", dispatchId: taskId,
      candidate, sessionId: session.id, requestedModel: model, observedModel: model, payload };
    const resultBytes = Buffer.from(`${JSON.stringify(resultValue)}\n`, "utf8");
    writeFileSync(join(root, resultPath), resultBytes);
    const validatedFinal = validateAgyFinalReturn(payload,
      { dispatchId: taskId, candidateCommit: candidate.commit });
    assert.equal(validatedFinal.ok, true);
    writeFileSync(join(root, "src.txt"), "after\n");
    const admitted = assessAgyHostCommit({ baseline: baseline.baseline,
      final: validatedFinal, allowedPaths: consent.allowedPaths });
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    const observedAtMs = Date.now();
    const modelWitness = { schema: "pipeline.agy-host-model-witness.v1", sessionId: session.id,
      descriptorSha256: session.descriptorSha256, dispatchId: taskId,
      candidateCommit: candidate.commit, candidateTree: candidate.tree, role, model,
      effort: "high", routePolicySha256, resultSha256: sha(resultBytes), resultPath,
      resultBytes: resultBytes.length, reportSha256: validatedFinal.reportSha256,
      consentSubjectSha256: consent.subjectSha256, consentDecisionId: consent.decisionId,
      consentRecordSha256: digest(consent), scope, inputSha256: "e".repeat(64), observedAtMs };
    const criticRequired = { schema: CRITIC_REQUIRED_SCHEMA,
      trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false,
        diff: { mechanical: false, architecture: false, guardrails: false, security: false } },
      appliedRow: "T3" };
    const preflight = preflightAgyAuthoredRecord({ taskId, agentType: "goldfish-implementor",
      observedModel: model, effort: "high", rulesetSha: routePolicySha256,
      baselineCommit: candidate.commit, final: validatedFinal, criticRequired });
    assert.equal(preflight.ok, true);
    const sealed = { root, resultRoot: root, resultPath,
      packet: { dispatchId: taskId, candidate, role, requiredPaths: ["src.txt"] },
      sessionId: session.id, descriptorSha256: session.descriptorSha256,
      requestedModel: model, effort: "high", routePolicySha256, scope,
      inputSha256: modelWitness.inputSha256 };
    const launched = { status: "final-pending-host-commit",
      result: { ok: true, path: resultPath, bytes: resultBytes.length, sha256: sha(resultBytes) },
      commitAdmission: { ...admitted, baseline: baseline.baseline,
        recordPreflight: preflight, modelWitness, final: validatedFinal, criticRequired } };
    let wrongDispatchCommitCalls = 0;
    const wrongDispatch = finalizeAgyHostObservedReturn({
      sealed: { ...sealed, packet: { ...sealed.packet, dispatchId: "OTHER-VALID-DISPATCH" } },
      launched,
    }, { commitAdmittedAgyReturn: () => { wrongDispatchCommitCalls += 1; return null; } });
    assert.equal(wrongDispatch.code, "AGY-FINALIZE-WITNESS-DRIFT");
    assert.equal(wrongDispatchCommitCalls, 0);
    assert.equal(git("rev-parse", "HEAD"), candidate.commit);
    const failedBeforeCommit = finalizeAgyHostObservedReturn({ sealed, launched }, {
      commitAdmittedAgyReturn: () => { throw new Error("private Git diagnostic"); },
    });
    assert.equal(failedBeforeCommit.status, "recovery-required");
    assert.equal(failedBeforeCommit.code, "AGY-FINALIZE-COMMIT-EXCEPTION");
    assert.equal(failedBeforeCommit.recoveryCommit, null);
    assert.equal(JSON.stringify(failedBeforeCommit).includes("private Git diagnostic"), false);
    assert.equal(git("rev-parse", "HEAD"), candidate.commit);
    const invalidCommitResult = finalizeAgyHostObservedReturn({ sealed, launched }, {
      commitAdmittedAgyReturn: () => undefined,
    });
    assert.equal(invalidCommitResult.status, "recovery-required");
    assert.equal(invalidCommitResult.code, "AGY-FINALIZE-COMMIT-INVALID");
    assert.equal(invalidCommitResult.recoveryCommit, null);
    const finished = finalizeAgyHostObservedReturn({ sealed, launched });
    assert.equal(finished.status, "authored-commit-recorded", JSON.stringify(finished));
    assert.equal(finished.record.commit, git("rev-parse", "HEAD"));
    const failedAfterCommit = finalizeAgyHostObservedReturn({ sealed, launched }, {
      commitAdmittedAgyReturn: () => { throw new Error("private post-commit diagnostic"); },
    });
    assert.equal(failedAfterCommit.status, "recovery-required");
    assert.equal(failedAfterCommit.code, "AGY-FINALIZE-COMMIT-EXCEPTION");
    assert.equal(failedAfterCommit.recoveryCommit, finished.record.commit);
    assert.equal(failedAfterCommit.record, null);
    assert.equal(JSON.stringify(failedAfterCommit).includes("private post-commit diagnostic"), false);
    const target = `evidence/dispatch-record-${taskId}.json`;
    const recordBytes = readFileSync(join(root, target));
    const record = JSON.parse(recordBytes.toString("utf8"));
    const bound = inspectAgyHostObservedLocalReadback({ root, taskId, record, recordBytes });
    assert.equal(bound.code, "AGY-LOCAL-HOST-OBSERVATION-VERIFIED", JSON.stringify(bound));
    assert.equal(bound.authority, "host-observed-local");
    assert.equal(gitDeps({ repoRoot: root }).verifyAgyHostObservation(taskId, record).authority,
      "host-observed-local");
    assert.throws(() => writeDispatchRecordObject({ repoRoot: root, target, record }),
      (error) => error?.code === "record-model");
    assert.equal(finished.record.sha256, sha(recordBytes));
    writeFileSync(join(root, resultPath), "tampered\n");
    assert.equal(inspectAgyHostObservedLocalReadback({ root, taskId, record, recordBytes }).code,
      "AGY-LOCAL-RESULT-UNVERIFIABLE");
    writeFileSync(join(root, resultPath), resultBytes);
    writeFileSync(consentPath, JSON.stringify({ ...consent, model: "forged-model" }));
    assert.equal(inspectAgyHostObservedLocalReadback({ root, taskId, record, recordBytes }).code,
      "AGY-LOCAL-CONSENT-BINDING");
    assert.throws(() => writeHostObservedAgyDispatchRecord({ repoRoot: root, target, record }),
      (error) => error?.code === "record-host-observation");
    writeFileSync(consentPath, JSON.stringify(consent));
    const clone = join(root, "fresh-clone");
    execFileSync("git", ["clone", "-q", root, clone]);
    assert.equal(inspectAgyHostObservedLocalReadback({ root: clone, taskId, record, recordBytes }).code,
      "AGY-LOCAL-PRIVATE-RECEIPT-UNVERIFIABLE");
    mkdirSync(join(clone, "evidence"));
    assert.equal(gitDeps({ repoRoot: clone }).verifyAgyHostObservation(taskId, record).ok, false);
    assert.throws(() => writeHostObservedAgyDispatchRecord({ repoRoot: clone, target, record }),
      (error) => error?.code === "record-host-observation");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AFR16 the mechanic route retains its role through precommit validation and authored draft", () => {
  assert.equal(agyAgentTypeForRole("pipeline-core:goldfish-implementor"), "goldfish-implementor");
  assert.equal(agyAgentTypeForRole("pipeline-core:goldfish-mechanic"), "goldfish-mechanic");
  assert.equal(agyAgentTypeForRole("pipeline-core:critic"), null);
  const implementor = authoredDraftInput();
  const role = "pipeline-core:goldfish-mechanic";
  const scope = { ...implementor.scope, role };
  const input = { ...implementor, agentType: "goldfish-mechanic", scope,
    modelWitness: { ...implementor.modelWitness, role, scope } };
  assert.equal(preflightAgyAuthoredRecord(input).code, "AGY-RECORD-PREFLIGHT-READY");
  const draft = draftAgyAuthoredRecordAfterCommit(input);
  assert.equal(draft.code, "AGY-RECORD-DRAFT-READY");
  assert.equal(draft.record.agentType, "goldfish-mechanic");
  const receipt = draftAgyHostObservedReceipt({ modelWitness: input.modelWitness,
    commitReadback: input.commitReadback, record: draft.record });
  assert.equal(receipt.code, "AGY-HOST-RECEIPT-DRAFT-READY");
  assert.equal(receipt.receipt.role, role);
  assert.equal(validateAgyHostObservedReceiptShape(receipt.receipt,
    { record: draft.record, recordBytes: agyAuthoredRecordBytes(draft.record) }), true);
  assert.equal(draftAgyAuthoredRecordAfterCommit({ ...input,
    modelWitness: { ...input.modelWitness, role: "pipeline-core:goldfish-implementor" } }).code,
    "AGY-RECORD-DRAFT-MODEL-WITNESS");
});

assert.equal(cases.length, 16, "the complete Agy Final Return corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
