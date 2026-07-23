#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { closeSync, existsSync, fsyncSync, linkSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPrivateFile, ensurePrivateDirectory, fsyncDirectory } from "../../plugins/pipeline-core/scripts/release-version-plan.mjs";

const EXPECTED_LICENSE = "SUL-1.0";
const CLA_VERSION = "1.0";
const SOURCE_ROOTS = ["harness", "plugins"];
export const LICENSE_GATE_SCHEMA = "pipeline.snt1-license-gate.v1";
export const LICENSE_GATE_PROJECTION_SCHEMA = "pipeline.snt1-license-gate-projection.v1";
export const SNT1_RESULT_SCHEMA = "pipeline.snt1-result.v1";
export const SNT1_PRIVACY_DISPOSITION_SCHEMA = "pipeline.snt1-privacy-disposition.v1";
export const SNT1_LICENSING_DISPOSITION_SCHEMA = "pipeline.snt1-licensing-disposition.v1";
export const LICENSE_SURFACES = Object.freeze(["LICENSE", "LICENSE-DOCS", "NOTICE", "CONTRIBUTING.md", "README.md", "docs/licensing.md", "third-party-licenses.json"]);
export const SNT1_CANDIDATE = Object.freeze({ commit: "f83803c767f90dceacea936ac3bd52c63dc24bd1", tree: "9bdd679db74aa0b1b7877984df7324ffb880be86" });
export const SNT1_LICENSE_SURFACES = Object.freeze([
  Object.freeze({ path: "LICENSE", sha256: "2858cc44686c7483dfa163ad0d02d7f040973d45b4ef52c18b6c81990dfdd760" }),
  Object.freeze({ path: "LICENSE-DOCS", sha256: "3bd7e2764f64e765a830102be2b811df50b67a50695a67f21677fe6cadb81174" }),
  Object.freeze({ path: "NOTICE", sha256: "e5d4f9e964a82cd0db8ec11f182fe38dc179dc090415d2896549f58b3cc129fe" }),
  Object.freeze({ path: "CONTRIBUTING.md", sha256: "26878e36d4ad1693d0129a1f8028e7b4b053a7795f95ed16c35942cda02c84a3" }),
  Object.freeze({ path: "README.md", sha256: "cadcccc9a8fed070b80e409eef6d9d427962d85be2ea2b28535f7b0aea93548c" }),
  Object.freeze({ path: "docs/licensing.md", sha256: "c3f1dcbb4b6ce951a0d1976241755e71aa37bc60fe2235c13b04f3381ceed96e" }),
  Object.freeze({ path: "third-party-licenses.json", sha256: "137fd317197b1c9a9753679328944cef4ccfb7ad834efaaa26959e5470f05bd0" }),
]);
export const SNT1_PRIVACY_APPROVAL = "Review ist erfolgreich durchgeführt und erledigt! Ich, André Twachtmann, genehmige den kandidatgebundenen Datenschutzreview für f83803c/9bdd679d und 30 Tage Actions-Log-Retention.";
export const SNT1_LICENSING_SEMANTICS = "SUL-1.0 with the Agent-Pipeline Additional Permission: internal operations include affiliates, employees, contractors, and service providers; independent consulting, training, and support remain permitted when Agent-Pipeline itself is not monetized; direct commercial exploitation requires a separate agreement.";
export const SNT1_CLA_SEMANTICS = "DCO and the Contributor-personal, current-version, digest-bound CLA acceptance remain cumulative; maintainers, bots, and submission automation cannot accept for the Contributor.";
const SNT1_EVIDENCE_PATHS = Object.freeze({
  privacy: "backlog/evidence/2026-07-23-snt-1-privacy-disposition.json",
  licensing: "backlog/evidence/2026-07-23-snt-1-licensing-disposition.json",
  result: "backlog/evidence/2026-07-23-snt-1-activation-result.json",
});
const HEX40 = /^[a-f0-9]{40}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const INTERNAL_OPERATIONS_DELEGATION = /affiliates,\s+employees,\s+contractors,\s+and\s+service\s+providers[\s\S]{0,180}solely[\s\S]{0,120}licensee's\s+internal\s+operations/iu;
const INDEPENDENT_SERVICES_BOUNDARY = /independent\s+consulting,\s+training,\s+and\s+support[\s\S]{0,180}(?:permitted|allowed)[\s\S]{0,180}not\s+itself\s+monetized/iu;
const CLOSED_MONETIZATION_BOUNDARY = /sale;\s+paid\s+licensing\s+or\s+distribution;\s+paid\s+hosting,\s+SaaS,\s+or\s+managed\s+service;\s+white-label\s+use;\s+material\s+embedding\s+as\s+a\s+value\s+component\s+of\s+a\s+paid\s+product;\s+(?:or\s+)?commercial\s+redistribution/iu;
const repoPath = (root, path) => join(root, ...path.split("/"));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : stable(value)).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");

