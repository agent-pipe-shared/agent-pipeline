/**
 * Profile-bound, coordinator-owned Codex Critic isolation adapter.
 *
 * The coordinator proves one exact named permission profile with direct
 * synthetic probes, then sends the complete Git-object review bundle to a
 * tool-less Critic over stdin. Public evidence contains hashes/categories only.
 */
import { spawn as nodeSpawn, execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA = path.join(SCRIPT_DIR, "critic-verdict.schema.json");
const MAX_STREAM_BYTES = 256 * 1024;
const MAX_RESULT_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const DENIED_ENV = /(?:token|secret|credential|password|auth|cookie|proxy|github|gitlab|git_|ci$|aws|azure|google|npm|yarn|pnpm|registry|remote|origin|ssh|http)/iu;
const SAFE_ENV = new Set(["PATH", "HOME", "CODEX_HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "COMSPEC", "USERPROFILE"]);
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const SAFE_PROFILE_ID = /^[a-z][a-z0-9-]{0,31}$/u;
const BROAD_READ_ROOTS = new Set(["/home", "/mnt", "/opt", "/tmp", "/usr", "/var", os.homedir(), path.dirname(os.homedir())].map(normalizedPath));
const DEBUG_REDACTED_SECRET = "[REDACTED_SECRET]";
const DEBUG_REDACTED_URL = "[REDACTED_URL]";
const DEBUG_REDACTED_QUERY = "[REDACTED_URL_QUERY]";
const DEBUG_REDACTED_FRAGMENT = "[REDACTED_URL_FRAGMENT]";
const DEBUG_REDACTED_PATH = "[REDACTED_ABSOLUTE_PATH]";
const DEBUG_REDACTED_IDENTIFIER = "[REDACTED_PRIVATE_IDENTIFIER]";
const DEBUG_QUOTED_OR_ATOM = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)`;
const DEBUG_AUTHORIZATION = new RegExp(String.raw`((?<![A-Za-z0-9])authorization\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:bearer|basic)\s+[^\s,;}\]]+|[^\s,;}\]]+)`, "giu");
const DEBUG_BEARER = new RegExp(String.raw`(\bbearer\s+)${DEBUG_QUOTED_OR_ATOM}`, "giu");
const DEBUG_COOKIE = new RegExp(String.raw`((?<![A-Za-z0-9])(?:set[-_]?cookie|cookie)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^}\]]+)`, "giu");
const DEBUG_NAMED_SECRET = new RegExp(String.raw`((?<![A-Za-z0-9])(?:x[-_]?api[-_]?key|api[-_ ]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|token|secret|password|passwd|pwd)\b["']?\s*[:=]\s*)${DEBUG_QUOTED_OR_ATOM}`, "giu");
const DEBUG_ABSOLUTE_URL = /\b([a-z][a-z0-9+.-]*):\/\/[^\s"'<>]*/giu;
const DEBUG_RELATIVE_URL_QUERY = /(^|[\s=(])((?:\/{1,2})[^\s?#"'<>]*)(\?[^\s#"'<>]*)(#[^\s"'<>]*)?/gu;
const DEBUG_RELATIVE_URL_FRAGMENT = /(^|[\s=(])((?:\/{1,2})[^\s?#"'<>]*)(#[^\s"'<>]*)/gu;
const DEBUG_NAMED_SECRET_SPACE = new RegExp(String.raw`((?<![A-Za-z0-9])(?:authorization|x[-_]?api[-_]?key|api[-_ ]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|token|secret|password|passwd|pwd)\b\s+)${DEBUG_QUOTED_OR_ATOM}`, "giu");
const DEBUG_BARE_TOKEN = /(?<![A-Za-z0-9_-])(?:sk-[A-Za-z0-9_-]{8,16384}|gh[pousr]_[A-Za-z0-9]{8,16384})(?![A-Za-z0-9_-])/gu;
const DEBUG_JWT = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{4,16384}\.[A-Za-z0-9_-]{4,16384}\.[A-Za-z0-9_-]{4,16384}(?![A-Za-z0-9_-])/gu;
const DEBUG_UNC_PATH = /(?<![A-Za-z0-9\\])\\\\[^\\/\s"'<>|?*\u0000-\u001f]+\\[^\\/\s"'<>|?*\u0000-\u001f]+(?:\\[^\\/\s"'<>|?*\u0000-\u001f]+)*/gu;
const DEBUG_WINDOWS_PATH = /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/])(?:[^\s\\/"'<>|?*\u0000-\u001f]+[\\/])*[^\s\\/"'<>|?*\u0000-\u001f]*/gu;
const DEBUG_UNIX_PATH = /(?<![A-Za-z0-9.:/\\])\/(?:[^\s/\\:"'<>|?*\u0000-\u001f]+\/)*[^\s/\\:"'<>|?*\u0000-\u001f]*/gu;
const DEBUG_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;
const DEFAULT_DEBUG_PENDING_BYTES = 16 * 1024;
const DEFAULT_DEBUG_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_TRACE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TRACE_EVENTS = 4096;
const DEBUG_DIAGNOSTIC_RAW_BYTES = 1024;
const DEBUG_DIAGNOSTIC_BYTES = 4096;
const DEBUG_PROC_INTERVAL_MS = 5000;
const SAFE_DEBUG_RUST_LOG = "codex_core=info,codex_exec=info";
const TRACE_CATEGORY = /^[a-z][a-z0-9-]{0,63}$/u;
const TRACE_SHA256 = /^[0-9a-f]{64}$/u;
const TRACE_MONOTONIC_NS = /^(?:0|[1-9][0-9]*)$/u;
const TRACE_SIGNALS = new Set(["SIGHUP", "SIGINT", "SIGQUIT", "SIGILL", "SIGTRAP", "SIGABRT", "SIGBUS", "SIGFPE", "SIGKILL", "SIGUSR1", "SIGSEGV", "SIGUSR2", "SIGPIPE", "SIGALRM", "SIGTERM", "SIGCHLD", "SIGCONT", "SIGSTOP", "SIGTSTP", "SIGTTIN", "SIGTTOU", "SIGURG", "SIGXCPU", "SIGXFSZ", "SIGVTALRM", "SIGPROF", "SIGWINCH", "SIGIO", "SIGPWR", "SIGSYS"]);
const TRACE_PROCESS_STATES = new Set(["R", "S", "D", "Z", "T", "t", "X", "x", "K", "W", "P", "I"]);
const TRACE_CAUSES = new Set(["coordinator-input", "child-process", "cli-before-turn", "response-stalled", "jsonl-lifecycle", "result-sink", "fixture-or-binding", "cleanup", "unbestimmt"]);
const SECURE_TRACE_STORES = new WeakSet();
const SECURE_TRACE_DIAGNOSTIC_APPENDERS = new WeakMap();
const SECURE_TRACE_GUARDED_APPENDERS = new WeakMap();

export const CODEX_CRITIC_TRACE_EVENTS = Object.freeze([
  "trace.opened",
  "run.started", "run.completed", "run.failed",
  "step.started", "step.completed", "step.failed",
  "child.spawn-requested", "child.spawned", "child.spawn-failed", "child.error", "child.exit", "child.close", "child.signal-requested", "child.signal-result",
  "stdin.write-requested", "stdin.write-accepted", "stdin.end-requested", "stdin.closed", "stdin.error",
  "stream.chunk", "stream.jsonl-event", "stream.diagnostic", "stream.error",
  "process.sample",
  "lease.armed", "lease.heartbeat", "lease.expired",
  "result.observed",
  "trace.finalized",
]);

export const CODEX_CRITIC_TRACE_STEPS = Object.freeze([
  "input", "commit", "binary", "fixture", "bundle", "profile", "preflight", "binding-before", "critic", "binding-after", "result", "canary", "cleanup",
]);

const TRACE_EVENT_SET = new Set(CODEX_CRITIC_TRACE_EVENTS);
const TRACE_STEP_SET = new Set(CODEX_CRITIC_TRACE_STEPS);
const TRACE_JSONL_TYPES = new Set(["thread.started", "turn.started", "item.started", "item.completed", "turn.completed", "turn.failed", "thread.completed", "error", "unknown"]);
const TRACE_ITEM_TYPES = new Set(["reasoning", "agent_message", "command_execution", "file_change", "mcp_tool_call", "web_search", "plan_update", "unknown"]);
const TRACE_ITEM_STATUSES = new Set(["started", "completed", "failed", "in_progress", "unknown"]);

export const CODEX_CRITIC_POLICY = Object.freeze({
  schema: "pipeline.codex-critic-profile-bound.v1",
  adapter: "codex-critic-profile-bound.v1",
  model: "gpt-5.6-sol",
  effort: "max",
  approval: "never",
  webSearch: "disabled",
  permissionProfile: "pipeline-critic",
  requiredVersion: "codex-cli 0.144.4",
  // Historical probe/control modules still read this field. The new acceptance
  // invocation never consumes it and rejects every --sandbox argument.
  sandbox: "read-only",
  preflightLeaseMs: 120_000,
  criticLeaseMs: 300_000,
  sourceReference: Object.freeze({
    tag: "rust-v0.144.4",
    commit: "8c68d4c87dc54d38861f5114e920c3de2efa5876",
    profileSource: "codex-rs/cli/src/debug_sandbox.rs",
    linuxSandboxSource: "codex-rs/linux-sandbox/src/linux_run_main.rs",
  }),
});

export const CODEX_CRITIC_REVIEW_CONTRACT = Object.freeze({
  schema: "pipeline.codex-critic-review-contract.v1",
  scope: "exact five-artifact profile-bound isolation candidate",
  requirements: Object.freeze([
    "named profile starts root-deny, permits only minimal runtime, exact fixture and exact pinned runtime release reads, grants no writes, and disables command network",
    "profile-bound invocation is gpt-5.6-sol/max, approval never, ephemeral, strict, user config/rules ignored, web disabled, shell environment inherit none, and contains no legacy --sandbox",
    "fixture and stdin bundle contain all five exact Git-object artifacts with complete bounded UTF-8 content and commit/tree/blob/hash binding",
    "preflight is direct, categorical, lease-bounded, and proves fixture read, synthetic external read denial, fixture write denial, unchanged canaries, and cleanup",
    "JSONL is closed-allowlist and tool-free; result is schema-valid, replay-bound, clean pass=true, and every failure is fail-closed",
    "public evidence contains only hashes, categories and bounded process facts, without prompt, stream, raw verdict, absolute paths, credentials, or private coordinates",
  ]),
});

export const CODEX_CRITIC_ARTIFACTS = Object.freeze([
  "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "harness/scripts/verify.mjs",
]);

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isFullSha(value) { return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value); }
function assertAbsolute(value, label) { if (typeof value !== "string" || !path.isAbsolute(value)) fail(`${label} must be absolute`); }
function assertSafeRelative(value, label) { if (typeof value !== "string" || !SAFE_RELATIVE.test(value)) fail(`${label} must be a normalized relative path`); }
function tomlString(value) { return JSON.stringify(value); }
function normalizedPath(value) { return path.resolve(value); }
function pathsOverlap(left, right) {
  const a = normalizedPath(left); const b = normalizedPath(right);
  return a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function canonical(value) { return `${JSON.stringify(canonicalize(value))}\n`; }
function invocationHash(command, args) { return sha256(canonical({ command, args })); }
function reviewContractHash() { return sha256(canonical(CODEX_CRITIC_REVIEW_CONTRACT)); }

// Kept inside this exact reviewed artifact so acceptance never executes an
// unbound worktree validator dependency. It intentionally implements only the
// schema keywords used by critic-verdict.schema.json and the bound wrapper.
function jsonType(value) { return value === null ? "null" : Array.isArray(value) ? "array" : typeof value; }
function validateNode(value, schema, at, errors) {
  const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !expected.includes(jsonType(value))) { errors.push(`${at}: invalid type`); return; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: value outside enum`);
  if (schema.type === "object") {
    const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    for (const required of schema.required ?? []) if (!Object.hasOwn(object, required)) errors.push(`${at}: missing ${required}`);
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(object, key)) validateNode(object[key], childSchema, `${at}.${key}`, errors);
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(object)) {
      if (allowed.has(key)) continue;
      if (schema.additionalProperties === false) errors.push(`${at}: unexpected ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateNode(object[key], schema.additionalProperties, `${at}.${key}`, errors);
    }
  }
  if (schema.type === "array" && schema.items) for (const [index, item] of (Array.isArray(value) ? value : []).entries()) validateNode(item, schema.items, `${at}[${index}]`, errors);
}
function validateAgainstBoundSchema(value, schema) { const errors = []; validateNode(value, schema, "$", errors); return Object.freeze({ valid: errors.length === 0, errors }); }

export function sanitizeEnvironment(env = process.env) {
  const clean = {};
  for (const [key, value] of Object.entries(env)) {
    if (!SAFE_ENV.has(key) || DENIED_ENV.test(key) || typeof value !== "string") continue;
    clean[key] = value;
  }
  if (!clean.PATH) fail("minimal Codex environment requires PATH");
  return Object.freeze(clean);
}

function escapeDebugControl(character) {
  const code = character.codePointAt(0);
  if (code === 0x08) return "\\b";
  if (code === 0x09) return "\\t";
  if (code === 0x0a) return "\\n";
  if (code === 0x0b) return "\\v";
  if (code === 0x0c) return "\\f";
  if (code === 0x0d) return "\\r";
  return code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`;
}

function assertDebugPrivateValues(values, label) {
  if (!Array.isArray(values) || values.length > 32) fail(`${label} must be a bounded array`);
  for (const value of values) if (typeof value !== "string" || value.length < 2 || Buffer.byteLength(value, "utf8") > 512 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) fail(`${label} contains an invalid literal`);
  return Object.freeze([...new Set(values.map((value) => value.normalize("NFKC")))].sort((left, right) => right.length - left.length));
}

function escapeDebugRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

function debugLiteralPattern(literal, platformPath) {
  if (!platformPath) return escapeDebugRegExp(literal);
  let source = "";
  let offset = 0;
  for (const match of literal.matchAll(/[\\/]+/gu)) {
    source += escapeDebugRegExp(literal.slice(offset, match.index));
    source += String.raw`[\\/]+`;
    offset = match.index + match[0].length;
  }
  return source + escapeDebugRegExp(literal.slice(offset));
}

function replaceDebugLiterals(value, literals, marker, { platformPath = false } = {}) {
  let result = value;
  for (const literal of literals) result = result.replace(new RegExp(debugLiteralPattern(literal, platformPath), "giu"), marker);
  return result;
}

function sanitizeDebugLine(line, { privateIdentifiers = [], privateRoots = [] } = {}) {
  const markers = [DEBUG_REDACTED_SECRET, DEBUG_REDACTED_URL, DEBUG_REDACTED_QUERY, DEBUG_REDACTED_FRAGMENT, DEBUG_REDACTED_PATH, DEBUG_REDACTED_IDENTIFIER];
  const protectedMarkers = markers.map((_marker, index) => `__PIPELINE_MARKER_${index}__`);
  let protectedLine = line.normalize("NFKC");
  for (const [index, marker] of markers.entries()) protectedLine = protectedLine.replaceAll(marker, protectedMarkers[index]);
  const escaped = protectedLine.replace(DEBUG_CONTROLS, escapeDebugControl);
  const privateSafe = replaceDebugLiterals(replaceDebugLiterals(escaped, privateRoots, DEBUG_REDACTED_PATH, { platformPath: true }), privateIdentifiers, DEBUG_REDACTED_IDENTIFIER);
  const secrets = privateSafe
    .replace(DEBUG_AUTHORIZATION, `$1${DEBUG_REDACTED_SECRET}`)
    .replace(DEBUG_BEARER, `$1${DEBUG_REDACTED_SECRET}`)
    .replace(DEBUG_COOKIE, `$1${DEBUG_REDACTED_SECRET}`)
    .replace(DEBUG_NAMED_SECRET, `$1${DEBUG_REDACTED_SECRET}`)
    .replace(DEBUG_NAMED_SECRET_SPACE, `$1${DEBUG_REDACTED_SECRET}`)
    .replace(DEBUG_BARE_TOKEN, DEBUG_REDACTED_SECRET)
    .replace(DEBUG_JWT, DEBUG_REDACTED_SECRET);
  const urls = secrets
    .replace(DEBUG_ABSOLUTE_URL, (_match, scheme) => `${scheme}://${DEBUG_REDACTED_URL}`)
    .replace(DEBUG_RELATIVE_URL_QUERY, (_match, prefix, base, _query, fragment) => `${prefix}${base}?${DEBUG_REDACTED_QUERY}${fragment === undefined ? "" : `#${DEBUG_REDACTED_FRAGMENT}`}`)
    .replace(DEBUG_RELATIVE_URL_FRAGMENT, (_match, prefix, base) => `${prefix}${base}#${DEBUG_REDACTED_FRAGMENT}`);
  let sanitized = urls
    .replace(DEBUG_UNC_PATH, DEBUG_REDACTED_PATH)
    .replace(DEBUG_WINDOWS_PATH, DEBUG_REDACTED_PATH)
    .replace(DEBUG_UNIX_PATH, DEBUG_REDACTED_PATH);
  for (const [index, marker] of markers.entries()) sanitized = sanitized.replaceAll(protectedMarkers[index], marker);
  return sanitized;
}

/**
 * Creates an isolated streaming redactor for local debug lines. `write` accepts
 * Buffer chunks and returns only complete sanitized lines; `finish` explicitly
 * flushes a final unterminated line. Returned arrays and the writer are frozen,
 * and no raw complete line is retained after an emission.
 */
export function createDebugLineRedactor({ maxPendingBytes = DEFAULT_DEBUG_PENDING_BYTES, maxOutputBytes = DEFAULT_DEBUG_OUTPUT_BYTES, privateIdentifiers = [], privateRoots = [] } = {}) {
  if (![maxPendingBytes, maxOutputBytes].every((value) => Number.isSafeInteger(value) && value > 0)) fail("debug line redactor limits must be positive safe integers");
  if (maxPendingBytes > DEFAULT_DEBUG_PENDING_BYTES || maxOutputBytes > DEFAULT_DEBUG_OUTPUT_BYTES) fail("debug line redactor limits exceed their closed maxima");
  const identifiers = assertDebugPrivateValues(privateIdentifiers, "debug privateIdentifiers");
  const roots = assertDebugPrivateValues(privateRoots, "debug privateRoots");
  let decoder = new StringDecoder("utf8");
  let pending = "";
  let pendingBytes = 0;
  let outputBytes = 0;
  let state = "open";

  function requireOpen() {
    if (state !== "open") fail("debug line redactor is closed");
  }

  function overflow() {
    pending = "";
    pendingBytes = 0;
    decoder = null;
    state = "failed";
    throw new RangeError("debug line redactor limit exceeded");
  }

  function addInput(segment) {
    pendingBytes += segment.length;
    if (pendingBytes > maxPendingBytes) overflow();
    pending += decoder.write(segment);
  }

  function emitComplete(lines, emittedBytes) {
    pending += decoder.end();
    const complete = pending.endsWith("\r") ? pending.slice(0, -1) : pending;
    pending = "";
    pendingBytes = 0;
    decoder = new StringDecoder("utf8");
    const sanitized = sanitizeDebugLine(complete, { privateIdentifiers: identifiers, privateRoots: roots });
    const nextBytes = emittedBytes + Buffer.byteLength(sanitized, "utf8") + 1;
    if (outputBytes + nextBytes > maxOutputBytes) overflow();
    lines.push(sanitized);
    return nextBytes;
  }

  function write(chunk) {
    requireOpen();
    if (!Buffer.isBuffer(chunk)) fail("debug line redactor accepts Buffer chunks only");
    const lines = [];
    let emittedBytes = 0;
    let offset = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline === -1) break;
      addInput(chunk.subarray(offset, newline));
      emittedBytes = emitComplete(lines, emittedBytes);
      offset = newline + 1;
    }
    addInput(chunk.subarray(offset));
    outputBytes += emittedBytes;
    return Object.freeze(lines);
  }

  function finish() {
    requireOpen();
    const lines = [];
    let emittedBytes = 0;
    if (pendingBytes > 0) emittedBytes = emitComplete(lines, emittedBytes);
    else decoder.end();
    outputBytes += emittedBytes;
    pending = "";
    pendingBytes = 0;
    decoder = null;
    state = "finished";
    return Object.freeze(lines);
  }

  return Object.freeze({ write, finish });
}

function isPlainTraceObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function assertTraceKeys(value, required, optional = []) {
  if (!isPlainTraceObject(value)) fail("trace payload must be a plain object");
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`trace payload is missing ${key}`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`trace payload has unexpected ${key}`);
}

function assertTraceSafeInteger(value, label, { nonnegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) fail(`${label} must be ${nonnegative ? "a nonnegative " : "a "}safe integer`);
}

function assertTraceCategory(value, label = "trace category") {
  if (typeof value !== "string" || !TRACE_CATEGORY.test(value)) fail(`${label} is invalid`);
}

function assertTraceSha256(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !TRACE_SHA256.test(value)) fail(`${label} must be a lowercase SHA-256`);
}

function assertTraceSignal(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !TRACE_SIGNALS.has(value)) fail(`${label} is outside the signal enum`);
}

function validateTracePayload(event, payload, { terminal = false, privateIdentifiers = [], privateRoots = [] } = {}) {
  if (!TRACE_EVENT_SET.has(event)) fail("trace event is outside the closed enum");
  if (event === "trace.opened" || event === "run.started" || event === "stdin.end-requested" || event === "stdin.closed") {
    assertTraceKeys(payload, []);
  } else if (event === "run.completed" || event === "run.failed") {
    assertTraceKeys(payload, ["cause"]);
    if (!TRACE_CAUSES.has(payload.cause)) fail("trace run cause is outside the closed enum");
  } else if (event.startsWith("step.")) {
    assertTraceKeys(payload, ["step"]);
    if (!TRACE_STEP_SET.has(payload.step)) fail("trace step is outside the closed enum");
  } else if (event === "child.spawn-requested") {
    assertTraceKeys(payload, ["label"]); assertTraceCategory(payload.label, "child label");
  } else if (event === "child.spawned") {
    assertTraceKeys(payload, ["label", "pid", "pgid"]); assertTraceCategory(payload.label, "child label");
    assertTraceSafeInteger(payload.pid, "child pid", { nonnegative: true }); assertTraceSafeInteger(payload.pgid, "child pgid", { nonnegative: true });
  } else if (event === "child.spawn-failed") {
    assertTraceKeys(payload, ["label", "category"]); assertTraceCategory(payload.label, "child label"); assertTraceCategory(payload.category);
  } else if (event === "child.error") {
    assertTraceKeys(payload, ["label", "category"]); assertTraceCategory(payload.label, "child label"); assertTraceCategory(payload.category);
  } else if (event === "child.exit" || event === "child.close") {
    assertTraceKeys(payload, ["label", "code", "signal"]); assertTraceCategory(payload.label, "child label");
    if (payload.code !== null) assertTraceSafeInteger(payload.code, "child exit code");
    assertTraceSignal(payload.signal, "child signal", { nullable: true });
  } else if (event === "child.signal-requested" || event === "child.signal-result") {
    const required = event === "child.signal-result" ? ["label", "signal", "category"] : ["label", "signal"];
    assertTraceKeys(payload, required, ["pid", "pgid"]); assertTraceCategory(payload.label, "child label"); assertTraceSignal(payload.signal, "child signal");
    if (Object.hasOwn(payload, "category")) assertTraceCategory(payload.category);
    for (const key of ["pid", "pgid"]) if (Object.hasOwn(payload, key)) assertTraceSafeInteger(payload[key], `child ${key}`, { nonnegative: true });
  } else if (event === "stdin.write-requested") {
    assertTraceKeys(payload, ["bytes", "sha256"]); assertTraceSafeInteger(payload.bytes, "stdin bytes", { nonnegative: true }); assertTraceSha256(payload.sha256, "stdin sha256");
  } else if (event === "stdin.write-accepted") {
    assertTraceKeys(payload, ["bytes"]); assertTraceSafeInteger(payload.bytes, "stdin bytes", { nonnegative: true });
  } else if (event === "stdin.error") {
    assertTraceKeys(payload, ["category"]); assertTraceCategory(payload.category);
  } else if (event === "stream.chunk") {
    assertTraceKeys(payload, ["stream", "bytes", "cumulativeBytes", "sha256"]);
    if (payload.stream !== "stdout" && payload.stream !== "stderr") fail("trace stream is outside the closed enum");
    assertTraceSafeInteger(payload.bytes, "stream bytes", { nonnegative: true }); assertTraceSafeInteger(payload.cumulativeBytes, "stream cumulativeBytes", { nonnegative: true });
    if (payload.cumulativeBytes < payload.bytes) fail("stream cumulativeBytes cannot be smaller than bytes");
    assertTraceSha256(payload.sha256, "stream sha256");
  } else if (event === "stream.jsonl-event") {
    assertTraceKeys(payload, ["type", "itemType", "status"]);
    if (!TRACE_JSONL_TYPES.has(payload.type) || !TRACE_ITEM_TYPES.has(payload.itemType) || !TRACE_ITEM_STATUSES.has(payload.status)) fail("trace JSONL lifecycle value is outside the closed enum");
  } else if (event === "stream.diagnostic") {
    assertTraceKeys(payload, ["stream", "line"]);
    if (payload.stream !== "stderr") fail("trace diagnostic stream is outside the closed enum");
    if (typeof payload.line !== "string" || Buffer.byteLength(payload.line, "utf8") > DEBUG_DIAGNOSTIC_BYTES || payload.line !== sanitizeDebugLine(payload.line, { privateIdentifiers, privateRoots })) fail("trace diagnostic line is not bounded sanitized text");
  } else if (event === "stream.error") {
    assertTraceKeys(payload, ["stream", "category"]);
    if (payload.stream !== "stdout" && payload.stream !== "stderr") fail("trace stream is outside the closed enum");
    assertTraceCategory(payload.category);
  } else if (event === "process.sample") {
    assertTraceKeys(payload, ["availability"], ["state", "cpuUserTicks", "cpuSystemTicks", "rssPages", "fdCount", "wchanSha256", "category"]);
    if (payload.availability !== "observed" && payload.availability !== "unavailable") fail("process availability is outside the closed enum");
    const observations = ["state", "cpuUserTicks", "cpuSystemTicks", "rssPages", "fdCount", "wchanSha256"];
    if (payload.availability === "unavailable" && observations.some((key) => Object.hasOwn(payload, key))) fail("unavailable process sample cannot contain observations");
    if (Object.hasOwn(payload, "state") && !TRACE_PROCESS_STATES.has(payload.state)) fail("process state is outside the closed enum");
    for (const key of ["cpuUserTicks", "cpuSystemTicks", "rssPages", "fdCount"]) if (Object.hasOwn(payload, key)) assertTraceSafeInteger(payload[key], `process ${key}`, { nonnegative: true });
    if (Object.hasOwn(payload, "wchanSha256")) assertTraceSha256(payload.wchanSha256, "process wchanSha256");
    if (Object.hasOwn(payload, "category")) assertTraceCategory(payload.category);
  } else if (event.startsWith("lease.")) {
    assertTraceKeys(payload, ["label", "elapsedMs", "stdoutBytes", "stderrBytes"]); assertTraceCategory(payload.label, "lease label");
    for (const key of ["elapsedMs", "stdoutBytes", "stderrBytes"]) assertTraceSafeInteger(payload[key], `lease ${key}`, { nonnegative: true });
  } else if (event === "result.observed") {
    assertTraceKeys(payload, ["present", "bytes", "sha256"]);
    if (typeof payload.present !== "boolean") fail("result present must be boolean");
    assertTraceSafeInteger(payload.bytes, "result bytes", { nonnegative: true }); assertTraceSha256(payload.sha256, "result sha256", { nullable: true });
    if (payload.present !== (payload.sha256 !== null)) fail("result presence and sha256 are inconsistent");
    if (!payload.present && payload.bytes !== 0) fail("absent result must have zero bytes");
  } else if (event === "trace.finalized") {
    if (!terminal) fail("trace.finalized can only be emitted by finalize");
    assertTraceKeys(payload, ["outcome", "cause", "priorRootSha256", "recordCount", "totalBytes"]);
    if (payload.outcome !== "completed" && payload.outcome !== "failed") fail("trace outcome is outside the closed enum");
    if (!TRACE_CAUSES.has(payload.cause)) fail("trace final cause is outside the closed enum");
    assertTraceSha256(payload.priorRootSha256, "trace prior root");
    assertTraceSafeInteger(payload.recordCount, "trace record count", { nonnegative: true }); assertTraceSafeInteger(payload.totalBytes, "trace total bytes", { nonnegative: true });
  }
}

const TRACE_PREFLIGHT_CHILD_LABELS = Object.freeze([
  "profile-preflight-fixture-read", "profile-preflight-external-read-denied", "profile-preflight-write-denied",
]);
const TRACE_PREFLIGHT_CHILD_SET = new Set(TRACE_PREFLIGHT_CHILD_LABELS);

function createTraceReplayState() {
  return {
    phase: "initial", terminal: null, currentStep: null, nextStep: 0, failedStep: null,
    children: new Map(), stdin: "initial", leases: new Map(), resultCount: 0, failureObservedStep: null,
  };
}

function traceChildIsActive(child) {
  return child?.phase === "spawned" || child?.phase === "errored" || child?.phase === "exited";
}

function activeTraceChildren(state) { return [...state.children.entries()].filter(([, child]) => traceChildIsActive(child)); }

function activeTraceChild(state) { return activeTraceChildren(state).length > 0; }

function expectedTraceChildStep(label) {
  if (label === "critic") return "critic";
  if (TRACE_PREFLIGHT_CHILD_SET.has(label)) return "preflight";
  fail("child label is outside the fixed debug-run binding");
}

function requireBoundTraceChild(state, label, event, { active = false } = {}) {
  if (state.currentStep !== expectedTraceChildStep(label)) fail(`${event} child label is outside its bound step`);
  const child = state.children.get(label);
  if (!child || (active && !traceChildIsActive(child))) fail(`${event} lacks its active bound child`);
  return child;
}

function requireOneActiveTraceChild(state, event, { criticOnly = false } = {}) {
  const active = activeTraceChildren(state);
  if (active.length !== 1) fail(`${event} requires exactly one active bound child`);
  const [label, child] = active[0];
  if (state.currentStep !== expectedTraceChildStep(label) || (criticOnly && label !== "critic")) fail(`${event} is outside its active child step`);
  return { label, child };
}

function requireActiveTraceRun(state, event) {
  if (state.phase !== "running") fail(`${event} is outside the active run`);
}

function applyTraceTransition(state, event, payload) {
  if (state.phase === "finalized") fail("trace contains an event after finalization");
  if (event === "trace.opened") {
    if (state.phase !== "initial") fail("trace.opened is duplicated or out of order");
    state.phase = "opened";
    return;
  }
  if (event === "run.started") {
    if (state.phase !== "opened") fail("run.started must occur exactly once after trace.opened");
    state.phase = "running";
    return;
  }
  if (event === "run.completed" || event === "run.failed") {
    if (event === "run.completed") requireActiveTraceRun(state, event);
    else if (state.phase !== "awaiting-run-failure") fail("run.failed requires an exact failed-step prefix");
    if (state.currentStep !== null) fail("run cannot terminate with an active step");
    if ([...state.children.values()].some((child) => child.phase === "requested" || child.phase === "spawned" || child.phase === "errored" || child.phase === "exited")) fail("run cannot terminate before every child closes or fails");
    if ([...state.children.values()].some((child) => child.pendingSignal !== null)) fail("run cannot terminate with an unresolved child signal request");
    if ([...state.leases.values()].some((lease) => lease === "expired" || lease === "signaling")) fail("run cannot terminate before an expired lease signal resolves");
    if (!["initial", "closed", "error"].includes(state.stdin)) fail("run cannot terminate before stdin closes or fails");
    if (event === "run.completed" && (state.failedStep !== null || state.nextStep !== CODEX_CRITIC_TRACE_STEPS.length || state.resultCount !== 1)) fail("run.completed requires the complete fixed debug-run lifecycle");
    state.terminal = { outcome: event === "run.completed" ? "completed" : "failed", cause: payload.cause };
    state.phase = "terminal";
    return;
  }
  if (event === "trace.finalized") {
    if (state.phase !== "terminal" || state.terminal === null) fail("trace.finalized requires exactly one run terminal");
    if (payload.outcome !== state.terminal.outcome || payload.cause !== state.terminal.cause) fail("trace final outcome or cause disagrees with the run terminal");
    state.phase = "finalized";
    return;
  }
  requireActiveTraceRun(state, event);
  if (event.startsWith("step.")) {
    const stepIndex = CODEX_CRITIC_TRACE_STEPS.indexOf(payload.step);
    if (event === "step.started") {
      if (state.currentStep !== null || stepIndex !== state.nextStep) fail("trace step start is duplicated, overlapping, skipped or out of fixed order");
      state.currentStep = payload.step;
    } else {
      if (state.currentStep !== payload.step) fail("trace step terminal lacks its matching start");
      if (activeTraceChild(state) || [...state.children.values()].some((child) => child.phase === "requested")) fail("trace step cannot terminate with an active child");
      if (payload.step === "preflight" && event === "step.completed") {
        if (TRACE_PREFLIGHT_CHILD_LABELS.some((label) => state.children.get(label)?.phase !== "closed" || state.children.get(label)?.spawned !== true)) fail("preflight completion requires its exact three-child cardinality");
        if (TRACE_PREFLIGHT_CHILD_LABELS.some((label) => state.leases.get(label) !== "armed")) fail("preflight completion requires exactly one armed lease for each child");
      }
      if (payload.step === "critic" && event === "step.completed") {
        const critic = state.children.get("critic");
        if (critic?.phase !== "closed" || critic.spawned !== true || state.stdin !== "closed") fail("critic completion requires exactly one closed critic child and stdin");
        if (state.leases.get("critic") !== "armed") fail("critic completion requires exactly one armed critic lease");
      }
      if (payload.step === "result" && state.resultCount !== 1) fail("result step requires exactly one result.observed event");
      if (event === "step.completed" && state.failureObservedStep === payload.step) fail("a step with a closed failure event must end with step.failed");
      state.currentStep = null;
      state.nextStep = stepIndex + 1;
      if (event === "step.failed") {
        state.failedStep = payload.step;
        state.phase = "awaiting-run-failure";
      }
    }
    return;
  }
  if (event === "child.spawn-requested") {
    if (state.currentStep !== expectedTraceChildStep(payload.label)) fail("child spawn request is outside its bound step");
    if (state.children.has(payload.label)) fail("child spawn request is duplicated");
    if (activeTraceChild(state) || [...state.children.values()].some((child) => child.phase === "requested")) fail("child spawn requests must be serial and cardinality-bound");
    state.children.set(payload.label, { phase: "requested", pendingSignal: null, spawned: false });
    return;
  }
  if (event === "child.spawned" || event === "child.spawn-failed") {
    const child = requireBoundTraceChild(state, payload.label, event);
    if (child?.phase !== "requested") fail(`${event} lacks its spawn request`);
    child.phase = event === "child.spawned" ? "spawned" : "failed";
    child.spawned = event === "child.spawned";
    if (event === "child.spawn-failed") state.failureObservedStep = state.currentStep;
    return;
  }
  if (event === "child.exit") {
    const child = requireBoundTraceChild(state, payload.label, event);
    if (!child || !["spawned", "errored"].includes(child.phase)) fail("child.exit lacks one live spawned child");
    child.phase = "exited";
    return;
  }
  if (event === "child.error") {
    const child = requireBoundTraceChild(state, payload.label, event);
    if (!child || child.phase !== "spawned") fail("child.error lacks one spawned child or is duplicated");
    child.phase = "errored";
    state.failureObservedStep = state.currentStep;
    return;
  }
  if (event === "child.close") {
    const child = requireBoundTraceChild(state, payload.label, event);
    if (!child || !["exited", "errored"].includes(child.phase)) fail("child.close must follow child.exit or child.error");
    if (state.leases.get(payload.label) === undefined && state.failureObservedStep !== state.currentStep) fail("completed child requires exactly one armed lease");
    child.phase = "closed";
    return;
  }
  if (event === "child.signal-requested") {
    const child = requireBoundTraceChild(state, payload.label, event, { active: true });
    if (!child || !["spawned", "errored", "exited"].includes(child.phase) || child.pendingSignal !== null) fail("child signal request is out of order");
    child.pendingSignal = payload.signal;
    if (state.leases.get(payload.label) === "expired") state.leases.set(payload.label, "signaling");
    return;
  }
  if (event === "child.signal-result") {
    const child = requireBoundTraceChild(state, payload.label, event, { active: true });
    if (!child || child.pendingSignal !== payload.signal) fail("child signal result lacks its matching request");
    child.pendingSignal = null;
    if (state.leases.get(payload.label) === "signaling") state.leases.set(payload.label, "handled");
    return;
  }
  if (event === "stdin.write-requested") {
    requireOneActiveTraceChild(state, event, { criticOnly: true });
    if (state.stdin !== "initial") fail("stdin write request is out of order");
    state.stdin = "requested";
    return;
  }
  if (event === "stdin.write-accepted") {
    requireOneActiveTraceChild(state, event, { criticOnly: true });
    if (state.stdin !== "requested") fail("stdin write acceptance lacks its request");
    state.stdin = "accepted";
    return;
  }
  if (event === "stdin.end-requested") {
    requireOneActiveTraceChild(state, event, { criticOnly: true });
    if (state.stdin !== "accepted") fail("stdin end request lacks an accepted write");
    state.stdin = "ending";
    return;
  }
  if (event === "stdin.closed") {
    requireOneActiveTraceChild(state, event, { criticOnly: true });
    if (state.stdin !== "ending") fail("stdin close is out of order");
    state.stdin = "closed";
    return;
  }
  if (event === "stdin.error") {
    requireOneActiveTraceChild(state, event, { criticOnly: true });
    if (!["requested", "accepted", "ending"].includes(state.stdin)) fail("stdin error is out of order");
    state.stdin = "error";
    state.failureObservedStep = state.currentStep;
    return;
  }
  if (event === "stream.chunk" || event === "stream.jsonl-event" || event === "stream.diagnostic" || event === "stream.error" || event === "process.sample") {
    requireOneActiveTraceChild(state, event);
    if (event === "stream.error") state.failureObservedStep = state.currentStep;
    return;
  }
  if (event.startsWith("lease.")) {
    const child = requireBoundTraceChild(state, payload.label, event, { active: true });
    const lease = state.leases.get(payload.label) ?? "initial";
    if (event === "lease.armed") {
      if (lease !== "initial") fail("lease arm is duplicated");
      state.leases.set(payload.label, "armed");
    } else if (event === "lease.heartbeat") {
      if (lease !== "armed") fail("lease heartbeat is outside an armed lease");
    } else {
      if (lease !== "armed") fail("lease expiry is outside an armed lease");
      state.leases.set(payload.label, "expired");
      state.failureObservedStep = state.currentStep;
    }
    return;
  }
  if (event === "result.observed") {
    if (state.currentStep !== "result" || state.resultCount !== 0) fail("result.observed must occur exactly once inside the result step");
    state.resultCount = 1;
    if (!payload.present) state.failureObservedStep = state.currentStep;
    return;
  }
  fail("trace event has no lifecycle transition");
}

function traceStatBigInt(value) { return typeof value === "bigint" ? value : BigInt(value); }
function traceStatSize(info) {
  const size = Number(info.size);
  if (!Number.isSafeInteger(size) || size < 0) fail("trace size is outside the safe bound");
  return size;
}
function traceBinding(info) { return Object.freeze({ dev: String(info.dev), ino: String(info.ino) }); }
function sameTraceBinding(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }

function validateTraceStat(info, expectedBinding = null) {
  if (!info.isFile()) fail("trace target is not a regular file");
  if ((traceStatBigInt(info.mode) & 0o777n) !== 0o600n) fail("trace target mode is not 0600");
  if (traceStatBigInt(info.nlink) !== 1n) fail("trace target link count is not one");
  const binding = traceBinding(info);
  if (expectedBinding && !sameTraceBinding(binding, expectedBinding)) fail("trace device/inode binding changed");
  return Object.freeze({ binding, size: traceStatSize(info) });
}

function traceIo(overrides = {}) {
  return Object.freeze({ open: overrides.open ?? open, lstat: overrides.lstat ?? lstat, realpath: overrides.realpath ?? realpath });
}

async function assertTraceParents(tracePath, io) {
  const parent = path.dirname(tracePath);
  const parsed = path.parse(parent);
  let current = parsed.root;
  const relative = parent.slice(parsed.root.length);
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await io.lstat(current);
    if (info.isSymbolicLink()) fail("trace parent contains a symbolic link");
    if (!info.isDirectory()) fail("trace parent component is not a directory");
  }
}

async function canonicalTraceRoot(value, label, io) {
  assertAbsolute(value, label);
  const resolved = path.resolve(value);
  let canonicalRoot;
  try { canonicalRoot = await io.realpath(resolved); }
  catch (error) { throw new Error(`${label} must exist for trace exclusion`, { cause: error }); }
  return canonicalRoot;
}

function traceInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function validateTraceLocation({ tracePath, repoRoot, fixtureRoot, forbiddenRoots = [], target, io }) {
  assertAbsolute(tracePath, "tracePath");
  if (path.resolve(tracePath) !== tracePath) fail("tracePath must be canonical and normalized");
  const tempRoot = await io.realpath(os.tmpdir());
  if (!traceInside(tracePath, tempRoot) || tracePath === tempRoot) fail("tracePath must be below the canonical OS temp directory");
  await assertTraceParents(tracePath, io);
  if (!Array.isArray(forbiddenRoots) || forbiddenRoots.length > 64) fail("forbiddenRoots must be a bounded array");
  const exclusions = [[repoRoot, "repoRoot"], [fixtureRoot, "fixtureRoot"], ...forbiddenRoots.map((value, index) => [value, `forbiddenRoots[${index}]`])];
  const seen = new Set();
  for (const [value, label] of exclusions) {
    if (value === undefined || value === null) continue;
    const excluded = await canonicalTraceRoot(value, label, io);
    if (seen.has(excluded)) continue;
    seen.add(excluded);
    if (traceInside(tracePath, excluded)) fail(`tracePath must be outside ${label}`);
  }
  try {
    const info = await io.lstat(tracePath);
    if (info.isSymbolicLink()) fail("trace target cannot be a symbolic link");
    if (target === "absent") fail("trace target must be absent");
    if (!info.isFile()) fail("trace target is not a regular file");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (target === "present") fail("trace target is missing");
  }
}

function traceWallTime(now) {
  const value = now();
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || new Date(text).toISOString() !== text) fail("trace wall time is invalid");
  return text;
}

function traceMonotonicTime(monotonicNow, previous) {
  let value;
  try { value = BigInt(monotonicNow()); }
  catch (error) { throw new Error("trace monotonic clock is invalid", { cause: error }); }
  if (value < 0n || (previous !== null && value < previous)) fail("trace monotonic clock moved backwards");
  return value;
}

function traceRecordWithoutHash({ seq, wallTime, monotonicNs, event, payload, previousSha256 }) {
  return { seq, wall_time: wallTime, monotonic_ns: monotonicNs.toString(), event, payload, previous_sha256: previousSha256 };
}

function traceRecord(fields) {
  const withoutHash = traceRecordWithoutHash(fields);
  return { ...withoutHash, record_sha256: sha256(JSON.stringify(withoutHash)) };
}

function traceLine(record) { return Buffer.from(`${JSON.stringify(record)}\n`, "utf8"); }

async function writeTraceBuffer(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const result = await handle.write(buffer, offset, buffer.length - offset, position + offset);
    if (!Number.isSafeInteger(result?.bytesWritten) || result.bytesWritten <= 0 || result.bytesWritten > buffer.length - offset) fail("trace write returned an invalid byte count");
    offset += result.bytesWritten;
  }
}

async function readBoundedTrace(handle, maxBytes) {
  const parts = [];
  let position = 0;
  while (position <= maxBytes) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - position));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > chunk.length) fail("trace read returned an invalid byte count");
    if (bytesRead === 0) break;
    parts.push(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (position > maxBytes) fail("trace byte bound exceeded");
  return Buffer.concat(parts, position);
}

