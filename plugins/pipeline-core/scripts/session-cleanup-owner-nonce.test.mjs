#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "./session-cleanup.mjs";
import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";

// "register-intent" reaches sessionOwner()/ownerNonce() without first calling
// requireProjectOnboardingReadyFn (that gate only runs for "start" and
// "plan-privatization"), so no extra stubbing is needed to reach the check
// under test. What happens after a successful ownerNonce() (a real
// registerTemporaryIntent() call against a bare scratch directory) is
// intentionally not asserted beyond "it is not the mode-check error" -- this
// suite is about ownerNonce()'s own win32 branch, not the full command.
const ARGV = (repo, noncePath) => [
  "register-intent", "--repo", repo, "--session", "s1", "--owner-nonce-file", noncePath,
  "--resource-id", "r1", "--type", "scratch-file", "--path", "/tmp/x",
  "--content-class", "scratch", "--policy", "unlink-file",
];
const MODE_CHECK_MESSAGE = /--owner-nonce-file must be a mode-0600 single-link regular file/u;

function runMain(argv, env, dependencies) {
  try {
    main(argv, env, dependencies);
    return { threw: false, message: null };
  } catch (error) {
    return { threw: true, message: error.message };
  }
}

// Windows: Node synthesizes `.mode` on native Windows from the read-only
// attribute alone, so the bare `(stat.mode & 0o077)` comparison in
// ownerNonce() failed closed unconditionally there (backlog/items/
// 2026-08-18-windows-posix-mode-bit-checks-are-meaningless-on-ntfs.md).
// These inject `platform`/`assessWindowsPrivate` via main()'s own
// `dependencies` seam to prove the win32 branch decides the outcome, not the
// bare mode bits.
test("win32: a POSIX-insecure owner-nonce file is admitted via the injected DACL assurance instead of failing closed (POSIX unchanged)", () => {
  const dir = mkdtempTestScratch("session-cleanup-owner-nonce-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n");
  // Exactly what the old bare `(stat.mode & 0o077) !== 0` comparison would
  // have failed closed on unconditionally, on every platform.
  chmodSync(noncePath, 0o644);

  const posix = runMain(ARGV(dir, noncePath), {}, {});
  assert.equal(posix.threw, true);
  assert.match(posix.message, MODE_CHECK_MESSAGE);

  const win32Secure = runMain(ARGV(dir, noncePath), {}, {
    platform: "win32", assessWindowsPrivate: () => ({ status: "secure" }),
  });
  // The mode-check error specifically must not recur; whatever happens next
  // (a real registerTemporaryIntent() call against a bare scratch directory)
  // is out of scope for this check.
  if (win32Secure.threw) assert.doesNotMatch(win32Secure.message, MODE_CHECK_MESSAGE);
});

test("win32: an insecure DACL assessment on the owner-nonce file still fails closed", () => {
  const dir = mkdtempTestScratch("session-cleanup-owner-nonce-insecure-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n", { mode: 0o600 });

  const win32Insecure = runMain(ARGV(dir, noncePath), {}, {
    platform: "win32", assessWindowsPrivate: () => ({ status: "insecure" }),
  });
  assert.equal(win32Insecure.threw, true);
  assert.match(win32Insecure.message, MODE_CHECK_MESSAGE);
});

test("POSIX: a mode-0600 single-link owner-nonce file is admitted (regression, unchanged)", () => {
  const dir = mkdtempTestScratch("session-cleanup-owner-nonce-posix-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n", { mode: 0o600 });

  const posix = runMain(ARGV(dir, noncePath), {}, {});
  if (posix.threw) assert.doesNotMatch(posix.message, MODE_CHECK_MESSAGE);
});
