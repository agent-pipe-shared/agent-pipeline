#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, linkSync, mkdtempSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildLicenseGateReceipt, buildSnt1Result, licenseSurfaceDigests, SNT1_CANDIDATE, SNT1_CLA_SEMANTICS, SNT1_LICENSE_SURFACES, SNT1_LICENSING_SEMANTICS, SNT1_PRIVACY_APPROVAL, storePrivateLicenseGateReceipt, validateContinuingLicensePrivacyApproval, validateLicenseContract, validateLicenseGateProjection, validateLiveLicenseSurfaces, validateSnt1EvidenceRecords, validateSnt1Result } from "./check-license-contract.mjs";

const fixture = mkdtempSync(join(tmpdir(), "license-contract-"));
const write = (path, value) => { const absolute = join(fixture, ...path.split("/")); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, value); };
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(stable(value)).digest("hex");
const usageBoundary = "Affiliates, employees, contractors, and service providers may use the software solely on the licensee's internal operations. Independent consulting, training, and support are permitted when Agent-Pipeline is not itself monetized. sale; paid licensing or distribution; paid hosting, SaaS, or managed service; white-label use; material embedding as a value component of a paid product; or commercial redistribution.";
const licenseText = `Sustainable Use License Version 1.0\nSPDX identifier: SUL-1.0\nAgent-Pipeline Additional Permission\nThis permission supplements the unmodified\nSustainable Use License Version 1.0 text above. ${usageBoundary}\nThis additional permission expands only the permitted\ninternal-operation and independent-service uses.\n`;
const noticeText = `internal commercial-company operations; modifying a fork for your own purposes. This repository uses SUL-1.0 with the repository-specific Agent-Pipeline Additional\nPermission; the canonical URL identifies only the base SUL-1.0 text. ${usageBoundary} André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the commercial/CLA contracting party; excludes\nthird-party material identified in \`third-party-licenses.json\`, including Contributor Covenant. On 2026-07-23, André Twachtmann,\nacting as the named human\nrightsholder reviewer, approved activation\n`;
write("LICENSE", licenseText);
write("LICENSE-DOCS", `same Sustainable Use License Version 1.0 with the Agent-Pipeline Additional Permission; the SPDX\nidentifier and canonical URL name the unmodified base license unless a file states a different\nthird-party license. ${usageBoundary}\n`);
write("NOTICE", noticeText);
write("docs/licensing.md", `${usageBoundary} 100% owner-controlled; André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the commercial/CLA contracting party. Third-party material listed\nin \`third-party-licenses.json\`, including Contributor Covenant, remains under upstream ownership and license. On 2026-07-23, André\nTwachtmann, acting as the named human\nrightsholder reviewer, approved activation; maintainer, bot, or submission automation cannot accept; contributor-gates / cla-and-dco is a required status check and require the PR\nbranch to be current with \`main\` before merge; no immutable long-term archive is asserted; does not purport to\nchange those grants retroactively\n`);
write("CONTRIBUTING.md", `${usageBoundary} André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored\ncontent and the CLA contracting party. Third-party material remains under the\nownership and license recorded in \`third-party-licenses.json\`. 2026-07-23 named human reviewer approved activation of the CLA process. both\nits DCO sign-off and the Contributor's personally checked, current-version CLA\nacceptance. maintainer, bot, or submission automation cannot\naccept on the Contributor's behalf. contributor-gates / cla-and-dco is a status check; pull-request\nbranch to be up to date with \`main\` before merge; server-side read-back confirming them\n`);
write("README.md", "Sustainable Use License 1.0 (SUL-1.0) with the Agent-Pipeline Additional Permission\nSustainable Use License 1.0 (SUL-1.0) mit der Agent-Pipeline Additional Permission\n");
write("docs/contributor-gate-security.md", `on \`opened\` the sender must be the PR author; on \`edited\` the sender must be the PR author. \`synchronize\` and \`reopened\` intentionally fail with CLA_ACCEPTANCE_REFRESH_REQUIRED. \`trusted-gate\` and \`candidate\` are separate from the GitHub \`pull_request\` event. Both disable persisted credentials and the workflow consumes no secrets. The receipt contains PR number, public account logins and never writes an email address into the receipt. It uses runner-temporary storage and is not uploaded as an artifact. André Twachtmann: ${SNT1_PRIVACY_APPROVAL} Server read-back: 30 days, maximum allowed value of 90 days, 2026-07-23. Freeze merges. Revert the bad checker. perform an authenticated server-side read-back. Re-run the gate.\n`);
write("specs/2026-07-19-sprint-sentinel-epic/snt-1-activation-prerequisite.md", "the prerequisite is complete for exact HAW-E `externalPrerequisite` validation; no HAW-E\nactivation, release consent, publication, or main-branch approval. constructs closed-schema, candidate-bound receipts and constructs and validates the canonical SNT-1 Result digest. private and neutral-public sanitized projection digests. raw private receipt is not public. append-only history remains truthful and must not be edited or filled with invented values. Sequence 40 is a `closed` → `closed` `evidence-amendment`. applyBacklogEvidenceAmendment uses a recoverable transaction writer and preserved every historical ledger byte before its single amendment\nsuffix. `resultSha256`, `transitionSha256`, `privateLicenseGateSha256`, `neutralPublicLicenseGateSha256`.\n");
write("setup.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("setup.test.mjs", "#!/usr/bin/env node\n// SPDX-License-Identifier: SUL-1.0\n");
write("harness/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n");
write("plugins/pipeline-core/.claude-plugin/plugin.json", '{"license":"SUL-1.0"}\n'); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"SUL-1.0"}\n');
write("third-party-licenses.json", JSON.stringify({ dependencies: [{ name: "Contributor Covenant Code of Conduct", version: "2.1", license: "CC-BY-SA-4.0", path: "CODE_OF_CONDUCT.md", source: "https://www.contributor-covenant.org/version/2/1/code_of_conduct.html" }] }));
write("CODE_OF_CONDUCT.md", "<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->\nContributor Covenant version 2.1\nMozilla's code of conduct enforcement ladder\n");
const cla = "<!-- CLA-Version: 1.0 -->\ndoes not guarantee effectiveness\nAndré Twachtmann, the legal rightsholder for Agent-Pipeline project-authored\ncontent, the recipient of the Contributor's grants under this Agreement, and\nthe CLA contracting party\ndoes not claim rights in third-party material identified in\n`third-party-licenses.json`\nOn 2026-07-23, André Twachtmann, acting as the\nnamed human rightsholder reviewer, approved activation\ngrant of rights\nof use (`Nutzungsrechte`)\nexclusive, worldwide, may transfer and sublicense\nSUL-1.0 and separate commercial\nlegally required\nseparate declaration, form\nboth the DCO sign-off and the Contributor's\npersonally checked, current-version CLA record\n";
write("CONTRIBUTOR_LICENSE_AGREEMENT.md", cla);
const claDigest = createHash("sha256").update(cla, "utf8").digest("hex");
write(".github/PULL_REQUEST_TEMPLATE.md", `identifies André Twachtmann as legal\nrightsholder for Agent-Pipeline project-authored content and CLA contracting\nparty, excluding inventoried third-party material\n- [ ] **CLA acceptance — Agent-Pipeline CLA v1.0 (SHA-256: \`${claDigest}\`) — I, @REPLACE_WITH_PR_AUTHOR_LOGIN, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**\nchanging the CLA invalidates earlier acceptance\nmaintainer, bot, or\nsubmission automation must not check or rewrite it\nAfter every \`synchronize\` or \`reopened\` event, the author must\npersonally uncheck and save, then re-check and save. Maintainers, bots cannot\nperform that refresh\n`);
write(".github/workflows/contributor-gates.yml", "on:\n  pull_request:\n    branches:\n      - main\n    types:\n      - opened\n      - reopened\n      - synchronize\n      - edited\npermissions:\n  contents: read\npersist-credentials: false\nnode trusted-gate/harness/scripts/check-pr-contributor-gates.mjs\n--root candidate\n--cla-root trusted-gate\n");

