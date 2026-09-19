// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchAgySession, AGY_SESSION_CONSENT_SCHEMA } from "./agy-session-dispatch.mjs";
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

test("same-session consent permits a bounded positive fixture dispatch and exclusive result", async () => {
  const root = mkdtempSync(join(tmpdir(), "agy-session-dispatch-"));
  const agy = join(root, "agy-mock");
  writeFileSync(join(root, "input.txt"), "input\n");
  mkdirSync(join(root, "results"));
    writeFileSync(agy, "#!/usr/bin/env node\nconst mode = process.env.AGY_MODE; if (mode === 'auth') { console.error('Please login'); process.exit(1); } if (mode === 'quota') { console.error('quota exhausted'); process.exit(2); } if (mode === 'timeout') { setTimeout(() => {}, 5000); } else if (mode === 'malformed') console.log('not-json'); else if (mode === 'mismatch') console.log(JSON.stringify({model:'gemini-other', result:'ok'})); else console.log(JSON.stringify({model:'gemini-3.8-flash-high', result:'ok'}));\n");
  chmodSync(agy, 0o755);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "agy@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Agy fixture"], { cwd: root });
    execFileSync("git", ["add", "input.txt"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
    const candidate = { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim() };
    const result = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate }), nowEpochMs: 2 });
    assert.equal(result.status, "succeeded", JSON.stringify(result));
    assert.equal(result.observed.model, "gemini-3.8-flash-high");
    assert.equal(existsSync(join(root, "results/result.json")), true);
    const replay = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/result.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-2" }), nowEpochMs: 2 });
    assert.equal(replay.code, "AGY-SESSION-RESULT-COLLISION");
    assert.match(readFileSync(join(root, "results/result.json"), "utf8"), /gemini-3\.8-flash-high/u);
    const secondTask = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: "results/second.json", session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("different-task-input"), agyPath: agy, packet: packet({ candidate, dispatchId: "agy-dispatch-3" }), nowEpochMs: 2 });
    assert.equal(secondTask.status, "succeeded");
    for (const [mode, code] of [["auth", "AGY-AUTH-REQUIRED"], ["quota", "AGY-NONZERO-EXIT"], ["timeout", "AGY-TIMEOUT"], ["malformed", "AGY-OUTPUT-MALFORMED"], ["mismatch", "AGY-MODEL-MISMATCH"]]) {
      const failure = await dispatchAgySession({ ...authority, root, resultRoot: root, resultPath: `results/${mode}.json`, session, consent: consent(), requestedModel: "gemini-3.8-flash-high", effort: "high", scope: "scope-1", inputSha256: hash("scope-1"), agyPath: agy, env: { ...process.env, AGY_MODE: mode }, packet: packet({ candidate, dispatchId: `agy-${mode}` }), timeoutMs: mode === "timeout" ? 50 : 1_000, nowEpochMs: 2 });
      assert.equal(failure.status, "unavailable");
      assert.equal(failure.code, code);
      assert.equal(failure.result, null);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