function assertTraceRecordSchema(record, privacy) {
  assertTraceKeys(record, ["seq", "wall_time", "monotonic_ns", "event", "payload", "previous_sha256", "record_sha256"]);
  assertTraceSafeInteger(record.seq, "trace sequence", { nonnegative: true });
  if (record.seq < 1) fail("trace sequence must start at one");
  traceWallTime(() => record.wall_time);
  if (typeof record.monotonic_ns !== "string" || !TRACE_MONOTONIC_NS.test(record.monotonic_ns)) fail("trace monotonic_ns is invalid");
  if (record.previous_sha256 !== null) assertTraceSha256(record.previous_sha256, "trace previous_sha256");
  assertTraceSha256(record.record_sha256, "trace record_sha256");
  validateTracePayload(record.event, record.payload, { terminal: record.event === "trace.finalized", ...privacy });
}

function verifyTraceRecords(buffer, maxEvents, privacy) {
  if (buffer.length === 0 || buffer.at(-1) !== 0x0a) fail("trace is truncated or lacks a final newline");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch (error) { throw new Error("trace is not valid UTF-8", { cause: error }); }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > maxEvents) fail("trace event bound exceeded");
  let previousHash = null;
  let previousMonotonic = null;
  const records = [];
  const replay = createTraceReplayState();
  for (const [index, line] of lines.entries()) {
    let record;
    try { record = JSON.parse(line); }
    catch (error) { throw new Error("trace contains invalid JSONL", { cause: error }); }
    assertTraceRecordSchema(record, privacy);
    if (record.seq !== index + 1) fail("trace sequence is not contiguous");
    if (record.previous_sha256 !== previousHash) fail("trace hash chain predecessor is inconsistent");
    const monotonic = BigInt(record.monotonic_ns);
    if (previousMonotonic !== null && monotonic < previousMonotonic) fail("trace monotonic time decreased");
    const expected = traceRecord({ seq: record.seq, wallTime: record.wall_time, monotonicNs: monotonic, event: record.event, payload: record.payload, previousSha256: record.previous_sha256 });
    if (record.record_sha256 !== expected.record_sha256 || line !== JSON.stringify(expected)) fail("trace record hash or serialization is inconsistent");
    if (index === 0 && record.event !== "trace.opened") fail("trace.opened must be the first record");
    if (index > 0 && record.event === "trace.opened") fail("trace.opened can only occur once");
    if (index < lines.length - 1 && record.event === "trace.finalized") fail("trace.finalized must be terminal");
    applyTraceTransition(replay, record.event, record.payload);
    previousHash = record.record_sha256;
    previousMonotonic = monotonic;
    records.push(record);
  }
  const terminal = records.at(-1);
  if (!terminal || terminal.event !== "trace.finalized") fail("trace is missing its final record");
  const prior = records.at(-2)?.record_sha256;
  if (!prior || terminal.payload.priorRootSha256 !== prior || terminal.previous_sha256 !== prior) fail("trace final prior root is inconsistent");
  if (terminal.payload.recordCount !== records.length) fail("trace final record count is inconsistent");
  if (terminal.payload.totalBytes !== buffer.length) fail("trace final byte count is inconsistent");
  return Object.freeze({ records: Object.freeze(records), rootSha256: terminal.record_sha256, priorRootSha256: prior, outcome: terminal.payload.outcome, cause: terminal.payload.cause });
}

