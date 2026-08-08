#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Unit coverage for the GS-9-protected attestation-gate module (design:
 * specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md
 * §I.1.5/§I.1.6). This suite is the compensating control §I.1.3 designates for
 * GS-9's disclosed residual 1 (the wiring stays outside the guard) -- it pins
 * the module's current behaviour, it does not judge it.
 *
 * Fixture note: unlike `pipeline-start-preflight.test.mjs`'s
 * `buildSelfApplicationGitFixture()`, no real `git` checkout is built here.
 * `pluginRootHasSelfApplicationGit()` is a cheap `existsSync` presence check,
 * never a `git` subprocess (module doc comment, `:87-89`), and every test
 * below supplies its own `observe` stub, so nothing here ever reaches a real
 * observer or a real git process -- a plain `.git` directory entry two levels
 * above a stub `pluginRoot` is sufficient.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateSelfApplicationAttestation, pluginRootHasSelfApplicationGit } from "./self-application-attestation-gate.mjs";

/**
 * A minimal two-level-nested fixture directory (`<root>/plugins/pipeline-core`
 * mirroring the self-application layout), with or without a `.git` entry at
 * `<root>`. Caller is responsible for `rmSync(root, { recursive: true, force: true })`.
 */
function buildFixtureRoot({ withGit }) {
  const root = mkdtempSync(join(tmpdir(), "self-application-attestation-gate-fixture-"));
  const pluginRoot = join(root, "plugins", "pipeline-core");
  mkdirSync(pluginRoot, { recursive: true });
  if (withGit) mkdirSync(join(root, ".git"), { recursive: true });
  return { root, pluginRoot };
}

/** Same observation shape as `pipeline-start-preflight.test.mjs`'s `readyObservation()`. */
function readyObservation() {
  return {
    schema: "pipeline.public-core-observation.v1",
    status: "ready",
    candidate: {
      repository: "https://github.com/agent-pipe-shared/agent-pipeline.git",
      branch: "main",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    plugin: {
      name: "pipeline-core",
      version: "0.4.5+test",
      manifestSha256: "c".repeat(64),
      contentSha256: "d".repeat(64),
    },
  };
}

test("SAA-1: no .git two levels above pluginRoot -> not attempted, not failed, observer never invoked", () => {
  const { root, pluginRoot } = buildFixtureRoot({ withGit: false });
  try {
    let called = false;
    const result = evaluateSelfApplicationAttestation({
      pluginRoot,
      runner: "claude",
      version: "0.4.5+test",
      observe: () => { called = true; return readyObservation(); },
    });
    assert.deepEqual(result, { attempted: false, failed: false });
    assert.equal(called, false, "the observer must never be invoked when no .git exists two levels above pluginRoot");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SAA-2: .git present, non-allowlisted origin -> failed true", () => {
  const { root, pluginRoot } = buildFixtureRoot({ withGit: true });
  try {
    const result = evaluateSelfApplicationAttestation({
      pluginRoot,
      runner: "claude",
      version: "0.4.5+test",
      observe: () => ({
        ...readyObservation(),
        candidate: { ...readyObservation().candidate, repository: "https://github.com/some-fork/agent-pipeline.git" },
      }),
    });
    assert.equal(result.attempted, true);
    assert.equal(result.failed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SAA-3: .git present, rejected observation -> failed true", () => {
  const { root, pluginRoot } = buildFixtureRoot({ withGit: true });
  try {
    const result = evaluateSelfApplicationAttestation({
      pluginRoot,
      runner: "claude",
      version: "0.4.5+test",
      observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-SOURCE-DIRTY"] }),
    });
    assert.equal(result.attempted, true);
    assert.equal(result.failed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SAA-4: .git present, allowlisted ready observation -> failed false", () => {
  const { root, pluginRoot } = buildFixtureRoot({ withGit: true });
  try {
    const result = evaluateSelfApplicationAttestation({
      pluginRoot,
      runner: "claude",
      version: "0.4.5+test",
      observe: () => readyObservation(),
    });
    assert.equal(result.attempted, true);
    assert.equal(result.failed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SAA-5: pluginRootHasSelfApplicationGit returns true for a .git entry two levels above pluginRoot, false otherwise", () => {
  const withGit = buildFixtureRoot({ withGit: true });
  const withoutGit = buildFixtureRoot({ withGit: false });
  try {
    assert.equal(pluginRootHasSelfApplicationGit(withGit.pluginRoot), true);
    assert.equal(pluginRootHasSelfApplicationGit(withoutGit.pluginRoot), false);
  } finally {
    rmSync(withGit.root, { recursive: true, force: true });
    rmSync(withoutGit.root, { recursive: true, force: true });
  }
});

test("SAA-6: the module exports exactly pluginRootHasSelfApplicationGit and evaluateSelfApplicationAttestation", () => {
  return import("./self-application-attestation-gate.mjs").then((module) => {
    assert.deepEqual(Object.keys(module).sort(), ["evaluateSelfApplicationAttestation", "pluginRootHasSelfApplicationGit"]);
  });
});
