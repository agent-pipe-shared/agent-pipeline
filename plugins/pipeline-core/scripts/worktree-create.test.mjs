#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "./worktree-create.mjs";
import { mkdtempTestScratch } from "../lib/test-tmpdir.mjs";

function stubDeps(overrides = {}) {
  return {
    requireProjectOnboardingReadyFn: () => {},
    createDetachedWorktreeFn: (repo, purpose, oid, options) => ({
      schema: "pipeline.worktree-lifecycle-record.v1",
      status: "created",
      lifecycle: "detached",
      physicalPath: "/stub",
      ref: null,
      oid,
      purpose,
      sessionId: options.sessionId,
    }),
    writeFn: () => {},
    ...overrides,
  };
}

const DETACHED_ARGV = (noncePath) => [
  "detached", "--repo", "/repo", "--purpose", "probe", "--oid", "a".repeat(40),
  "--session", "s1", "--owner-nonce-file", noncePath,
];

// Windows: Node synthesizes `.mode` on native Windows from the read-only
// attribute alone, so the bare `(stat.mode & 0o077)` comparison in
// ownerNonce() failed closed unconditionally there (backlog/items/
// 2026-08-18-windows-posix-mode-bit-checks-are-meaningless-on-ntfs.md).
// These inject `platform`/`assessWindowsPrivate` via `main()`'s own
// `dependencies` seam to prove the win32 branch decides the outcome, not the
// bare mode bits.
test("win32: a POSIX-insecure owner-nonce file is admitted via the injected DACL assurance instead of failing closed (POSIX unchanged)", () => {
  const dir = mkdtempTestScratch("worktree-create-owner-nonce-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n");
  // Exactly what the old bare `(stat.mode & 0o077) !== 0` comparison would
  // have failed closed on unconditionally, on every platform.
  chmodSync(noncePath, 0o644);

  assert.throws(
    () => main(DETACHED_ARGV(noncePath), {}, stubDeps()),
    /--owner-nonce-file must be a mode-0600 single-link regular file/u,
  );

  let capturedOwnerNonce = null;
  assert.doesNotThrow(() => main(DETACHED_ARGV(noncePath), {}, stubDeps({
    platform: "win32",
    assessWindowsPrivate: () => ({ status: "secure" }),
    createDetachedWorktreeFn: (repo, purpose, oid, options) => {
      capturedOwnerNonce = options.ownerNonce;
      return { schema: "s", status: "created", lifecycle: "detached", physicalPath: "/stub", ref: null, oid, purpose, sessionId: options.sessionId };
    },
  })));
  assert.equal(capturedOwnerNonce, "abc");
});

test("win32: an insecure DACL assessment on the owner-nonce file still fails closed", () => {
  const dir = mkdtempTestScratch("worktree-create-owner-nonce-insecure-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n", { mode: 0o600 });

  assert.throws(
    () => main(DETACHED_ARGV(noncePath), {}, stubDeps({
      platform: "win32",
      assessWindowsPrivate: () => ({ status: "insecure" }),
    })),
    /--owner-nonce-file must be a mode-0600 single-link regular file/u,
  );
});

test("POSIX: a mode-0600 single-link owner-nonce file is admitted (regression, unchanged)", () => {
  const dir = mkdtempTestScratch("worktree-create-owner-nonce-posix-");
  const noncePath = join(dir, "nonce");
  writeFileSync(noncePath, "abc\n", { mode: 0o600 });

  let capturedOwnerNonce = null;
  assert.doesNotThrow(() => main(DETACHED_ARGV(noncePath), {}, stubDeps({
    createDetachedWorktreeFn: (repo, purpose, oid, options) => {
      capturedOwnerNonce = options.ownerNonce;
      return { schema: "s", status: "created", lifecycle: "detached", physicalPath: "/stub", ref: null, oid, purpose, sessionId: options.sessionId };
    },
  })));
  assert.equal(capturedOwnerNonce, "abc");
});
