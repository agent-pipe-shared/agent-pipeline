// SPDX-License-Identifier: SUL-1.0

/**
 * Best-effort session memory for operational native-hook failures.
 *
 * This is deliberately not authority state: a missing, forged, or expired
 * entry can only cause another fail-closed observation.  It prevents Codex
 * from repeatedly spending a session's budget on an already classified
 * sandbox failure, while the ordinary Human-override path still receives the
 * original denial tuple.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(tmpdir(), "agent-pipeline-native-hook-failures");
const TTL_MS = 12 * 60 * 60 * 1_000;
const CODES = new Set(["ETIMEDOUT", "EPERM", "EACCES", "EROFS"]);
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function nativeHookSessionId(input, environment = process.env) {
  const value = input?.session_id ?? input?.sessionId
    ?? environment.CODEX_SESSION_ID ?? environment.CODEX_THREAD_ID ?? null;
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,160}$/u.test(value) ? value : null;
}

function pathFor({ rootDir, sessionId, toolName, toolInput, guard }) {
  if (!sessionId) return null;
  return join(ROOT, `${sha({ rootDir, sessionId, toolName, toolInput, guard })}.json`);
}

export function rememberedNativeHookFailure(input, now = Date.now()) {
  const path = pathFor(input);
  if (!path || !existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.expiresAt > now && CODES.has(value.code) && typeof value.reason === "string") return value;
  } catch { /* a corrupt performance hint is ignored */ }
  return null;
}

export function rememberNativeHookFailure(input, { code, reason }, now = Date.now()) {
  const path = pathFor(input);
  if (!path || !CODES.has(code) || typeof reason !== "string") return false;
  try {
    mkdirSync(ROOT, { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify({ code, reason, expiresAt: now + TTL_MS }), { encoding: "utf8", flag: "wx", mode: 0o600 });
    return true;
  } catch { return false; }
}