const evidenceCandidate = structuredClone(SNT1_CANDIDATE);
const evidenceSurfaces = structuredClone(SNT1_LICENSE_SURFACES);
const privacyRecord = {
  schema: "pipeline.snt1-privacy-disposition.v1", status: "approved", reviewer: "André Twachtmann", reviewedAt: "2026-07-24",
  candidate: evidenceCandidate, surfaceSetSha256: digest(evidenceSurfaces),
  actionsLogRetention: { days: 30, maximumAllowedDays: 90, readBackAt: "2026-07-24" }, approvalText: SNT1_PRIVACY_APPROVAL,
};
const licensingRecord = {
  schema: "pipeline.snt1-licensing-disposition.v1", status: "approved", reviewer: "André Twachtmann", reviewedAt: "2026-07-24",
  candidate: evidenceCandidate, surfaces: evidenceSurfaces, licenseSemantics: SNT1_LICENSING_SEMANTICS, claSemantics: SNT1_CLA_SEMANTICS,
  authorityReference: "backlog/evidence/2026-07-21-source-available-commercial-licensing.md",
};
const evidenceGates = Object.fromEntries(["private", "neutral-public"].map((channel) => [channel, buildLicenseGateReceipt({
  channel, candidate: evidenceCandidate, surfaces: evidenceSurfaces,
  command: ["node", "harness/scripts/check-license-contract.mjs"], result: { status: "passed", exitCode: 0 },
}).projection]));
const evidenceResult = buildSnt1Result({
  licensingDisposition: { reviewer: licensingRecord.reviewer, reviewedAt: licensingRecord.reviewedAt, status: licensingRecord.status, dispositionSha256: digest(licensingRecord) },
  privacyDisposition: { reviewer: privacyRecord.reviewer, reviewedAt: privacyRecord.reviewedAt, status: privacyRecord.status, dispositionSha256: digest(privacyRecord) },
  candidates: { private: evidenceCandidate, "neutral-public": evidenceCandidate }, gates: evidenceGates, surfaces: evidenceSurfaces,
}).result;
write("backlog/evidence/2026-07-23-snt-1-privacy-disposition.json", `${JSON.stringify(privacyRecord, null, 2)}\n`);
write("backlog/evidence/2026-07-23-snt-1-licensing-disposition.json", `${JSON.stringify(licensingRecord, null, 2)}\n`);
write("backlog/evidence/2026-07-23-snt-1-activation-result.json", `${JSON.stringify(evidenceResult, null, 2)}\n`);
const continuingApproval = {
  schema: "pipeline.snt1-continuing-license-privacy-approval.v1", status: "approved", reviewer: "André Twachtmann", grantedAt: "2026-07-24",
  scope: ["license", "commercial-boundary", "cla", "dco", "privacy", "actions-log-retention"], actionsLogRetention: { days: 30, maximumAllowedDays: 90 },
  renewalTriggers: ["material-license-semantic-change", "new-third-party-code-or-text", "new-personal-data-flow-or-storage", "actions-log-retention-over-90-days"],
  revocation: { mode: "po-revocable", effective: "immediate" },
};
write("backlog/evidence/2026-07-24-snt-1-continuing-license-privacy-approval.json", `${JSON.stringify(continuingApproval, null, 2)}\n`);

