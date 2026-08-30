#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-resume-consumption.mjs -- Stage 2 of the mechanical-consumption-proof requirement
 * (backlog/items/2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-
 * restart.md).
 *
 * Stage 1 (dispatch NVA-R4-RESUMERECEIPT, commit c3020e1d) made consumption OBSERVABLE:
 * `resume-hint.mjs capture` records a content digest of the whole captured card, and a new
 * `consume`/`query` CLI pair binds a session's identity to that digest -- read back from the
 * card's own recorded bytes, never a caller-supplied assertion (`lib/resume-hint.mjs`'s
 * `recordResumeHintConsumption`/`queryResumeHintConsumption`). That mechanism sat inert until
 * something both (a) called `consume` at the real bootstrap step and (b) FAILED LOUDLY when an
 * `available` card produced no matching receipt. This script is (b); (a) is wired into
 * `hooks/codex-session-start-hint.mjs`'s `resumeHintContextLines()`, the one place in this
 * codebase that surfaces a resume-hint card's content into a restarting session's context on
 * every `startup|resume|clear` SessionStart (Claude and Codex alike, see hooks.json hook 8).
 *
 * WHAT THIS SCRIPT DOES, from repository/project state alone -- no chat/transcript access:
 *
 *   1. Inspects the current Resume-Hint card (`inspectResumeHint`, Stage 1's own reader,
 *      unmodified). If its status is anything other than `available` (`absent`,
 *      `challenged-stale`, `ignored-invalid`), there is nothing to hold a session accountable
 *      for: PASS.
 *   2. When a card IS `available`, queries whether `--session-id` produced a matching
 *      consumption receipt (`queryResumeHintConsumption`, Stage 1, unmodified). `consumed` is a
 *      PASS. Anything else -- an absent, corrupt, or digest-mismatched receipt (`not-consumed`),
 *      or no digest record at all to check against (`no-card`, meaning the card on disk was
 *      never run through the CLI capture path that records one) -- is the exact F12/F13
 *      regression shape this item exists to catch: the agent proceeded as if it had picked up
 *      where the user left off, with no way to tell from the outside that it had not. Reported
 *      FATAL.
 *
 * This check is deliberately NEVER wired into any guard's admission/blocking logic and NEVER
 * gates session readiness or bootstrap status (SKILL.md step 6's own "never a readiness
 * precondition" rule, restated by the backlog item's own Acceptance) -- it is a standalone,
 * after-the-fact, checkable fact, run on demand or by a Critic/verification pass, the same
 * posture check-backlog-done-predicate.mjs already uses for its own standalone checker.
 *
 * REGISTRATION STATUS (updated 2026-08-30, NVA-CF-RESUMEGATE): the single-session
 * `--session-id` mode above is STILL never wired into `harness/scripts/verify.mjs` -- a batch
 * verify run has no live session identity to supply, so this mode stays exactly what this
 * comment always said: standalone, after-the-fact, run on demand or by a Critic/verification
 * pass. The SEPARATE `--any-session` mode (added by NVA-CF-RESUMECHECKANYSESSION, commit
 * `2437d338`) answers a session-independent question instead ("does ANY recorded receipt match
 * the current card's digest") and IS now registered in `harness/scripts/verify.mjs` as suite
 * `resume-consumption-check` (commit `03c1edcd`, TP-3 signed-override ceremony) -- it is a live
 * verify-gate check, not merely observed. `check-suite-registration.mjs`'s own
 * `DELIBERATELY_UNREGISTERED` opt-out list carries no entry for either mode: the single-session
 * mode's gap is disclosed here in prose (never a manufactured opt-out entry, per the 2026-08-29
 * policy), and the any-session mode needs no opt-out at all since it is now registered.
 *
 * EXIT CODES: 0 = PASS (no card was available, or an available card has a matching receipt).
 * 1 = FATAL (a card was available and no matching receipt exists for the given session).
 * 3 = usage error (missing --root/--session-id, or the check itself could not run).
 *
 * NVA-CF-RESUMECHECKANYSESSION added a SEPARATE `--any-session` mode (mutually exclusive
 * with `--session-id`) for a caller with no live session identity -- e.g. a future
 * `verify.mjs` batch registration. It answers a different question: does ANY recorded
 * consumption receipt, from any session, match the currently-available card's digest? PASS/
 * FATAL semantics mirror the single-session mode exactly. The existing `--session-id` mode's
 * behavior, exit codes and messages are unchanged.
 *
 * Usage:
 *   node plugins/pipeline-core/scripts/check-resume-consumption.mjs --root <project> --session-id <id>
 *   node plugins/pipeline-core/scripts/check-resume-consumption.mjs --root <project> --session-id <id> --json
 *   node plugins/pipeline-core/scripts/check-resume-consumption.mjs --root <project> --any-session
 */
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { anyResumeHintConsumptionReceipt, inspectResumeHint, queryResumeHintConsumption } from "../lib/resume-hint.mjs";

export const SCHEMA = "pipeline.check-resume-consumption.v1";

function value(args, flag) {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1] ?? null;
}

/**
 * Pure composition of Stage 1's own `inspectResumeHint`/`queryResumeHintConsumption` -- never a
 * second copy of their digest/binding logic (forbidden by this dispatch's own briefing).
 * `inspect`/`query` are injectable only so a test can drive every outcome from a fully synthetic
 * fixture with no filesystem at all; the real CLI path below always uses the Stage 1 defaults.
 */