export async function verifySecureTraceStore({ tracePath, binding, repoRoot, fixtureRoot, forbiddenRoots = [], maxBytes = DEFAULT_TRACE_BYTES, maxEvents = DEFAULT_TRACE_EVENTS, privateIdentifiers = [], privateRoots = [], io: ioOverrides = {} } = {}) {
  if (!binding || typeof binding.dev !== "string" || typeof binding.ino !== "string") fail("trace verification requires the original device/inode binding");
  for (const [value, label] of [[maxBytes, "trace byte bound"], [maxEvents, "trace event bound"]]) assertTraceSafeInteger(value, label, { nonnegative: true });
  if (maxBytes < 1 || maxEvents < 2) fail("trace verification bounds are too small");
  const privacy = Object.freeze({ privateIdentifiers: assertDebugPrivateValues(privateIdentifiers, "trace privateIdentifiers"), privateRoots: assertDebugPrivateValues(privateRoots, "trace privateRoots") });
  const io = traceIo(ioOverrides);
  await validateTraceLocation({ tracePath, repoRoot, fixtureRoot, forbiddenRoots, target: "present", io });
  const handle = await io.open(tracePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = validateTraceStat(await handle.stat({ bigint: true }), binding);
    if (before.size > maxBytes) fail("trace byte bound exceeded");
    const buffer = await readBoundedTrace(handle, maxBytes);
    const after = validateTraceStat(await handle.stat({ bigint: true }), binding);
    if (before.size !== after.size || buffer.length !== after.size) fail("trace size changed during verification");
    const pathInfo = validateTraceStat(await io.lstat(tracePath), binding);
    if (pathInfo.size !== after.size) fail("trace path size is inconsistent");
    const checked = verifyTraceRecords(buffer, maxEvents, privacy);
    return Object.freeze({ ok: true, binding, bytes: buffer.length, recordCount: checked.records.length, rootSha256: checked.rootSha256, priorRootSha256: checked.priorRootSha256, outcome: checked.outcome, cause: checked.cause });
  } finally {
    await handle.close();
  }
}

