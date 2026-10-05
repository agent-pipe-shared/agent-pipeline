// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { resolveModelRoleHostSessionIdentity } from "./model-role-host-identity.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { devNull } from "node:os";

const cases = [];
function test(name, run) { cases.push({ id: `MRI${String(cases.length + 1).padStart(2, "0")}`, name, run }); }

test("Codex consumes matching runtime session markers, not an invented ID", () => {
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "codex", env: {
    CODEX_SESSION_ID: "thread-1", CODEX_THREAD_ID: "thread-1" } }).sessionId, "thread-1");
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "codex", env: {} }).ok, false);
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "codex", env: {
    CODEX_SESSION_ID: "thread-1", CODEX_THREAD_ID: "thread-2" } }).code,
  "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
});

test("Claude binds its runtime session environment and rejects absent or malformed IDs", () => {
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "claude", env: {
    CLAUDE_CODE_SESSION_ID: "claude-1" } }).sessionId, "claude-1");
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "claude", env: {} }).ok, false);
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "claude", env: {
    CLAUDE_CODE_SESSION_ID: "../other" } }).ok, false);
});

test("Antigravity requires the host hook or execution stream conversation key", () => {
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "antigravity",
    hostHookSessionId: "conversation-1", env: {} }).sessionId, "conversation-1");
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "antigravity", env: {} }).ok, false);
  assert.equal(resolveModelRoleHostSessionIdentity({ runner: "unknown", env: {} }).ok, false);
});

assert.equal(cases.length, 3);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
