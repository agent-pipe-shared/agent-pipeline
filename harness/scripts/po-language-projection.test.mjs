#!/usr/bin/env node
/** Runtime PO-language projection contract: source -> strict manifest -> consumers. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";
import { resolveHumanFacingLanguage, validateManifest } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { buildDefaultAnswers, renderPipelineYaml, validateHumanFacingLanguage } from "../../setup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

for (const language of ["de", "en"]) {
  check(`${language} projects deterministically into a valid runtime manifest`, () => {
    const answers = { ...buildDefaultAnswers(), language: { human_facing: language, agent_facing: "en" } };
    const first = renderPipelineYaml(answers, "language-test");
    const second = renderPipelineYaml(answers, "language-test");
    const manifest = parseYaml(first);
    assert.equal(first, second);
    assert.equal(validateManifest(manifest, { rootDir: root }).status, "ok");
    assert.deepEqual(resolveHumanFacingLanguage(manifest), { ok: true, value: language });
  });
}
for (const [name, manifest] of [
  ["missing", { schema: "pipeline.manifest.v0" }],
  ["empty", { schema: "pipeline.manifest.v0", language: { human_facing: "" } }],
  ["unknown", { schema: "pipeline.manifest.v0", language: { human_facing: "fr" } }],
  ["ambiguous", { schema: "pipeline.manifest.v0", language: { human_facing: ["de", "en"] } }],
]) {
  check(`${name} runtime language never receives a fallback`, () => {
    assert.equal(resolveHumanFacingLanguage(manifest).ok, false);
    if (name !== "missing") assert.equal(validateManifest(manifest, { rootDir: root }).status, "invalid");
  });
}
check("source language validator rejects missing, empty, and unknown values", () => {
  for (const value of [undefined, "", "fr"]) assert.equal(validateHumanFacingLanguage(value).ok, false);
});
check("committed runtime language agrees with the committed user source", () => {
  const source = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
  const runtime = parseYaml(readFileSync(join(root, ".claude", "pipeline.yaml"), "utf8"));
  assert.deepEqual(resolveHumanFacingLanguage(runtime), { ok: true, value: source.language.human_facing });
});
const consumers = [
  "templates/prd.md",
  "roles/elephant.md",
  "docs/operating-model.md",
  "templates/prompts/elephant-kickoff.md",
  "templates/prompts/kickoff-new-project.md",
];
for (const path of consumers) {
  check(`${path} uses the compiled runtime language and the single PRD authority`, () => {
    const text = readFileSync(join(root, path), "utf8");
    assert.match(text, /language\.human_facing/);
    assert.match(text, /freigegeben/);
    assert.match(text, /second implementation approval|zweite Implementierungsfreigabe|zweiten Implementierungsfreigabe/);
  });
}
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
