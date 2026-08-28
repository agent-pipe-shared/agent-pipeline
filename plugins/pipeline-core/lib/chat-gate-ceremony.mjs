// SPDX-License-Identifier: SUL-1.0
/**
 * Shared chat-mode gate-kind primitive (AGY-CHATADAPTER-1).
 *
 * The confirmed defect this closes
 * (backlog/items/2026-08-25-chat-mode-push-approval-has-no-enforced-human-turn-boundary.md):
 * `pipeline-state.mjs`'s old `approve-push` chat-mode ceremony round-tripped
 * a challenge code entirely through agent-visible stdout/stdin -- nothing
 * stopped the SAME automated actor from reading the code its own first call
 * printed and immediately submitting it back via a second call, with no
 * live human ever involved.
 *
 * The property that actually closes this is the one `po-human-approval.mjs`'s
 * `defaultReadConfirmation()` already relies on for `signature` mode: a
 * `readSync(0, ...)` against file descriptor 0 reads whatever is attached to
 * THIS process's own stdin. An agent's own tool-calling harness invokes a
 * command with a non-interactive stdin (closed, /dev/null, or a plain pipe)
 * -- `process.stdin.isTTY` is falsy there, never `true` -- while a human
 * running the same command directly in their own terminal has a real TTY on
 * fd 0. Checking `isAttendedTerminal()` BEFORE any read is the actual
 * boundary: a pipe carrying the exact right bytes is NOT sufficient on its
 * own (`readSync` would happily read a pipe too), so the TTY check must
 * gate entry, not merely follow a successful read.
 *
 * This module is deliberately narrow: it is the confirming-step primitive
 * only. What is bound to a confirmation (a push's commit/remote/destination,
 * a kickoff `--language` value, ...) stays the caller's own business -- see
 * `pipeline-state.mjs`'s `approve-push` case and
 * `project-onboarding-v3.mjs`'s kickoff-language gate for the two callers
 * this ships with.
 */
import { readSync } from "node:fs";

export const CHAT_GATE_NOT_ATTENDED = "CHAT-GATE-NOT-ATTENDED";
export const CHAT_GATE_CONFIRMATION_MISMATCH = "CHAT-GATE-CONFIRMATION-MISMATCH";

/**
 * True only when fd 0 is a real terminal device. Never throws -- any
 * failure to determine TTY-ness is treated as "not attended", the fail-
 * closed direction for a security gate.
 *
 * `dependencies.isattyFn` is the injectable seam a test uses to simulate an
 * attended terminal without allocating a real one.
 */
export function isAttendedTerminal(dependencies = {}) {
  const isatty = dependencies.isattyFn ?? (() => process.stdin.isTTY === true);
  try {
    return isatty() === true;
  } catch {
    return false;
  }
}

/**
 * Turns the raw bytes a human typed into the string they typed.
 *
 * UTF-8 first, because that is what a POSIX terminal and a UTF-8 Windows
 * console both send. But a Windows console running a legacy Western code
 * page (cp1252/cp850, still the default in many PowerShell and cmd.exe
 * windows) sends `é` as the single byte 0xE9, which is not valid UTF-8:
 * decoding it as UTF-8 yields U+FFFD, and the comparison against the value
 * the gate just PRINTED correctly can then never succeed. Measured live
 * 2026-08-28 on Windows, `pipeline-state.mjs po-authority-acknowledge-apply
 * --by "André"`: the prompt displayed the name correctly, and no way of
 * typing it was accepted -- a PO whose name carries an umlaut or accent was
 * locked out of every chat-mode gate on that platform
 * (backlog/items/2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-
 * on-windows.md).
 *
 * So: strict UTF-8, and only when the bytes are NOT valid UTF-8 -- a
 * deterministic property of the bytes themselves, not a guess or a
 * second-chance retry -- they are read as latin1, the correct reading of
 * that console's high bytes for every accented LETTER (cp1252 and latin1
 * agree across 0xC0-0xFF; they differ only in the 0x80-0x9F punctuation
 * range, which no name needs and which stays a mismatch).
 *
 * This widens no security boundary. The gate's proof of a live human is
 * `isAttendedTerminal()` -- a real TTY on fd 0 -- and the typed value is a
 * confirmation, never a secret. Reading the same keystrokes under the
 * encoding the terminal actually used admits no input a human did not type.
 */
export function decodeTypedLine(bytes) {
  const raw = Buffer.from(bytes);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    text = raw.toString("latin1");
  }
  return text.replace(/\r$/u, "").trim();
}

/**
 * Reads one line of plain-text input from the real controlling terminal
 * (fd 0). Mirrors `po-human-approval.mjs`'s own `defaultReadConfirmation()`
 * byte for byte -- same blocking `readSync(0, ...)` loop, same EAGAIN/EOF
 * handling, and the same shared `decodeTypedLine()` above (imported there,
 * not copied, so the two can no longer drift) -- so this primitive inherits
 * a property already proven safe there rather than defining a second,
 * divergent one.
 *
 * Callers MUST check `isAttendedTerminal()` first; this function does not
 * re-check it, so calling it against a non-TTY fd 0 would read whatever is
 * piped in (or block) instead of refusing cleanly -- exactly the property
 * `requireAttendedChatGateConfirmation` below exists to prevent a caller
 * from getting wrong.
 */
export function readAttendedLine(prompt, dependencies = {}) {
  const write = dependencies.writeFn ?? ((text) => process.stdout.write(text));
  write(prompt);
  const readByte = dependencies.readSyncFn ?? ((buffer) => readSync(0, buffer, 0, 1, null));
  const buffer = Buffer.alloc(1);
  const bytes = [];
  for (;;) {
    let read;
    try {
      read = readByte(buffer);
    } catch (error) {
      if (error?.code === "EAGAIN") continue;
      if (error?.code === "EOF") break;
      throw error;
    }
    if (read === 0 || buffer[0] === 10) break;
    bytes.push(buffer[0]);
  }
  return decodeTypedLine(bytes);
}

/**
 * The one reusable chat-mode confirming step. `expected` is the value the
 * human must type back (a challenge code, a fixed word, ...); `summaryLines`
 * describe what is being approved so the human reads it before confirming
 * (ADR-0061 Decision 4). Returns `{ ok: true }` or `{ ok: false, code }` --
 * never throws, so every caller (push, kickoff language, ...) gets the
 * identical two-valued contract and the identical failure codes.
 */
export function requireAttendedChatGateConfirmation({ summaryLines = [], expected, dependencies = {} }) {
  if (!isAttendedTerminal(dependencies)) return { ok: false, code: CHAT_GATE_NOT_ATTENDED };
  const prompt = [...summaryLines, "Type the confirmation value shown to you to proceed: "].join("\n");
  const read = dependencies.readLineFn ?? ((text) => readAttendedLine(text, dependencies));
  const answer = read(prompt);
  if (answer !== expected) return { ok: false, code: CHAT_GATE_CONFIRMATION_MISMATCH };
  return { ok: true };
}
