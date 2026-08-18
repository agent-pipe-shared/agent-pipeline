// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, portable feature-package topology.
 *
 * This is deliberately an opt-in authority: compatibility repositories are
 * inventoried but never guessed into a lifecycle state.  Once a package has a
 * lifecycle.json manifest, all its authority paths and evidence bindings are
 * checked through this single contract.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { PLAN_LIFECYCLE_STATUSES } from "./plan-spec-state-v2.mjs";

export const FEATURE_PACKAGE_SCHEMA = "pipeline.feature-package.v1";
export const FEATURE_STATES = Object.freeze([...PLAN_LIFECYCLE_STATUSES, "verifying", "completed", "superseded", "abandoned", "retained"]);
export const FEATURE_CLASSES = Object.freeze(["prd", "spec", "design", "plan", "acceptance", "result", "candidate-evidence", "supply-chain", "threat-model"]);
const ACTIVE_STATES = new Set(["awaiting-approval", "approved", "implementing", "verifying", "completed"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const AMENDMENT_AT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/u;
const ARTIFACT_KEYS = Object.freeze(["class", "path", "sha256", "authority", "mutability", "retention"]);

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function canonicalRelative(root, value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\")) return null;
  const cleaned = posix.normalize(value);
  if (cleaned !== value || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) return null;
  const full = resolve(root, value);
  const rel = relative(root, full);
  return rel === "" || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : value;
}
function packageRelative(id, value) {
  const prefix = `specs/${id}/`;
  return typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : null;
}
function regularFile(root, path, findings, code) {
  const safe = canonicalRelative(root, path);
  if (!safe) { findings.push(`${code}: unsafe path`); return null; }
  try {
    const stat = lstatSync(join(root, safe));
    if (!stat.isFile() || stat.isSymbolicLink()) { findings.push(`${code}: path must be a regular non-symlink file`); return null; }
    return safe;
  } catch { findings.push(`${code}: referenced file is missing`); return null; }
}
function walk(root, start) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(relative(root, full).split(sep).join("/"));
    }
  };
  if (existsSync(join(root, start))) visit(join(root, start));
  return files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
// ---- PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND: lightweight, non-PO-gated resync ----
// (backlog: 2026-08-17-acceptance-md-edits-repeatedly-drift-lifecycle-json-bound-digest.md)
//
// Applies ONLY to an entry whose OWN `mutability` is exactly "mutable" -- an
// artifact's declared class, never `authority` (an acceptance.md entry is
// routinely both `authority: true` and `mutability: "mutable"`, and is
// exactly the case this exists for). `immutable` and `append-only` entries
// are never touched by this helper and keep hitting FTP-ARTIFACT-2, requiring
// the PO-signed `feature-package-reconcile` ceremony (see
// `planFeaturePackageReconcile` below) for any digest rebind -- that
// separation is the entire point, so this check is the one hardcoded
// class test and is never made configurable.
function autoRebindMutableArtifact(root, id, artifact) {
  if (!object(artifact) || artifact.mutability !== "mutable") return null;
  const rel = packageRelative(id, artifact.path);
  if (!rel || !canonicalRelative(root, artifact.path)) return null;
  const file = regularFile(root, artifact.path, [], "FTP-AUTOREBIND");
  if (!file || !SHA256.test(artifact.sha256 ?? "")) return null;
  const currentSha256 = digest(readFileSync(join(root, file)));
  if (currentSha256 === artifact.sha256) return null;
  return { path: artifact.path, class: artifact.class, from: artifact.sha256, to: currentSha256, at: new Date().toISOString() };
}

function caseFoldedPackageFiles(root, id) {
  const folded = new Map();
  if (!SAFE_ID.test(id ?? "")) return folded;
  for (const path of walk(root, `specs/${id}`)) {
    const key = path.normalize("NFKC").toLocaleLowerCase("en-US");
    folded.set(key, [...(folded.get(key) ?? []), path]);
  }
  return folded;
}

