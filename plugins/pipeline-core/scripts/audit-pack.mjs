#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Project-scoped, local audit-pack planner and create-only builder. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalSha256, canonicalizeJson, parseStrictJson } from "../lib/governance-event.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { createPoApprovalIntent, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { verifyQualityPackageIntegrationPostCommit } from "../lib/signed-quality-package.mjs";
import { parseIntegrationTrailerBlock } from "../lib/commit-message-policy.mjs";
import { readBoundConsumedCriticReceipt } from "../lib/critic-verify-lifecycle.mjs";
import { verifyEvidenceSatisfiesBoundary } from "../lib/verify-selection.mjs";

export const AUDIT_PACK_SCHEMA = "pipeline.audit-pack.v1";
export const AUDIT_PACK_PLAN_SCHEMA = "pipeline.audit-pack-plan.v1";
const SAFE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PACKET = /^[a-f0-9]{32}$/u;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_CRITIC_PACKETS = 16;
const MAX_APPROVAL_PAIRS = 16;
const MAX_COMMITS = 128;

function fail(code, message = "Audit pack operation is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function git(root, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 2 * 1024 * 1024, timeout: 5000, shell: false });
  if (result.error || result.status !== 0) fail("AP-GIT", `Git ${args[0]} could not establish the candidate.`);
  return result.stdout;
}
function gitCandidate(root) {
  const commit = String(git(root, ["rev-parse", "HEAD"])).trim();
  const tree = String(git(root, ["rev-parse", "HEAD^{tree}"])).trim();
  if (!OID.test(commit) || !OID.test(tree)) fail("AP-CANDIDATE");
  return { commit, tree };
}
function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && !isAbsolute(value) && !/[\\:\0-\x1f]/u.test(value)
    && !value.split("/").some((part) => part === "" || part === "." || part === "..");
}
function physicalFile(root, path) {
  if (!safeRelative(path)) fail("AP-PATH");
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("AP-PATH");
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail("AP-PATH-SYMLINK");
    if (cursor !== absolute && !stat.isDirectory()) fail("AP-PATH-PARENT");
    if (cursor === absolute && (!stat.isFile() || stat.size > MAX_SOURCE_BYTES)) fail("AP-SOURCE-SHAPE");
  }
  if (realpathSync(absolute) !== absolute) fail("AP-PATH-ALIAS");
  return absolute;
}
function sourceBytes(root, path, candidateCommit = null) {
  const absolute = physicalFile(root, path);
  const bytes = readFileSync(absolute);
  if (candidateCommit !== null) {
    const committed = git(root, ["show", `${candidateCommit}:${path}`], null);
    if (!Buffer.isBuffer(committed) || digest(committed) !== digest(bytes)) fail("AP-CANDIDATE-SOURCE-DRIFT");
  }
  return bytes;
}
function safeOutput(root, outputPath, packId) {
  if (outputPath !== `scratch/audit-packs/${packId}`) fail("AP-OUTPUT-SCOPE");
  const absolute = resolve(root, outputPath);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("AP-OUTPUT-SCOPE");
  for (const part of ["scratch", "audit-packs"]) {
    const current = resolve(root, part === "scratch" ? "scratch" : "scratch/audit-packs");
    try { const st = lstatSync(current); if (!st.isDirectory() || st.isSymbolicLink()) fail("AP-OUTPUT-PARENT"); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "--quiet", outputPath], { encoding: "utf8", timeout: 3000, shell: false });
  if (ignored.error || ignored.status !== 0) fail("AP-OUTPUT-NOT-IGNORED");
  if (existsSync(absolute)) fail("AP-OUTPUT-EXISTS");
  return absolute;
}
function candidatePackage(root, manifestPath) {
  const manifestBytes = sourceBytes(root, manifestPath);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok || !checked.receipt?.candidate || !checked.receipt?.featureId) fail("AP-FEATURE-PACKAGE");
  const candidate = gitCandidate(root);
  if (candidate.commit !== checked.receipt.candidate.commit || candidate.tree !== checked.receipt.candidate.tree) fail("AP-CANDIDATE-DRIFT");
  const manifest = parseStrictJson(manifestBytes);
  if (manifest.state !== "completed") fail("AP-PACKAGE-NOT-COMPLETED");
  const sources = [{ kind: "feature-package-manifest", path: manifestPath, sha256: digest(manifestBytes), candidateBound: false }];
  let total = manifestBytes.length;
  for (const artifact of manifest.artifacts) {
    const bytes = sourceBytes(root, artifact.path, candidate.commit);
    if (digest(bytes) !== artifact.sha256) fail("AP-ARTIFACT-DIGEST");
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) fail("AP-SOURCE-BUDGET");
    sources.push({ kind: artifact.class, path: artifact.path, sha256: artifact.sha256, candidateBound: true });
  }
  return { manifest, candidate, sources, totalBytes: total, featureId: manifest.feature.id };
}
function publicEvidencePath(featureId, path) {
  return path.startsWith("evidence/") || path.startsWith(`specs/${featureId}/evidence/`);
}
function approvals(root, featureId, pairs, candidate) {
  if (!Array.isArray(pairs) || pairs.length > MAX_APPROVAL_PAIRS) fail("AP-APPROVAL-INPUT");
  if (pairs.length === 0) return { verified: [], sources: [], sourceBytes: 0, missing: ["public-approval-proof-not-referenced"] };
  const policy = readCriticalHumanProofPolicy(root);
  if (!policy?.ok || !Array.isArray(policy.trustAnchors)) fail("AP-APPROVAL-POLICY");
  const verified = []; const sources = []; let totalBytes = 0;
  for (const pair of pairs) {
    if (!exact(pair, ["intentPath", "proofPath"]) || !publicEvidencePath(featureId, pair.intentPath) || !publicEvidencePath(featureId, pair.proofPath)) fail("AP-APPROVAL-PATH");
    const intentBytes = sourceBytes(root, pair.intentPath);
    const proofBytes = sourceBytes(root, pair.proofPath);
    totalBytes += intentBytes.length + proofBytes.length;
    const intentRecord = parseStrictJson(intentBytes);
    const proof = parseStrictJson(proofBytes);
    const intent = exact(intentRecord, ["value", "sha256"]) ? intentRecord : null;
    if (!intent || !SHA.test(intent.sha256 ?? "") || !exact(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"])) fail("AP-APPROVAL-MALFORMED");
    let expectedIntent;
    try { expectedIntent = createPoApprovalIntent(intent.value); } catch { fail("AP-APPROVAL-MALFORMED"); }
    if (canonicalizeJson(expectedIntent) !== canonicalizeJson(intent)
      || intent.value.featureId !== featureId
      || intent.value.candidate.commit !== candidate.commit
      || intent.value.candidate.tree !== candidate.tree) fail("AP-APPROVAL-BINDING");
    const trustPolicy = policy.trustAnchors.find((entry) => entry.keyReference === proof.keyReference);
    const check = trustPolicy ? verifyPoApprovalProof({ intent, proof, trustPolicy }) : { verified: false };
    if (check.verified !== true) fail("AP-APPROVAL-INVALID");
    const intentSha256 = intent.sha256;
    verified.push({ kind: "po-approval", intentPath: pair.intentPath, intentSha256, intentSha256Digest: digest(intentBytes), proofPath: pair.proofPath, proofSha256: digest(proofBytes), verification: "canonical-po-approval-proof-verified" });
    sources.push({ kind: "public-approval-intent", path: pair.intentPath, sha256: digest(intentBytes), candidateBound: false });
    sources.push({ kind: "public-approval-proof", path: pair.proofPath, sha256: digest(proofBytes), candidateBound: false });
  }
  return { verified, sources, sourceBytes: totalBytes, missing: [] };
}
function qualityPackageIntegrations(root, candidate) {
  const log = String(git(root, ["log", `-n${MAX_COMMITS}`, "--format=%H%x00%B%x00", candidate.commit]));
  const fields = log.split("\0"); const found = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const commit = fields[index].trim(); const message = fields[index + 1] ?? "";
    if (!OID.test(commit)) continue;
    const trailer = parseIntegrationTrailerBlock(message);
    if (!trailer.ok) continue;
    const checked = verifyQualityPackageIntegrationPostCommit({ repoRoot: root, commitSha: commit, intentSha256: trailer.intentSha256 });
    if (!checked.ok) fail("AP-QUALITY-INTEGRATION-INVALID");
    found.push({ commit, intentSha256: trailer.intentSha256, verification: "canonical-quality-package-postcommit-verified" });
  }
  return found;
}
function critics(root, candidate, packetIds) {
  if (!Array.isArray(packetIds) || packetIds.length > MAX_CRITIC_PACKETS || packetIds.some((id) => !PACKET.test(id))) fail("AP-CRITIC-INPUT");
  if (packetIds.length === 0) return { verified: [], missing: ["fresh-critic-report-not-referenced"] };
  const gitCommonDir = String(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
  const verified = [];
  for (const packetId of [...new Set(packetIds)]) {
    const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId: packetId, candidate });
    verified.push({ kind: "consumed-session-critic", packetId, candidate: { ...candidate }, reviewRange: bound.critic.reviewRange, reviewPass: bound.critic.reviewPass, receiptSha256: bound.criticReceiptSha256, verdictSha256: bound.critic.verdictSha256, findingCount: bound.critic.findingCount, assurance: bound.critic.assurance, verification: "canonical-consumed-critic-receipt-verified" });
  }
  return { verified, missing: [] };
}
function sourceKindCounts(sources) {
  return Object.fromEntries([...new Set(sources.map((source) => source.kind))].sort().map((kind) => [kind, sources.filter((source) => source.kind === kind).length]));
}