export async function createSecureTraceStore({ tracePath, repoRoot, fixtureRoot, forbiddenRoots = [], maxBytes = DEFAULT_TRACE_BYTES, maxEvents = DEFAULT_TRACE_EVENTS, privateIdentifiers = [], privateRoots = [], now = () => new Date().toISOString(), monotonicNow = process.hrtime.bigint, io: ioOverrides = {} } = {}) {
  for (const [value, label] of [[maxBytes, "trace byte bound"], [maxEvents, "trace event bound"]]) assertTraceSafeInteger(value, label, { nonnegative: true });
  if (maxBytes < 1 || maxEvents < 2) fail("trace store bounds are too small");
  if (typeof now !== "function" || typeof monotonicNow !== "function") fail("trace clocks must be functions");
  const privacy = Object.freeze({ privateIdentifiers: assertDebugPrivateValues(privateIdentifiers, "trace privateIdentifiers"), privateRoots: assertDebugPrivateValues(privateRoots, "trace privateRoots") });
  const io = traceIo(ioOverrides);
  await validateTraceLocation({ tracePath, repoRoot, fixtureRoot, forbiddenRoots, target: "absent", io });
  let handle;
  try {
    handle = await io.open(tracePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const opened = validateTraceStat(await handle.stat({ bigint: true }));
    await assertTraceParents(tracePath, io);
    if (await io.realpath(tracePath) !== tracePath) fail("created trace path is not canonical");
    validateTraceStat(await io.lstat(tracePath), opened.binding);

    let state = "open";
    let count = 0;
    let bytes = 0;
    let previousHash = null;
    let previousMonotonic = null;
    let replay = createTraceReplayState();
    let failure = null;
    let tail = Promise.resolve();

    async function poison(error) {
      failure = error instanceof Error ? error : new Error(String(error));
      state = "failed";
      try { await handle.close(); } catch { /* The original store failure remains authoritative. */ }
    }

    async function operation(action) {
      const result = tail.then(async () => {
        if (state !== "open") throw failure ?? new Error("trace store is closed");
        try { return await action(); }
        catch (error) { await poison(error); throw error; }
      });
      tail = result.catch(() => {});
      return result;
    }

    async function rollbackGuardedAppend(size) {
      let rollbackHandle = handle;
      let closeRollbackHandle = false;
      if (typeof rollbackHandle.truncate !== "function") {
        rollbackHandle = await io.open(tracePath, constants.O_WRONLY | constants.O_NOFOLLOW);
        closeRollbackHandle = true;
      }
      try {
        validateTraceStat(await rollbackHandle.stat({ bigint: true }), opened.binding);
        await rollbackHandle.truncate(size);
        if (typeof rollbackHandle.datasync === "function") await rollbackHandle.datasync();
        else await rollbackHandle.sync();
      } finally {
        if (closeRollbackHandle) await rollbackHandle.close();
      }
      const restored = validateTraceStat(await handle.stat({ bigint: true }), opened.binding);
      if (restored.size !== size) fail("trace guarded append rollback is inconsistent");
    }

    async function emit(event, payload, { terminal = false, guard = null, onCommit = null } = {}) {
      validateTracePayload(event, payload, { terminal, ...privacy });
      const priorReplay = guard === null ? null : structuredClone(replay);
      applyTraceTransition(replay, event, payload);
      const nextCount = count + 1;
      if (nextCount > maxEvents) fail("trace event bound exceeded");
      const monotonic = traceMonotonicTime(monotonicNow, previousMonotonic);
      const record = traceRecord({ seq: nextCount, wallTime: traceWallTime(now), monotonicNs: monotonic, event, payload, previousSha256: previousHash });
      const line = traceLine(record);
      if (bytes + line.length > maxBytes) fail("trace byte bound exceeded");
      if (guard !== null && guard() !== true) { replay = priorReplay; return null; }
      await writeTraceBuffer(handle, line, bytes);
      if (guard !== null && guard() !== true) {
        await rollbackGuardedAppend(bytes);
        replay = priorReplay;
        return null;
      }
      count = nextCount;
      bytes += line.length;
      previousHash = record.record_sha256;
      previousMonotonic = monotonic;
      onCommit?.();
      return record;
    }

    await emit("trace.opened", {});

    function append(event, payload) {
      return operation(async () => {
        if (event === "trace.opened" || event === "trace.finalized") fail(`${event} is store-managed`);
        if (event === "stream.diagnostic") fail("stream.diagnostic is observer-managed");
        if (count + 2 > maxEvents) fail("trace event bound leaves no room for finalization");
        const record = await emit(event, payload);
        return Object.freeze({ seq: record.seq, recordSha256: record.record_sha256 });
      });
    }

    function appendDiagnostic(payload) {
      return operation(async () => {
        if (count + 2 > maxEvents) fail("trace event bound leaves no room for finalization");
        const record = await emit("stream.diagnostic", payload);
        return Object.freeze({ seq: record.seq, recordSha256: record.record_sha256 });
      });
    }

    function appendGuarded(event, payload, guard, onCommit) {
      if (typeof guard !== "function" || typeof onCommit !== "function") return Promise.reject(new Error("trace guarded append requires callbacks"));
      return operation(async () => {
        if (event === "trace.opened" || event === "trace.finalized" || event === "stream.diagnostic") fail(`${event} cannot use guarded append`);
        if (count + 2 > maxEvents) fail("trace event bound leaves no room for finalization");
        const record = await emit(event, payload, { guard, onCommit });
        return Object.freeze(record === null ? { committed: false } : { committed: true, seq: record.seq, recordSha256: record.record_sha256 });
      });
    }

    function sync() {
      return operation(async () => {
        if (typeof handle.datasync === "function") await handle.datasync();
        else await handle.sync();
        return Object.freeze({ recordCount: count, bytes, rootSha256: previousHash });
      });
    }

    function finalize({ outcome, cause } = {}) {
      return operation(async () => {
        const finalCount = count + 1;
        if (finalCount > maxEvents) fail("trace event bound exceeded");
        const monotonic = traceMonotonicTime(monotonicNow, previousMonotonic);
        const wallTime = traceWallTime(now);
        const priorRootSha256 = previousHash;
        let predictedBytes = bytes;
        let finalRecord;
        let finalLine;
        for (let iteration = 0; iteration < 16; iteration += 1) {
          const payload = { outcome, cause, priorRootSha256, recordCount: finalCount, totalBytes: predictedBytes };
          validateTracePayload("trace.finalized", payload, { terminal: true, ...privacy });
          finalRecord = traceRecord({ seq: finalCount, wallTime, monotonicNs: monotonic, event: "trace.finalized", payload, previousSha256: priorRootSha256 });
          finalLine = traceLine(finalRecord);
          const actualBytes = bytes + finalLine.length;
          if (actualBytes === predictedBytes) break;
          predictedBytes = actualBytes;
        }
        if (bytes + finalLine.length !== predictedBytes) fail("trace final byte prediction did not converge");
        if (predictedBytes > maxBytes) fail("trace byte bound exceeded");
        applyTraceTransition(replay, "trace.finalized", finalRecord.payload);
        await writeTraceBuffer(handle, finalLine, bytes);
        count = finalCount; bytes = predictedBytes; previousHash = finalRecord.record_sha256; previousMonotonic = monotonic;
        if (typeof handle.datasync === "function") await handle.datasync();
        else await handle.sync();
        await handle.close();
        state = "closed";
        return verifySecureTraceStore({ tracePath, binding: opened.binding, repoRoot, fixtureRoot, forbiddenRoots, maxBytes, maxEvents, ...privacy, io: ioOverrides });
      });
    }

    const store = Object.freeze({ tracePath, binding: opened.binding, append, sync, finalize });
    SECURE_TRACE_STORES.add(store);
    SECURE_TRACE_DIAGNOSTIC_APPENDERS.set(store, appendDiagnostic);
    SECURE_TRACE_GUARDED_APPENDERS.set(store, appendGuarded);
    return store;
  } catch (error) {
    if (handle) { try { await handle.close(); } catch { /* Preserve the creation failure. */ } }
    throw error;
  }
}

function debugErrorCategory(error, fallback) {
  if (error?.code === "EPIPE") return "broken-pipe";
  if (error?.code === "ECONNRESET") return "connection-reset";
  if (error?.code === "ERR_STREAM_DESTROYED") return "stream-destroyed";
  if (error?.code === "ENOENT" || error?.code === "ESRCH") return "not-found";
  if (error?.code === "EACCES" || error?.code === "EPERM") return "permission-denied";
  return fallback;
}

function debugExitCode(value) { return Number.isSafeInteger(value) ? value : null; }
function debugSignal(value) { return typeof value === "string" && TRACE_SIGNALS.has(value) ? value : null; }

function debugJsonlMetadata(bytes) {
  let line;
  try { line = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return Object.freeze({ error: "decode-error", metadata: null }); }
  if (line.endsWith("\r")) line = line.slice(0, -1);
  if (line.length === 0) return Object.freeze({ error: null, metadata: null });
  let value;
  try { value = JSON.parse(line); }
  catch { return Object.freeze({ error: null, metadata: Object.freeze({ type: "unknown", itemType: "unknown", status: "unknown" }) }); }
  const type = TRACE_JSONL_TYPES.has(value?.type) ? value.type : "unknown";
  const itemType = TRACE_ITEM_TYPES.has(value?.item?.type) ? value.item.type : "unknown";
  let status = TRACE_ITEM_STATUSES.has(value?.status) ? value.status : TRACE_ITEM_STATUSES.has(value?.item?.status) ? value.item.status : "unknown";
  if (status === "unknown") {
    if (type.endsWith(".started")) status = "started";
    else if (type.endsWith(".completed")) status = "completed";
    else if (type.endsWith(".failed") || type === "error") status = "failed";
  }
  return Object.freeze({ error: null, metadata: Object.freeze({ type, itemType, status }) });
}

function parseDebugProcInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`debug process ${label} is invalid`);
  return number;
}

async function readDebugProcSample(pid, { readFile: readFileFn = readFile, readdir: readdirFn = readdir } = {}) {
  const proc = `/proc/${pid}`;
  try {
    const [statBytes, statusBytes, wchanBytes, fdEntries] = await Promise.all([
      readFileFn(`${proc}/stat`), readFileFn(`${proc}/status`), readFileFn(`${proc}/wchan`), readdirFn(`${proc}/fd`),
    ]);
    const statText = new TextDecoder("utf-8", { fatal: true }).decode(statBytes);
    const statusText = new TextDecoder("utf-8", { fatal: true }).decode(statusBytes);
    const statSuffix = statText.lastIndexOf(") ");
    if (statSuffix < 1) fail("debug process sample is structurally invalid");
    const suffix = statText.slice(statSuffix + 2).trim().split(/\s+/u);
    const statusPid = /^Pid:\s+([0-9]+)$/mu.exec(statusText)?.[1];
    if (suffix.length < 22 || !TRACE_PROCESS_STATES.has(suffix[0]) || statusPid === undefined || Number(statusPid) !== pid || !Array.isArray(fdEntries)) fail("debug process sample is structurally invalid");
    return Object.freeze({
      availability: "observed",
      state: suffix[0],
      cpuUserTicks: parseDebugProcInteger(suffix[11], "cpuUserTicks"),
      cpuSystemTicks: parseDebugProcInteger(suffix[12], "cpuSystemTicks"),
      rssPages: parseDebugProcInteger(suffix[21], "rssPages"),
      fdCount: parseDebugProcInteger(fdEntries.length, "fdCount"),
      wchanSha256: sha256(wchanBytes),
    });
  } catch (error) {
    return Object.freeze({ availability: "unavailable", category: debugErrorCategory(error, error?.message === "debug process sample is structurally invalid" || String(error?.message).startsWith("debug process ") ? "invalid-sample" : "io-error") });
  }
}

/**
 * Attaches to a child whose spawn request was already durably recorded. The
 * public spawnDebugChildObserver wrapper owns that ordering. Productive
 * execution paths deliberately do not call these debug primitives yet.
 */
