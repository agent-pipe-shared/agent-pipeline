// SPDX-License-Identifier: SUL-1.0
/** Derive Critic course counters from a validated history, never request prose. */
import { validateCriticReviewHistory } from "./critic-review-lineage.mjs";
import { admitReviewAttempt, sha256Canonical } from "./review-economy.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const MODES = new Set(["full", "delta"]);
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DELTA_KEYS = ["changedPaths", "changedBehaviorClaims", "priorReceipt", "pathInvariantMap", "pathInvariantMapSha256", "coordinatorImpactConfirmed", "trustBoundaryChanged", "impactAmbiguous"];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

export class CriticCourseAdmissionError extends Error {
  constructor(code) {
    super("Critic course admission is invalid.");
    this.name = "CriticCourseAdmissionError";
    this.code = code;
  }
}
const fail = (code) => { throw new CriticCourseAdmissionError(code); };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function gitBytes(root, args, code) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "buffer", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024,
    });
  } catch { fail(code); }
}

function manifestAt(root, commit, path) {
  const bytes = gitBytes(root, ["show", `${commit}:${path}`], "CCA-MANIFEST-READ");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("CCA-MANIFEST-SHAPE"); }
  if (!object(value) || value.schema !== "pipeline.feature-package.v1"
    || !Array.isArray(value.artifacts)) fail("CCA-MANIFEST-SHAPE");
  return { value, sha256: digest(bytes) };
}

function regularBlobAt(root, commit, path) {
  const row = gitBytes(root, ["ls-tree", "-z", commit, "--", path], "CCA-EVIDENCE-READ").toString("utf8");
  if (!/^100644 blob [a-f0-9]{40,64}\t[^\0]+\0$/u.test(row)
    || !row.endsWith(`\t${path}\0`)) fail("CCA-EVIDENCE-MODE");
}

/**
 * Read a feature package's retained Critic course from Git, including old
 * manifest revisions. A mutable current manifest cannot erase an earlier
 * immutable lineage registration and silently reset the course to genesis.
 * This read-only result is evidence input, never independent spawn authority.
 */
