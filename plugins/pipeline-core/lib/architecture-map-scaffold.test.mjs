// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";

test("only physically classified Greenfield gets a pending scaffold", () => {
  for (const classification of ["fresh", "fresh-host-managed"]) {
    const targets = initialGreenfieldMapTargets(classification);
    assert.deepEqual(targets.map(t => t.path), ["architecture/map/index.md", "architecture/map/inventory.json"]);
    const inventory = JSON.parse(targets[1].bytes);
    assert.equal(inventory.status, "design-pending");
    assert.equal(inventory.coverage, "unknown");
    assert.deepEqual(inventory.modules, []);
    assert.match(targets[0].bytes, /\[Machine inventory\]\(inventory.json\)/u);
    assert.deepEqual(initialGreenfieldMapTargets(classification), targets);
  }
  for (const classification of ["existing-unmanaged", "ready", "partial", undefined]) assert.deepEqual(initialGreenfieldMapTargets(classification), []);
});
