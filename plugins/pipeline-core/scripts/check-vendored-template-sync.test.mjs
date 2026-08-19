#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkVendoredTemplateSync } from "./check-vendored-template-sync.mjs";

// Self-contained: every fixture root here is created under `node:os` tmpdir() with a unique
// prefix owned only by this test, never the repo's own tracked files, and removed in an
// `after` hook regardless of test outcome.
let fixtureRoot;

test.beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "check-vendored-template-sync-test-"));
  mkdirSync(join(fixtureRoot, "templates", "prompts"), { recursive: true });
  mkdirSync(join(fixtureRoot, "plugins", "pipeline-core", "templates", "prompts"), { recursive: true });
});

test.afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

const PAIRS = [
  {
    name: "goldfish-task.md",
    canonical: "templates/prompts/goldfish-task.md",
    vendored: "plugins/pipeline-core/templates/prompts/goldfish-task.md",
  },
  {
    name: "critic-review.md",
    canonical: "templates/prompts/critic-review.md",
    vendored: "plugins/pipeline-core/templates/prompts/critic-review.md",
  },
];

test("reports allInSync=true when every pair is byte-identical", () => {
  writeFileSync(join(fixtureRoot, "templates/prompts/goldfish-task.md"), "same content A\n");
  writeFileSync(join(fixtureRoot, "plugins/pipeline-core/templates/prompts/goldfish-task.md"), "same content A\n");
  writeFileSync(join(fixtureRoot, "templates/prompts/critic-review.md"), "same content B\n");
  writeFileSync(join(fixtureRoot, "plugins/pipeline-core/templates/prompts/critic-review.md"), "same content B\n");

  const receipt = checkVendoredTemplateSync({ root: fixtureRoot, pairs: PAIRS });

  assert.equal(receipt.allInSync, true);
  assert.equal(receipt.results.length, 2);
  assert.ok(receipt.results.every((r) => r.inSync === true));
  assert.ok(receipt.results.every((r) => r.reason === null));
});

test("detects a drifted pair and reports allInSync=false", () => {
  writeFileSync(join(fixtureRoot, "templates/prompts/goldfish-task.md"), "canonical content\n");
  writeFileSync(join(fixtureRoot, "plugins/pipeline-core/templates/prompts/goldfish-task.md"), "DRIFTED content\n");
  writeFileSync(join(fixtureRoot, "templates/prompts/critic-review.md"), "same content B\n");
  writeFileSync(join(fixtureRoot, "plugins/pipeline-core/templates/prompts/critic-review.md"), "same content B\n");

  const receipt = checkVendoredTemplateSync({ root: fixtureRoot, pairs: PAIRS });

  assert.equal(receipt.allInSync, false);
  const drifted = receipt.results.find((r) => r.name === "goldfish-task.md");
  assert.equal(drifted.inSync, false);
  assert.equal(drifted.reason, "byte content differs");
  const clean = receipt.results.find((r) => r.name === "critic-review.md");
  assert.equal(clean.inSync, true);
});

test("reports allInSync=false with a reason when the vendored file is missing", () => {
  writeFileSync(join(fixtureRoot, "templates/prompts/goldfish-task.md"), "canonical content\n");
  // vendored file intentionally not written
  writeFileSync(join(fixtureRoot, "templates/prompts/critic-review.md"), "same content B\n");
  writeFileSync(join(fixtureRoot, "plugins/pipeline-core/templates/prompts/critic-review.md"), "same content B\n");

  const receipt = checkVendoredTemplateSync({ root: fixtureRoot, pairs: PAIRS });

  assert.equal(receipt.allInSync, false);
  const missing = receipt.results.find((r) => r.name === "goldfish-task.md");
  assert.equal(missing.inSync, false);
  assert.match(missing.reason, /vendored file unreadable/);
});

test("real repo templates are byte-identical (guards against actual re-drift)", () => {
  const receipt = checkVendoredTemplateSync({});
  assert.equal(receipt.allInSync, true, JSON.stringify(receipt.results, null, 2));
});
