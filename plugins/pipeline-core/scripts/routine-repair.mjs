#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// routine-repair.mjs list
// routine-repair.mjs run <kind> --root <root> --reason "<one line>" [kind-specific flags]
//
// D194 / D197: the closed list of repairs the Elephant runs without asking the human. Two verbs only.
//   list  Read-only. Prints the closed list as JSON.
//   run   heal | slice-cancel <slice id> --class <budget|integrated-elsewhere> [--started] | stop-failure-aside | move-aside --no-goldfish-running
//         Each run is retained aside (never deleted) and appended to <git-common-dir>/agent-pipeline/routine-repair-ledger.jsonl.
//         A kind outside the list is refused RR-OUTSIDE-LIST with the original tool's own command; the human decides it.
// Prints one JSON result. Exit 0: done. Exit 2: refused (typed RR-* code).
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { ROUTINE_REPAIRS, ROUTINE_REPAIR_LIST_SCHEMA, ROUTINE_REPAIR_RECORD_SCHEMA, runRoutineRepair } from "../lib/routine-repair.mjs";

const VALUE_FLAGS = new Set(["root", "reason", "class"]);
const BOOLEAN_FLAGS = new Set(["started", "no-goldfish-running"]);

function parseRun(argv) {
  const [kind, ...rest] = argv;
  if (typeof kind !== "string" || kind.startsWith("--")) return { error: "usage: routine-repair.mjs run <kind> --root <root> --reason \"<one line>\"" };
  const flags = {}, positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) { if (flags[name]) return { error: `--${name} given twice` }; flags[name] = true; continue; }
    if (!VALUE_FLAGS.has(name)) return { error: `unknown argument ${token.slice(0, 40)}` };
    const value = rest[index + 1];
    if (typeof value !== "string" || value.startsWith("--") || Object.hasOwn(flags, name)) return { error: `--${name} needs one value` };
    flags[name] = value; index += 1;
  }
  if (kind === "move-aside" && flags["no-goldfish-running"] !== true) return { error: "move-aside needs --no-goldfish-running (you assert that no Goldfish or other authority operation runs)" };
  if (kind !== "move-aside" && flags["no-goldfish-running"]) return { error: "--no-goldfish-running belongs to move-aside only" };
  if (kind !== "slice-cancel" && (flags.started || flags.class !== undefined)) return { error: "--class and --started belong to slice-cancel only" };
  if (kind !== "slice-cancel" && positional.length) return { error: `unexpected argument ${positional[0].slice(0, 40)}` };
  if (kind === "slice-cancel" && positional.length !== 1) return { error: "slice-cancel needs exactly one <slice id>" };
  return { request: { kind, root: flags.root, reason: flags.reason, sliceId: positional[0], cancelClass: flags.class, started: flags.started === true } };
}

export function runRoutineRepairCli(argv, out = (text) => process.stdout.write(text), deps = {}) {
  const emit = (value, code) => { out(`${JSON.stringify(value)}\n`); return code; };
  const [verb, ...rest] = argv;
  if (verb === "list" && rest.length === 0) return emit({ schema: ROUTINE_REPAIR_LIST_SCHEMA, repairs: ROUTINE_REPAIRS }, 0);
  if (verb !== "run") return emit({ schema: ROUTINE_REPAIR_RECORD_SCHEMA, status: "refused", code: "RR-ARGS", reason: "usage: routine-repair.mjs list | run <kind> --root <root> --reason \"<one line>\"" }, 2);
  const parsed = parseRun(rest);
  if (parsed.error) {
    // A kind the list does not know gets the typed outside-list answer, not a usage error.
    if (typeof rest[0] === "string" && !rest[0].startsWith("--") && !ROUTINE_REPAIRS.some((row) => row.kind === rest[0])) {
      const { result, exit } = runRoutineRepair({ kind: rest[0] }, deps);
      return emit(result, exit);
    }
    return emit({ schema: ROUTINE_REPAIR_RECORD_SCHEMA, status: "refused", code: "RR-ARGS", reason: parsed.error }, 2);
  }
  const { result, exit } = runRoutineRepair(parsed.request, deps);
  return emit(result, exit);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = runRoutineRepairCli(process.argv.slice(2));
