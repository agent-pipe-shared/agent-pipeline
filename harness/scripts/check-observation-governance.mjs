#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";

export const POLICY_PATH = "governance/observation-doc-governance.json";
const FORM_PATH = ".github/ISSUE_TEMPLATE/observation.yml";
const CHOOSER_PATH = ".github/ISSUE_TEMPLATE/config.yml";
const GOVERNANCE_DOC_PATH = "docs/observation-intake.md";
const ADR_PATH = "docs/adr/0042-global-observation-and-document-governance.md";
const ADR_INDEX_PATH = "docs/adr/README.md";
const BACKLOG_PATH = "backlog/README.md";
const SKILL_PATH = "plugins/pipeline-core/skills/capture-observation/SKILL.md";
const PIPELINE_START_PATH = "plugins/pipeline-core/skills/pipeline-start/SKILL.md";
const CLOSE_BLOCK_PATH = "plugins/pipeline-core/skills/close-block/SKILL.md";
const REQUIRED_ARTIFACTS = Object.freeze([
  POLICY_PATH,
  FORM_PATH,
  CHOOSER_PATH,
  GOVERNANCE_DOC_PATH,
  ADR_PATH,
  ADR_INDEX_PATH,
  BACKLOG_PATH,
  SKILL_PATH,
  PIPELINE_START_PATH,
  CLOSE_BLOCK_PATH,
]);
const AUDIENCES = Object.freeze(["public-user", "maintainer", "machine"]);
const DOCUMENT_LIFECYCLES = Object.freeze([
  "maintained",
  "normative-record",
  "compatibility-redirect",
  "review-candidate",
]);
const AREA_OPTIONS = Object.freeze([
  "advisory", "afk", "bootstrap", "docs", "guardrails", "lifecycle", "review",
  "routing", "runners", "sandbox", "telemetry", "tooling", "verify", "other",
]);
const FREQUENCIES = Object.freeze(["always", "frequent", "intermittent", "once", "unknown"]);
const RUNNERS = Object.freeze(["claude-code", "codex", "other", "unknown"]);
const OPERATING_SYSTEMS = Object.freeze(["linux", "macos", "windows", "wsl", "other", "unknown"]);
const REQUIRED_FORM_IDS = Object.freeze([
  "area", "actual", "expected", "reproduction", "frequency", "runner",
  "plugin_version", "pipeline_version", "candidate", "os", "capability",
  "evidence", "source_backlog_links", "security_confirmation", "privacy_confirmation",
]);

function posix(value) {
  return value.split(sep).join("/");
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => entry === expected[index]);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readYaml(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

export function discoverDocumentation(root) {
  const docsRoot = join(root, "docs");
  const paths = [];
  const findings = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const path = posix(relative(root, absolute));
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) findings.push(`OG-DOC-SYMLINK ${path}`);
      else if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) paths.push(path);
      else findings.push(`OG-DOC-NONREGULAR ${path}`);
    }
  };
  if (!existsSync(docsRoot)) return { paths: [], findings: ["OG-DOCS-MISSING docs"] };
  visit(docsRoot);
  return { paths: paths.sort(), findings };
}

function requireExactPolicy(policy, findings) {
  if (!exactKeys(policy, ["schema", "canonicalIssue", "lifecycle", "backlog", "privateOverlay", "documentation"])) {
    findings.push("OG-POLICY-SCHEMA root keys are not exact");
    return;
  }
  if (policy.schema !== "pipeline.observation-doc-governance.v1") findings.push("OG-POLICY-SCHEMA unsupported schema");

  const issue = policy.canonicalIssue;
  if (!exactKeys(issue, ["scope", "branchIndependent", "initialFormLabels", "controlledAreaLabelAllowed", "securityRoute"])
      || issue.scope !== "repository-global"
      || issue.branchIndependent !== true
      || !exactArray(issue.initialFormLabels, ["kind:observation", "triage:needs-review"])
      || issue.controlledAreaLabelAllowed !== true
      || issue.securityRoute !== "private-vulnerability-reporting") {
    findings.push("OG-ISSUE-AUTHORITY canonical Issue contract drifted");
  }

  const lifecycle = policy.lifecycle;
  const expectedTransitions = {
    observation: ["triage"],
    triage: ["confirmed"],
    confirmed: ["known-error", "backlog-link"],
    "known-error": ["backlog-link"],
    "backlog-link": [],
  };
  if (!exactKeys(lifecycle, ["states", "transitions"])
      || !exactArray(lifecycle?.states, Object.keys(expectedTransitions))
      || !exactKeys(lifecycle?.transitions, Object.keys(expectedTransitions))
      || Object.entries(expectedTransitions).some(([state, targets]) => !exactArray(lifecycle?.transitions?.[state], targets))) {
    findings.push("OG-LIFECYCLE observation lifecycle drifted");
  }

  const backlog = policy.backlog;
  if (!exactKeys(backlog, ["promotion", "requiresStablePublicBranch", "reciprocalLinksRequired", "automaticPromotion"])
      || backlog.promotion !== "explicit-after-triage"
      || backlog.requiresStablePublicBranch !== true
      || backlog.reciprocalLinksRequired !== true
      || backlog.automaticPromotion !== false) {
    findings.push("OG-BACKLOG backlog promotion contract drifted");
  }

  const overlay = policy.privateOverlay;
  if (!exactKeys(overlay, ["allowedContent", "mayReplacePublicIssue", "mayDuplicatePublicObservation"])
      || !exactArray(overlay.allowedContent, ["private-deltas", "public-issue-links", "public-backlog-links"])
      || overlay.mayReplacePublicIssue !== false
      || overlay.mayDuplicatePublicObservation !== false) {
    findings.push("OG-OVERLAY private overlay contract drifted");
  }
}

