// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint, readOnboardingIntakeMaterialInput } from "../lib/onboarding-continuity.mjs";
import { applyProjectOnboardingIntakeCapture } from "../lib/project-onboarding-v3.mjs";
import { readClaudeIntakePromptCapture } from "../lib/claude-intake-prompt-capture.mjs";
import { readClaudeInitialPromptPointerAfterConsent } from "../lib/claude-initial-prompt-pointer.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `claude-intake-hook-${name}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), '{"schema":"pipeline.project.v1"}\n');
  return root;
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function prepareUnconsentedCheckpoint(root) {
  applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  const value = { ...observed.value, consent: null, updatedAt: observed.value.createdAt, revision: 0 };
  delete value.contentSha256;
  value.contentSha256 = createHash("sha256").update(canonicalJson(value)).digest("hex");
  writeFileSync(observed.paths.checkpoint, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  return readOnboardingIntakeCheckpoint({ rootDir: root });
}

registerTestCaseCompletion({ cases: [{ id: "CIH001", name: "UserPromptSubmit hook exposes only the opaque reference for the exact captured prompt", run: () => {
  const root = fixture("native-event");
  try {
    applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
    const prompt = "## Material\nUse the complete pasted body: café, C:\\src, and 🧭.\r\n";
    const input = {
      hook_event_name: "UserPromptSubmit",
      session_id: "session-hook-001",
      transcript_path: join(root, "host-session", "session-hook-001.jsonl"),
      cwd: root,
      permission_mode: "default",
      prompt,
    };
    const hookPath = fileURLToPath(new URL("./claude-intake-prompt-capture.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [hookPath], {
      cwd: root,
      input: JSON.stringify(input),
      encoding: "utf8",
      shell: false,
    });
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.equal(run.stdout.includes(prompt), false, "hook must not echo prompt bytes into model context");
    const context = output.hookSpecificOutput.additionalContext;
    const marker = "reference with the canonical intake reader: ";
    const reference = JSON.parse(context.slice(context.indexOf(marker) + marker.length, context.indexOf(". This reference")));
    const readback = readClaudeIntakePromptCapture({ rootDir: root, sessionId: input.session_id, reference });
    assert.equal(readback.status, "available");
    assert.equal(readback.text, prompt);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
} }, { id: "CIH002", name: "pre-consent UserPromptSubmit returns only an opaque pointer that resolves after typed consent", run: () => {
  const root = fixture("preconsent-pointer");
  try {
    const checkpoint = prepareUnconsentedCheckpoint(root);
    const prompt = "A long intake prompt that must stay out of the pre-consent store.\n";
    const input = {
      hook_event_name: "UserPromptSubmit",
      session_id: "session-hook-pointer-001",
      prompt_id: "550e8400-e29b-41d4-a716-446655440010",
      transcript_path: join(root, "host-session", "session-hook-pointer-001.jsonl"),
      cwd: root,
      permission_mode: "default",
      prompt,
    };
    const hookPath = fileURLToPath(new URL("./claude-intake-prompt-capture.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [hookPath], {
      cwd: root,
      input: JSON.stringify(input),
      encoding: "utf8",
      shell: false,
    });
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.equal(run.stdout.includes(prompt), false);
    assert.equal(run.stdout.includes(input.transcript_path), false, "the host transcript locator stays private");
    const context = output.hookSpecificOutput.additionalContext;
    const marker = "intake-capture-apply --text-turn-ref: ";
    const referenceStart = context.indexOf(marker) + marker.length;
    const referenceEnd = context.indexOf(". This reference", referenceStart);
    assert.ok(referenceStart >= marker.length && referenceEnd > referenceStart);
    const reference = JSON.parse(context.slice(referenceStart, referenceEnd));
    assert.equal(reference.sessionId, input.session_id);
    assert.equal(Object.hasOwn(reference, "transcriptPath"), false);
    assert.equal(readClaudeInitialPromptPointerAfterConsent({ rootDir: root,
      sessionId: input.session_id, reference }).code, "CLAUDE-INITIAL-CONSENT-NOT-RECORDED");
    const pointerDirectory = join(checkpoint.paths.directory, "claude-initial-prompt-pointers");
    const [name] = readdirSync(pointerDirectory);
    const raw = readFileSync(join(pointerDirectory, name), "utf8");
    const record = JSON.parse(raw);
    assert.equal(raw.includes(prompt), false);
    assert.equal(Object.hasOwn(record, "prompt"), false);
    assert.equal(Object.hasOwn(record, "promptBase64"), false);
    assert.equal(record.promptId, input.prompt_id);
    assert.equal(record.byteLength, Buffer.byteLength(prompt, "utf8"));
    mkdirSync(join(root, "host-session"), { recursive: true });
    const nativeRow = {
      type: "user", uuid: "650e8400-e29b-41d4-a716-446655440010", sessionId: input.session_id,
      message: { role: "user", content: [{ type: "text", text: prompt }] },
    };
    writeFileSync(input.transcript_path, `${JSON.stringify(nativeRow)}\n`);
    const consented = applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true,
      gitAuthor: { name: "Native Intake", email: "native-intake@example.invalid" }, language: "de", profile: "feature" });
    assert.deepEqual(consented.checkpoint.values, {
      gitAuthor: { name: "Native Intake", email: "native-intake@example.invalid" }, language: "de", profile: "feature",
    });
    const resolved = readClaudeInitialPromptPointerAfterConsent({ rootDir: root,
      sessionId: input.session_id, reference });
    assert.equal(resolved.status, "available");
    assert.equal(resolved.text, prompt);
    assert.equal(resolved.nativeMessageUuid, nativeRow.uuid);
    const captured = applyProjectOnboardingIntakeCapture({ rootDir: root, textTurnRef: reference, activate: true });
    assert.equal(captured.checkpoint.materialInput.length, 1);
    assert.deepEqual(readOnboardingIntakeMaterialInput({ rootDir: root }).chunks.map((chunk) => chunk.text), [prompt],
      "the canonical writer receives the exact bytes resolved from the native pointer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
} }], fd: 3, maxBytes: 65_536 });
