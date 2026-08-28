#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// The chat-gate confirming step, and specifically the encoding of what the
// human types back. A gate that PRINTS a value correctly and then cannot
// accept that same value typed is not a gate, it is a lockout -- which is
// exactly what a Windows console on a legacy Western code page produced for
// a PO whose name carries an accent (measured live 2026-08-28, backlog item
// 2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md).

import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_GATE_CONFIRMATION_MISMATCH,
  CHAT_GATE_NOT_ATTENDED,
  decodeTypedLine,
  isAttendedTerminal,
  readAttendedLine,
  requireAttendedChatGateConfirmation,
} from "./chat-gate-ceremony.mjs";

// A stand-in for a terminal that delivers exactly these bytes on fd 0, one
// byte per readSync call, then EOF -- the shape readAttendedLine consumes.
function typing(bytes) {
  const queue = [...bytes];
  return (buffer) => {
    if (queue.length === 0) return 0;
    buffer[0] = queue.shift();
    return 1;
  };
}

const attended = { isattyFn: () => true };

test("a UTF-8 terminal's accented name decodes to what the human typed", () => {
  const utf8 = [...Buffer.from("André\n", "utf8")];
  const line = readAttendedLine("", { ...attended, writeFn: () => {}, readSyncFn: typing(utf8) });
  assert.equal(line, "André");
});

test("a legacy Windows console's single high byte is the same name, not a replacement character", () => {
  // cp1252/cp850: `é` is the one byte 0xE9. Decoded as UTF-8 it is invalid and
  // becomes U+FFFD, which can never equal the value the gate just printed.
  const cp1252 = [0x41, 0x6e, 0x64, 0x72, 0xe9, 0x0a];
  assert.equal(Buffer.from(cp1252.slice(0, 5)).toString("utf8").includes("�"), true,
    "sanity: these are exactly the bytes that used to decode to a replacement character");
  const line = readAttendedLine("", { ...attended, writeFn: () => {}, readSyncFn: typing(cp1252) });
  assert.equal(line, "André");
});

test("the confirmation compares equal for both encodings of the same typed name", () => {
  for (const bytes of [[...Buffer.from("André\n", "utf8")], [0x41, 0x6e, 0x64, 0x72, 0xe9, 0x0a]]) {
    const result = requireAttendedChatGateConfirmation({
      summaryLines: ["by: André"],
      expected: "André",
      dependencies: { ...attended, writeFn: () => {}, readSyncFn: typing(bytes) },
    });
    assert.deepEqual(result, { ok: true });
  }
});

test("ASCII input, a trailing CR and surrounding whitespace are unchanged by the decoder", () => {
  assert.equal(decodeTypedLine([...Buffer.from("Andre", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([...Buffer.from("  Andre  ", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([...Buffer.from("Andre\r", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([]), "");
});

test("a genuinely different typed value is still a mismatch", () => {
  const result = requireAttendedChatGateConfirmation({
    expected: "André",
    dependencies: { ...attended, writeFn: () => {}, readSyncFn: typing([...Buffer.from("Andrea\n", "utf8")]) },
  });
  assert.deepEqual(result, { ok: false, code: CHAT_GATE_CONFIRMATION_MISMATCH });
});

test("the attendance boundary is unchanged: a non-TTY refuses before any byte is read", () => {
  let reads = 0;
  const result = requireAttendedChatGateConfirmation({
    expected: "André",
    dependencies: {
      isattyFn: () => false,
      writeFn: () => {},
      readSyncFn: (buffer) => { reads += 1; buffer[0] = 0x0a; return 1; },
    },
  });
  assert.deepEqual(result, { ok: false, code: CHAT_GATE_NOT_ATTENDED });
  assert.equal(reads, 0, "a pipe carrying the right bytes must never be read at all");
  assert.equal(isAttendedTerminal({ isattyFn: () => { throw new Error("no tty"); } }), false,
    "an undeterminable fd 0 stays 'not attended' -- the fail-closed direction");
});