function verifyEvidence(root, featureId, candidate, path) {
  if (path === null) return { verified: null, sources: [], missing: ["candidate-verify-evidence-not-referenced"] };
  if (!publicEvidencePath(featureId, path)) fail("AP-VERIFY-EVIDENCE-PATH");
  const bytes = sourceBytes(root, path);
  const value = parseStrictJson(bytes);
  if (value.schema !== "pipeline.verify-evidence.v0" || value.exitCode !== 0
    || value.commit !== candidate.commit || value.tree !== candidate.tree
    || value.candidate?.commit !== candidate.commit || value.candidate?.tree !== candidate.tree
    || verifyEvidenceSatisfiesBoundary(value, "candidate") !== true) fail("AP-VERIFY-EVIDENCE-INVALID");
  return {
    verified: { path, sha256: digest(bytes), verification: "canonical-candidate-verify-selection-verified" },
    sources: [{ kind: "verify-evidence", path, sha256: digest(bytes), candidateBound: false }],
    missing: [],
  };
}

export function planAuditPack({ repositoryRoot, manifestPath, packId, outputPath, criticPacketIds = [], approvalPairs = [], verifyEvidencePath = null } = {}) {
  const root = realpathSync(resolve(repositoryRoot ?? ""));
  if (!SAFE_ID.test(packId ?? "")) fail("AP-PACK-ID");
  safeOutput(root, outputPath, packId);
  const pkg = candidatePackage(root, manifestPath);
  const approval = approvals(root, pkg.featureId, approvalPairs, pkg.candidate);
  const critic = critics(root, pkg.candidate, criticPacketIds);
  const verify = verifyEvidence(root, pkg.featureId, pkg.candidate, verifyEvidencePath);
  const qualityIntegrations = qualityPackageIntegrations(root, pkg.candidate);
  if (pkg.totalBytes + approval.sourceBytes + verify.sources.reduce((sum, source) => sum + sourceBytes(root, source.path, pkg.candidate.commit).length, 0) > MAX_TOTAL_BYTES) fail("AP-SOURCE-BUDGET");
  const sources = [...pkg.sources, ...approval.sources, ...verify.sources];
  const scanSources = sources.filter((entry) => entry.kind === "supply-chain" || /scan/iu.test(basename(entry.path)));
  const missingEvidence = [...approval.missing, ...critic.missing, ...verify.missing];
  if (scanSources.length === 0) missingEvidence.push("candidate-bound-scan-artifact-not-present");
  const status = missingEvidence.length === 0 ? "complete" : "partial";
  const manifest = {
    schema: AUDIT_PACK_SCHEMA,
    packId,
    status,
    candidate: pkg.candidate,
    featureId: pkg.featureId,
    featurePackage: { path: manifestPath, sha256: pkg.sources[0].sha256, state: pkg.manifest.state },
    sources,
    sourceKindCounts: sourceKindCounts(sources),
    scanSources: scanSources.map((entry) => ({ path: entry.path, sha256: entry.sha256, binding: "candidate-feature-package-digest" })),
    approvals: approval.verified,
    verifyEvidence: verify.verified,
    criticReports: critic.verified,
    qualityPackageIntegrations: qualityIntegrations,
    missingEvidence,
    outputPath,
    privacyOmissions: ["private keys", "operator profiles", "environment variables", "raw private Critic packet and report prose", "local quality-package authorization receipts"]
  };
  return { schema: AUDIT_PACK_PLAN_SCHEMA, status: "preview", pack: manifest, packSha256: canonicalSha256(manifest) };
}