let result = validateLicenseContract(fixture); assert.equal(result.ok, true, result.findings.join("\n")); assert.equal(result.sourceCount, 4);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: Apache-2.0\n"); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /example\.mjs lacks an SPDX SUL-1\.0 header|retains a current Apache-2\.0/);
write("plugins/pipeline-core/example.mjs", "// SPDX-License-Identifier: SUL-1.0\n"); write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"Apache-2.0"}\n'); result = validateLicenseContract(fixture); assert.equal(result.ok, false); assert.match(result.findings.join("\n"), /codex-plugin\/plugin\.json license must be SUL-1\.0/);
write("plugins/pipeline-core/.codex-plugin/plugin.json", '{"license":"SUL-1.0"}\n');
write("NOTICE", "André Twachtmann is not identified as the contracting party\n");
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /NOTICE lacks project-authored legal rightsholder and contracting party/);
write("NOTICE", noticeText);
write("LICENSE", licenseText.replace("Agent-Pipeline Additional Permission", "Unlabelled permission"));
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /LICENSE lacks separate Agent-Pipeline Additional Permission/);
write("LICENSE", licenseText.replace("contractors, and service providers", "contractors"));
result = validateLicenseContract(fixture);
assert.equal(result.ok, false);
assert.match(result.findings.join("\n"), /LICENSE lacks internal-operations delegation boundary/);
write("LICENSE", licenseText);

