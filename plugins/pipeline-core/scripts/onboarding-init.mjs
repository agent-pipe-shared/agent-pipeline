#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-B-GUIDEDINIT: one guided entry point that drives project-onboarding-v3.mjs's
 * deterministic onboarding chain (the ~31-entry `ONBOARDING_SUBCOMMANDS` table) to
 * completion in ONE invocation, stopping only where a human genuinely decides something.
 *
 * Same move, one layer up, as pipeline-start-preflight.mjs
 * (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`): that file consolidates
 * the bootstrap checks into one call instead of making the agent perform each one by
 * hand. This file does the identical thing for the onboarding chain -- purely additive,
 * nothing existing changes behaviour.
 *
 * GENERIC OVER THE nextAction PROTOCOL, NO DOMAIN KNOWLEDGE: this driver never reasons
 * about what any individual onboarding status (`kickoff-required`, `intake-required`,
 * `portable-seed-required`, ...) actually means. It only reads the `nextAction` field
 * every onboarding-cli result carries (lib/project-onboarding-v3.mjs) and recognizes
 * exactly two of its kinds:
 *   - `kind: "command"`  -- a ready-to-run `{ executable, argv }` this driver executes
 *     itself, then loops back to read the new state.
 *   - `kind: "collect-input"` -- a genuine human question. The driver stops here and
 *     returns that action's own `inputs`/`input`/`guidance` fields VERBATIM (via the raw
 *     final onboarding-cli response, never re-worded or summarized).
 * Anything else it cannot safely act on, so it also stops rather than guessing:
 *   - `nextAction` absent/null while `status` is not `"ready"` -- e.g. a standalone
 *     recovery command's own plan response (`plan-partial-authority`'s
 *     `"selection-required"`, which uses a `selection` field instead of `nextAction` and
 *     is never reached by a fresh repository's own `inspect` walk in the first place).
 *   - any `nextAction.kind` other than `"command"`/`"collect-input"` (e.g.
 *     `"restart-process"`), which needs an attended external terminal this driver cannot
 *     provide.
 *
 * NEVER INVENTS A VALUE. Not a language, not a profile, not a git author identity, not a
 * goal -- those are the human's. This driver holds no logic that could fabricate one: a
 * `collect-input` stop always returns the action untouched.
 *
 * RE-ENTRANT BY CONSTRUCTION, not by any state this file itself keeps. Every invocation
 * starts a fresh `inspect --root <root>` and walks forward from whatever the underlying
 * CLI's own durable, on-disk state says right now. A human supplying an answer means
 * someone runs the specific mutating command the `collect-input` action named, with the
 * real answer values, OUTSIDE this driver, exactly once; re-running this driver afterward
 * picks up from the new state -- there is nothing to double-apply, because this driver
 * remembers nothing between invocations.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const SCHEMA = "pipeline.onboarding-init.v1";

// "roughly thirty subcommands" (this task's own briefing) is the real chain length a
// fresh repository walks; this cap gives headroom above that without being unbounded, so
// a malformed or non-converging chain (a `nextAction` that keeps pointing back at itself)
// cannot spin forever.
export const DEFAULT_STEP_CAP = 50;

const ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/onboarding-init.mjs --root <project-dir> [--runner claude|codex|antigravity] [--step-cap <n>]";
}

// The runner lane, pinned rather than inherited.
//
// The onboarding CLI resolves its runner from the ENVIRONMENT when `--runner` is absent
// (`resolveActiveRunner`, scripts/project-onboarding-v3.mjs): `CLAUDECODE=1` means claude,
// an Antigravity marker means antigravity, and everything else falls into an else-branch
// that answers `codex` -- including a plain human terminal, which is no runner at all.
//
// That guess reaches this driver as a real behavioural difference, not a label: a fresh
// repository resolved as codex is handed a Codex restart barrier, whose `nextAction.kind`
// is `restart-process`, which this driver correctly refuses to execute. The identical
// invocation therefore reaches a `collect-input` question inside a Claude Code session and
// `unsupported-next-action` in the operator's own shell -- measured 2026-08-28, where this
// file's own suite passed eight times under an agent and failed deterministically under
// `env -u CLAUDECODE`.
//
// So the lane is a caller decision here, threaded into the first `inspect` (every later
// command is constructed BY the CLI, which carries its own resolved runner forward). An
// omitted `--runner` keeps the CLI's existing environment resolution unchanged -- this adds
// a way to be explicit, it does not change the default -- and the resolved-or-null value is
// reported in the result so a caller can see which lane it is on instead of assuming.
const RUNNERS = new Set(["claude", "codex", "antigravity"]);

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { error: "--root requires a project directory" };
      output.root = value;
      index += 1;
    } else if (arg === "--runner") {
      const value = argv[index + 1];
      if (!RUNNERS.has(value)) return { error: `--runner requires one of: ${[...RUNNERS].join(", ")}` };
      output.runner = value;
      index += 1;
    } else if (arg === "--step-cap") {
      const raw = argv[index + 1];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) return { error: "--step-cap requires a positive integer" };
      output.stepCap = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      output.help = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!output.help && !output.root) return { error: "--root is required" };
  return output;
}

/**
 * Runs one onboarding-cli invocation and classifies the outcome. Never throws: every
 * failure mode (the process itself could not start, stdout was not valid JSON, or the
 * process exited non-zero) is folded into a typed `ok: false` result the caller reports
 * rather than crashes on.
 */
function runOnboardingStep({ executable, argv, run }) {
  const result = run(executable, argv, { encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result?.error) {
    return { ok: false, faultCode: "spawn-failed", exitCode: result.status ?? null, stderr: String(result.error?.message ?? "") };
  }
  const exitCode = result?.status ?? null;
  let parsed = null;
  let parseFailed = false;
  try {
    parsed = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    parseFailed = true;
  }
  if (parseFailed) {
    return {
      ok: false,
      faultCode: "unparseable-output",
      exitCode,
      stdout: String(result?.stdout ?? "").slice(0, 4000),
      stderr: String(result?.stderr ?? "").slice(0, 4000),
    };
  }
  if (exitCode !== 0) {
    return { ok: false, faultCode: "nonzero-exit", exitCode, output: parsed, stderr: String(result?.stderr ?? "").slice(0, 4000) };
  }
  return { ok: true, exitCode, output: parsed };
}

/**
 * The driver loop itself. `run` (spawnSync-shaped: `(executable, argv, options) =>
 * { status, stdout, stderr, error }`) is the sole injection seam, so tests can either
 * spawn the real onboarding CLI against a real temporary directory, or supply a synthetic
 * responder to exercise the step-cap path without a genuinely non-converging real chain.
 */
export function driveOnboardingInit({ rootDir, runner = null, stepCap = DEFAULT_STEP_CAP, run = spawnSync } = {}) {
  const root = resolve(rootDir);
  const steps = [];
  let executable = "node";
  let argv = runner === null
    ? [ONBOARDING_SCRIPT_PATH, "inspect", "--root", root]
    : [ONBOARDING_SCRIPT_PATH, "inspect", "--root", root, "--runner", runner];

  for (let stepIndex = 0; stepIndex < stepCap; stepIndex += 1) {
    const stepResult = runOnboardingStep({ executable, argv, run });
    steps.push({
      executable,
      argv,
      exitCode: stepResult.exitCode,
      faultCode: stepResult.ok ? null : stepResult.faultCode,
    });

    if (!stepResult.ok) {
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "error",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        error: {
          faultCode: stepResult.faultCode,
          exitCode: stepResult.exitCode,
          stderr: stepResult.stderr ?? null,
          stdout: stepResult.stdout ?? null,
        },
        final: stepResult.output ?? null,
      };
    }

    const output = stepResult.output;
    const nextAction = output && typeof output === "object" ? output.nextAction : undefined;

    if (nextAction && typeof nextAction === "object" && nextAction.kind === "command") {
      const argvValid = typeof nextAction.executable === "string"
        && Array.isArray(nextAction.argv)
        && nextAction.argv.every((part) => typeof part === "string");
      if (!argvValid) {
        return {
          schema: SCHEMA,
          runner,
          root,
          outcome: "error",
          stepCap,
          stepsExecuted: steps.length,
          steps,
          error: { faultCode: "malformed-command-action", exitCode: null, stderr: null, stdout: null },
          final: output,
        };
      }
      executable = nextAction.executable;
      argv = nextAction.argv;
      continue;
    }

    if (nextAction && typeof nextAction === "object" && nextAction.kind === "collect-input") {
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "collect-input",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        collectInput: nextAction,
        final: output,
      };
    }

    if ((nextAction === null || nextAction === undefined) && output?.status === "ready") {
      return { schema: SCHEMA, runner, root, outcome: "ready", stepCap, stepsExecuted: steps.length, steps, final: output };
    }

    if (nextAction === null || nextAction === undefined) {
      // A resting response with no `nextAction` and a `status` other than `"ready"` -- e.g.
      // a standalone recovery command's own plan response. Not reachable by a fresh
      // repository's own chain, but never guessed at if it somehow is: report and stop.
      return {
        schema: SCHEMA,
        runner,
        root,
        outcome: "no-automatic-next-step",
        stepCap,
        stepsExecuted: steps.length,
        steps,
        final: output,
      };
    }

    // A `nextAction` with a kind this driver does not execute (e.g. `restart-process`,
    // which needs an attended external terminal) -- reported honestly, never attempted.
    return {
      schema: SCHEMA,
      runner,
      root,
      outcome: "unsupported-next-action",
      stepCap,
      stepsExecuted: steps.length,
      steps,
      final: output,
    };
  }

  return { schema: SCHEMA, runner, root, outcome: "step-cap-exceeded", stepCap, stepsExecuted: steps.length, steps, final: null };
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
  const result = driveOnboardingInit({ rootDir: options.root, runner: options.runner ?? null, stepCap: options.stepCap });
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.outcome === "ready" || result.outcome === "collect-input" ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) process.exit(main());
