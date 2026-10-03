// SPDX-License-Identifier: SUL-1.0

/**
 * Metadata-only bridge for the first prompt received while local onboarding
 * intake is initialized but has not yet received consent. Prompt text is
 * hashed in memory and is never written by this module before consent.
 */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, realpathSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  assertPrivateRegularFile,
  ensurePrivateDirectory,
  readPrivateFile,
  writePrivateFileNoReplaceAtomic,
} from "./private-boundary.mjs";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";

export const CLAUDE_INITIAL_PROMPT_POINTER_SCHEMA = "pipeline.claude-initial-prompt-pointer.v1";
export const CLAUDE_INITIAL_PROMPT_REFERENCE_SCHEMA = "pipeline.claude-initial-prompt-reference.v1";
const MAX_PROMPT_BYTES = 1_000_000;
const MAX_RECORD_BYTES = 32_768;
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const MAX_TRANSCRIPT_LINE_BYTES = 2 * 1024 * 1024;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const POINTER_ID = /^[a-f0-9]{48}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function unavailable(code) { return { status: "unavailable", code }; }

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function physicalRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new Error("CLAUDE-INITIAL-ROOT-INVALID");
  }
  const root = realpathSync.native(resolve(value));
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("CLAUDE-INITIAL-ROOT-UNSAFE");
  return root;
}

function checkpointProjection(value) {
  return {
    schema: value.schema,
    root: value.root,
    createdAt: value.createdAt,
    materialInput: value.materialInput,
    designQuestions: value.designQuestions,
    transactionState: value.transactionState,
    generated: value.generated,
    ...(Object.hasOwn(value, "retiredEnrollmentGenerationSha256")
      ? { retiredEnrollmentGenerationSha256: value.retiredEnrollmentGenerationSha256 } : {}),
  };
}

function validConsentValues(value) {
  if (!exactKeys(value, ["gitAuthor", "language", "profile"])) return false;
  const author = value.gitAuthor;
  return (author === null || (exactKeys(author, ["name", "email"])
      && typeof author.name === "string" && author.name.trim().length > 0
      && typeof author.email === "string" && author.email.trim().length > 0))
    && (value.language === null || value.language === "de" || value.language === "en")
    && (value.profile === null || ["epic", "feature", "mini"].includes(value.profile));
}

function pendingInitialCheckpoint(root, readCheckpoint) {
  const checkpoint = readCheckpoint({ rootDir: root, repositoryCapability: "local" });
  const value = checkpoint?.value;
  if (checkpoint?.status !== "present" || value?.root !== root
    || value.consent !== null || value.transactionState !== "collecting"
    || !Array.isArray(value.materialInput) || value.materialInput.length !== 0
    || value.designQuestions !== null
    || value.values?.gitAuthor !== null || value.values?.language !== null || value.values?.profile !== null
    || !SHA256.test(checkpoint.sha256 || "") || !Number.isSafeInteger(value.revision) || value.revision < 0
    || typeof checkpoint.paths?.directory !== "string") return null;
  return checkpoint;
}

function eventMetadata(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || input.hook_event_name !== "UserPromptSubmit"
    || typeof input.session_id !== "string" || !SESSION_ID.test(input.session_id)
    || typeof input.prompt_id !== "string" || !UUID.test(input.prompt_id)
    || typeof input.transcript_path !== "string" || input.transcript_path.includes("\0")
    || !isAbsolute(input.transcript_path)
    || typeof input.cwd !== "string" || typeof input.prompt !== "string") {
    throw new Error(typeof input?.prompt_id !== "string" || input?.prompt_id === ""
      ? "CLAUDE-INITIAL-PROMPT-ID-UNAVAILABLE" : "CLAUDE-INITIAL-HOST-EVENT-SHAPE");
  }
  for (let index = 0; index < input.prompt.length; index += 1) {
    const unit = input.prompt.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.prompt.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("CLAUDE-INITIAL-PROMPT-INVALID-UNICODE");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("CLAUDE-INITIAL-PROMPT-INVALID-UNICODE");
  }
  const promptBytes = Buffer.from(input.prompt, "utf8");
  if (promptBytes.length === 0 || promptBytes.length > MAX_PROMPT_BYTES || promptBytes.includes(0)) {
    throw new Error(promptBytes.length > MAX_PROMPT_BYTES
      ? "CLAUDE-INITIAL-PROMPT-TOO-LARGE" : "CLAUDE-INITIAL-PROMPT-INVALID");
  }
  const transcriptPath = resolve(input.transcript_path);
  return {
    root: physicalRoot(input.cwd),
    sessionId: input.session_id,
    promptId: input.prompt_id,
    transcriptPath,
    transcriptPathSha256: sha256(Buffer.from(transcriptPath, "utf8")),
    promptSha256: sha256(promptBytes),
    byteLength: promptBytes.length,
  };
}

