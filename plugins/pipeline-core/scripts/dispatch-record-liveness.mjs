#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// dispatch-record-liveness.mjs [--root <root>] [--task <task id>]
// dispatch-record-liveness.mjs [--root <root>] --second-writer <own task ids, comma separated, or "-">
//   ALF-K39: the guard-side mode, spawned by hooks/guard-dispatch.mjs (a spawn, not an import: the hook sits in a module cycle that a
//   static or dynamic import of worktree-lifecycle would break). Prints no JSON: a refusal (exit 2) or an unjudgeable advisory (exit 0)
//   as text on stderr, exactly as the hook relays it. An open record whose owner is alive refuses; gone never blocks; unjudgeable warns.
//
// dispatch-record-liveness.mjs [--root <root>] --scope-overlap stdin
//   K93/K104: the second guard-side mode, spawned by hooks/guard-dispatch.mjs for the same reason: judges the write scopes of the Goldfish
//   dispatches of one call (a JSON list [{ id, scope }] on stdin) against each other and against the open dispatch records whose owner is
//   not gone. Same text-on-stderr contract: an overlap in enforce mode exits 2, everything else exits 0 (see lib/dispatch-record-liveness.mjs).
//
// PO decision D110: a READ-ONLY readback of whether the owner of each OPEN dispatch record is still running, from the existing session
// owner runtime judgement (PID plus process start identity) reached through the record's v2 owner claim. Prints one JSON document
// (pipeline.dispatch-record-liveness.v1): per open record its task id, claim kind, verdict (alive | gone | unjudgeable) and a reason
// code. `unjudgeable` is deliberate: a v1 claim or a Claude hook identity carries no owner process, and nothing is called gone without
// proof. It mutates nothing, takes no lock and never retires or heals. Exit 0: inspected. Exit 2: refused (DRL-ARGS | DRL-ROOT).
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { DISPATCH_RECORD_LIVENESS_SCHEMA, readDispatchRecordLiveness, readRunningDispatches, scopeOverlapAdmission, scopeOverlapMode, secondWriterAdmission } from "../lib/dispatch-record-liveness.mjs";
import { parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";
import { resolveGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { scopesOverlap } from "../lib/slice-queue.mjs";

const short = (error) => String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 240);

/** The governed queue row of an id, or null (no governed queue, or no such row). */
const governedQueueRow = (root, id) => { const governed = resolveGovernedItemQueue({ root }); return governed.status === "required" ? governed.normalized.slices.find((row) => row.id === id) ?? null : null; };

function parse(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]?.startsWith("--") ? argv[index].slice(2) : null;
    if (name !== "root" && name !== "task" && name !== "second-writer" && name !== "scope-overlap") return { error: `unknown argument ${String(argv[index]).slice(0, 40)}` };
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--") || Object.hasOwn(flags, name)) return { error: `--${name} needs one value` };
    flags[name] = value; index += 1;
  }
  if (flags.task !== undefined && !/^[A-Za-z0-9._-]+$/u.test(flags.task)) return { error: "--task is not a safe task id" };
  if (flags["second-writer"] !== undefined && flags.task !== undefined) return { error: "--second-writer and --task cannot be combined" };
  if (flags["scope-overlap"] !== undefined && (flags["scope-overlap"] !== "stdin" || flags.task !== undefined || flags["second-writer"] !== undefined)) return { error: "--scope-overlap takes exactly the value stdin and cannot be combined" };
  return { flags };
}

export function runDispatchRecordLiveness(argv, out = (text) => process.stdout.write(text), { cwd = process.cwd(), err = (text) => process.stderr.write(text), readInput = () => readFileSync(0, "utf8"), env = process.env } = {}) {
  const emit = (value, code) => { out(`${JSON.stringify(value)}\n`); return code; };
  const refuse = (code, reason) => emit({ schema: DISPATCH_RECORD_LIVENESS_SCHEMA, status: "refused", code, reason }, 2);
  const parsed = parse(argv);
  if (argv.includes("--scope-overlap")) {
    // K93/K104, guard mode: stdin is the JSON list [{ id, scope }] the hook declared for the Goldfish dispatches of one call. Only an
    // overlap in enforce mode exits 2; every other outcome, including a failure of this check, is an exit 0 advisory on stderr.
    let verdict;
    try {
      if (parsed.error) throw new Error(parsed.error);
      const root = realpathSync(resolve(cwd, parsed.flags.root ?? "."));
      const declared = JSON.parse(readInput());
      if (!Array.isArray(declared)) throw new Error("stdin is not a list of declared dispatches");
      verdict = scopeOverlapAdmission({
        dispatches: declared.map((entry) => ({ prompt: entry })), declare: (entry) => entry ?? { id: null, scope: null }, overlaps: scopesOverlap,
        running: readRunningDispatches(root, { queueRowFn: governedQueueRow, parseBriefing: parseNativeGoldfishBriefing }), mode: scopeOverlapMode(env),
      });
    } catch (error) { verdict = { refusal: "", warning: `WARNING (guard-dispatch): GUARD-DISPATCH-SCOPE-UNJUDGED: the write-scope overlap check could not run (${short(error)}); this call is admitted without it.\n` }; }
    err(`${verdict.warning}${verdict.refusal}`);
    return verdict.refusal === "" ? 0 : 2;
  }
  if (argv.includes("--second-writer")) {
    // Guard mode: only a live owner may exit 2; every other outcome, including a failure of this check, is an exit 0 advisory.
    let verdict;
    try {
      if (parsed.error) throw new Error(parsed.error);
      const root = realpathSync(resolve(cwd, parsed.flags.root ?? "."));
      verdict = secondWriterAdmission({ root, ownTaskIds: parsed.flags["second-writer"].split(",").filter((id) => /^[A-Za-z0-9._-]+$/u.test(id)) });
    } catch (error) { verdict = { refusal: "", advisory: `WARNING (guard-dispatch): GUARD-DISPATCH-SECOND-WRITER-UNJUDGED: the second-writer check could not run (${short(error)}); this dispatch is admitted without it.\n` }; }
    err(`${verdict.advisory}${verdict.refusal}`);
    return verdict.refusal === "" ? 0 : 2;
  }
  if (parsed.error) return refuse("DRL-ARGS", `${parsed.error}; usage: dispatch-record-liveness.mjs [--root <root>] [--task <task id>]`);
  let result;
  try {
    const root = realpathSync(resolve(cwd, parsed.flags.root ?? "."));
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
    result = readDispatchRecordLiveness(root, parsed.flags.task === undefined ? {} : { task: parsed.flags.task });
  } catch (error) { return refuse("DRL-ROOT", `--root is not a readable Pipeline repository: ${short(error)}`); }
  return emit(result, 0);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = runDispatchRecordLiveness(process.argv.slice(2));
