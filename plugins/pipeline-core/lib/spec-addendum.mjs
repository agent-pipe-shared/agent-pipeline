// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0095 (candidate 28e, PO tiles 2026-11-13): a Spec correction found by a Critic round during implementation is a separate file
 * `specs/<feature>/spec-addendum-<NN>.md`; the Spec stays byte-identical.
 *
 * This module is the one definition every party uses:
 * - `buildSpecAddendumSubject` derives the approved subject from the repository (HEAD, the package manifest, the consumed Critic packet),
 *   never from a caller's claim. The PO's signing terminal (`po-human-approval.mjs authorize-critical --kind spec-addendum`) and the
 *   recording step (`pipeline-state.mjs approve-spec-addendum`) both call it, so they cannot disagree about what was approved.
 * - `specAddendumApprovalBytes` renders the committed approval record.
 * - `readSpecAddenda` is the reader of the Goldfish briefing, the delta request, the close and the audit bundle.
 *
 * v1 never lets an addendum change the criterion set: an id it names that the base Spec does not name is refused
 * (SPEC-ADDENDUM-CRITERIA), because the Critic course is bound to that set; adding or dropping a criterion stays the PO's reopen-design.
 * Unrelated to the Critic's `critic-disposition-addendum`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

// This module is a LEAF (node built-ins only): po-human-approval.mjs, pipeline-state.mjs, the close and the briefing generator import it,
// and an import of critic-accepted-contract.mjs here closed a cycle through pipeline-state.mjs that left SPEC_ADDENDUM_KIND uninitialized
// when the briefing generator was the entry point. The two values below are therefore restated; spec-addendum.test.mjs pins both equal to
// their owners (critic-accepted-contract.mjs CRITERION_ID_SOURCE, critic-packet-preflight-read.mjs canonicalJson).
export const SPEC_ADDENDUM_CRITERION_ID_SOURCE = "AC-(?:[1-9][0-9]{0,60}|E[1-9][0-9]{0,3}-[0-9]{1,4}-[0-9]{1,4})";
const CRITERION_ID_SOURCE = SPEC_ADDENDUM_CRITERION_ID_SOURCE;
export const specAddendumReceiptCanonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const canonicalJson = specAddendumReceiptCanonicalJson;

export const SPEC_ADDENDUM_KIND = "spec-addendum";
export const SPEC_ADDENDUM_APPROVAL_SCHEMA = "pipeline.spec-addendum-approval.v1";
const FEATURE_ID = /^[a-z0-9][a-z0-9._-]{0,62}$/u;
const PACKET = /^[a-f0-9]{32}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FINDING_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const criterionPattern = () => new RegExp(`(?<![A-Za-z0-9-])${CRITERION_ID_SOURCE}(?![0-9-])`, "gu");

/** `specs/<feature>/spec-addendum-<NN>.md`, NN 01..99; returns the number or null. */
export function specAddendumNumber(featureId, path) {
  if (!FEATURE_ID.test(featureId ?? "") || typeof path !== "string") return null;
  const match = new RegExp(`^specs/${escape(featureId)}/spec-addendum-(0[1-9]|[1-9][0-9])\\.md$`, "u").exec(path);
  return match === null ? null : Number(match[1]);
}
export const specAddendumPath = (featureId, number) => `specs/${featureId}/spec-addendum-${String(number).padStart(2, "0")}.md`;
export const SPEC_ADDENDUM_APPROVAL_FILE = /^specs\/[a-z0-9][a-z0-9._-]{0,62}\/evidence\/spec-addendum-approval-[a-f0-9]{64}\.json$/u;
export const specAddendumApprovalPath = (featureId, bytes) => `specs/${featureId}/evidence/spec-addendum-approval-${digest(bytes)}.json`;
/** True for a path no close or evidence commit may carry: the addendum is content until a delta round consumed it. */
export const isSpecAddendumPath = (path) => typeof path === "string" && /^specs\/[^/]+\/spec-addendum-[0-9]{2}\.md$/u.test(path);

/** The criterion ids a text names, by the review unit's own grammar. */
export function criterionIdsIn(text) {
  return [...new Set(String(text ?? "").match(criterionPattern()) ?? [])].sort();
}

const refusal = (code, detail) => ({ ok: false, code, detail });