export function createDebugChildObserver({
  traceStore, child, label = "critic", privateIdentifiers = [], privateRoots = [], procIo = {},
  observeStdin = true, diagnosticMode = "redacted", onStdoutChunk = () => {}, onStderrChunk = () => {}, onLeaseExpired = () => {},
  clock = () => Number(process.hrtime.bigint() / 1_000_000n),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
} = {}) {
  if (!SECURE_TRACE_STORES.has(traceStore)) fail("debug child observer requires a verified secure trace store");
  if (!child || typeof child.on !== "function" || !child.stdin || !child.stdout || !child.stderr) fail("debug child observer requires one spawned ChildProcess with stdio pipes");
  for (const [stream, name] of [[child.stdin, "stdin"], [child.stdout, "stdout"], [child.stderr, "stderr"]]) if (typeof stream.on !== "function") fail(`debug child observer ${name} is not observable`);
  assertTraceCategory(label, "child label");
  if (typeof observeStdin !== "boolean" || !["redacted", "metadata"].includes(diagnosticMode)) fail("debug child observer mode is invalid");
  if ([onStdoutChunk, onStderrChunk, onLeaseExpired].some((callback) => typeof callback !== "function")) fail("debug child observer callbacks must be functions");
  if (typeof clock !== "function" || typeof setIntervalFn !== "function" || typeof clearIntervalFn !== "function" || typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") fail("debug child observer clocks and timers must be functions");

  const stderrRedactor = createDebugLineRedactor({ maxPendingBytes: DEBUG_DIAGNOSTIC_RAW_BYTES, maxOutputBytes: DEFAULT_DEBUG_OUTPUT_BYTES, privateIdentifiers, privateRoots });
  let tail = Promise.resolve();
  let queueFailure = null;
  let observedFailure = null;
  let accepting = true;
  let stdoutPending = Buffer.alloc(0);
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutFinished = false;
  let stderrFinished = false;
  let stdinClosed = false;
  let stdinFinished = false;
  let stdinFailureCategory = null;
  let stdinErrorRecorded = false;
  let stdinErrorQueued = false;
  let stdinWaiter = null;
  let stdinPhase = "initial";
  let childClosed = false;
  let spawnRecorded = false;
  let spawnPid = null;
  let spawnPgid = null;
  let procTimer = null;
  let leaseTimer = null;
  let leaseStarted = null;
  let leaseArming = false;
  let leaseExpired = false;
  let finishRequested = false;

  function safeFailure() {
    if (observedFailure === null) observedFailure = new Error("debug child observer observed a closed failure category");
  }

  function schedule(action) {
    if (!accepting) {
      const rejected = Promise.reject(queueFailure ?? new Error("debug child observer is closed"));
      rejected.catch(() => {});
      return rejected;
    }
    const operation = tail.then(async () => {
      if (queueFailure) throw queueFailure;
      try { return await action(); }
      catch {
        queueFailure = new Error("debug child observer trace operation failed");
        accepting = false;
        throw queueFailure;
      }
    });
    tail = operation.catch(() => {});
    operation.catch(() => {});
    return operation;
  }

  function append(event, payload) {
    const writer = event === "stream.diagnostic" ? SECURE_TRACE_DIAGNOSTIC_APPENDERS.get(traceStore) : traceStore.append;
    if (typeof writer !== "function") return Promise.reject(new Error("debug child observer diagnostic writer is unavailable"));
    return schedule(() => event === "stream.diagnostic" ? writer(payload) : writer(event, payload));
  }

  function appendStreamChunk(stream, chunk, cumulativeBytes) {
    append("stream.chunk", { stream, bytes: chunk.length, cumulativeBytes, sha256: sha256(chunk) });
  }

  function emitStdoutLine(lineBytes) {
    const parsed = debugJsonlMetadata(lineBytes);
    if (parsed.error) {
      append("stream.error", { stream: "stdout", category: parsed.error });
      safeFailure();
    } else if (parsed.metadata) append("stream.jsonl-event", parsed.metadata);
  }

  function consumeStdout(chunk) {
    if (stdoutFinished || !Buffer.isBuffer(chunk)) { safeFailure(); return; }
    try { onStdoutChunk(chunk); } catch { safeFailure(); }
    stdoutBytes += chunk.length;
    appendStreamChunk("stdout", chunk, stdoutBytes);
    stdoutPending = Buffer.concat([stdoutPending, chunk]);
    for (;;) {
      const newline = stdoutPending.indexOf(0x0a);
      if (newline === -1) break;
      const line = stdoutPending.subarray(0, newline);
      stdoutPending = stdoutPending.subarray(newline + 1);
      emitStdoutLine(line);
    }
    if (stdoutPending.length > DEFAULT_DEBUG_PENDING_BYTES) {
      stdoutPending = Buffer.alloc(0);
      append("stream.error", { stream: "stdout", category: "line-too-long" });
      safeFailure();
    }
  }

  function finishStdout() {
    if (stdoutFinished) return;
    stdoutFinished = true;
    if (stdoutPending.length > 0) emitStdoutLine(stdoutPending);
    stdoutPending = Buffer.alloc(0);
  }

  function emitDiagnosticLines(lines) {
    for (const line of lines) {
      if (Buffer.byteLength(line, "utf8") > DEBUG_DIAGNOSTIC_BYTES) {
        append("stream.error", { stream: "stderr", category: "line-too-long" });
        safeFailure();
        continue;
      }
      append("stream.diagnostic", { stream: "stderr", line });
    }
  }

  function consumeStderr(chunk) {
    if (stderrFinished || !Buffer.isBuffer(chunk)) { safeFailure(); return; }
    try { onStderrChunk(chunk); } catch { safeFailure(); }
    stderrBytes += chunk.length;
    appendStreamChunk("stderr", chunk, stderrBytes);
    if (diagnosticMode === "metadata") return;
    try { emitDiagnosticLines(stderrRedactor.write(chunk)); }
    catch { append("stream.error", { stream: "stderr", category: "redaction-error" }); safeFailure(); }
  }

  function finishStderr() {
    if (stderrFinished) return;
    stderrFinished = true;
    try { emitDiagnosticLines(stderrRedactor.finish()); }
    catch { append("stream.error", { stream: "stderr", category: "redaction-error" }); safeFailure(); }
  }

  function stopTimers() {
    if (procTimer !== null) { clearIntervalFn(procTimer); procTimer = null; }
    if (leaseTimer !== null) { clearTimeoutFn(leaseTimer); leaseTimer = null; }
  }

  function finishStreams() { finishStdout(); finishStderr(); }

  function sampleProcess() {
    if (childClosed || !spawnRecorded) return Promise.resolve();
    const pid = spawnPid;
    return schedule(async () => {
      await traceStore.sync();
      const sample = Number.isSafeInteger(pid) && pid > 0 ? await readDebugProcSample(pid, procIo) : Object.freeze({ availability: "unavailable", category: "pid-unavailable" });
      await traceStore.append("process.sample", sample);
    });
  }

  function recordSpawn({ pid = child.pid, pgid = child.pid, leaseMs = null, signal = "SIGTERM" } = {}) {
    if (spawnRecorded) return Promise.reject(new Error("debug child spawn was already recorded"));
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(pgid) || pgid <= 0) return Promise.reject(new Error("debug child observer requires safe pid metadata"));
    if (leaseMs !== null && (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !TRACE_SIGNALS.has(signal))) return Promise.reject(new Error("debug child lease configuration is invalid"));
    spawnRecorded = true;
    spawnPid = pid;
    spawnPgid = pgid;
    if (leaseMs !== null) leaseStarted = readClock();
    const operation = schedule(async () => {
      await traceStore.append("child.spawned", { label, pid, pgid });
      if (leaseMs !== null) await traceStore.append("lease.armed", leasePayload());
      await traceStore.sync();
    });
    return operation.then((result) => {
      procTimer = setIntervalFn(() => { sampleProcess().catch(() => {}); }, DEBUG_PROC_INTERVAL_MS);
      procTimer?.unref?.();
      if (leaseMs !== null) {
        leaseTimer = setTimeoutFn(() => { expireLease({ signal }).catch(() => {}); }, leaseMs);
        leaseTimer?.unref?.();
      }
      return result;
    });
  }

  function categoricalStdinError(category) {
    const error = new Error(`debug child stdin failed categorically: ${category}`);
    error.debugCategory = category;
    return error;
  }

  function observeStdinFailure(error, fallback) {
    const category = debugErrorCategory(error, fallback);
    if (stdinFailureCategory === null) stdinFailureCategory = category;
    safeFailure();
    stdinWaiter?.reject(categoricalStdinError(stdinFailureCategory));
    if (!stdinErrorQueued && !stdinErrorRecorded && !stdinClosed && ["requested", "accepted", "ending"].includes(stdinPhase)) {
      stdinErrorQueued = true;
      const queued = schedule(async () => {
        if (!stdinErrorRecorded && !stdinClosed) {
          await traceStore.append("stdin.error", { category: stdinFailureCategory });
          stdinErrorRecorded = true;
          stdinPhase = "error";
        }
      });
      queued.finally(() => { stdinErrorQueued = false; }).catch(() => {});
    }
  }

  function requireHealthyStdin() {
    if (stdinFailureCategory !== null) throw categoricalStdinError(stdinFailureCategory);
  }

  function waitForStdinWrite(bytes) {
    return new Promise((resolve, reject) => {
      let callbackAccepted = false;
      let drainAccepted = null;
      let settled = false;
      const cleanup = () => {
        child.stdin.off?.("drain", onDrain);
        if (stdinWaiter?.reject === failWrite) stdinWaiter = null;
      };
      const succeed = () => {
        if (!settled && callbackAccepted && drainAccepted === true) { settled = true; cleanup(); resolve(); }
      };
      const failWrite = (error) => {
        if (!settled) { settled = true; cleanup(); reject(error); }
      };
      const onDrain = () => { drainAccepted = true; succeed(); };
      stdinWaiter = { reject: failWrite };
      try {
        const accepted = child.stdin.write(bytes, (error) => {
          if (error) { observeStdinFailure(error, "write-error"); return; }
          callbackAccepted = true;
          succeed();
        });
        drainAccepted = accepted !== false;
        if (!drainAccepted) child.stdin.once("drain", onDrain);
        succeed();
      } catch (error) {
        observeStdinFailure(error, "write-error");
        failWrite(categoricalStdinError(stdinFailureCategory ?? "write-error"));
      }
    });
  }

  function waitForStdinFinish() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; if (stdinWaiter?.reject === failEnd) stdinWaiter = null; resolve(); } };
      const failEnd = (error) => { if (!settled) { settled = true; if (stdinWaiter?.reject === failEnd) stdinWaiter = null; reject(error); } };
      stdinWaiter = { resolve: finish, reject: failEnd };
      try { child.stdin.end(); }
      catch (error) { observeStdinFailure(error, "end-error"); failEnd(categoricalStdinError(stdinFailureCategory ?? "end-error")); }
    });
  }

  function writeAndEndStdin(value) {
    if (!observeStdin || !spawnRecorded || finishRequested || stdinPhase !== "initial") return Promise.reject(new Error("debug child stdin write is out of order"));
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : typeof value === "string" ? Buffer.from(value, "utf8") : null;
    if (bytes === null) return Promise.reject(new Error("debug child stdin accepts only Buffer or string input"));
    const operation = schedule(async () => {
      try {
        await traceStore.append("stdin.write-requested", { bytes: bytes.length, sha256: sha256(bytes) });
        stdinPhase = "requested";
        await traceStore.sync();
        await waitForStdinWrite(bytes);
        requireHealthyStdin();
        await traceStore.append("stdin.write-accepted", { bytes: bytes.length });
        stdinPhase = "accepted";
        requireHealthyStdin();
        await traceStore.append("stdin.end-requested", {});
        stdinPhase = "ending";
        requireHealthyStdin();
        await traceStore.sync();
        await waitForStdinFinish();
        requireHealthyStdin();
        if (!stdinFinished) throw categoricalStdinError("premature-close");
        requireHealthyStdin();
        const appendGuarded = SECURE_TRACE_GUARDED_APPENDERS.get(traceStore);
        const closed = await appendGuarded("stdin.closed", {}, () => stdinFailureCategory === null, () => {
          stdinClosed = true;
          stdinPhase = "closed";
        });
        if (!closed.committed) requireHealthyStdin();
        return null;
      } catch (error) {
        const category = error?.debugCategory ?? stdinFailureCategory ?? "stdin-error";
        if (!stdinErrorRecorded && ["requested", "accepted", "ending"].includes(stdinPhase)) {
          await traceStore.append("stdin.error", { category });
          stdinErrorRecorded = true;
        }
        if (stdinErrorRecorded) await traceStore.sync();
        stdinFailureCategory ??= category;
        stdinPhase = "error";
        safeFailure();
        return category;
      } finally {
        stdinWaiter = null;
      }
    });
    return operation.then((category) => {
      if (category !== null) throw categoricalStdinError(category);
    });
  }

  function readClock() {
    let value;
    try { value = clock(); } catch { throw new Error("debug child observer clock is invalid"); }
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("debug child observer clock is invalid");
    return value;
  }

  function leasePayload() {
    const value = readClock();
    if (leaseStarted === null || value < leaseStarted || !Number.isSafeInteger(value - leaseStarted)) throw new Error("debug child observer clock is invalid");
    return { label, elapsedMs: value - leaseStarted, stdoutBytes, stderrBytes };
  }

  function armLease({ leaseMs, signal = "SIGTERM" } = {}) {
    if (!spawnRecorded || leaseStarted !== null || leaseArming || !Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !TRACE_SIGNALS.has(signal)) return Promise.reject(new Error("debug child lease configuration is invalid"));
    try { leaseStarted = readClock(); }
    catch (error) { return Promise.reject(error); }
    leaseArming = true;
    return schedule(async () => {
      await traceStore.append("lease.armed", leasePayload());
      await traceStore.sync();
    }).then((result) => {
      leaseArming = false;
      leaseTimer = setTimeoutFn(() => { expireLease({ signal }).catch(() => {}); }, leaseMs);
      leaseTimer?.unref?.();
      return result;
    }, (error) => { leaseArming = false; throw error; });
  }

  function heartbeatLease() {
    if (leaseStarted === null || leaseExpired) return Promise.reject(new Error("debug child lease heartbeat is out of order"));
    return append("lease.heartbeat", leasePayload());
  }

  function expireLease({ signal = "SIGTERM" } = {}) {
    if (leaseStarted === null || leaseExpired || !TRACE_SIGNALS.has(signal)) return Promise.reject(new Error("debug child lease expiry is out of order"));
    leaseExpired = true;
    if (leaseTimer !== null) { clearTimeoutFn(leaseTimer); leaseTimer = null; }
    safeFailure();
    return schedule(async () => {
      await traceStore.append("lease.expired", leasePayload());
      try { onLeaseExpired(); } catch { /* The durable trace remains authoritative. */ }
      const identity = {};
      if (spawnPid !== null) { identity.pid = spawnPid; identity.pgid = spawnPgid; }
      await traceStore.append("child.signal-requested", { label, signal, ...identity });
      await traceStore.sync();
      let category = "not-sent";
      try { category = typeof child.kill === "function" && child.kill(signal) ? "sent" : "not-sent"; }
      catch { category = "signal-error"; }
      await traceStore.append("child.signal-result", { label, signal, category, ...(identity.pgid === undefined ? {} : { pgid: identity.pgid }) });
    });
  }

  function beginFinish() {
    if (finishRequested) return;
    finishRequested = true;
    stopTimers();
    finishStreams();
    if (!childClosed) safeFailure();
  }

  async function drain() {
    if (!finishRequested) beginFinish();
    await tail;
    if (queueFailure) throw queueFailure;
    await traceStore.sync();
    if (observedFailure) throw observedFailure;
    return Object.freeze({ stdoutBytes, stderrBytes, closed: childClosed });
  }

  async function finish() { beginFinish(); return drain(); }
  async function finishAndDrain() { return finish(); }

  // Listener installation is intentionally contiguous and precedes every API
  // method capable of writing stdin.
  child.on("error", (error) => { append("child.error", { label, category: debugErrorCategory(error, "process-error") }); safeFailure(); });
  if (observeStdin) child.stdin.on("error", (error) => { observeStdinFailure(error, "stdin-error"); });
  if (observeStdin) child.stdin.on("finish", () => {
    stdinFinished = true;
    if (stdinPhase === "ending") {
      if (stdinWaiter?.resolve) stdinWaiter.resolve();
      else if (!stdinClosed && stdinFailureCategory === null && !stdinErrorRecorded) { stdinClosed = true; stdinPhase = "closed"; append("stdin.closed", {}); }
    } else if (!stdinClosed) observeStdinFailure(categoricalStdinError("premature-finish"), "premature-finish");
  });
  if (observeStdin) child.stdin.on("close", () => {
    if (!stdinFinished) observeStdinFailure(categoricalStdinError("premature-close"), "premature-close");
  });
  child.stdout.on("data", consumeStdout);
  child.stdout.on("error", (error) => { append("stream.error", { stream: "stdout", category: debugErrorCategory(error, "stream-error") }); safeFailure(); });
  child.stdout.on("end", finishStdout);
  child.stdout.on("close", finishStdout);
  child.stderr.on("data", consumeStderr);
  child.stderr.on("error", (error) => { append("stream.error", { stream: "stderr", category: debugErrorCategory(error, "stream-error") }); safeFailure(); });
  child.stderr.on("end", finishStderr);
  child.stderr.on("close", finishStderr);
  child.on("exit", (code, signal) => { append("child.exit", { label, code: debugExitCode(code), signal: debugSignal(signal) }); });
  child.on("close", (code, signal) => {
    finishStreams();
    childClosed = true;
    stopTimers();
    append("child.close", { label, code: debugExitCode(code), signal: debugSignal(signal) });
  });

  return Object.freeze({ recordSpawn, writeAndEndStdin, armLease, heartbeatLease, expireLease, sampleProcess, finish, drain, finishAndDrain });
}

/**
 * Durably records a spawn intent before invoking spawn, installs every child
 * listener synchronously on return from spawn, then durably records the spawn
 * outcome. This API is debug-only and is not wired into productive execution.
 */
export async function spawnDebugChildObserver({
  traceStore, spawn = nodeSpawn, command, args = [], options = {}, label = "critic",
  privateIdentifiers = [], privateRoots = [], procIo = {},
  observeStdin = true, diagnosticMode = "redacted", onStdoutChunk = () => {}, onStderrChunk = () => {}, onLeaseExpired = () => {}, leaseMs = null, leaseSignal = "SIGTERM",
  clock = () => Number(process.hrtime.bigint() / 1_000_000n),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
} = {}) {
  if (!SECURE_TRACE_STORES.has(traceStore)) fail("debug child spawn requires a verified secure trace store");
  if (typeof spawn !== "function" || typeof command !== "string" || command.length === 0 || !Array.isArray(args) || !isPlainTraceObject(options)) fail("debug child spawn configuration is invalid");
  assertTraceCategory(label, "child label");
  await traceStore.append("child.spawn-requested", { label });
  await traceStore.sync();
  let child;
  try { child = spawn(command, args, options); }
  catch (error) {
    const category = debugErrorCategory(error, "spawn-error");
    await traceStore.append("child.spawn-failed", { label, category });
    await traceStore.sync();
    return Object.freeze({ ok: false, category, child: null, observer: null });
  }
  let observer;
  try {
    observer = createDebugChildObserver({ traceStore, child, label, privateIdentifiers, privateRoots, procIo, observeStdin, diagnosticMode, onStdoutChunk, onStderrChunk, onLeaseExpired, clock, setIntervalFn, clearIntervalFn, setTimeoutFn, clearTimeoutFn });
  } catch {
    await traceStore.append("child.spawn-failed", { label, category: "observer-attach-failed" });
    await traceStore.sync();
    return Object.freeze({ ok: false, category: "observer-attach-failed", child: null, observer: null });
  }
  await observer.recordSpawn({ leaseMs, signal: leaseSignal });
  return Object.freeze({ ok: true, category: "spawned", child, observer });
}

function filesystemInline(entries) {
  return `{${entries.map((entry) => `${tomlString(entry.path)}=${tomlString(entry.access)}`).join(",")}}`;
}

export function buildPermissionProfile({ fixtureRoot, runtimeRoot, profileId = CODEX_CRITIC_POLICY.permissionProfile } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot");
  assertAbsolute(runtimeRoot, "runtimeRoot");
  if (!SAFE_PROFILE_ID.test(profileId)) fail("permission profile id is invalid");
  const fixture = normalizedPath(fixtureRoot);
  const runtime = normalizedPath(runtimeRoot);
  if ([fixture, runtime].some((entry) => entry === path.parse(entry).root)) fail("permission profile cannot reopen a filesystem root");
  if ([fixture, runtime].some((entry) => BROAD_READ_ROOTS.has(entry))) fail("permission profile cannot reopen a broad or home read root");
  if (pathsOverlap(fixture, runtime)) fail("fixture and runtime roots must be disjoint");
  const filesystem = Object.freeze([
    Object.freeze({ path: ":root", access: "deny" }),
    Object.freeze({ path: ":minimal", access: "read" }),
    ...[fixture, runtime].sort().map((entry) => Object.freeze({ path: entry, access: "read" })),
  ]);
  const normalized = Object.freeze({
    schema: "pipeline.codex-permission-profile.v1",
    id: profileId,
    roots: Object.freeze({ fixture, runtime }),
    filesystem,
    network: Object.freeze({ enabled: false }),
  });
  const config = Object.freeze([
    `default_permissions=${tomlString(profileId)}`,
    `permissions.${profileId}.filesystem=${filesystemInline(filesystem)}`,
    `permissions.${profileId}.network.enabled=false`,
  ]);
  return Object.freeze({ id: profileId, normalized, hash: sha256(canonical(normalized)), config });
}

function assertPermissionProfile(profile) {
  if (!profile || !SAFE_PROFILE_ID.test(profile.id ?? "") || !(profile.id === CODEX_CRITIC_POLICY.permissionProfile || profile.id.startsWith(`${CODEX_CRITIC_POLICY.permissionProfile}-`)) || profile.normalized?.id !== profile.id || !Array.isArray(profile.config) || !/^[0-9a-f]{64}$/u.test(profile.hash ?? "")) fail("verified permission profile is required");
  const entries = profile.normalized?.filesystem;
  if (!Array.isArray(entries) || entries[0]?.path !== ":root" || entries[0]?.access !== "deny") fail("permission profile must start with root deny");
  const roots = profile.normalized?.roots;
  if (!roots || typeof roots.fixture !== "string" || typeof roots.runtime !== "string" || pathsOverlap(roots.fixture, roots.runtime)) fail("permission profile read roots are invalid");
  const expectedEntries = [
    { path: ":root", access: "deny" },
    { path: ":minimal", access: "read" },
    ...[roots.fixture, roots.runtime].sort().map((entry) => ({ path: entry, access: "read" })),
  ];
  if (canonical(entries) !== canonical(expectedEntries)) fail("permission profile contains missing, extra, broad, or writable filesystem entries");
  if (profile.normalized?.network?.enabled !== false) fail("permission profile command network must be disabled");
  const expectedConfig = [
    `default_permissions=${tomlString(profile.id)}`,
    `permissions.${profile.id}.filesystem=${filesystemInline(expectedEntries)}`,
    `permissions.${profile.id}.network.enabled=false`,
  ];
  if (canonical(profile.config) !== canonical(expectedConfig) || profile.hash !== sha256(canonical(profile.normalized))) fail("permission profile configuration or hash drifted");
}

function profileConfigArgs(profile) {
  assertPermissionProfile(profile);
  return profile.config.flatMap((entry) => ["-c", entry]);
}

export function buildProfileBoundCodexCriticInvocation({ fixtureRoot, schemaPath, resultPath, permissionProfile, model = CODEX_CRITIC_POLICY.model, effort = CODEX_CRITIC_POLICY.effort, codexBinary, env = process.env } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot");
  assertAbsolute(schemaPath, "schemaPath");
  assertAbsolute(resultPath, "resultPath");
  assertAbsolute(codexBinary, "codexBinary");
  assertPermissionProfile(permissionProfile);
  if (model !== CODEX_CRITIC_POLICY.model || effort !== CODEX_CRITIC_POLICY.effort) fail("Codex Critic model/effort binding is fixed to Sol/max");
  const args = [
    "exec", "--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral",
    "--model", model,
    "-c", `model_reasoning_effort=${tomlString(effort)}`,
    "-c", `approval_policy=${tomlString(CODEX_CRITIC_POLICY.approval)}`,
    "-c", `web_search=${tomlString(CODEX_CRITIC_POLICY.webSearch)}`,
    "-c", "shell_environment_policy.inherit=\"none\"",
    ...profileConfigArgs(permissionProfile),
    "--cd", fixtureRoot, "--skip-git-repo-check",
    "--output-schema", schemaPath, "--output-last-message", resultPath,
    "--json", "-",
  ];
  if (args.includes("--sandbox")) fail("legacy --sandbox cannot be combined with a named permission profile");
  return Object.freeze({
    command: codexBinary,
    args: Object.freeze(args),
    options: Object.freeze({
      cwd: fixtureRoot,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      env: sanitizeEnvironment(env),
    }),
  });
}

