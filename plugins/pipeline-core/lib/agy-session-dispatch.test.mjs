// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchAgySession, AGY_SESSION_CONSENT_SCHEMA } from "./agy-session-dispatch.mjs";
import { resolveModelRoleSession } from "./model-role-session.mjs";
import { ROLE_DISPATCH_REQUEST_SCHEMA } from "./role-dispatch-preflight.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const session = { id: "agy-session-1", source: "runtime", observed: true };
const authority = { verifyAuthority: () => true };
const consent = (overrides = {}) => ({ schema: AGY_SESSION_CONSENT_SCHEMA, status: "approved", decisionId: "decision-1", sessionId: session.id, runner: "antigravity", provider: "google", model: "gemini-3.8-flash-high", role: "pipeline-core:goldfish-implementor", scope: "scope-1", subjectSha256: hash("scope-1"), approvedAtMs: 1, expiresAtMs: 9_999_999_999, ...overrides });
const packet = (overrides = {}) => ({ schema: ROLE_DISPATCH_REQUEST_SCHEMA, dispatchId: "agy-dispatch-1", transport: "antigravity", role: "pipeline-core:goldfish-implementor", prompt: "## Briefing\n### 1. Goal\nImplement the bounded task.\n### 2. Context files\n- input.txt\n### 3. DoD checks\n- Return a bounded result.\n### 4. Forbidden\n- No unrelated changes.\n### 5. Stop conditions\n- Required input unavailable.\n### 6. Dispatch-Metadata\nModel: gemini-3.8-flash-high; effort high; Ruleset-SHA: local-test.\n- **Tool budget (hard cap, first-class field):** <=40 tool uses.", candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": hash("input\n") }, resultDestination: { kind: "return" }, ...overrides });

test("no consent and invalid session fail before any model call", async () => {
  let calls = 0;
  const result = await dispatchAgySession({ ...authority, packet: packet(), session, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), consent: undefined, agyPath: "unused", nowEpochMs: 2 });
  calls += result.modelCalls ?? 0;
  assert.equal(result.code, "AGY-SESSION-CONSENT-REQUIRED");
  assert.equal(calls, 0);
  const wrongSession = await dispatchAgySession({ ...authority, packet: packet(), session: { ...session, id: "other" }, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), consent: consent(), agyPath: "unused", nowEpochMs: 2 });
  assert.equal(wrongSession.code, "AGY-SESSION-CONSENT-INVALID");
});

