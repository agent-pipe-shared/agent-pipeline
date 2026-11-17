#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * dispatch-model-exception.mjs -- the ORCHESTRATOR's sanctioned way to record, list and end a PO-requested MODEL EXCEPTION
 * (C30G-M16, PO decision 2026-11-17): one dispatch may run a model that no configured route selects, without editing pipeline.user.yaml.
 *
 *   node dispatch-model-exception.mjs record --model <opus|sonnet|haiku|fable> [--effort <level>]
 *        (--dispatch-id <id> | --count <1..5> | --minutes <1..240>) --reason <text> --by <label> [--root <repo>] [--move-broken-store-aside]
 *   node dispatch-model-exception.mjs list [--root <repo>]
 *   node dispatch-model-exception.mjs revoke --id <MX-n> [--root <repo>]
 *
 * WHAT THE RECORD IS: an ATTRIBUTION record of the PO's request, like `gates.push_approval: chat` -- NOT a signature. `--by` is REQUIRED and has
 * NO default: it is the label the PO supplied (an agent never invents an operator label, EL-36). `--reason` is stored verbatim (500 characters at most).
 * A dispatch admitted under an exception changes only its model (and effort): the agent type, tools, prompt checks, the budget guard and every
 * other guard still apply, and an exception for one alias never admits another. Claude runner only: the Antigravity and Codex model paths are unchanged.
 *
 * Store: `<git-common-dir>/agent-pipeline/dispatch-model-exception/store.json`, a closed-shape, digest-chained, append-only file
 * (lib/dispatch-model-exception.mjs). A dispatched agent can never run this script or read or write the store: hooks/guard-dispatch-budget.mjs
 * refuses any non-orchestrator call that names them. The dispatch guard (hooks/guard-dispatch.mjs) consumes an exception when it ADMITS a new
 * dispatch (a refused dispatch consumes nothing; a retry of the same dispatch consumes nothing more). A store that does not verify grants NOTHING;
 * `record` over it refuses and names the repair: re-run the same command with --move-broken-store-aside (the file is renamed beside the store, never deleted).
 *
 * Exit 0 + one JSON object (record, revoke) or one text line per exception (list) on stdout; exit 2 + one
 * `DISPATCH-MODEL-EXCEPTION-REFUSED: <code>: <message>` line on stderr otherwise, and every refusal names the step that repairs it.
 */
import { existsSync, renameSync } from "node:fs";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { CLAUDE_FAMILY_ALIASES } from "../lib/dispatch-model-enforcement.mjs";
import {
  MODEL_EXCEPTION_COUNT_RANGE,
  MODEL_EXCEPTION_MAX_BY,
  MODEL_EXCEPTION_MAX_ENTRIES,
  MODEL_EXCEPTION_MAX_REASON,
  MODEL_EXCEPTION_MINUTES_RANGE,
  deriveExceptionStates,
  exceptionScopeText,
  readModelExceptionStore,
  recordModelException,
  revokeModelException,
  withModelExceptionLock,
  writeModelExceptionStore,
} from "../lib/dispatch-model-exception.mjs";

const REFUSAL_PREFIX = "DISPATCH-MODEL-EXCEPTION-REFUSED";
const VALUE_FLAGS = new Set(["--model", "--effort", "--dispatch-id", "--count", "--minutes", "--reason", "--by", "--root", "--id"]);
const BOOLEAN_FLAGS = new Set(["--move-broken-store-aside"]);
const ALLOWED_FLAGS = Object.freeze({
  record: ["--model", "--effort", "--dispatch-id", "--count", "--minutes", "--reason", "--by", "--root", "--move-broken-store-aside"],
  list: ["--root"],
  revoke: ["--id", "--root"],
});