export function resolveRegisteredCriticCourseHistory({ repoRoot, featureId, candidateCommit }) {
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)
    || typeof featureId !== "string" || !FEATURE_ID.test(featureId)
    || typeof candidateCommit !== "string" || !OID.test(candidateCommit)) fail("CCA-SOURCE-SHAPE");
  let root;
  try { root = realpathSync(repoRoot); } catch { fail("CCA-SOURCE-ROOT"); }
  if (gitBytes(root, ["cat-file", "-t", candidateCommit], "CCA-SOURCE-REF").toString("utf8").trim() !== "commit") fail("CCA-SOURCE-REF");
  const manifestPath = join("specs", featureId, "lifecycle.json").replaceAll("\\", "/");
  const commits = gitBytes(root, ["rev-list", "--reverse", candidateCommit, "--", manifestPath], "CCA-SOURCE-HISTORY")
    .toString("utf8").trim().split("\n").filter(Boolean);
  if (commits.length === 0 || commits.length > 512 || commits.some((oid) => !OID.test(oid))) fail("CCA-SOURCE-HISTORY");
  const current = manifestAt(root, candidateCommit, manifestPath);
  if (current.value.feature?.id !== featureId) fail("CCA-MANIFEST-SHAPE");
  const registered = new Map();
  const inspectedPaths = new Map();
  let inspected = 0;
  for (const commit of [...commits, candidateCommit]) {
    const manifest = manifestAt(root, commit, manifestPath).value;
    if (manifest.feature?.id !== featureId) fail("CCA-MANIFEST-SHAPE");
    for (const artifact of manifest.artifacts) {
      if (!object(artifact) || artifact.class !== "candidate-evidence") continue;
      if (typeof artifact.path !== "string" || !artifact.path.startsWith(`specs/${featureId}/evidence/`)
        || artifact.path.split("/").some((part) => part === ".." || part === "." || part === "")
        || !SHA256.test(artifact.sha256)) fail("CCA-REGISTRATION-SHAPE");
      const prior = inspectedPaths.get(artifact.path);
      if (prior) {
        if (prior.sha256 === artifact.sha256) continue;
        if (prior.critic) fail("CCA-REGISTRATION-DRIFT");
      }
      if (++inspected > 4096) fail("CCA-SOURCE-BOUND");
      const bytes = gitBytes(root, ["show", `${commit}:${artifact.path}`], "CCA-EVIDENCE-READ");
      if (digest(bytes) !== artifact.sha256) fail("CCA-EVIDENCE-DIGEST");
      let value;
      try { value = JSON.parse(bytes.toString("utf8")); } catch { value = null; }
      inspectedPaths.set(artifact.path, { sha256: artifact.sha256, critic: value?.schema === "pipeline.critic-review-lineage.v1" });
      if (value?.schema !== "pipeline.critic-review-lineage.v1") continue;
      if (artifact.authority !== false || artifact.mutability !== "immutable"
        || artifact.retention !== "retain") fail("CCA-REGISTRATION-SHAPE");
      regularBlobAt(root, commit, artifact.path);
      registered.set(artifact.path, { sha256: artifact.sha256, record: value });
    }
  }
  const currentPaths = new Map(current.value.artifacts.filter((entry) => object(entry) && entry.class === "candidate-evidence")
    .map((entry) => [entry.path, entry.sha256]));
  for (const [path, entry] of registered) {
    if (currentPaths.get(path) !== entry.sha256) fail("CCA-REGISTRATION-REMOVED");
    regularBlobAt(root, candidateCommit, path);
    const bytes = gitBytes(root, ["show", `${candidateCommit}:${path}`], "CCA-EVIDENCE-READ");
    if (digest(bytes) !== entry.sha256) fail("CCA-EVIDENCE-DIGEST");
  }
  if (registered.size === 0) return Object.freeze({ history: [], historySha256: sha256Canonical([]), manifestPath, manifestSha256: current.sha256, candidateCommit });
  const remaining = new Map([...registered.values()].map(({ record }) => [record.reviewId, record]));
  if (remaining.size !== registered.size) fail("CCA-HISTORY");
  const history = [];
  let parentId = null;
  while (remaining.size > 0) {
    const children = [...remaining.values()].filter((record) => record.parentReviewId === parentId);
    if (children.length !== 1) fail("CCA-HISTORY");
    const child = children[0];
    history.push(child);
    remaining.delete(child.reviewId);
    parentId = child.reviewId;
  }
  if (!validateCriticReviewHistory(history).ok) fail("CCA-HISTORY");
  return Object.freeze({ history: Object.freeze(history), historySha256: sha256Canonical(history), manifestPath, manifestSha256: current.sha256, candidateCommit });
}

/** Bind the retained course to an actual Git range without trusting counters. */
export function deriveRegisteredCriticCourseSource({ repoRoot, featureId, baseCommit, candidateCommit }) {
  if (typeof baseCommit !== "string" || !OID.test(baseCommit)) fail("CCA-RANGE-SHAPE");
  const retained = resolveRegisteredCriticCourseHistory({ repoRoot, featureId, candidateCommit });
  const root = realpathSync(repoRoot);
  const baseType = gitBytes(root, ["cat-file", "-t", baseCommit], "CCA-RANGE-BASE").toString("utf8").trim();
  if (baseType !== "commit" && baseType !== "tree") fail("CCA-RANGE-BASE");
  if (baseType === "commit") {
    gitBytes(root, ["merge-base", "--is-ancestor", baseCommit, candidateCommit], "CCA-RANGE-ANCESTRY");
  } else {
    const parentLine = gitBytes(root, ["rev-list", "--parents", "-n", "1", candidateCommit], "CCA-RANGE-ANCESTRY").toString("utf8").trim();
    const emptyTree = gitBytes(root, ["hash-object", "-t", "tree", "--stdin"], "CCA-RANGE-ANCESTRY").toString("utf8").trim();
    if (parentLine !== candidateCommit || baseCommit !== emptyTree) fail("CCA-RANGE-ANCESTRY");
  }
  if (retained.history.length > 0 && retained.history.at(-1).candidate.commit !== baseCommit) fail("CCA-PARENT");
  const candidateTree = gitBytes(root, ["rev-parse", `${candidateCommit}^{tree}`], "CCA-RANGE-TREE").toString("utf8").trim();
  if (!OID.test(candidateTree)) fail("CCA-RANGE-TREE");
  const rangeCommits = baseType === "tree" ? [candidateCommit]
    : gitBytes(root, ["rev-list", "--reverse", `${baseCommit}..${candidateCommit}`], "CCA-RANGE-READ")
      .toString("utf8").trim().split("\n").filter(Boolean);
  if (rangeCommits.length === 0 || rangeCommits.length > 512 || rangeCommits.some((oid) => !OID.test(oid))) fail("CCA-RANGE-READ");
  const changedPaths = gitBytes(root, ["diff", "--name-only", "-z", baseCommit, candidateCommit, "--"], "CCA-RANGE-READ")
    .toString("utf8").split("\0").filter(Boolean);
  if (changedPaths.length === 0 || changedPaths.length > 8192) fail("CCA-RANGE-PATHS");
  return Object.freeze({
    ...retained, baseCommit, candidateTree,
    rangeCommits: Object.freeze(rangeCommits), changedPaths: Object.freeze(changedPaths),
  });
}