export function inventoryFeaturePackages(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const specs = join(root, "specs");
  if (!existsSync(specs)) return { packages: [], legacy: [], unknown: [] };
  const packages = []; const legacy = []; const unknown = [];
  for (const entry of readdirSync(specs, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) { unknown.push(`specs/${entry.name}`); continue; }
    const base = `specs/${entry.name}`;
    if (existsSync(join(root, base, "lifecycle.json"))) packages.push(`${base}/lifecycle.json`);
    else legacy.push(base);
  }
  return { packages, legacy, unknown };
}

/**
 * Validate one complete package without treating historical files as authority.
 *
 * `previousManifest` is an optional prior manifest value (the same shape this
 * module already treats as a reconcile preimage) supplied by the caller when it
 * has one available (e.g. from git history). When present, it is the baseline an
 * `immutable` artifact's digest is compared against: a rebind away from that
 * baseline requires a matching `amendment` record on the entry (PHX-WP-MANIFEST-AMENDMENT).
 * When absent, no such baseline exists, so the invariant cannot be enforced and
 * only the amendment record's own shape (if present) is validated.
 *
 * `options.autoRebindMutable` (default false, so every existing caller is
 * unaffected) opts into PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND: before findings
 * are computed, any artifact whose OWN `mutability` is exactly "mutable" and
 * whose bound digest no longer matches its current file bytes is rewritten
 * in place -- sha256 updated, an `amendment` audit record attached (`at`,
 * `reason`, `previousSha256`) -- and the manifest is persisted with the
 * rebind(s) applied, so FTP-ARTIFACT-2 never fires for that entry. This is
 * deliberately NOT gated by a signed ceremony (contrast
 * `planFeaturePackageReconcile`); `immutable`/`append-only` entries are never
 * touched here, whatever this flag is set to.
 */
