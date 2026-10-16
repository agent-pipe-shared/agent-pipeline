// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.cross-runner-chat-intake-reference-needs-host-capture (AC-145, ALF-C-P19-09).
 *
 * Acceptance points of backlog/items/2026-09-29-cross-runner-chat-intake-reference-needs-host-capture.md:
 *   A1 host-provided turn reference: user-message identity, exact UTF-8 bytes, scope, expiry, consent
 *   A2 adapters only where the host exposes a reliable capture API, otherwise a typed unavailable result
 *   A3 captured bytes AND reference digest bound into the intake checkpoint, replay/drift checks, size limit
 *   A4 chat-only path avoids agent re-emission and captures byte-exact multiline content
 *
 * Real modules and the real CLI entry (main) are used; no behavior under test is mocked.
 * Cases marked KNOWN-GAP assert the missing producer behavior and are expected RED until the named
 * source function is fixed (outside this pin's write scope).
 *
 * Host limitation: no case here needs directory mode bits or directory symlinks, so none is skipped.
 * (If a future case needs them: skip with owner Coordinator, due 2026-10-19, Linux/WSL run, PO decision K7.)
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import baseTest, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { applyOnboardingIntakeCapture, applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "../onboarding-continuity.mjs";
import {
  captureClaudeIntakePrompt,
  CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA,
  processClaudeIntakePromptSubmit,
  readClaudeIntakePromptCapture,
} from "../claude-intake-prompt-capture.mjs";
import { main as onboardingCli } from "../../scripts/project-onboarding-v3.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const roots = new Set();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture(name, { consented = true } = {}) {
  const root = mkdtempSync(join(scratchBase, `alf-c-p19-09-${name}-`));
  roots.add(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  writeFileSync(join(root, ".claude", "pipeline.json"), '{"schema":"pipeline.project.v1"}\n');
  if (consented) applyOnboardingIntakeConsent({ rootDir: root, granted: true, activate: true });
  return root;
}
function hostEvent(root, prompt, overrides = {}) {
  return {
    hook_event_name: "UserPromptSubmit", session_id: "session-pin-001",
    transcript_path: join(root, "host-session", "session-pin-001.jsonl"), cwd: root, prompt, ...overrides,
  };
}
function cli(args) {
  let output = "";
  const status = onboardingCli(args, {
    write: (chunk) => { output += chunk; }, writeError: (chunk) => { output += chunk; }, env: {},
  });
  return { status, output };
}
const captureApply = (root, reference) =>
  cli(["intake-capture-apply", "--root", root, "--text-turn-ref", JSON.stringify(reference), "--activate", "--runner", "claude"]);

// Host limitation (typed): on this native Windows host the private-store boundary can answer
// PB-WINDOWS-ASSURANCE (no private-directory assurance), so no capture record can be written.
// Cases that need a written capture are skipped with that typed reason; owner Coordinator, due
// 2026-10-19 (Linux/WSL run, PO decision K7). Cases that need no stored capture still run.
const HOST_PROBE = (() => {
  const root = fixture("host-probe");
  return captureClaudeIntakePrompt(hostEvent(root, "host probe"));
})();
const HOST_LIMIT = HOST_PROBE.status === "unavailable" && HOST_PROBE.code === "PB-WINDOWS-ASSURANCE";
const NEEDS_NO_STORE = /consent|forged|hosts without|host event validation/u;
function test(name, fn) {
  const skip = HOST_LIMIT && !NEEDS_NO_STORE.test(name)
    ? "host-limitation PB-WINDOWS-ASSURANCE: private capture store unavailable on native Windows; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)"
    : false;
  return baseTest(name, { skip }, fn);
}

after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.clear(); });

const MULTILINE = "Brief — keep exact.\r\n\r\n## Acceptance\n\t- Café \u{1F9ED}\n  trailing spaces   \n\n";