export function licenseSurfaceDigests(root) {
  return LICENSE_SURFACES.map((path) => ({ path, sha256: digest(readFileSync(repoPath(root, path))) }));
}

function validLicenseSurfaces(surfaces) {
  return Array.isArray(surfaces) && surfaces.length === LICENSE_SURFACES.length
    && surfaces.every((entry, index) => exactKeys(entry, ["path", "sha256"]) && entry.path === LICENSE_SURFACES[index] && HEX64.test(entry.sha256 ?? ""));
}

export function buildLicenseGateReceipt({ channel, candidate, surfaces, command, result }) {
  const errors = [];
  if (!["private", "neutral-public"].includes(channel)) errors.push("channel is invalid");
  if (!exactKeys(candidate, ["commit", "tree"]) || !HEX40.test(candidate?.commit ?? "") || !HEX40.test(candidate?.tree ?? "")) errors.push("candidate identity is invalid");
  if (!validLicenseSurfaces(surfaces)) errors.push("license surfaces are invalid");
  if (!Array.isArray(command) || command.join("\n") !== "node\nharness/scripts/check-license-contract.mjs") errors.push("command is invalid");
  if (!exactKeys(result, ["exitCode", "status"]) || result?.status !== "passed" || result?.exitCode !== 0) errors.push("license gate did not pass");
  if (errors.length) return { ok: false, errors, receipt: null, projection: null };
  const receipt = { schema: LICENSE_GATE_SCHEMA, channel, candidate, surfaces, command, result };
  const projectionPayload = { schema: LICENSE_GATE_PROJECTION_SCHEMA, channel, candidate, surfaceSetSha256: digest(surfaces), commandSha256: digest(command), gateCommitmentSha256: digest({ channel, candidate, surfaces: digest(surfaces), command: digest(command), result }), result };
  const projection = { ...projectionPayload, projectionSha256: digest(projectionPayload) };
  return { ok: true, errors: [], receipt, projection };
}

export function validateLicenseGateProjection(projection, { channel, candidate } = {}) {
  const errors = [];
  if (!exactKeys(projection, ["schema", "channel", "candidate", "surfaceSetSha256", "commandSha256", "gateCommitmentSha256", "result", "projectionSha256"]) || projection?.schema !== LICENSE_GATE_PROJECTION_SCHEMA || !["private", "neutral-public"].includes(projection?.channel)) errors.push("projection schema is invalid");
  if (!exactKeys(projection?.candidate, ["commit", "tree"]) || !HEX40.test(projection?.candidate?.commit ?? "") || !HEX40.test(projection?.candidate?.tree ?? "")) errors.push("projection candidate shape is invalid");
  if (!exactKeys(projection?.result, ["exitCode", "status"]) || projection?.result?.status !== "passed" || projection?.result?.exitCode !== 0) errors.push("projection result shape is invalid");
  if (projection?.channel !== channel || projection?.candidate?.commit !== candidate?.commit || projection?.candidate?.tree !== candidate?.tree) errors.push("projection candidate binding is invalid");
  for (const key of ["surfaceSetSha256", "commandSha256", "gateCommitmentSha256", "projectionSha256"]) if (!HEX64.test(projection?.[key] ?? "")) errors.push(`${key} is invalid`);
  if (projection?.projectionSha256 !== digest(Object.fromEntries(Object.entries(projection ?? {}).filter(([key]) => key !== "projectionSha256")))) errors.push("projection digest is invalid");
  if (JSON.stringify(projection).match(/(?:\/home\/|[A-Za-z]:\\|email|secret|token|private[-_ ]?key)/iu)) errors.push("projection leaks private material");
  return errors;
}