export function validateFeaturePackage(rootDir = process.cwd(), manifestPath, previousManifest = null, options = {}) {
  const root = resolve(rootDir); const findings = [];
  const manifest = regularFile(root, manifestPath, findings, "FTP-MANIFEST");
  if (!manifest) return { ok: false, findings, receipt: null };
  let value;
  try { value = JSON.parse(readFileSync(join(root, manifest), "utf8")); }
  catch { return { ok: false, findings: [...findings, "FTP-MANIFEST: invalid JSON"], receipt: null }; }
  if (!exact(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])) findings.push("FTP-MANIFEST: closed schema keys are required");
  if (value?.schema !== FEATURE_PACKAGE_SCHEMA) findings.push("FTP-MANIFEST: unsupported schema");
  if (!exact(value?.feature, ["id", "rigor"]) || !SAFE_ID.test(value?.feature?.id ?? "") || ![1, 2].includes(value?.feature?.rigor)) findings.push("FTP-FEATURE: id and rigor are invalid");
  const id = value?.feature?.id;
  if (!FEATURE_STATES.includes(value?.state)) findings.push("FTP-STATE: unsupported lifecycle state");
  if (!Array.isArray(value?.artifacts)) findings.push("FTP-ARTIFACTS: artifacts must be an array");
  if (!(value?.candidate === null || exact(value?.candidate, ["commit", "tree"]))) findings.push("FTP-CANDIDATE: candidate must be null or a closed commit/tree binding");
  if (value?.candidate !== null && (!OID.test(value.candidate?.commit ?? "") || !OID.test(value.candidate?.tree ?? ""))) findings.push("FTP-CANDIDATE: candidate identity is invalid");
  if (!(value?.supersedes === null || (typeof value?.supersedes === "string" && SAFE_ID.test(value.supersedes)))) findings.push("FTP-SUPERSEDES: relationship must be null or a safe feature id");

  const rebinds = [];
  if (options?.autoRebindMutable === true && SAFE_ID.test(id ?? "") && Array.isArray(value?.artifacts)) {
    let mutated = false;
    const nextArtifacts = value.artifacts.map((artifact) => {
      const rebind = autoRebindMutableArtifact(root, id, artifact);
      if (!rebind) return artifact;
      mutated = true;
      rebinds.push(rebind);
      return { ...artifact, sha256: rebind.to, amendment: { at: rebind.at, reason: "auto-rebind: mutable-class artifact digest resynced to current file bytes (non-PO-gated)", previousSha256: rebind.from } };
    });
    if (mutated) {
      value = { ...value, artifacts: nextArtifacts };
      writeFileSync(join(root, manifest), `${JSON.stringify(value, null, 2)}\n`);
    }
  }

  const previousByPath = new Map();
  if (Array.isArray(previousManifest?.artifacts)) {
    for (const prior of previousManifest.artifacts) if (object(prior) && typeof prior.path === "string") previousByPath.set(prior.path, prior);
  }
  const seen = new Set(); const folded = new Set(); const classes = new Map();
  const packageFiles = caseFoldedPackageFiles(root, id);
  for (const [index, artifact] of (Array.isArray(value?.artifacts) ? value.artifacts : []).entries()) {
    const label = `FTP-ARTIFACT-${index}`;
    const hasAmendment = object(artifact) && Object.prototype.hasOwnProperty.call(artifact, "amendment");
    if (!exact(artifact, hasAmendment ? [...ARTIFACT_KEYS, "amendment"] : ARTIFACT_KEYS)) { findings.push(`${label}: closed artifact keys are required`); continue; }
    if (hasAmendment) {
      const amendment = artifact.amendment;
      if (!exact(amendment, ["at", "reason", "previousSha256"])
        || typeof amendment.at !== "string" || !AMENDMENT_AT.test(amendment.at)
        || typeof amendment.reason !== "string" || amendment.reason.trim().length === 0
        || !SHA256.test(amendment.previousSha256 ?? "")) {
        findings.push(`${label}: amendment must be a closed {at, reason, previousSha256} record`);
      }
    }
    const previousEntry = previousByPath.get(artifact.path);
    if (previousEntry && artifact.mutability === "immutable" && SHA256.test(previousEntry.sha256 ?? "") && SHA256.test(artifact.sha256 ?? "") && previousEntry.sha256 !== artifact.sha256) {
      if (!hasAmendment) findings.push(`${label}: immutable entry rebound without an amendment record`);
      else if (artifact.amendment?.previousSha256 !== previousEntry.sha256) findings.push(`${label}: amendment.previousSha256 must equal the previously recorded digest`);
    }
    if (!FEATURE_CLASSES.includes(artifact.class)) findings.push(`${label}: unsupported class`);
    const rel = packageRelative(id, artifact.path);
    if (!rel || !canonicalRelative(root, artifact.path)) findings.push(`${label}: path must be canonical within specs/${id}/`);
    const file = rel ? regularFile(root, artifact.path, findings, label) : null;
    const caseKey = typeof artifact.path === "string" ? artifact.path.normalize("NFKC").toLocaleLowerCase("en-US") : "";
    if (caseKey && folded.has(caseKey)) findings.push(`${label}: case-fold or Unicode-normalization collision`);
    if (caseKey) folded.add(caseKey);
    if (caseKey && (packageFiles.get(caseKey)?.length ?? 0) > 1) findings.push(`${label}: filesystem case-fold or Unicode-normalization collision`);
    if (file && seen.has(file)) findings.push(`${label}: duplicate artifact path`);
    if (file) seen.add(file);
    if (!SHA256.test(artifact.sha256 ?? "") || (file && digest(readFileSync(join(root, file))) !== artifact.sha256)) findings.push(`${label}: digest does not bind file bytes`);
    if (typeof artifact.authority !== "boolean" || !["mutable", "append-only", "immutable"].includes(artifact.mutability) || !["active", "retain", "archive"].includes(artifact.retention)) findings.push(`${label}: authority, mutability, or retention is invalid`);
    if (artifact.authority && !["prd", "spec", "acceptance", "result"].includes(artifact.class)) findings.push(`${label}: only authority classes may be authoritative`);
    if (artifact.class === "candidate-evidence" && (artifact.authority || artifact.mutability !== "immutable")) findings.push(`${label}: candidate evidence is immutable non-authority evidence`);
    if (artifact.class === "supply-chain" && (artifact.authority || artifact.mutability !== "immutable")) findings.push(`${label}: supply-chain evidence is immutable non-authority evidence`);
    if (artifact.class === "threat-model" && (artifact.authority || artifact.mutability !== "immutable")) findings.push(`${label}: threat-model evidence is immutable non-authority evidence`);
    classes.set(artifact.class, [...(classes.get(artifact.class) ?? []), artifact]);
  }
  const required = value?.state === "draft" ? ["prd"] : ACTIVE_STATES.has(value?.state) ? ["prd", "spec", "acceptance", "result", "candidate-evidence"] : [];
  for (const kind of required) if ((classes.get(kind) ?? []).length === 0) findings.push(`FTP-REQUIRED: ${kind} is required for ${value?.state}`);
  if (ACTIVE_STATES.has(value?.state)) for (const kind of ["prd", "spec"]) {
    const authority = (classes.get(kind) ?? []).filter((artifact) => artifact.authority);
    if (authority.length !== 1) findings.push(`FTP-AUTHORITY: exactly one authoritative ${kind} is required`);
  }
  if (["verifying", "completed"].includes(value?.state) && value?.candidate === null) findings.push("FTP-CANDIDATE: verifying/completed packages require an exact candidate binding");
  if (["superseded", "retained"].includes(value?.state) && value?.supersedes === null) findings.push("FTP-SUPERSEDES: retained/superseded packages require a relationship");
  const receipt = { schema: "pipeline.feature-package-receipt.v1", manifest, manifestSha256: digest(readFileSync(join(root, manifest))), featureId: SAFE_ID.test(id ?? "") ? id : null, state: FEATURE_STATES.includes(value?.state) ? value.state : null, candidate: value?.candidate ?? null, artifactCount: Array.isArray(value?.artifacts) ? value.artifacts.length : 0, findingCount: findings.length };
  return { ok: findings.length === 0, findings, receipt, rebinds };
}