/** Historical compatibility for already-evidenced, inactive probe/control runners. */
export function buildCodexCriticInvocation({ fixtureRoot, schemaPath, resultPath, model = CODEX_CRITIC_POLICY.model, effort = CODEX_CRITIC_POLICY.effort, codexBinary = "codex", env = process.env } = {}) {
  assertAbsolute(fixtureRoot, "fixtureRoot"); assertAbsolute(schemaPath, "schemaPath"); assertAbsolute(resultPath, "resultPath");
  if (model !== CODEX_CRITIC_POLICY.model || effort !== CODEX_CRITIC_POLICY.effort) fail("Codex Critic model/effort binding is fixed to Sol/max");
  return Object.freeze({
    command: codexBinary,
    args: Object.freeze([
      "exec", "--ignore-user-config", "--strict-config", "--ephemeral", "--model", model,
      "-c", `model_reasoning_effort=${tomlString(effort)}`, "-c", `approval_policy=${tomlString(CODEX_CRITIC_POLICY.approval)}`,
      "--sandbox", CODEX_CRITIC_POLICY.sandbox, "--cd", fixtureRoot, "--skip-git-repo-check",
      "--output-schema", schemaPath, "--output-last-message", resultPath, "--json", "-",
    ]),
    options: Object.freeze({ cwd: fixtureRoot, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: sanitizeEnvironment(env) }),
  });
}

function git(repoRoot, args, execFileSync = nodeExecFileSync) {
  try { return execFileSync("git", args, { cwd: repoRoot, encoding: "buffer", stdio: ["ignore", "pipe", "pipe"], shell: false }); }
  catch (error) { fail(`exact Git-object read failed: ${error.stderr?.toString("utf8").trim() || error.message}`); }
}
function gitText(repoRoot, args, execFileSync) { return git(repoRoot, args, execFileSync).toString("utf8").trim(); }

export async function buildExactFixture({ repoRoot, candidateCommit, artifactPaths, fixtureParent = os.tmpdir(), execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(repoRoot, "repoRoot");
  if (!isFullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
  if (!Array.isArray(artifactPaths) || artifactPaths.length === 0 || artifactPaths.length > 16) fail("artifactPaths must contain 1..16 paths");
  const unique = [...new Set(artifactPaths)];
  if (unique.length !== artifactPaths.length) fail("artifactPaths must be unique");
  unique.forEach((entry) => assertSafeRelative(entry, "artifact path"));
  const commit = gitText(repoRoot, ["rev-parse", `${candidateCommit}^{commit}`], execFileSync);
  if (commit !== candidateCommit) fail("candidate commit did not resolve exactly");
  const tree = gitText(repoRoot, ["rev-parse", `${candidateCommit}^{tree}`], execFileSync);
  const ancestry = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", candidateCommit], execFileSync).split(/\s+/u);
  if (ancestry.length !== 2 || ancestry[0] !== candidateCommit || !isFullSha(ancestry[1])) fail("candidate must have exactly one bound parent");
  const parent = ancestry[1];
  const parentTree = gitText(repoRoot, ["rev-parse", `${parent}^{tree}`], execFileSync);
  const root = await mkdtemp(path.join(fixtureParent, "agent-pipeline-codex-critic-"));
  const artifacts = [];
  try {
    for (const relativePath of unique.sort()) {
      const record = git(repoRoot, ["ls-tree", candidateCommit, "--", relativePath], execFileSync).toString("utf8").trim();
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(record);
      if (!match || match[3] !== relativePath) fail(`fixture artifact is missing, symlinked, non-regular, or ambiguous: ${relativePath}`);
      const bytes = git(repoRoot, ["cat-file", "blob", match[2]], execFileSync);
      if (bytes.length > MAX_ARTIFACT_BYTES) fail(`fixture artifact exceeds ${MAX_ARTIFACT_BYTES} bytes: ${relativePath}`);
      const destination = path.join(root, relativePath);
      if (!destination.startsWith(`${root}${path.sep}`)) fail("fixture path escaped root");
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { mode: 0o600 });
      const written = await readFile(destination);
      if (!written.equals(bytes)) fail(`fixture materialization mismatch: ${relativePath}`);
      artifacts.push(Object.freeze({ path: relativePath, mode: match[1], blob: match[2], bytes: bytes.length, sha256: sha256(bytes) }));
    }
    const nonce = randomBytes(16).toString("hex");
    const manifest = Object.freeze({ schema: "pipeline.codex-critic-fixture.v2", candidateCommit, tree, parent, parentTree, nonce, artifacts: Object.freeze(artifacts) });
    const manifestPath = path.join(root, "fixture-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ root, manifestPath, manifest, manifestHash: sha256(await readFile(manifestPath)) });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function buildReviewBundle(fixture) {
  if (!fixture?.root || !fixture?.manifest || !fixture.manifestHash) fail("verified fixture is required");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const artifacts = [];
  let contentBytes = 0;
  for (const item of fixture.manifest.artifacts) {
    assertSafeRelative(item.path, "artifact path");
    const file = path.join(fixture.root, item.path);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) fail(`review artifact is not a regular file: ${item.path}`);
    const bytes = await readFile(file);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) fail(`review artifact drifted after materialization: ${item.path}`);
    let content;
    try { content = decoder.decode(bytes); } catch { fail(`review artifact is not valid UTF-8: ${item.path}`); }
    contentBytes += bytes.length;
    if (contentBytes > MAX_BUNDLE_BYTES) fail(`review bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
    artifacts.push(Object.freeze({ ...item, content }));
  }
  if (artifacts.length !== fixture.manifest.artifacts.length || artifacts.length === 0) fail("review bundle is incomplete");
  const value = Object.freeze({
    schema: "pipeline.codex-critic-review-bundle.v2",
    candidateCommit: fixture.manifest.candidateCommit,
    candidateTree: fixture.manifest.tree,
    candidateParent: fixture.manifest.parent,
    candidateParentTree: fixture.manifest.parentTree,
    fixtureManifestSha256: fixture.manifestHash,
    reviewContract: CODEX_CRITIC_REVIEW_CONTRACT,
    reviewContractSha256: reviewContractHash(),
    artifacts: Object.freeze(artifacts),
  });
  const serialized = canonical(value);
  if (Buffer.byteLength(serialized) > MAX_BUNDLE_BYTES) fail(`serialized review bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  return Object.freeze({ value, serialized, hash: sha256(serialized), contentBytes });
}

async function directoryHash(root) {
  const rows = [];
  async function walk(relative = "") {
    const directory = path.join(root, relative);
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(root, child);
      if (entry.isSymbolicLink() || !(entry.isDirectory() || entry.isFile())) fail("fixture contains a non-regular path");
      if (entry.isDirectory()) await walk(child);
      else { const bytes = await readFile(absolute); rows.push({ path: child.replaceAll("\\", "/"), sha256: sha256(bytes), bytes: bytes.length }); }
    }
  }
  await walk();
  return sha256(canonical(rows));
}

async function assertFixtureInventory(fixture) {
  const expected = [...fixture.manifest.artifacts.map((item) => item.path), "fixture-manifest.json"].sort();
  const actual = [];
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(fixture.root, relative), { withFileTypes: true })) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isSymbolicLink() || !(entry.isDirectory() || entry.isFile())) fail("fixture contains a non-regular path");
      if (entry.isDirectory()) await walk(child);
      else actual.push(child.replaceAll("\\", "/"));
    }
  }
  await walk(); actual.sort();
  if (canonical(actual) !== canonical(expected)) fail("fixture inventory contains missing or extra files");
  return sha256(canonical(actual));
}

function capture() { return { bytes: 0, totalBytes: 0, parts: [], overflow: false }; }
function appendBounded(target, chunk, maxBytes = MAX_STREAM_BYTES) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  target.totalBytes += bytes.length;
  if (target.bytes >= maxBytes) { target.overflow = true; return; }
  const slice = bytes.subarray(0, Math.max(0, maxBytes - target.bytes));
  target.bytes += slice.length;
  target.parts.push(slice);
  if (slice.length !== bytes.length) target.overflow = true;
}

export function localFailureDiagnostic(stdout, stderr) {
  const text = (value) => Buffer.concat(value.parts).toString("utf8");
  const tail = (value) => text(value).slice(-2_000);
  return Object.freeze({
    stdoutBytes: stdout.totalBytes,
    stderrBytes: stderr.totalBytes,
    stdoutSha256: sha256(text(stdout)),
    stderrSha256: sha256(text(stderr)),
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  });
}

function groupAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0 || process.platform === "win32") return false;
  try { kill(-pid, 0); return true; } catch { return false; }
}
// This proves only that the detached process group we created is gone. A child
// that successfully escaped that PGID is outside the observable claim.
export async function ensureOwnedProcessGroupGone(pid, kill = process.kill) {
  if (process.platform === "win32" || !groupAlive(pid, kill)) return true;
  try { kill(-pid, "SIGTERM"); } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!groupAlive(pid, kill)) return true;
  try { kill(-pid, "SIGKILL"); } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
  return !groupAlive(pid, kill);
}

async function awaitChild(child, { leaseMs, onHeartbeat = () => {}, label }) {
  const stdout = capture(); const stderr = capture();
  child.stdout?.on("data", (chunk) => appendBounded(stdout, chunk));
  child.stderr?.on("data", (chunk) => appendBounded(stderr, chunk));
  const started = Date.now(); let timedOut = false;
  const terminal = await new Promise((resolve) => {
    let killTimer = null; let forceSettleTimer = null; let settled = false;
    const signal = (name) => {
      try {
        if (process.platform !== "win32" && Number.isInteger(child.pid) && child.pid > 0) process.kill(-child.pid, name);
        else child.kill?.(name);
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      killTimer = setTimeout(() => signal("SIGKILL"), 500);
      forceSettleTimer = setTimeout(() => settle({ code: null, signal: "SIGKILL", error: "lease-expired" }), 2_000);
    }, leaseMs);
    const heartbeat = setInterval(() => { try { onHeartbeat({ label, elapsedMs: Date.now() - started, stdoutBytes: stdout.totalBytes, stderrBytes: stderr.totalBytes }); } catch {} }, 5_000);
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(forceSettleTimer); clearInterval(heartbeat); resolve(value);
    };
    child.once("error", () => settle({ code: null, signal: null, error: "process-error" }));
    child.once("close", (code, signal) => settle({ code, signal, error: null }));
  });
  const ownedProcessGroupGone = await ensureOwnedProcessGroupGone(child.pid);
  return Object.freeze({ terminal, timedOut, ownedProcessGroupGone, stdout, stderr, diagnostics: localFailureDiagnostic(stdout, stderr) });
}

async function runDebugObservedChild({ traceStore, spawn, invocation, leaseMs, label, stdin = null, privateIdentifiers = [], privateRoots = [], onHeartbeat = () => {} }) {
  const stdout = capture(); const stderr = capture();
  const started = Date.now();
  let terminalResolve;
  const terminalPromise = new Promise((resolve) => { terminalResolve = resolve; });
  let terminalSettled = false; let timedOut = false;
  const settle = (value) => { if (!terminalSettled) { terminalSettled = true; terminalResolve(value); } };
  const observedSpawn = (command, args, options) => {
    const child = spawn(command, args, options);
    child.once("error", () => settle({ code: null, signal: null, error: "process-error" }));
    child.once("close", (code, signal) => settle({ code, signal, error: null }));
    return child;
  };
  const spawned = await spawnDebugChildObserver({
    traceStore, spawn: observedSpawn, command: invocation.command, args: invocation.args, options: invocation.options, label,
    privateIdentifiers, privateRoots, observeStdin: stdin !== null, diagnosticMode: "metadata", leaseMs,
    onStdoutChunk: (chunk) => appendBounded(stdout, chunk), onStderrChunk: (chunk) => appendBounded(stderr, chunk),
    onLeaseExpired: () => { timedOut = true; },
  });
  if (!spawned.ok) return Object.freeze({ spawned: false, category: spawned.category, terminal: Object.freeze({ code: null, signal: null, error: "spawn-error" }), timedOut: false, ownedProcessGroupGone: true, stdout, stderr, diagnostics: null });
  const { child, observer } = spawned;
  let stdinError = null;
  if (stdin !== null) {
    try { await observer.writeAndEndStdin(stdin); }
    catch { stdinError = "stdin-error"; }
  }
  const heartbeat = setInterval(() => {
    observer.heartbeatLease().catch(() => {});
    try { onHeartbeat({ label, elapsedMs: Date.now() - started, stdoutBytes: stdout.totalBytes, stderrBytes: stderr.totalBytes, liveness: true }); } catch {}
  }, DEBUG_PROC_INTERVAL_MS);
  heartbeat.unref?.();
  const terminal = await terminalPromise;
  clearInterval(heartbeat);
  const ownedProcessGroupGone = await ensureOwnedProcessGroupGone(child.pid);
  let observerError = null;
  try { await observer.finishAndDrain(); } catch { observerError = "observer-error"; }
  return Object.freeze({
    spawned: true,
    category: stdinError ?? observerError,
    terminal: Object.freeze(terminal), timedOut, ownedProcessGroupGone, stdout, stderr,
    diagnostics: localFailureDiagnostic(stdout, stderr),
  });
}

async function executable(candidate) { try { await access(candidate, constants.X_OK); return true; } catch { return false; } }
export async function resolveCodexBinary({ pathEnv = process.env.PATH, platform = process.platform } = {}) {
  if (typeof pathEnv !== "string" || !pathEnv) fail("PATH is required to resolve Codex");
  const names = platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"];
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) { const candidate = path.join(directory, name); if (await executable(candidate)) return realpath(candidate); }
  }
  fail("Codex binary is unavailable on PATH");
}

async function runtimeReleaseManifest(runtimeRoot) {
  const rows = [];
  async function walk(relative = "") {
    const directory = path.join(runtimeRoot, relative);
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(runtimeRoot, child);
      const info = await lstat(absolute);
      const mode = info.mode & 0o777;
      if (info.isDirectory()) {
        rows.push({ path: child.replaceAll("\\", "/"), type: "directory", mode });
        await walk(child);
      } else if (info.isFile()) {
        const bytes = await readFile(absolute);
        rows.push({ path: child.replaceAll("\\", "/"), type: "file", mode, bytes: bytes.length, sha256: sha256(bytes) });
      } else if (info.isSymbolicLink()) {
        const target = await readlink(absolute);
        const resolvedTarget = path.resolve(path.dirname(absolute), target);
        if (!resolvedTarget.startsWith(`${runtimeRoot}${path.sep}`)) fail("Codex runtime release contains an escaping symlink");
        rows.push({ path: child.replaceAll("\\", "/"), type: "symlink", target });
      } else fail("Codex runtime release contains a non-regular entry");
    }
  }
  await walk();
  return Object.freeze({ entries: rows.length, sha256: sha256(canonical(rows)) });
}