test("role, model, scope and consent are closed and bound", async () => {
  const common = { ...authority, packet: packet(), session, requestedModel: "gemini-3.8-flash-high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 };
  assert.equal((await dispatchAgySession({ ...common, packet: packet({ role: "pipeline-core:critic" }), consent: consent({ role: "pipeline-core:critic" }) })).code, "AGY-SESSION-ROLE-FORBIDDEN");
  assert.equal((await dispatchAgySession({ ...common, consent: consent({ model: "gemini-other" }) })).code, "AGY-SESSION-CONSENT-INVALID");
  assert.equal((await dispatchAgySession({ ...common, inputSha256: "bad", consent: consent() })).code, "AGY-SESSION-INPUT-MISMATCH");
  assert.equal((await dispatchAgySession({ ...common, consent: consent({ expiresAtMs: 2 }) })).code, "AGY-SESSION-CONSENT-INVALID");
});

test("an opted-in functional model route rejects a substituted model before launch", async () => {
  const selected = resolveModelRoleSession({ runner: "antigravity", role: "worker", effort: "medium",
    sessionId: session.id, candidateCommit: "a".repeat(40), observedAt: "2026-09-26T00:00:00.000Z",
    policy: { schema: "pipeline.model-role-policy.v1", runner: "antigravity", role: "worker",
      approved: [{ modelId: "gemini-3.8-flash-medium", rank: 1, efforts: ["medium"],
        compatibilityEvidenceSha256: "b".repeat(64) }] },
    availableModelIds: ["gemini-3.8-flash-medium"] });
  assert.equal(selected.ok, true);
  const result = await dispatchAgySession({ ...authority, packet: packet(), session,
    consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "medium",
    modelRoleStore: { read: () => ({ ok: true, sessionId: session.id,
      receipts: [selected.receipt], admission: {
        ok: true, code: "MODEL-ROLE-BOOTSTRAP-ADMITTED", readbackSha256: "c".repeat(64),
        receiptSha256s: [selected.receipt.receiptSha256] } }) },
    scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 });
  assert.equal(result.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(result.launcherCalls, 0);
});

test("a missing optional role receipt preserves only the valid consent-bound V3 route", async () => {
  const common = { ...authority, packet: packet(), session,
    requestedModel: "gemini-3.8-flash-medium", effort: "medium",
    consent: consent({ model: "gemini-3.8-flash-medium" }),
    modelRoleStore: { read: () => ({ ok: false, code: "MODEL-ROLE-STORE-UNAVAILABLE" }) },
    scope: "scope-1", inputSha256: hash("scope-1"), agyPath: "unused", nowEpochMs: 2 };
  const fallback = await dispatchAgySession(common);
  assert.equal(fallback.code, "AGY-SESSION-PREFLIGHT-FAILED", JSON.stringify(fallback));
  assert.equal(fallback.modelCalls, 0);
  const mechanicFallback = await dispatchAgySession({ ...common,
    packet: packet({ role: "pipeline-core:goldfish-mechanic" }),
    consent: consent({ model: "gemini-3.8-flash-medium", role: "pipeline-core:goldfish-mechanic" }) });
  assert.equal(mechanicFallback.code, "AGY-SESSION-PREFLIGHT-FAILED", JSON.stringify(mechanicFallback));
  const unapproved = await dispatchAgySession({ ...common, requestedModel: "unapproved-model",
    consent: consent({ model: "unapproved-model" }) });
  assert.equal(unapproved.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(unapproved.launcherCalls, 0);
  const damagedAuthority = await dispatchAgySession({ ...common, readRegistry: () => ({ duties: {} }) });
  assert.equal(damagedAuthority.code, "AGY-SESSION-MODEL-ROLE-NOT-BOUND");
  assert.equal(damagedAuthority.launcherCalls, 0);
});

test("same-session consent permits a bounded positive fixture dispatch and exclusive result", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-session-dispatch-"));
  const agy = join(root, "agy-mock");
  writeFileSync(join(root, "input.txt"), "input\n");
  mkdirSync(join(root, "results"));
  writeFileSync(agy, "#!/usr/bin/env node\nconst mode = process.env.AGY_MODE; if (mode === 'auth') { console.error('Please login'); process.exit(1); } if (mode === 'quota') { console.error('quota exhausted'); process.exit(2); } if (mode === 'timeout') { setTimeout(() => {}, 5000); } else if (mode === 'malformed') console.log('not-json'); else if (mode === 'mismatch') console.log(JSON.stringify({status:'SUCCESS',response:'ok',model:'gemini-other'})); else if (mode === 'unknown') console.log(JSON.stringify({status:'SUCCESS',response:'ok'})); else if (mode === 'structured') { const args=process.argv; const json_schema=JSON.parse(args[args.indexOf('--json-schema')+1]); const structured_output={schema:'pipeline.agy-final-return.v1',dispatchId:process.env.AGY_DISPATCH_ID,candidateCommit:process.env.AGY_CANDIDATE_COMMIT,outcome:'succeeded',report:'done',changedPaths:['input.txt']}; console.log(JSON.stringify({conversation_id:'structured-one',status:'SUCCESS',response:JSON.stringify(structured_output),structured_output,json_schema,model:'gemini-3.8-flash-high'})); } else console.log(JSON.stringify({status:'SUCCESS',response:'ok',model:'gemini-3.8-flash-high'}));\n");
  chmodSync(agy, 0o755);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "agy@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Agy fixture"], { cwd: root });
    execFileSync("git", ["add", "input.txt"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
    const candidate = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
    const result = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate }), nowEpochMs: 2 });
    assert.equal(result.status, "completed-undelivered", JSON.stringify(result));
    assert.equal(result.code, "AGY-SESSION-FINAL-UNDELIVERED");
    assert.equal(result.observed.model, "gemini-3.8-flash-high");
    assert.equal(existsSync(join(root, "results/result.json")), true);
    assert.equal(result.result.sha256, hash(readFileSync(join(root, "results/result.json"))));
    const replay = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-2" }), nowEpochMs: 2 });
    assert.equal(replay.code, "AGY-SESSION-RESULT-COLLISION");
    assert.match(readFileSync(join(root, "results/result.json"), "utf8"), /gemini-3\.8-flash-high/u);
    const secondTask = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/second.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("different-task-input"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-3" }), nowEpochMs: 2 });
    assert.equal(secondTask.status, "completed-undelivered");
    const structured = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/structured.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-structured" }), env: { ...process.env, AGY_MODE: "structured", AGY_DISPATCH_ID: "agy-structured", AGY_CANDIDATE_COMMIT: candidate.commit }, requireStructuredFinal: true, nowEpochMs: 2 });
    assert.equal(structured.status, "final-pending-host-commit", JSON.stringify(structured));
    assert.equal(structured.final.reportSha256, hash("done"));
    assert.deepEqual(structured.final.changedPaths, ["input.txt"]);
    const unknown = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/unknown.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, env: { ...process.env, AGY_MODE: "unknown" }, packet: packet({ candidate, dispatchId: "agy-unknown" }), requireObservedModel: true, nowEpochMs: 2 });
    assert.equal(unknown.code, "AGY-SESSION-MODEL-UNOBSERVED");
    assert.equal(unknown.result, null);
    for (const [mode, code] of [["auth", "AGY-AUTH-REQUIRED"], ["quota", "AGY-NONZERO-EXIT"], ["timeout", "AGY-TIMEOUT"], ["malformed", "AGY-OUTPUT-MALFORMED"], ["mismatch", "AGY-MODEL-MISMATCH"]]) {
      const failure = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: `results/${mode}.json`, session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, env: { ...process.env, AGY_MODE: mode }, packet: packet({ candidate, dispatchId: `agy-${mode}` }), timeoutMs: mode === "timeout" ? 50 : 1_000, nowEpochMs: 2 });
      assert.equal(failure.status, "unavailable");
      assert.equal(failure.code, code);
      assert.equal(failure.result, null);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