export const MODEL_EXCEPTION_USAGE = "usage:\n"
  + "  node dispatch-model-exception.mjs record --model <opus|sonnet|haiku|fable> [--effort <level>] (--dispatch-id <id> | --count <1..5> | --minutes <1..240>) --reason <text> --by <label> [--root <repo>]\n"
  + "  node dispatch-model-exception.mjs list [--root <repo>]\n"
  + "  node dispatch-model-exception.mjs revoke --id <MX-n> [--root <repo>]\n"
  + "record stores the PO's request as an attribution record (not a signature): --by is the label the PO supplied and has no default; --reason is stored verbatim.\n"
  + "A dispatch admitted under an exception changes only its model (and effort). `list` shows every exception with its state (live, consumed, expired, revoked).\n";

class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (!Object.hasOwn(ALLOWED_FLAGS, verb ?? "")) throw new Refusal("unknown-subcommand", `the subcommand must be record, list or revoke; ${MODEL_EXCEPTION_USAGE.split("\n")[0]} (run with --help for the full usage)`);
  const values = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!ALLOWED_FLAGS[verb].includes(flag)) throw new Refusal("unknown-argument", `unknown argument ${JSON.stringify(flag)} for ${verb}; the flags of ${verb} are ${ALLOWED_FLAGS[verb].join(", ")}`);
    if (values.has(flag)) throw new Refusal("duplicate-argument", `${flag} given twice; give it once`);
    if (BOOLEAN_FLAGS.has(flag)) { values.set(flag, true); continue; }
    if (!VALUE_FLAGS.has(flag)) throw new Refusal("unknown-argument", `unknown argument ${JSON.stringify(flag)}`);
    const value = rest[index + 1];
    if (typeof value !== "string" || (value.startsWith("--") && value.length > 2)) throw new Refusal("missing-value", `${flag} needs a value`);
    values.set(flag, value);
    index += 1;
  }
  return { verb, values };
}

const integerIn = (text, [low, high], flag) => {
  const value = /^[0-9]{1,3}$/u.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(value) || value < low || value > high) throw new Refusal(`${flag.slice(2)}-out-of-range`, `${flag} must be an integer from ${low} to ${high}; re-run with a value in that range`);
  return value;
};

function recordRequest(values) {
  const model = values.get("--model");
  if (model === undefined) throw new Refusal("model-missing", `--model is required: one of ${CLAUDE_FAMILY_ALIASES.join(", ")}`);
  if (!CLAUDE_FAMILY_ALIASES.includes(model)) throw new Refusal("model-not-allowed", `--model ${JSON.stringify(model)} is not a Claude family alias; the allowed aliases are ${CLAUDE_FAMILY_ALIASES.join(", ")} (an exception names the alias the Agent tool's model parameter takes)`);
  const by = values.get("--by");
  if (by === undefined || by.trim() === "") throw new Refusal("by-missing", "--by is required and has no default: it is the label the PO supplied for this request (an agent never invents an operator label, EL-36). Ask the PO which label to record, then re-run with --by \"<that label>\"");
  if (by.trim() !== by || by.length > MODEL_EXCEPTION_MAX_BY || /[\u0000-\u001f\u007f]/u.test(by)) throw new Refusal("by-invalid", `--by must be one line of up to ${MODEL_EXCEPTION_MAX_BY} characters without leading or trailing space; re-run with the PO's label in that shape`);
  const reason = values.get("--reason");
  if (reason === undefined || reason.trim() === "") throw new Refusal("reason-missing", "--reason is required: the PO's stated reason, stored verbatim. Ask the PO, then re-run with --reason \"<that reason>\"");
  if (reason.trim() !== reason || reason.length > MODEL_EXCEPTION_MAX_REASON || /[\u0000-\u001f\u007f]/u.test(reason)) throw new Refusal("reason-invalid", `--reason must be one line of up to ${MODEL_EXCEPTION_MAX_REASON} characters without leading or trailing space; shorten it and re-run`);
  const scopes = ["--dispatch-id", "--count", "--minutes"].filter((flag) => values.has(flag));
  if (scopes.length !== 1) throw new Refusal(scopes.length === 0 ? "scope-missing" : "scope-ambiguous", "give exactly one scope: --dispatch-id <id> (this one dispatch), --count <1..5> (that many new dispatches) or --minutes <1..240> (a time window)");
  const flag = scopes[0];
  const scope = flag === "--dispatch-id" ? { kind: "dispatch-id", value: values.get(flag) }
    : flag === "--count" ? { kind: "count", value: integerIn(values.get(flag), MODEL_EXCEPTION_COUNT_RANGE, flag) }
      : { kind: "minutes", value: integerIn(values.get(flag), MODEL_EXCEPTION_MINUTES_RANGE, flag) };
  if (scope.kind === "dispatch-id" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(scope.value)) throw new Refusal("dispatch-id-invalid", "--dispatch-id must be the dispatch id of the briefing (letters, digits, . _ : -, up to 128 characters); copy it from the briefing's `Slice:` line");
  const effort = values.get("--effort") ?? null;
  if (effort !== null && !/^[a-z]{2,12}$/u.test(effort)) throw new Refusal("effort-invalid", "--effort must be a lowercase effort level such as low, medium, high, xhigh or max");
  return { model, effort, scope, by, reason };
}

