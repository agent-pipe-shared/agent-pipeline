#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The contract that makes the vendored canon copies under `plugins/pipeline-core/`
 * trustworthy, and closes F3 (Critic review, 2026-08-10, over commits
 * 4d0f8038..e2a3072f): "byte-identity to the repo-root origin is machine-checked
 * only for the 9 ADRs covered by VENDORED_LINK_EXCLUSIONS's own test... zero
 * enforcement anywhere in verify.mjs" for the rest.
 *
 * Two levels, same shape as generate-agent-obligations.test.mjs:
 *   1. Every committed vendored file is byte-identical to a fresh generation
 *      from its repo-root original (AC-1) -- the drift check that matters.
 *   2. A drift probe against a fixture root proves the generator does not
 *      ignore its inputs (AC-3): a byte-equality test alone would pass just as
 *      happily against a generator that copied nothing.
 * Plus a completeness assertion (AC-2): every tracked file under the four
 * vendored plugin subtrees has a manifest entry, and every manifest entry's
 * origin and destination both exist -- so an un-vendored addition or a stale
 * entry turns this suite red instead of silently drifting, independent of
 * whichever exact file count the backlog item's own prose states.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SELF_ONLY_EXCLUSIONS,
  UNIVERSAL_ADRS,
  UNIVERSAL_DIRECTORIES,
  UNIVERSAL_STANDALONE_FILES,
  checkVendoredCanon,
  computeManifest,
  generateVendoredCanon,
} from "./generate-vendored-canon.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const roots = [];
function tempRoot() {
  const base = mkdtempSync(join(tmpdir(), "vendored-canon-"));
  roots.push(base);
  return base;
}
test.after(() => { for (const entry of roots) rmSync(entry, { recursive: true, force: true }); });

