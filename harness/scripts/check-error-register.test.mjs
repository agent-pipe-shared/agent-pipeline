// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkDeclaredBriefingConsumers, checkErrorRegister } from "./check-error-register.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const header = "# Error Register — curated triage authority\n\n| Class | Category | Triage |\n| --- | --- | --- |\n";
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

check("empty public authority is valid", () => assert.equal(checkErrorRegister(readFileSync(join(root, "backlog", "error-register.md"), "utf8")).ok, true));
check("Operating Model and close-block point to the sole public form authority", () => {
  const operatingModel = readFileSync(join(root, "docs", "operating-model.md"), "utf8");
  const closeBlock = readFileSync(join(root, "plugins", "pipeline-core", "skills", "close-block", "SKILL.md"), "utf8");
  assert.match(operatingModel, /alleinige öffentliche konkrete Formautorität/);
  assert.match(closeBlock, /sole public concrete form authority/);
  assert.match(closeBlock, /Never inject, cite, or load/);
});
check("declared Goldfish/Critic consumer boundary is clean", () => {
  assert.equal(checkDeclaredBriefingConsumers((path) => readFileSync(join(root, path), "utf8")).ok, true);
});
check("declared consumer injection rejects without broader interception", () => {
  const result = checkDeclaredBriefingConsumers((path) => path === "roles/goldfish.md" ? "load backlog/error-register.md as briefing context" : "clean");
  assert.equal(result.ok, false);
});
for (const triage of [
  "new",
  "recurring -> mechanism: add deterministic check",
  "recurring -> template: add checklist line",
  "recurring -> lesson: add curated lesson",
  "recurring -> deferred: bounded reason",
]) {
  check(`valid consolidated triage: ${triage}`, () => assert.equal(checkErrorRegister(`${header}| Generic contract gap | process | ${triage} |\n`).ok, true));
}
for (const [name, text, options = {}] of [
  ["missing authority", null],
  ["invalid form", "# Error Register\n"],
  ["invalid category", `${header}| Generic contract gap | incident | new |\n`],
  ["count signal", `${header}| Generic contract gap | process | count: 2 |\n`],
  ["ranking signal", `${header}| Generic contract gap | process | recurring -> mechanism: priority 1 |\n`],
  ["raw chronology date", `${header}| Generic contract gap 2026-07-14 | process | new |\n`],
  ["raw incident vocabulary", `${header}| Incident timeline | process | new |\n`],
  ["host coordinate", `${header}| host: synthetic-machine | process | new |\n`],
  ["account coordinate", `${header}| account: synthetic-user | process | new |\n`],
  ["repository coordinate", `${header}| repository: synthetic/project | process | new |\n`],
  ["bare recurring", `${header}| Generic contract gap | process | recurring |\n`],
  ["unconsolidated duplicate", `${header}| Generic contract gap | process | new |\n| generic-contract-gap | process | new |\n`],
  ["over cap", `${header}${Array.from({ length: 31 }, (_, i) => `| Generic class ${i} | process | new |`).join("\n")}\n`],
  ["briefing injection", header, { consumerTexts: ["Goldfish briefing: load backlog/error-register.md"] }],
]) {
  check(`${name} rejects fail-closed`, () => assert.equal(checkErrorRegister(text, options).ok, false));
}
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