function planShape(plan) {
  return exact(plan, ["schema", "status", "pack", "packSha256"]) && plan.schema === AUDIT_PACK_PLAN_SCHEMA
    && plan.status === "preview" && exact(plan.pack, ["schema", "packId", "status", "candidate", "featureId", "featurePackage", "sources", "sourceKindCounts", "scanSources", "approvals", "verifyEvidence", "criticReports", "qualityPackageIntegrations", "missingEvidence", "outputPath", "privacyOmissions"])
    && plan.pack.schema === AUDIT_PACK_SCHEMA && SAFE_ID.test(plan.pack.packId ?? "") && ["complete", "partial"].includes(plan.pack.status)
    && OID.test(plan.pack.candidate?.commit ?? "") && OID.test(plan.pack.candidate?.tree ?? "")
    && SHA.test(plan.packSha256 ?? "") && canonicalSha256(plan.pack) === plan.packSha256;
}
function README(pack) {
  const sources = pack.sources.map((entry) => `- ${entry.path} (${entry.kind}, SHA-256 ${entry.sha256})`).join("\n");
  const missing = pack.missingEvidence.length ? pack.missingEvidence.map((entry) => `- ${entry}`).join("\n") : "- None recorded by the pack planner.";
  return `# Local audit pack: ${pack.packId}\n\nStatus: **${pack.status}**. Candidate: ${pack.candidate.commit} (tree ${pack.candidate.tree}).\n\n## Included candidate sources\n\n${sources}\n\n## Missing evidence\n\n${missing}\n\n## Privacy omissions\n\n${pack.privacyOmissions.map((entry) => `- ${entry}`).join("\n")}\n\nThis local pack is a review aid, not a release approval, compliance certificate, publication, or proof of external retention. Canonical verifiers were used for any included public PO proof, consumed Critic receipt, and signed quality-package integration. Pack verification checks internal digests only; it does not re-evaluate authority or freshness.\n`;
}

