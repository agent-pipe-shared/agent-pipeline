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
import { boundedOpaqueCopyCommand, renderProjectOnboardingAction, shellWord } from "./project-onboarding-v3.mjs";

export { boundedOpaqueCopyCommand };

const PLACEHOLDER = Symbol("copySafeCommandPlaceholder");

/**
 * NVA-W12-COPYSAFE (backlog/items/2026-08-28-po-facing-commands-are-not-
 * uniformly-rendered-break-safe.md): wrap an argv value that is an
 * UNRESOLVED placeholder for the human to fill in -- e.g. "<plan-sha256>",
 * an instruction like "<external-proof.json>" -- rather than literal data the
 * command is meant to run as-is. boundedCopySafeCommand() renders a wrapped
 * value verbatim, never through shellWord()'s literal-value quoting: quoting
 * a placeholder (producing '<plan-sha256>' with the single quotes ADDED)
 * makes it look like literal content that needs the quotes typed too, which
 * is exactly the class of misreading this backlog item measured live (a
 * placeholder read literally, a value mis-transcribed in transit). Passing
 * the placeholder text through unescaped keeps it visually distinct from the
 * command's real, copy-run-verbatim argv values.
 *
 * NVA-CF-COPYSAFE: this constructor used to accept ANY non-empty string and
 * boundedCopySafeCommand() rendered it verbatim, no matter what it held.
 * Both real callers (guard-lifecycle-ready.mjs, guard-testpath.mjs) ALSO
 * wrap LIVE data through it -- placeholder(JSON.stringify(<absolute path>))
 * -- to keep the ceremony denial's path quoted even where shellWord() would
 * judge the path "safe enough" to print bare. JSON.stringify()'s quoting is
 * NOT shell-safe (it never escapes "$", a backtick, or "$(", only '"' and
 * control characters), so a project path containing one of those was
 * shell-expanded or command-substituted the moment a human pasted the
 * emitted "copy-safe" command -- the module's own contract ("never a
 * hand-assembled string") did not actually hold for this lane. Rendering now
 * splits into two DISTINCT, closed kinds, decided once by isTemplateSlot()
 * below and never re-guessed anywhere else in this module:
 *
 *  - a GENUINE unresolved template slot: text that IS the human fill-in hint
 *    itself, matching a closed "<...>" (or free-text "\"<...>\"") shape --
 *    gated behind that pattern, so it can never be reached by real path
 *    data by construction. Rendered exactly as given, verbatim, same as
 *    before this fix (existing tests pin this).
 *  - everything else is treated as a quoted LITERAL value, never rendered
 *    verbatim: recovered back to its raw form (JSON.parse, since
 *    JSON.stringify() of a plain string always round-trips) where it looks
 *    JSON-string-shaped, then rendered through shellWord() -- the SAME real
 *    escaping every ordinary (non-placeholder) argv value already gets.
 *
 * @param {string} text the placeholder text to render exactly as given, e.g. "<plan-sha256>".
 */
export function placeholder(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("placeholder requires a non-empty string");
  }
  return { [PLACEHOLDER]: true, text };
}

function isPlaceholder(value) {
  return value !== null && typeof value === "object" && value[PLACEHOLDER] === true;
}

/**
 * NVA-CF-COPYSAFE: the ONLY gate deciding whether a placeholder() value is a
 * genuine unresolved template slot -- never fed real path/command data,
 * because a real absolute path essentially never IS this exact closed shape.
 * Two forms: a bare "<...>" token (e.g. "<plan-sha256>"), or the same token
 * wrapped in one literal pair of double quotes (e.g. "\"<human-reason>\"") --
 * the shape a caller uses so the human sees the surrounding quote marks are
 * part of what to type too. Anything else -- above all a JSON.stringify()'d
 * live path, which starts with '"' followed by '/' or a drive letter, never
 * by "<" -- falls through to the quoted-literal (shellWord()-escaped) path.
 */
function isTemplateSlot(text) {
  return /^<[^<>]+>$/u.test(text) || /^"<[^<>]+>"$/u.test(text);
}

/**
 * NVA-CF-COPYSAFE: recover the raw value a caller pre-quoted with
 * JSON.stringify() before wrapping it in placeholder(). JSON.stringify() of
 * a plain string always round-trips through JSON.parse() back to the exact
 * original value, so this un-does exactly the quoting the real callers add
 * and nothing else. Text that is not itself valid JSON-stringified text
 * (does not start and end with '"', or fails to parse) is returned
 * unchanged -- still never rendered verbatim, since the caller applies
 * shellWord() to whatever this returns.
 */
function quotedLiteralRawValue(text) {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Not valid JSON -- fall through and treat the text itself as the raw value.
    }
  }
  return text;
}

/** The exact text boundedCopySafeCommand() puts into the assembled command line for a placeholder() value. */
function renderPlaceholderValue(text) {
  return isTemplateSlot(text) ? text : shellWord(quotedLiteralRawValue(text));
}

/** The exact value boundedCopySafeCommand() puts into its returned argv for a placeholder() value. */
function resolvePlaceholderValue(text) {
  return isTemplateSlot(text) ? text : quotedLiteralRawValue(text);
}

/**
 * Bounded, copy-safe rendering of an argv -- never a hand-assembled string.
 * Returns the exact executable/argv the caller gave (for a round-trip proof
 * against a real shell), the one assembled command line, and the bounded
 * posix/powershell/cmd renderings of that line.
 *
 * An argv entry may be a plain string (quoted/escaped exactly as
 * renderProjectOnboardingAction() already does for every existing caller --
 * unchanged) or a placeholder() value -- rendered verbatim ONLY when it is a
 * genuine unresolved template slot, shellWord()-quoted like any other real
 * value otherwise (see placeholder()'s own header for the full split). A
 * no-placeholder call is byte-identical to before this mode existed: it
 * still goes through renderProjectOnboardingAction() unchanged, never the
 * new per-argv-entry path.
 *
 * @param {{ executable: string, argv: (string|ReturnType<typeof placeholder>)[] }} action
 * @returns {{ executable: string, argv: string[], command: string, copyCommand: { maxColumns: number, posix: string|null, powershell: string|null, cmd: string|null } }}
 */
export function boundedCopySafeCommand({ executable, argv } = {}) {
  if (typeof executable !== "string" || executable.length === 0) {
    throw new TypeError("boundedCopySafeCommand requires a non-empty executable");
  }
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((part) => typeof part === "string" || isPlaceholder(part))) {
    throw new TypeError("boundedCopySafeCommand requires a non-empty argv of strings or placeholder() values");
  }
  const hasPlaceholder = argv.some(isPlaceholder);
  const command = hasPlaceholder
    ? [executable, ...argv].map((part) => (isPlaceholder(part) ? renderPlaceholderValue(part.text) : shellWord(part))).join(" ")
    : renderProjectOnboardingAction({ kind: "command", executable, argv });
  const resolvedArgv = hasPlaceholder ? argv.map((part) => (isPlaceholder(part) ? resolvePlaceholderValue(part.text) : part)) : argv;
  return { executable, argv: resolvedArgv, command, copyCommand: boundedOpaqueCopyCommand(command) };
}