/** A non-mutating, idempotent transition preview. Application remains a human-gated writer. */
export function planFeaturePackageTransition(rootDir = process.cwd(), manifestPath, nextState) {
  const checked = validateFeaturePackage(rootDir, manifestPath);
  if (!checked.ok) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-current-package", findings: checked.findings };
  if (!FEATURE_STATES.includes(nextState)) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-target-state", findings: [] };
  if (checked.receipt.state === nextState) return { schema: "pipeline.feature-package-transition-plan.v1", status: "noop", manifest: checked.receipt.manifest, from: nextState, to: nextState, changes: [] };
  const from = checked.receipt.state;
  const admitted = new Set([
    "draft:awaiting-approval",
    "awaiting-approval:draft",
    "awaiting-approval:approved",
    "approved:draft",
    "approved:implementing",
    "implementing:draft",
    "implementing:verifying",
    "verifying:completed",
    "verifying:implementing",
  ]);
  if (!admitted.has(`${from}:${nextState}`)) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-transition", findings: [] };
  }
  const operation = from === "draft" && nextState === "awaiting-approval"
    ? "submit"
    : nextState === "draft"
      ? "reopen-design"
      : from === "awaiting-approval" && nextState === "approved"
        ? "approve"
        : "replace-manifest-state";
  return {
    schema: "pipeline.feature-package-transition-plan.v1",
    status: "preview",
    manifest: checked.receipt.manifest,
    from,
    to: nextState,
    changes: [{ path: checked.receipt.manifest, operation }],
    requiredAuthority: operation === "approve" ? "po" : "lifecycle",
  };
}

