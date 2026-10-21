// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { initialGreenfieldAgentEntryTarget, initialGreenfieldDecisionRecordTargets, initialGreenfieldMapTargets } from "./architecture-map-scaffold.mjs";
import { inspectArchitectureDecisionAuthoringSources } from "./architecture-effective-decisions.mjs";

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

test("only a fresh project gets a separate root entry pointer", () => {
  for (const classification of ["fresh", "fresh-host-managed"]) {
    const entry = initialGreenfieldAgentEntryTarget(classification);
    assert.equal(entry.path, "AGENTS.md");
    assert.match(entry.bytes, /\]\(architecture\/map\/index\.md\)/u);
    assert.match(entry.bytes, /pipeline-core:pipeline-start/u);
    assert.equal(initialGreenfieldMapTargets(classification).some(target => target.path === "AGENTS.md"), false,
      "project-owned AGENTS.md must not become an immutable map scaffold byte precondition");
  }
  for (const classification of ["existing-unmanaged", "ready", "partial", undefined]) {
    assert.equal(initialGreenfieldAgentEntryTarget(classification), null);
  }
});

// D80: a fresh project gets docs/adr/ with a hint and a template. Without the
// directory the implementation-entry gate refuses (ARCH-DECISION-SOURCE-UNAVAILABLE).
test("only a fresh project gets the decision-record directory with a hint and a template", () => {
  for (const classification of ["fresh", "fresh-host-managed"]) {
    const targets = initialGreenfieldDecisionRecordTargets(classification);
    assert.deepEqual(targets.map(t => t.path), ["docs/adr/README.txt", "docs/adr/templates/adr-template.md"]);
    assert.match(targets[0].bytes, /pipeline-core:architecture-decision/u);
    assert.match(targets[0].bytes, /docs\/adr\/XXXX-<slug>\.md/u);
    assert.match(targets[0].bytes, /sidecar/iu);
    assert.match(targets[1].bytes, /## Context/u);
    assert.deepEqual(initialGreenfieldDecisionRecordTargets(classification), targets);
    assert.match(initialGreenfieldAgentEntryTarget(classification).bytes, /docs\/adr\/README\.txt/u,
      "the agent entry names where architecture decisions are kept");
  }
  for (const classification of ["existing-unmanaged", "ready", "partial", undefined]) {
    assert.deepEqual(initialGreenfieldDecisionRecordTargets(classification), []);
  }
});

test("the decision-record scaffold satisfies the ADR source reader without raising a finding", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "adr-scaffold-")));
  try {
    for (const target of initialGreenfieldDecisionRecordTargets("fresh")) {
      mkdirSync(dirname(join(root, target.path)), { recursive: true });
      writeFileSync(join(root, target.path), target.bytes);
    }
    const result = inspectArchitectureDecisionAuthoringSources({ rootDir: root, area: "project" });
    assert.notEqual(result.status, "blocked");
    assert.deepEqual(result.findings, [], "no hint or template may enter the ADR *.md/*.json namespace");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