function pointerDirectory(checkpoint) {
  return join(checkpoint.paths.directory, "claude-initial-prompt-pointers");
}

function pointerPath(directory, sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error("CLAUDE-INITIAL-REFERENCE-SHAPE");
  return join(directory, `${sha256(sessionId)}.json`);
}

function makeReference(record) {
  return {
    schema: CLAUDE_INITIAL_PROMPT_REFERENCE_SCHEMA,
    pointerId: record.pointerId,
    sessionId: record.sessionId,
    promptId: record.promptId,
    promptSha256: record.promptSha256,
    byteLength: record.byteLength,
  };
}

function decodePointer(raw) {
  const bytes = Buffer.from(raw, "utf8");
  if (bytes.length > MAX_RECORD_BYTES) throw new Error("CLAUDE-INITIAL-RECORD-TOO-LARGE");
  let record;
  try { record = JSON.parse(raw); } catch { throw new Error("CLAUDE-INITIAL-RECORD-MALFORMED"); }
  const keys = ["schema", "root", "sessionId", "promptId", "transcriptPath", "transcriptPathSha256",
    "promptSha256", "byteLength", "checkpointSha256", "checkpointRevision", "checkpointProjectionSha256",
    "capturedAt", "pointerId"];
  if (!exactKeys(record, keys) || record.schema !== CLAUDE_INITIAL_PROMPT_POINTER_SCHEMA
    || typeof record.root !== "string" || !SESSION_ID.test(record.sessionId) || !UUID.test(record.promptId)
    || typeof record.transcriptPath !== "string" || !isAbsolute(record.transcriptPath) || record.transcriptPath.includes("\0")
    || !SHA256.test(record.transcriptPathSha256) || !SHA256.test(record.promptSha256)
    || !Number.isSafeInteger(record.byteLength) || record.byteLength < 1 || record.byteLength > MAX_PROMPT_BYTES
    || !SHA256.test(record.checkpointSha256) || !Number.isSafeInteger(record.checkpointRevision) || record.checkpointRevision < 0
    || !SHA256.test(record.checkpointProjectionSha256)
    || typeof record.capturedAt !== "string" || !Number.isFinite(Date.parse(record.capturedAt))
    || new Date(record.capturedAt).toISOString() !== record.capturedAt || !POINTER_ID.test(record.pointerId)
    || sha256(Buffer.from(record.transcriptPath, "utf8")) !== record.transcriptPathSha256) {
    throw new Error("CLAUDE-INITIAL-RECORD-SHAPE");
  }
  return record;
}