/**
 * Preview the sole permitted absent-manifest transition.  This deliberately
 * validates proposed bytes in memory: callers cannot create a temporary
 * lifecycle manifest and then treat its presence as authority.
 */
export function planFeaturePackageBootstrap(rootDir = process.cwd(), manifestPath, proposal) {
  const root = resolve(rootDir);
  const manifest = canonicalRelative(root, manifestPath);
  if (!manifest || !manifest.startsWith("specs/") || !manifest.endsWith("/lifecycle.json")) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-bootstrap-manifest", findings: [] };
  }
  if (existsSync(join(root, manifest))) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "manifest-already-exists", findings: [] };
  }
  if (!exact(proposal, ["manifestBytes", "targetState"])
    || proposal.targetState !== "draft"
    || typeof proposal.manifestBytes !== "string"
    || Buffer.byteLength(proposal.manifestBytes, "utf8") < 2
    || Buffer.byteLength(proposal.manifestBytes, "utf8") > 65_536) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-bootstrap-proposal", findings: [] };
  }
  let value;
  try { value = JSON.parse(proposal.manifestBytes); }
  catch { return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-bootstrap-proposal", findings: ["FTP-MANIFEST: invalid JSON"] }; }
  const pathId = manifest.slice("specs/".length, -"/lifecycle.json".length);
  const findings = [];
  if (!exact(value, ["schema", "feature", "state", "artifacts", "candidate", "supersedes"])) findings.push("FTP-MANIFEST: closed schema keys are required");
  if (value?.schema !== FEATURE_PACKAGE_SCHEMA) findings.push("FTP-MANIFEST: unsupported schema");
  if (!exact(value?.feature, ["id", "rigor"]) || !SAFE_ID.test(value?.feature?.id ?? "") || value.feature.id !== pathId || ![1, 2].includes(value?.feature?.rigor)) findings.push("FTP-FEATURE: bootstrap feature id and rigor are invalid");
  if (value?.state !== "draft") findings.push("FTP-STATE: bootstrap target must be draft");
  if (!Array.isArray(value?.artifacts) || value.artifacts.length !== 1) findings.push("FTP-ARTIFACTS: draft bootstrap requires exactly one artifact");
  if (value?.candidate !== null || value?.supersedes !== null) findings.push("FTP-BOOTSTRAP: draft bootstrap forbids candidate and supersedes bindings");
  const folded = new Set();
  const packageFiles = caseFoldedPackageFiles(root, pathId);
  for (const [index, artifact] of (Array.isArray(value?.artifacts) ? value.artifacts : []).entries()) {
    const label = `FTP-ARTIFACT-${index}`;
    if (!exact(artifact, ["class", "path", "sha256", "authority", "mutability", "retention"])) { findings.push(`${label}: closed artifact keys are required`); continue; }
    if (artifact.class !== "prd" || artifact.authority !== true || artifact.mutability !== "mutable" || artifact.retention !== "active") findings.push(`${label}: draft bootstrap permits only an active mutable authoritative prd`);
    if (packageRelative(pathId, artifact.path) === null || !canonicalRelative(root, artifact.path) || !SHA256.test(artifact.sha256 ?? "")) findings.push(`${label}: artifact binding is invalid`);
    else {
      const caseKey = artifact.path.normalize("NFKC").toLocaleLowerCase("en-US");
      if (folded.has(caseKey)) findings.push(`${label}: duplicate or case-fold/Unicode-normalization-colliding artifact path`);
      folded.add(caseKey);
      if ((packageFiles.get(caseKey)?.length ?? 0) > 1) findings.push(`${label}: filesystem case-fold or Unicode-normalization collision`);
      const bound = regularFile(root, artifact.path, findings, label);
      if (bound && digest(readFileSync(join(root, bound))) !== artifact.sha256) findings.push(`${label}: digest does not bind file bytes`);
    }
  }
  if (findings.length > 0) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-bootstrap-proposal", findings };
  const manifestSha256 = digest(proposal.manifestBytes);
  return {
    schema: "pipeline.feature-package-transition-plan.v1",
    status: "bootstrap-preview",
    manifest,
    from: "absent",
    to: "draft",
    changes: [{ path: manifest, operation: "create-manifest" }],
    requiredAuthority: "lifecycle-bootstrap",
    receipt: { schema: "pipeline.feature-package-receipt.v1", manifest, manifestSha256, featureId: pathId, state: "draft", candidate: null, artifactCount: value.artifacts.length, findingCount: 0 },
  };
}

