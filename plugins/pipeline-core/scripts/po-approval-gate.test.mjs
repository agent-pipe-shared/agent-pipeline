#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-approval-gate.test.mjs — the public control plane's own boundary.
 *
 * This script exists to be the ONE surface an agent may drive: it prepares and
 * verifies public candidate-bound artifacts and can reach no private key. Its
 * shape-level coverage previously lived in
 * `plugins/pipeline-core/lib/threat-model-approval-request.test.mjs` alongside
 * the request primitives; what that leaves untested is the property the script
 * is actually for — WHICH commands it admits, and that widening the set for the
 * fork-disposition ceremony (ADR-0072) did not carry the signing command in with
 * it. That is what this file pins, plus the dispatch shape the two new commands
 * required (they are asynchronous; the pre-existing ones are not, and a caller
 * that stops awaiting the old ones would silently drop every failure).
 *
 * The end-to-end proof that the gate can actually drive a real fork-disposition
 * preparation and verification lives in `po-human-approval.test.mjs`, next to
 * the forked-repository fixture it needs; duplicating that fixture here would
 * mean two definitions of a forked governance stream.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseGateArgs, run as runApprovalGate } from "./po-approval-gate.mjs";
import { parseHumanArgs } from "./po-human-approval.mjs";

const FAR_FUTURE = "2999-01-01T00:00:00.000Z";
const FORK_FLAGS = ["--repository-fingerprint", "a".repeat(64), "--stream-id", "lifecycle", "--sequence", "2"];
const base = (command, extra = []) => [command, "--repo-root", "/repo", "--directory", "/external-po", ...extra];

test("the control plane admits the two PUBLIC fork-disposition commands", () => {
  for (const [command, extra] of [["prepare-fork-disposition", [...FORK_FLAGS, "--expires-at", FAR_FUTURE]], ["verify-fork-disposition", FORK_FLAGS]]) {
    const parsed = parseGateArgs(base(command, extra));
    assert.equal(parsed.error, undefined, `${command} must be executable by the control plane`);
    assert.equal(parsed.command, command);
  }
});

test("every command that can reach the private key stays refused, approve-fork-disposition included", () => {
  const refused = [
    base("setup"),
    base("approve"),
    base("approve-all"),
    base("approve-critical", ["--kind", "push"]),
    base("sign-intent", ["--intent-sha256", "a".repeat(64)]),
    base("approve-fork-disposition", FORK_FLAGS),
  ];
  for (const argv of refused) {
    // Each of these is a WELL-FORMED invocation of po-human-approval.mjs, so the
    // refusal below is this script's own human/agent boundary rather than an
    // argument error that would disappear the moment someone fixed the syntax.
    assert.equal(parseHumanArgs(argv).error, undefined, `${argv[0]} must be a valid human-terminal invocation`);
    assert.ok(parseGateArgs(argv).error, `${argv[0]} reads the private key and must stay off the control plane`);
    assert.throws(() => runApprovalGate(argv, {}), /Usage:/u, `${argv[0]} must be refused before it can act`);
  }
});

test("the -critical trio's fork-disposition escape route is refused through the control plane too", () => {
  const argv = base("prepare-critical", [
    "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
    "--kind", "governance-fork-disposition", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
  ]);
  assert.ok(parseHumanArgs(argv).error, "the underlying parser must be what refuses this, not a gate-local list");
  assert.ok(parseGateArgs(argv).error);
  for (const kind of ["push", "deploy", "publication"]) {
    assert.equal(parseGateArgs(base("verify-critical", ["--kind", kind])).error, undefined, `${kind} must keep working`);
  }
});

test("run() returns a promise for the fork-disposition commands and keeps the synchronous contract for the rest", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-approval-gate-repo-"));
  const directory = mkdtempSync(join(tmpdir(), "po-approval-gate-external-"));
  try {
    const returned = runApprovalGate(["verify-fork-disposition", "--repo-root", repoRoot, "--directory", directory, ...FORK_FLAGS], {});
    assert.equal(typeof returned?.then, "function", "a fork-disposition command must be dispatched to the asynchronous path");
    // The repository holds no governance stream at all, so the fork inspection
    // fails; what matters here is that it fails as a REJECTION the caller awaits.
    await assert.rejects(() => returned);
    assert.throws(
      () => runApprovalGate(["verify", "--repo-root", repoRoot, "--directory", directory], {}),
      /run setup and prepare before approving/u,
      "the pre-existing commands must keep throwing synchronously for callers that do not await",
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});
