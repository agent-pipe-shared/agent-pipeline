// SPDX-License-Identifier: SUL-1.0
/**
 * C28e (PO tile 2026-11-12): when a required tool is missing at onboarding, the person may say "later". That answer is recorded on THIS machine,
 * so the agent does not ask again in every session, and it stays visible: the readiness finding of the tool still reads `attended` and names the
 * deferral. A deferral is never a pass: it changes no finding to ok, and the plan and close checks (lib/security-close-status.mjs) never read it,
 * so a critical calibration still refuses a scanner that did not run.
 *
 * Stored in its own file next to the machine plane (`<home>/.agent-pipeline/toolchain-deferrals.json`), not in machine.json: that file has an
 * exact key set, and a new key would make it invalid for every plugin copy that does not know the key yet. The directory is derived from
 * machinePlaneFilePath (lib/machine-plane.mjs, the one derivation of that location).
 */
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { machinePlaneFilePath } from "./machine-plane.mjs";
import { toolchainEntry } from "./toolchain-registry.mjs";

export const TOOLCHAIN_DEFERRALS_SCHEMA = "pipeline.toolchain-deferrals.v1";
const ANSWER_MAX = 200;
const MAX_FILE_BYTES = 16_384;

/** `<home>/.agent-pipeline/toolchain-deferrals.json`, or null when no home directory resolves (the machine plane's own rule). */
export function toolchainDeferralsPath(dependencies = {}) {
  const plane = machinePlaneFilePath(dependencies);
  return plane === null ? null : join(dirname(plane), "toolchain-deferrals.json");
}

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function validEntry(id, entry) {
  return toolchainEntry(id) !== null && object(entry) && Object.keys(entry).every((key) => key === "deferredAt" || key === "answer")
    && typeof entry.deferredAt === "string" && Number.isFinite(Date.parse(entry.deferredAt))
    && typeof entry.answer === "string" && entry.answer.length > 0 && entry.answer.length <= ANSWER_MAX && !/[\x00-\x1f\x7f]/u.test(entry.answer);
}
export function validToolchainDeferrals(value) {
  return object(value) && value.schema === TOOLCHAIN_DEFERRALS_SCHEMA && Object.keys(value).every((key) => key === "schema" || key === "tools")
    && object(value.tools) && Object.entries(value.tools).every(([id, entry]) => validEntry(id, entry));
}

/** The whole file: `{ status: "absent" | "valid" | "invalid", deferrals }`. Never throws; an unreadable or malformed file defers nothing. */
export function readToolchainDeferrals(dependencies = {}) {
  const path = toolchainDeferralsPath(dependencies);
  if (path === null) return { status: "absent", deferrals: null };
  try {
    const info = (dependencies.lstatSyncFn ?? lstatSync)(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return { status: "invalid", deferrals: null };
    const parsed = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(path, "utf8"));
    return validToolchainDeferrals(parsed) ? { status: "valid", deferrals: parsed } : { status: "invalid", deferrals: null };
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "absent" : "invalid", deferrals: null };
  }
}

/** The deferral recorded for one tool on this machine ({ deferredAt, answer }), or null. Never throws. */
export function readToolDeferral(id, dependencies = {}) {
  const read = readToolchainDeferrals(dependencies);
  return read.status === "valid" && Object.hasOwn(read.deferrals.tools, id) ? read.deferrals.tools[id] : null;
}

/**
 * Records that the person deferred installing `id`, with their answer word for word (bounded). Only a tool of the registry whose class is
 * `required` or `required-to-sign` can be deferred; an optional tool needs no deferral. An invalid existing file is never overwritten.
 */
export function recordToolDeferral(id, answer, dependencies = {}) {
  const entry = toolchainEntry(id);
  if (entry === null || !["required", "required-to-sign"].includes(entry.class)) throw new Error(`TOOLCHAIN-DEFER-REFUSED: ${String(id).slice(0, 64)} is not a required tool of the registry`);
  const quote = String(answer ?? "").replace(/\s+/gu, " ").trim().slice(0, ANSWER_MAX);
  if (quote === "") throw new Error("TOOLCHAIN-DEFER-REFUSED: the person's answer is required, word for word");
  const read = readToolchainDeferrals(dependencies);
  if (read.status === "invalid") throw new Error("TOOLCHAIN-DEFER-REFUSED: the existing deferral file is invalid; remove it in your own terminal first");
  const path = toolchainDeferralsPath(dependencies);
  if (path === null) throw new Error("TOOLCHAIN-DEFER-REFUSED: no home directory");
  const next = { schema: TOOLCHAIN_DEFERRALS_SCHEMA, tools: { ...(read.deferrals?.tools ?? {}), [id]: { deferredAt: (dependencies.now ?? (() => new Date()))().toISOString(), answer: quote } } };
  if ((dependencies.existsSyncFn ?? existsSync)(path) && (dependencies.lstatSyncFn ?? lstatSync)(path).isSymbolicLink()) throw new Error("TOOLCHAIN-DEFER-REFUSED: the deferral file is a symbolic link");
  (dependencies.mkdirSyncFn ?? mkdirSync)(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomBytes(12).toString("hex")}`;
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
  } catch (error) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* keep the original failure */ } }
    try { unlinkSync(temporary); } catch { /* nothing of ours is left */ }
    throw error;
  }
  return { status: "recorded", tool: id, deferredAt: next.tools[id].deferredAt };
}

/** Removes the deferral of one tool (the person installed it, or wants to be asked again). Absent is not an error. */
export function clearToolDeferral(id, dependencies = {}) {
  const read = readToolchainDeferrals(dependencies);
  if (read.status !== "valid" || !Object.hasOwn(read.deferrals.tools, id)) return { status: read.status === "invalid" ? "invalid" : "absent", tool: id };
  const { [id]: _removed, ...rest } = read.deferrals.tools;
  const path = toolchainDeferralsPath(dependencies);
  writeFileSync(path, `${JSON.stringify({ schema: TOOLCHAIN_DEFERRALS_SCHEMA, tools: rest }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { status: "cleared", tool: id };
}
