#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HANDOVER_DEFAULT_PATH,
  HANDOVER_MAX_BYTES,
  HANDOVER_MEASUREMENT_SCHEMA,
  measureHandoverBytes,
  measureHandoverContent,
  resolveHandoverConfig,
} from "./handover-rotation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const SCRATCH_ROOT = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH_ROOT, { recursive: true });

function fixtureRoot(label) {
  return mkdtempSync(join(SCRATCH_ROOT, `handover-rotation-test-${label}-`));
}

// -- HANDOVER_MAX_BYTES is independently justified, never the bootstrap constant --
assert.equal(HANDOVER_MAX_BYTES, 12_000);
assert.equal(HANDOVER_DEFAULT_PATH, "docs/state.md");

// -- measureHandoverBytes mirrors measureBootstrapBytes's shape/metric --
const below = measureHandoverBytes(500);
assert.equal(below.schema, HANDOVER_MEASUREMENT_SCHEMA);
assert.equal(below.metric, "utf8-byte-upper-bound");
assert.equal(below.exactModelTokens, false);
assert.equal(below.bytes, 500);
assert.equal(below.upperBoundUnits, 500);
assert.equal(below.maxUpperBoundUnits, HANDOVER_MAX_BYTES);
assert.equal(below.withinBudget, true);

const atCap = measureHandoverBytes(HANDOVER_MAX_BYTES);
assert.equal(atCap.withinBudget, true); // AT the cap is still within budget; the guard's own "at or over" refusal is a separate concern

const overCap = measureHandoverBytes(HANDOVER_MAX_BYTES + 1);
assert.equal(overCap.withinBudget, false);

// -- measureHandoverContent measures a string payload the same way --
const content = measureHandoverContent("x".repeat(1000));
assert.equal(content.bytes, 1000);
assert.equal(content.withinBudget, true);

const overContent = measureHandoverContent("x".repeat(HANDOVER_MAX_BYTES + 1));
assert.equal(overContent.withinBudget, false);

// -- explicit maxBytes override on the measurement functions themselves --
const customCap = measureHandoverBytes(50, { maxBytes: 10 });
assert.equal(customCap.maxUpperBoundUnits, 10);
assert.equal(customCap.withinBudget, false);

// == DoD item 8: config-resolution helper ==

// (a) no project has configured handover.path/handover.maxBytes -> falls back to defaults
{
  const root = fixtureRoot("defaults");
  try {
    const resolved = resolveHandoverConfig({ rootDir: root });
    assert.equal(resolved.path, HANDOVER_DEFAULT_PATH);
    assert.equal(resolved.maxBytes, HANDOVER_MAX_BYTES);
    assert.equal(resolved.source, "default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// (b) an explicit object-shaped override (the ADR-0066 handover.path/handover.maxBytes shape)
{
  const root = fixtureRoot("object-override");
  try {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(
      join(root, "project", "pipeline.json"),
      JSON.stringify({ handover: { path: "docs/custom-handover.md", maxBytes: 5000 } }),
      "utf8",
    );
    const resolved = resolveHandoverConfig({ rootDir: root });
    assert.equal(resolved.path, "docs/custom-handover.md");
    assert.equal(resolved.maxBytes, 5000);
    assert.equal(resolved.source, "calibration");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// (c) the pre-existing plain-string handover shape (this codebase's own convention,
// templates/pipeline.json.example / project/pipeline.json) is still honored --
// maxBytes stays default since a bare string carries no maxBytes.
{
  const root = fixtureRoot("string-shape");
  try {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(
      join(root, "project", "pipeline.json"),
      JSON.stringify({ handover: "docs/state.md" }),
      "utf8",
    );
    const resolved = resolveHandoverConfig({ rootDir: root });
    assert.equal(resolved.path, "docs/state.md");
    assert.equal(resolved.maxBytes, HANDOVER_MAX_BYTES);
    assert.equal(resolved.source, "calibration");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// (d) a malformed calibration file falls back to defaults rather than throwing
{
  const root = fixtureRoot("malformed");
  try {
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "pipeline.json"), "{ not valid json", "utf8");
    const resolved = resolveHandoverConfig({ rootDir: root });
    assert.equal(resolved.path, HANDOVER_DEFAULT_PATH);
    assert.equal(resolved.maxBytes, HANDOVER_MAX_BYTES);
    assert.equal(resolved.source, "default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("handover-rotation.test.mjs: all assertions passed");
