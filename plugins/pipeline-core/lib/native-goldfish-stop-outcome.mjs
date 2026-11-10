// SPDX-License-Identifier: SUL-1.0
/**
 * The last thing a Goldfish SubagentStop does: one private record of how the stop ended, read by scripts/wait-host-commit.mjs. A Claude Elephant gets the child's hand-back
 * before the stop commits, and Claude Code's "Agent finished" notice starts no turn (0 of 32 in one measured run), so nothing else tells it that the stop is over. The record
 * is written after the host commit, the dispatch record and the integration, so a reader that sees it can start the next step without meeting the stop hook.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "pipeline.native-goldfish-stop-outcome.v1";
const MESSAGE_LIMIT = 2_000;
const pathOf = (commonDir, dispatchId) => join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics", `stop-outcome-${createHash("sha256").update(dispatchId).digest("hex").slice(0, 32)}.json`);

/** Never throws: a record that cannot be written leaves the waiter on its timeout, and the stop itself is not affected. */
export function writeNativeGoldfishStopOutcome({ commonDir, dispatchId, result, message, now = () => new Date() } = {}) {
  try {
    if (typeof commonDir !== "string" || typeof dispatchId !== "string" || dispatchId === "") return false;
    const path = pathOf(commonDir, dispatchId), temporary = `${path}.tmp`;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, `${JSON.stringify({ schema: SCHEMA, dispatchId, status: result?.status ?? null, code: result?.code ?? null, commit: typeof result?.commit === "string" ? result.commit : null,
      integration: result?.integration?.status ?? null, message: String(message ?? "").slice(0, MESSAGE_LIMIT), observedAt: now().toISOString() })}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    return true;
  } catch { return false; }
}

/** The record of this dispatch written at or after `after`, or null. `after` keeps the outcome of an earlier attempt under the same id from answering for this one. */
export function readNativeGoldfishStopOutcome({ commonDir, dispatchId, after } = {}) {
  try {
    const record = JSON.parse(readFileSync(pathOf(commonDir, dispatchId), "utf8"));
    if (record?.schema !== SCHEMA || record.dispatchId !== dispatchId) return null;
    return Date.parse(record.observedAt) >= Date.parse(after) ? record : null;
  } catch { return null; }
}

/** The exact command for the launch notice, or null when a path cannot be quoted the one way both Bash and PowerShell read alike. */
export function hostCommitWaitCommand({ root, dispatchId, after, pluginRoot = dirname(dirname(fileURLToPath(import.meta.url))) } = {}) {
  const script = join(pluginRoot, "scripts", "wait-host-commit.mjs");
  if (typeof root !== "string" || root === "" || `${script}${root}`.includes("'") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(dispatchId ?? "")) return null;
  return `node '${script}' --root '${root}' --dispatch ${dispatchId} --after ${after}`;
}