export function checkResumeConsumption({
  rootDir, sessionId,
  inspect = inspectResumeHint, query = queryResumeHintConsumption,
} = {}) {
  const inspected = inspect({ rootDir });
  if (inspected.status !== "available") {
    return {
      ok: true, schema: SCHEMA, code: "RH-CHECK-NO-CARD", cardStatus: inspected.status,
      message: `no Resume-Hint card was available at bootstrap (status: ${inspected.status}) -- nothing to consume`,
    };
  }
  const queried = query({ rootDir, sessionId });
  if (queried.outcome === "consumed") {
    return {
      ok: true, schema: SCHEMA, code: "RH-CHECK-CONSUMED", cardStatus: inspected.status, cardDigest: queried.cardDigest,
      message: `an available Resume-Hint card produced a matching consumption receipt for session ${JSON.stringify(sessionId)}`,
    };
  }
  if (queried.outcome === "no-card") {
    return {
      ok: false, schema: SCHEMA, code: "RH-CHECK-NO-DIGEST-RECORD", cardStatus: inspected.status,
      message:
        "a Resume-Hint card was available at bootstrap but no card-digest record exists to verify " +
        "consumption against (captured outside the CLI capture path, or the digest record is " +
        "unavailable) -- this is the F12/F13 regression shape: the agent proceeded as if it had " +
        "read the card, with no mechanical way to confirm it",
    };
  }
  // queried.outcome === "not-consumed": absent, corrupt, or digest-mismatched receipt --
  // queried.code distinguishes which (RH-RECEIPT-ABSENT / RH-RECEIPT-CORRUPT /
  // RH-RECEIPT-DIGEST-MISMATCH), read back verbatim from Stage 1, never re-derived here.
  return {
    ok: false, schema: SCHEMA, code: `RH-CHECK-${queried.code}`, cardStatus: inspected.status,
    cardDigest: queried.cardDigest, receiptDigest: queried.receiptDigest ?? null,
    message:
      `an available Resume-Hint card at bootstrap has no matching consumption receipt for session ` +
      `${JSON.stringify(sessionId)} (${queried.code}) -- this is the F12/F13 regression shape: the ` +
      "agent proceeded as if it had read the card, with no mechanical way to confirm it",
  };
}

/**
 * Any-session composition, mirroring `checkResumeConsumption()`'s exact PASS/FATAL shape
 * (see that function's own doc comment above for the rationale). Answers a different
 * question than the single-session mode: does ANY recorded consumption receipt -- from ANY
 * session, not one caller-supplied id -- match the currently-available card's digest? This
 * is the mode `verify.mjs` (a batch check with no live session identity) will eventually be
 * able to call. `inspect`/`query` are injectable for the same filesystem-free-test reason as
 * `checkResumeConsumption()` above.
 */
export function checkResumeConsumptionAnySession({
  rootDir,
  inspect = inspectResumeHint, query = anyResumeHintConsumptionReceipt,
} = {}) {
  const inspected = inspect({ rootDir });
  if (inspected.status !== "available") {
    return {
      ok: true, schema: SCHEMA, code: "RH-CHECK-NO-CARD", cardStatus: inspected.status,
      message: `no Resume-Hint card was available at bootstrap (status: ${inspected.status}) -- nothing to consume`,
    };
  }
  const queried = query({ rootDir });
  if (queried.outcome === "found") {
    return {
      ok: true, schema: SCHEMA, code: "RH-CHECK-CONSUMED-ANY", cardStatus: inspected.status, cardDigest: queried.cardDigest,
      message: `an available Resume-Hint card produced a matching consumption receipt from session ${JSON.stringify(queried.sessionId)}`,
    };
  }
  if (queried.outcome === "no-card") {
    return {
      ok: false, schema: SCHEMA, code: "RH-CHECK-NO-DIGEST-RECORD", cardStatus: inspected.status,
      message:
        "a Resume-Hint card was available at bootstrap but no card-digest record exists to verify " +
        "consumption against (captured outside the CLI capture path, or the digest record is " +
        "unavailable) -- this is the F12/F13 regression shape: the agent proceeded as if it had " +
        "read the card, with no mechanical way to confirm it",
    };
  }
  // queried.outcome === "not-found": a digest is recorded but no receipt anywhere matches it.
  return {
    ok: false, schema: SCHEMA, code: "RH-CHECK-RH-RECEIPT-ABSENT-ANY", cardStatus: inspected.status,
    cardDigest: queried.cardDigest, receiptCount: queried.receiptCount,
    message:
      "an available Resume-Hint card at bootstrap has no matching consumption receipt from ANY " +
      `session (${queried.receiptCount} receipt(s) inspected) -- this is the F12/F13 regression ` +
      "shape, now checked repo-wide: no session anywhere consumed the currently-live card",
  };
}

function main(argv) {
  const json = argv.includes("--json");
  const anySession = argv.includes("--any-session");
  const root = value(argv, "--root");
  const sessionId = value(argv, "--session-id");
  if (anySession && sessionId) {
    process.stderr.write("usage: check-resume-consumption.mjs --any-session and --session-id are mutually exclusive\n");
    return 3;
  }
  if (!root || (!anySession && !sessionId)) {
    process.stderr.write("usage: check-resume-consumption.mjs --root <project> (--session-id <id> | --any-session) [--json]\n");
    return 3;
  }
  let result;
  try {
    result = anySession
      ? checkResumeConsumptionAnySession({ rootDir: resolve(root) })
      : checkResumeConsumption({ rootDir: resolve(root), sessionId });
  } catch (error) {
    process.stderr.write(`check-resume-consumption unavailable: ${error.message}\n`);
    return 3;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  if (result.ok) {
    process.stdout.write(`PASS (${result.code}): ${result.message}\n`);
  } else {
    process.stderr.write(`FATAL (${result.code}): ${result.message}\n`);
  }
  return result.ok ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));
