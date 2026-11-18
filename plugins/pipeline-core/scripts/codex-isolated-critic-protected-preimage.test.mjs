#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const inventoryPath = join(scriptDir, "codex-isolated-critic-protected-preimage.v1.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const EXPECTED_PATHS = [
  "harness/review-protocol.md",
  "plugins/pipeline-core/agents/critic.md",
  "plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host-return.schema.json",
  "plugins/pipeline-core/scripts/codex-critic-host.mjs",
  "plugins/pipeline-core/scripts/codex-critic-receipt.schema.json",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "plugins/pipeline-core/skills/critic-review/SKILL.md",
  "roles/critic.md",
  "templates/prompts/critic-review.md",
];

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

check("F1 protected inventory is closed and names the autonomous-Critic policy baseline", () => {
  assert.deepEqual(Object.keys(inventory), ["schema", "baselineLabel", "files"]);
  assert.equal(inventory.schema, "pipeline.codex-isolated-critic-protected-preimage.v1");
  assert.equal(inventory.baselineLabel, "nova-autonomous-critic-review-policy");
  assert.deepEqual(inventory.files.map((entry) => entry.path), EXPECTED_PATHS);
  assert.equal(new Set(inventory.files.map((entry) => entry.path)).size, EXPECTED_PATHS.length);
});

check("F1 protected paths are regular in-repository files without aliasing", () => {
  const rootReal = realpathSync(repoRoot);
  for (const entry of inventory.files) {
    assert.deepEqual(Object.keys(entry), ["path", "rawSha256"]);
    assert.match(entry.path, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    const candidate = join(repoRoot, ...entry.path.split("/"));
    const candidateReal = realpathSync(candidate);
    assert.equal(candidateReal.startsWith(`${rootReal}${sep}`), true);
    assert.equal(relative(rootReal, candidateReal).split(sep).join("/"), entry.path);
    assert.equal(statSync(candidateReal).isFile(), true);
  }
});

check("F1 current Critic execution surfaces remain byte-identical to the protected baseline", () => {
  // Accumulate every mismatch across the whole loop before asserting once, rather
  // than throwing on the first (assert.equal per entry): a fail-fast loop hides
  // every stale pin after the first one from whoever reads the run's own output
  // (backlog: preimage-repin-disclosure-incomplete-for-roles-critic).
  const mismatches = [];
  for (const entry of inventory.files) {
    const actual = digest(readFileSync(join(repoRoot, ...entry.path.split("/"))));
    if (actual !== entry.rawSha256) mismatches.push({ path: entry.path, expected: entry.rawSha256, actual });
  }
  assert.deepEqual(mismatches, []);
});

check("F1 inventory records full lowercase SHA-256 values", () => {
  for (const entry of inventory.files) assert.match(entry.rawSha256, /^[0-9a-f]{64}$/);
});

check("D41 the Critic skill states the diagnostic evidence route (producer, registrar flag, preflight flag)", () => {
  // C30I-S1A: the route text moved to the Coordinator reference of the same skill (Antigravity body limit); read the skill plus it.
  const skillDir = join(repoRoot, "plugins", "pipeline-core", "skills", "critic-review");
  const skill = `${readFileSync(join(skillDir, "SKILL.md"), "utf8")}\n${readFileSync(join(skillDir, "references", "coordinator-course.md"), "utf8")}`;
  const flat = skill.replace(/\s+/g, " ");
  const anchor = flat.indexOf("Diagnostic evidence route");
  assert.equal(anchor >= 0, true, "the Diagnostic evidence route heading is present");
  const route = flat.slice(anchor);
  const producer = route.indexOf("scripts/critic-diagnostic-evidence.mjs");
  const registrar = route.indexOf("scripts/register-feature-package.mjs");
  const addFlag = route.indexOf("--add-diagnostic-evidence");
  const preflight = route.indexOf("scripts/critic-dispatch-preflight.mjs");
  const regCommit = route.indexOf("--registration-commit");
  assert.equal(producer >= 0, true, "producer script is named");
  assert.equal(registrar > producer, true, "registrar script follows the producer");
  assert.equal(addFlag > registrar, true, "registrar flag --add-diagnostic-evidence follows the registrar");
  assert.equal(preflight > addFlag, true, "preflight script follows the registration step");
  assert.equal(regCommit > preflight, true, "preflight flag --registration-commit follows the preflight script");
});

check("C30I-S1A the pinned Critic skill names its protocol reference MANDATORY, keeps the Stage gate, and the reference carries the protocol sections 0, 2 to 6", () => {
  const skillDir = join(repoRoot, "plugins", "pipeline-core", "skills", "critic-review");
  const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  const protocol = readFileSync(join(skillDir, "references", "critic-protocol.md"), "utf8");
  const opening = skill.slice(skill.indexOf("# critic-review"), skill.indexOf("## Continuing a Critic course"));
  assert.match(opening, /MANDATORY for the dispatched Critic[^\n]*references\/critic-protocol\.md/u, "the opening lines name the protocol reference MANDATORY");
  assert.equal(skill.includes("## 1. Stage gate (self-enforcing, before any review work)"), true, "the Stage gate stays in the skill");
  for (const heading of ["## 0. Parse the dispatch (paths only — strict)", "### Review-scope rule (hard)", "## 2. Bootstrap confirmation (first output line, verbatim English)", "## 3. Construct your own input", "## 4. Phase A — adversarial hunt (be harsh; report nothing yet)", "## 5. Phase B — evidence gate (be honest; report only what survives)", "## 6. Report format (mandatory, English; findings most severe first)"]) {
    assert.equal(protocol.includes(heading), true, `the protocol reference carries ${heading}`);
    assert.equal(skill.includes(heading), false, `${heading} is not duplicated in the skill`);
  }
});

process.stdout.write(`1..${passed}\n`);