function evidenceOnlyCommit(root, commit, manifestPath, featureId) {
  try {
    const parents = gitBytes(root, ["rev-list", "--parents", "-n", "1", commit], "CCA-RANGE-READ")
      .toString("utf8").trim().split(/\s+/u);
    if (parents.length !== 2) return false;
    const changed = gitBytes(root, ["diff", "--name-only", "-z", parents[1], commit, "--"], "CCA-RANGE-READ")
      .toString("utf8").split("\0").filter(Boolean);
    if (!changed.includes(manifestPath)) return false;
    const before = manifestAt(root, parents[1], manifestPath).value;
    const after = manifestAt(root, commit, manifestPath).value;
    if (before.feature?.id !== featureId || after.feature?.id !== featureId) return false;
    const withoutEvidence = (value) => ({ ...value, artifacts: value.artifacts.filter((entry) => entry.class !== "candidate-evidence") });
    if (sha256Canonical(withoutEvidence(before)) !== sha256Canonical(withoutEvidence(after))) return false;
    const old = new Map(before.artifacts.filter((entry) => entry.class === "candidate-evidence").map((entry) => [entry.path, entry]));
    const added = [];
    for (const entry of after.artifacts.filter((artifact) => artifact.class === "candidate-evidence")) {
      const prior = old.get(entry.path);
      if (prior) {
        if (sha256Canonical(prior) !== sha256Canonical(entry)) return false;
        old.delete(entry.path);
      } else added.push(entry);
    }
    if (old.size !== 0 || added.length === 0 || changed.length !== added.length + 1) return false;
    const newPaths = new Set();
    for (const entry of added) {
      if (!object(entry) || entry.authority !== false || entry.mutability !== "immutable"
        || entry.retention !== "retain" || !SHA256.test(entry.sha256)
        || typeof entry.path !== "string" || !entry.path.startsWith(`specs/${featureId}/evidence/`)
        || !entry.path.endsWith(".json") || newPaths.has(entry.path)) return false;
      newPaths.add(entry.path);
      regularBlobAt(root, commit, entry.path);
      if (digest(gitBytes(root, ["show", `${commit}:${entry.path}`], "CCA-EVIDENCE-READ")) !== entry.sha256) return false;
    }
    return changed.every((path) => path === manifestPath || newPaths.has(path));
  } catch { return false; }
}

/** Classify only exact manifest-registration commits as budget-neutral. */
export function classifyRegisteredEvidenceOnlyCommits({ repoRoot, featureId, baseCommit, candidateCommit }) {
  const source = deriveRegisteredCriticCourseSource({ repoRoot, featureId, baseCommit, candidateCommit });
  const root = realpathSync(repoRoot);
  const evidenceOnly = [];
  const correction = [];
  for (const commit of source.rangeCommits) {
    (evidenceOnlyCommit(root, commit, source.manifestPath, featureId) ? evidenceOnly : correction).push(commit);
  }
  return Object.freeze({
    ...source,
    correctionCommits: Object.freeze(correction),
    evidenceOnlyCommits: Object.freeze(evidenceOnly),
  });
}