/**
 * The three header lines, strictly: `Base Spec: <path> sha256:<digest>`, `Critic packet: <id>`, `Findings: <id>[, <id>]...`.
 * Nothing is guessed: another first line, a missing line or a malformed value is refused.
 */
export function parseSpecAddendum(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes ?? "");
  const lines = text.split("\n");
  const base = /^Base Spec: (specs\/[^\s]+) sha256:([a-f0-9]{64})$/u.exec(lines[0] ?? "");
  const packet = /^Critic packet: ([a-f0-9]{32})$/u.exec(lines[1] ?? "");
  const findings = /^Findings: (.+)$/u.exec(lines[2] ?? "");
  if (base === null || packet === null || findings === null) {
    return refusal("SPEC-ADDENDUM-HEADER", "the addendum must open with exactly three lines: \"Base Spec: <spec path> sha256:<digest>\", \"Critic packet: <32-hex id>\" and \"Findings: CRF-<packet>-<n>[, CRF-<packet>-<n>]...\"");
  }
  const findingIds = findings[1].split(",").map((value) => value.trim());
  if (findingIds.length === 0 || findingIds.length > 64 || findingIds.some((id) => !FINDING_ID.test(id)) || new Set(findingIds).size !== findingIds.length) {
    return refusal("SPEC-ADDENDUM-HEADER", "the Findings line must list 1 to 64 distinct finding ids separated by commas");
  }
  if (lines.slice(3).join("\n").trim().length === 0) return refusal("SPEC-ADDENDUM-HEADER", "the addendum states no correction below its header");
  return { ok: true, specPath: base[1], specSha256: base[2], packetId: packet[1], findingIds: [...findingIds].sort() };
}

/** v1: every criterion id the addendum names must be an id of the base Spec. */
export function specAddendumCriteriaRefusal(addendumBytes, specBytes) {
  const allowed = new Set(criterionIdsIn(specBytes));
  const foreign = criterionIdsIn(addendumBytes).filter((id) => !allowed.has(id));
  return foreign.length === 0 ? null : refusal("SPEC-ADDENDUM-CRITERIA",
    `the addendum names criterion id(s) the approved Spec does not name (${foreign.join(", ")}); an addendum corrects inside the existing criteria and never adds or drops one. `
    + "A changed criterion set is the PO's reopen-design (a new design round with a new signature): run reopen-design --by <label> --dry-run and put its cost to the PO.");
}

function git(root, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: encoding === "buffer" ? null : encoding, shell: false, timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}
const blobAt = (root, commit, path) => {
  const type = git(root, ["cat-file", "-t", `${commit}:${path}`]);
  if (type === null || type.trim() !== "blob") return null;
  return git(root, ["show", `${commit}:${path}`], "buffer");
};
const manifestAt = (root, commit, featureId) => {
  const bytes = blobAt(root, commit, `specs/${featureId}/lifecycle.json`);
  try { return bytes === null ? null : JSON.parse(bytes.toString("utf8")); } catch { return null; }
};
const approvedSpecOf = (manifest) => {
  const specs = Array.isArray(manifest?.artifacts) ? manifest.artifacts.filter((entry) => entry?.class === "spec" && entry.authority === true) : [];
  return specs.length === 1 && typeof specs[0].path === "string" && SHA256.test(specs[0].sha256 ?? "") ? specs[0] : null;
};
const registeredAddenda = (manifest, featureId) => (Array.isArray(manifest?.artifacts) ? manifest.artifacts : [])
  .filter((entry) => entry?.class === "design" && specAddendumNumber(featureId, entry.path) !== null);

/**
 * The approved subject, derived from HEAD. The addendum must be committed at HEAD with the working file identical, its header must
 * bind the package's approved Spec, the packet must be a consumed Critic packet whose reviewed candidate is an ancestor of HEAD, every
 * finding id must be one of that packet's findings, the criterion set must not change, and its number must be the next one.
 */
