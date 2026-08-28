#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * repository-path-identity.test.mjs -- NVA-PATHIDENT-1.
 *
 * Two jobs, and the second is the reason this file exists at all:
 *
 * 1. Pin the shared fold's own behaviour (the two notations that ARE folded, the
 *    world that is deliberately left untouched, and the fallback shape).
 * 2. Hold ALL THREE historical call sites against ONE input table, so a future
 *    divergence between them fails loudly. Before the extraction the same ~10 lines
 *    existed three times under three names; the item that drove this work
 *    (pipeline.three-independent-copies-of-the-wsl-windows-path-normalization) asked
 *    for exactly this table as the floor, independent of whether the extraction
 *    happened. It did happen -- and the table still earns its place, because nothing
 *    stops a later edit from re-localising one of the three.
 *
 * Run: node plugins/pipeline-core/lib/repository-path-identity.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  repositoryPathIdentityOrSelf,
  windowsDriveLetterIdentity,
  windowsNotationCandidate,
} from "./repository-path-identity.mjs";
import { fingerprintIdentity } from "./codex-onboarding-runtime.mjs";
import { canonicalRepositoryPathIdentity } from "./po-gate-authority.mjs";
import { guardMaintenanceWindowInternals } from "./guard-maintenance-window.mjs";

const { repoPathIdentity } = guardMaintenanceWindowInternals;

/**
 * The shared table. `windowsWorld` says whether the path is recognised as one of the
 * two folded notations at all -- that is the ONE question all three call sites answer
 * identically, and therefore the one a divergence would break.
 */
const TABLE = [
  { path: "/home/user/repo", windowsWorld: false, label: "a plain POSIX checkout" },
  { path: "/mnt/c/Users/andre/repo", windowsWorld: true, label: "the WSL automount spelling" },
  { path: "/mnt/C/Users/andre/repo", windowsWorld: true, label: "the WSL automount spelling, upper-case drive" },
  { path: "C:\\Users\\andre\\repo", windowsWorld: true, label: "the native Windows spelling" },
  { path: "C:/Users/andre/repo", windowsWorld: true, label: "the Windows spelling with forward slashes" },
  { path: "D:\\Dev\\repo", windowsWorld: true, label: "a second drive letter" },
  { path: "/mnt/see/not-a-drive", windowsWorld: false, label: "a /mnt path whose segment is not a single drive letter" },
  { path: "/mnt/c", windowsWorld: true, label: "a bare drive mount with no trailing path" },
  { path: "relative/path", windowsWorld: false, label: "a relative path" },
  { path: "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo", windowsWorld: false, label: "the UNC spelling, deliberately NOT folded" },
];

test("windowsNotationCandidate recognises exactly the two folded notations", () => {
  for (const row of TABLE) {
    const candidate = windowsNotationCandidate(row.path);
    assert.equal(candidate !== null, row.windowsWorld, `${row.label}: ${row.path}`);
  }
});

test("the two WSL/Windows spellings of one physical path fold to one identity", () => {
  assert.equal(
    repositoryPathIdentityOrSelf("/mnt/c/Users/andre/repo"),
    repositoryPathIdentityOrSelf("C:\\Users\\andre\\repo"),
  );
  assert.equal(
    repositoryPathIdentityOrSelf("/mnt/c/Users/andre/repo"),
    repositoryPathIdentityOrSelf("C:/Users/andre/repo"),
  );
  // Case folds only INSIDE that world: NTFS/DrvFs are case-insensitive.
  assert.equal(
    repositoryPathIdentityOrSelf("C:\\Users\\Andre\\Repo"),
    repositoryPathIdentityOrSelf("c:\\users\\andre\\repo"),
  );
});

test("a plain POSIX path is returned byte-for-byte and never case-folded", () => {
  assert.equal(repositoryPathIdentityOrSelf("/home/user/Repo"), "/home/user/Repo");
  // The property this protects: two POSIX paths differing only in case can be two
  // genuinely different directories on a case-sensitive filesystem, and merging them
  // would make one repository's fingerprint match another's.
  assert.notEqual(
    repositoryPathIdentityOrSelf("/home/user/Repo"),
    repositoryPathIdentityOrSelf("/home/user/repo"),
  );
});

test("the UNC spelling is deliberately not folded -- no caller has ever handled it", () => {
  const unc = "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo";
  assert.equal(windowsNotationCandidate(unc), null);
  assert.equal(repositoryPathIdentityOrSelf(unc), unc);
});

test("windowsDriveLetterIdentity returns null for what it cannot canonicalize", () => {
  assert.equal(windowsDriveLetterIdentity("not-absolute"), null);
  // A path that does not resolve to itself (a trailing separator, an embedded `..`)
  // is refused rather than silently rewritten.
  assert.equal(windowsDriveLetterIdentity("C:\\Users\\..\\Users\\repo"), null);
  assert.equal(windowsDriveLetterIdentity("C:\\Users\\repo"), "c:\\users\\repo");
});

// ---- The divergence guard -----------------------------------------------------------
//
// The three historical implementations, driven through their real exported entry
// points, over one table. `fingerprintIdentity` and `repoPathIdentity` are total and
// must agree exactly; `canonicalRepositoryPathIdentity` is the strict variant and
// agrees on every path it accepts, returning null where it declines instead.

test("all three call sites agree on which paths are Windows-notation", () => {
  for (const row of TABLE) {
    const viaShared = windowsNotationCandidate(row.path) !== null;
    assert.equal(viaShared, row.windowsWorld, `${row.label}`);
  }
});

test("fingerprintIdentity and repoPathIdentity are identical over the whole table", () => {
  for (const row of TABLE) {
    assert.equal(
      fingerprintIdentity(row.path),
      repoPathIdentity(row.path),
      `${row.label} (${row.path}): the two tolerant call sites diverged`,
    );
    assert.equal(
      fingerprintIdentity(row.path),
      repositoryPathIdentityOrSelf(row.path),
      `${row.label} (${row.path}): a call site diverged from the shared definition`,
    );
  }
});

test("canonicalRepositoryPathIdentity agrees wherever it does not decline", () => {
  for (const row of TABLE) {
    const strict = canonicalRepositoryPathIdentity(row.path);
    if (strict === null) continue;
    assert.equal(
      strict,
      repositoryPathIdentityOrSelf(row.path),
      `${row.label} (${row.path}): the strict call site accepted a path but folded it differently`,
    );
  }
});

test("canonicalRepositoryPathIdentity keeps its own stricter contract", () => {
  // The difference that must NOT be refactored away: it validates its input and
  // declines, where the other two fall back to the string itself.
  assert.equal(canonicalRepositoryPathIdentity(""), null);
  assert.equal(canonicalRepositoryPathIdentity("relative/path"), null);
  assert.equal(canonicalRepositoryPathIdentity("/home/user/repo\0evil"), null);
  assert.equal(canonicalRepositoryPathIdentity(42), null);
  // ...while the tolerant pair returns the input unchanged for the same relative path.
  assert.equal(fingerprintIdentity("relative/path"), "relative/path");
  assert.equal(repoPathIdentity("relative/path"), "relative/path");
});
