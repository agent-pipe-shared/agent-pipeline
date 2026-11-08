// SPDX-License-Identifier: SUL-1.0
/**
 * P3 (C20D-P3-ONE-SHOT-CLOSE, AC-108): reads the PUBLIC signed approval proof objects that authorized a feature candidate, for the audit
 * bundle's proofs/ directory. Read-only: it never signs, consumes or writes anything, and it never reads a private key (a proof object holds the
 * signer's public key and signature only).
 *
 * Sources, in the order the human-approval trace enumerates them:
 *   - the plan approval's signed design approval, kept in the State;
 *   - the private critical approval store (push and feature-package-reconcile envelopes) for exactly this candidate commit.
 * A human guard override capability keeps no proof (the trace reports it as PROOF-NOT-RETAINED-IN-CAPABILITY); it is named as a typed gap, as is an
 * envelope whose proof is not a verifiable public proof object. A gap never blocks the close.
 *
 * C20E-AP (AC-108): `writeAuditProofFollowUp` / `prepareAuditProofFollowUp` below are the ONE writer of this module: after the push and release
 * approvals exist they add the approved commit's public proofs to the bundle the close already committed, as NEW files only (see lib/audit-bundle.mjs).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_BUNDLE_FOLLOWUP_PATH, AUDIT_BUNDLE_FOLLOWUP_SCHEMA, auditBundleProofBytes, followUpAttributionShape, isCarriableProof } from "./audit-bundle.mjs";
import { CRITICAL_APPROVAL_STORE_SCHEMA, criticalApprovalStoreRoot, readLastPrivateApproval } from "./critical-action-authorization.mjs";
import { canonicalizeJson, parseStrictJson } from "./governance-event.mjs";

const STORE_KINDS = Object.freeze(["push", "feature-package-reconcile"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

/** @returns {{ proofs: Array<{kind: string, proof: object}>, gaps: Array<{kind: string, code: string}> }} */
export function collectAuditProofs({ common, candidate, state } = {}) {
  const proofs = []; const gaps = []; const seen = new Set();
  const take = (kind, proof, source) => {
    if (!isCarriableProof(proof)) { gaps.push({ kind, code: `PROOF-NOT-CARRIABLE:${source}` }); return; }
    const key = `${kind}:${proof.intentSha256}`;
    if (!seen.has(key)) { seen.add(key); proofs.push({ kind, proof: { ...proof } }); }
  };
  const design = state?.planApproval?.designApproval;
  if (object(design) && design.mode === "signature") take("plan-approval", design.proof, "state:planApproval");
  if (typeof common === "string" && common !== "" && object(candidate)) {
    for (const kind of STORE_KINDS) {
      const directory = join(criticalApprovalStoreRoot(common), "approvals", kind); let names = [];
      try { names = readdirSync(directory).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort().slice(0, 256); } catch { names = []; }
      for (const name of names) {
        const envelope = readJson(join(directory, name));
        if (!object(envelope) || envelope.schema !== CRITICAL_APPROVAL_STORE_SCHEMA || envelope.kind !== kind || !object(envelope.approval) || envelope.approval.forCommit !== candidate.commit) continue;
        if (object(envelope.approval.criticalProof?.proof)) take(kind, envelope.approval.criticalProof.proof, `store:${kind}/${name}`);
      }
    }
  }
  proofs.sort((a, b) => (a.kind + a.proof.intentSha256).localeCompare(b.kind + b.proof.intentSha256));
  return { proofs: proofs.slice(0, 16), gaps };
}

const BUNDLE_DIR = /^audit-bundles\/[a-z][a-z0-9-]{2,63}\/(?:[0-9a-f]{40}|[0-9a-f]{64})$/u; const FEATURE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u; const KIND = /^[a-z-]{1,40}$/u;
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
function followUpError(code, message) { const error = new Error(message); error.code = code; return error; }

/**
 * Adds the approved commit's proofs to an EXISTING bundle as new files: `proofs/NNN-<kind>.json` (numbering continues after the manifest's own proofs) and the one
 * list `proofs/follow-up.json`. manifest.json and README.md are never touched, every file is written create-only (`wx`), and a bundle that already has a
 * follow-up gets none (`already-followed-up`). `attributions` carry a chat-mode approval as kind, mode and time only: an attribution record, never a proof.
 * @returns {{status: "written", bundleDir: string, files: Array<{path: string, sha256: string}>} | {status: "already-followed-up"|"nothing-to-carry", bundleDir: string}}
 */
