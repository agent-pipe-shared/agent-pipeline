// SPDX-License-Identifier: SUL-1.0

/**
 * Lossless intake capture from Claude Code's native UserPromptSubmit event.
 *
 * This is deliberately narrower than a chat logger: it stores at most one
 * prompt while the canonical onboarding checkpoint is consent-granted and
 * still collecting its first material input. The returned identifier names
 * this adapter's immutable capture record; it is not a Claude transcript
 * UUID and carries no human-approval meaning.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  assertPrivateRegularFile,
  ensurePrivateDirectory,
  readPrivateFile,
  writePrivateFileNoReplaceAtomic,
} from "./private-boundary.mjs";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { captureClaudeInitialPromptPointer } from "./claude-initial-prompt-pointer.mjs";

export const CLAUDE_INTAKE_PROMPT_CAPTURE_SCHEMA = "pipeline.claude-intake-prompt-capture.v1";
export const CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA = "pipeline.claude-intake-prompt-reference.v1";
const MAX_PROMPT_BYTES = 1_000_000;
const MAX_RECORD_BYTES = 1_500_000;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CAPTURE_ID = /^[a-f0-9]{48}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function unavailable(code) {
  return { status: "unavailable", code };
}

function physicalRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new Error("CLAUDE-INTAKE-ROOT-INVALID");
  }
  const root = realpathSync.native(resolve(value));
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("CLAUDE-INTAKE-ROOT-UNSAFE");
  return root;
}

function authorizedCheckpoint(root, readCheckpoint = readOnboardingIntakeCheckpoint) {
  const observed = readCheckpoint({ rootDir: root, repositoryCapability: "local" });
  if (observed?.status !== "present" || observed.value?.root !== root
    || observed.value?.consent?.granted !== true
    || observed.value?.transactionState !== "collecting"
    || !Array.isArray(observed.value?.materialInput) || observed.value.materialInput.length !== 0
    || typeof observed.sha256 !== "string" || !SHA256.test(observed.sha256)
    || typeof observed.paths?.directory !== "string") return null;
  return observed;
}

function eventValues(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || input.hook_event_name !== "UserPromptSubmit"
    || typeof input.session_id !== "string" || !SESSION_ID.test(input.session_id)
    || typeof input.transcript_path !== "string" || input.transcript_path.includes("\0")
    || !isAbsolute(input.transcript_path)
    || typeof input.cwd !== "string" || typeof input.prompt !== "string") {
    throw new Error("CLAUDE-INTAKE-HOST-EVENT-SHAPE");
  }
  for (let index = 0; index < input.prompt.length; index += 1) {
    const unit = input.prompt.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.prompt.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("CLAUDE-INTAKE-PROMPT-INVALID-UNICODE");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("CLAUDE-INTAKE-PROMPT-INVALID-UNICODE");
    }
  }
  const promptBytes = Buffer.from(input.prompt, "utf8");
  if (promptBytes.length === 0 || promptBytes.length > MAX_PROMPT_BYTES || promptBytes.includes(0)) {
    throw new Error(promptBytes.length > MAX_PROMPT_BYTES
      ? "CLAUDE-INTAKE-PROMPT-TOO-LARGE" : "CLAUDE-INTAKE-PROMPT-INVALID");
  }
  return {
    sessionId: input.session_id,
    transcriptPathSha256: sha256(Buffer.from(resolve(input.transcript_path), "utf8")),
    promptBytes,
    root: physicalRoot(input.cwd),
  };
}

function captureDirectory(checkpoint) {
  return join(checkpoint.paths.directory, "claude-intake-prompt-captures");
}

function recordPath(directory, sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error("CLAUDE-INTAKE-REFERENCE-SHAPE");
  // One deterministic slot permits only one prompt capture per host session
  // and project, even if another action changes the pending checkpoint.
  return join(directory, `${sha256(sessionId)}.json`);
}

function makeReference(record) {
  return {
    schema: CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA,
    captureId: record.captureId,
    sessionId: record.sessionId,
    transcriptPathSha256: record.transcriptPathSha256,
    promptSha256: record.promptSha256,
    byteLength: record.byteLength,
  };
}

/** Capture only the native current prompt when intake is explicitly pending. */
export function captureClaudeIntakePrompt(input, { readCheckpoint = readOnboardingIntakeCheckpoint } = {}) {
  let values;
  try { values = eventValues(input); }
  catch (error) { return unavailable(error?.message || "CLAUDE-INTAKE-HOST-EVENT-INVALID"); }
  let checkpoint;
  try { checkpoint = authorizedCheckpoint(values.root, readCheckpoint); }
  catch (error) { return unavailable(error?.code || "CLAUDE-INTAKE-CHECKPOINT-UNAVAILABLE"); }
  if (checkpoint === null) return unavailable("CLAUDE-INTAKE-MATERIAL-NOT-PENDING");

  const directory = captureDirectory(checkpoint);
  let privateDirectory;
  try { privateDirectory = ensurePrivateDirectory(directory); }
  catch (error) { return unavailable(error?.code || "CLAUDE-INTAKE-PRIVATE-STORE-UNAVAILABLE"); }
  const captureId = randomBytes(24).toString("hex");
  const record = {
    schema: CLAUDE_INTAKE_PROMPT_CAPTURE_SCHEMA,
    root: values.root,
    sessionId: values.sessionId,
    transcriptPathSha256: values.transcriptPathSha256,
    checkpointSha256: checkpoint.sha256,
    checkpointRevision: checkpoint.value.revision,
    promptSha256: sha256(values.promptBytes),
    byteLength: values.promptBytes.length,
    capturedAt: new Date().toISOString(),
    captureId,
    promptBase64: values.promptBytes.toString("base64"),
  };
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  if (recordBytes.length > MAX_RECORD_BYTES) return unavailable("CLAUDE-INTAKE-RECORD-TOO-LARGE");
  const path = recordPath(privateDirectory, values.sessionId);
  try {
    if (existsSync(path)) {
      const prior = decodeRecord(Buffer.from(readPrivateFile(path, "Claude intake prompt capture"), "utf8"));
      if (prior.record.root === record.root && prior.record.sessionId === record.sessionId
        && prior.record.checkpointSha256 === record.checkpointSha256
        && prior.record.transcriptPathSha256 === record.transcriptPathSha256
        && prior.record.promptSha256 === record.promptSha256) {
        return { status: "available", reference: makeReference(prior.record) };
      }
      return unavailable("CLAUDE-INTAKE-CAPTURE-ALREADY-RECORDED");
    }
    const publication = writePrivateFileNoReplaceAtomic(path, recordBytes);
    if (publication.created !== true) return unavailable("CLAUDE-INTAKE-CAPTURE-CONFLICT");
    assertPrivateRegularFile(path, "Claude intake prompt capture");
  } catch (error) {
    return unavailable(error?.code || "CLAUDE-INTAKE-CAPTURE-WRITE-FAILED");
  }
  return { status: "available", reference: makeReference(record) };
}