/** Derive a read-only course decision from the retained source and exact range. */
export function deriveRegisteredCriticCourseDecision({ repoRoot, featureId, baseCommit, candidateCommit, requestedMode, delta }) {
  const source = classifyRegisteredEvidenceOnlyCommits({ repoRoot, featureId, baseCommit, candidateCommit });
  if (requestedMode === "delta") {
    if (!object(delta) || !Array.isArray(delta.changedPaths)
      || !source.changedPaths.every((path) => delta.changedPaths.includes(path))) fail("CCA-DELTA-COVERAGE");
  }
  const decision = deriveCriticCourseAdmission({
    history: source.history,
    candidate: { base: source.baseCommit, commit: source.candidateCommit, tree: source.candidateTree },
    correctionCommitsInRange: source.history.length === 0 ? 0 : source.correctionCommits.length,
    requestedMode,
    delta,
  });
  return Object.freeze({
    source: {
      manifestPath: source.manifestPath,
      manifestSha256: source.manifestSha256,
      historySha256: source.historySha256,
      baseCommit: source.baseCommit,
      candidateCommit: source.candidateCommit,
      candidateTree: source.candidateTree,
      rangeCommits: [...source.rangeCommits],
      correctionCommits: [...source.correctionCommits],
      evidenceOnlyCommits: [...source.evidenceOnlyCommits],
      changedPaths: [...source.changedPaths],
    },
    decision,
  });
}

/**
 * This is deliberately a pure derivation, not dispatch authority. The caller
 * must load `history` from immutable feature-package evidence and independently
 * enumerate the exact commit range before invoking it. In particular, a self-declared
 * round or correction count is not an input to this API.
 */
export function deriveCriticCourseAdmission(input) {
  if (!exact(input, ["history", "candidate", "correctionCommitsInRange", "requestedMode", "delta"])
    || !Array.isArray(input.history) || input.history.length > 4
    || !exact(input.candidate, ["base", "commit", "tree"])
    || ![input.candidate.base, input.candidate.commit, input.candidate.tree].every((oid) => typeof oid === "string" && OID.test(oid))
    || !Number.isSafeInteger(input.correctionCommitsInRange) || input.correctionCommitsInRange < 0
    || !MODES.has(input.requestedMode) || !object(input.delta)) fail("CCA-SHAPE");

  const genesis = input.history.length === 0;
  if (!genesis) {
    const validation = validateCriticReviewHistory(input.history);
    if (!validation.ok) fail("CCA-HISTORY");
  }
  const parent = genesis ? null : input.history.at(-1);
  if (parent !== null && (parent.course.status !== "admitted"
    || parent.verdict.status === "pending" || parent.candidate.commit !== input.candidate.base)) {
    fail("CCA-PARENT");
  }
  if (genesis) {
    if (input.requestedMode !== "full" || input.correctionCommitsInRange !== 0
      || Object.keys(input.delta).length !== 0) fail("CCA-GENESIS");
  } else if (input.correctionCommitsInRange < 1) {
    fail("CCA-CORRECTION-RANGE");
  }
  if (input.requestedMode === "delta" ? !exact(input.delta, DELTA_KEYS)
    : Object.keys(input.delta).length !== 0) fail("CCA-DELTA-SHAPE");

  const round = genesis ? 1 : parent.course.reviewRound + 1;
  const correctionCommits = genesis ? 0
    : parent.course.correctionCommitCount + input.correctionCommitsInRange;
  const attempt = {
    round,
    correctionCommits,
    requestedMode: input.requestedMode,
    ...(genesis ? {} : {
      base: input.candidate.base,
      head: input.candidate.commit,
      tree: input.candidate.tree,
      ...structuredClone(input.delta),
    }),
  };
  const admission = admitReviewAttempt(attempt);
  if (!admission.ok && admission.courseGateRequired !== true) fail("CCA-ATTEMPT");
  return Object.freeze({
    schema: "pipeline.critic-course-admission.v1",
    parentReviewId: parent?.reviewId ?? null,
    parentRecordSha256: parent?.recordSha256 ?? null,
    candidate: { ...input.candidate },
    attempt,
    admission,
  });
}
