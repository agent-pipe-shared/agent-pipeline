#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * dispatch-budget-grant.mjs -- the ORCHESTRATOR's sanctioned way to grant extra
 * working calls to ONE dispatched agent that handed back at its budget
 * checkpoint (PO decision 2026-10-05, ALFRED-BUDGET-20261005).
 *
 *   node dispatch-budget-grant.mjs --agent-id <id> --extra <1..40> --reason <text> [--root <repo>]
 *
 * The grant is a closed-shape, digest-chained, append-only record under the
 * git common dir of the repository it runs in:
 *   <git-common-dir>/agent-pipeline/dispatch-budget/grants/<agentId>.json
 * `guard-dispatch-budget.mjs` adds the granted calls to that agent's working cap,
 * bounded so working + closing calls stay at least one below the agent
 * definition's `maxTurns`. A dispatched agent can never reach this script or the
 * grant store: the same guard refuses any non-orchestrator call that names them.
 * The script only grants for an agent whose counter already exists (a typo'd id
 * grants nothing) and refuses past the agent's headroom.
 *
 * Exit 0 + one JSON object on stdout when granted; exit 2 + one
 * `DISPATCH-BUDGET-GRANT-REFUSED: <code>: <message>` line on stderr otherwise.
 * One orchestrator at a time is the contract: there is no cross-process lock, a
 * lost concurrent update fails the digest chain and is refused on the next read.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  MAX_GRANT_EXTRA_PER_CALL,
  appendGrant,
  dispatchGrantHeadroom,
  dispatchWorkingCap,
  effectiveDispatchWorkingCap,
  isValidGrantAgentId,
  validateGrantRecord,
} from "../lib/dispatch-budget-core.mjs";

const REFUSAL_PREFIX = "DISPATCH-BUDGET-GRANT-REFUSED";
const MAX_FILE_BYTES = 32768;
const KNOWN_FLAGS = new Set(["--agent-id", "--extra", "--reason", "--root"]);

class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!KNOWN_FLAGS.has(flag)) throw new Refusal("unknown-argument", `unknown argument ${JSON.stringify(flag)}`);
    if (values.has(flag)) throw new Refusal("duplicate-argument", `${flag} given twice`);
    const value = argv[index + 1];
    if (typeof value !== "string") throw new Refusal("missing-value", `${flag} needs a value`);
    values.set(flag, value);
  }
  for (const required of ["--agent-id", "--extra", "--reason"]) {
    if (!values.has(required)) throw new Refusal("missing-argument", `${required} is required`);
  }
  const agentId = values.get("--agent-id");
  if (!isValidGrantAgentId(agentId)) throw new Refusal("agent-id-invalid", "--agent-id must be one exact agent id ([A-Za-z0-9_-], up to 128 characters)");
  const extraText = values.get("--extra");
  const extra = /^[0-9]{1,3}$/u.test(extraText) ? Number(extraText) : NaN;
  if (!Number.isSafeInteger(extra) || extra < 1 || extra > MAX_GRANT_EXTRA_PER_CALL) {
    throw new Refusal("extra-out-of-range", `--extra must be an integer from 1 to ${MAX_GRANT_EXTRA_PER_CALL}`);
  }
  return { agentId, extra, reason: values.get("--reason"), root: values.get("--root") ?? null };
}

function resolveCommonDir(root, dependencies) {
  const execFileSyncFn = dependencies.execFileSyncFn ?? execFileSync;
  try {
    const out = String(execFileSyncFn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    })).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}

function readJson(path, what) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch { throw new Refusal(`${what}-unreadable`, `${what} file could not be read`); }
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new Refusal(`${what}-oversized`, `${what} file is oversized`);
  try { return JSON.parse(text); } catch { throw new Refusal(`${what}-malformed`, `${what} file is not valid JSON`); }
}

/**
 * Grants `extra` calls to `agentId`. Returns the result object; throws nothing
 * for policy refusals (they come back as `{ status: "refused", code, message }`).
 */
