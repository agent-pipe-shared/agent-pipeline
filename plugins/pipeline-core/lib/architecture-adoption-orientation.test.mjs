// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA,
  hasExactGreenfieldDesignPendingScaffold,
  observeArchitectureAdoptionOrientation,
} from "./architecture-adoption-orientation.mjs";
import { initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";

function fixtureRoot(prefix) {
  return mkdtempSync(join(tmpdir(), `architecture-orientation-${prefix}-`));
}

function writeGreenfieldScaffold(root) {
  for (const target of initialGreenfieldMapTargets("fresh")) {
    const output = join(root, target.path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, target.bytes, "utf8");
  }
}

test("greenfield scaffold is classified as design-pending without pretending it is adopted", () => {
  const root = fixtureRoot("greenfield-");
  writeGreenfieldScaffold(root);
  const result = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(result.schema, ARCHITECTURE_ADOPTION_ORIENTATION_SCHEMA);
  assert.equal(result.status, "design-pending");
  assert.equal(result.adoption.state, "adoption-required");
  assert.equal(result.physicalMap.greenfieldScaffold, true);
  assert.match(result.guidance, /not an adopted architecture baseline/u);
});

test("brownfield without a physical map has an actionable adoption-required readback", () => {
  const root = fixtureRoot("brownfield-");
  writeFileSync(join(root, "package.json"), "{}\n", "utf8");
  const result = observeArchitectureAdoptionOrientation({ rootDir: root });
  assert.equal(result.status, "adoption-required");
  assert.equal(result.adoption.state, "adoption-required");
  assert.equal(result.physicalMap.greenfieldScaffold, false);
  assert.match(result.guidance, /staged read-only adoption proposal/u);
});

test("near-matching inventory cannot turn an existing repository into greenfield", () => {
  const root = fixtureRoot("near-miss-");
  writeGreenfieldScaffold(root);
  const inventory = join(root, "architecture/map/inventory.json");
  const parsed = JSON.parse(readFileSync(inventory, "utf8"));
  parsed.modules.push({ id: "invented" });
  writeFileSync(inventory, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  assert.equal(hasExactGreenfieldDesignPendingScaffold({ rootDir: root }), false);
  assert.equal(observeArchitectureAdoptionOrientation({ rootDir: root }).status, "adoption-required");
});

test("a valid durable adoption decision is shown as a readback, never as physical-map readiness", () => {
  const root = fixtureRoot("decision-");
  const result = observeArchitectureAdoptionOrientation({
    rootDir: root,
    deps: {
      resolveAdoptionState: () => ({
        state: "approved-scoped",
        scope: ["src/"],
        decisionRef: "po-architecture-17",
        coverageClass: "evaluated",
        confidence: "measured",
      }),
    },
  });
  assert.equal(result.status, "decision-recorded");
  assert.equal(result.adoption.decisionRef, "po-architecture-17");
  assert.equal(result.physicalMap.status, "not-classified");
  assert.match(result.guidance, /implementation boundary/u);
});
