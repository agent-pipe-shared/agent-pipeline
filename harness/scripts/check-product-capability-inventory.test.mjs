#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSurfaces, validateInventory } from "./check-product-capability-inventory.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventoryPath = join(repoRoot, "docs", "product-capability-inventory.json");
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function inventory() {
  const document = JSON.parse(readFileSync(inventoryPath, "utf8"));
  document.criticReview = { status: "attested", receiptSha256: "a".repeat(64), reason: null };
  return document;
}

function validated(document, phase = "inventory") {
  return validateInventory({ root: repoRoot, phase, document });
}

function gitText(args, options = {}, spawn = spawnSync) {
  const result = spawn("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  const successfulEperm = result?.error?.code === "EPERM"
    && result.status === 0
    && result.signal === null
    && typeof result.stdout === "string"
    && result.stdout.length > 0;
  if (result?.error && !successfulEperm) throw result.error;
  if (result?.status !== 0 || result.signal !== null || typeof result.stdout !== "string" || result.stdout.length === 0) {
    const stderr = typeof result?.stderr === "string" && result.stderr.trim().length > 0
      ? `; stderr=${JSON.stringify(result.stderr.trim())}`
      : "";
    throw new Error(
      `Git fixture observation failed: git ${args.join(" ")}; status=${String(result?.status)}; `
      + `signal=${String(result?.signal)}; stdout=${typeof result?.stdout}${stderr}`,
    );
  }
  return result.stdout.trim();
}

function revision(ref) {
  return {
    commit: gitText(["rev-parse", "--verify", `${ref}^{commit}`]),
    tree: gitText(["rev-parse", "--verify", `${ref}^{tree}`]),
  };
}

function nonAncestorRevision() {
  // Depending on the checkout's ambient branch/tag topology (e.g. whether any ref
  // diverges from HEAD) is fragile and environment-dependent, not a portability
  // concern. `commit-tree` creates a real, resolvable, parentless commit object
  // directly -- unreachable from HEAD by construction, no branch/tag/working-tree
  // side effects, deterministic on every host and every repo state.
  const emptyTree = gitText(["hash-object", "-t", "tree", "--stdin"], { input: "" });
  const commit = gitText([
    "-c", "user.name=Agent Pipeline Fixture",
    "-c", "user.email=fixture@example.invalid",
    "commit-tree", emptyTree, "-m", "non-ancestor fixture root",
  ]);
  return revision(commit);
}

check("HAW-A00 accepts only a status-zero Git EPERM false positive with observed output", () => {
  const accepted = () => ({
    status: 0,
    signal: null,
    error: Object.assign(new Error("sandbox false positive"), { code: "EPERM" }),
    stdout: "observed\n",
    stderr: "",
  });
  assert.equal(gitText(["rev-parse", "HEAD"], {}, accepted), "observed");

  const rejected = () => ({
    status: null,
    signal: null,
    error: Object.assign(new Error("sandbox denied"), { code: "EPERM" }),
    stdout: "",
    stderr: "",
  });
  assert.throws(() => gitText(["rev-parse", "HEAD"], {}, rejected), /sandbox denied/);

  const failed = () => ({
    status: 128,
    signal: null,
    stdout: "",
    stderr: "fatal: bad revision",
  });
  assert.throws(
    () => gitText(["rev-parse", "missing"], {}, failed),
    /git rev-parse missing; status=128; signal=null; stdout=string; stderr="fatal: bad revision"/,
  );
});

check("HAW-A01 discovers the complete current direct product surface", () => {
  const discovered = discoverSurfaces(repoRoot);
  const ids = discovered.map((surface) => surface.surfaceId);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(discovered, [...discovered].sort((left, right) => Buffer.compare(Buffer.from(left.surfaceId), Buffer.from(right.surfaceId))));
});

check("HAW-A02 accepts an attested receipt and an honest inventory-phase pending gate", () => {
  assert.equal(validated(inventory()).ok, true);
  const pendingReview = JSON.parse(readFileSync(inventoryPath, "utf8"));
  assert.equal(validated(pendingReview).ok, true);
  const finalResult = validated(pendingReview, "final");
  assert.equal(finalResult.ok, false);
  assert.match(finalResult.findings.join("\n"), /final inventory requires an attested Critic receipt/);

  pendingReview.criticReview.receiptSha256 = "b".repeat(64);
  const fabricated = validated(pendingReview);
  assert.equal(fabricated.ok, false);
  assert.match(fabricated.findings.join("\n"), /must not contain a fabricated receipt digest/);
});

for (const [name, mutate, pattern] of [
  ["missing discovered surface", (document) => { document.surfaces.pop(); }, /exactly cover/],
  ["duplicate capability ID", (document) => { document.capabilities.push(structuredClone(document.capabilities[0])); }, /duplicate capability id/],
  ["unmapped surface", (document) => { document.capabilities[0].surfaceIds = []; }, /surfaceIds must be nonempty|absent from every capability/],
  ["available capability without test evidence", (document) => { document.capabilities[0].testEvidence = []; }, /has no testEvidence/],
  ["unsorted support matrix", (document) => { document.capabilities.find((capability) => capability.runners.length > 1).runners.reverse(); }, /sorted, duplicate-free/],
  ["missing Codex disposition", (document) => { delete document.capabilities[0].runnerDispositions.codex; }, /runnerDispositions.*unexpected shape/],
  ["unexplained Codex unavailability", (document) => { document.capabilities[0].runnerDispositions.codex = { status: "unavailable", reasonCode: null }; }, /Codex unavailable.*reasonCode/],
  ["Codex runner falsely marked unavailable", (document) => {
    const capability = document.capabilities.find((candidate) => candidate.runners.includes("codex"));
    capability.runnerDispositions.codex = { status: "unavailable", reasonCode: "host-contract-missing" };
  }, /Codex support matrix conflicts/],
]) {
  check(`HAW-A03 rejects ${name}`, () => {
    const document = inventory();
    mutate(document);
    const result = validated(document);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), pattern);
  });
}

check("HAW-A04 final phase rejects pending front-door claims before documentation authorship", () => {
  const result = validated(inventory(), "final");
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /must be active during final phase/);
});

check("HAW-A05 accepts an ancestor baseline and still requires the exact discovered surface", () => {
  const document = inventory();
  document.sourceBaseline = revision("HEAD^");
  assert.equal(validated(document).ok, true);

  document.surfaces.pop();
  const result = validated(document);
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /exactly cover the discovered current product surface/);
});

for (const [name, baseline, pattern] of [
  ["a tree that does not belong to its commit", () => ({ commit: revision("HEAD^").commit, tree: revision("HEAD").tree }), /sourceBaseline tree does not match commit/],
  ["a resolvable commit outside current HEAD ancestry", nonAncestorRevision, /sourceBaseline commit is not an ancestor of current HEAD/],
]) {
  check(`HAW-A06 rejects ${name}`, () => {
    const document = inventory();
    document.sourceBaseline = baseline();
    const result = validated(document);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), pattern);
  });
}

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
