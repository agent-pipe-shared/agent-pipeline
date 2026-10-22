#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// dispatch-record-liveness.mjs [--root <root>] [--task <task id>]
//
// PO decision D110: a READ-ONLY readback of whether the owner of each OPEN dispatch record is still running, from the existing session
// owner runtime judgement (PID plus process start identity) reached through the record's v2 owner claim. Prints one JSON document
// (pipeline.dispatch-record-liveness.v1): per open record its task id, claim kind, verdict (alive | gone | unjudgeable) and a reason
// code. `unjudgeable` is deliberate: a v1 claim or a Claude hook identity carries no owner process, and nothing is called gone without
// proof. It mutates nothing, takes no lock and never retires or heals. Exit 0: inspected. Exit 2: refused (DRL-ARGS | DRL-ROOT).
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { DISPATCH_RECORD_LIVENESS_SCHEMA, readDispatchRecordLiveness } from "../lib/dispatch-record-liveness.mjs";

const short = (error) => String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 240);

function parse(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]?.startsWith("--") ? argv[index].slice(2) : null;
    if (name !== "root" && name !== "task") return { error: `unknown argument ${String(argv[index]).slice(0, 40)}` };
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--") || Object.hasOwn(flags, name)) return { error: `--${name} needs one value` };
    flags[name] = value; index += 1;
  }
  if (flags.task !== undefined && !/^[A-Za-z0-9._-]+$/u.test(flags.task)) return { error: "--task is not a safe task id" };
  return { flags };
}

export function runDispatchRecordLiveness(argv, out = (text) => process.stdout.write(text), { cwd = process.cwd() } = {}) {
  const emit = (value, code) => { out(`${JSON.stringify(value)}\n`); return code; };
  const refuse = (code, reason) => emit({ schema: DISPATCH_RECORD_LIVENESS_SCHEMA, status: "refused", code, reason }, 2);
  const parsed = parse(argv);
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