export function buildAuditPack({ repositoryRoot, plan } = {}) {
  if (!planShape(plan)) fail("AP-PLAN");
  const root = realpathSync(resolve(repositoryRoot ?? ""));
  const fresh = planAuditPack({
    repositoryRoot: root,
    manifestPath: plan.pack.featurePackage.path,
    packId: plan.pack.packId,
    outputPath: plan.pack.outputPath,
    criticPacketIds: plan.pack.criticReports.map((item) => item.packetId),
    approvalPairs: plan.pack.approvals.map((item) => ({ intentPath: item.intentPath, proofPath: item.proofPath })),
    verifyEvidencePath: plan.pack.verifyEvidence?.path ?? null,
  });
  if (canonicalizeJson(fresh.pack) !== canonicalizeJson(plan.pack) || fresh.packSha256 !== plan.packSha256) fail("AP-PLAN-DRIFT");
  const output = safeOutput(root, plan.pack.outputPath, plan.pack.packId);
  const current = gitCandidate(root);
  if (current.commit !== plan.pack.candidate.commit || current.tree !== plan.pack.candidate.tree) fail("AP-CANDIDATE-DRIFT");
  const content = [];
  let total = 0;
  for (const [index, source] of plan.pack.sources.entries()) {
    const bytes = sourceBytes(root, source.path, source.candidateBound ? current.commit : null);
    if (digest(bytes) !== source.sha256) fail("AP-SOURCE-DIGEST");
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) fail("AP-SOURCE-BUDGET");
    const ext = basename(source.path).replace(/[^a-z0-9.-]/giu, "_").slice(-40) || "artifact";
    content.push({ source, path: `artifacts/${String(index + 1).padStart(3, "0")}-${ext}`, bytes });
  }
  mkdirSync(join(root, "scratch", "audit-packs"), { recursive: true });
  for (const parent of [join(root, "scratch"), join(root, "scratch", "audit-packs")]) {
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(parent) !== parent) fail("AP-OUTPUT-PARENT");
  }
  mkdirSync(output, { recursive: false });
  mkdirSync(join(output, "artifacts"), { recursive: false });
  const artifacts = [];
  for (const item of content) {
    writeFileSync(join(output, item.path), item.bytes, { flag: "wx", mode: 0o644 });
    artifacts.push({ path: item.path, sourcePath: item.source.path, kind: item.source.kind, sha256: digest(item.bytes) });
  }
  const readmeBytes = Buffer.from(README(plan.pack), "utf8");
  const manifest = { schema: "pipeline.audit-pack-manifest.v1", pack: plan.pack, artifacts, readmeSha256: digest(readmeBytes) };
  const manifestBytes = Buffer.from(`${canonicalizeJson(manifest)}\n`, "utf8");
  writeFileSync(join(output, "manifest.json"), manifestBytes, { flag: "wx", mode: 0o644 });
  writeFileSync(join(output, "README.md"), readmeBytes, { flag: "wx", mode: 0o644 });
  return { schema: "pipeline.audit-pack-build-receipt.v1", status: plan.pack.status, packId: plan.pack.packId, outputPath: plan.pack.outputPath, manifestSha256: digest(manifestBytes), artifactCount: artifacts.length, missingEvidence: plan.pack.missingEvidence };
}