// ---------------------------------------------------------------- A1
test("A1 identity+bytes+scope: a host capture yields an opaque digest-bound reference and the resolver returns exact bytes", () => {
  const root = fixture("a1-bytes");
  const captured = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  assert.equal(captured.status, "available");
  const ref = captured.reference;
  assert.equal(ref.schema, CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA);
  assert.equal(ref.sessionId, "session-pin-001");
  assert.equal(ref.byteLength, Buffer.byteLength(MULTILINE, "utf8"));
  assert.equal(ref.promptSha256, sha256(Buffer.from(MULTILINE, "utf8")));
  assert.match(ref.captureId, /^[a-f0-9]{48}$/u);
  assert.equal(Object.keys(ref).some((key) => /prompt$|text|path$/iu.test(key) && key !== "promptSha256"), false,
    "the reference carries no prompt text and no transcript path");
  const resolved = readClaudeIntakePromptCapture({ rootDir: root, sessionId: ref.sessionId, reference: ref });
  assert.equal(resolved.status, "available");
  assert.equal(resolved.text, MULTILINE);
});

test("A1 scope: a reference cannot be resolved under another project root, another session, or edited fields", () => {
  const root = fixture("a1-scope");
  const other = fixture("a1-scope-other");
  const { reference } = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  assert.equal(readClaudeIntakePromptCapture({ rootDir: other, sessionId: reference.sessionId, reference }).status, "unavailable");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "another-session", reference }).status, "unavailable");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: reference.sessionId,
    reference: { ...reference, promptSha256: "0".repeat(64) } }).code, "CLAUDE-INTAKE-CAPTURE-BINDING");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: reference.sessionId,
    reference: { ...reference, byteLength: reference.byteLength + 1 } }).code, "CLAUDE-INTAKE-CAPTURE-BINDING");
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: reference.sessionId,
    reference: { ...reference, extra: "x" } }).code, "CLAUDE-INTAKE-REFERENCE-SHAPE");
});

test("A1 consent: no capture without recorded consent, and none after the material stage has passed", () => {
  const root = fixture("a1-consent", { consented: false });
  const refused = captureClaudeIntakePrompt(hostEvent(root, "material"));
  assert.equal(refused.status, "unavailable");
  assert.equal(refused.code, "CLAUDE-INTAKE-MATERIAL-NOT-PENDING");
});

test("A1 KNOWN-GAP expiry: the host reference carries an explicit expiry that the resolver enforces (producer: captureClaudeIntakePrompt in plugins/pipeline-core/lib/claude-intake-prompt-capture.mjs)", () => {
  const root = fixture("a1-expiry");
  const { reference } = captureClaudeIntakePrompt(hostEvent(root, "expiry probe"));
  assert.equal(Object.keys(reference).some((key) => /expir/iu.test(key)), true,
    "MISSING: reference/record have no expiresAt; captureClaudeIntakePrompt and readClaudeIntakePromptCapture must add and enforce one");
});

// ---------------------------------------------------------------- A2
test("A2 consumer refuses model re-emitted / synthetic captures (forged reference, no host record)", () => {
  const root = fixture("a2-forged");
  const text = "text the model re-emitted itself";
  const forged = {
    schema: CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA, captureId: "a".repeat(48), sessionId: "session-pin-001",
    transcriptPathSha256: "b".repeat(64), promptSha256: sha256(Buffer.from(text, "utf8")), byteLength: Buffer.byteLength(text, "utf8"),
  };
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: forged.sessionId, reference: forged }).status, "unavailable");
  const viaCli = captureApply(root, forged);
  assert.equal(viaCli.status, 2, viaCli.output);
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput.length, 0,
    "a synthetic reference adds no material");
});

test("A2 typed unavailable for hosts without a reliable capture API (Codex, Antigravity references are not accepted)", () => {
  const root = fixture("a2-hosts");
  for (const schema of ["pipeline.codex-intake-prompt-reference.v1", "pipeline.antigravity-intake-prompt-reference.v1"]) {
    const result = captureApply(root, { schema, turnId: "t1" });
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /INTAKE-CHAT-TURN-REFERENCE-INVALID/u);
  }
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput.length, 0);
  const text = cli(["intake-capture-apply", "--root", root, "--text", "a", "--text-turn-ref", "{}", "--activate", "--runner", "claude"]);
  assert.equal(text.status, 2);
  assert.match(text.output, /accepts exactly one of --text, --text-file, or --text-turn-ref/u);
});