export function writeAuditProofFollowUp({ root, bundleDir, approvedCommit, proofs = [], attributions = [] } = {}) {
  if (typeof root !== "string" || !BUNDLE_DIR.test(bundleDir ?? "") || !OID.test(approvedCommit ?? "") || !Array.isArray(proofs) || !Array.isArray(attributions)) throw followUpError("AB-FOLLOWUP-INPUT", "The follow-up needs a repository, an existing bundle directory, the approved commit, proofs and attributions.");
  if (!proofs.every((entry) => object(entry) && KIND.test(entry.kind ?? "") && isCarriableProof(entry.proof))) throw followUpError("AB-PROOF-INVALID", "A signed proof envelope is not a verifiable public proof object.");
  if (!attributions.every(followUpAttributionShape)) throw followUpError("AB-FOLLOWUP-INPUT", "An attribution record is kind, mode and time only.");
  let manifest; try { manifest = parseStrictJson(readFileSync(join(root, bundleDir, "manifest.json"))); } catch { throw followUpError("AB-MANIFEST", "The bundle has no readable manifest.json."); }
  if (existsSync(join(root, bundleDir, AUDIT_BUNDLE_FOLLOWUP_PATH))) return { status: "already-followed-up", bundleDir };
  const carried = new Set((Array.isArray(manifest.proofs) ? manifest.proofs : []).map((entry) => entry?.intentSha256));
  const fresh = proofs.filter((entry) => !carried.has(entry.proof.intentSha256));
  if (fresh.length + attributions.length === 0) return { status: "nothing-to-carry", bundleDir };
  const first = (Array.isArray(manifest.proofs) ? manifest.proofs.length : 0) + 1;
  const written = fresh.map((entry, index) => { const path = `proofs/${String(first + index).padStart(3, "0")}-${entry.kind}.json`; const bytes = auditBundleProofBytes(entry.proof); return { kind: entry.kind, path, bytes, sha256: sha256Hex(bytes), intentSha256: entry.proof.intentSha256 }; });
  const list = { schema: AUDIT_BUNDLE_FOLLOWUP_SCHEMA, candidate: manifest.candidate, approvedCommit, proofs: written.map(({ kind, path, sha256, intentSha256 }) => ({ kind, path, sha256, intentSha256 })), attributions: attributions.map((entry) => ({ kind: entry.kind, mode: entry.mode, approvedAt: entry.approvedAt })) };
  const listBytes = Buffer.from(`${canonicalizeJson(list)}\n`, "utf8");
  mkdirSync(join(root, bundleDir, "proofs"), { recursive: true });
  for (const entry of written) writeFileSync(join(root, bundleDir, entry.path), entry.bytes, { flag: "wx", mode: 0o644 });
  writeFileSync(join(root, bundleDir, AUDIT_BUNDLE_FOLLOWUP_PATH), listBytes, { flag: "wx", mode: 0o644 });
  return { status: "written", bundleDir, files: [...written.map((entry) => ({ path: `${bundleDir}/${entry.path}`, sha256: entry.sha256 })), { path: `${bundleDir}/${AUDIT_BUNDLE_FOLLOWUP_PATH}`, sha256: sha256Hex(listBytes) }] };
}

function gitOut(root, args) { const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10_000 }); return result.status === 0 ? String(result.stdout).trim() : null; }
const attributionMode = (value) => (typeof value === "string" && /^[a-z-]{1,64}$/u.test(value) ? value : "unrecorded");
const attributionTime = (value) => (typeof value === "string" && value.length <= 40 ? value : null);

/** The feature's bundle for `approvedCommit`: named after the package candidate (an ancestor of the approved commit, never later), the latest one when several exist. */
function findBundleDir(root, featureId, approvedCommit) {
  const base = `audit-bundles/${featureId}`; const hasManifest = (name) => existsSync(join(root, base, name, "manifest.json"));
  if (hasManifest(approvedCommit)) return `${base}/${approvedCommit}`;
  let names = []; try { names = readdirSync(join(root, base)).filter((name) => OID.test(name) && hasManifest(name)); } catch { names = []; }
  const found = [];
  for (const name of names) {
    const manifest = readJson(join(root, base, name, "manifest.json"));
    if (manifest?.candidate?.commit !== name || spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", name, approvedCommit], { timeout: 10_000 }).status !== 0) continue;
    found.push({ name, depth: Number(gitOut(root, ["rev-list", "--count", name])) || 0 });
  }
  found.sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
  return found.length > 0 ? `${base}/${found[0].name}` : null;
}

/**
 * The release route's step (C20E-AP): collects what the push approval and the release approval of `approvedCommit` left (signed: the public proof objects;
 * chat or waiver: an attribution record) and adds it to the feature's bundle. Never blocking: no bundle is a typed notice (`no-bundle`).
 * @param {{root: string, featureId: string, approvedCommit: string, common: string, releaseProof: object|null, releaseApproval: {mode?: string, approvedAt?: string}|null}} input
 */
export function prepareAuditProofFollowUp({ root, featureId, approvedCommit, common, releaseProof = null, releaseApproval = null } = {}) {
  if (typeof root !== "string" || !FEATURE_ID.test(featureId ?? "") || !OID.test(approvedCommit ?? "")) return { status: "no-bundle" };
  const bundleDir = findBundleDir(root, featureId, approvedCommit);
  if (bundleDir === null) return { status: "no-bundle" };
  const proofs = collectAuditProofs({ common, candidate: { commit: approvedCommit } }).proofs.filter((entry) => entry.kind === "push");
  const attributions = [];
  if (proofs.length === 0) {
    const push = readLastPrivateApproval(common, "push")?.approval;
    if (object(push) && push.forCommit === approvedCommit) attributions.push({ kind: "push", mode: attributionMode(push.criticalProofWaiver?.mode ?? push.humanApproval?.mode), approvedAt: attributionTime(push.approvedAt) });
  }
  if (isCarriableProof(releaseProof)) proofs.push({ kind: "release-preflight", proof: { ...releaseProof } });
  else if (object(releaseApproval)) attributions.push({ kind: "release-preflight", mode: attributionMode(releaseApproval.mode), approvedAt: attributionTime(releaseApproval.approvedAt) });
  return writeAuditProofFollowUp({ root, bundleDir, approvedCommit, proofs, attributions });
}