const rootOf = (values, dependencies) => values.get("--root") ?? dependencies.cwd ?? process.cwd();

function readStore(root, dependencies) {
  const read = readModelExceptionStore(root, dependencies);
  if (!read.ok && read.code === "git-common-dir-unresolved") throw new Refusal(read.code, "no git common directory resolves from the working directory; re-run with --root <the repository root>");
  return read;
}

function brokenRefusal(read) {
  return new Refusal("store-does-not-verify", `the model-exception store does not verify (${read.code}), so no exception is honoured. Repair: re-run this same command with --move-broken-store-aside (the broken file is renamed beside the store, never deleted); \`list\` shows the cause`);
}

function stateLine(row) {
  const used = row.uses.length === 0 ? "" : `; used by ${[...new Set(row.uses.map((use) => use.dispatchId ?? use.dispatchKey))].join(", ")}`;
  const left = row.remaining === null ? "" : `; ${row.remaining} left`;
  return `${row.id} ${row.state} ${row.model}${row.effort === null ? "" : ` effort ${row.effort}`} for ${exceptionScopeText(row.scope)}; requested by the PO at ${row.at} (${row.by}); expires ${row.expiresAt}${left}${used}; reason: ${row.reason}${row.revokedAt === null ? "" : `; revoked ${row.revokedAt}`}`;
}