const surfaces = licenseSurfaceDigests(fixture);
const candidates = { private: { commit: "a".repeat(40), tree: "b".repeat(40) }, "neutral-public": { commit: "c".repeat(40), tree: "d".repeat(40) } };
const gate = (channel) => buildLicenseGateReceipt({ channel, candidate: candidates[channel], surfaces, command: ["node", "harness/scripts/check-license-contract.mjs"], result: { status: "passed", exitCode: 0 } });
const privateGate = gate("private");
const publicGate = gate("neutral-public");
assert.equal(privateGate.ok, true, privateGate.errors.join("\n"));
assert.equal(publicGate.ok, true, publicGate.errors.join("\n"));
assert.deepEqual(validateLicenseGateProjection(publicGate.projection, { channel: "neutral-public", candidate: candidates["neutral-public"] }), []);
assert.equal(JSON.stringify(publicGate.projection).includes("LICENSE"), false);
assert.equal(Object.hasOwn(publicGate.projection, "receiptSha256"), false);

const common = mkdtempSync(join(tmpdir(), "license-gate-common-"));
const stored = storePrivateLicenseGateReceipt({ gitCommonDir: common, receipt: privateGate.receipt });
assert.equal(statSync(stored.path).mode & 0o777, 0o600);
assert.equal(JSON.parse(readFileSync(stored.path, "utf8")).channel, "private");
assert.equal(storePrivateLicenseGateReceipt({ gitCommonDir: common, receipt: privateGate.receipt }).status, "replay");
const conflictCommon = mkdtempSync(join(tmpdir(), "license-gate-conflict-"));
const conflict = storePrivateLicenseGateReceipt({ gitCommonDir: conflictCommon, receipt: privateGate.receipt });
writeFileSync(conflict.path, "{}\n", "utf8");
assert.throws(() => storePrivateLicenseGateReceipt({ gitCommonDir: conflictCommon, receipt: privateGate.receipt }), /digest conflict/);
linkSync(stored.path, `${stored.path}.alias`);
assert.throws(() => storePrivateLicenseGateReceipt({ gitCommonDir: common, receipt: privateGate.receipt }), /single-link/);
if (process.platform !== "win32") {
  const permissiveCommon = mkdtempSync(join(tmpdir(), "license-gate-permissive-"));
  mkdirSync(join(permissiveCommon, "agent-pipeline"), { mode: 0o755 });
  assert.throws(() => storePrivateLicenseGateReceipt({ gitCommonDir: permissiveCommon, receipt: privateGate.receipt }), /owner-only/);
  const linkedCommon = mkdtempSync(join(tmpdir(), "license-gate-linked-"));
  const linkedTarget = mkdtempSync(join(tmpdir(), "license-gate-target-"));
  symlinkSync(linkedTarget, join(linkedCommon, "agent-pipeline"), "dir");
  assert.throws(() => storePrivateLicenseGateReceipt({ gitCommonDir: linkedCommon, receipt: privateGate.receipt }), /physical/);
}

const disposition = { reviewer: "named-human", reviewedAt: "2026-07-23", status: "approved", dispositionSha256: "e".repeat(64) };
const pending = buildSnt1Result({ licensingDisposition: disposition, privacyDisposition: null, candidates, gates: { private: privateGate.projection, "neutral-public": publicGate.projection }, surfaces });
assert.equal(pending.ok, false);
assert.match(pending.errors.join("\n"), /privacy disposition is pending/);
const ready = buildSnt1Result({ licensingDisposition: disposition, privacyDisposition: { ...disposition, dispositionSha256: "f".repeat(64) }, candidates, gates: { private: privateGate.projection, "neutral-public": publicGate.projection }, surfaces });
assert.equal(ready.ok, true, ready.errors.join("\n"));
assert.match(ready.result.resultSha256, /^[a-f0-9]{64}$/u);
assert.deepEqual(validateSnt1Result(ready.result), []);
assert.match(validateSnt1Result({ ...ready.result, resultSha256: "0".repeat(64) }).join("\n"), /digest is invalid/);

