// SPDX-License-Identifier: SUL-1.0
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { architectureOverview, checkArchitectureOverview, renderArchitectureOverview } from "./generate-architecture-overview.mjs";

import {
  extractFrontmatter,
  loadConceptFile,
  loadMapBundle,
  resolveModuleForPath,
  getReentryReadingOrder,
  getModuleInventorySchema
} from "./module-inventory.mjs";
import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("module-inventory (WP-D2, AC-8, AC-22, AC-23)", () => {
  const schema = getModuleInventorySchema();

  describe("1. Map bundle loading and validation", () => {
    it("successfully loads live map bundle with 4 governed modules", () => {
      const result = loadMapBundle(REPO_ROOT, schema);
      assert.equal(result.ok, true, `loadMapBundle failed: ${result.errors.join("; ")}`);
      assert.equal(result.indexFileExists, true, "Root map index must exist");
      assert.equal(result.modules.length, 4, "Must load exactly 4 governed modules");

      const moduleIds = result.modules.map((m) => m.id).sort();
      assert.deepEqual(moduleIds, ["backlog", "harness", "pipeline-core", "schemas"]);
    });

    it("ensures each governed module satisfies all 6 contract-sufficiency fields", () => {
      const result = loadMapBundle(REPO_ROOT, schema);
      assert.equal(result.ok, true);

      for (const mod of result.modules) {
        assert.equal(mod.type, "Governed Module", "claimed OKF v0.1 concepts need a non-empty type");
        assert.ok(typeof mod.id === "string" && mod.id.length > 0, "id must be non-empty string");
        assert.ok(typeof mod.responsibility === "string" && mod.responsibility.length > 0, "responsibility required");
        assert.ok(Array.isArray(mod.nonResponsibilities), "nonResponsibilities must be array");
        assert.ok(Array.isArray(mod.ownedPaths) && mod.ownedPaths.length > 0, "ownedPaths must be non-empty array");
        assert.ok(Array.isArray(mod.publicContracts), "publicContracts must be array");
        assert.ok(Array.isArray(mod.allowedDependencies), "allowedDependencies must be array");
        assert.ok(Array.isArray(mod.authorityEffects), "authorityEffects must be array");
        assert.ok(Array.isArray(mod.verificationEntryPoints), "verificationEntryPoints must be array");
        assert.ok(Array.isArray(mod.adrReferences), "adrReferences must be array");
      }
    });

    it("verifies live map index documents the 6-step re-entry reading order", () => {
      const indexPath = path.join(REPO_ROOT, "architecture/map/index.md");
      assert.ok(fs.existsSync(indexPath), "architecture/map/index.md exists");
      const content = fs.readFileSync(indexPath, "utf8");

      assert.ok(content.includes("AGENTS.md"), "reading order step 1 present");
      assert.ok(content.includes("architecture/map/index.md"), "reading order step 2 present");
      assert.ok(content.includes("Concept files of touched modules"), "reading order step 3 present");
      assert.ok(content.includes("Compiled decision summary"), "reading order step 4 present");
      assert.ok(content.includes("pipeline-core:pipeline-start"), "reading order step 5 present");
      assert.ok(content.includes("Owned implementation surface"), "reading order step 6 present");
    });
  });

  describe("2. Schema validation of module inventory rows", () => {
    it("validates a conformant module row against schema", () => {
      const sample = {
        id: "sample-mod",
        responsibility: "Sample module responsibility",
        nonResponsibilities: ["Out of scope"],
        ownedPaths: ["sample/**"],
        publicContracts: ["sample/api.mjs"],
        allowedDependencies: ["schemas"],
        authorityEffects: ["read-workspace"],
        verificationEntryPoints: ["sample/test.mjs"],
        adrReferences: ["ADR-0001"],
        profileSource: "inherited-agent-first",
        provisional: false
      };

      const val = validateAgainstSchema(sample, schema);
      assert.equal(val.valid, true, `Validation failed: ${val.errors.join("; ")}`);
    });

    it("rejects a module row missing required fields", () => {
      const invalid = {
        id: "missing-fields-mod"
        // missing responsibility, ownedPaths, etc.
      };

      const val = validateAgainstSchema(invalid, schema);
      assert.equal(val.valid, false);
      assert.ok(val.errors.some((e) => e.includes("responsibility")));
      assert.ok(val.errors.some((e) => e.includes("ownedPaths")));
    });

    it("rejects a module row with incorrect property types", () => {
      const invalidTypes = {
        id: 12345, // should be string
        responsibility: "Test",
        nonResponsibilities: "not an array",
        ownedPaths: ["path/**"],
        publicContracts: [],
        allowedDependencies: [],
        authorityEffects: [],
        verificationEntryPoints: [],
        adrReferences: []
      };

      const val = validateAgainstSchema(invalidTypes, schema);
      assert.equal(val.valid, false);
      assert.ok(val.errors.some((e) => e.includes("id")));
      assert.ok(val.errors.some((e) => e.includes("nonResponsibilities")));
    });
  });

  describe("3. Path-to-module resolution", () => {
    const bundle = loadMapBundle(REPO_ROOT, schema);
    assert.equal(bundle.ok, true);
    const inventory = bundle.modules;

    it("resolves files under plugins/pipeline-core to pipeline-core", () => {
      const mod = resolveModuleForPath("plugins/pipeline-core/scripts/module-inventory.mjs", inventory);
      assert.ok(mod, "Must resolve module");
      assert.equal(mod.id, "pipeline-core");
    });

    it("resolves files under harness to harness", () => {
      const mod = resolveModuleForPath("harness/scripts/verify.mjs", inventory);
      assert.ok(mod, "Must resolve module");
      assert.equal(mod.id, "harness");
    });

    it("resolves files under schemas to schemas", () => {
      const mod = resolveModuleForPath("schemas/pipeline.architecture-profile.v1.json", inventory);
      assert.ok(mod, "Must resolve module");
      assert.equal(mod.id, "schemas");
    });

    it("resolves files under backlog to backlog", () => {
      const mod = resolveModuleForPath("backlog/ledger.csv", inventory);
      assert.ok(mod, "Must resolve module");
      assert.equal(mod.id, "backlog");
    });

    it("returns null for unowned paths", () => {
      const mod = resolveModuleForPath("untracked/unknown/file.txt", inventory);
      assert.equal(mod, null);
    });

    it("handles leading './' in path resolution", () => {
      const mod = resolveModuleForPath("./plugins/pipeline-core/hooks/guard-git.mjs", inventory);
      assert.ok(mod);
      assert.equal(mod.id, "pipeline-core");
    });

    it("handles absolute paths within repo", () => {
      const abs = path.join(REPO_ROOT, "harness/verify-suites.json");
      const mod = resolveModuleForPath(abs, inventory);
      assert.ok(mod);
      assert.equal(mod.id, "harness");
    });
  });

  describe("4. Missing or malformed frontmatter detection", () => {
    it("rejects a concept without type when its index claims OKF v0.1", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-okf-test-"));
      try {
        const mapDir = path.join(tmpDir, "architecture/map");
        fs.mkdirSync(mapDir, { recursive: true });
        fs.writeFileSync(path.join(mapDir, "index.md"), "# Map\n\nOKF v0.1 concept bundle.\n", "utf8");
        fs.writeFileSync(path.join(mapDir, "mod-a.md"), `---
id: mod-a
responsibility: Test module A
nonResponsibilities: []
ownedPaths:
  - mod-a/**
publicContracts: []
allowedDependencies: []
authorityEffects: []
verificationEntryPoints: []
adrReferences: []
---
# Mod A\n`, "utf8");
        const result = loadMapBundle(tmpDir, schema);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((error) => error.includes("OKF v0.1 concept requires a non-empty type")));
      } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    });
    it("reports error for a markdown file with missing frontmatter", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-"));
      const testFile = path.join(tmpDir, "no-fm.md");
      fs.writeFileSync(testFile, "# Title without frontmatter\nSome body.", "utf8");

      const res = loadConceptFile(testFile, schema);
      assert.equal(res.ok, false);
      assert.ok(res.errors[0].includes("missing YAML frontmatter"));

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("reports error for a markdown file with malformed YAML", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-"));
      const testFile = path.join(tmpDir, "bad-fm.md");
      fs.writeFileSync(testFile, "---\nid: test\n  bad indent:\n---\n# Content", "utf8");

      const res = loadConceptFile(testFile, schema);
      assert.equal(res.ok, false);
      assert.ok(res.errors[0].includes("YAML frontmatter parse error"));

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("reports error when allowedDependencies cites an unknown module", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-test-"));
      const mapDir = path.join(tmpDir, "architecture/map");
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, "index.md"), "# Index", "utf8");

      const modContent = `---
id: mod-a
responsibility: Test module A
nonResponsibilities: []
ownedPaths:
  - mod-a/**
publicContracts: []
allowedDependencies:
  - non-existent-module
authorityEffects: []
verificationEntryPoints: []
adrReferences: []
---
# Mod A`;
      fs.writeFileSync(path.join(mapDir, "mod-a.md"), modContent, "utf8");

      const res = loadMapBundle(tmpDir, schema);
      assert.equal(res.ok, false);
      assert.ok(res.errors.some((e) => e.includes("unknown allowedDependency \"non-existent-module\"")));

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("5. Re-entry reading order generator", () => {
    it("generates the complete 6-step re-entry reading order", () => {
      const readingOrder = getReentryReadingOrder(REPO_ROOT, ["pipeline-core", "schemas"]);
      assert.equal(readingOrder.length, 6);

      assert.equal(readingOrder[0].step, 1);
      assert.ok(readingOrder[0].path.endsWith("AGENTS.md"));

      assert.equal(readingOrder[1].step, 2);
      assert.ok(readingOrder[1].path.endsWith("architecture/map/index.md"));

      assert.equal(readingOrder[2].step, 3);
      assert.equal(readingOrder[2].paths.length, 2);
      assert.ok(readingOrder[2].paths[0].endsWith("pipeline-core.md"));
      assert.ok(readingOrder[2].paths[1].endsWith("schemas.md"));

      assert.equal(readingOrder[3].step, 4);
      assert.ok(readingOrder[3].path.endsWith("project/architecture-decisions.compiled.json"));

      assert.equal(readingOrder[4].step, 5);
      assert.equal(readingOrder[4].command, "pipeline-core:pipeline-start");

      assert.equal(readingOrder[5].step, 6);
    });
  });
});

describe("generated architecture overview", () => {
  const SHA = "a".repeat(64);

  it("is current and deterministically derived from the live map", () => {
    const first = architectureOverview(REPO_ROOT);
    const second = architectureOverview(REPO_ROOT);
    assert.equal(first.html, second.html);
    assert.equal(checkArchitectureOverview(REPO_ROOT).ok, true);
    assert.equal(fs.readFileSync(first.path, "utf8"), first.html);
    assert.match(first.html, /source-sha256/u);
    assert.match(first.html, /Public contracts/u);
    assert.match(first.html, /The harness runs checks against the plugin/u);
    assert.doesNotMatch(first.html, /Exact contract-to-contract calls are not yet declared/u);
    assert.doesNotMatch(first.html, /rationale for each dependency/u);
    assert.doesNotMatch(first.html, /<script\b/iu);
    assert.match(first.html, /script-src 'none'/u);
  });

  it("escapes module prose and rejects unsafe contract links", () => {
    const map = loadMapBundle(REPO_ROOT);
    assert.equal(map.ok, true);
    const modules = map.modules.map((module) => ({ ...module }));
    modules[0].responsibility = '<img src=x onerror="alert(1)">';
    const html = renderArchitectureOverview(modules, new Map(), SHA);
    assert.doesNotMatch(html, /<img\b/iu);
    assert.match(html, /&lt;img/u);
    modules[0].publicContracts = ["../outside.mjs"];
    assert.throws(() => renderArchitectureOverview(modules, new Map(), SHA), /unsafe path/u);
    modules[0].publicContracts = ["https://example.com/x.mjs"];
    assert.throws(() => renderArchitectureOverview(modules, new Map(), SHA), /unsafe path/u);
  });

  it("detects a source mutation until the generated view is refreshed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-overview-"));
    try {
      const mapDir = path.join(root, "architecture/map");
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, "index.md"), "# Map\n\nOKF v0.1 concept bundle.\n\n- [alpha](alpha.md)\n");
      const concept = `---
type: Governed Module
id: alpha
responsibility: First version
nonResponsibilities: []
ownedPaths:
  - src/**
publicContracts:
  - src/main.mjs
allowedDependencies: []
authorityEffects: []
verificationEntryPoints:
  - tests/main.test.mjs
adrReferences: []
---
# Alpha\n`;
      fs.writeFileSync(path.join(mapDir, "alpha.md"), concept);
      const command = spawnSync(process.execPath, [fileURLToPath(new URL("./generate-architecture-overview.mjs", import.meta.url)), "--write"],
        { cwd: root, encoding: "utf8" });
      assert.equal(command.status, 0, command.stderr);
      const generated = architectureOverview(root);
      assert.equal(fs.readFileSync(generated.path, "utf8"), generated.html);
      assert.equal(checkArchitectureOverview(root).ok, true);
      fs.writeFileSync(path.join(mapDir, "alpha.md"), concept.replace("First version", "Second version"));
      assert.equal(checkArchitectureOverview(root).ok, false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