/** Runs one subcommand. Policy refusals come back as `{ status: "refused", code, message }`; nothing throws. */
export function dispatchModelException(argv, dependencies = {}) {
  try {
    const { verb, values } = parseArgs(argv);
    const root = rootOf(values, dependencies);
    const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
    if (verb === "list") {
      const read = readStore(root, dependencies);
      if (!read.ok) return { status: "listed", lines: [`the model-exception store does not verify (${read.code}), so no exception is honoured; repair: re-run a record command with --move-broken-store-aside (the broken file is kept beside the store, never deleted)`] };
      const rows = deriveExceptionStates(read.store, Date.parse(nowFn()));
      return { status: "listed", lines: rows.length === 0 ? ["no model exception is recorded; record one with: record --model <alias> (--dispatch-id <id> | --count <n> | --minutes <n>) --reason <PO's reason> --by <PO's label>"] : rows.map(stateLine) };
    }
    const read = readStore(root, dependencies);
    if (verb === "revoke") {
      const id = values.get("--id");
      if (id === undefined) throw new Refusal("id-missing", "--id is required: an exception id such as MX-1; `list` shows the ids");
      if (!read.ok) throw new Refusal("store-does-not-verify", `the model-exception store does not verify (${read.code}), so no exception is honoured and there is nothing to revoke; to start clean re-run a record command with --move-broken-store-aside (the broken file is kept beside the store, never deleted)`);
      return withModelExceptionLock(read.path, () => {
        const fresh = readModelExceptionStore(root, dependencies);
        if (!fresh.ok) return { status: "refused", code: "store-does-not-verify", message: `the model-exception store does not verify (${fresh.code}); \`list\` shows the cause` };
        const revoked = revokeModelException(fresh.store, { target: id, at: nowFn() });
        if (!revoked.ok) return { status: "refused", code: revoked.code, message: revoked.code === "revoke-already-revoked" ? `${id} is already revoked; \`list\` shows every exception and its state` : `no exception ${id} is recorded; \`list\` shows the ids` };
        const written = writeModelExceptionStore(fresh.path, revoked.store);
        return written.ok ? { status: "revoked", result: { schema: "pipeline.dispatch-model-exception-result.v1", status: "revoked", id, digest: revoked.store.digest } } : { status: "refused", code: written.code, message: "the store could not be written; check the directory permissions and re-run" };
      });
    }
    const request = recordRequest(values);
    const moveAside = values.get("--move-broken-store-aside") === true;
    if (!read.ok && !moveAside) throw brokenRefusal(read);
    return withModelExceptionLock(read.path, () => {
      let store = read.ok ? read.store : null;
      let movedTo = null;
      const at = nowFn();
      if (!read.ok || (moveAside && store.entries.length >= MODEL_EXCEPTION_MAX_ENTRIES)) {
        // The broken (or full) file is evidence: it is renamed, never deleted, and the new chain starts empty.
        movedTo = `${read.path}.broken-${at.replace(/[:.]/gu, "-")}`;
        if (existsSync(read.path)) {
          try { renameSync(read.path, movedTo); } catch { return { status: "refused", code: "store-move-failed", message: "the broken store could not be renamed aside; check the directory permissions and re-run" }; }
        } else movedTo = null;
        store = readModelExceptionStore(root, dependencies).store;
      }
      const recorded = recordModelException(store, { ...request, at, aliases: CLAUDE_FAMILY_ALIASES });
      if (!recorded.ok) {
        return { status: "refused", code: recorded.code, message: recorded.code === "store-full"
          ? "the model-exception store holds its maximum number of entries; re-run this same command with --move-broken-store-aside (the full file is renamed beside the store, never deleted)"
          : "the request was refused by policy; run with --help for the accepted shapes" };
      }
      const written = writeModelExceptionStore(read.path, recorded.store);
      if (!written.ok) return { status: "refused", code: written.code, message: "the store could not be written; check the directory permissions and re-run" };
      const back = readModelExceptionStore(root, dependencies);
      if (!back.ok || back.store.digest !== recorded.store.digest) return { status: "refused", code: "store-readback-mismatch", message: "the written store does not verify on read-back; `list` shows the cause" };
      const entry = recorded.store.entries.at(-1);
      return { status: "recorded", result: {
        schema: "pipeline.dispatch-model-exception-result.v1", status: "recorded", id: recorded.id, model: request.model, effort: request.effort, scope: request.scope,
        by: request.by, requestedAt: entry.at, expiresAt: entry.expiresAt, digest: recorded.store.digest, ...(movedTo === null ? {} : { brokenStoreMovedTo: movedTo }),
        note: "an attribution record of the PO's request, not a signature; the dispatch guard consumes it when it admits a new dispatch; `list` shows its state",
      } };
    });
  } catch (error) {
    if (error instanceof Refusal) return { status: "refused", code: error.code, message: error.message };
    return { status: "refused", code: "exception-internal-error", message: "unexpected failure; nothing was recorded" };
  }
}

export function isHelpRequest(argv) {
  return argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
}

if (isDirectInvocation(import.meta.url)) {
  if (isHelpRequest(process.argv.slice(2))) {
    process.stdout.write(MODEL_EXCEPTION_USAGE);
    process.exit(0);
  }
  const outcome = dispatchModelException(process.argv.slice(2));
  if (outcome.status === "listed") {
    process.stdout.write(`${outcome.lines.join("\n")}\n`);
    process.exit(0);
  }
  if (outcome.status === "recorded" || outcome.status === "revoked") {
    process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
    process.exit(0);
  }
  process.stderr.write(`${REFUSAL_PREFIX}: ${outcome.code}: ${outcome.message}\n`);
  process.exit(2);
}
