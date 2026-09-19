// SPDX-License-Identifier: SUL-1.0
/** Human authority for architecture adoption decisions. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createPoApprovalIntent, canonical } from "./po-approval-proof.mjs";
import { readHumanApprovalMode, readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { loadMapBundle } from "../scripts/module-inventory.mjs";
import moduleSchema from "../schemas/pipeline.module-inventory.v1.json" with { type: "json" };
export const loadAdoptionMap = root => loadMapBundle(root, moduleSchema);

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function git(root, args) {
  const out = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return out.status === 0 ? out.stdout.trim() : null;
}

function candidateFor(root) {
  const commit = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  return OID.test(commit ?? "") && OID.test(tree ?? "") && commit !== tree ? { commit, tree } : null;
}

function dateValue(value, field, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new TypeError(`${field} is required`);
    return null;
  }
  if (typeof value !== "string" || !DATE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a finite ISO date (YYYY-MM-DD)`);
  }
  return value;
}

export function scopeValue(scope) {
  const values = Array.isArray(scope) ? scope : [scope];
  if (values.length === 0 || values.some((item) => typeof item !== "string" || item.trim() === "" || item === "*")) {
    throw new TypeError("adoption scope must be non-empty and must not be wildcard");
  }
  const normalized = values.map((item) => item.replace(/\\/g, "/").trim());
  if (normalized.some(item => item.startsWith("/") || /[:*?\x00-\x1f]/u.test(item) || item.replace(/\/$/u, "").split("/").some(part => !part || part === "." || part === ".."))) throw new TypeError("adoption scope must be bounded repository-relative paths");
  return [...new Set(normalized)].sort();
}

export function adoptionSnapshot(rootDir) {
  const root = resolve(rootDir);
  const profileBytes = existsSync(join(root, "project/pipeline.json")) ? readFileSync(join(root, "project/pipeline.json"), "utf8") : null;
  const map = loadAdoptionMap(root);
  const mapDir = join(root, "architecture/map");
  const modules = existsSync(mapDir) ? readdirSync(mapDir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => ({ name: entry.name, sha256: hash(readFileSync(join(mapDir, entry.name), "utf8")) })).sort((a, b) => a.name.localeCompare(b.name)) : null;
  // Explicit absent brownfield inputs are bound too; no invented model identity.
  const profileSha256 = hash({ profileBytes });
  const routingBytes = existsSync(join(root, "pipeline.user.yaml")) ? readFileSync(join(root, "pipeline.user.yaml"), "utf8") : null;
  const modelSha256 = hash({ routingBytes });
  const moduleSnapshotSha256 = hash({ valid: map.ok, modules });
  return { profileSha256, modelSha256, moduleSnapshotSha256 };
}

export function buildAdoptionSubject({ rootDir, decision, scope, rationale, decidedAt, expiresAt = null, reviewDate = null, decisionRef, model, effort } = {}) {
  const root = resolve(rootDir);
  if (!decision || typeof decision !== "string" || !scope || typeof rationale !== "string" || rationale.trim() === "" || !decisionRef || typeof decisionRef !== "string") throw new TypeError("adoption subject is incomplete");
  const candidate = candidateFor(root);
  if (!candidate) throw new Error("adoption authority requires a repository candidate commit and tree");
  if (typeof decidedAt !== "string" || !Number.isFinite(Date.parse(decidedAt)) || new Date(decidedAt).toISOString() !== decidedAt) throw new TypeError("decidedAt must be canonical ISO-8601");
  if (expiresAt === "" || reviewDate === "") throw new TypeError("Empty adoption date");
  const dates = { expiresAt: dateValue(expiresAt, "expiresAt"), reviewDate: dateValue(reviewDate, "reviewDate") };
  const snapshot = adoptionSnapshot(root, { model, effort });
  const subject = {
    repositoryFingerprint: hash(realpathSync(root)),
    decision,
    scope: scopeValue(scope),
    rationale: rationale.trim(),
    decidedAt,
    ...dates,
    decisionRef,
    candidate,
    ...snapshot,
  };
  validateSubject(subject);
  return { subject, subjectSha256: hash(subject), candidate };
}

const SUBJECT_KEYS = ["repositoryFingerprint", "decision", "scope", "rationale", "decidedAt", "expiresAt", "reviewDate", "decisionRef", "candidate", "profileSha256", "modelSha256", "moduleSnapshotSha256"];
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = value => typeof value === "string" && value.trim() !== "" && value === value.trim();
function validateSubject(subject) {
  if (!exact(subject, SUBJECT_KEYS) || !["approved-scoped", "deferred", "partial"].includes(subject.decision) || !text(subject.rationale) || !text(subject.decisionRef)) throw new Error("ADOPTION-SUBJECT-INVALID");
  if (canonical(scopeValue(subject.scope)) !== canonical(subject.scope)) throw new Error("ADOPTION-SCOPE-NONCANONICAL");
  if (typeof subject.decidedAt !== "string" || !Number.isFinite(Date.parse(subject.decidedAt)) || new Date(subject.decidedAt).toISOString() !== subject.decidedAt) throw new Error("ADOPTION-DATE-INVALID");
  for (const key of ["expiresAt", "reviewDate"]) {
    if (subject[key] !== null && (typeof subject[key] !== "string" || subject[key] === "")) throw new Error("ADOPTION-DATE-INVALID");
    dateValue(subject[key], key);
  }
  if (subject.decision === "deferred" && !subject.expiresAt && !subject.reviewDate) throw new Error("ADOPTION-DEFERRAL-DATE-REQUIRED");
  for (const key of ["repositoryFingerprint", "profileSha256", "modelSha256", "moduleSnapshotSha256"]) if (!SHA.test(subject[key])) throw new Error("ADOPTION-DIGEST-INVALID");
  const c = subject.candidate;
  if (!exact(c, ["commit", "tree"]) || !OID.test(c.commit) || !OID.test(c.tree) || /^0+$/u.test(c.commit) || c.commit === c.tree) throw new Error("ADOPTION-CANDIDATE-INVALID");
}
function intentFor(subject) {
  validateSubject(subject);
  return createPoApprovalIntent({
    kind: "architecture-adoption",
    featureId: "architecture-adoption",
    planSha256: hash({ kind: "architecture-adoption", subject }),
    specSha256: hash({ contract: "adoption-authority-v1", subjectKeys: SUBJECT_KEYS }),
    candidate: subject.candidate,
    policyRevision: "adoption-authority-v1",
    subjectSha256: hash(subject),
    decision: subject.decision,
  });
}
export function prepareAdoptionAuthority(options = {}) {
  const mode = readHumanApprovalMode(options.rootDir);
  const subjectData = buildAdoptionSubject(options);
  return { schema: "pipeline.adoption-approval-request.v1", mode: mode.mode === "chat" ? "chat-attributed-unattested" : "signature", intent: intentFor(subjectData.subject), subject: subjectData.subject, subjectSha256: subjectData.subjectSha256 };
}

function anchorsFor(policy) {
  if (!policy.ok) return null;
  if (Array.isArray(policy.trustAnchors)) return policy.trustAnchors;
  return policy.trustAnchor ? [policy.trustAnchor] : [];
}

export function verifyAdoptionAuthority({ rootDir, request, proof, chatApproval = null, requireCurrent = false } = {}) {
  try {
    if (!exact(request, ["schema", "mode", "intent", "subject", "subjectSha256"]) || request.schema !== "pipeline.adoption-approval-request.v1") throw new Error("ADOPTION-AUTHORITY-MISSING");
    validateSubject(request.subject);
    if (request.subjectSha256 !== hash(request.subject) || canonical(request.intent) !== canonical(intentFor(request.subject))) throw new Error("ADOPTION-AUTHORITY-INTENT-MISMATCH");
    if (request.subject.repositoryFingerprint !== hash(realpathSync(rootDir))) throw new Error("ADOPTION-AUTHORITY-REPOSITORY-MISMATCH");
    if (requireCurrent && (canonical(request.subject.candidate) !== canonical(candidateFor(rootDir)) || Object.entries(adoptionSnapshot(rootDir)).some(([key, value]) => request.subject[key] !== value))) throw new Error("ADOPTION-AUTHORITY-INPUT-CHANGED");
  } catch (error) { return { ok: false, code: error.message }; }
  const mode = readHumanApprovalMode(rootDir);
  if (mode.mode === "chat") {
    if (request.mode !== "chat-attributed-unattested" || !exact(chatApproval, ["mode", "by", "decisionRef", "intentSha256"]) || chatApproval.mode !== "chat-attributed-unattested" || !text(chatApproval.by) || !text(chatApproval.decisionRef) || chatApproval.intentSha256 !== request.intent.sha256) return { ok: false, code: "ADOPTION-CHAT-ATTRIBUTION-MISSING" };
    return { ok: true, mode: "chat-attributed-unattested", humanApproval: chatApproval };
  }
  if (mode.mode !== "signature" || request.mode !== "signature") return { ok: false, code: "ADOPTION-AUTHORITY-MODE-INVALID" };
  const policy = readCriticalHumanProofPolicy(rootDir);
  if (!policy.ok) return { ok: false, code: policy.code };
  const verified = verifyAgainstTrustAnchors({ intent: request.intent, anchors: anchorsFor(policy), proof });
  return verified.verified ? { ok: true, mode: "signature", proof, signer: verified.signer, proofSha256: verified.proofSha256 } : { ok: false, code: verified.code };
}

export function atomicWriteAdoptionState(statePath, value) {
  const tmp = `${statePath}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(tmp, statePath);
}

export { DATE, SHA };
