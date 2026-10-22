#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Dispatch recovery verb (AC-245, greenfield finding P1-1 bullet 3, PO decision D139): the first caller of
 * lib/dispatch-recovery-state.mjs. A dispatcher or Goldfish records, reads and clears the ONE recovery state of a
 * failed or refused role dispatch, so the course keeps the same task identity and attempt history; neither a chat
 * message nor a renamed task can stand in for it (the state is bound to {dispatchId, role, candidate}).
 *
 * Closed grammar (any other argv is refused before anything is read or written):
 *   record  --root <abs-dir> --packet <file> --result <file> [--expected-attempts <n>]
 *   inspect --root <abs-dir> --dispatch-id <id>
 *   clear   --root <abs-dir> --dispatch-id <id> [--discard-corrupt]
 *
 * Every outcome is one JSON line on stdout. Exit 0 = ok, 1 = refusal (never any state written), 2 = usage.
 * Single-writer discipline of the module applies: the attempt-count compare-and-swap detects a lost update, it is
 * not a lock.
 */
import { lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  openDispatchRecovery,
  readDispatchRecovery,
  recordRecoveryAttempt,
  taskIdentityOf,
} from "../lib/dispatch-recovery-state.mjs";

export const DISPATCH_RECOVERY_CLI_SCHEMA = "pipeline.dispatch-recovery-cli.v1";
export const MAX_INPUT_BYTES = 65536;

const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const USAGE = "record --root <abs-dir> --packet <file> --result <file> [--expected-attempts <n>] | inspect --root <abs-dir> --dispatch-id <id> | clear --root <abs-dir> --dispatch-id <id> [--discard-corrupt]";
const GRAMMAR = {
  record: { value: ["--root", "--packet", "--result", "--expected-attempts"], flag: [], required: ["--root", "--packet", "--result"] },
  inspect: { value: ["--root", "--dispatch-id"], flag: [], required: ["--root", "--dispatch-id"] },
  clear: { value: ["--root", "--dispatch-id"], flag: ["--discard-corrupt"], required: ["--root", "--dispatch-id"] },
};

const fail = (code, message, repair, extra = {}) => ({ schema: DISPATCH_RECOVERY_CLI_SCHEMA, ok: false, code, message, repair, ...extra });

/** Closed argv parse: unknown verb, unknown/duplicate/valueless flag or missing required flag is a usage refusal. */
export function parseArgv(argv) {
  const [verb, ...rest] = argv;
  const spec = GRAMMAR[verb];
  if (spec === undefined) return fail("DRC-USAGE", `Unknown or missing verb ${JSON.stringify(verb ?? null)}.`, `Run one of: ${USAGE}`);
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (spec.flag.includes(name)) {
      if (name in options) return fail("DRC-USAGE", `Duplicate ${name}.`, `Pass ${name} at most once: ${USAGE}`);
      options[name] = true;
    } else if (spec.value.includes(name)) {
      const value = rest[index + 1];
      if (name in options) return fail("DRC-USAGE", `Duplicate ${name}.`, `Pass ${name} at most once: ${USAGE}`);
      if (value === undefined || value.startsWith("--")) return fail("DRC-USAGE", `${name} needs a value.`, `Pass ${name} <value>: ${USAGE}`);
      options[name] = value;
      index += 1;
    } else {
      return fail("DRC-USAGE", `Argument ${JSON.stringify(name)} is not part of the ${verb} grammar.`, `Run exactly: ${USAGE}`);
    }
  }
  const missing = spec.required.find((name) => !(name in options));
  if (missing !== undefined) return fail("DRC-USAGE", `${missing} is required for ${verb}.`, `Add ${missing}: ${USAGE}`);
  return { ok: true, verb, options };
}

/** The exact-root argument: an absolute, normalized, symlink-free existing directory. */
function checkRoot(root) {
  const repair = "Pass --root as the absolute, normalized path of an existing directory (no symlink, no '..').";
  try {
    if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || !lstatSync(root).isDirectory()) {
      return fail("DRC-ROOT", "The root is not an exact absolute directory path.", repair);
    }
  } catch {
    return fail("DRC-ROOT", "The root does not exist or cannot be read.", repair);
  }
  return null;
}