export function grantDispatchBudget(argv, dependencies = {}) {
  try {
    const args = parseArgs(argv);
    const root = args.root ?? dependencies.cwd ?? process.cwd();
    const commonDir = resolveCommonDir(root, dependencies);
    if (commonDir === null) throw new Refusal("git-common-dir-unresolved", "no git common directory resolves from the working directory");
    const budgetDir = join(commonDir, "agent-pipeline", "dispatch-budget");
    const counterFile = join(budgetDir, `${args.agentId}.json`);
    if (!existsSync(counterFile)) throw new Refusal("agent-counter-missing", "no budget counter exists for that agent id; the agent never ran under the budget guard here");
    const counter = readJson(counterFile, "counter");
    if (counter?.agentId !== args.agentId || !Number.isSafeInteger(counter.maxTurns) || !Number.isSafeInteger(counter.baseCalls) || !Number.isSafeInteger(counter.workingCap)) {
      throw new Refusal("counter-unbound", "the agent's counter is not bound to this agent id");
    }
    // The small-role lane already spends maxTurns - closing allowance; nothing is left to grant.
    const tierCap = dispatchWorkingCap(counter.maxTurns);
    const headroom = tierCap === null || counter.workingCap > tierCap ? 0 : dispatchGrantHeadroom(counter.baseCalls, counter.maxTurns);
    const grantFile = join(budgetDir, "grants", `${args.agentId}.json`);
    let existing = null;
    let alreadyGranted = 0;
    if (existsSync(grantFile)) {
      existing = readJson(grantFile, "grant-record");
      const checked = validateGrantRecord(existing, args.agentId);
      if (!checked.ok) throw new Refusal(checked.code, "the existing grant record does not verify; it is left untouched");
      alreadyGranted = checked.totalExtra;
    }
    if (alreadyGranted + args.extra > headroom) {
      throw new Refusal("grant-exceeds-headroom", `${args.extra} more call(s) would exceed this agent's headroom (headroom ${headroom}, already granted ${alreadyGranted}; working cap plus closing allowance must stay below maxTurns ${counter.maxTurns})`);
    }
    const grantedAt = (dependencies.nowFn ?? (() => new Date().toISOString()))();
    const appended = appendGrant({ record: existing, agentId: args.agentId, extra: args.extra, reason: args.reason, grantedAt });
    if (!appended.ok) throw new Refusal(appended.code, "the grant arguments or existing record were refused by policy");
    mkdirSync(dirname(grantFile), { recursive: true, mode: 0o700 });
    const temporary = `${grantFile}.${process.pid}-${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(appended.record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(temporary, grantFile);
    } catch {
      try { unlinkSync(temporary); } catch { /* best effort */ }
      throw new Refusal("grant-write-failed", "the grant record could not be written");
    }
    const readBack = validateGrantRecord(readJson(grantFile, "grant-record"), args.agentId);
    if (!readBack.ok || readBack.totalExtra !== appended.record.totalExtra) throw new Refusal("grant-readback-mismatch", "the written grant record does not verify on read-back");
    return {
      status: "granted",
      result: {
        schema: "pipeline.dispatch-budget-grant-result.v1",
        status: "granted",
        agentId: args.agentId,
        extra: args.extra,
        totalExtra: appended.record.totalExtra,
        workingCapBefore: effectiveDispatchWorkingCap(counter.baseCalls, counter.maxTurns, alreadyGranted),
        workingCapAfter: effectiveDispatchWorkingCap(counter.baseCalls, counter.maxTurns, appended.record.totalExtra),
        digest: appended.record.digest,
      },
    };
  } catch (error) {
    if (error instanceof Refusal) return { status: "refused", code: error.code, message: error.message };
    return { status: "refused", code: "grant-internal-error", message: "unexpected failure; no grant was recorded" };
  }
}

if (isDirectInvocation(import.meta.url)) {
  const outcome = grantDispatchBudget(process.argv.slice(2));
  if (outcome.status === "granted") {
    process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
    process.exit(0);
  }
  process.stderr.write(`${REFUSAL_PREFIX}: ${outcome.code}: ${outcome.message}\n`);
  process.exit(2);
}
