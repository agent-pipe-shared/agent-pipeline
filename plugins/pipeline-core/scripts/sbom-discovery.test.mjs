// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(new URL("../../..", import.meta.url).pathname); const cli = join(root, "plugins/pipeline-core/scripts/sbom-discovery.mjs"); const sha = (value) => createHash("sha256").update(value).digest("hex"); let passed = 0;
function test(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }
function fixture(dir, path) { mkdirSync(join(dir, "specs/f", path.split("/").slice(0, -1).join("/")), { recursive: true }); writeFileSync(join(dir, "specs/f/prd.md"), "prd"); writeFileSync(join(dir, `specs/f/${path}`), "{}\n"); const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "f", rigor: 1 }, state: "draft", candidate: null, supersedes: null, artifacts: [{ class: "prd", path: "specs/f/prd.md", sha256: sha("prd"), authority: true, mutability: "mutable", retention: "active" }, { class: "supply-chain", path: `specs/f/${path}`, sha256: sha("{}\n"), authority: false, mutability: "immutable", retention: "retain" }] }; writeFileSync(join(dir, "specs/f/lifecycle.json"), JSON.stringify(manifest)); }
test("one command resolves two layouts without path guessing", () => { const first = mkdtempSync(join(tmpdir(), "sbom-cli-one-")); const second = mkdtempSync(join(tmpdir(), "sbom-cli-two-")); fixture(first, "out/bom.json"); fixture(second, "elsewhere/bom.json"); const run = (dir) => JSON.parse(execFileSync(process.execPath, [cli, "--root", dir], { encoding: "utf8" })); assert.equal(run(first).artifact.path, "specs/f/out/bom.json"); assert.equal(run(second).artifact.path, "specs/f/elsewhere/bom.json"); });
test("migration preview remains a typed zero-write command", () => { const dir = mkdtempSync(join(tmpdir(), "sbom-cli-legacy-")); mkdirSync(join(dir, "specs")); const result = JSON.parse(execFileSync(process.execPath, [cli, "--root", dir, "--migration-preview"], { encoding: "utf8" })); assert.deepEqual(result.writes, []); });
console.log(`\n${passed} passed`);