const replayed = structuredClone(publicGate.projection);
replayed.candidate.commit = "f".repeat(40);
assert.match(validateLicenseGateProjection(replayed, { channel: "neutral-public", candidate: candidates["neutral-public"] }).join("\n"), /candidate binding/);
const leaked = { ...publicGate.projection, privatePath: "/home/private/license.json" };
assert.match(validateLicenseGateProjection(leaked, { channel: "neutral-public", candidate: candidates["neutral-public"] }).join("\n"), /schema is invalid|leaks private material/);
const openNested = { ...publicGate.projection, result: { ...publicGate.projection.result, extra: true } };
assert.match(validateLicenseGateProjection(openNested, { channel: "neutral-public", candidate: candidates["neutral-public"] }).join("\n"), /result shape|projection digest/);
assert.equal(buildLicenseGateReceipt({ channel: "private", candidate: candidates.private, surfaces: [{ ...surfaces[0], sha256: "0".repeat(64) }, ...surfaces.slice(1)], command: ["node", "harness/scripts/check-license-contract.mjs"], result: { status: "failed", exitCode: 1 } }).ok, false);

const approvedSurfaceFixture = mkdtempSync(join(tmpdir(), "license-approved-surfaces-"));
for (const path of SNT1_LICENSE_SURFACES.map(({ path: surfacePath }) => surfacePath)) {
  const target = join(approvedSurfaceFixture, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(process.cwd(), path), target);
}
const approvedCurrentSurfaces = licenseSurfaceDigests(approvedSurfaceFixture);
assert.deepEqual(validateLiveLicenseSurfaces(approvedSurfaceFixture, approvedCurrentSurfaces), []);
writeFileSync(join(approvedSurfaceFixture, "README.md"), "drift");
assert.match(validateLiveLicenseSurfaces(approvedSurfaceFixture, approvedCurrentSurfaces).join("\n"), /drift from the approved SNT-1 digest set/);

assert.deepEqual(validateSnt1EvidenceRecords({ privacy: privacyRecord, licensing: licensingRecord, result: evidenceResult }), []);
assert.deepEqual(validateContinuingLicensePrivacyApproval(continuingApproval), []);
assert.match(validateContinuingLicensePrivacyApproval({ ...continuingApproval, status: "revoked" }).join("\n"), /invalid or revoked/);
const privacyTamper = structuredClone(privacyRecord); privacyTamper.approvalText += " tampered";
assert.match(validateSnt1EvidenceRecords({ privacy: privacyTamper, licensing: licensingRecord, result: evidenceResult }).join("\n"), /approval text|privacy disposition digest binding/);
const extraKey = structuredClone(licensingRecord); extraKey.extra = true;
assert.match(validateSnt1EvidenceRecords({ privacy: privacyRecord, licensing: extraKey, result: evidenceResult }).join("\n"), /licensing disposition schema/);
const candidateDrift = structuredClone(evidenceResult); candidateDrift.candidates.private.commit = "0".repeat(40);
assert.match(validateSnt1EvidenceRecords({ privacy: privacyRecord, licensing: licensingRecord, result: candidateDrift }).join("\n"), /candidate drift|candidate binding/);
const surfaceDrift = structuredClone(licensingRecord); surfaceDrift.surfaces[0].sha256 = "0".repeat(64);
assert.match(validateSnt1EvidenceRecords({ privacy: privacyRecord, licensing: surfaceDrift, result: evidenceResult }).join("\n"), /surface drift/);
const retentionDrift = structuredClone(privacyRecord); retentionDrift.actionsLogRetention.days = 31;
assert.match(validateSnt1EvidenceRecords({ privacy: retentionDrift, licensing: licensingRecord, result: evidenceResult }).join("\n"), /retention drift/);
const privateLeak = structuredClone(evidenceResult); privateLeak.gates.private.privatePath = "/home/private/receipt.json";
assert.match(validateSnt1EvidenceRecords({ privacy: privacyRecord, licensing: licensingRecord, result: privateLeak }).join("\n"), /leaks raw private material/);
console.log("1..19\n# pass 19");
