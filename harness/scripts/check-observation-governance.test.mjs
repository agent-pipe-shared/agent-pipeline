#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";
import {
  POLICY_PATH,
  checkObservationGovernance,
  discoverDocumentation,
} from "./check-observation-governance.mjs";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function policy() {
  return JSON.parse(readFileSync(resolve(REPO, POLICY_PATH), "utf8"));
}

function form() {
  return parseYaml(readFileSync(resolve(REPO, ".github/ISSUE_TEMPLATE/observation.yml"), "utf8"));
}

function classification(document, path) {
  const group = document.documentation.inventory.find((entry) => entry.paths.includes(path));
  assert(group, `missing inventory path: ${path}`);
  return { audience: group.audience, lifecycle: group.lifecycle };
}

test("current repository has a complete, unique documentation classification", () => {
  const result = checkObservationGovernance(REPO);
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.stats.documents, result.stats.inventoryEntries);
});

test("provisional Observation 13 scope keeps audience and lifecycle independent", () => {
  const document = policy();
  const expected = new Map([
    ["docs/codex-isolated-critic-foundation.md", { audience: "maintainer", lifecycle: "review-candidate" }],
    ["docs/critic-isolation-threat-model.md", { audience: "maintainer", lifecycle: "maintained" }],
    ["docs/design-decisions.md", { audience: "public-user", lifecycle: "review-candidate" }],
    ["docs/known-issues.md", { audience: "maintainer", lifecycle: "review-candidate" }],
    ["docs/marketplace-supply-chain-threat-model.md", { audience: "maintainer", lifecycle: "maintained" }],
    ["docs/product-capability-inventory.json", { audience: "machine", lifecycle: "maintained" }],
    ["docs/runtime-boundary.md", { audience: "public-user", lifecycle: "maintained" }],
  ]);
  for (const [path, value] of expected) assert.deepEqual(classification(document, path), value);
  assert.deepEqual(classification(document, "docs/overview.md"), { audience: "public-user", lifecycle: "compatibility-redirect" });
  assert.deepEqual(classification(document, "docs/adr/0011-language-policy.md"), { audience: "maintainer", lifecycle: "normative-record" });
});

test("a new document fails closed until explicitly classified", () => {
  const discovered = discoverDocumentation(REPO);
  const result = checkObservationGovernance(REPO, { docsPaths: [...discovered.paths, "docs/new-public-guide.md"] });
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /OG-DOC-UNCLASSIFIED docs\/new-public-guide\.md/);
});

test("a removed document leaves a stale inventory entry", () => {
  const discovered = discoverDocumentation(REPO);
  const removed = discovered.paths.filter((path) => path !== "docs/usage.md");
  const result = checkObservationGovernance(REPO, { docsPaths: removed });
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /OG-DOC-INVENTORY-STALE docs\/usage\.md/);
});

test("global Issue, stable Public branch, and private-overlay boundaries fail closed", () => {
  for (const mutate of [
    (document) => { document.canonicalIssue.branchIndependent = false; },
    (document) => { document.backlog.requiresStablePublicBranch = false; },
    (document) => { document.backlog.automaticPromotion = true; },
    (document) => { document.privateOverlay.mayDuplicatePublicObservation = true; },
  ]) {
    const document = policy();
    mutate(document);
    const result = checkObservationGovernance(REPO, { policyDocument: document });
    assert.equal(result.ok, false);
  }
});

test("Issue Form cannot gain eager classification labels or lose required evidence fields", () => {
  const eager = form();
  eager.labels.push("area:docs");
  assert.match(checkObservationGovernance(REPO, { formDocument: eager }).findings.join("\n"), /OG-FORM-LABELS/);

  const incomplete = form();
  incomplete.body = incomplete.body.filter((entry) => entry.id !== "capability");
  assert.match(checkObservationGovernance(REPO, { formDocument: incomplete }).findings.join("\n"), /OG-FORM-FIELD missing capability/);
});

test("lifecycle transitions cannot skip triage or confirmation", () => {
  const document = policy();
  document.lifecycle.transitions.observation = ["backlog-link"];
  const result = checkObservationGovernance(REPO, { policyDocument: document });
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /OG-LIFECYCLE/);
});