export async function inspectCodexBinary({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(codexBinary, "codexBinary");
  const resolvedBinary = await realpath(codexBinary);
  if (resolvedBinary !== normalizedPath(codexBinary)) fail("Codex binary must be supplied as its exact realpath");
  const info = await stat(resolvedBinary);
  if (!info.isFile()) fail("Codex binary is not a regular file");
  let version;
  try { version = execFileSync(resolvedBinary, ["--version"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { fail("Codex binary version inspection failed"); }
  if (version !== CODEX_CRITIC_POLICY.requiredVersion) fail(`Codex binary version must be ${CODEX_CRITIC_POLICY.requiredVersion}`);
  const runtimeRoot = path.dirname(path.dirname(resolvedBinary));
  const releaseName = path.basename(runtimeRoot);
  if (path.basename(path.dirname(resolvedBinary)) !== "bin" || path.basename(path.dirname(runtimeRoot)) !== "releases" || !releaseName.startsWith("0.144.4-") || !resolvedBinary.startsWith(`${runtimeRoot}${path.sep}`)) fail("Codex runtime release root is not the pinned standalone layout");
  const runtimeManifest = await runtimeReleaseManifest(runtimeRoot);
  return Object.freeze({
    binarySha256: sha256(await readFile(resolvedBinary)),
    versionSha256: sha256(version),
    runtimeRoot,
    runtimeRootSha256: sha256(runtimeRoot),
    runtimeManifestSha256: runtimeManifest.sha256,
    runtimeEntries: runtimeManifest.entries,
  });
}

export function verifyProfileContract({ codexBinary, execFileSync = nodeExecFileSync } = {}) {
  assertAbsolute(codexBinary, "codexBinary");
  let sandboxHelp; let execHelp;
  try {
    sandboxHelp = execFileSync(codexBinary, ["sandbox", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
    execHelp = execFileSync(codexBinary, ["exec", "--help"], { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch { fail("Codex profile contract inspection failed"); }
  if (!/Run commands within a Codex-provided sandbox/u.test(sandboxHelp) || !/--permission-profile\s+<NAME>/u.test(sandboxHelp)) fail("Codex named permission profile sandbox contract is unavailable");
  for (const token of ["--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral", "--json", "--output-schema", "--output-last-message"]) if (!execHelp.includes(token)) fail(`Codex exec contract is missing ${token}`);
  return Object.freeze({ contractSha256: sha256(canonical({ sandbox: "named-permission-profile", exec: "tool-free-jsonl", version: CODEX_CRITIC_POLICY.requiredVersion })) });
}

function sandboxInvocation({ codexBinary, permissionProfile, cwd, command, env }) {
  assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(cwd, "cwd"); assertPermissionProfile(permissionProfile);
  const args = ["sandbox", ...profileConfigArgs(permissionProfile), "-P", permissionProfile.id, "--", ...command];
  return Object.freeze({ command: codexBinary, args: Object.freeze(args), options: Object.freeze({ cwd, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env }) });
}

async function runProbeCommand({ invocation, leaseMs, spawn, onHeartbeat, label, debugContext }) {
  if (debugContext) {
    const debugInvocation = Object.freeze({ ...invocation, options: Object.freeze({ ...invocation.options, stdio: ["pipe", "pipe", "pipe"] }) });
    const execution = await runDebugObservedChild({ ...debugContext, spawn, invocation: debugInvocation, leaseMs, label, stdin: null, onHeartbeat });
    if (!execution.spawned) return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null, debugTimedOut: false });
    return Object.freeze({
      ok: !execution.timedOut && execution.ownedProcessGroupGone && !execution.stdout.overflow && !execution.stderr.overflow && execution.category === null,
      invocationSha256: invocationHash(invocation.command, invocation.args),
      process: Object.freeze({ exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, ownedProcessGroupGone: execution.ownedProcessGroupGone, error: execution.terminal.error }),
      diagnostics: execution.diagnostics, debugTimedOut: execution.timedOut,
    });
  }
  let child;
  try { child = spawn(invocation.command, invocation.args, invocation.options); }
  catch { return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null }); }
  const execution = await awaitChild(child, { leaseMs, onHeartbeat, label });
  return Object.freeze({
    ok: !execution.timedOut && execution.ownedProcessGroupGone && !execution.stdout.overflow && !execution.stderr.overflow,
    invocationSha256: invocationHash(invocation.command, invocation.args),
    process: Object.freeze({ exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, ownedProcessGroupGone: execution.ownedProcessGroupGone, error: execution.terminal.error }),
    diagnostics: execution.diagnostics,
  });
}

async function hashedFile(file) { const bytes = await readFile(file); return Object.freeze({ sha256: sha256(bytes), bytes: bytes.length }); }
async function pathAbsent(file) { try { await lstat(file); return false; } catch (error) { if (error?.code === "ENOENT") return true; throw error; } }

export async function runPermissionProfilePreflight({ codexBinary, permissionProfile, fixtureRoot, externalParent, leaseMs = CODEX_CRITIC_POLICY.preflightLeaseMs, spawn = nodeSpawn, env = process.env, onHeartbeat = () => {}, debugContext } = {}) {
  assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(fixtureRoot, "fixtureRoot"); assertAbsolute(externalParent, "externalParent"); assertPermissionProfile(permissionProfile);
  const fixtureRealpath = await realpath(fixtureRoot);
  if (fixtureRealpath !== permissionProfile.normalized.roots.fixture) fail("preflight fixture drifted from the bound profile");
  const coordinator = await mkdtemp(path.join(externalParent, ".pipeline-codex-profile-external-"));
  const coordinatorRealpath = await realpath(coordinator);
  if ([permissionProfile.normalized.roots.fixture, permissionProfile.normalized.roots.runtime].some((entry) => pathsOverlap(entry, coordinatorRealpath))) {
    await rm(coordinator, { recursive: true, force: true });
    fail("preflight external sentinel overlaps a readable profile root");
  }
  const fixtureSentinel = path.join(fixtureRoot, "profile-read-sentinel.txt");
  const externalSentinel = path.join(coordinator, "external-read-sentinel.txt");
  const writeTarget = path.join(fixtureRoot, "forbidden-write-sentinel.txt");
  let configHome = null;
  const runs = {};
  try {
    configHome = await mkdtemp(path.join(os.tmpdir(), "pipeline-codex-profile-config-"));
    const cleanEnv = Object.freeze({ ...sanitizeEnvironment(env), CODEX_HOME: configHome, ...(debugContext ? { RUST_LOG: SAFE_DEBUG_RUST_LOG } : {}) });
    await writeFile(fixtureSentinel, "fixture-read-sentinel\n", { mode: 0o600 });
    await writeFile(externalSentinel, "external-read-sentinel\n", { mode: 0o600 });
    const before = Object.freeze({ fixture: await hashedFile(fixtureSentinel), external: await hashedFile(externalSentinel), writeAbsent: await pathAbsent(writeTarget) });
    const commands = [
      Object.freeze({ key: "fixtureRead", label: "profile-preflight-fixture-read", expect: 0, command: ["/bin/sh", "-c", 'actual=$(cat -- "$2") || exit 3; test "$actual" = "$1"', "pipeline-profile-preflight", "fixture-read-sentinel", fixtureSentinel] }),
      Object.freeze({ key: "externalReadDenied", label: "profile-preflight-external-read-denied", expect: "nonzero", command: ["/bin/sh", "-c", 'cat -- "$1" >/dev/null 2>&1', "pipeline-profile-preflight", externalSentinel] }),
      Object.freeze({ key: "writeDenied", label: "profile-preflight-write-denied", expect: "nonzero", command: ["/bin/sh", "-c", 'printf "forbidden\\n" > "$1"', "pipeline-profile-preflight", writeTarget] }),
    ];
    for (const probe of commands) {
      const invocation = sandboxInvocation({ codexBinary, permissionProfile, cwd: fixtureRoot, command: probe.command, env: cleanEnv });
      const result = await runProbeCommand({ invocation, leaseMs, spawn, onHeartbeat, label: debugContext ? probe.label : `profile-preflight-${probe.key}`, debugContext });
      const exitMatches = probe.expect === "nonzero" ? Number.isInteger(result.process?.exitCode) && result.process.exitCode !== 0 : result.process?.exitCode === probe.expect;
      runs[probe.key] = Object.freeze({ ...result, ok: result.ok && exitMatches });
      if (!runs[probe.key].ok) break;
    }
    const after = Object.freeze({ fixture: await hashedFile(fixtureSentinel), external: await hashedFile(externalSentinel), writeAbsent: await pathAbsent(writeTarget) });
    const canaries = Object.freeze({
      fixtureUnchanged: before.fixture.sha256 === after.fixture.sha256 && before.fixture.bytes === after.fixture.bytes,
      externalUnchanged: before.external.sha256 === after.external.sha256 && before.external.bytes === after.external.bytes,
      writeTargetAbsent: before.writeAbsent && after.writeAbsent,
    });
    const ok = commands.every((probe) => runs[probe.key]?.ok === true) && Object.values(canaries).every(Boolean);
    const canaryEvidence = Object.freeze({
      fixture: Object.freeze({ before: before.fixture, after: after.fixture }),
      external: Object.freeze({ before: before.external, after: after.external }),
      writeTarget: Object.freeze({ absentBefore: before.writeAbsent, absentAfter: after.writeAbsent }),
    });
    return Object.freeze({ ok, category: ok ? "pass" : "profile-preflight-failed", profileSha256: permissionProfile.hash, probes: Object.freeze(Object.fromEntries(commands.map((probe) => [probe.key, runs[probe.key] ? Object.freeze({ invocationSha256: runs[probe.key].invocationSha256, process: runs[probe.key].process }) : null]))), canaries, canaryEvidence, cleanup: true, diagnostics: Object.freeze(Object.fromEntries(commands.map((probe) => [probe.key, runs[probe.key]?.diagnostics ?? null]))) });
  } finally {
    await rm(fixtureSentinel, { force: true }); await rm(writeTarget, { force: true }); await rm(coordinator, { recursive: true, force: true });
    if (configHome) await rm(configHome, { recursive: true, force: true });
  }
}

export function criticPrompt({ bundle, taskId, nonce, candidateCommit, candidateTree, candidateParent, candidateParentTree }) {
  if (!bundle?.serialized || !/^[0-9a-f]{64}$/u.test(bundle.hash ?? "")) fail("complete review bundle is required");
  if (typeof taskId !== "string" || !taskId || !/^[0-9a-f]{32}$/u.test(nonce ?? "") || ![candidateCommit, candidateTree, candidateParent, candidateParentTree].every(isFullSha)) fail("bound critic task identity is required");
  return [
    "You are an independent tool-less Codex Critic.",
    "Use only the complete public review bundle below. Do not use files, shell, commands, search, MCP, web, apps, browsers, plans, or any other tool.",
    "Review the five artifacts against the profile-bound isolation contract. Return only the bound wrapper JSON required by the output schema. Missing or ambiguous evidence is a blocker and pass=false.",
    `TASK_ID=${taskId}`,
    `NONCE=${nonce}`,
    `CANDIDATE_COMMIT=${candidateCommit}`,
    `CANDIDATE_TREE=${candidateTree}`,
    `CANDIDATE_PARENT=${candidateParent}`,
    `CANDIDATE_PARENT_TREE=${candidateParentTree}`,
    `REVIEW_BUNDLE_SHA256=${bundle.hash}`,
    `REVIEW_CONTRACT_SHA256=${reviewContractHash()}`,
    bundle.serialized.trimEnd(),
  ].join("\n");
}

export function inspectToolFreeJsonl(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return Object.freeze({ ok: false, category: "empty-stream", events: 0 });
  let state = "start"; let finalMessages = 0; let finalMessageText = null; let threadCompleted = false;
  for (const line of lines) {
    let event; try { event = JSON.parse(line); } catch { return Object.freeze({ ok: false, category: "malformed-jsonl", events: lines.length }); }
    if (state === "start" && event?.type === "thread.started") { state = "thread"; continue; }
    if (state === "thread" && event?.type === "turn.started") { state = "turn"; continue; }
    if (state === "turn" && (event?.type === "item.started" || event?.type === "item.completed") && ["reasoning", "agent_message"].includes(event?.item?.type)) {
      if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalMessages += 1;
        if (typeof event.item.text !== "string" || !event.item.text.trim()) return Object.freeze({ ok: false, category: "invalid-agent-message", events: lines.length });
        finalMessageText = event.item.text;
      }
      continue;
    }
    if (state === "turn" && event?.type === "turn.completed") { state = "terminal"; continue; }
    if (state === "terminal" && !threadCompleted && event?.type === "thread.completed") { threadCompleted = true; continue; }
    return Object.freeze({ ok: false, category: "tool-or-unknown-event", events: lines.length });
  }
  const ok = state === "terminal" && finalMessages === 1;
  return Object.freeze({ ok, category: ok ? "pass" : "invalid-lifecycle", events: lines.length, finalMessageText });
}

export async function runCodexCritic({ fixture, reviewBundle, permissionProfile, codexBinary, schemaPath = DEFAULT_SCHEMA, leaseMs = CODEX_CRITIC_POLICY.criticLeaseMs, spawn = nodeSpawn, env = process.env, onHeartbeat = () => {}, debugContext } = {}) {
  if (!fixture?.root || !fixture?.manifest?.nonce) fail("verified fixture is required");
  assertPermissionProfile(permissionProfile); assertAbsolute(codexBinary, "codexBinary"); assertAbsolute(schemaPath, "schemaPath");
  if (!reviewBundle?.serialized || reviewBundle.value?.artifacts?.length !== fixture.manifest.artifacts.length) fail("complete review bundle is required");
  await assertFixtureInventory(fixture);
  const coordinator = await mkdtemp(path.join(os.tmpdir(), "agent-pipeline-profile-critic-"));
  try {
  const resultPath = path.join(coordinator, `${fixture.manifest.nonce}.result.json`);
  const boundSchemaPath = path.join(coordinator, `${fixture.manifest.nonce}.schema.json`);
  const taskId = "phase2-profile-bound-isolation";
  const baseSchema = JSON.parse(await readFile(schemaPath, "utf8"));
  const boundSchema = {
    type: "object",
    required: ["task_id", "nonce", "candidate_commit", "candidate_tree", "candidate_parent", "candidate_parent_tree", "bundle_sha256", "review_contract_sha256", "verdict"],
    additionalProperties: false,
    properties: {
      task_id: { type: "string" }, nonce: { type: "string" }, candidate_commit: { type: "string" }, candidate_tree: { type: "string" }, candidate_parent: { type: "string" }, candidate_parent_tree: { type: "string" }, bundle_sha256: { type: "string" }, review_contract_sha256: { type: "string" }, verdict: baseSchema,
    },
  };
  await writeFile(boundSchemaPath, `${JSON.stringify(boundSchema, null, 2)}\n`, { mode: 0o600 });
  const beforeFixture = await directoryHash(fixture.root);
  const invocation = buildProfileBoundCodexCriticInvocation({ fixtureRoot: fixture.root, schemaPath: boundSchemaPath, resultPath, permissionProfile, codexBinary, env });
  const prompt = `${criticPrompt({ bundle: reviewBundle, taskId, nonce: fixture.manifest.nonce, candidateCommit: fixture.manifest.candidateCommit, candidateTree: fixture.manifest.tree, candidateParent: fixture.manifest.parent, candidateParentTree: fixture.manifest.parentTree })}\n`;
  let execution;
  if (debugContext) {
    const debugInvocation = Object.freeze({ ...invocation, options: Object.freeze({ ...invocation.options, env: Object.freeze({ ...invocation.options.env, RUST_LOG: SAFE_DEBUG_RUST_LOG }) }) });
    execution = await runDebugObservedChild({ ...debugContext, spawn, invocation: debugInvocation, leaseMs, label: "critic", stdin: prompt, onHeartbeat });
    if (!execution.spawned) return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null, debugTimedOut: false });
  } else {
    let child;
    try { child = spawn(invocation.command, invocation.args, invocation.options); }
    catch {
      return Object.freeze({ ok: false, category: "spawn-failed", invocationSha256: invocationHash(invocation.command, invocation.args), diagnostics: null });
    }
    child.stdin?.on("error", () => {});
    child.stdin?.end(prompt, "utf8");
    execution = await awaitChild(child, { leaseMs, onHeartbeat, label: "profile-bound-tool-less-critic" });
  }
  const resultBytes = await readFile(resultPath).catch(() => null);
  if (debugContext?.onResultEvidence) debugContext.onResultEvidence(Object.freeze({ present: resultBytes !== null, bytes: resultBytes?.length ?? 0, sha256: resultBytes === null ? null : sha256(resultBytes) }));
  const afterFixture = await directoryHash(fixture.root);
  const stream = execution.stdout.overflow ? Object.freeze({ ok: false, category: "oversized-stream", events: 0 }) : inspectToolFreeJsonl(Buffer.concat(execution.stdout.parts));
  let verdict = null; let verdictError = null;
  try {
    if (!resultBytes || resultBytes.length > MAX_RESULT_BYTES) fail("missing or oversized critic result");
    verdict = JSON.parse(resultBytes.toString("utf8"));
    const checked = validateAgainstBoundSchema(verdict, boundSchema);
    if (!checked.valid) fail(`invalid critic verdict: ${checked.errors.join("; ")}`);
    if (verdict.task_id !== taskId || verdict.nonce !== fixture.manifest.nonce || verdict.candidate_commit !== fixture.manifest.candidateCommit || verdict.candidate_tree !== fixture.manifest.tree || verdict.candidate_parent !== fixture.manifest.parent || verdict.candidate_parent_tree !== fixture.manifest.parentTree || verdict.bundle_sha256 !== reviewBundle.hash || verdict.review_contract_sha256 !== reviewContractHash()) fail("critic result binding mismatch");
    let streamVerdict;
    try { streamVerdict = JSON.parse(stream.finalMessageText); } catch { fail("final agent message is not the bound result JSON"); }
    if (canonical(streamVerdict) !== canonical(verdict)) fail("final agent message and result sink differ");
    if (verdict.verdict.pass !== true || verdict.verdict.findings.some((item) => ["blocker", "major"].includes(item.severity))) fail("critic verdict did not pass cleanly");
  } catch (error) { verdictError = error.message; }
  const fixtureUnchanged = beforeFixture === afterFixture;
  const stdoutBytes = Buffer.concat(execution.stdout.parts);
  const stderrBytes = Buffer.concat(execution.stderr.parts);
  const ok = execution.terminal.code === 0 && !execution.timedOut && execution.ownedProcessGroupGone && !execution.stderr.overflow && stream.ok && verdictError === null && fixtureUnchanged && (!debugContext || execution.category === null);
  const result = Object.freeze({
    ok,
    category: ok ? "pass" : execution.timedOut ? "lease-timeout" : !stream.ok ? stream.category : verdictError ? "invalid-verdict" : "process-or-fixture-failed",
    invocationSha256: invocationHash(invocation.command, invocation.args),
    bundleSha256: reviewBundle.hash,
    profileSha256: permissionProfile.hash,
    verdictSha256: resultBytes ? sha256(resultBytes) : null,
    process: Object.freeze({ exitCode: execution.terminal.code, signal: execution.terminal.signal, timedOut: execution.timedOut, ownedProcessGroupGone: execution.ownedProcessGroupGone, error: execution.terminal.error }),
    stream: Object.freeze({ toolFree: stream.ok, category: stream.category, events: stream.events, bytes: execution.stdout.totalBytes, sha256: sha256(stdoutBytes), overflow: execution.stdout.overflow }),
    stderr: Object.freeze({ bytes: execution.stderr.totalBytes, sha256: sha256(stderrBytes), overflow: execution.stderr.overflow }),
    fixtureUnchanged,
    cleanup: true,
    diagnostics: execution.diagnostics,
    ...(debugContext ? { debugTimedOut: execution.timedOut, debugObserverOk: execution.category === null } : {}),
  });
  return result;
  } finally {
    await rm(coordinator, { recursive: true, force: true });
  }
}

function publicRun(run) { if (!run) return null; const { diagnostics, debugTimedOut, debugObserverOk, ...safe } = run; return safe; }

function binaryBinding(value) {
  return Object.freeze({
    binarySha256: value.binarySha256,
    versionSha256: value.versionSha256,
    runtimeRootSha256: value.runtimeRootSha256,
    runtimeManifestSha256: value.runtimeManifestSha256,
    runtimeEntries: value.runtimeEntries,
  });
}
function sameBinaryBinding(left, right) { return canonical(binaryBinding(left)) === canonical(binaryBinding(right)); }

async function runProfileBoundIsolationNormal({ repoRoot, candidateCommit, artifactPaths, schemaPath, fixtureParent = os.tmpdir(), externalParent = path.dirname(repoRoot ?? ""), pathEnv = process.env.PATH, spawn = nodeSpawn, execFileSync = nodeExecFileSync, env = process.env, onHeartbeat = () => {}, resolvedBinary = null, binaryInspection = null, contractInspection = null, inspectBinary = inspectCodexBinary } = {}) {
  assertAbsolute(repoRoot, "repoRoot");
  if (!isFullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
  if (!Array.isArray(artifactPaths) || artifactPaths.length !== CODEX_CRITIC_ARTIFACTS.length || artifactPaths.some((entry, index) => entry !== CODEX_CRITIC_ARTIFACTS[index])) fail("profile-bound acceptance requires the exact five public artifacts");
  const head = gitText(repoRoot, ["rev-parse", "HEAD"], execFileSync);
  if (head !== candidateCommit) fail("candidateCommit must equal the current Shared HEAD");
  const dirty = git(repoRoot, ["status", "--porcelain=v1", "--", ...artifactPaths], execFileSync).toString("utf8").trim();
  if (dirty) fail("profile-bound acceptance artifacts must be clean at candidate HEAD");
  const codexBinary = resolvedBinary ?? await resolveCodexBinary({ pathEnv });
  assertAbsolute(codexBinary, "codexBinary");
  const binary = binaryInspection ?? await inspectBinary({ codexBinary, execFileSync });
  const contract = contractInspection ?? verifyProfileContract({ codexBinary, execFileSync });
  const fixture = await buildExactFixture({ repoRoot, candidateCommit, artifactPaths, fixtureParent, execFileSync });
  try {
    const profile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: binary.runtimeRoot, profileId: `${CODEX_CRITIC_POLICY.permissionProfile}-${fixture.manifest.nonce.slice(0, 12)}` });
    const reviewBundle = await buildReviewBundle(fixture);
    const fixtureInventorySha256 = await assertFixtureInventory(fixture);
    const schemaInFixture = schemaPath ?? path.join(fixture.root, "plugins", "pipeline-core", "scripts", "critic-verdict.schema.json");
    const preflight = await runPermissionProfilePreflight({ codexBinary, permissionProfile: profile, fixtureRoot: fixture.root, externalParent, spawn, env, onHeartbeat });
    const inventoryAfterPreflight = preflight.ok ? await assertFixtureInventory(fixture) : null;
    const beforeCriticBinary = preflight.ok ? await inspectBinary({ codexBinary, execFileSync }) : null;
    const bindingStableBeforeCritic = preflight.ok && sameBinaryBinding(binary, beforeCriticBinary);
    const critic = bindingStableBeforeCritic && inventoryAfterPreflight === fixtureInventorySha256
      ? await runCodexCritic({ fixture, reviewBundle, permissionProfile: profile, codexBinary, schemaPath: schemaInFixture, spawn, env, onHeartbeat })
      : null;
    const afterCriticBinary = critic ? await inspectBinary({ codexBinary, execFileSync }) : null;
    const bindingStableAfterCritic = critic ? sameBinaryBinding(binary, afterCriticBinary) : false;
    const inventoryAfterCritic = critic ? await assertFixtureInventory(fixture) : null;
    const ok = preflight.ok && bindingStableBeforeCritic && critic?.ok === true && bindingStableAfterCritic && inventoryAfterCritic === fixtureInventorySha256;
    return Object.freeze({
      ok,
      envelope: Object.freeze({
        schema: CODEX_CRITIC_POLICY.schema,
        candidateCommit: fixture.manifest.candidateCommit,
        candidateTree: fixture.manifest.tree,
        candidateParent: fixture.manifest.parent,
        candidateParentTree: fixture.manifest.parentTree,
        fixtureManifestSha256: fixture.manifestHash,
        fixtureInventorySha256,
        reviewBundleSha256: reviewBundle.hash,
        reviewContractSha256: reviewContractHash(),
        adapter: CODEX_CRITIC_POLICY.adapter,
        policySha256: sha256(canonical(CODEX_CRITIC_POLICY)),
        preflightLeaseMs: CODEX_CRITIC_POLICY.preflightLeaseMs,
        criticLeaseMs: CODEX_CRITIC_POLICY.criticLeaseMs,
        sourceReferenceSha256: sha256(canonical(CODEX_CRITIC_POLICY.sourceReference)),
        model: CODEX_CRITIC_POLICY.model,
        effort: CODEX_CRITIC_POLICY.effort,
        permissionProfileSha256: profile.hash,
        binarySha256: binary.binarySha256,
        versionSha256: binary.versionSha256,
        runtimeRootSha256: binary.runtimeRootSha256,
        runtimeManifestSha256: binary.runtimeManifestSha256,
        runtimeEntries: binary.runtimeEntries,
        contractSha256: contract.contractSha256,
        bindingStableBeforeCritic,
        bindingStableAfterCritic,
        fixtureInventoryStable: inventoryAfterPreflight === fixtureInventorySha256 && inventoryAfterCritic === fixtureInventorySha256,
        preflight: publicRun(preflight),
        critic: publicRun(critic),
      }),
      localDiagnostics: Object.freeze({ preflight: preflight.diagnostics ?? null, critic: critic?.diagnostics ?? null }),
      reason: ok ? null : "profile-bound isolation evidence is incomplete or failed",
    });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}

class DebugIsolationFailure extends Error {
  constructor(step, original = null) { super(`debug isolation failed at ${step}`); this.step = step; this.original = original; }
}

function debugCause(step, { critic, preflight } = {}) {
  if (step === "critic" && critic?.debugTimedOut === true) return "response-stalled";
  if (step === "input" || step === "commit") return "coordinator-input";
  if (step === "preflight" && Object.values(preflight?.probes ?? {}).some((probe) => probe?.process?.timedOut === true)) return "child-process";
  if (step === "preflight") return "child-process";
  if (step === "critic" && critic?.stream?.toolFree === false) return "jsonl-lifecycle";
  if (step === "critic" && critic) return "child-process";
  if (step === "result") return "result-sink";
  if (["binary", "fixture", "bundle", "profile", "binding-before", "binding-after", "canary"].includes(step)) return "fixture-or-binding";
  if (step === "cleanup") return "cleanup";
  return "unbestimmt";
}

function isolationResult({ fixture, reviewBundle, fixtureInventorySha256, profile, binary, contract, preflight, critic, inventoryAfterPreflight, inventoryAfterCritic, bindingStableBeforeCritic, bindingStableAfterCritic }) {
  const ok = preflight?.ok === true && bindingStableBeforeCritic === true && critic?.ok === true && bindingStableAfterCritic === true && inventoryAfterCritic === fixtureInventorySha256;
  return Object.freeze({
    ok,
    envelope: Object.freeze({
      schema: CODEX_CRITIC_POLICY.schema,
      candidateCommit: fixture.manifest.candidateCommit,
      candidateTree: fixture.manifest.tree,
      candidateParent: fixture.manifest.parent,
      candidateParentTree: fixture.manifest.parentTree,
      fixtureManifestSha256: fixture.manifestHash,
      fixtureInventorySha256,
      reviewBundleSha256: reviewBundle.hash,
      reviewContractSha256: reviewContractHash(),
      adapter: CODEX_CRITIC_POLICY.adapter,
      policySha256: sha256(canonical(CODEX_CRITIC_POLICY)),
      preflightLeaseMs: CODEX_CRITIC_POLICY.preflightLeaseMs,
      criticLeaseMs: CODEX_CRITIC_POLICY.criticLeaseMs,
      sourceReferenceSha256: sha256(canonical(CODEX_CRITIC_POLICY.sourceReference)),
      model: CODEX_CRITIC_POLICY.model,
      effort: CODEX_CRITIC_POLICY.effort,
      permissionProfileSha256: profile.hash,
      binarySha256: binary.binarySha256,
      versionSha256: binary.versionSha256,
      runtimeRootSha256: binary.runtimeRootSha256,
      runtimeManifestSha256: binary.runtimeManifestSha256,
      runtimeEntries: binary.runtimeEntries,
      contractSha256: contract.contractSha256,
      bindingStableBeforeCritic: bindingStableBeforeCritic === true,
      bindingStableAfterCritic: bindingStableAfterCritic === true,
      fixtureInventoryStable: inventoryAfterPreflight === fixtureInventorySha256 && inventoryAfterCritic === fixtureInventorySha256,
      preflight: publicRun(preflight),
      critic: publicRun(critic),
    }),
    localDiagnostics: Object.freeze({ preflight: preflight?.diagnostics ?? null, critic: critic?.diagnostics ?? null }),
    reason: ok ? null : "profile-bound isolation evidence is incomplete or failed",
  });
}

async function runProfileBoundIsolationDebug({ repoRoot, candidateCommit, artifactPaths, schemaPath, fixtureParent = os.tmpdir(), externalParent = path.dirname(repoRoot ?? ""), pathEnv = process.env.PATH, spawn = nodeSpawn, execFileSync = nodeExecFileSync, env = process.env, onHeartbeat = () => {}, resolvedBinary = null, binaryInspection = null, contractInspection = null, inspectBinary = inspectCodexBinary, debugContext } = {}) {
  if (!isPlainTraceObject(debugContext) || typeof debugContext.tracePath !== "string") fail("debugContext requires tracePath");
  const allowed = new Set(["tracePath", "forbiddenRoots", "onProgress", "onSummary"]);
  if (Object.keys(debugContext).some((key) => !allowed.has(key))) fail("debugContext contains an unknown field");
  const forbiddenRoots = debugContext.forbiddenRoots ?? [];
  if (!Array.isArray(forbiddenRoots)) fail("debugContext forbiddenRoots must be an array");
  const onProgress = debugContext.onProgress ?? (() => {}); const onSummary = debugContext.onSummary ?? (() => {});
  if (typeof onProgress !== "function" || typeof onSummary !== "function") fail("debugContext callbacks must be functions");
  assertAbsolute(repoRoot, "repoRoot"); assertAbsolute(debugContext.tracePath, "tracePath");
  const debugScope = await mkdtemp(path.join(fixtureParent, "pipeline-codex-debug-fixture-"));
  let traceStore; let fixture = null; let currentStep = null; let resultEvidence = Object.freeze({ present: false, bytes: 0, sha256: null });
  let codexBinary; let binary; let contract; let reviewBundle; let fixtureInventorySha256; let profile; let preflight = null; let critic = null;
  let inventoryAfterPreflight = null; let inventoryAfterCritic = null; let bindingStableBeforeCritic = false; let bindingStableAfterCritic = false;
  const privateRoots = [repoRoot, debugScope];
  try {
    traceStore = await createSecureTraceStore({ tracePath: debugContext.tracePath, repoRoot, fixtureRoot: debugScope, forbiddenRoots, privateRoots });
    await traceStore.append("run.started", {});
    const step = async (name, action, accepted = () => true) => {
      currentStep = name; await traceStore.append("step.started", { step: name });
      try {
        const value = await action();
        if (!accepted(value)) throw new DebugIsolationFailure(name);
        await traceStore.append("step.completed", { step: name });
        await traceStore.sync();
        currentStep = null;
        try { onProgress(Object.freeze({ step: name, status: "completed" })); } catch { /* Progress display cannot alter evidence. */ }
        return value;
      } catch (error) {
        await traceStore.append("step.failed", { step: name }); currentStep = null;
        throw error instanceof DebugIsolationFailure ? error : new DebugIsolationFailure(name, error);
      }
    };
    await step("input", async () => {
      if (!isFullSha(candidateCommit)) fail("candidateCommit must be a full SHA");
      if (!Array.isArray(artifactPaths) || artifactPaths.length !== CODEX_CRITIC_ARTIFACTS.length || artifactPaths.some((entry, index) => entry !== CODEX_CRITIC_ARTIFACTS[index])) fail("profile-bound acceptance requires the exact five public artifacts");
    });
    await step("commit", async () => {
      const head = gitText(repoRoot, ["rev-parse", "HEAD"], execFileSync);
      if (head !== candidateCommit) fail("candidateCommit must equal the current Shared HEAD");
      const dirty = git(repoRoot, ["status", "--porcelain=v1", "--", ...artifactPaths], execFileSync).toString("utf8").trim();
      if (dirty) fail("profile-bound acceptance artifacts must be clean at candidate HEAD");
    });
    await step("binary", async () => {
      codexBinary = resolvedBinary ?? await resolveCodexBinary({ pathEnv }); assertAbsolute(codexBinary, "codexBinary");
      binary = binaryInspection ?? await inspectBinary({ codexBinary, execFileSync });
      contract = contractInspection ?? verifyProfileContract({ codexBinary, execFileSync });
      return codexBinary;
    });
    fixture = await step("fixture", () => buildExactFixture({ repoRoot, candidateCommit, artifactPaths, fixtureParent: debugScope, execFileSync }));
    reviewBundle = await step("bundle", () => buildReviewBundle(fixture));
    await step("profile", async () => {
      profile = buildPermissionProfile({ fixtureRoot: fixture.root, runtimeRoot: binary.runtimeRoot, profileId: `${CODEX_CRITIC_POLICY.permissionProfile}-${fixture.manifest.nonce.slice(0, 12)}` });
      fixtureInventorySha256 = await assertFixtureInventory(fixture);
    });
    const childDebug = { traceStore, privateIdentifiers: [], privateRoots: [repoRoot, fixture.root, binary.runtimeRoot] };
    await step("preflight", async () => {
      preflight = await runPermissionProfilePreflight({ codexBinary, permissionProfile: profile, fixtureRoot: fixture.root, externalParent, spawn, env, onHeartbeat, debugContext: childDebug });
      return preflight;
    }, (value) => value.ok === true);
    await step("binding-before", async () => {
      inventoryAfterPreflight = await assertFixtureInventory(fixture);
      const beforeCriticBinary = await inspectBinary({ codexBinary, execFileSync });
      bindingStableBeforeCritic = sameBinaryBinding(binary, beforeCriticBinary);
      return bindingStableBeforeCritic && inventoryAfterPreflight === fixtureInventorySha256;
    }, Boolean);
    const schemaInFixture = schemaPath ?? path.join(fixture.root, "plugins", "pipeline-core", "scripts", "critic-verdict.schema.json");
    await step("critic", async () => {
      critic = await runCodexCritic({ fixture, reviewBundle, permissionProfile: profile, codexBinary, schemaPath: schemaInFixture, spawn, env, onHeartbeat, debugContext: { ...childDebug, onResultEvidence: (value) => { resultEvidence = value; } } });
      return critic;
    }, (value) => {
      const processOk = value.process && value.process.exitCode === 0 && !value.process.timedOut && value.process.ownedProcessGroupGone && value.process.error === null;
      return processOk && value.stream?.toolFree === true && value.stderr?.overflow === false && value.debugObserverOk === true;
    });
    await step("binding-after", async () => {
      const afterCriticBinary = await inspectBinary({ codexBinary, execFileSync });
      bindingStableAfterCritic = sameBinaryBinding(binary, afterCriticBinary);
      return bindingStableAfterCritic;
    }, Boolean);
    await step("result", async () => { await traceStore.append("result.observed", resultEvidence); return critic.category !== "invalid-verdict"; }, Boolean);
    await step("canary", async () => {
      inventoryAfterCritic = await assertFixtureInventory(fixture);
      return critic.fixtureUnchanged === true && inventoryAfterCritic === fixtureInventorySha256;
    }, Boolean);
    await step("cleanup", async () => { await rm(fixture.root, { recursive: true, force: true }); });
    await traceStore.append("run.completed", { cause: "unbestimmt" });
    const summary = await traceStore.finalize({ outcome: "completed", cause: "unbestimmt" });
    try { onSummary(Object.freeze({ outcome: summary.outcome, cause: summary.cause, recordCount: summary.recordCount })); } catch { /* Summary display cannot alter evidence. */ }
    return isolationResult({ fixture, reviewBundle, fixtureInventorySha256, profile, binary, contract, preflight, critic, inventoryAfterPreflight, inventoryAfterCritic, bindingStableBeforeCritic, bindingStableAfterCritic });
  } catch (error) {
    const failedStep = error instanceof DebugIsolationFailure ? error.step : currentStep;
    if (fixture) await rm(fixture.root, { recursive: true, force: true }).catch(() => {});
    if (traceStore && failedStep) {
      const cause = debugCause(failedStep, { critic, preflight });
      await traceStore.append("run.failed", { cause });
      const summary = await traceStore.finalize({ outcome: "failed", cause });
      try { onSummary(Object.freeze({ outcome: summary.outcome, cause: summary.cause, recordCount: summary.recordCount })); } catch { /* Summary display cannot alter evidence. */ }
    }
    if (error instanceof DebugIsolationFailure && ["preflight", "binding-before", "critic", "binding-after", "result", "canary"].includes(error.step)) {
      return isolationResult({ fixture, reviewBundle, fixtureInventorySha256, profile, binary, contract, preflight, critic, inventoryAfterPreflight, inventoryAfterCritic, bindingStableBeforeCritic, bindingStableAfterCritic });
    }
    throw error instanceof DebugIsolationFailure && error.original ? error.original : error;
  } finally { await rm(debugScope, { recursive: true, force: true }); }
}

export async function runProfileBoundIsolation(options = {}) {
  return options.debugContext === undefined ? runProfileBoundIsolationNormal(options) : runProfileBoundIsolationDebug(options);
}

export async function verifyFixtureTree(root) { const info = await stat(root); if (!info.isDirectory()) fail("fixture root is not a directory"); return directoryHash(root); }