// ---- PHX-WP-GATE: the third plan kind -- digest-only reconciliation (P-AC-08) ----
const DIGEST_FINDING_RE = /: digest does not bind file bytes$/u;

/**
 * The canonical Result-reconciliation fence. A Result reconciliation is admitted only
 * when the CURRENT Result bytes contain this exact marker, with everything before it
 * hashing to the STALE manifest digest being reconciled away -- the old digest has to
 * still be provable *inside* the new artifact (closure-plan.md, "The Result fence").
 */
export const RESULT_RECONCILIATION_FENCE = "\n<!-- pipeline.result-reconciliation-fence.v1 -->\n";

function sameJsonValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/**
 * The no-drift invariant, enforced on the PLAN OBJECT itself rather than trusted from
 * intent: the postimage must be byte-identical to the preimage once the artifacts'
 * `sha256` fields alone are substituted -- same lifecycle state, same artifact set and
 * order, same candidate, same schema, same every other byte. Exported so a violation is
 * directly provable (a hand-built postimage that also changes a second field) without
 * needing a real filesystem race to trigger it.
 */
export function reconcileNoDriftOk(preimageValue, postimageValue) {
  if (!object(preimageValue) || !object(postimageValue)) return false;
  if (!Array.isArray(preimageValue.artifacts) || !Array.isArray(postimageValue.artifacts)
    || preimageValue.artifacts.length !== postimageValue.artifacts.length) return false;
  for (let i = 0; i < preimageValue.artifacts.length; i++) {
    const before = preimageValue.artifacts[i]; const after = postimageValue.artifacts[i];
    if (!object(before) || !object(after)) return false;
    const beforeKeys = Object.keys(before).sort(); const afterKeys = Object.keys(after).sort();
    if (beforeKeys.join("\0") !== afterKeys.join("\0")) return false;
    for (const key of beforeKeys) if (key !== "sha256" && !sameJsonValue(before[key], after[key])) return false;
  }
  const { artifacts: _pa, ...preRest } = preimageValue;
  const { artifacts: _qa, ...postRest } = postimageValue;
  return sameJsonValue(preRest, postRest);
}

/**
 * Checks the Result fence's three independently-typed preconditions, each with its own
 * refusal so evidence can tell them apart:
 *  - `reconcile-result-unbound`: the current Result (this artifact's path, at its CURRENT
 *    on-disk digest) is not the one Continuity State's `authority.result` names -- a
 *    Result the State does not bind cannot be reconciled, whatever its digest says.
 *  - `reconcile-result-metadata-only`: the canonical fence marker is entirely absent from
 *    the current bytes, i.e. nothing SHOWS the new bytes grew from the old ones -- refused
 *    BY NAME as a metadata-only digest refresh, distinguishable from a fence-proof failure.
 *  - `reconcile-result-fence-mismatch`: the marker is present but the bytes preceding it do
 *    not hash to the exact stale manifest digest -- the historical prefix is not preserved.
 */
