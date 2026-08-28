#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * push-init.mjs -- NVA-V4-PUSHDRIVER.
 *
 * One command that drives the push path from a clean candidate to the point of
 * signature, the way onboarding-init.mjs already drives project-onboarding-v3.mjs's
 * chain to completion in one invocation instead of an agent hand-running each step
 * (docs/push-release-flow.md, "Layer 1b" through "Layers 2+3"). The human is asked
 * exactly once -- at the signature -- and this driver structurally cannot pass that
 * point: see "WHY THIS IS NOT A nextAction DRIVER" and "THE SIGNATURE BOUNDARY" below.
 *
 * WHY THIS IS NOT A nextAction DRIVER, UNLIKE onboarding-init.mjs. onboarding-init.mjs
 * is generic BECAUSE project-onboarding-v3.mjs already implements a `nextAction`-emitting
 * state machine across every one of its ~31 subcommands -- the driver only ever reads
 * that field and never reasons about what any individual status means. No equivalent
 * protocol exists across the push path: check-doc-reconciliation.mjs, push-gate-
 * satisfiability.mjs and push-prepare.mjs are three independent, already-shipped,
 * READ-ONLY report generators (per their own header comments), none of which emits
 * `nextAction`, and this task's own briefing forbids changing any of them ("orchestrate
 * them as they are"). So this driver instead holds one FIXED, three-step sequence taken
 * directly from docs/push-release-flow.md's own layer ordering (1b, then the satisfiability
 * preflight, then the full prepare report) -- not open-ended interpretation of arbitrary
 * future states, the same narrow kind of domain knowledge onboarding-init.mjs itself
 * already holds about its own bootstrap `inspect` call. It never interprets WHY any given
 * precondition failed, never invents a fix, and never runs a remedy on the caller's
 * behalf -- every failing check is reported with the id/message/remedy the underlying
 * script itself already produces, verbatim.
 *
 * WHY TWO OF THE THREE STEPS ARE IN-PROCESS IMPORTS, NOT SUBPROCESS SPAWNS. push-gate-
 * satisfiability.mjs and push-prepare.mjs live in this SAME directory, are pure,
 * synchronous, side-effect-free functions (`assessPushGateSatisfiability()` /
 * `pushPrepareReport()`, both already exported for reuse -- push-gate-satisfiability.mjs's
 * own header calls itself "FAMILY, NOT DUPLICATION" of push-prepare.mjs for exactly this
 * kind of composition), and -- decisively -- push-prepare.mjs's own CLI mode prints a JSON
 * report followed by human-readable copy-paste text on the SAME stdout stream once the
 * report is ready, which is not a clean subprocess-JSON boundary to parse. Importing the
 * exported functions directly avoids that brittleness entirely and is the identical reuse
 * pattern push-gate-satisfiability.mjs already uses to reuse push-prepare.mjs's own checks.
 * check-doc-reconciliation.mjs, by contrast, lives outside plugins/ entirely
 * (harness/scripts/), is genuinely OPTIONAL per project (see below), and is spawned as a
 * real subprocess against `--root <root>`, matching its own documented CLI contract rather
 * than importing a private library seam across that boundary.
 *
 * WHY LAYER 1b IS CONDITIONAL. check-doc-reconciliation.mjs is this repository's own
 * self-application tooling (ADR-0015) for reconciling ADR-governed paths, not a portable
 * part of the plugin distribution: it lives at `<project-root>/harness/scripts/`, a path
 * that will not exist in an arbitrary consumer project this plugin is installed into. This
 * driver checks for its existence AT THE TARGET PROJECT ROOT (never the plugin's own
 * install directory) before attempting to run it; when absent, Layer 1b is skipped, not
 * failed -- a consumer project without this file has nothing to reconcile against by
 * construction. When present, `--base` becomes a required flag on THIS driver too: the
 * underlying tool declares "no default range" by design (its own header, point 2: "BOTH
 * REQUIRED, no defaults"), and inventing one here would be exactly the kind of
 * domain-knowledge decision ("which commit governs this candidate") this driver has no
 * business making on a human's behalf. `--candidate` is always the literal ref `"HEAD"` --
 * not invented, since it is definitionally the same candidate every other step below binds
 * to (the exact meaning `resolveHeadCommit()` in push-prepare.mjs already gives it).
 *
 * THE SIGNATURE BOUNDARY (absolute; the one property this file must never lose). Once every
 * precondition is green, `pushPrepareReport()` already constructs the exact `authorize-
 * critical` command a human runs at their own terminal (po-human-approval.mjs,
 * `authorizeCriticalPushCommand()`) -- this driver's terminal `signature-required` outcome
 * carries that command's rendered lines VERBATIM, for the caller to hand to the PO, and
 * NEVER executes it, never spawns it, never imports `po-human-approval.mjs` at all. There is
 * no code path in this file that can reach that script. Separately, and structurally, the
 * command `pushPrepareReport()` builds is itself refused by `guard-lifecycle-ready.mjs`'s
 * `isHumanPoSigningCommand()` for ANY `po-human-approval.mjs authorize-critical` invocation
 * regardless of flags (see this driver's own test suite, which asserts this against the
 * REAL guard function, not a description of it) -- so even a caller who tried to run the
 * presented text as a Bash tool call would be refused at the guard layer too. The `approve-
 * push` / `git push` lines `pushPrepareReport()` also renders are carried through purely as
 * forward-looking information for a LATER, separate invocation after a human has produced
 * and consumed the signature elsewhere -- this driver never runs them either.
 *
 * RE-ENTRANT BY CONSTRUCTION, MORE STRONGLY THAN onboarding-init.mjs. Every function this
 * driver calls -- check-doc-reconciliation.mjs, `assessPushGateSatisfiability()`,
 * `pushPrepareReport()` -- is READ-ONLY by its own documented contract (none of the three
 * writes a file, mutates pipeline state, or touches the network). Running this driver twice
 * from the same repository state therefore cannot double-apply anything: there is nothing
 * mutating to double-apply. Two consecutive invocations against unchanged state produce
 * byte-identical results (see this driver's own test suite).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { assessPushGateSatisfiability as realAssessPushGateSatisfiability } from "./push-gate-satisfiability.mjs";
import { pushPrepareReport as realPushPrepareReport } from "./push-prepare.mjs";

export const SCHEMA = "pipeline.push-init.v1";

// Project-root-relative, never plugin-root-relative -- see the header comment "WHY LAYER 1b
// IS CONDITIONAL". A consumer project without this file simply has no Layer 1b to run.
export const RECONCILIATION_SCRIPT_RELATIVE_PATH = "harness/scripts/check-doc-reconciliation.mjs";

export function usage() {
  return "Usage: node plugins/pipeline-core/scripts/push-init.mjs --root <project-dir> --by <name> --remote <remote> --destination refs/heads/<branch> [--base <ref>]";
}

export function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--root", "--by", "--remote", "--destination", "--base"].includes(arg)) {
      const value = argv[index + 1];
      if (typeof value !== "string" || value === "" || value.startsWith("--")) return { error: `${arg} requires a value` };
      output[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      output.help = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (output.help) return output;
  for (const required of ["root", "by", "remote", "destination"]) {
    if (typeof output[required] !== "string" || output[required] === "") return { error: `--${required} is required` };
  }
  return output;
}

/**
 * The exact argv this driver itself is invoked with, as a bare array -- the one thing an
 * agent or PO would actually type as a Bash tool call. Exported so the guard-admission
 * closure test in guard-lifecycle-ready.test.mjs (NVA-V4-PUSHDRIVER, mirroring NVA-CODEXARGV-1)
 * feeds the guard's real admission function a REAL emitted argv rather than a hand-typed
 * copy that could silently drift from what this file's own `parseArgs()` actually accepts.
 */
export function buildPushInitArgv({ root, by, remote, destination, base = null }) {
  const argv = ["--root", root, "--by", by, "--remote", remote, "--destination", destination];
  if (base !== null) argv.push("--base", base);
  return argv;
}

/**
 * Runs the one real subprocess step (check-doc-reconciliation.mjs, when present). Never
 * throws: a spawn failure is folded into a typed `ok: false` result, matching
 * onboarding-init.mjs's own `runOnboardingStep()` idiom for the identical reason -- the
 * caller reports it rather than crashing on it.
 */
function runReconciliationStep({ argv, run }) {
  const result = run("node", argv, { encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result?.error) {
    return { ok: false, exitCode: result.status ?? null, stdout: "", stderr: String(result.error?.message ?? "") };
  }
  const exitCode = result?.status ?? null;
  return {
    ok: exitCode === 0,
    exitCode,
    stdout: String(result?.stdout ?? "").slice(0, 4000),
    stderr: String(result?.stderr ?? "").slice(0, 4000),
  };
}

/** Exported for the same reason buildPushInitArgv() is: a real emitted argv for guard-admission tests. */
export function buildReconciliationArgv({ scriptPath, base, root }) {
  return [scriptPath, "--base", base, "--candidate", "HEAD", "--root", root];
}

/**
 * The driver loop itself. Three injection seams -- `run` (spawnSync-shaped, for the one
 * real subprocess step), `assessPushGateSatisfiability`/`satisfiabilityDeps` and
 * `pushPrepareReport`/`prepareDeps` (both default to the REAL imported functions) -- so
 * tests can exercise every precondition-failure shape without a genuine git working tree
 * carrying real evidence files, PO approval directories and trust anchors, mirroring
 * push-prepare.test.mjs's own `readyDeps()` idiom. `exists` is injectable for the same
 * reason `deps.exists` is threaded through push-prepare.mjs itself.
 */
export function drivePushInit({
  rootDir, by, remote, destination, base = null,
  run = spawnSync,
  exists = existsSync,
  assessPushGateSatisfiability = realAssessPushGateSatisfiability,
  satisfiabilityDeps = {},
  pushPrepareReport = realPushPrepareReport,
  prepareDeps = {},
} = {}) {
  const root = resolve(rootDir);
  for (const [name, value] of [["by", by], ["remote", remote], ["destination", destination]]) {
    if (typeof value !== "string" || value === "") {
      return { schema: SCHEMA, root, outcome: "usage-error", message: `${name} is required and must be a non-empty string` };
    }
  }

  const steps = [];

  // Layer 1b -- conditional, see header comment "WHY LAYER 1b IS CONDITIONAL".
  const reconciliationScriptPath = join(root, RECONCILIATION_SCRIPT_RELATIVE_PATH);
  let reconciliationCheck;
  if (!exists(reconciliationScriptPath)) {
    reconciliationCheck = {
      id: "doc-reconciliation", ok: true, status: "not-applicable",
      message: `${RECONCILIATION_SCRIPT_RELATIVE_PATH} is not present in this project; layer 1b does not apply here.`,
    };
  } else if (base === null) {
    reconciliationCheck = {
      id: "doc-reconciliation", ok: false, status: "base-required",
      message: `${RECONCILIATION_SCRIPT_RELATIVE_PATH} is present, but --base was not supplied. check-doc-reconciliation.mjs declares no default range by design.`,
      remedy: "re-run with --base <ref> naming the range this candidate must be reconciled against",
    };
  } else {
    const argv = buildReconciliationArgv({ scriptPath: reconciliationScriptPath, base, root });
    const stepResult = runReconciliationStep({ argv, run });
    steps.push({ id: "doc-reconciliation", executable: "node", argv, exitCode: stepResult.exitCode, ok: stepResult.ok });
    reconciliationCheck = stepResult.ok
      ? { id: "doc-reconciliation", ok: true, status: "reconciled", message: stepResult.stdout.trim() || "doc reconciliation check passed." }
      : {
        id: "doc-reconciliation", ok: false, status: "unreconciled",
        message: (stepResult.stderr.trim() || stepResult.stdout.trim() || "check-doc-reconciliation.mjs exited non-zero with no output."),
        remedy: "resolve each finding named above (amend the ADR or record it as checked in docs/doc-reconciliation.md), then retry",
      };
  }
  if (!reconciliationCheck.ok) {
    return { schema: SCHEMA, root, outcome: "precondition-unmet", steps, checks: [reconciliationCheck] };
  }

  // Layer 2 (cheap preflight) -- push-gate-satisfiability.mjs, in-process.
  const satisfiability = assessPushGateSatisfiability(["--root", root], satisfiabilityDeps);
  steps.push({ id: "push-gate-satisfiability", inProcess: true, ok: satisfiability.ok });
  if (!satisfiability.ok) {
    return { schema: SCHEMA, root, outcome: "error", steps, error: { faultCode: "usage-error", message: satisfiability.error } };
  }
  if (!satisfiability.report.satisfiable) {
    return {
      schema: SCHEMA, root, outcome: "precondition-unmet", steps,
      checks: satisfiability.report.checks.filter((check) => !check.ok),
    };
  }

  // Layer 2 (full report) -- push-prepare.mjs, in-process.
  const prepareArgv = ["--by", by, "--remote", remote, "--destination", destination];
  const prepare = pushPrepareReport(prepareArgv, { dir: root, ...prepareDeps });
  steps.push({ id: "push-prepare", inProcess: true, ok: prepare.ok });
  if (!prepare.ok) {
    return { schema: SCHEMA, root, outcome: "error", steps, error: { faultCode: "usage-error", message: prepare.error } };
  }
  if (!prepare.report.ready) {
    return {
      schema: SCHEMA, root, outcome: "precondition-unmet", steps,
      checks: prepare.report.checks.filter((check) => !check.ok),
    };
  }

  // Every precondition is green. Present the signature command; never execute it -- see the
  // header comment "THE SIGNATURE BOUNDARY". `executedByDriver: false` is not merely a label:
  // there is no code path above this line, or below it, that spawns or imports
  // po-human-approval.mjs.
  return {
    schema: SCHEMA, root, by, remote, destination, base, outcome: "signature-required", steps,
    subjectSha256: prepare.report.subjectSha256,
    signatureCommand: {
      executedByDriver: false,
      note: "Run this at the PO's own attended terminal. This driver never executes it and cannot -- "
        + "see this file's header comment and its own test suite for the guard-level backstop.",
      lines: prepare.lines.authorize,
    },
    followOn: {
      executedByDriver: false,
      note: "Informational only, for a LATER, separate invocation after the signature above has been "
        + "produced and consumed. This driver stops at the signature and does not run either of these.",
      approvePushLines: prepare.lines.approvePush,
      gitPushLine: prepare.lines.gitPush,
    },
  };
}

export function main(args = process.argv.slice(2), {
  write = process.stdout.write.bind(process.stdout),
  writeError = process.stderr.write.bind(process.stderr),
} = {}) {
  const options = parseArgs(args);
  if (options.help) {
    write(`${usage()}\n`);
    return 0;
  }
  if (options.error) {
    writeError(`${usage()}\n${options.error}\n`);
    return 2;
  }
  const result = drivePushInit({
    rootDir: options.root, by: options.by, remote: options.remote, destination: options.destination,
    base: options.base ?? null,
  });
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.outcome === "signature-required" ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
