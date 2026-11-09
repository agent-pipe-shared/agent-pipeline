// SPDX-License-Identifier: SUL-1.0
//
// C21E (Antigravity greenfield): which conversation is running this close?
//
// A command-line process on Antigravity carries no session id, but the pretool hook sees the conversation that issues each command. For a close
// command the hook records that conversation here, and the cleanup producer (a child of the close) reads it to exclude the closing session's own
// descriptor. This is an observation of one command by the hook, never a choice among descriptors. The file holds nothing but the id and its time,
// grants nothing, and a missing, malformed or expired record means "not derived", exactly as before.
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ANTIGRAVITY_CLOSE_SESSION_SCHEMA = "pipeline.antigravity-close-session.v1";
// A close with a full Verify runs long; a record older than this belongs to an earlier close.
export const ANTIGRAVITY_CLOSE_SESSION_TTL_MS = 2 * 60 * 60_000;
const MAX_BYTES = 1024;
const CLOCK_SKEW_MS = 5_000;
const CLOSE_COMMAND = /(?:^|[\s"'/\\])(?:finish-feature|close-coordinator)\.mjs["']?(?:\s|$)/u;
const recordPath = (commonDir) => join(commonDir, "agent-pipeline", "run", "antigravity-close-session.json");

/** True for a shell command that starts a close or one of its steps. */
export function isAntigravityCloseCommand(command) { return typeof command === "string" && CLOSE_COMMAND.test(command); }

/** Called by the pretool hook for a command it is about to admit. Atomic; the caller treats a failure as a diagnostic, never a denial. */
export function recordAntigravityCloseSession({ commonDir, conversationId, now = Date.now() } = {}) {
  const path = recordPath(commonDir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ schema: ANTIGRAVITY_CLOSE_SESSION_SCHEMA, conversationId, recordedAt: now })}\n`, { flag: "wx", mode: 0o600 });
  try { renameSync(temporary, path); } catch (error) { try { unlinkSync(temporary); } catch { /* best effort */ } throw error; }
}

/** @returns {string|null} the conversation id of a current record, otherwise null. */
export function readAntigravityCloseSession({ commonDir, now = Date.now() } = {}) {
  if (typeof commonDir !== "string" || commonDir === "") return null;
  try {
    const path = recordPath(commonDir);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null;
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (record?.schema !== ANTIGRAVITY_CLOSE_SESSION_SCHEMA || typeof record.conversationId !== "string" || !Number.isFinite(record.recordedAt)) return null;
    if (record.recordedAt > now + CLOCK_SKEW_MS || now - record.recordedAt > ANTIGRAVITY_CLOSE_SESSION_TTL_MS) return null;
    return record.conversationId;
  } catch { return null; }
}
