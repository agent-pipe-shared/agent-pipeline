#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  document.criticReceiptSha256 = "a".repeat(64);
  return document;
}

function validated(document, phase = "inventory") {
  return validateInventory({ root: repoRoot, phase, document });
}

function revision(ref) {
  return {
    commit: execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repoRoot, encoding: "utf8" }).trim(),
    tree: execFileSync("git", ["rev-parse", "--verify", `${ref}^{tree}`], { cwd: repoRoot, encoding: "utf8" }).trim(),
  };
}

function nonAncestorRevision() {
  const commits = execFileSync("git", ["rev-list", "--all", "--not", "HEAD"], { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.ok(commits.length > 0, "test fixture requires a resolvable commit outside HEAD ancestry");
  return revision(commits[0]);
}

check("HAW-A01 discovers the complete current direct product surface", () => {
  const discovered = discoverSurfaces(repoRoot);
  const ids = discovered.map((surface) => surface.surfaceId);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(discovered, [...discovered].sort((left, right) => Buffer.compare(Buffer.from(left.surfaceId), Buffer.from(right.surfaceId))));
});

check("HAW-A02 accepts an inventory-phase candidate only with a real receipt digest", () => {
  assert.equal(validated(inventory()).ok, true);
  const pendingReceipt = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const result = validated(pendingReceipt);
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /criticReceiptSha256/);
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
