// SPDX-License-Identifier: SUL-1.0
/** Candidate-bound, offline-verifiable audit bundle service. */
import { createHash, verify as cryptoVerify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalSha256, canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { validateFeaturePackage } from "./feature-package-topology.mjs";
import { resolveEffectiveOrganizationPolicy } from "./organization-policy.mjs";
import { verifyEvidenceSatisfiesBoundary } from "./verify-selection.mjs";

const SHA = /^[a-f0-9]{64}$/u; const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u; const BUNDLE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u; const SIGNATURE = /^[A-Za-z0-9_-]{16,16384}$/u;
function fail(code, message = "Audit bundle operation is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function evidenceSection(manifest) {
  if (!Object.hasOwn(manifest, "evidence")) return "";
  const line = (entry) => `- ${entry.item}: ${entry.status}${entry.code ? ` (${entry.code})` : ""}${entry.bundlePath ? ` at \`${entry.bundlePath}\`` : ""}`;
  // C22 (CGR-12): the Critic round reports are their own section; a round without a report names what is missing instead of being left out.
  const approval = manifest.evidence.items.filter((entry) => !entry.item.startsWith("critic-report:")); const reports = manifest.evidence.items.filter((entry) => entry.item.startsWith("critic-report:"));
  const approvalText = approval.length === 0 ? "" : `\n## Human approval evidence\n\nTrace verdict: \`${manifest.evidence.traceStatus ?? "not carried"}\` (\`traced\`, \`attribution-only\` or \`untraceable\`; a chat approval is an attribution record, never proof). A gap is a typed absence, not a pass.\n\n${approval.map(line).join("\n")}\n`;
  const reportText = reports.length === 0 ? "" : `\n## Critic round reports\n\nOne entry per Critic round of the feature. \`REPORT-NOT-EXPORTED\` means the round's report was never exported into the repository's tracked evidence (it lived outside the tracked tree), and \`UNREADABLE\` that the named file was missing or empty at the close: the report is NOT part of this bundle.\n\n${reports.map(line).join("\n")}\n`;
  return `${approvalText}${reportText}`;
}
// C22B (CGR-13): printed prose only, from a build input that is NOT a manifest field (the manifest and its keys are hashed by the verifier and the bindings).
// The README digest is recorded in the manifest at build time, so the extra text is bound like the rest of the README.
function commitSplitSection(split) {
  if (split === undefined || split === null || typeof split !== "object") return "";
  if (split.status === "counted" && Number.isSafeInteger(split.product) && Number.isSafeInteger(split.evidence) && Number.isSafeInteger(split.total)) {
    return `\n## Commits of the feature range\n\nThe feature range holds ${split.product} product commit(s) and ${split.evidence} evidence commit(s) (${split.total} in total). A commit is an evidence commit when every path it touches is an administration or documentation path, a path under the feature's evidence directory or under audit-bundles, or a root evidence record; any other path (source, tests, configuration, an ADR, the spec text) makes it a product commit. The range starts at the first commit that touched the feature's directory (\`${split.rangeSource}\`). The commits themselves are unchanged; this count is printed here only and is not part of the manifest.\n`;
  }
  return "\n## Commits of the feature range\n\nThe commits of the feature range could not be counted at the time this bundle was built; no count is stated.\n";
}
function auditorReadme(manifest, commitSplit) {
  const artifactLines = manifest.artifacts.map((artifact) => `- \`${artifact.path}\` (source: \`${artifact.sourcePath}\`, SHA-256: \`${artifact.sha256}\`)`).join("\n");
  return `# Audit bundle: ${manifest.bundleId}

This directory is a candidate-bound audit bundle. It contains the copied artifacts listed below and a manifest binding them to the candidate identifiers.

## Candidate

- Commit: \`${manifest.candidate.commit}\`
- Tree: \`${manifest.candidate.tree}\`
- Bundle directory convention: \`audit-bundles/${manifest.bundleId}/\` (the producer may choose another explicit output path).

## Artifacts

${artifactLines}
${evidenceSection(manifest)}${proofsSection(manifest)}${evidenceIndexSection(manifest)}${commitSplitSection(commitSplit)}
## Offline verification

Prerequisites: Node.js and a copy of the repository containing \`plugins/pipeline-core/scripts/audit-bundle.mjs\`; no network, provider, key, or deployment access is required.

From that repository checkout, with this bundle copied to \`audit-bundles/${manifest.bundleId}\`:

\`node plugins/pipeline-core/scripts/audit-bundle.mjs verify --bundle ./audit-bundles/${manifest.bundleId}\`

The command exits 0 only for \`verified\` and nonzero for \`invalid\` or a command error. A verified result means the manifest shape, listed artifact bytes, and this README's recorded digest were internally consistent at verification time. An invalid result includes findings naming the failed check.

## Assurance limits

This bundle is not a claim that requirements are satisfied, that a review or PO approval occurred, that deployment or a push happened, or that the candidate is suitable for release. The unsigned manifest and its hashes are not independently trusted: an actor who can replace both an artifact and the manifest can preserve internal consistency. A separate optional signature, when present and independently verified through its provider, adds cryptographic binding only; signatures are not implied by this bundle. Supporting reports and state files are evidence supplied by the producer, not intrinsically tamper-proof proof.

The bundle states no independence of its own for any Critic round. Whether a round ran in a fresh context, without inherited history, is what the \`receipt.json\` exported beside that round's report records (\`freshContext\`, \`historyInherited\`, \`independence\`): a round recorded as \`caller-authored-fallback\` (freshContext false, historyInherited true) was authored by the calling agent and is not an independent review, and the report next to it must be read that way.
`;
}
function rootPath(root, path, code) { if (typeof path !== "string" || path.length === 0 || isAbsolute(path) || path.includes("\\")) fail(code); const target = resolve(root, path); const check = relative(root, target); if (check === "" || check === ".." || check.startsWith(`..${sep}`) || isAbsolute(check)) fail(code); return target; }
const ACK_CLASSES = new Set(["none", "partial", "accepted"]); const TERMINAL_DISPOSITIONS = new Set(["pending", "delivered", "retryable-failure", "quarantined"]);
const RECEIPT_KEYS = ["destinationProfile", "policyRevision", "projectionDigest", "batchId", "eventCount", "attempt", "acknowledgementClass", "terminalDisposition", "cursor", "lag"];
const EXPORT_METADATA_VARIANTS = [["profileDigest"], ["receipt"], ["profileDigest", "receipt"]];
function hasExportMetadata(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "exportMetadata"); }
// E-AC-20: export metadata is informational only -- a profile digest plus the delivery receipt's
// own already-public-safe fields (never `mappings`/`outbox`/`acknowledgement`, which carry live or
// authority-adjacent content) -- and is never consulted by the signature/digest-chain/verification
// logic below, so a bundle with wrong/mismatched export metadata still builds and verifies.
function receiptShape(receipt) { return exact(receipt, RECEIPT_KEYS) && KEY_ID.test(receipt.destinationProfile) && SHA.test(receipt.policyRevision) && SHA.test(receipt.projectionDigest) && KEY_ID.test(receipt.batchId) && Number.isSafeInteger(receipt.eventCount) && receipt.eventCount >= 0 && Number.isSafeInteger(receipt.attempt) && receipt.attempt >= 1 && ACK_CLASSES.has(receipt.acknowledgementClass) && TERMINAL_DISPOSITIONS.has(receipt.terminalDisposition) && Number.isSafeInteger(receipt.cursor) && receipt.cursor >= 0 && Number.isSafeInteger(receipt.lag) && receipt.lag >= 0; }
function exportMetadataShape(value) { return EXPORT_METADATA_VARIANTS.some((keys) => exact(value, keys)) && (!Object.hasOwn(value, "profileDigest") || SHA.test(value.profileDigest)) && (!Object.hasOwn(value, "receipt") || receiptShape(value.receipt)); }
function sanitizeExportEvidence(exportEvidence) {
  if (exportEvidence === undefined) return undefined;
  if (exportEvidence === null || typeof exportEvidence !== "object" || Array.isArray(exportEvidence)) fail("AB-EXPORT-METADATA");
  const hasProfile = Object.hasOwn(exportEvidence, "profile"); const hasReceipt = Object.hasOwn(exportEvidence, "receipt");
  const keys = [...(hasProfile ? ["profile"] : []), ...(hasReceipt ? ["receipt"] : [])];
  if (keys.length === 0 || !exact(exportEvidence, keys)) fail("AB-EXPORT-METADATA");
  if (hasProfile && (exportEvidence.profile === null || typeof exportEvidence.profile !== "object" || Array.isArray(exportEvidence.profile))) fail("AB-EXPORT-METADATA");
  if (hasReceipt && !receiptShape(exportEvidence.receipt)) fail("AB-EXPORT-RECEIPT");
  return Object.freeze({ ...(hasProfile ? { profileDigest: canonicalSha256(exportEvidence.profile) } : {}), ...(hasReceipt ? { receipt: Object.freeze({ ...exportEvidence.receipt }) } : {}) });
}
// Q3: the optional top-level keys a plan or manifest may carry, each validated when present. The absent case keeps the
// exact key list it always had, so old bundles and plans stay byte-identical and verifiable.
const OPTIONAL_KEYS = ["exportMetadata", "evidence", "proofs", "evidenceIndex"];
// C21E: the index an auditor needs lived in private storage or in a hand-written scratch file, so it never reached the push. The bundle now lists the feature's
// tracked evidence from the candidate's own Git tree: path and Git blob only, nothing that the same commit does not already publish.
const EVIDENCE_INDEX_SCHEMA = "pipeline.audit-bundle-evidence-index.v1"; const EVIDENCE_INDEX_MAX = 2048;
const INDEX_PATH = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u; const INDEX_LINE = /^[0-9]{6} blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/u;
const INDEX_GROUPS = ["critic-reviews", "dispatch-records", "verify-records", "other"];
const indexGroup = (path) => (/(?:^|\/)(?:critic|design-review)/u.test(path) ? "critic-reviews" : /dispatch/u.test(path) ? "dispatch-records" : /verify/u.test(path) ? "verify-records" : "other");
/** The index of one `git ls-tree -r` output, or null when it lists nothing. A path Git had to quote is counted as omitted, never guessed. */
export function evidenceIndexFromLsTree(text) {
  const entries = []; let omitted = 0;
  for (const line of String(text ?? "").split("\n").filter((value) => value !== "")) {
    const match = INDEX_LINE.exec(line);
    if (match === null || !INDEX_PATH.test(match[2]) || entries.length >= EVIDENCE_INDEX_MAX) { omitted += 1; continue; }
    entries.push({ path: match[2], blob: match[1], group: indexGroup(match[2]) });
  }
  return entries.length === 0 && omitted === 0 ? null : { schema: EVIDENCE_INDEX_SCHEMA, source: "git-ls-tree", entries, omitted };
}
function evidenceIndexShape(value) {
  return exact(value, ["schema", "source", "entries", "omitted"]) && value.schema === EVIDENCE_INDEX_SCHEMA && value.source === "git-ls-tree" && Number.isSafeInteger(value.omitted) && value.omitted >= 0
    && Array.isArray(value.entries) && value.entries.length <= EVIDENCE_INDEX_MAX && value.entries.every((entry) => exact(entry, ["path", "blob", "group"]) && INDEX_PATH.test(entry.path) && OID.test(entry.blob) && INDEX_GROUPS.includes(entry.group));
}
function evidenceIndexSection(manifest) {
  if (!Object.hasOwn(manifest, "evidenceIndex")) return "";
  const { entries, omitted } = manifest.evidenceIndex;
  const groups = INDEX_GROUPS.map((group) => [group, entries.filter((entry) => entry.group === group)]).filter(([, listed]) => listed.length > 0)
    .map(([group, listed]) => `### ${group}\n\n${listed.map((entry) => `- \`${entry.path}\` (Git blob: \`${entry.blob}\`)`).join("\n")}\n`).join("\n");
  return `\n## Evidence index\n\nThe feature's tracked evidence at this candidate, listed from the candidate's own Git tree. The files stay in the repository; each is bound by its Git blob, so \`git cat-file -p <blob>\` in a clone shows the exact bytes.${omitted > 0 ? ` ${omitted} tracked path(s) could not be listed and were omitted.` : ""}\n\n${groups}`;
}
// P3 (C20D-P3-ONE-SHOT-CLOSE): the signed approval proof envelopes that authorized the feature live in the private approval store, outside the
// repository. The bundle copies the PUBLIC proof objects (schema, signed digest, key reference, public key, signature; never a private key) into
// proofs/ and binds each by file digest and by the signed intent digest; the offline verifier re-checks the bytes, the intent and the Ed25519 signature.
const PROOF_FIELDS = ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"]; const PROOF_KIND = /^[a-z-]{1,40}$/u; const PROOF_PATH = /^proofs\/[0-9]{3}-[a-z-]{1,40}\.json$/u;
function proofSignatureHolds(proof) {
  try { return cryptoVerify(null, Buffer.from(proof.intentSha256, "utf8"), proof.publicKey, Buffer.from(proof.signatureBase64, "base64")) === true; } catch { return false; }
}
function proofObjectValid(proof) {
  return exact(proof, PROOF_FIELDS) && proof.schema === PROOF_SCHEMA && SHA.test(proof.intentSha256) && typeof proof.keyReference === "string" && proof.keyReference.length > 0 && proof.keyReference.length <= 128
    && typeof proof.publicKey === "string" && proof.publicKey.includes("PUBLIC KEY") && !/PRIVATE KEY/u.test(JSON.stringify(proof)) && typeof proof.signatureBase64 === "string" && /^[A-Za-z0-9+/=]{16,4096}$/u.test(proof.signatureBase64) && proofSignatureHolds(proof);
}
/** True when `proof` is a public proof object whose Ed25519 signature verifies over its own signed intent digest (what the bundle can carry). */
export function isCarriableProof(proof) { return proofObjectValid(proof); }
const proofBytes = (proof) => Buffer.from(`${canonicalizeJson(proof)}\n`, "utf8");
function planProofs(proofs) {
  if (!Array.isArray(proofs) || proofs.length === 0 || proofs.length > 16) fail("AB-PROOF-INVALID", "Proofs must be one to sixteen { kind, proof } entries.");
  return proofs.map((entry, index) => {
    if (!exact(entry, ["kind", "proof"]) || !PROOF_KIND.test(entry.kind) || !proofObjectValid(entry.proof)) fail("AB-PROOF-INVALID", "A signed proof envelope is not a verifiable public proof object.");
    return Object.freeze({ kind: entry.kind, bundlePath: `proofs/${String(index + 1).padStart(3, "0")}-${entry.kind}.json`, sha256: digest(proofBytes(entry.proof)), intentSha256: entry.proof.intentSha256, proof: Object.freeze({ ...entry.proof }) });
  });
}
function proofsPlanShape(proofs) { return Array.isArray(proofs) && proofs.length > 0 && proofs.length <= 16 && proofs.every((entry) => exact(entry, ["kind", "bundlePath", "sha256", "intentSha256", "proof"]) && PROOF_KIND.test(entry.kind) && PROOF_PATH.test(entry.bundlePath) && SHA.test(entry.sha256) && proofObjectValid(entry.proof) && entry.proof.intentSha256 === entry.intentSha256 && digest(proofBytes(entry.proof)) === entry.sha256); }
const proofsManifest = (proofs) => proofs.map((entry) => ({ kind: entry.kind, path: entry.bundlePath, sha256: entry.sha256, intentSha256: entry.intentSha256 }));
function proofsManifestShape(proofs) { return Array.isArray(proofs) && proofs.length > 0 && proofs.length <= 16 && proofs.every((entry) => exact(entry, ["kind", "path", "sha256", "intentSha256"]) && PROOF_KIND.test(entry.kind) && PROOF_PATH.test(entry.path) && SHA.test(entry.sha256) && SHA.test(entry.intentSha256)); }
function proofsSection(manifest) {
  if (!Object.hasOwn(manifest, "proofs")) return "";
  return `\n## Signed approval proofs\n\nThe detached, public proof objects of the human approvals that authorized this candidate (no private key is ever copied). Each is bound by file digest and by the signed intent digest, and the offline verification re-checks both and the Ed25519 signature:\n\n${manifest.proofs.map((entry) => `- ${entry.kind}: \`${entry.path}\` (SHA-256: \`${entry.sha256}\`, signed intent: \`${entry.intentSha256}\`)`).join("\n")}\n`;
}
function proofFindings(root, entries) {
  const findings = [];
  for (const entry of entries) {
    let bytes; try { bytes = readFileSync(join(root, entry.path)); } catch { findings.push(`AB-MISSING ${entry.path}`); continue; }
    if (digest(bytes) !== entry.sha256) { findings.push(`AB-DIGEST ${entry.path}`); continue; }
    const proof = jsonOrNull(bytes);
    if (!exact(proof, PROOF_FIELDS) || proof.schema !== PROOF_SCHEMA || !SHA.test(proof.intentSha256 ?? "")) { findings.push(`AB-PROOF-INVALID ${entry.path}`); continue; }
    if (proof.intentSha256 !== entry.intentSha256) findings.push(`AB-PROOF-INTENT ${entry.path}`);
    if (!proofSignatureHolds(proof)) findings.push(`AB-PROOF-SIGNATURE ${entry.path}`);
  }
  return findings;
}
// C20E-AP (AC-108): the push approval signs the commit that CARRIES the bundle and the release approval comes later still, so their public proofs reach
// the bundle in ONE follow-up: new files under proofs/ plus this list. manifest.json and README.md are never rewritten (the bundle is create-only), so the
// manifest-level verification above is unchanged; the list binds the follow-up to the bundle's candidate and to the approved commit, and the verifier
// re-checks every listed file by bytes, signed intent and Ed25519 signature. A chat-mode approval is an attribution record (kind, mode, time), never a proof.
export const AUDIT_BUNDLE_FOLLOWUP_PATH = "proofs/follow-up.json"; export const AUDIT_BUNDLE_FOLLOWUP_SCHEMA = "pipeline.audit-bundle-followup.v1";
export const auditBundleProofBytes = (proof) => proofBytes(proof);
const FOLLOWUP_KEYS = ["schema", "candidate", "approvedCommit", "proofs", "attributions"]; const ATTRIBUTION_MODE = /^[a-z-]{1,64}$/u;
export const followUpAttributionShape = (entry) => exact(entry, ["kind", "mode", "approvedAt"]) && PROOF_KIND.test(entry.kind) && ATTRIBUTION_MODE.test(entry.mode) && (entry.approvedAt === null || (typeof entry.approvedAt === "string" && entry.approvedAt.length <= 40));
// PO tile 2026-11-10: a bundle can have one list per approved commit (`follow-up.json`, then `follow-up-NNN.json`), and a list can carry the final Verify and Security records.
export const AUDIT_BUNDLE_FOLLOWUP_NUMBERED = /^follow-up-[0-9]{3}\.json$/u;
function followUpListNames(root) {
  let names; try { names = readdirSync(join(root, "proofs")); } catch { return ["follow-up.json"]; }
  return ["follow-up.json", ...names.filter((name) => AUDIT_BUNDLE_FOLLOWUP_NUMBERED.test(name)).sort()];
}
function followUpFindings(root, manifest) {
  const findings = []; const taken = new Set((manifest.proofs ?? []).map((entry) => entry?.path));
  for (const name of followUpListNames(root)) {
    let bytes; try { bytes = readFileSync(join(root, "proofs", name)); } catch (error) { if (error?.code !== "ENOENT") findings.push("AB-FOLLOWUP"); continue; }
    const list = jsonOrNull(bytes);
    const fresh = (path) => { if (taken.has(path)) return false; taken.add(path); return true; };
    const proofsOk = Array.isArray(list?.proofs) && list.proofs.length <= 16 && list.proofs.every((entry) => exact(entry, ["kind", "path", "sha256", "intentSha256"]) && PROOF_KIND.test(entry.kind) && PROOF_PATH.test(entry.path) && SHA.test(entry.sha256) && SHA.test(entry.intentSha256) && fresh(entry.path));
    const attributionsOk = Array.isArray(list?.attributions) && list.attributions.length <= 8 && list.attributions.every(followUpAttributionShape);
    const evidence = Object.hasOwn(list ?? {}, "evidence") ? list.evidence : [];
    const evidenceOk = Array.isArray(evidence) && evidence.length <= 8 && evidence.every((entry) => exact(entry, ["kind", "path", "sha256"]) && PROOF_KIND.test(entry.kind) && PROOF_PATH.test(entry.path) && SHA.test(entry.sha256) && fresh(entry.path));
    if (!exact(list, Object.hasOwn(list ?? {}, "evidence") ? [...FOLLOWUP_KEYS, "evidence"] : FOLLOWUP_KEYS) || list.schema !== AUDIT_BUNDLE_FOLLOWUP_SCHEMA || !sameCandidate(list.candidate, manifest.candidate ?? {}) || !OID.test(list.approvedCommit) || !proofsOk || !attributionsOk || !evidenceOk || list.proofs.length + list.attributions.length + evidence.length === 0) { findings.push("AB-FOLLOWUP"); continue; }
    findings.push(...proofFindings(root, list.proofs));
    for (const entry of evidence) {
      let record; try { record = readFileSync(join(root, entry.path)); } catch { findings.push(`AB-MISSING ${entry.path}`); continue; }
      if (digest(record) !== entry.sha256) findings.push(`AB-DIGEST ${entry.path}`);
    }
  }
  return findings;
}
function optionalKeys(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? OPTIONAL_KEYS.filter((key) => Object.hasOwn(value, key)) : []; }
const EVIDENCE_ITEMS = new Set(["approval-trace", "approval-proofs", "verify-record", "security-scan", "critic-report"]);
const EVIDENCE_CLASSES = Object.freeze({ trace: "approval-trace", proof: "approval-proof", verify: "verify-record", security: "security-scan", critic: "critic-report" });
const TRACE_SCHEMA = "pipeline.human-approval-trace.v1"; const TRACE_STATUSES = new Set(["traced", "attribution-only", "untraceable"]);
const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
function evidenceShape(value) {
  return exact(value, ["schema", "candidateBound", "traceStatus", "items"]) && value.schema === "pipeline.audit-bundle-evidence.v1" && value.candidateBound === true
    && (value.traceStatus === null || TRACE_STATUSES.has(value.traceStatus)) && Array.isArray(value.items) && value.items.length <= 64
    && value.items.every((entry) => exact(entry, ["item", "status", "code", "bundlePath"]) && /^[a-z-]+(?::[a-z0-9-]{1,40})?$/u.test(entry.item) && EVIDENCE_ITEMS.has(entry.item.split(":")[0])
      && (entry.status === "carried" || entry.status === "gap") && (entry.code === null || /^[A-Z0-9-]{3,48}$/u.test(entry.code))
      && (entry.bundlePath === null || /^artifacts\/[0-9]{3}-[a-z-]+$/u.test(entry.bundlePath)) && (entry.status === "gap" ? entry.code !== null && entry.bundlePath === null : entry.bundlePath !== null));
}
function planShape(plan) { return exact(plan, ["schema", "status", "bundleId", "candidate", "effectivePolicy", "effectivePolicySha256", "artifacts", ...optionalKeys(plan)])
  && plan.schema === "pipeline.audit-bundle-plan.v1" && plan.status === "preview" && BUNDLE_ID.test(plan.bundleId) && exact(plan.candidate, ["commit", "tree"]) && OID.test(plan.candidate.commit) && OID.test(plan.candidate.tree) && SHA.test(plan.effectivePolicySha256) && canonicalSha256(plan.effectivePolicy) === plan.effectivePolicySha256 && Array.isArray(plan.artifacts) && plan.artifacts.length > 0 && plan.artifacts.every((entry) => exact(entry, ["sourcePath", "bundlePath", "sha256"]) && typeof entry.sourcePath === "string" && /^artifacts\/[0-9]{3}-[a-z-]+$/u.test(entry.bundlePath) && SHA.test(entry.sha256)) && (!hasExportMetadata(plan) || exportMetadataShape(plan.exportMetadata)) && (!Object.hasOwn(plan, "evidence") || evidenceShape(plan.evidence)) && (!Object.hasOwn(plan, "proofs") || proofsPlanShape(plan.proofs)) && (!Object.hasOwn(plan, "evidenceIndex") || evidenceIndexShape(plan.evidenceIndex)); }

function readEvidenceFile(root, path) {
  let source; try { source = rootPath(root, path, "AB-EVIDENCE-PATH"); } catch { return null; }
  try { const bytes = readFileSync(source); return { bytes, sha256: digest(bytes) }; } catch { return null; }
}
function jsonOrNull(bytes) { try { return parseStrictJson(bytes); } catch { return null; } }
const sameCandidate = (value, candidate) => value !== null && typeof value === "object" && value.commit === candidate.commit && value.tree === candidate.tree;
/**
 * Q3: carry, by path and digest, the evidence an auditor needs to follow every human approval back to the human: the
 * human-approval trace report (which embeds each detached proof), any explicitly referenced detached proof files, the
 * release-mode Verify record and the security scan, each bound to the audited candidate. An item that is missing or
 * bound to another candidate is a typed gap in the manifest, never silently skipped. Nothing here signs or approves.
 */
function collectEvidence(root, candidate, evidence, firstIndex) {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) fail("AB-EVIDENCE-INPUT");
  const known = new Set(["traceReportPath", "proofPaths", "verifyRecordPath", "securityScanPath", "criticReports"]);
  if (Object.keys(evidence).some((key) => !known.has(key)) || (evidence.proofPaths !== undefined && (!Array.isArray(evidence.proofPaths) || evidence.proofPaths.length > 16))) fail("AB-EVIDENCE-INPUT");
  // C22 (CGR-12): one entry per Critic round of the feature; a null path is a round whose report was never exported.
  const reports = evidence.criticReports;
  if (reports !== undefined && (!Array.isArray(reports) || reports.length > 40 || !reports.every((entry) => exact(entry, ["packetId", "path"]) && /^[a-f0-9]{32}$/u.test(entry.packetId) && (entry.path === null || typeof entry.path === "string")) || new Set(reports.map((entry) => entry.packetId)).size !== reports.length)) fail("AB-EVIDENCE-INPUT");
  const approvalNamed = ["traceReportPath", "proofPaths", "verifyRecordPath", "securityScanPath"].some((key) => evidence[key] !== undefined);
  const artifacts = []; const items = []; let traceStatus = null; let traceHasProof = false;
  const carry = (cls, sourcePath, sha256) => { const bundlePath = `artifacts/${String(firstIndex + artifacts.length + 1).padStart(3, "0")}-${cls}`; artifacts.push({ sourcePath, bundlePath, sha256 }); return bundlePath; };
  const gap = (item, code) => items.push({ item, status: "gap", code, bundlePath: null });
  let traceBundlePath = null;
  // Only reports named (the close's own request): no approval item is invented, so a gap there is not a claim this request made.
  if (approvalNamed || reports === undefined) {
  if (evidence.traceReportPath === undefined) gap("approval-trace", "NOT-REFERENCED");
  else {
    const file = readEvidenceFile(root, evidence.traceReportPath); const report = file && jsonOrNull(file.bytes);
    if (!report || report.schema !== TRACE_SCHEMA || !TRACE_STATUSES.has(report.status) || !Array.isArray(report.rows)) gap("approval-trace", "UNREADABLE");
    else if (!sameCandidate(report.candidate, candidate)) gap("approval-trace", "OTHER-CANDIDATE");
    else {
      traceStatus = report.status; traceHasProof = report.rows.some((row) => row?.proof !== null && typeof row?.proof === "object");
      traceBundlePath = carry(EVIDENCE_CLASSES.trace, evidence.traceReportPath, file.sha256);
      items.push({ item: "approval-trace", status: "carried", code: report.status === "traced" ? null : report.status === "attribution-only" ? "TRACE-ATTRIBUTION-ONLY" : "TRACE-UNTRACEABLE", bundlePath: traceBundlePath });
    }
  }
  const proofs = evidence.proofPaths ?? [];
  if (proofs.length === 0) { if (traceBundlePath !== null && traceHasProof) items.push({ item: "approval-proofs", status: "carried", code: null, bundlePath: traceBundlePath }); else gap("approval-proofs", "NOT-REFERENCED"); }
  for (const entry of proofs) {
    if (!exact(entry, ["kind", "path"]) || !/^[a-z-]{1,40}$/u.test(entry.kind)) fail("AB-EVIDENCE-INPUT");
    const file = readEvidenceFile(root, entry.path); const proof = file && jsonOrNull(file.bytes);
    if (!exact(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"]) || proof.schema !== PROOF_SCHEMA || !SHA.test(proof.intentSha256)) { gap(`approval-proofs:${entry.kind}`, "UNREADABLE"); continue; }
    items.push({ item: `approval-proofs:${entry.kind}`, status: "carried", code: null, bundlePath: carry(EVIDENCE_CLASSES.proof, entry.path, file.sha256) });
  }
  if (evidence.verifyRecordPath === undefined) gap("verify-record", "NOT-REFERENCED");
  else {
    const file = readEvidenceFile(root, evidence.verifyRecordPath); const record = file && jsonOrNull(file.bytes);
    if (!record || record.schema !== "pipeline.verify-evidence.v0") gap("verify-record", "UNREADABLE");
    else if (record.commit !== candidate.commit || record.tree !== candidate.tree || !sameCandidate(record.candidate, candidate)) gap("verify-record", "OTHER-CANDIDATE");
    else if (verifyEvidenceSatisfiesBoundary(record, "release") !== true) gap("verify-record", "NOT-RELEASE-VERIFY");
    else items.push({ item: "verify-record", status: "carried", code: null, bundlePath: carry(EVIDENCE_CLASSES.verify, evidence.verifyRecordPath, file.sha256) });
  }
  if (evidence.securityScanPath === undefined) gap("security-scan", "NOT-REFERENCED");
  else {
    const file = readEvidenceFile(root, evidence.securityScanPath); const record = file && jsonOrNull(file.bytes);
    if (!record || record.schema !== "pipeline.security-evidence.v0" || !Array.isArray(record.findings)) gap("security-scan", "UNREADABLE");
    else if (!sameCandidate(record.candidate, candidate)) gap("security-scan", "OTHER-CANDIDATE");
    else if (record.exitCode !== 0 || record.findings.length > 0) gap("security-scan", "NOT-PASSING");
    else items.push({ item: "security-scan", status: "carried", code: null, bundlePath: carry(EVIDENCE_CLASSES.security, evidence.securityScanPath, file.sha256) });
  }
  }
  for (const entry of reports ?? []) {
    const item = `critic-report:${entry.packetId}`;
    if (entry.path === null) { gap(item, "REPORT-NOT-EXPORTED"); continue; }
    const file = readEvidenceFile(root, entry.path);
    if (file === null || file.bytes.length === 0) gap(item, "UNREADABLE");
    else items.push({ item, status: "carried", code: null, bundlePath: carry(EVIDENCE_CLASSES.critic, entry.path, file.sha256) });
  }
  return { artifacts, evidence: Object.freeze({ schema: "pipeline.audit-bundle-evidence.v1", candidateBound: true, traceStatus, items: Object.freeze(items.map((entry) => Object.freeze(entry))) }) };
}

/**
 * `candidate` (optional) is the commit and tree the caller is auditing: when given it must equal the feature package's
 * candidate exactly, so a bundle is never labelled with the parent of the commit it was asked to audit (Q3).
 * `evidence` (optional) carries the approval trace, detached proofs, release Verify record and security scan; see `collectEvidence`.
 */
export function planAuditBundle({ repositoryRoot, manifestPath, bundleId, coreVersion, packs, exportEvidence, candidate, evidence, proofs, evidenceIndex } = {}) {
  const root = resolve(repositoryRoot ?? ""); if (!BUNDLE_ID.test(bundleId ?? "")) fail("AB-BUNDLE-ID");
  if (evidenceIndex !== undefined && !evidenceIndexShape(evidenceIndex)) fail("AB-EVIDENCE-INDEX", "The evidence index is not a list of tracked paths and Git blobs.");
  const packageCheck = validateFeaturePackage(root, manifestPath); if (!packageCheck.ok || !packageCheck.receipt?.candidate) fail("AB-PACKAGE");
  if (candidate !== undefined && !(exact(candidate, ["commit", "tree"]) && OID.test(candidate.commit) && OID.test(candidate.tree) && candidate.commit === packageCheck.receipt.candidate.commit && candidate.tree === packageCheck.receipt.candidate.tree)) fail("AB-CANDIDATE-MISMATCH", "The audited candidate is not the feature package candidate.");
  const policy = resolveEffectiveOrganizationPolicy({ coreVersion, packs });
  const manifest = JSON.parse(readFileSync(join(root, packageCheck.receipt.manifest), "utf8"));
  const artifacts = manifest.artifacts.map((entry, index) => ({ sourcePath: entry.path, bundlePath: `artifacts/${String(index + 1).padStart(3, "0")}-${entry.class}`, sha256: entry.sha256 }));
  const exportMetadata = sanitizeExportEvidence(exportEvidence);
  const carried = evidence === undefined ? null : collectEvidence(root, packageCheck.receipt.candidate, evidence, artifacts.length);
  if (carried !== null) artifacts.push(...carried.artifacts);
  const carriedProofs = proofs === undefined ? undefined : Object.freeze(planProofs(proofs));
  return Object.freeze({ schema: "pipeline.audit-bundle-plan.v1", status: "preview", bundleId, candidate: Object.freeze({ ...packageCheck.receipt.candidate }), effectivePolicy: policy, effectivePolicySha256: canonicalSha256(policy), artifacts: Object.freeze(artifacts.map((entry) => Object.freeze(entry))), ...(exportMetadata !== undefined ? { exportMetadata } : {}), ...(carried !== null ? { evidence: carried.evidence } : {}), ...(carriedProofs !== undefined ? { proofs: carriedProofs } : {}), ...(evidenceIndex !== undefined ? { evidenceIndex } : {}) });
}

/** `commitSplit` (optional, C22B) is printed in the README only, never in the manifest: see commitSplitSection. */
export async function buildAuditBundle({ repositoryRoot, outputPath, plan, commitSplit } = {}) {
  const root = resolve(repositoryRoot ?? ""); if (!planShape(plan)) fail("AB-PLAN"); const output = rootPath(root, outputPath, "AB-OUTPUT");
  try { await lstat(output); fail("AB-OUTPUT-EXISTS"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await mkdir(output, { recursive: false }); await mkdir(join(output, "artifacts"));
  for (const artifact of plan.artifacts) { const source = rootPath(root, artifact.sourcePath, "AB-SOURCE"); const bytes = await readFile(source); if (digest(bytes) !== artifact.sha256) fail("AB-SOURCE-DIGEST"); await copyFile(source, join(output, artifact.bundlePath)); }
  const baseManifest = { schema: "pipeline.audit-bundle-manifest.v1", bundleId: plan.bundleId, candidate: plan.candidate, effectivePolicySha256: plan.effectivePolicySha256, artifacts: plan.artifacts.map((entry) => ({ path: entry.bundlePath, sourcePath: entry.sourcePath, sha256: entry.sha256 })), ...(hasExportMetadata(plan) ? { exportMetadata: plan.exportMetadata } : {}), ...(Object.hasOwn(plan, "evidence") ? { evidence: plan.evidence } : {}), ...(Object.hasOwn(plan, "proofs") ? { proofs: proofsManifest(plan.proofs) } : {}), ...(Object.hasOwn(plan, "evidenceIndex") ? { evidenceIndex: plan.evidenceIndex } : {}) };
  if (Object.hasOwn(plan, "proofs")) { await mkdir(join(output, "proofs")); for (const entry of plan.proofs) await writeFile(join(output, entry.bundlePath), proofBytes(entry.proof), { flag: "wx", mode: 0o644 }); }
  const readmeBytes = Buffer.from(auditorReadme(baseManifest, commitSplit), "utf8");
  const manifest = { ...baseManifest, readmeSha256: digest(readmeBytes) };
  const bytes = `${canonicalizeJson(manifest)}\n`; await writeFile(join(output, "manifest.json"), bytes, { encoding: "utf8", flag: "wx", mode: 0o644 }); await writeFile(join(output, "README.md"), readmeBytes, { flag: "wx", mode: 0o644 });
  return Object.freeze({ schema: "pipeline.audit-bundle-build-receipt.v1", status: "built", bundleId: plan.bundleId, outputPath, manifestSha256: digest(bytes), candidate: plan.candidate, effectivePolicySha256: plan.effectivePolicySha256 });
}

export function verifyAuditBundleSync({ bundleRoot } = {}) {
  const root = resolve(bundleRoot ?? ""); let manifest;
  try { manifest = parseStrictJson(readFileSync(join(root, "manifest.json"))); } catch { return Object.freeze({ schema: "pipeline.audit-bundle-verification.v1", status: "invalid", findings: Object.freeze(["AB-MANIFEST"]) }); }
  const findings = []; const hasExport = hasExportMetadata(manifest); const hasReadme = Object.hasOwn(manifest, "readmeSha256"); const hasEvidence = Object.hasOwn(manifest, "evidence");
  if (!exact(manifest, manifestKeys(manifest, hasReadme)) || (hasEvidence && !evidenceShape(manifest.evidence)) || manifest.schema !== "pipeline.audit-bundle-manifest.v1" || !BUNDLE_ID.test(manifest.bundleId) || !exact(manifest.candidate, ["commit", "tree"]) || !OID.test(manifest.candidate.commit) || !OID.test(manifest.candidate.tree) || !SHA.test(manifest.effectivePolicySha256) || !Array.isArray(manifest.artifacts) || (hasExport && !exportMetadataShape(manifest.exportMetadata)) || (hasReadme && !SHA.test(manifest.readmeSha256))) findings.push("AB-MANIFEST");
  if (hasReadme) { try { if (digest(readFileSync(join(root, "README.md"))) !== manifest.readmeSha256) findings.push("AB-README-DIGEST"); } catch { findings.push("AB-README"); } }
  for (const artifact of manifest.artifacts ?? []) { if (!exact(artifact, ["path", "sourcePath", "sha256"]) || typeof artifact.sourcePath !== "string" || !/^artifacts\/[0-9]{3}-[a-z-]+$/u.test(artifact.path) || !SHA.test(artifact.sha256)) { findings.push("AB-ARTIFACT"); continue; } try { if (digest(readFileSync(join(root, artifact.path))) !== artifact.sha256) findings.push(`AB-DIGEST ${artifact.path}`); } catch { findings.push(`AB-MISSING ${artifact.path}`); } }
  if (hasEvidence && evidenceShape(manifest.evidence)) findings.push(...evidenceFindings(root, manifest));
  if (Object.hasOwn(manifest, "proofs")) { if (proofsManifestShape(manifest.proofs)) findings.push(...proofFindings(root, manifest.proofs)); else findings.push("AB-PROOFS"); }
  if (Object.hasOwn(manifest, "evidenceIndex") && !evidenceIndexShape(manifest.evidenceIndex)) findings.push("AB-EVIDENCE-INDEX");
  findings.push(...followUpFindings(root, manifest));
  return Object.freeze({ schema: "pipeline.audit-bundle-verification.v1", status: findings.length ? "invalid" : "verified", candidate: manifest.candidate ?? null, findings: Object.freeze(findings) });
}
function manifestKeys(manifest, hasReadme) { return ["schema", "bundleId", "candidate", "effectivePolicySha256", "artifacts", ...optionalKeys(manifest), ...(hasReadme ? ["readmeSha256"] : [])]; }
// Q3: every carried evidence item must name an artifact the manifest lists, and the carried trace report must be bound to
// the manifest's own candidate -- a bundle cannot present another commit's trace as its evidence.
function evidenceFindings(root, manifest) {
  const findings = []; const listed = new Set(Array.isArray(manifest.artifacts) ? manifest.artifacts.filter((entry) => entry !== null && typeof entry === "object").map((entry) => entry.path) : []);
  for (const item of manifest.evidence.items) {
    if (item.bundlePath !== null && !listed.has(item.bundlePath)) { findings.push(`AB-EVIDENCE-ITEM ${item.item}`); continue; }
    if (item.item === "approval-trace" && item.bundlePath !== null) {
      let report = null; try { report = parseStrictJson(readFileSync(join(root, item.bundlePath))); } catch { report = null; }
      if (report?.schema !== TRACE_SCHEMA || !sameCandidate(report.candidate, manifest.candidate ?? {}) || report.status !== manifest.evidence.traceStatus) findings.push("AB-EVIDENCE-TRACE-CANDIDATE");
    }
  }
  return findings;
}

export async function verifyAuditBundle(options = {}) { return verifyAuditBundleSync(options); }

async function signatureRequest(bundleRoot) {
  const root = resolve(bundleRoot ?? ""); let bytes; let manifest;
  try { bytes = await readFile(join(root, "manifest.json")); manifest = parseStrictJson(bytes); } catch { fail("AB-SIGNATURE-MANIFEST"); }
  const hasExport = hasExportMetadata(manifest);
  const hasReadme = Object.hasOwn(manifest, "readmeSha256");
  if (!exact(manifest, manifestKeys(manifest, hasReadme)) || (Object.hasOwn(manifest, "evidence") && !evidenceShape(manifest.evidence)) || manifest.schema !== "pipeline.audit-bundle-manifest.v1" || !BUNDLE_ID.test(manifest.bundleId) || !exact(manifest.candidate, ["commit", "tree"]) || !OID.test(manifest.candidate.commit) || !OID.test(manifest.candidate.tree) || !SHA.test(manifest.effectivePolicySha256) || (hasReadme && !SHA.test(manifest.readmeSha256)) || (hasExport && !exportMetadataShape(manifest.exportMetadata))) fail("AB-SIGNATURE-MANIFEST");
  return Object.freeze({ schema: "pipeline.audit-bundle-signature-request.v1", bundleId: manifest.bundleId, manifestSha256: digest(bytes), candidate: Object.freeze({ ...manifest.candidate }), effectivePolicySha256: manifest.effectivePolicySha256 });
}

/** Return a provider-neutral signing request; no key or key location enters the bundle. */
export async function planAuditBundleSignature({ bundleRoot, algorithm, signerKeyId } = {}) {
  if (!KEY_ID.test(algorithm ?? "") || !KEY_ID.test(signerKeyId ?? "")) fail("AB-SIGNATURE-REQUEST");
  return Object.freeze({ ...(await signatureRequest(bundleRoot)), algorithm, signerKeyId });
}

/** Attach one create-only provider signature to an unchanged bundle manifest. */
export async function signAuditBundle({ bundleRoot, request, sign } = {}) {
  if (!exact(request, ["schema", "bundleId", "manifestSha256", "candidate", "effectivePolicySha256", "algorithm", "signerKeyId"]) || request.schema !== "pipeline.audit-bundle-signature-request.v1" || !SHA.test(request.manifestSha256) || !KEY_ID.test(request.algorithm) || !KEY_ID.test(request.signerKeyId) || typeof sign !== "function") fail("AB-SIGNATURE-REQUEST");
  const root = resolve(bundleRoot ?? ""); const current = await signatureRequest(root);
  if (canonicalizeJson({ ...current, algorithm: request.algorithm, signerKeyId: request.signerKeyId }) !== canonicalizeJson(request)) fail("AB-SIGNATURE-PREIMAGE");
  const response = await sign(Object.freeze({ ...request }));
  if (!exact(response, ["signature", "algorithm", "signerKeyId"]) || !SIGNATURE.test(response.signature) || response.algorithm !== request.algorithm || response.signerKeyId !== request.signerKeyId) fail("AB-SIGNATURE-PROVIDER");
  const record = { schema: "pipeline.audit-bundle-signature.v1", bundleId: request.bundleId, manifestSha256: request.manifestSha256, candidate: request.candidate, effectivePolicySha256: request.effectivePolicySha256, algorithm: request.algorithm, signerKeyId: request.signerKeyId, signature: response.signature, assurance: "cryptographic-binding-only" };
  const target = join(root, "signature.json"); try { await lstat(target); fail("AB-SIGNATURE-EXISTS"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await writeFile(target, `${canonicalizeJson(record)}\n`, { encoding: "utf8", flag: "wx", mode: 0o644 });
  return Object.freeze({ schema: "pipeline.audit-bundle-signature-receipt.v1", status: "signed", manifestSha256: request.manifestSha256, signerKeyId: request.signerKeyId, assurance: "cryptographic-binding-only" });
}

/** Verify a signature through a supplied provider without turning it into identity or authority. */
export async function verifyAuditBundleSignature({ bundleRoot, verify } = {}) {
  if (typeof verify !== "function") fail("AB-SIGNATURE-VERIFY-REQUEST"); const root = resolve(bundleRoot ?? ""); let record;
  try { record = parseStrictJson(await readFile(join(root, "signature.json"))); } catch { return Object.freeze({ schema: "pipeline.audit-bundle-signature-verification.v1", status: "unavailable", assurance: "none" }); }
  if (!exact(record, ["schema", "bundleId", "manifestSha256", "candidate", "effectivePolicySha256", "algorithm", "signerKeyId", "signature", "assurance"]) || record.schema !== "pipeline.audit-bundle-signature.v1" || !SHA.test(record.manifestSha256) || !KEY_ID.test(record.algorithm) || !KEY_ID.test(record.signerKeyId) || !SIGNATURE.test(record.signature) || record.assurance !== "cryptographic-binding-only") return Object.freeze({ schema: "pipeline.audit-bundle-signature-verification.v1", status: "invalid", assurance: "none" });
  let request; try { request = await signatureRequest(root); } catch { return Object.freeze({ schema: "pipeline.audit-bundle-signature-verification.v1", status: "invalid", assurance: "none" }); }
  if (record.manifestSha256 !== request.manifestSha256 || record.bundleId !== request.bundleId || canonicalizeJson(record.candidate) !== canonicalizeJson(request.candidate) || record.effectivePolicySha256 !== request.effectivePolicySha256) return Object.freeze({ schema: "pipeline.audit-bundle-signature-verification.v1", status: "invalid", assurance: "none" });
  const provider = await verify(Object.freeze({ ...record }));
  if (!exact(provider, ["verified"]) || typeof provider.verified !== "boolean") fail("AB-SIGNATURE-VERIFY-PROVIDER");
  return Object.freeze({ schema: "pipeline.audit-bundle-signature-verification.v1", status: provider.verified ? "verified" : "invalid", assurance: provider.verified ? "cryptographic-binding-only" : "none", manifestSha256: record.manifestSha256, signerKeyId: record.signerKeyId });
}