export function verifyAuditPack({ repositoryRoot, packPath } = {}) {
  const root = realpathSync(resolve(repositoryRoot ?? ""));
  if (typeof packPath !== "string" || !packPath.startsWith("scratch/audit-packs/")) fail("AP-VERIFY-PATH");
  const packRoot = resolve(root, packPath); const rel = relative(root, packRoot);
  if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("AP-VERIFY-PATH");
  const findings = [];
  let manifest;
  try { manifest = parseStrictJson(readFileSync(join(packRoot, "manifest.json"))); }
  catch { return { schema: "pipeline.audit-pack-verification.v1", status: "invalid", findings: ["AP-MANIFEST"] }; }
  if (!exact(manifest, ["schema", "pack", "artifacts", "readmeSha256"]) || manifest.schema !== "pipeline.audit-pack-manifest.v1" || !planShape({ schema: AUDIT_PACK_PLAN_SCHEMA, status: "preview", pack: manifest.pack, packSha256: canonicalSha256(manifest.pack) }) || !Array.isArray(manifest.artifacts) || !SHA.test(manifest.readmeSha256 ?? "")) findings.push("AP-MANIFEST");
  try { if (digest(readFileSync(join(packRoot, "README.md"))) !== manifest.readmeSha256) findings.push("AP-README-DIGEST"); } catch { findings.push("AP-README-MISSING"); }
  for (const artifact of manifest.artifacts ?? []) {
    if (!exact(artifact, ["path", "sourcePath", "kind", "sha256"]) || !/^artifacts\/[0-9]{3}-[-a-z0-9._]{1,40}$/u.test(artifact.path) || !SHA.test(artifact.sha256 ?? "")) { findings.push("AP-ARTIFACT-SHAPE"); continue; }
    try { if (digest(readFileSync(join(packRoot, artifact.path))) !== artifact.sha256) findings.push(`AP-DIGEST:${artifact.path}`); }
    catch { findings.push(`AP-MISSING:${artifact.path}`); }
  }
  return { schema: "pipeline.audit-pack-verification.v1", status: findings.length ? "invalid" : manifest.pack.status, candidate: manifest.pack.candidate, findings, assurance: "internal-digests-only" };
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (!new Set(["plan", "build", "verify"]).has(command) || rest.length % 2 !== 0) fail("AP-ARGUMENT", "Usage: audit-pack.mjs plan|build|verify --request <json>");
  const args = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]; const value = rest[index + 1];
    if (!key.startsWith("--") || args.has(key)) fail("AP-ARGUMENT");
    args.set(key, value);
  }
  if (args.size !== 1 || !args.has("--request")) fail("AP-ARGUMENT");
  return { command, requestPath: args.get("--request") };
}
export function main(argv = process.argv.slice(2)) {
  const { command, requestPath } = parseCli(argv);
  const request = parseStrictJson(readFileSync(requestPath));
  if (command === "plan") {
    if (!exact(request, ["repositoryRoot", "manifestPath", "packId", "outputPath", "criticPacketIds", "approvalPairs", "verifyEvidencePath"])) fail("AP-REQUEST");
    return planAuditPack(request);
  }
  if (command === "build") {
    if (!exact(request, ["repositoryRoot", "plan"])) fail("AP-REQUEST");
    return buildAuditPack(request);
  }
  if (!exact(request, ["repositoryRoot", "packPath"])) fail("AP-REQUEST");
  return verifyAuditPack(request);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = main(); process.stdout.write(`${JSON.stringify(result)}\n`); if (result?.status === "invalid") process.exitCode = 1; }
  catch (error) { process.stderr.write(`${error.code ?? "AP-FAILED"}: ${error.message}\n`); process.exitCode = 2; }
}