function checkInventory(policy, docsPaths, findings) {
  const documentation = policy?.documentation;
  if (!exactKeys(documentation, ["audiences", "lifecycles", "inventory"])
      || !exactArray(documentation?.audiences, AUDIENCES)
      || !exactArray(documentation?.lifecycles, DOCUMENT_LIFECYCLES)) {
    findings.push("OG-DOC-AXES documentation audience/lifecycle axes drifted");
    return;
  }
  if (!Array.isArray(documentation.inventory)) {
    findings.push("OG-DOC-INVENTORY inventory must be an array");
    return;
  }
  const paths = [];
  for (const [index, entry] of documentation.inventory.entries()) {
    if (!exactKeys(entry, ["audience", "lifecycle", "paths"])
        || !AUDIENCES.includes(entry.audience)
        || !DOCUMENT_LIFECYCLES.includes(entry.lifecycle)
        || !Array.isArray(entry.paths)
        || entry.paths.some((path) => typeof path !== "string" || !path.startsWith("docs/"))) {
      findings.push(`OG-DOC-INVENTORY invalid entry ${index}`);
      continue;
    }
    if (!exactArray(entry.paths, [...entry.paths].sort())) findings.push(`OG-DOC-ORDER inventory group ${index} paths must be sorted`);
    paths.push(...entry.paths);
  }
  if (new Set(paths).size !== paths.length) findings.push("OG-DOC-DUPLICATE inventory paths must be unique");
  const inventory = new Set(paths);
  const discovered = new Set(docsPaths);
  for (const path of docsPaths) if (!inventory.has(path)) findings.push(`OG-DOC-UNCLASSIFIED ${path}`);
  for (const path of paths) if (!discovered.has(path)) findings.push(`OG-DOC-INVENTORY-STALE ${path}`);
}

function checkForm(form, chooser, findings) {
  if (!exactArray(form?.labels, ["kind:observation", "triage:needs-review"])) {
    findings.push("OG-FORM-LABELS Issue Form initial labels must be exact");
  }
  const fields = new Map();
  for (const entry of form?.body ?? []) {
    if (entry?.id) {
      if (fields.has(entry.id)) findings.push(`OG-FORM-DUPLICATE-ID ${entry.id}`);
      fields.set(entry.id, entry);
    }
  }
  for (const id of REQUIRED_FORM_IDS) if (!fields.has(id)) findings.push(`OG-FORM-FIELD missing ${id}`);
  for (const [id, expected] of [["area", AREA_OPTIONS], ["frequency", FREQUENCIES], ["runner", RUNNERS], ["os", OPERATING_SYSTEMS]]) {
    if (!exactArray(fields.get(id)?.attributes?.options, expected)) findings.push(`OG-FORM-ENUM ${id} options drifted`);
  }
  for (const id of REQUIRED_FORM_IDS.filter((entry) => !entry.endsWith("_confirmation"))) {
    if (fields.get(id)?.validations?.required !== true) findings.push(`OG-FORM-REQUIRED ${id}`);
  }
  for (const id of ["security_confirmation", "privacy_confirmation"]) {
    const options = fields.get(id)?.attributes?.options;
    if (!Array.isArray(options) || options.length !== 1 || options[0]?.required !== true) findings.push(`OG-FORM-REQUIRED ${id}`);
  }
  const publicText = JSON.stringify(form);
  if (!publicText.includes("security/advisories/new") || !/raw logs/i.test(publicText) || !/prompts/i.test(publicText)) {
    findings.push("OG-FORM-PRIVACY public privacy/security routing is incomplete");
  }
  if (chooser?.blank_issues_enabled !== false
      || !Array.isArray(chooser.contact_links)
      || chooser.contact_links.length !== 1
      || !String(chooser.contact_links[0]?.url ?? "").includes("security/advisories/new")) {
    findings.push("OG-CHOOSER blank or security chooser contract drifted");
  }
}