function checkResultReconciliationFence(resultAuthority, artifact, currentBytes, currentSha256) {
  if (!object(resultAuthority) || resultAuthority.path !== artifact.path || resultAuthority.sha256 !== currentSha256) {
    return { ok: false, reason: "reconcile-result-unbound", findings: ["FTP-RECONCILE-RESULT-UNBOUND: the current Result is not the one Continuity State binds"] };
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(currentBytes); }
  catch { return { ok: false, reason: "reconcile-result-metadata-only", findings: ["FTP-RECONCILE-RESULT-METADATA-ONLY: Result bytes are not decodable text; no fence is provable"] }; }
  const fenceIndex = text.indexOf(RESULT_RECONCILIATION_FENCE);
  if (fenceIndex === -1) {
    return { ok: false, reason: "reconcile-result-metadata-only", findings: ["FTP-RECONCILE-RESULT-METADATA-ONLY: the canonical Result-reconciliation fence is absent; a metadata-only digest refresh is refused"] };
  }
  const prefix = Buffer.from(text.slice(0, fenceIndex), "utf8");
  if (digest(prefix) !== artifact.sha256) {
    return { ok: false, reason: "reconcile-result-fence-mismatch", findings: ["FTP-RECONCILE-RESULT-FENCE: the preserved historical prefix does not hash to the stale manifest digest"] };
  }
  return { ok: true };
}

/**
 * Preview a digest-only reconciliation: recomputes every declared artifact's digest from
 * the bytes currently on disk and returns the preimage manifest, the postimage manifest,
 * and the per-artifact old/new digest pairs, in the same plan-object shape the other two
 * kinds return (so `--plan-sha256` binding is inherited unchanged).
 *
 * Unlike the other two kinds, the CURRENT manifest is expected to be invalid in exactly
 * one way -- one or more stale artifact digests, which is what `validateFeaturePackage`
 * reports as its findings -- so this planner accepts that specific finding shape and
 * refuses on any OTHER validation problem, never widening what counts as reconcilable.
 *
 * `resultAuthority` is the caller's current Continuity State `authority.result` binding
 * (`{ path, sha256 }` or `null`); it is consulted ONLY when a `result`-class artifact's
 * digest is being reconciled, per the Result fence (see `checkResultReconciliationFence`).
 */
export function planFeaturePackageReconcile(rootDir = process.cwd(), manifestPath, resultAuthority = null) {
  const root = resolve(rootDir);
  const checked = validateFeaturePackage(root, manifestPath);
  if (checked.receipt === null) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-current-package", findings: checked.findings };
  }
  const nonDigestFindings = checked.findings.filter((finding) => !DIGEST_FINDING_RE.test(finding));
  if (nonDigestFindings.length > 0) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-current-package", findings: checked.findings };
  }
  let value;
  try { value = JSON.parse(readFileSync(join(root, checked.receipt.manifest), "utf8")); }
  catch { return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "invalid-current-package", findings: ["FTP-MANIFEST: invalid JSON"] }; }
  const id = value?.feature?.id;
  const nextArtifacts = []; const changes = [];
  for (const [index, artifact] of (Array.isArray(value.artifacts) ? value.artifacts : []).entries()) {
    const label = `FTP-RECONCILE-${index}`;
    const rel = packageRelative(id, artifact?.path);
    const file = rel && canonicalRelative(root, artifact.path) ? regularFile(root, artifact.path, [], label) : null;
    if (!file) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "artifact-unreadable", findings: [`${label}: referenced file is missing or unsafe`] };
    const currentBytes = readFileSync(join(root, file));
    const currentSha256 = digest(currentBytes);
    if (currentSha256 === artifact.sha256) { nextArtifacts.push(artifact); continue; }
    if (artifact.class === "result") {
      const fence = checkResultReconciliationFence(resultAuthority, artifact, currentBytes, currentSha256);
      if (!fence.ok) return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: fence.reason, findings: fence.findings };
    }
    nextArtifacts.push({ ...artifact, sha256: currentSha256 });
    changes.push({ path: artifact.path, class: artifact.class, operation: "reconcile-digest", from: artifact.sha256, to: currentSha256 });
  }
  if (changes.length === 0) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "noop", manifest: checked.receipt.manifest, from: checked.receipt.state, to: checked.receipt.state, changes: [] };
  }
  const nextValue = { ...value, artifacts: nextArtifacts };
  if (!reconcileNoDriftOk(value, nextValue)) {
    return { schema: "pipeline.feature-package-transition-plan.v1", status: "rejected", reason: "reconcile-drift", findings: ["FTP-RECONCILE-DRIFT: a reconcile plan may only change artifact digest fields"] };
  }
  return {
    schema: "pipeline.feature-package-transition-plan.v1",
    status: "reconcile-preview",
    manifest: checked.receipt.manifest,
    from: checked.receipt.state,
    to: checked.receipt.state,
    changes,
    requiredAuthority: "po",
    preimage: value,
    postimage: nextValue,
  };
}

