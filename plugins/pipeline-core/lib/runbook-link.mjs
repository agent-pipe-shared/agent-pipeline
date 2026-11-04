// SPDX-License-Identifier: SUL-1.0

/**
 * The typed `runbook` link of a standard command's first result (C19-G5 rest, AC-108): `{ path, digest, step }` names the generated
 * runbook of the lifecycle path the command belongs to (`path` is relative to the plugin root, `digest` the sha256 of that file as
 * runbooks/index.v1.json records it) and the step the command is. It is advice for the agent, never an input to a decision.
 *
 * Once per session and path: a small marker file `agent-pipeline/runbook-shown/<session>-<path>` under the Git common directory (the
 * control directory) is created exclusively on the first sighting; a later call finds it and leaves the link out. A refusal always carries
 * the link and neither reads nor writes the marker. Every uncertainty fails toward showing the link: no session id in the environment, no
 * Git common directory, an unwritable control directory. The link is added as a trailing key, so every existing field stays byte-identical.
 */
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGitCommonDir } from "./po-key-directory.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_PREFIX = "plugins/pipeline-core/";
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH_ID = /^[a-z][a-z-]{0,31}$/u;

/** The link for `pathId`/`step`, or null when the runbook index does not know the path (never throws). */
export function runbookLink(pathId, step, { pluginRoot = PLUGIN_ROOT } = {}) {
  try {
    const entry = JSON.parse(readFileSync(join(pluginRoot, "runbooks", "index.v1.json"), "utf8")).paths.find((p) => p?.pathId === pathId);
    if (typeof entry?.path !== "string" || !entry.path.startsWith(PLUGIN_PREFIX) || typeof entry.sha256 !== "string") return null;
    return { path: entry.path.slice(PLUGIN_PREFIX.length), digest: entry.sha256, step };
  } catch {
    return null;
  }
}

/** True when this session has not been shown the path's link yet; claims the marker as it answers. */
function firstSighting({ pathId, rootDir, env }) {
  const sessionId = [env?.CLAUDE_CODE_SESSION_ID, env?.CODEX_SESSION_ID, env?.CODEX_THREAD_ID].find((v) => typeof v === "string" && SESSION_ID.test(v));
  if (sessionId === undefined || typeof rootDir !== "string" || !PATH_ID.test(pathId)) return true;
  try {
    const common = resolveGitCommonDir(rootDir);
    if (common === null) return true;
    const directory = join(common, "agent-pipeline");
    // Private by construction: the session authority registry rejects any entry under agent-pipeline/ that is group or world accessible,
    // and reads every direct entry there as a file, so the marker is one flat file rather than a subdirectory.
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    closeSync(openSync(join(directory, `runbook-shown-${createHash("sha256").update(sessionId).digest("hex").slice(0, 32)}-${pathId}`), "wx", 0o600));
    return true;
  } catch (error) {
    return error?.code !== "EEXIST";
  }
}

/** `result` plus a trailing `runbook` key when the link is due (first sighting, or `refused`); otherwise `result` itself. */
export function attachRunbookLink(result, { pathId, step, refused = false, rootDir = null, env = process.env, pluginRoot = PLUGIN_ROOT } = {}) {
  const link = runbookLink(pathId, step, { pluginRoot });
  if (link === null || (refused !== true && !firstSighting({ pathId, rootDir, env }))) return result;
  return { ...result, runbook: link };
}

/** The same link as one typed text line for commands that print prose: `runbook: {"path":...,"digest":...,"step":...}`, or null. */
export function runbookLine(options) {
  const { runbook } = attachRunbookLink({}, options);
  return runbook === undefined ? null : `runbook: ${JSON.stringify(runbook)}`;
}