function decodeRecord(bytes) {
  if (bytes.length > MAX_RECORD_BYTES) throw new Error("CLAUDE-INTAKE-RECORD-TOO-LARGE");
  let record;
  try { record = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("CLAUDE-INTAKE-RECORD-MALFORMED"); }
  const keys = ["schema", "root", "sessionId", "transcriptPathSha256", "checkpointSha256",
    "checkpointRevision", "promptSha256", "byteLength", "capturedAt", "captureId", "promptBase64"];
  if (!exactKeys(record, keys) || record.schema !== CLAUDE_INTAKE_PROMPT_CAPTURE_SCHEMA
    || typeof record.root !== "string" || !SESSION_ID.test(record.sessionId)
    || !SHA256.test(record.transcriptPathSha256) || !SHA256.test(record.checkpointSha256)
    || !Number.isSafeInteger(record.checkpointRevision) || record.checkpointRevision < 0
    || !SHA256.test(record.promptSha256) || !Number.isSafeInteger(record.byteLength)
    || record.byteLength < 1 || record.byteLength > MAX_PROMPT_BYTES
    || typeof record.capturedAt !== "string" || !Number.isFinite(Date.parse(record.capturedAt))
    || new Date(record.capturedAt).toISOString() !== record.capturedAt
    || !CAPTURE_ID.test(record.captureId) || typeof record.promptBase64 !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(record.promptBase64)) {
    throw new Error("CLAUDE-INTAKE-RECORD-SHAPE");
  }
  const promptBytes = Buffer.from(record.promptBase64, "base64");
  if (promptBytes.length !== record.byteLength || promptBytes.includes(0)
    || promptBytes.toString("base64") !== record.promptBase64
    || sha256(promptBytes) !== record.promptSha256) throw new Error("CLAUDE-INTAKE-RECORD-DIGEST");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(promptBytes); }
  catch { throw new Error("CLAUDE-INTAKE-RECORD-UTF8"); }
  return { record, text };
}