export function buildSpecAddendumSubject({ root, featureId, addendumPath, controlRoot, readReceipt, readResult }) {
  const number = specAddendumNumber(featureId, addendumPath);
  if (number === null) return refusal("SPEC-ADDENDUM-PATH", `the addendum must be specs/${featureId ?? "<feature>"}/spec-addendum-<NN>.md (NN 01..99)`);
  const head = git(root, ["rev-parse", "HEAD"])?.trim(), tree = git(root, ["rev-parse", "HEAD^{tree}"])?.trim();
  if (!head || !tree) return refusal("SPEC-ADDENDUM-REPOSITORY", "HEAD could not be read");
  const bytes = blobAt(root, head, addendumPath);
  if (bytes === null) return refusal("SPEC-ADDENDUM-UNCOMMITTED", `${addendumPath} is not committed at HEAD; commit the addendum alone, then ask for the approval`);
  let working;
  try {
    const stat = lstatSync(join(root, addendumPath));
    working = stat.isFile() && !stat.isSymbolicLink() ? readFileSync(join(root, addendumPath)) : null;
  } catch { working = null; }
  if (working === null || !working.equals(bytes)) return refusal("SPEC-ADDENDUM-UNCOMMITTED", `${addendumPath} in the working tree differs from HEAD; commit it first`);
  const header = parseSpecAddendum(bytes);
  if (!header.ok) return header;
  const manifest = manifestAt(root, head, featureId);
  const spec = approvedSpecOf(manifest);
  if (spec === null) return refusal("SPEC-ADDENDUM-BASE", `specs/${featureId}/lifecycle.json at HEAD names no single approved Spec`);
  if (header.specPath !== spec.path || header.specSha256 !== spec.sha256) {
    return refusal("SPEC-ADDENDUM-BASE", `the header must name the approved Spec: "Base Spec: ${spec.path} sha256:${spec.sha256}"`);
  }
  const specBytes = blobAt(root, head, spec.path);
  if (specBytes === null || digest(specBytes) !== spec.sha256) return refusal("SPEC-ADDENDUM-BASE", `${spec.path} at HEAD no longer holds the approved bytes; the Spec stays byte-identical and the correction goes into the addendum`);
  const criteria = specAddendumCriteriaRefusal(bytes, specBytes);
  if (criteria !== null) return criteria;
  const prior = registeredAddenda(manifest, featureId);
  if (prior.some((entry) => entry.path === addendumPath)) return refusal("SPEC-ADDENDUM-ORDER", `${addendumPath} is already registered`);
  if (number !== prior.length + 1) return refusal("SPEC-ADDENDUM-ORDER", `the next addendum of this package is ${specAddendumPath(featureId, prior.length + 1)}`);
  let receipt, findings;
  try {
    receipt = readReceipt({ controlRoot, packetId: header.packetId }).receipt;
    findings = readResult({ controlRoot, packetId: header.packetId }).result.verdict.findings;
  } catch (error) { return refusal("SPEC-ADDENDUM-PACKET", `the Critic packet ${header.packetId} is not a consumed packet of this repository (${typeof error?.code === "string" ? error.code : "unreadable"})`); }
  const reviewed = receipt?.candidate?.commit;
  if (typeof reviewed !== "string" || !Array.isArray(findings)) return refusal("SPEC-ADDENDUM-PACKET", `the Critic packet ${header.packetId} could not be read`);
  if (spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", reviewed, head], { shell: false, timeout: 15000 }).status !== 0) {
    return refusal("SPEC-ADDENDUM-PACKET", `the Critic packet ${header.packetId} reviewed ${reviewed}, which is not an ancestor of HEAD`);
  }
  // The consumed verdict's own projection names findings `CRF-<packet>-<index + 1>` (projectConsumedCriticFindings, open-minors).
  const known = new Set(findings.map((_, index) => `CRF-${header.packetId}-${index + 1}`));
  const unknown = header.findingIds.filter((id) => !known.has(id));
  if (unknown.length > 0) return refusal("SPEC-ADDENDUM-FINDINGS", `finding id(s) ${unknown.join(", ")} are not findings of the Critic packet ${header.packetId}`);
  return {
    ok: true, number, candidate: { commit: head, tree },
    subject: { featureId, specPath: spec.path, specSha256: spec.sha256, addendumPath, addendumSha256: digest(bytes), packetId: header.packetId,
      criticReceiptSha256: digest(canonicalJson(receipt)), findingIds: header.findingIds },
  };
}

/** The committed approval record; its path is named by the digest of these bytes. */
export function specAddendumApprovalBytes({ subject, candidate, subjectSha256, approvedBy, approvedAt, mode, proofSha256 = null }) {
  return Buffer.from(`${JSON.stringify({ schema: SPEC_ADDENDUM_APPROVAL_SCHEMA, kind: SPEC_ADDENDUM_KIND, subject, candidate, subjectSha256, approvedBy, approvedAt, mode, proofSha256 }, null, 2)}\n`);
}

