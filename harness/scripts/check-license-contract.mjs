#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_LICENSE = "SUL-1.0";
const CLA_VERSION = "1.0";
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
  requireText(root, "NOTICE", findings, [["permitted internal commercial-company use", /internal commercial-company operations/u], ["own-purpose modification", /modifying a fork for your own purposes/u], ["monetization boundary", /only when Agent-Pipeline or a substantial derivative is itself monetized/u], ["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the commercial\/CLA contracting party/u], ["third-party ownership exclusion", /excludes\s+third-party material identified in `third-party-licenses\.json`.*Contributor Covenant/su], ["dated named-human CLA activation", /On 2026-07-23, André Twachtmann,\s+acting as the named human\s+rightsholder reviewer, approved activation/u]]);
  requireText(root, "docs/licensing.md", findings, [["no-retroactive-change boundary", /does not purport to\s+change those grants retroactively/u], ["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the commercial\/CLA contracting party/u], ["third-party ownership exclusion", /Third-party material listed\s+in `third-party-licenses\.json`.*Contributor Covenant.*upstream ownership and license/su], ["dated named-human CLA activation", /On 2026-07-23, André\s+Twachtmann, acting as the named human\s+rightsholder reviewer, approved activation/u], ["owner-controlled provenance qualification", /100% owner-controlled/u], ["no proxy CLA acceptance", /maintainer, bot, or submission automation cannot accept/u], ["required contributor gate", /contributor-gates \/ cla-and-dco.*required status check/su], ["up-to-date branch protection", /require the PR\s+branch to be current with `main` before merge/u], ["honest receipt retention boundary", /no immutable long-term archive is asserted/u]]);
  requireText(root, "CONTRIBUTING.md", findings, [["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the CLA contracting party/u], ["third-party ownership exclusion", /Third-party material remains under the\s+ownership and license recorded in `third-party-licenses\.json`/u], ["active CLA approval", /2026-07-23.*approved activation of the CLA process/su], ["cumulative DCO and CLA merge gates", /both\s+its DCO sign-off and the Contributor's personally checked, current-version CLA\s+acceptance/u], ["no proxy acceptance", /maintainer, bot, or submission automation cannot\s+accept on the Contributor's behalf/u], ["required contributor gate", /contributor-gates \/ cla-and-dco.*status check/su], ["up-to-date branch protection", /pull-request\s+branch to be up to date with `main` before merge/u], ["server-side read-back boundary", /server-side read-back confirming them/u]]);

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
  const cla = requireText(root, "CONTRIBUTOR_LICENSE_AGREEMENT.md", findings, [["machine-readable CLA version", /^<!-- CLA-Version: 1\.0 -->$/mu], ["project-authored legal rightsholder, grant recipient, and contracting party", /André Twachtmann, the legal rightsholder for Agent-Pipeline project-authored\s+content, the recipient of the Contributor's grants under this Agreement, and\s+the CLA contracting party/u], ["third-party ownership exclusion", /does not claim rights in third-party material identified in\s+`third-party-licenses\.json`/u], ["dated named-human CLA activation", /On 2026-07-23, André Twachtmann, acting as the\s+named human rightsholder reviewer, approved activation/u], ["rights-of-use grant instead of copyright assignment", /grant of rights\s+of use \(`Nutzungsrechte`\)/u], ["exclusive worldwide transferable and sublicensable known-use rights", /exclusive,.*worldwide.*transfer and sublicense/su], ["SUL and separate commercial relicensing", /SUL-1\.0.*separate commercial/su], ["unknown-use separate-form safeguard", /legally required\s+separate declaration, form/u], ["no effectiveness guarantee", /does not guarantee effectiveness/u], ["cumulative DCO and personal CLA gate", /both the DCO sign-off and the Contributor's\s+personally checked, current-version CLA record/u]]);
  const claDigest = createHash("sha256").update(cla, "utf8").digest("hex");
  const template = requireText(root, ".github/PULL_REQUEST_TEMPLATE.md", findings, [["active project-authored legal rightsholder", /identifies André Twachtmann as legal(?:\s|>)+rightsholder for Agent-Pipeline project-authored content and CLA contracting(?:\s|>)+party, excluding inventoried third-party material/u], ["no proxy acceptance", /maintainer, bot, or\s+submission automation must not check or rewrite it/u], ["stale-acceptance invalidation", /changing the CLA invalidates earlier acceptance/u]]);
  const expectedAcceptance = `- [ ] **CLA acceptance — Agent-Pipeline CLA v${CLA_VERSION} (SHA-256: \`${claDigest}\`) — I, @REPLACE_WITH_PR_AUTHOR_LOGIN, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**`;
  if (!template.split(/\r?\n/u).includes(expectedAcceptance)) findings.push(".github/PULL_REQUEST_TEMPLATE.md does not bind the exact current CLA version and SHA-256");

  requireText(root, ".github/workflows/contributor-gates.yml", findings, [["pull-request trigger", /^  pull_request:$/mu], ["main target", /^      - main$/mu], ["required PR lifecycle events", /types:\s+      - opened\s+      - reopened\s+      - synchronize\s+      - edited/su], ["minimal read permission", /permissions:\s+  contents: read/su], ["credential-free checkouts", /persist-credentials: false/su], ["trusted base checker", /node trusted-gate\/harness\/scripts\/check-pr-contributor-gates\.mjs/u]]);
  const workflow = requireText(root, ".github/workflows/contributor-gates.yml", findings, []);
  if (/pull_request_target|secrets:/u.test(workflow)) findings.push("contributor-gates workflow must not use pull_request_target or secrets");

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