export function storePrivateLicenseGateReceipt({ gitCommonDir, receipt }) {
  if (receipt?.schema !== LICENSE_GATE_SCHEMA || receipt?.channel !== "private") throw new Error("private license-gate receipt is invalid");
  const sha256 = digest(receipt);
  const directory = ensurePrivateDirectory(join(resolve(gitCommonDir), "agent-pipeline", "private", "license-gates"));
  const path = join(directory, `${sha256}.json`);
  const bytes = `${stable(receipt)}\n`;
  if (existsSync(path)) { assertPrivateFile(path); if (readFileSync(path, "utf8") !== bytes) throw new Error("private license-gate receipt digest conflict"); return { status: "replay", path, rawReceiptSha256: sha256 }; }
  const temporary = join(directory, `.${sha256}.${randomBytes(12).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(temporary, path); } catch (error) { unlinkSync(temporary); if (error?.code === "EEXIST") return storePrivateLicenseGateReceipt({ gitCommonDir, receipt }); throw error; }
  unlinkSync(temporary); assertPrivateFile(path); fsyncDirectory(directory);
  return { status: "stored", path, rawReceiptSha256: sha256 };
}

export function buildSnt1Result({ licensingDisposition, privacyDisposition, candidates, gates, surfaces }) {
  const errors = [];
  if (!exactKeys(licensingDisposition, ["reviewer", "reviewedAt", "status", "dispositionSha256"]) || licensingDisposition?.status !== "approved" || typeof licensingDisposition?.reviewer !== "string" || licensingDisposition.reviewer.length === 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(licensingDisposition?.reviewedAt ?? "") || !HEX64.test(licensingDisposition?.dispositionSha256 ?? "")) errors.push("named-human licensing disposition is invalid");
  if (privacyDisposition === null || privacyDisposition?.status === "pending") errors.push("named-human privacy disposition is pending");
  else if (!exactKeys(privacyDisposition, ["reviewer", "reviewedAt", "status", "dispositionSha256"]) || privacyDisposition.status !== "approved" || typeof privacyDisposition.reviewer !== "string" || privacyDisposition.reviewer.length === 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(privacyDisposition.reviewedAt ?? "") || !HEX64.test(privacyDisposition.dispositionSha256 ?? "")) errors.push("named-human privacy disposition is invalid");
  if (!exactKeys(candidates, ["private", "neutral-public"])) errors.push("candidate set schema is invalid");
  if (!exactKeys(gates, ["private", "neutral-public"])) errors.push("gate set schema is invalid");
  for (const channel of ["private", "neutral-public"]) {
    if (!exactKeys(candidates?.[channel], ["commit", "tree"]) || !HEX40.test(candidates?.[channel]?.commit ?? "") || !HEX40.test(candidates?.[channel]?.tree ?? "")) errors.push(`${channel} candidate is invalid`);
    errors.push(...validateLicenseGateProjection(gates?.[channel], { channel, candidate: candidates?.[channel] }).map((error) => `${channel}: ${error}`));
  }
  if (!validLicenseSurfaces(surfaces) || digest(surfaces) !== gates?.private?.surfaceSetSha256 || digest(surfaces) !== gates?.["neutral-public"]?.surfaceSetSha256) errors.push("result license surfaces do not bind both gates");
  const payload = { schema: SNT1_RESULT_SCHEMA, licensingDisposition, privacyDisposition, candidates, gates, surfaces };
  const result = { ...payload, resultSha256: digest(payload) };
  return { ok: errors.length === 0, errors, result };
}

export function validateSnt1Result(result) {
  if (!exactKeys(result, ["schema", "licensingDisposition", "privacyDisposition", "candidates", "gates", "surfaces", "resultSha256"]) || result?.schema !== SNT1_RESULT_SCHEMA) return ["SNT-1 Result schema is invalid"];
  const rebuilt = buildSnt1Result(result);
  const errors = [...rebuilt.errors];
  if (result.resultSha256 !== rebuilt.result.resultSha256) errors.push("SNT-1 Result digest is invalid");
  return errors;
}

function sameValue(left, right) {
  return stable(left) === stable(right);
}

export function validateSnt1EvidenceRecords({ privacy, licensing, result }) {
  const errors = [];
  const expectedCandidate = SNT1_CANDIDATE;
  const expectedSurfaces = SNT1_LICENSE_SURFACES;
  if (!exactKeys(privacy, ["schema", "status", "reviewer", "reviewedAt", "candidate", "surfaceSetSha256", "actionsLogRetention", "approvalText"])
      || privacy?.schema !== SNT1_PRIVACY_DISPOSITION_SCHEMA
      || privacy?.status !== "approved"
      || privacy?.reviewer !== "André Twachtmann"
      || privacy?.reviewedAt !== "2026-07-23"
      || !exactKeys(privacy?.candidate, ["commit", "tree"])
      || !exactKeys(privacy?.actionsLogRetention, ["days", "maximumAllowedDays", "readBackAt"])) errors.push("privacy disposition schema is invalid");
  if (!sameValue(privacy?.candidate, expectedCandidate)) errors.push("privacy disposition candidate drift");
  if (privacy?.surfaceSetSha256 !== digest(expectedSurfaces)) errors.push("privacy disposition surface drift");
  if (privacy?.actionsLogRetention?.days !== 30 || privacy?.actionsLogRetention?.maximumAllowedDays !== 90 || privacy?.actionsLogRetention?.readBackAt !== "2026-07-23") errors.push("privacy disposition retention drift");
  if (privacy?.approvalText !== SNT1_PRIVACY_APPROVAL) errors.push("privacy disposition approval text is invalid");

  if (!exactKeys(licensing, ["schema", "status", "reviewer", "reviewedAt", "candidate", "surfaces", "licenseSemantics", "claSemantics", "authorityReference"])
      || licensing?.schema !== SNT1_LICENSING_DISPOSITION_SCHEMA
      || licensing?.status !== "approved"
      || licensing?.reviewer !== "André Twachtmann"
      || licensing?.reviewedAt !== "2026-07-23") errors.push("licensing disposition schema is invalid");
  if (!sameValue(licensing?.candidate, expectedCandidate)) errors.push("licensing disposition candidate drift");
  if (!sameValue(licensing?.surfaces, expectedSurfaces)) errors.push("licensing disposition surface drift");
  if (licensing?.licenseSemantics !== SNT1_LICENSING_SEMANTICS || licensing?.claSemantics !== SNT1_CLA_SEMANTICS
      || licensing?.authorityReference !== "backlog/evidence/2026-07-21-source-available-commercial-licensing.md") errors.push("licensing disposition semantics are invalid");

  errors.push(...validateSnt1Result(result));
  for (const channel of ["private", "neutral-public"]) {
    if (!sameValue(result?.candidates?.[channel], expectedCandidate)) errors.push(`${channel} Result candidate drift`);
    const expectedGate = buildLicenseGateReceipt({
      channel,
      candidate: expectedCandidate,
      surfaces: expectedSurfaces,
      command: ["node", "harness/scripts/check-license-contract.mjs"],
      result: { status: "passed", exitCode: 0 },
    }).projection;
    if (!sameValue(result?.gates?.[channel], expectedGate)) errors.push(`${channel} Result gate drift`);
  }
  if (!sameValue(result?.surfaces, expectedSurfaces)) errors.push("SNT-1 Result surface drift");
  const expectedLicensingSummary = { reviewer: licensing?.reviewer, reviewedAt: licensing?.reviewedAt, status: licensing?.status, dispositionSha256: digest(licensing) };
  const expectedPrivacySummary = { reviewer: privacy?.reviewer, reviewedAt: privacy?.reviewedAt, status: privacy?.status, dispositionSha256: digest(privacy) };
  if (!sameValue(result?.licensingDisposition, expectedLicensingSummary)) errors.push("SNT-1 Result licensing disposition digest binding is invalid");
  if (!sameValue(result?.privacyDisposition, expectedPrivacySummary)) errors.push("SNT-1 Result privacy disposition digest binding is invalid");
  if (JSON.stringify(result ?? {}).match(/(?:rawReceiptSha256|receiptSha256|privatePath|rawPrivate|\/home\/|[A-Za-z]:\\|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu)) errors.push("SNT-1 Result leaks raw private material");
  return [...new Set(errors)];
}

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
    ["separate Agent-Pipeline Additional Permission", /^Agent-Pipeline Additional Permission$/mu],
    ["unmodified canonical-base qualification", /supplements the unmodified\s+Sustainable Use License Version 1\.0 text above/u],
    ["permission-only scope", /additional permission expands only the permitted\s+internal-operation and independent-service uses/u],
    ["internal-operations delegation boundary", INTERNAL_OPERATIONS_DELEGATION],
    ["independent-services boundary", INDEPENDENT_SERVICES_BOUNDARY],
    ["closed monetization boundary", CLOSED_MONETIZATION_BOUNDARY],
  ]);
  if (/Apache License|SPDX identifier: Apache-2\.0/u.test(license)) findings.push("LICENSE mixes the current SUL-1.0 grant with Apache-2.0");

  requireText(root, "LICENSE-DOCS", findings, [["SUL-1.0 documentation grant", /same Sustainable Use License Version 1\.0/u], ["separate additional-permission qualification", /Agent-Pipeline Additional Permission.*SPDX\s+identifier and canonical URL name the unmodified base license/su], ["third-party exception", /unless a file states a different\s+third-party license/u], ["internal-operations delegation boundary", INTERNAL_OPERATIONS_DELEGATION], ["independent-services boundary", INDEPENDENT_SERVICES_BOUNDARY], ["closed monetization boundary", CLOSED_MONETIZATION_BOUNDARY]]);
  requireText(root, "NOTICE", findings, [["permitted internal commercial-company use", /internal commercial-company operations/u], ["own-purpose modification", /modifying a fork for your own purposes/u], ["separate additional-permission qualification", /with the repository-specific Agent-Pipeline Additional\s+Permission.*canonical URL identifies only the base SUL-1\.0 text/su], ["internal-operations delegation boundary", INTERNAL_OPERATIONS_DELEGATION], ["independent-services boundary", INDEPENDENT_SERVICES_BOUNDARY], ["closed monetization boundary", CLOSED_MONETIZATION_BOUNDARY], ["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the commercial\/CLA contracting party/u], ["third-party ownership exclusion", /excludes\s+third-party material identified in `third-party-licenses\.json`.*Contributor Covenant/su], ["dated named-human CLA activation", /On 2026-07-23, André Twachtmann,\s+acting as the named human\s+rightsholder reviewer, approved activation/u]]);
  requireText(root, "docs/licensing.md", findings, [["internal-operations delegation boundary", INTERNAL_OPERATIONS_DELEGATION], ["independent-services boundary", INDEPENDENT_SERVICES_BOUNDARY], ["closed monetization boundary", CLOSED_MONETIZATION_BOUNDARY], ["no-retroactive-change boundary", /does not purport to\s+change those grants retroactively/u], ["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the commercial\/CLA contracting party/u], ["third-party ownership exclusion", /Third-party material listed\s+in `third-party-licenses\.json`.*Contributor Covenant.*upstream ownership and license/su], ["dated named-human CLA activation", /On 2026-07-23, André\s+Twachtmann, acting as the named human\s+rightsholder reviewer, approved activation/u], ["owner-controlled provenance qualification", /100% owner-controlled/u], ["no proxy CLA acceptance", /maintainer, bot, or submission automation cannot accept/u], ["required contributor gate", /contributor-gates \/ cla-and-dco.*required status check/su], ["up-to-date branch protection", /require the PR\s+branch to be current with `main` before merge/u], ["honest receipt retention boundary", /no immutable long-term archive is asserted/u]]);
  requireText(root, "CONTRIBUTING.md", findings, [["internal-operations delegation boundary", INTERNAL_OPERATIONS_DELEGATION], ["independent-services boundary", INDEPENDENT_SERVICES_BOUNDARY], ["closed monetization boundary", CLOSED_MONETIZATION_BOUNDARY], ["project-authored legal rightsholder and contracting party", /André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\s+content and the CLA contracting party/u], ["third-party ownership exclusion", /Third-party material remains under the\s+ownership and license recorded in `third-party-licenses\.json`/u], ["active CLA approval", /2026-07-23.*approved activation of the CLA process/su], ["cumulative DCO and CLA merge gates", /both\s+its DCO sign-off and the Contributor's personally checked, current-version CLA\s+acceptance/u], ["no proxy acceptance", /maintainer, bot, or submission automation cannot\s+accept on the Contributor's behalf/u], ["required contributor gate", /contributor-gates \/ cla-and-dco.*status check/su], ["up-to-date branch protection", /pull-request\s+branch to be up to date with `main` before merge/u], ["server-side read-back boundary", /server-side read-back confirming them/u]]);
  requireText(root, "README.md", findings, [["English additional-permission qualification", /Sustainable Use License 1\.0 \(SUL-1\.0\) with the Agent-Pipeline Additional Permission/u], ["German additional-permission qualification", /Sustainable Use License 1\.0 \(SUL-1\.0\) mit der Agent-Pipeline Additional Permission/u]]);
  requireText(root, "docs/contributor-gate-security.md", findings, [["personal opened/edited acceptance transition", /on `opened`.*sender must be the PR author.*on `edited`.*sender must be the PR author/su], ["synchronize and reopened refresh boundary", /`synchronize` and `reopened` intentionally fail.*CLA_ACCEPTANCE_REFRESH_REQUIRED/su], ["trusted-base and untrusted-candidate threat boundary", /`trusted-gate`.*`candidate`.*GitHub `pull_request` event/su], ["credential-free and secret-free boundary", /disable persisted credentials.*consumes no secrets/su], ["receipt privacy minimization", /PR number, public account logins.*never writes an email address into the receipt/su], ["runner-temporary retention boundary", /runner-temporary storage.*not uploaded as an artifact/su], ["candidate-bound human privacy approval", /André Twachtmann.*genehmige den kandidatgebundenen Datenschutzreview.*f83803c\/9bdd679d.*30 Tage Actions-Log-Retention/su], ["retention read-back", /30 days.*maximum allowed value of 90 days.*2026-07-23/su], ["fail-closed rollback order", /Freeze merges.*Revert the bad checker.*authenticated server-side read-back.*Re-run the gate/su]]);
  requireText(root, "specs/2026-07-19-sprint-sentinel-epic/snt-1-activation-prerequisite.md", findings, [["exact HAW-E consumption without release approval", /prerequisite is complete.*HAW-E `externalPrerequisite` validation.*no HAW-E\s+activation, release consent, publication, or main-branch approval/su], ["implemented receipt/result path", /constructs closed-schema, candidate-bound.*constructs and validates the canonical SNT-1 Result digest/su], ["sanitized dual license-gate projections", /private.*neutral-public.*sanitized projection digests/su], ["no raw private publication", /raw private receipt.*not.*public/su], ["no fabricated ledger evidence", /append-only history remains truthful.*must not be edited.*invented values/su], ["completed evidence amendment", /Sequence 40.*`closed` → `closed` `evidence-amendment`/su], ["sanctioned evidence-amendment writer path", /applyBacklogEvidenceAmendment.*recoverable transaction writer/su], ["historical suffix preservation", /preserved every historical ledger byte before its single amendment\s+suffix/u], ["external prerequisite digest set", /`resultSha256`.*`transitionSha256`.*`privateLicenseGateSha256`.*`neutralPublicLicenseGateSha256`/su]]);

  try {
    const evidenceErrors = validateSnt1EvidenceRecords({
      privacy: readJson(repoPath(root, SNT1_EVIDENCE_PATHS.privacy)),
      licensing: readJson(repoPath(root, SNT1_EVIDENCE_PATHS.licensing)),
      result: readJson(repoPath(root, SNT1_EVIDENCE_PATHS.result)),
    });
    findings.push(...evidenceErrors.map((error) => `SNT-1 evidence: ${error}`));
  } catch (error) {
    findings.push(`SNT-1 evidence records are missing or invalid JSON: ${error.message}`);
  }

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
  const template = requireText(root, ".github/PULL_REQUEST_TEMPLATE.md", findings, [["active project-authored legal rightsholder", /identifies André Twachtmann as legal(?:\s|>)+rightsholder for Agent-Pipeline project-authored content and CLA contracting(?:\s|>)+party, excluding inventoried third-party material/u], ["no proxy acceptance", /maintainer, bot, or\s+submission automation must not check or rewrite it/u], ["stale-acceptance invalidation", /changing the CLA invalidates earlier acceptance/u], ["synchronize/reopened author refresh UX", /After every `synchronize` or `reopened` event.*author must\s+personally uncheck.*save.*re-check.*save.*Maintainers, bots.*cannot\s+perform that refresh/su]]);
  const expectedAcceptance = `- [ ] **CLA acceptance — Agent-Pipeline CLA v${CLA_VERSION} (SHA-256: \`${claDigest}\`) — I, @REPLACE_WITH_PR_AUTHOR_LOGIN, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**`;
  if (!template.split(/\r?\n/u).includes(expectedAcceptance)) findings.push(".github/PULL_REQUEST_TEMPLATE.md does not bind the exact current CLA version and SHA-256");

  requireText(root, ".github/workflows/contributor-gates.yml", findings, [["pull-request trigger", /^  pull_request:$/mu], ["main target", /^      - main$/mu], ["required PR lifecycle events", /types:\s+      - opened\s+      - reopened\s+      - synchronize\s+      - edited/su], ["minimal read permission", /permissions:\s+  contents: read/su], ["credential-free checkouts", /persist-credentials: false/su], ["trusted base checker", /node trusted-gate\/harness\/scripts\/check-pr-contributor-gates\.mjs/u], ["candidate content root binding", /--root candidate/u], ["trusted CLA root binding", /--cla-root trusted-gate/u]]);
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