function validApproval(record, featureId) {
  const s = record?.subject;
  return object(record) && record.schema === SPEC_ADDENDUM_APPROVAL_SCHEMA && record.kind === SPEC_ADDENDUM_KIND
    && object(s) && s.featureId === featureId && specAddendumNumber(featureId, s.addendumPath) !== null
    && typeof s.specPath === "string" && SHA256.test(s.specSha256 ?? "") && SHA256.test(s.addendumSha256 ?? "") && PACKET.test(s.packetId ?? "")
    && SHA256.test(s.criticReceiptSha256 ?? "") && Array.isArray(s.findingIds) && s.findingIds.every((id) => FINDING_ID.test(id))
    && object(record.candidate) && typeof record.candidate.commit === "string" && SHA256.test(record.subjectSha256 ?? "")
    && typeof record.approvedBy === "string" && record.approvedBy.trim() !== "" && ["signature", "chat-attributed-unattested"].includes(record.mode)
    && (record.mode === "signature" ? SHA256.test(record.proofSha256 ?? "") : record.proofSha256 === null);
}

/**
 * The approved addenda of a package, in order. `read(path)` returns a file's bytes (the working tree by default, or a commit's tree).
 * Each approval record must be registered as candidate evidence, the addendum next to it as a design entry with the approved digest,
 * and both files must hold those bytes. An addendum whose base Spec digest is not the package's approved one is `superseded` (the PO
 * reopened and re-approved the design): history, neither applied nor refused.
 */
export function readSpecAddenda({ root, featureId, manifest, read = (path) => readFileSync(join(root, path)) }) {
  const spec = approvedSpecOf(manifest);
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const addenda = [], findings = [];
  for (const entry of artifacts) {
    if (entry?.class !== "candidate-evidence" || !SPEC_ADDENDUM_APPROVAL_FILE.test(entry.path ?? "") || !entry.path.startsWith(`specs/${featureId}/`)) continue;
    let bytes, record;
    try { bytes = read(entry.path); record = JSON.parse(bytes.toString("utf8")); } catch { findings.push(`${entry.path}: unreadable`); continue; }
    if (digest(bytes) !== entry.sha256 || entry.path !== specAddendumApprovalPath(featureId, bytes)) { findings.push(`${entry.path}: does not hold its registered bytes`); continue; }
    if (!validApproval(record, featureId)) { findings.push(`${entry.path}: not a valid Spec addendum approval`); continue; }
    const s = record.subject;
    const registered = artifacts.find((other) => other?.class === "design" && other.path === s.addendumPath);
    if (!registered || registered.sha256 !== s.addendumSha256) { findings.push(`${entry.path}: ${s.addendumPath} is not registered with the approved digest`); continue; }
    let addendumBytes;
    try { addendumBytes = read(s.addendumPath); } catch { findings.push(`${s.addendumPath}: unreadable`); continue; }
    if (digest(addendumBytes) !== s.addendumSha256) { findings.push(`${s.addendumPath}: does not hold its approved bytes (SPEC-ADDENDUM-DIGEST)`); continue; }
    addenda.push({ number: specAddendumNumber(featureId, s.addendumPath), path: s.addendumPath, sha256: s.addendumSha256, approvalPath: entry.path,
      approvalSha256: entry.sha256, packetId: s.packetId, findingIds: s.findingIds, approvedBy: record.approvedBy, mode: record.mode,
      approvedCommit: record.candidate.commit, status: spec !== null && s.specPath === spec.path && s.specSha256 === spec.sha256 ? "applied" : "superseded" });
  }
  addenda.sort((a, b) => a.number - b.number);
  const applied = addenda.filter((addendum) => addendum.status === "applied");
  // Numbers run across the package's whole life (a superseded addendum keeps its number), so the next one is never reused.
  if (addenda.some((addendum, index) => addendum.number !== index + 1)) findings.push("the registered addenda are not numbered 01, 02, ... without a gap");
  return findings.length === 0 ? { ok: true, addenda, applied } : { ok: false, code: "SPEC-ADDENDUM-READ", findings, addenda, applied };
}