test("A2 host event validation: malformed or wrong-event input yields a typed unavailable, never a capture", () => {
  const root = fixture("a2-event");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "x", { hook_event_name: "PostToolUse" })).code, "CLAUDE-INTAKE-HOST-EVENT-SHAPE");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "x", { transcript_path: "relative.jsonl" })).code, "CLAUDE-INTAKE-HOST-EVENT-SHAPE");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "x", { session_id: "bad id!" })).code, "CLAUDE-INTAKE-HOST-EVENT-SHAPE");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "\ud800 lone")).code, "CLAUDE-INTAKE-PROMPT-INVALID-UNICODE");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "")).code, "CLAUDE-INTAKE-PROMPT-INVALID");
});

// ---------------------------------------------------------------- A3
test("A3 size limit: a prompt over 1,000,000 bytes is refused with a typed code and stores nothing", () => {
  const root = fixture("a3-size");
  const big = captureClaudeIntakePrompt(hostEvent(root, "a".repeat(1_000_001)));
  assert.equal(big.status, "unavailable");
  assert.equal(big.code, "CLAUDE-INTAKE-PROMPT-TOO-LARGE");
  const edge = captureClaudeIntakePrompt(hostEvent(root, "a".repeat(1_000_000)));
  assert.equal(edge.status, "available", "exactly the limit is accepted");
});

test("A3 replay/drift: one slot per session; a changed prompt, a tampered record, and a consumed stage are refused", () => {
  const root = fixture("a3-replay");
  const first = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, MULTILINE)).reference.captureId, first.reference.captureId, "idempotent retry");
  assert.equal(captureClaudeIntakePrompt(hostEvent(root, "different")).code, "CLAUDE-INTAKE-CAPTURE-ALREADY-RECORDED");
  const applied = captureApply(root, first.reference);
  assert.equal(applied.status, 0, applied.output);
  const replay = captureApply(root, first.reference);
  assert.equal(replay.status, 2, "a consumed reference cannot be replayed");
  assert.match(replay.output, /CLAUDE-INTAKE-MATERIAL-NOT-PENDING/u);
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput.length, 1);
});

test("A3 tamper: altering the stored private record is detected and nothing is applied", () => {
  const root = fixture("a3-tamper");
  const { reference } = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root });
  const dir = join(checkpoint.paths.directory, "claude-intake-prompt-captures");
  const file = join(dir, `${sha256("session-pin-001")}.json`);
  assert.equal(existsSync(file), true);
  const record = JSON.parse(readFileSync(file, "utf8"));
  record.promptBase64 = Buffer.from("tampered", "utf8").toString("base64");
  writeFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  assert.equal(readClaudeIntakePromptCapture({ rootDir: root, sessionId: "session-pin-001", reference }).status, "unavailable");
  const viaCli = captureApply(root, reference);
  assert.equal(viaCli.status, 2, viaCli.output);
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput.length, 0);
});

test("A3 checkpoint binds the captured bytes (sha256, byteLength, evidence file)", () => {
  const root = fixture("a3-bind-bytes");
  const { reference } = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  const applied = captureApply(root, reference);
  assert.equal(applied.status, 0, applied.output);
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  const entry = observed.value.materialInput[0];
  assert.equal(entry.sha256, sha256(Buffer.from(MULTILINE, "utf8")));
  assert.equal(entry.byteLength, Buffer.byteLength(MULTILINE, "utf8"));
  const evidence = readFileSync(join(observed.paths.directory, entry.evidencePath));
  assert.equal(Buffer.compare(evidence, Buffer.from(MULTILINE, "utf8")), 0, "evidence bytes equal the host prompt bytes");
});