function readJsonInput(path, flag) {
  const repair = `Pass ${flag} as a regular file (no symlink) of at most ${MAX_INPUT_BYTES} bytes holding one JSON object.`;
  let text;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) return fail("DRC-INPUT-FILE", `${flag} is not a regular file within ${MAX_INPUT_BYTES} bytes.`, repair);
    text = readFileSync(path, "utf8");
  } catch {
    return fail("DRC-INPUT-FILE", `${flag} cannot be read.`, repair);
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return { ok: true, value };
  } catch {
    return fail("DRC-INPUT-FILE", `${flag} does not hold one JSON object.`, repair);
  }
}

/** Maps a module refusal to a self-describing refusal that names one runnable repair. */
function describeRefusal(refused, { dispatchId } = {}) {
  const code = refused.code;
  const id = dispatchId ?? "<id>";
  const table = {
    "DRS-INPUT": ["The root or dispatch id is not valid for the recovery state.", `Use a dispatch id matching ${ID} and the exact absolute --root.`],
    "DRS-ATTEMPT-INVALID": ["The result is not a pipeline.canonical-role-fallback.v1 result of this very task.", "Pass --result as the unmodified JSON that runCanonicalRoleFallback returned for the same packet."],
    "DRS-EXISTS": ["A recovery state already exists for this task.", `Run: inspect --root <root> --dispatch-id ${id}, then record with --expected-attempts <attempts>.`],
    "DRS-NO-RECOVERY": ["No recovery state exists for this task.", "Run record with the first failed fallback result to open one."],
    "DRS-CORRUPT": ["The recovery state file is unreadable or fails verification.", `Run: clear --root <root> --dispatch-id ${id} --discard-corrupt, then record the first failed result again.`],
    "DRS-IDENTITY-MISMATCH": ["The packet's role or candidate differs from the recorded task; a renamed or re-bound task cannot continue it.", "Use the original packet of this task."],
    "DRS-TERMINAL": ["The recovery state is already resolved by a returned attempt.", `Run: clear --root <root> --dispatch-id ${id} if a fresh recovery is needed.`],
    "DRS-STALE": ["The expected attempt count is missing or does not match the state.", `Run record again with --expected-attempts ${refused.attempts ?? "<attempts>"}.`],
    "DRS-ATTEMPT-LIMIT": ["The bounded attempt history is full.", "Stop retrying this task and hand it to the Elephant; the recorded history is kept."],
    "DRS-WRITE-FAILED": ["The state could not be written atomically; nothing was changed.", "Check that <root>/evidence is writable and retry the same command."],
  };
  const [message, repair] = table[code] ?? ["The recovery module refused.", `Run: ${USAGE}`];
  return fail(code, message, repair, refused.attempts === undefined ? {} : { attempts: refused.attempts });
}

async function record(options) {
  const packetRead = readJsonInput(options["--packet"], "--packet");
  if (!packetRead.ok) return packetRead;
  const resultRead = readJsonInput(options["--result"], "--result");
  if (!resultRead.ok) return resultRead;
  const identity = taskIdentityOf(packetRead.value);
  if (identity === null) {
    return fail("DRC-PACKET", "The packet carries no valid task identity (dispatchId, role, candidate.commit, candidate.tree).", "Pass --packet as the role-dispatch packet of the failed task.");
  }
  const expectedText = options["--expected-attempts"];
  let expectedAttempts;
  if (expectedText !== undefined) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(expectedText)) return fail("DRC-USAGE", "--expected-attempts is not a small non-negative integer.", "Pass the attempt count printed by inspect.");
    expectedAttempts = Number(expectedText);
  }
  const root = options["--root"];
  const existing = readDispatchRecovery({ root, dispatchId: identity.dispatchId });
  const common = { root, packet: packetRead.value, result: resultRead.value };
  let outcome;
  if (!existing.ok && existing.code === "DRS-NO-RECOVERY") {
    if (expectedAttempts !== undefined && expectedAttempts !== 0) {
      return fail("DRC-EXPECTED", "No state exists yet, but a nonzero --expected-attempts was passed.", "Omit --expected-attempts (or pass 0) to open the state.", { dispatchId: identity.dispatchId });
    }
    outcome = await openDispatchRecovery(common);
  } else if (!existing.ok) {
    return describeRefusal(existing, identity);
  } else {
    outcome = await recordRecoveryAttempt({ ...common, expectedAttempts });
  }
  return outcome.ok ? { schema: DISPATCH_RECOVERY_CLI_SCHEMA, ok: true, verb: "record", state: outcome.state } : describeRefusal(outcome, identity);
}