/** Store only host event metadata while canonical intake is awaiting consent. */
export function captureClaudeInitialPromptPointer(input, {
  readCheckpoint = readOnboardingIntakeCheckpoint,
} = {}) {
  let event;
  try { event = eventMetadata(input); }
  catch (error) { return unavailable(error?.message || "CLAUDE-INITIAL-HOST-EVENT-INVALID"); }
  let checkpoint;
  try { checkpoint = pendingInitialCheckpoint(event.root, readCheckpoint); }
  catch (error) { return unavailable(error?.code || "CLAUDE-INITIAL-CHECKPOINT-UNAVAILABLE"); }
  if (checkpoint === null) return unavailable("CLAUDE-INITIAL-INTAKE-NOT-PENDING");

  let directory;
  try { directory = ensurePrivateDirectory(pointerDirectory(checkpoint)); }
  catch (error) { return unavailable(error?.code || "CLAUDE-INITIAL-STORE-UNAVAILABLE"); }
  const record = {
    schema: CLAUDE_INITIAL_PROMPT_POINTER_SCHEMA,
    root: event.root,
    sessionId: event.sessionId,
    promptId: event.promptId,
    transcriptPath: event.transcriptPath,
    transcriptPathSha256: event.transcriptPathSha256,
    promptSha256: event.promptSha256,
    byteLength: event.byteLength,
    checkpointSha256: checkpoint.sha256,
    checkpointRevision: checkpoint.value.revision,
    checkpointProjectionSha256: sha256(Buffer.from(canonicalJson(checkpointProjection(checkpoint.value)), "utf8")),
    capturedAt: new Date().toISOString(),
    pointerId: randomBytes(24).toString("hex"),
  };
  const path = pointerPath(directory, event.sessionId);
  try {
    if (existsSync(path)) {
      const prior = decodePointer(readPrivateFile(path, "Claude initial prompt pointer"));
      if (prior.root === record.root && prior.sessionId === record.sessionId && prior.promptId === record.promptId
        && prior.promptSha256 === record.promptSha256 && prior.byteLength === record.byteLength
        && prior.transcriptPathSha256 === record.transcriptPathSha256
        && prior.checkpointSha256 === record.checkpointSha256) {
        return { status: "available", reference: makeReference(prior) };
      }
      return unavailable("CLAUDE-INITIAL-POINTER-ALREADY-RECORDED");
    }
    const publication = writePrivateFileNoReplaceAtomic(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
    if (publication.created !== true) return unavailable("CLAUDE-INITIAL-POINTER-CONFLICT");
    assertPrivateRegularFile(path, "Claude initial prompt pointer");
  } catch (error) { return unavailable(error?.code || "CLAUDE-INITIAL-POINTER-WRITE-FAILED"); }
  return { status: "available", reference: makeReference(record) };
}

function promptTextFromObservedRow(row, sessionId) {
  if (row === null || typeof row !== "object" || Array.isArray(row) || row.type !== "user"
    || row.sessionId !== sessionId || typeof row.uuid !== "string" || !UUID.test(row.uuid)
    || row.isMeta === true || row.isCompactSummary === true || row.isReplay === true
    || row.isSynthetic === true || row.isSidechain === true || row.sourceToolUseID != null
    || !exactKeys(row.message, ["role", "content"])
    || row.message.role !== "user") return null;
  const content = row.message.content;
  if (typeof content === "string") return { text: content, uuid: row.uuid };
  if (!Array.isArray(content) || content.length !== 1) return null;
  const block = content[0];
  if (!exactKeys(block, ["type", "text"]) || block.type !== "text" || typeof block.text !== "string") return null;
  return { text: block.text, uuid: row.uuid };
}

function readUniqueNativePrompt(record) {
  const path = record.transcriptPath;
  let info;
  let physical;
  try {
    info = lstatSync(path);
    physical = realpathSync.native(path);
  } catch { return unavailable("CLAUDE-INITIAL-TRANSCRIPT-NOT-READY"); }
  if (physical !== path || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    return unavailable("CLAUDE-INITIAL-TRANSCRIPT-UNSAFE");
  }
  if (info.size > MAX_TRANSCRIPT_BYTES) return unavailable("CLAUDE-INITIAL-TRANSCRIPT-TOO-LARGE");
  try {
    const parent = dirname(path);
    if (realpathSync.native(parent) !== parent || basename(path).length === 0) {
      return unavailable("CLAUDE-INITIAL-TRANSCRIPT-UNSAFE");
    }
  } catch { return unavailable("CLAUDE-INITIAL-TRANSCRIPT-UNSAFE"); }
  let bytes;
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== info.dev || opened.ino !== info.ino
      || opened.size !== info.size || opened.size > MAX_TRANSCRIPT_BYTES) {
      closeSync(descriptor);
      return unavailable("CLAUDE-INITIAL-TRANSCRIPT-CHANGED");
    }
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.nlink !== 1) {
      closeSync(descriptor);
      return unavailable("CLAUDE-INITIAL-TRANSCRIPT-CHANGED");
    }
    closeSync(descriptor);
  } catch {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* already closed */ }
    }
    return unavailable("CLAUDE-INITIAL-TRANSCRIPT-UNREADABLE");
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return unavailable("CLAUDE-INITIAL-TRANSCRIPT-UTF8"); }
  const complete = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n").slice(0, -1);
  const matches = [];
  for (const line of complete) {
    if (Buffer.byteLength(line, "utf8") > MAX_TRANSCRIPT_LINE_BYTES) return unavailable("CLAUDE-INITIAL-TRANSCRIPT-LINE-TOO-LARGE");
    if (line.length === 0) continue;
    let row;
    try { row = JSON.parse(line); } catch { return unavailable("CLAUDE-INITIAL-TRANSCRIPT-ROW-MALFORMED"); }
    if (row?.type !== "user" || row?.sessionId !== record.sessionId) continue;
    const candidate = promptTextFromObservedRow(row, record.sessionId);
    if (candidate === null) return unavailable("CLAUDE-INITIAL-TRANSCRIPT-ROW-SHAPE-UNSUPPORTED");
    const candidateBytes = Buffer.from(candidate.text, "utf8");
    if (candidateBytes.length === record.byteLength && sha256(candidateBytes) === record.promptSha256) {
      matches.push({ text: candidate.text, uuid: candidate.uuid });
    }
  }
  if (matches.length === 0) return unavailable("CLAUDE-INITIAL-TRANSCRIPT-PROMPT-PENDING");
  if (matches.length !== 1) return unavailable("CLAUDE-INITIAL-TRANSCRIPT-PROMPT-AMBIGUOUS");
  return { status: "available", ...matches[0] };
}