function writeFile(root, relPath, content) {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A minimal fixture root: one file per universal directory, one standalone file, one ADR. */
function minimalFixture() {
  const root = tempRoot();
  writeFile(root, "guardrails/sample.md", "guardrail v1\n");
  writeFile(root, "roles/sample.md", "role v1\n");
  writeFile(root, "templates/prompts/sample.md", "prompt v1\n");
  writeFile(root, "docs/push-release-flow.md", "flow v1\n");
  writeFile(root, "docs/adr/0001-sample.md", "adr v1\n");
  return root;
}

const fixtureManifestOptions = {
  directories: [{ dir: "guardrails", reason: "fixture" }, { dir: "roles", reason: "fixture" }, { dir: "templates/prompts", reason: "fixture" }],
  standaloneFiles: [{ path: "docs/push-release-flow.md", reason: "fixture" }],
  adrs: [{ path: "docs/adr/0001-sample.md", reason: "fixture" }],
};

test("AC-1: every committed vendored file is byte-identical to a fresh generation from its repo-root original", () => {
  const { results } = generateVendoredCanon({ rootDir: REPO_ROOT, write: false });
  assert.ok(results.length > 0, "the manifest must not be empty");
  const stale = results.filter((entry) => entry.changed).map((entry) => entry.dest);
  assert.deepEqual(stale, [], `stale vendored file(s) -- run: node harness/scripts/generate-vendored-canon.mjs\n${stale.join("\n")}`);
});

test("AC-1b: checkVendoredCanon reports the same clean state as a CLI --check run", () => {
  const problems = checkVendoredCanon({ rootDir: REPO_ROOT });
  assert.deepEqual(problems, []);
});

test("AC-2: manifest completeness -- every tracked vendored file has an entry, every entry exists on both sides", () => {
  const manifest = computeManifest({ rootDir: REPO_ROOT });
  const manifestDests = new Set(manifest.map((entry) => entry.dest));

  const scanDirs = ["plugins/pipeline-core/guardrails", "plugins/pipeline-core/roles", "plugins/pipeline-core/templates/prompts", "plugins/pipeline-core/docs/adr"];
  const standaloneVendored = ["plugins/pipeline-core/docs/push-release-flow.md", "plugins/pipeline-core/docs/operating-model.md"];
  const trackedVendored = execFileSync("git", ["ls-files", "--", ...scanDirs, ...standaloneVendored], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const trackedSet = new Set(trackedVendored);
  const orphanTracked = [...trackedSet].filter((entry) => !manifestDests.has(entry));
  const orphanManifest = [...manifestDests].filter((entry) => !trackedSet.has(entry));
  assert.deepEqual(orphanTracked, [], `tracked vendored file(s) with no manifest entry (un-vendored by the generator, still on disk) -- classify or remove them:\n${orphanTracked.join("\n")}`);
  assert.deepEqual(orphanManifest, [], `manifest entr(y/ies) whose destination is not a tracked file -- run the generator and commit its output:\n${orphanManifest.join("\n")}`);

  for (const entry of manifest) {
    assert.ok(readFileSync(join(REPO_ROOT, ...entry.origin.split("/"))), `origin missing: ${entry.origin}`);
    assert.ok(readFileSync(join(REPO_ROOT, ...entry.dest.split("/"))), `destination missing: ${entry.dest}`);
  }
});

test("AC-3 (drift): a source file changed under a fixture root changes the computed output, without writing", () => {
  const root = minimalFixture();
  writeFile(root, "plugins/pipeline-core/guardrails/sample.md", "guardrail v1\n"); // starts in sync
  writeFile(root, "plugins/pipeline-core/roles/sample.md", "role v1\n");
  writeFile(root, "plugins/pipeline-core/templates/prompts/sample.md", "prompt v1\n");
  writeFile(root, "plugins/pipeline-core/docs/push-release-flow.md", "flow v1\n");
  writeFile(root, "plugins/pipeline-core/docs/adr/0001-sample.md", "adr v1\n");

  const clean = generateVendoredCanon({ rootDir: root, write: false, manifestOptions: fixtureManifestOptions });
  assert.deepEqual(clean.results.filter((entry) => entry.changed), [], "a fixture starting in sync must report no drift");

  writeFile(root, "guardrails/sample.md", "guardrail v2 -- mutated for DRIFT-1\n");
  const drifted = generateVendoredCanon({ rootDir: root, write: false, manifestOptions: fixtureManifestOptions });
  const changedEntry = drifted.results.find((entry) => entry.origin === "guardrails/sample.md");
  assert.ok(changedEntry, "the mutated origin must still be in the manifest");
  assert.equal(changedEntry.changed, true, "a mutated source must be reported as changed");
  // write: false must never touch disk -- the destination stays at v1.
  assert.equal(readFileSync(join(root, "plugins", "pipeline-core", "guardrails", "sample.md"), "utf8"), "guardrail v1\n");

  const written = generateVendoredCanon({ rootDir: root, write: true, manifestOptions: fixtureManifestOptions });
  assert.equal(written.results.find((entry) => entry.origin === "guardrails/sample.md").changed, true);
  assert.equal(
    readFileSync(join(root, "plugins", "pipeline-core", "guardrails", "sample.md"), "utf8"),
    "guardrail v2 -- mutated for DRIFT-1\n",
    "write: true must sync the destination to the mutated source",
  );
});

test("AC-4: self-only exclusions never appear as a manifest origin", () => {
  const manifest = computeManifest({ rootDir: REPO_ROOT });
  const origins = new Set(manifest.map((entry) => entry.origin));
  for (const { path } of SELF_ONLY_EXCLUSIONS) {
    if (path.endsWith("/")) {
      for (const origin of origins) assert.ok(!origin.startsWith(path), `${origin} must not be vendored -- it is under the self-only-excluded prefix ${path}`);
      continue;
    }
    assert.ok(!origins.has(path), `${path} must not be vendored -- it is a documented self-only exclusion`);
  }
});

test("AC-5: every manifest destination is vendored under plugins/pipeline-core/", () => {
  const manifest = computeManifest({ rootDir: REPO_ROOT });
  for (const entry of manifest) assert.ok(entry.dest.startsWith("plugins/pipeline-core/"), `${entry.dest} must be vendored under plugins/pipeline-core/`);
});

test("AC-6: the classification scheme is documented as data, not just prose -- every entry carries a reason", () => {
  for (const entry of [...UNIVERSAL_DIRECTORIES, ...UNIVERSAL_STANDALONE_FILES, ...UNIVERSAL_ADRS, ...SELF_ONLY_EXCLUSIONS]) {
    assert.ok(typeof entry.reason === "string" && entry.reason.length > 20, `classification entry ${entry.dir ?? entry.path} must carry a substantive reason`);
  }
});

test("AC-7: --check CLI mode reports clean against the real repository (no drift, exit implied by empty problem list)", () => {
  const problems = checkVendoredCanon({ rootDir: REPO_ROOT });
  assert.deepEqual(problems, []);
});
