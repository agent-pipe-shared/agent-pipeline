#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_LICENSE = "SUL-1.0";
const SOURCE_ROOTS = ["harness", "plugins"];
const repoPath = (root, path) => join(root, ...path.split("/"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function walkMjs(root, start, found) {
  const absolute = repoPath(root, start);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) walkMjs(root, relative(root, path).split(sep).join("/"), found);
    else if (entry.isFile() && entry.name.endsWith(".mjs")) found.push(path);
  }
}

function sourceFiles(root) {
  const found = [];
  for (const start of SOURCE_ROOTS) walkMjs(root, start, found);
  for (const name of ["setup.mjs", "setup.test.mjs"]) {
    const path = repoPath(root, name);
    if (existsSync(path)) found.push(path);
  }
  return found.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function requireText(root, path, findings, patterns) {
  const absolute = repoPath(root, path);
  if (!existsSync(absolute)) { findings.push(`${path} is missing`); return ""; }
  const value = readFileSync(absolute, "utf8");
  for (const [label, pattern] of patterns) if (!pattern.test(value)) findings.push(`${path} lacks ${label}`);
  return value;
}

export function validateLicenseContract(root) {
  const findings = [];
  const license = requireText(root, "LICENSE", findings, [
    ["Sustainable Use License title", /^Sustainable Use License Version 1\.0$/mu],
    ["SUL SPDX identifier", /^SPDX identifier: SUL-1\.0$/mu],
  ]);
  if (/Apache License|SPDX identifier: Apache-2\.0/u.test(license)) findings.push("LICENSE mixes the current SUL-1.0 grant with Apache-2.0");

  requireText(root, "LICENSE-DOCS", findings, [["SUL-1.0 documentation grant", /same Sustainable Use License Version 1\.0/u], ["third-party exception", /unless a file states a different\s+third-party license/u]]);
  requireText(root, "NOTICE", findings, [["permitted internal commercial-company use", /internal commercial-company operations/u], ["own-purpose modification", /modifying a fork for your own purposes/u], ["monetization boundary", /only when Agent-Pipeline or a substantial derivative is itself monetized/u], ["unresolved legal-identity activation stop", /not yet been recorded.*External pull requests may be discussed.*no external contribution may be merged.*Commercial intake, CLA\/public activation, and commercial relicensing remain\s+blocked/su]]);
  requireText(root, "docs/licensing.md", findings, [["no-retroactive-change boundary", /does not purport to\s+change those grants retroactively/u], ["human review gate", /named human legal\/rightsholder review remains required/u], ["owner-controlled provenance qualification", /100% owner-controlled/u]]);

  for (const path of sourceFiles(root)) {
    const relativePath = relative(root, path).split(sep).join("/");
    const headers = readFileSync(path, "utf8").replace(/^\uFEFF/u, "").split(/\r?\n/u).slice(0, 3);
    if (!headers.includes(`// SPDX-License-Identifier: ${EXPECTED_LICENSE}`)) findings.push(`${relativePath} lacks an SPDX ${EXPECTED_LICENSE} header in its first three lines`);
    if (headers.some((line) => line.includes("SPDX-License-Identifier: Apache-2.0"))) findings.push(`${relativePath} retains a current Apache-2.0 SPDX header`);
  }

  for (const path of ["plugins/pipeline-core/.claude-plugin/plugin.json", "plugins/pipeline-core/.codex-plugin/plugin.json"]) {
    try { if (readJson(repoPath(root, path)).license !== EXPECTED_LICENSE) findings.push(`${path} license must be ${EXPECTED_LICENSE}`); }
    catch (error) { findings.push(`${path} is not valid JSON: ${error.message}`); }
  }

  try {
    const inventory = readJson(repoPath(root, "third-party-licenses.json"));
    const covenant = inventory.dependencies?.find((entry) => entry?.name === "Contributor Covenant Code of Conduct");
    if (!covenant || covenant.version !== "2.1" || covenant.license !== "CC-BY-SA-4.0" || covenant.path !== "CODE_OF_CONDUCT.md" || !/^https:\/\/www\.contributor-covenant\.org\//u.test(covenant.source ?? "")) findings.push("third-party-licenses.json lacks the complete Contributor Covenant 2.1 record");
  } catch (error) { findings.push(`third-party-licenses.json is not valid JSON: ${error.message}`); }

  requireText(root, "CODE_OF_CONDUCT.md", findings, [["CC-BY-SA-4.0 SPDX header", /^<!-- SPDX-License-Identifier: CC-BY-SA-4\.0 -->$/mu], ["Contributor Covenant 2.1 attribution", /Contributor Covenant.*version 2\.1/su], ["Mozilla ladder attribution", /Mozilla's code of conduct enforcement ladder/u]]);
  requireText(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md", findings, [["rights-of-use grant instead of copyright assignment", /grant of rights\s+of use \(`Nutzungsrechte`\)/u], ["exclusive worldwide transferable and sublicensable known-use rights", /exclusive,.*worldwide.*transfer and sublicense/su], ["SUL and separate commercial relicensing", /SUL-1\.0.*separate commercial/su], ["unknown-use separate-form safeguard", /legally required\s+separate declaration, form/u], ["no effectiveness guarantee", /does not guarantee effectiveness/u], ["human legal review gate", /named human legal\/rightsholder reviewer/u]]);
  requireText(root, ".github/PULL_REQUEST_TEMPLATE.md", findings, [["explicit CLA acceptance checkbox", /- \[ \] \*\*I have read and expressly accept the \[Contributor License Agreement\]/u], ["no proxy acceptance", /must not be checked or inferred by a\s+maintainer, bot/u]]);

  return { ok: findings.length === 0, findings, sourceCount: sourceFiles(root).length };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const result = validateLicenseContract(root);
  if (!result.ok) { for (const finding of result.findings) console.error(`FAIL: ${finding}`); return 1; }
  console.log(`PASS: license contract (${result.sourceCount} JavaScript sources; ${EXPECTED_LICENSE})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