/** Resolve an opaque adapter reference while its exact intake stage is current. */
export function readClaudeIntakePromptCapture({ rootDir, sessionId, reference }, {
  readCheckpoint = readOnboardingIntakeCheckpoint,
} = {}) {
  if (!exactKeys(reference, ["schema", "captureId", "sessionId", "transcriptPathSha256", "promptSha256", "byteLength"])
    || reference.schema !== CLAUDE_INTAKE_PROMPT_REFERENCE_SCHEMA
    || !CAPTURE_ID.test(reference.captureId) || !SESSION_ID.test(sessionId || "")
    || reference.sessionId !== sessionId || !SHA256.test(reference.transcriptPathSha256)
    || !SHA256.test(reference.promptSha256) || !Number.isSafeInteger(reference.byteLength)
    || reference.byteLength < 1 || reference.byteLength > MAX_PROMPT_BYTES) {
    return unavailable("CLAUDE-INTAKE-REFERENCE-SHAPE");
  }
  let root;
  let checkpoint;
  try {
    root = physicalRoot(rootDir);
    checkpoint = authorizedCheckpoint(root, readCheckpoint);
  } catch (error) {
    return unavailable(error?.code || "CLAUDE-INTAKE-CHECKPOINT-UNAVAILABLE");
  }
  if (checkpoint === null) return unavailable("CLAUDE-INTAKE-MATERIAL-NOT-PENDING");
  let parsed;
  try {
    const path = recordPath(captureDirectory(checkpoint), sessionId);
    const raw = Buffer.from(readPrivateFile(path, "Claude intake prompt capture"), "utf8");
    parsed = decodeRecord(raw);
  } catch (error) {
    return unavailable(error?.code || "CLAUDE-INTAKE-CAPTURE-UNAVAILABLE");
  }
  const record = parsed.record;
  if (record.root !== root || record.sessionId !== sessionId
    || record.checkpointSha256 !== checkpoint.sha256
    || record.checkpointRevision !== checkpoint.value.revision
    || reference.captureId !== record.captureId || reference.sessionId !== record.sessionId
    || reference.transcriptPathSha256 !== record.transcriptPathSha256
    || reference.promptSha256 !== record.promptSha256 || reference.byteLength !== record.byteLength) {
    return unavailable("CLAUDE-INTAKE-CAPTURE-BINDING");
  }
  return { status: "available", text: parsed.text, reference: makeReference(record) };
}

/** Safe event boundary used by the command hook; never writes user content to stdout. */
export function processClaudeIntakePromptSubmit(input) {
  // The metadata-only bridge runs first, while an initialized intake is still
  // awaiting consent. It never emits prompt text or a transcript path. The
  // opaque reference lets the later, separately consented capture resolve the
  // exact native turn without making the prompt itself a stored pre-consent
  // value or treating the reference as approval.
  const initialPointer = captureClaudeInitialPromptPointer(input);
  const result = captureClaudeIntakePrompt(input);
  if (result.status !== "available" && result.code === "CLAUDE-INTAKE-MATERIAL-NOT-PENDING"
    && initialPointer.status === "available") {
    return {
      status: "available",
      hookOutput: {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `An initial onboarding material turn was observed before consent. First apply canonical intake consent; only after it succeeds, pass this exact opaque reference to intake-capture-apply --text-turn-ref: ${JSON.stringify(initialPointer.reference)}. This reference contains no prompt text or transcript path and is not consent or approval.`,
        },
      },
    };
  }
  if (result.status !== "available") return result;
  return {
    ...result,
    hookOutput: {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `A consented onboarding material prompt was captured losslessly. Use the opaque native prompt capture reference with the canonical intake reader: ${JSON.stringify(result.reference)}. This reference is not approval or a transcript UUID.`,
      },
    },
  };
}