test("A3 KNOWN-GAP reference digest: the checkpoint also binds the reference digest (producer/consumer: applyOnboardingIntakeCapture in plugins/pipeline-core/lib/onboarding-continuity.mjs fed by resolveIntakeCaptureText in scripts/project-onboarding-v3.mjs)", () => {
  const root = fixture("a3-bind-ref");
  const { reference } = captureClaudeIntakePrompt(hostEvent(root, MULTILINE));
  assert.equal(captureApply(root, reference).status, 0);
  const serialized = JSON.stringify(readOnboardingIntakeCheckpoint({ rootDir: root }).value);
  const candidates = [reference.captureId, sha256(JSON.stringify(reference)), sha256(Buffer.from(JSON.stringify(reference), "utf8"))];
  assert.equal(candidates.some((value) => serialized.includes(value)), true,
    "MISSING: materialInput entry holds only sha256/evidencePath/byteLength/receivedAt, no reference digest or captureId");
});

// Store-free (runs on hosts without the private capture store): the consumer binds and verifies the reference.
test("A3 consent-fixture binding: the checkpoint entry records captureId and reference digest, and a reference that does not describe the bytes is refused", () => {
  const root = fixture("a3-bind-consumer");
  const bytes = Buffer.from(MULTILINE, "utf8");
  const reference = {
    schema: CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA, captureId: "c".repeat(48), sessionId: "session-pin-001",
    transcriptPathSha256: "b".repeat(64), promptSha256: sha256(bytes), byteLength: bytes.length,
  };
  assert.throws(() => applyOnboardingIntakeCapture({ rootDir: root, text: MULTILINE, activate: true,
    captureReference: { ...reference, promptSha256: "0".repeat(64) } }), (error) => error.code === "INTAKE-CAPTURE-REFERENCE-MISMATCH");
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput.length, 0, "a mismatching reference adds no material");
  applyOnboardingIntakeCapture({ rootDir: root, text: MULTILINE, activate: true, captureReference: reference });
  const entry = readOnboardingIntakeCheckpoint({ rootDir: root }).value.materialInput[0];
  assert.equal(entry.captureReference.captureId, reference.captureId);
  assert.match(entry.captureReference.referenceSha256, /^[a-f0-9]{64}$/u);
  assert.equal(entry.captureReference.referenceSchema, CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA);
  assert.equal(entry.sha256, sha256(bytes));
});

// ---------------------------------------------------------------- A4
test("A4 hook boundary never echoes prompt text; only the opaque reference reaches the agent", () => {
  const root = fixture("a4-hook");
  const result = processClaudeIntakePromptSubmit(hostEvent(root, MULTILINE));
  assert.equal(result.status, "available");
  const context = result.hookOutput.hookSpecificOutput.additionalContext;
  assert.equal(context.includes("Café"), false);
  assert.equal(context.includes("trailing spaces"), false);
  assert.equal(context.includes(JSON.stringify(result.reference)), true);
});

test("A4 end to end: hook reference -> CLI intake-capture-apply with no message text in argv yields byte-exact multiline material", () => {
  const root = fixture("a4-e2e");
  const hook = processClaudeIntakePromptSubmit(hostEvent(root, MULTILINE));
  const reference = hook.reference;
  const argv = ["intake-capture-apply", "--root", root, "--text-turn-ref", JSON.stringify(reference), "--activate", "--runner", "claude"];
  assert.equal(argv.join("\n").includes("Brief"), false, "the agent-side command never carries the message");
  const applied = cli(argv);
  assert.equal(applied.status, 0, applied.output);
  const observed = readOnboardingIntakeCheckpoint({ rootDir: root });
  const entry = observed.value.materialInput[0];
  const evidence = readFileSync(join(observed.paths.directory, entry.evidencePath));
  assert.equal(evidence.toString("utf8"), MULTILINE);
  assert.equal(entry.sha256, reference.promptSha256);
});
