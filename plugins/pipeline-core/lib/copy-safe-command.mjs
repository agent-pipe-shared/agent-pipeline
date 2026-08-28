#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * NVA-GF-COPYSAFE: the ONE shared renderer for every command the Pipeline hands
 * a human to run externally, so an emitter never formats its own.
 *
 * backlog/items/2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md
 * measured five separate transfer failures in security-critical steps from the
 * Codex/WSL greenfield run -- none of them user error: a hand-assembled,
 * unbounded command line broke somewhere in transit (a binary invoked as if it
 * were a script, a path split by a line break, a missing space after a flag, a
 * mistyped path segment, a placeholder read literally). `guard-lifecycle-ready.mjs`
 * already renders its human-override ceremony bounded and copy-safe (max 72
 * columns, posix/powershell/cmd variants, `CMD=`/`${CMD}` fragment assembly,
 * `eval "$CMD"` reconstruction) -- the PO confirms that specific rendering is
 * the one that works. This module is that technique, generalized to any argv,
 * so a NEW emitter never has to re-invent or hand-quote it.
 *
 * This is composition, not reimplementation: `renderProjectOnboardingAction()`
 * already turns an `{ kind: "command", executable, argv }` action into one
 * exact, correctly-quoted shell line (the same `shellWord()` quoting proven to
 * single-quote a value containing spaces or non-ASCII characters correctly);
 * `boundedOpaqueCopyCommand()` already turns an assembled command STRING into a
 * bounded, multi-platform (posix/powershell/cmd), pre-quoted copy rendering.
 * `scripts/po-human-approval.mjs`'s `authorizeCriticalPushCommand()` (GF-105)
 * already composes these two by hand for exactly one command; this module pulls
 * that composition out into ONE reusable, argv-native function so the next
 * caller does not have to rediscover it -- the bounded-chunking algorithm keeps
 * its one definition in project-onboarding-v3.mjs, this file never duplicates
 * it.
 */
import { boundedOpaqueCopyCommand, renderProjectOnboardingAction } from "./project-onboarding-v3.mjs";

export { boundedOpaqueCopyCommand };

/**
 * Bounded, copy-safe rendering of an argv -- never a hand-assembled string.
 * Returns the exact executable/argv the caller gave (for a round-trip proof
 * against a real shell), the one assembled command line, and the bounded
 * posix/powershell/cmd renderings of that line.
 *
 * @param {{ executable: string, argv: string[] }} action
 * @returns {{ executable: string, argv: string[], command: string, copyCommand: { maxColumns: number, posix: string|null, powershell: string|null, cmd: string|null } }}
 */
export function boundedCopySafeCommand({ executable, argv } = {}) {
  if (typeof executable !== "string" || executable.length === 0) {
    throw new TypeError("boundedCopySafeCommand requires a non-empty executable");
  }
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((part) => typeof part === "string")) {
    throw new TypeError("boundedCopySafeCommand requires a non-empty argv of strings");
  }
  const command = renderProjectOnboardingAction({ kind: "command", executable, argv });
  return { executable, argv, command, copyCommand: boundedOpaqueCopyCommand(command) };
}