/**
 * Resolve one repository path to its sole canonical artifact identity.
 *
 * A path is not an identity: the same bytes can sit under a legacy directory,
 * under two manifests, or under none, and only the package topology knows
 * which of those is the artifact with a lifecycle.  Anything other than
 * exactly one validated manifest binding is reported as such rather than being
 * resolved by preferring a package -- an ambiguous identity is the case a path
 * guess silently gets wrong.
 */
export function resolveCanonicalArtifactIdentity(rootDir = process.cwd(), artifactPath) {
  const root = resolve(rootDir);
  const unresolved = (status, findings = []) => ({ schema: "pipeline.canonical-artifact-identity.v1", status, identity: null, findings });
  if (typeof artifactPath !== "string" || artifactPath === "" || !canonicalRelative(root, artifactPath)) return unresolved("invalid", ["FTP-IDENTITY: path is not canonical within the repository"]);
  const matches = [];
  const findings = [];
  for (const manifest of inventoryFeaturePackages(root).packages) {
    let value;
    try { value = JSON.parse(readFileSync(join(root, manifest), "utf8")); }
    catch { continue; }
    for (const artifact of Array.isArray(value?.artifacts) ? value.artifacts : []) {
      if (artifact?.path !== artifactPath) continue;
      const checked = validateFeaturePackage(root, manifest);
      if (!checked.ok) { findings.push(...checked.findings.map((finding) => `${manifest}: ${finding}`)); continue; }
      matches.push({ manifest, value, artifact, receipt: checked.receipt });
    }
  }
  if (matches.length > 1) return unresolved("ambiguous", matches.map((match) => `FTP-IDENTITY: ${match.manifest} also binds ${artifactPath}`));
  if (matches.length === 0) return unresolved("unresolved", findings.length === 0 ? ["FTP-IDENTITY: no validated feature package binds this path"] : findings);
  const [{ manifest, value, artifact, receipt }] = matches;
  return {
    schema: "pipeline.canonical-artifact-identity.v1",
    status: "resolved",
    identity: Object.freeze({
      schema: "pipeline.artifact-identity.v1",
      featureId: receipt.featureId,
      manifest,
      manifestSha256: receipt.manifestSha256,
      lifecycleState: receipt.state,
      candidate: value.candidate === null ? null : Object.freeze({ ...value.candidate }),
      class: artifact.class,
      path: artifact.path,
      sha256: artifact.sha256,
      authority: artifact.authority,
      mutability: artifact.mutability,
      retention: artifact.retention,
    }),
    findings: [],
  };
}

export function validateFeatureTopology(rootDir = process.cwd()) {
  const root = resolve(rootDir); const inventory = inventoryFeaturePackages(root); const findings = [];
  const receipts = inventory.packages.map((manifest) => {
    const checked = validateFeaturePackage(root, manifest);
    findings.push(...checked.findings.map((finding) => `${manifest}: ${finding}`));
    return checked.receipt;
  });
  for (const path of walk(root, "specs")) if (path.endsWith("/lifecycle.json") && !inventory.packages.includes(path)) findings.push(`${path}: FTP-INVENTORY: manifest is not in a safe feature package`);
  return { ok: findings.length === 0, schema: "pipeline.feature-topology-validation.v1", inventory, receipts, findings };
}
