// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyOnboardingIntakeCapture, applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { captureClaudeInitialPromptPointer, readClaudeInitialPromptPointerAfterConsent } from "./claude-initial-prompt-pointer.mjs";
import {
  captureClaudeIntakePrompt,
  CLAUDE_INTAKE_PROMPT_CAPTURE_SCHEMA,
  CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA,
  readClaudeIntakePromptCapture,
} from "./claude-intake-prompt-capture.mjs";

const roots = new Set();
function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `claude-intake-${name}-`));
  roots.add(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), '{"schema":"pipeline.project.v1"}\n');
  return root;
}
function hostEvent(root, overrides = {}) {
  return {
    hook_event_name: "UserPromptSubmit",
    session_id: "session-001",
    transcript_path: join(root, "host-session", "session-001.jsonl"),
    cwd: root,
    prompt: "",
    ...overrides,
  };
}
function consent(root) {
  return applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function prepareUnconsentedCheckpoint(root) {
  consent(root);
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  const value = { ...observed.value, consent: null, updatedAt: observed.value.createdAt, revision: 0 };
  delete value.contentSha256;
  value.contentSha256 = sha256(Buffer.from(canonicalJson(value), "utf8"));
  writeFileSync(observed.paths.checkpoint, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return readOnboardingIntakeCheckpoint({ rootDir: root });
}
function cleanup() {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
}

registerTestCaseCompletion({ cases: [{ id: "CIP001", name: "Claude native intake capture preserves only consented pending material and rejects changed authority", run: () => {
try {
  const root = fixture("exact-bytes");
  consent(root);
  const prompt = "Feature brief — preserve this exact line.\n\n## Acceptance\n- Café\n";
  const captured = captureClaudeIntakePrompt(hostEvent(root, { prompt }));
  assert.equal(captured.status, "available");
  assert.equal(captured.reference.schema, CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA);
  assert.equal(captured.reference.sessionId, "session-001");
  assert.equal(captured.reference.byteLength, Buffer.byteLength(prompt, "utf8"));
  const resolved = readClaudeIntakePromptCapture({ rootDir: root, sessionId: "session-001", reference: captured.reference });
  assert.deepEqual(resolved, { status: "available", text: prompt, reference: captured.reference });
  assert.equal(captured.reference.captureId.length, 48);
  const current = readOnboardingIntakeCheckpoint({ rootDir: root });
  const stored = readdirSync(join(current.paths.directory, "claude-intake-prompt-captures"));
  assert.equal(stored.length, 1);
  const raw = readFileSync(join(current.paths.directory, "claude-intake-prompt-captures", stored[0]), "utf8");
  assert.equal(JSON.parse(raw).schema, CLAUDE_INTAKE_PROMPT_CAPTURE_SCHEMA);
  assert.equal(raw.includes(prompt), false, "private capture keeps prompt bytes encoded, not echoed into hook output or metadata");

  const duplicate = captureClaudeIntakePrompt(hostEvent(root, { prompt }));
  assert.equal(duplicate.status, "available");
  assert.equal(duplicate.reference.captureId, captured.reference.captureId, "same native event retry resolves the same immutable reference");
  const secondPrompt = captureClaudeIntakePrompt(hostEvent(root, { prompt: "a different prompt" }));
  assert.equal(secondPrompt.status, "unavailable");
  assert.equal(secondPrompt.code, "CLAUDE-INTAKE-CAPTURE-ALREADY-RECORDED");

  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "other-session", reference: captured.reference }).status, "unavailable");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: fixture("wrong-root"), sessionId: "session-001", reference: captured.reference }).status, "unavailable");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "session-001", reference: { ...captured.reference, promptSha256: "0".repeat(64) } }).status, "unavailable");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "session-001", reference: { ...captured.reference, path: "../../outside.txt" } }).code, "CLAUDE-INTAKE-REFERENCE-SHAPE");

  const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root });
  const recordDirectory = join(checkpoint.paths.directory, "claude-intake-prompt-captures");
  const recordName = readdirSync(recordDirectory)[0];
  const recordPath = join(recordDirectory, recordName);
  const damaged = JSON.parse(readFileSync(recordPath, "utf8"));
  damaged.promptBase64 = Buffer.from("tampered bytes", "utf8").toString("base64");
  writeFileSync(recordPath, `${JSON.stringify(damaged)}\n`, { mode: 0o600 });
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "session-001", reference: captured.reference }).status, "unavailable");

  const noConsentRoot = fixture("no-consent");
  assert.equal(captureClaudeIntakePrompt(hostEvent(noConsentRoot, { prompt: "material" })).code, "CLAUDE-INTAKE-MATERIAL-NOT-PENDING");
  consent(noConsentRoot);
  const pending = captureClaudeIntakePrompt(hostEvent(noConsentRoot, { prompt: "material" }));
  assert.equal(pending.status, "available");
  applyOnboardingIntakeCapture({ rootDir: noConsentRoot, text: "canonical application", activate: true });
  assert.equal(readClaudeIntakePromptCapture({ rootDir: noConsentRoot, sessionId: "session-001", reference: pending.reference }).code,
    "CLAUDE-INTAKE-MATERIAL-NOT-PENDING");

  const malformed = captureClaudeIntakePrompt(hostEvent(noConsentRoot, { hook_event_name: "PostToolUse", prompt: "x" }));
  assert.equal(malformed.code, "CLAUDE-INTAKE-HOST-EVENT-SHAPE");
  const wrongTranscript = captureClaudeIntakePrompt(hostEvent(noConsentRoot, {
    session_id: "session-other", transcript_path: "relative-session.jsonl", prompt: "x",
  }));
  assert.equal(wrongTranscript.code, "CLAUDE-INTAKE-HOST-EVENT-SHAPE");

} finally {
  cleanup();
}
} }, { id: "CIP002", name: "Claude first prompt pointer stores only private metadata before consent and resolves one exact native row after consent", run: () => {
try {
  const root = fixture("preconsent-pointer");
  const initial = prepareUnconsentedCheckpoint(root);
  const prompt = "## Intake material\nA long exact prompt with café, tabs\t, and 🧭.\n";
  const transcriptPath = join(root, "host-session", "session-pointer-001.jsonl");
  const event = {
    hook_event_name: "UserPromptSubmit",
    session_id: "session-pointer-001",
    prompt_id: "550e8400-e29b-41d4-a716-446655440000",
    transcript_path: transcriptPath,
    cwd: root,
    prompt,
  };
  const captured = captureClaudeInitialPromptPointer(event);
  assert.equal(captured.status, "available");
  assert.equal(captured.reference.promptId, event.prompt_id);
  assert.equal(captured.reference.byteLength, Buffer.byteLength(prompt, "utf8"));
  assert.equal(Object.hasOwn(captured.reference, "transcriptPath"), false);
  const pointerDirectory = join(initial.paths.directory, "claude-initial-prompt-pointers");
  const [pointerName] = readdirSync(pointerDirectory);
  const pointerText = readFileSync(join(pointerDirectory, pointerName), "utf8");
  const pointer = JSON.parse(pointerText);
  assert.equal(pointer.promptSha256, sha256(Buffer.from(prompt, "utf8")));
  assert.equal(pointer.byteLength, Buffer.byteLength(prompt, "utf8"));
  assert.equal(pointer.promptId, event.prompt_id);
  assert.equal(pointer.transcriptPath, transcriptPath);
  assert.equal(pointerText.includes(prompt), false, "pre-consent storage must not contain any prompt bytes");
  assert.equal(Object.hasOwn(pointer, "prompt") || Object.hasOwn(pointer, "promptBase64"), false);
  assert.equal(captureClaudeInitialPromptPointer(event).reference.pointerId, captured.reference.pointerId,
    "same host event retry is idempotent");
  assert.equal(captureClaudeInitialPromptPointer({ ...event, prompt: `${prompt}changed` }).code,
    "CLAUDE-INITIAL-POINTER-ALREADY-RECORDED");
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference }).code, "CLAUDE-INITIAL-CONSENT-NOT-RECORDED");

  mkdirSync(join(root, "host-session"), { recursive: true });
  const nativeRow = {
    type: "user",
    uuid: "650e8400-e29b-41d4-a716-446655440001",
    sessionId: event.session_id,
    timestamp: "2026-10-02T12:00:00.000Z",
    version: "2.1.196",
    message: { role: "user", content: [{ type: "text", text: prompt }] },
  };
  writeFileSync(transcriptPath, `${JSON.stringify(nativeRow)}\n`);
  const consented = applyOnboardingIntakeConsent({
    rootDir: root,
    granted: true,
    activate: true,
    gitAuthor: { name: "Intake Anchor", email: "anchor@example.invalid" },
    language: "de",
    profile: "epic",
  });
  assert.deepEqual(consented.checkpoint.values, {
    gitAuthor: { name: "Intake Anchor", email: "anchor@example.invalid" },
    language: "de",
    profile: "epic",
  });
  const resolved = readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference });
  assert.equal(resolved.status, "available");
  assert.equal(resolved.text, prompt);
  assert.equal(resolved.nativeMessageUuid, nativeRow.uuid);

  const noPromptId = captureClaudeInitialPromptPointer({ ...event, session_id: "session-no-prompt-id", prompt_id: undefined });
  assert.equal(noPromptId.code, "CLAUDE-INITIAL-PROMPT-ID-UNAVAILABLE");
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: { ...captured.reference, transcriptPath: "/attacker/claimed.jsonl" } }).code, "CLAUDE-INITIAL-REFERENCE-SHAPE");
} finally {
  cleanup();
}
} }, { id: "CIP003", name: "Claude first prompt pointer fails closed on unavailable, ambiguous, and nonhuman transcript rows", run: () => {
try {
  const root = fixture("preconsent-rejections");
  prepareUnconsentedCheckpoint(root);
  const prompt = "intake bytes to match\n";
  const transcriptPath = join(root, "host-session", "session-pointer-002.jsonl");
  const event = {
    hook_event_name: "UserPromptSubmit", session_id: "session-pointer-002",
    prompt_id: "550e8400-e29b-41d4-a716-446655440002", transcript_path: transcriptPath, cwd: root, prompt,
  };
  const captured = captureClaudeInitialPromptPointer(event);
  assert.equal(captured.status, "available");
  mkdirSync(join(root, "host-session"), { recursive: true });
  const unsafeMetaRow = {
    type: "user", uuid: "650e8400-e29b-41d4-a716-446655440002", sessionId: event.session_id,
    isMeta: true, message: { role: "user", content: [{ type: "text", text: prompt }] },
  };
  writeFileSync(transcriptPath, `${JSON.stringify(unsafeMetaRow)}\n`);
  consent(root);
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference }).code, "CLAUDE-INITIAL-TRANSCRIPT-ROW-SHAPE-UNSUPPORTED");

  const humanRow = { ...unsafeMetaRow, uuid: "650e8400-e29b-41d4-a716-446655440003", isMeta: false };
  writeFileSync(transcriptPath, `${JSON.stringify(humanRow)}\n${JSON.stringify(humanRow)}\n`);
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference }).code, "CLAUDE-INITIAL-TRANSCRIPT-PROMPT-AMBIGUOUS");

  writeFileSync(transcriptPath, `${JSON.stringify({ ...humanRow,
    message: { role: "user", content: [{ type: "text", text: prompt }, { type: "image", source: { type: "base64", data: "AA==" } }] },
  })}\n`);
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference }).code, "CLAUDE-INITIAL-TRANSCRIPT-ROW-SHAPE-UNSUPPORTED");

  writeFileSync(transcriptPath, `${JSON.stringify({ ...humanRow, sessionId: "another-session" })}\n`);
  assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root, sessionId: event.session_id,
    reference: captured.reference }).code, "CLAUDE-INITIAL-TRANSCRIPT-PROMPT-PENDING");
} finally {
  cleanup();
}
} }], fd: 3, maxBytes: 65_536 });
