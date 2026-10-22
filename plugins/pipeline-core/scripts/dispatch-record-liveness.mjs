#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// dispatch-record-liveness.mjs [--root <root>] [--task <task id>]
// dispatch-record-liveness.mjs [--root <root>] --second-writer <own task ids, comma separated, or "-">
//   ALF-K39: the guard-side mode, spawned by hooks/guard-dispatch.mjs (a spawn, not an import: the hook sits in a module cycle that a
//   static or dynamic import of worktree-lifecycle would break). Prints no JSON: a refusal (exit 2) or an unjudgeable advisory (exit 0)
//   as text on stderr, exactly as the hook relays it. An open record whose owner is alive refuses; gone never blocks; unjudgeable warns.
//
// PO decision D110: a READ-ONLY readback of whether the owner of each OPEN dispatch record is still running, from the existing session
// owner runtime judgement (PID plus process start identity) reached through the record's v2 owner claim. Prints one JSON document
// (pipeline.dispatch-record-liveness.v1): per open record its task id, claim kind, verdict (alive | gone | unjudgeable) and a reason
// code. `unjudgeable` is deliberate: a v1 claim or a Claude hook identity carries no owner process, and nothing is called gone without
// proof. It mutates nothing, takes no lock and never retires or heals. Exit 0: inspected. Exit 2: refused (DRL-ARGS | DRL-ROOT).
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { DISPATCH_RECORD_LIVENESS_SCHEMA, readDispatchRecordLiveness, secondWriterAdmission } from "../lib/dispatch-record-liveness.mjs";

const short = (error) => String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 240);

function parse(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]?.startsWith("--") ? argv[index].slice(2) : null;
    if (name !== "root" && name !== "task" && name !== "second-writer") return { error: `unknown argument ${String(argv[index]).slice(0, 40)}` };
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--") || Object.hasOwn(flags, name)) return { error: `--${name} needs one value` };
    flags[name] = value; index += 1;
  }
  if (flags.task !== undefined && !/^[A-Za-z0-9._-]+$/u.test(flags.task)) return { error: "--task is not a safe task id" };
  if (flags["second-writer"] !== undefined && flags.task !== undefined) return { error: "--second-writer and --task cannot be combined" };
  return { flags };
}

export function runDispatchRecordLiveness(argv, out = (text) => process.stdout.write(text), { cwd = process.cwd(), err = (text) => process.stderr.write(text) } = {}) {
  const emit = (value, code) => { out(`${JSON.stringify(value)}\n`); return code; };
  const refuse = (code, reason) => emit({ schema: DISPATCH_RECORD_LIVENESS_SCHEMA, status: "refused", code, reason }, 2);
  const parsed = parse(argv);
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