/** Resolve only after affirmative consent and only by a unique native row digest match. */
export function readClaudeInitialPromptPointerAfterConsent({ rootDir, sessionId, reference }, {
  readCheckpoint = readOnboardingIntakeCheckpoint,
} = {}) {
  if (!exactKeys(reference, ["schema", "pointerId", "sessionId", "promptId", "promptSha256", "byteLength"])
    || reference.schema !== CLAUDE_INITIAL_PROMPT_REFERENCE_SCHEMA || !POINTER_ID.test(reference.pointerId || "")
    || !SESSION_ID.test(sessionId || "") || reference.sessionId !== sessionId || !UUID.test(reference.promptId || "")
    || !SHA256.test(reference.promptSha256 || "") || !Number.isSafeInteger(reference.byteLength)
    || reference.byteLength < 1 || reference.byteLength > MAX_PROMPT_BYTES) return unavailable("CLAUDE-INITIAL-REFERENCE-SHAPE");
  let root;
  let checkpoint;
  try {
    root = physicalRoot(rootDir);
    checkpoint = readCheckpoint({ rootDir: root, repositoryCapability: "local" });
  } catch (error) { return unavailable(error?.code || "CLAUDE-INITIAL-CHECKPOINT-UNAVAILABLE"); }
  const value = checkpoint?.value;
  if (checkpoint?.status !== "present" || value?.root !== root || value.consent?.granted !== true
    || value.transactionState !== "collecting" || !Array.isArray(value.materialInput) || value.materialInput.length !== 0) {
    return unavailable("CLAUDE-INITIAL-CONSENT-NOT-RECORDED");
  }
  if (!validConsentValues(value.values)) return unavailable("CLAUDE-INITIAL-CONSENT-VALUES-INVALID");
  let record;
  try {
    const path = pointerPath(pointerDirectory(checkpoint), sessionId);
    record = decodePointer(readPrivateFile(path, "Claude initial prompt pointer"));
  } catch (error) { return unavailable(error?.code || "CLAUDE-INITIAL-POINTER-UNAVAILABLE"); }
  if (record.root !== root || record.sessionId !== sessionId || record.promptId !== reference.promptId
    || record.promptSha256 !== reference.promptSha256 || record.byteLength !== reference.byteLength
    || record.pointerId !== reference.pointerId || checkpoint.value.revision !== record.checkpointRevision + 1
    || sha256(Buffer.from(canonicalJson(checkpointProjection(checkpoint.value)), "utf8")) !== record.checkpointProjectionSha256) {
    return unavailable("CLAUDE-INITIAL-POINTER-BINDING");
  }
  const observed = readUniqueNativePrompt(record);
  if (observed.status !== "available") return observed;
  return {
    status: "available",
    text: observed.text,
    reference: makeReference(record),
    nativeMessageUuid: observed.uuid,
  };
}