function checkProse(texts, findings) {
  const governance = texts[GOVERNANCE_DOC_PATH];
  const adr = texts[ADR_PATH];
  const index = texts[ADR_INDEX_PATH];
  const backlog = texts[BACKLOG_PATH];
  const skill = texts[SKILL_PATH];
  const pipelineStart = texts[PIPELINE_START_PATH];
  const closeBlock = texts[CLOSE_BLOCK_PATH];
  const requirements = [
    [governance, /GitHub Issues are the repository-global, branch-independent single source of\s+truth/, "OG-DOC-SINGLE-SOURCE"],
    [governance, /Keep an `area:docs` report unconfirmed/, "OG-DOC-UNCONFIRMED"],
    [governance, /audience is `public-user`[\s\S]*lifecycle is `maintained`/i, "OG-DOC-AXES"],
    [governance, /inbound link[\s\S]*V3 authority[\s\S]*lifecycle/i, "OG-DOC-LIFECYCLE"],
    [governance, /stable Public\s+branch/, "OG-BACKLOG-STABLE-BRANCH"],
    [governance, /private overlay keeps only its private deltas and links/i, "OG-OVERLAY-PROSE"],
    [adr, /\*\*Status:\*\* accepted/, "OG-ADR-STATUS"],
    [index, /\[0042\]\(0042-global-observation-and-document-governance\.md\).*accepted/, "OG-ADR-INDEX"],
    [backlog, /GitHub Issue as their single source/, "OG-BACKLOG-PROSE"],
    [skill, /Never\s+promote an observation to the backlog automatically/, "OG-SKILL-PROMOTION"],
    [pipelineStart, /node harness\/scripts\/check-observation-governance\.mjs/, "OG-BOOTSTRAP-WIRING"],
    [pipelineStart, /case \*\*F6\*\*/, "OG-BOOTSTRAP-FAIL-CLOSED"],
    [closeBlock, /node harness\/scripts\/check-observation-governance\.mjs/, "OG-CLOSE-WIRING"],
  ];
  for (const [text, pattern, code] of requirements) if (!pattern.test(text ?? "")) findings.push(`${code} required contract text is missing`);
}

export function checkObservationGovernance(rootInput, options = {}) {
  const root = resolve(rootInput);
  const present = REQUIRED_ARTIFACTS.filter((path) => existsSync(join(root, path)));
  if (present.length === 0 && options.optionalWhenAbsent === true) {
    return { applicable: false, ok: true, findings: [], stats: { documents: 0, inventoryEntries: 0 } };
  }
  const findings = [];
  for (const path of REQUIRED_ARTIFACTS) if (!existsSync(join(root, path))) findings.push(`OG-ARTIFACT-MISSING ${path}`);
  if (findings.length) return { applicable: true, ok: false, findings, stats: { documents: 0, inventoryEntries: 0 } };

  let policy;
  let form;
  let chooser;
  try { policy = options.policyDocument ?? readJson(join(root, POLICY_PATH)); }
  catch { findings.push(`OG-POLICY-UNREADABLE ${POLICY_PATH}`); }
  try { form = options.formDocument ?? readYaml(join(root, FORM_PATH)); }
  catch { findings.push(`OG-FORM-UNREADABLE ${FORM_PATH}`); }
  try { chooser = options.chooserDocument ?? readYaml(join(root, CHOOSER_PATH)); }
  catch { findings.push(`OG-CHOOSER-UNREADABLE ${CHOOSER_PATH}`); }
  if (!policy || !form || !chooser) return { applicable: true, ok: false, findings, stats: { documents: 0, inventoryEntries: 0 } };

  const discovered = options.docsPaths
    ? { paths: [...options.docsPaths].sort(), findings: [] }
    : discoverDocumentation(root);
  findings.push(...discovered.findings);
  requireExactPolicy(policy, findings);
  checkInventory(policy, discovered.paths, findings);
  checkForm(form, chooser, findings);
  const texts = Object.fromEntries([GOVERNANCE_DOC_PATH, ADR_PATH, ADR_INDEX_PATH, BACKLOG_PATH, SKILL_PATH, PIPELINE_START_PATH, CLOSE_BLOCK_PATH]
    .map((path) => [path, readFileSync(join(root, path), "utf8")]));
  checkProse(texts, findings);
  findings.sort();
  return {
    applicable: true,
    ok: findings.length === 0,
    findings,
    stats: {
      documents: discovered.paths.length,
      inventoryEntries: policy.documentation?.inventory?.flatMap((entry) => entry.paths ?? []).length ?? 0,
    },
  };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root")) {
    process.stderr.write("usage: check-observation-governance.mjs [--root <repository>]\n");
    process.exitCode = 2;
    return;
  }
  const root = args.length ? args[1] : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const result = checkObservationGovernance(root);
    if (!result.ok) {
      for (const finding of result.findings) process.stderr.write(`OBSERVATION-GOVERNANCE ${finding}\n`);
      process.stderr.write(`Observation governance failed: ${result.findings.length} finding(s).\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`Observation governance valid: ${result.stats.documents} document(s) classified.\n`);
  } catch {
    process.stderr.write("Observation governance unavailable.\n");
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
