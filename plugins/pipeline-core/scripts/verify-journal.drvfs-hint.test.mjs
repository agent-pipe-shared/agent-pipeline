// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { VERIFY_PRIVATE_DIRECTORY_HINT, registerRunRecordOwner } from "./verify-journal.mjs";

const args = { gitCommonDir: "/unused", runId: "verify-hint", runPath: "/unused/run" };

test("not-private failure keeps the outer code, preserves the cause and names the DrvFs hint", () => {
  const inner = new Error("VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE");
  let thrown;
  try { registerRunRecordOwner({ ...args, registerRecord: () => { throw inner; } }); } catch (error) { thrown = error; }
  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
  assert.match(thrown.message, /VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE/u);
  assert.ok(thrown.message.includes(VERIFY_PRIVATE_DIRECTORY_HINT));
  assert.match(thrown.message, /DrvFs/u);
  assert.match(thrown.message, /Linux home/u);
  assert.equal(thrown.cause, inner);
});

test("another inner failure keeps its cause and carries no hint", () => {
  const inner = new Error("VERIFY-JOURNAL-DIRECTORY-UNSAFE");
  let thrown;
  try { registerRunRecordOwner({ ...args, registerRecord: () => { throw inner; } }); } catch (error) { thrown = error; }
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
  assert.match(thrown.message, /VERIFY-JOURNAL-DIRECTORY-UNSAFE/u);
  assert.equal(thrown.cause, inner);
  assert.ok(!thrown.message.includes("HINT"));
  assert.ok(!/DrvFs/u.test(thrown.message));
});