function inspect(options) {
  const dispatchId = options["--dispatch-id"];
  const read = readDispatchRecovery({ root: options["--root"], dispatchId });
  return read.ok ? { schema: DISPATCH_RECOVERY_CLI_SCHEMA, ok: true, verb: "inspect", state: read.state } : describeRefusal(read, { dispatchId });
}

function clear(options) {
  const dispatchId = options["--dispatch-id"];
  const root = options["--root"];
  const read = readDispatchRecovery({ root, dispatchId });
  if (!read.ok && read.code === "DRS-CORRUPT" && options["--discard-corrupt"] === true) {
    // Only the verified path of this exact task is removed, and only when it is a plain file or a link (never a directory).
    const path = join(root, "evidence", `dispatch-recovery-${dispatchId}.json`);
    try {
      if (lstatSync(path).isDirectory()) return fail("DRC-CLEAR", "The corrupt state path is a directory; nothing was removed.", "Remove that directory by hand, then run record.", { dispatchId });
      rmSync(path);
    } catch {
      return fail("DRC-CLEAR", "The corrupt state could not be removed; nothing was changed.", "Check that <root>/evidence is writable and retry the same command.", { dispatchId });
    }
    return { schema: DISPATCH_RECOVERY_CLI_SCHEMA, ok: true, verb: "clear", dispatchId, discarded: "corrupt" };
  }
  if (!read.ok) return describeRefusal(read, { dispatchId });
  if (options["--discard-corrupt"] === true) {
    return fail("DRC-NOT-CORRUPT", "--discard-corrupt applies only to a state that fails verification; this one is valid.", `Run clear without --discard-corrupt (allowed once the state is resolved).`, { dispatchId });
  }
  if (read.state.status !== "resolved") {
    return fail("DRC-OPEN-STATE", "The recovery is still open; clearing it would drop the attempt history.", `Record the returned attempt (record --expected-attempts ${read.state.attempts.length}) or hand the task to the Elephant; an open state is never cleared.`, { dispatchId, attempts: read.state.attempts.length });
  }
  try { rmSync(join(root, "evidence", `dispatch-recovery-${dispatchId}.json`)); } catch {
    return fail("DRC-CLEAR", "The resolved state could not be removed; nothing was changed.", "Check that <root>/evidence is writable and retry the same command.", { dispatchId });
  }
  return { schema: DISPATCH_RECOVERY_CLI_SCHEMA, ok: true, verb: "clear", dispatchId, discarded: "resolved" };
}

/** Runs one verb; returns the result object (never throws, never writes on a refusal). */
export async function runDispatchRecovery(argv) {
  const parsed = parseArgv(argv);
  if (!parsed.ok) return parsed;
  const rootRefusal = checkRoot(parsed.options["--root"]);
  if (rootRefusal !== null) return rootRefusal;
  const dispatchId = parsed.options["--dispatch-id"];
  if (dispatchId !== undefined && !ID.test(dispatchId)) {
    return fail("DRS-INPUT", "The dispatch id is not valid.", `Use a dispatch id matching ${ID}.`);
  }
  try {
    if (parsed.verb === "record") return await record(parsed.options);
    return parsed.verb === "inspect" ? inspect(parsed.options) : clear(parsed.options);
  } catch {
    return fail("DRC-INTERNAL", "The recovery verb failed unexpectedly; no state change is guaranteed.", "Run inspect to read the current state, then retry the same command.");
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runDispatchRecovery(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : (result.code === "DRC-USAGE" ? 2 : 1);
}
