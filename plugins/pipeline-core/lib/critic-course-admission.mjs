// SPDX-License-Identifier: SUL-1.0
import { readCriticReviewUnit, assertFeatureCriticReviewUnitOwnership } from "./critic-generic-batch.mjs";
import { readDispatchBudgetLaunchObservation } from "./dispatch-budget-launch-observation.mjs";
/** Derive Critic course counters from a validated history, never request prose. */
import { validateCriticReviewHistory, validateCriticReviewLineage } from "./critic-review-lineage.mjs";
import { admitReviewAttempt, admitAuthenticatedReviewAttempt, CRITIC_DISPATCH_LIMITS, canonicalJson, sha256Canonical } from "./review-economy.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { readAcceptedDeliveryContract } from "../scripts/pipeline-state.mjs";
import { readConsumedCriticCourseResult } from "./critic-verify-lifecycle.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { validateCriticDiagnostic } from "./critic-diagnostic-evidence.mjs";

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
      || delta.changedPaths.some((path) => typeof path !== "string")
      || new Set(delta.changedPaths).size !== delta.changedPaths.length
      || delta.changedPaths.length !== source.changedPaths.length
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
  // An ordinary/delta refusal is a valid non-authorizing decision, not malformed input.
  if (typeof admission.ok !== "boolean") fail("CCA-ATTEMPT");
  return Object.freeze({
    schema: "pipeline.critic-course-admission.v1",
    parentReviewId: parent?.reviewId ?? null,
    parentRecordSha256: parent?.recordSha256 ?? null,
    candidate: { ...input.candidate },
    attempt,
    admission,
  });
}

// V2 runtime readback. Builders prepare non-authority bytes; no writer, packet
// claim, key lookup or serialized projection can grant course admission.
const V2_REQUEST_KEYS=['repoRoot','featureId','baseCommit','candidateCommit','registrationCommit','requestedMode','acceptedReference','criterionLocator','deltaRequestPath'];
const V2_DELTA_KEYS=['schema','featureId','manifestPath','courseKey','acceptedEnvelopeSha256','genesisRecordSha256','historySha256','parent','candidate','changedPaths','changedBehaviorClaims','pathInvariantMap','pathInvariantMapSha256','coordinatorImpactConfirmed','trustBoundaryChanged','impactAmbiguous','deterministicEvidence'];
const lineageSchema=v=>['pipeline.critic-review-lineage.v1','pipeline.critic-review-lineage.v2'].includes(v?.schema);
const equal=(a,b)=>canonicalJson(a)===canonicalJson(b);
const safe=v=>typeof v==='string' && v.length<=512 && !/[\\\0\r\n:]/u.test(v) && !v.startsWith('/') && v.split('/').every(p=>p && p!=='.' && p!=='..');
const goodEvidence=e=>object(e) && e.class==='candidate-evidence' && e.authority===false && e.mutability==='immutable' && e.retention==='retain' && safe(e.path) && SHA256.test(e.sha256??'');
const ok=value=>({ok:true,value});
const refused=(error)=>({ok:false,status:error?.status??'refused',code:error?.code??'CCA-RUNTIME-READBACK'});
function unavailable(code){const error=new CriticCourseAdmissionError(code);error.status='unavailable';throw error;}
function observedBlob(root,commit,path){if(!safe(path))fail('CCA-PATH');regularBlobAt(root,commit,path);const bytes=gitBytes(root,['show',`${commit}:${path}`],'CCA-EVIDENCE-READ');const row=gitBytes(root,['ls-tree','-z',commit,'--',path],'CCA-EVIDENCE-READ').toString('utf8');return {bytes,sha256:digest(bytes),blobOid:row.split(' ')[2].split('\t')[0],gitMode:'100644'};}
function registeredArtifact(root,commit,featureId,path){
 const manifestPath=`specs/${featureId}/lifecycle.json`,manifest=manifestAt(root,commit,manifestPath);
 const artifact=manifest.value.artifacts.find(e=>e.path===path);
 if(!goodEvidence(artifact)||!path.startsWith(`specs/${featureId}/evidence/`))fail('CCA-REGISTRATION-SHAPE');
 const blob=observedBlob(root,commit,path);if(blob.sha256!==artifact.sha256)fail('CCA-EVIDENCE-DIGEST');
 return {manifest,blob,registration:{manifestPath,manifestSha256:manifest.sha256,path,sha256:blob.sha256,commit,blobOid:blob.blobOid,gitMode:blob.gitMode}};
}
function retainedV2(root,featureId,commit){
 const path=`specs/${featureId}/lifecycle.json`,current=manifestAt(root,commit,path);
 if(current.value.feature?.id!==featureId)fail('CCA-MANIFEST-SHAPE');
 const commits=gitBytes(root,['rev-list','--reverse',commit,'--',path],'CCA-SOURCE-HISTORY').toString('utf8').trim().split('\n').filter(Boolean);
 if(!commits.length||commits.length>512)fail('CCA-SOURCE-HISTORY');
 const seen=new Map(),registered=new Map();
 for(const snapshot of [...commits,commit]){
  const m=manifestAt(root,snapshot,path).value;
  if(m.feature?.id!==featureId)fail('CCA-MANIFEST-SHAPE');
  const currentPaths=new Set(m.artifacts.map(e=>e.path));
  for(const retained of registered.keys())if(!currentPaths.has(retained))fail('CCA-REGISTRATION-REMOVED');
  for(const e of m.artifacts.filter(e=>e.class==='candidate-evidence')){
   if(!goodEvidence(e)||!e.path.startsWith(`specs/${featureId}/evidence/`))fail('CCA-REGISTRATION-SHAPE');
   const old=seen.get(e.path);if(old){if(old.sha256!==e.sha256 && old.retained)fail('CCA-REGISTRATION-DRIFT');if(old.sha256===e.sha256)continue;}
   if(seen.size>4096)fail('CCA-SOURCE-BOUND');
   const blob=observedBlob(root,snapshot,e.path);if(blob.sha256!==e.sha256)fail('CCA-EVIDENCE-DIGEST');
   let record;try{record=JSON.parse(blob.bytes.toString('utf8'));}catch{record=null;}
   seen.set(e.path,{sha256:e.sha256,retained:lineageSchema(record)||record?.schema==='pipeline.critic-course-alias.v1'});
   if(lineageSchema(record)){if(!validateCriticReviewHistory([record]).ok && !validateSingleRecord(record))fail('CCA-HISTORY');registered.set(e.path,{record,firstCommit:snapshot});}
  }
 }
 const rows=[...registered].map(([p,{record}])=>{const r=registeredArtifact(root,commit,featureId,p);return {registration:r.registration,record};});
 const remaining=new Map(rows.map(row=>[row.record.reviewId,row]));if(remaining.size!==rows.length)fail('CCA-HISTORY');
 const ordered=[];let parent=null;
 while(remaining.size){const children=[...remaining.values()].filter(r=>r.record.parentReviewId===parent);if(children.length!==1)fail('CCA-HISTORY');const child=children[0];ordered.push(child);remaining.delete(child.record.reviewId);parent=child.record.reviewId;}
 if(ordered.length&&!validateCriticReviewHistory(ordered.map(r=>r.record)).ok)fail('CCA-HISTORY');
 return {manifest:current,rows:ordered,historySha256:sha256Canonical(ordered.map(r=>r.record))};
}
function validateSingleRecord(record){return validateCriticReviewLineage(record).ok;}
function acceptedRead(root,featureId,reference){
 if(reference===null)return null;
 if(!exact(reference,['schema','path','sha256'])||reference.schema!=='pipeline.accepted-delivery-contract-reference.v1'||!SHA256.test(reference.sha256??''))fail('CCA-ACCEPTANCE-REFERENCE');
 const value=readAcceptedDeliveryContract({dir:root,envelopePath:reference.path});
 if(!value.ok){if(value.code?.includes('UNAVAILABLE'))unavailable(value.code);fail(value.code??'CCA-ACCEPTANCE');}
 if(value.featureId!==featureId || value.envelopeSha256!==reference.sha256)fail('CCA-ACCEPTANCE-BINDING');return value;
}
function aliasRead(root,commit,featureId){
 const current=manifestAt(root,commit,`specs/${featureId}/lifecycle.json`);
 const isAlias=current.value.supersedes!==null&&current.value.supersedes!==undefined;
 const original=isAlias?current.value.supersedes:featureId;if(!FEATURE_ID.test(original)||(isAlias&&original===featureId))fail('CCA-ALIAS-RELATION');
 const candidates=[];
 for(const e of current.value.artifacts.filter(e=>goodEvidence(e))){
  const r=registeredArtifact(root,commit,featureId,e.path);let descriptor;try{descriptor=JSON.parse(r.blob.bytes);}catch{continue;}
  if(descriptor?.schema!=='pipeline.critic-course-alias.v1')continue;
  if(!exact(descriptor,['schema','originalFeatureId','aliasFeatureId','relation','parentManifestPath','parentManifestSha256','aliasManifestPath','aliasManifestSha256','courseKey','genesisCandidate','genesisRecordSha256','acceptedEnvelopeSha256'])||descriptor.originalFeatureId!==original||!FEATURE_ID.test(descriptor.aliasFeatureId??'')||descriptor.aliasFeatureId===original||(isAlias&&descriptor.aliasFeatureId!==featureId)||!['rename','split'].includes(descriptor.relation))fail('CCA-ALIAS-BINDING');
  const aliasId=descriptor.aliasFeatureId,otherId=isAlias?original:aliasId;
  const otherPath=`specs/${otherId}/evidence/critic-course-alias-${r.blob.sha256}.json`;
  const other=registeredArtifact(root,commit,otherId,otherPath);if(!other.blob.bytes.equals(r.blob.bytes))fail('CCA-ALIAS-COUNTERPART');
  const aliasManifest=manifestAt(root,commit,`specs/${aliasId}/lifecycle.json`).value,originalManifest=manifestAt(root,commit,`specs/${original}/lifecycle.json`).value;
  if(aliasManifest.feature?.id!==aliasId||aliasManifest.supersedes!==original||!equal(aliasManifest.candidate,originalManifest.candidate))fail('CCA-ALIAS-RELATION');
  if(descriptor.parentManifestPath!==`specs/${original}/lifecycle.json`||descriptor.aliasManifestPath!==`specs/${aliasId}/lifecycle.json`)fail('CCA-ALIAS-PATH');
  for(const [path,expected] of [[descriptor.parentManifestPath,descriptor.parentManifestSha256],[descriptor.aliasManifestPath,descriptor.aliasManifestSha256]]){
   const snapshots=gitBytes(root,['rev-list',commit,'--',path],'CCA-ALIAS-SNAPSHOT').toString('utf8').trim().split('\n').filter(Boolean);if(snapshots.length>512||!snapshots.some(oid=>manifestAt(root,oid,path).sha256===expected))fail('CCA-ALIAS-SNAPSHOT');}
  if(e.path!==`specs/${featureId}/evidence/critic-course-alias-${r.blob.sha256}.json`)fail('CCA-ALIAS-PATH');
  candidates.push({registration:r.registration,descriptor});
 }
 if((isAlias&&candidates.length!==1)||new Set(candidates.map(row=>row.descriptor.aliasFeatureId)).size!==candidates.length)unavailable('CCA-ALIAS-MAPPING-UNAVAILABLE');return {original,aliases:candidates};
}
function repository(root){const repo=discoverRepository(root);return {repoRoot:realpathSync(root),gitCommonDir:repo.commonDir,controlRoot:join(repo.commonDir,'agent-pipeline','critic-packets'),repositoryFingerprint:derivePoGateRepositoryFingerprint({gitCommonDir:repo.commonDir,primaryRoot:repo.primaryRoot})};}
export function resolveRegisteredCriticCourseIdentity(input){try{
 if(!exact(input,['repoRoot','featureId','baseCommit','candidateCommit','registrationCommit','acceptedReference'])||!FEATURE_ID.test(input.featureId??'')||![input.baseCommit,input.candidateCommit,input.registrationCommit].every(v=>OID.test(v??'')))fail('CCA-IDENTITY-SHAPE');
 const repo=repository(input.repoRoot),root=repo.repoRoot,alias=aliasRead(root,input.registrationCommit,input.featureId);
 const retained=retainedV2(root,alias.original,input.registrationCommit),combined=new Map(retained.rows.map(row=>[row.record.reviewId,row]));
 for(const aliasRow of alias.aliases){for(const row of retainedV2(root,aliasRow.descriptor.aliasFeatureId,input.registrationCommit).rows){const prior=combined.get(row.record.reviewId);if(prior && !equal(prior.record,row.record))fail('CCA-ALIAS-HISTORY-CONFLICT');if(!prior)combined.set(row.record.reviewId,row);}}
 const history=[];let previous=null;while(combined.size){const next=[...combined.values()].filter(row=>row.record.parentReviewId===previous);if(next.length!==1)fail('CCA-ALIAS-HISTORY-FORK');history.push(next[0]);combined.delete(next[0].record.reviewId);previous=next[0].record.reviewId;}
 if(history.length&&!validateCriticReviewHistory(history.map(row=>row.record)).ok)fail('CCA-ALIAS-HISTORY');
 const accepted=acceptedRead(root,alias.original,input.acceptedReference);
 const first=history[0]?.record, binding=first?.courseBinding;
 const genesisCandidate=first?{base:first.diff.base,commit:first.candidate.commit,tree:first.candidate.tree}:{base:input.baseCommit,commit:input.candidateCommit,tree:gitBytes(root,['rev-parse',`${input.candidateCommit}^{tree}`],'CCA-RANGE-TREE').toString('utf8').trim()};
 const manifestPath=`specs/${alias.original}/lifecycle.json`;
 const originalManifestSha256=binding?.originalManifestSha256??manifestAt(root,genesisCandidate.base,manifestPath).sha256;
 const keySubject={repositoryFingerprint:repo.repositoryFingerprint,originalFeatureId:alias.original,manifestPath,originalManifestSha256,genesisCandidate};
 const courseIdentity={courseKey:sha256Canonical(keySubject),repositoryFingerprint:repo.repositoryFingerprint,originalFeatureId:alias.original,manifestPath,originalManifestSha256,genesisCandidate,submissionSha256:binding?.submissionSha256??accepted?.submissionSha256??null,envelopeSha256:binding?.envelopeSha256??accepted?.envelopeSha256??null,genesisRecordSha256:first?.recordSha256??null};
 for(const row of history){const b=row.record.courseBinding;if(b && (b.courseKey!==courseIdentity.courseKey||b.originalFeatureId!==alias.original||!equal(b.genesisCandidate,genesisCandidate)||b.originalManifestSha256!==originalManifestSha256||b.submissionSha256!==courseIdentity.submissionSha256||b.envelopeSha256!==courseIdentity.envelopeSha256))fail('CCA-GENESIS-BINDING');}
 if(accepted && (courseIdentity.envelopeSha256!==accepted.envelopeSha256||courseIdentity.submissionSha256!==accepted.submissionSha256))fail('CCA-ACCEPTANCE-BINDING');
 for(const row of alias.aliases){const d=row.descriptor;if(d.courseKey!==courseIdentity.courseKey||!equal(d.genesisCandidate,genesisCandidate)||d.genesisRecordSha256!==courseIdentity.genesisRecordSha256||d.acceptedEnvelopeSha256!==courseIdentity.envelopeSha256)fail('CCA-ALIAS-GENESIS');}
 return ok({resolvedRepository:{repoRoot:root,gitCommonDir:repo.gitCommonDir,controlRoot:repo.controlRoot,registrationCommit:input.registrationCommit},courseIdentity,registeredHistory:history,aliases:alias.aliases});
 }catch(error){return refused(error);}}
function exactSet(a,b){return Array.isArray(a)&&a.every(safe)&&new Set(a).size===a.length&&a.length===b.length&&b.every(p=>a.includes(p));}
function range(root,base,head){gitBytes(root,['merge-base','--is-ancestor',base,head],'CCA-RANGE-ANCESTRY');const commits=gitBytes(root,['rev-list','--reverse',`${base}..${head}`],'CCA-RANGE-READ').toString('utf8').trim().split('\n').filter(Boolean);if(commits.length>512)fail('CCA-RANGE-BOUND');return commits;}
function evidenceCommitV2(root,commit,featureId){
 const parents=gitBytes(root,['rev-list','--parents','-n','1',commit],'CCA-RANGE-READ').toString('utf8').trim().split(/\s+/u);if(parents.length!==2)return false;
 const changed=gitBytes(root,['diff','--name-only','-z',parents[1],commit,'--'],'CCA-RANGE-READ').toString('utf8').split('\0').filter(Boolean);
 const manifestPath=`specs/${featureId}/lifecycle.json`;if(!changed.includes(manifestPath))return false;
 try{const before=manifestAt(root,parents[1],manifestPath).value,after=manifestAt(root,commit,manifestPath).value;
 const core=m=>({...m,artifacts:m.artifacts.filter(e=>e.class!=='candidate-evidence')});if(!equal(core(before),core(after)))return false;
 const old=new Map(before.artifacts.map(e=>[e.path,e])),added=[];
 for(const e of after.artifacts){const previous=old.get(e.path);if(previous){if(!equal(previous,e))return false;old.delete(e.path);}else{if(!goodEvidence(e))return false;const blob=observedBlob(root,commit,e.path);if(blob.sha256!==e.sha256)return false;added.push(e.path);}}
 return old.size===0&&added.length>0&&exactSet(changed,[manifestPath,...added]);
 }catch{return false;}}
function transport(root,from,to,original,aliases){
 const aliasIds=aliases.map(a=>a.descriptor.aliasFeatureId),ids=[original,...aliasIds];
 for(const commit of range(root,from,to)){
  if(ids.some(id=>evidenceCommitV2(root,commit,id)))continue;
  const parents=gitBytes(root,['rev-list','--parents','-n','1',commit],'CCA-RANGE-READ').toString('utf8').trim().split(/\s+/u);if(parents.length!==2)fail('CCA-TRANSPORT');
  const changed=gitBytes(root,['diff','--name-only','-z',parents[1],commit,'--'],'CCA-RANGE-READ').toString('utf8').split('\0').filter(Boolean);
  const allowed=new Set();
  for(const id of aliasIds){const path=`specs/${id}/lifecycle.json`;const m=manifestAt(root,commit,path).value;if(m.supersedes!==original)fail('CCA-ALIAS-RELATION');allowed.add(path);for(const e of m.artifacts){if(e.authority===true){const source=e.path.replace(`specs/${id}/`,`specs/${original}/`);const a=observedBlob(root,commit,e.path),b=observedBlob(root,commit,source);if(a.sha256!==b.sha256)fail('CCA-ALIAS-SOURCE');allowed.add(e.path);}else if(goodEvidence(e)){const a=observedBlob(root,commit,e.path);if(a.sha256!==e.sha256)fail('CCA-ALIAS-EVIDENCE');allowed.add(e.path);}}}
  // A counterpart append may change both canonical manifests in one commit.
  if(changed.includes(`specs/${original}/lifecycle.json`)){
   const before=manifestAt(root,parents[1],`specs/${original}/lifecycle.json`).value,after=manifestAt(root,commit,`specs/${original}/lifecycle.json`).value;
   const core=m=>({...m,artifacts:m.artifacts.filter(e=>e.class!=='candidate-evidence')});if(!equal(core(before),core(after)))fail('CCA-TRANSPORT');
   for(const e of before.artifacts){if(!after.artifacts.some(n=>equal(n,e)))fail('CCA-TRANSPORT');}
   allowed.add(`specs/${original}/lifecycle.json`);for(const e of after.artifacts){if(!before.artifacts.some(n=>n.path===e.path)){if(!goodEvidence(e))fail('CCA-TRANSPORT');if(observedBlob(root,commit,e.path).sha256!==e.sha256)fail('CCA-TRANSPORT');allowed.add(e.path);}}
  }
  if(!changed.length||!changed.every(p=>allowed.has(p)))fail('CCA-TRANSPORT-SOURCE-DRIFT');
 }
}
function consumedHistory(resolved){return resolved.registeredHistory.map(row=>{
 const r=row.record,result=readConsumedCriticCourseResult({resolvedRepository:resolved.resolvedRepository,packetId:r.request.packetId,expectedCandidate:r.candidate,expectedRange:{base:r.diff.base,commit:r.candidate.commit,diffSha256:r.diff.sha256},expectedRecord:{path:row.registration.path,sha256:row.registration.sha256,recordSha256:r.recordSha256,reviewId:r.reviewId,courseKey:r.courseBinding?.courseKey??null}});
 if(!result.ok){if(result.status==='unavailable')unavailable(result.code);fail(result.code);}return {...row,consumed:result.value};});}
function runtimeSource(input,resolved){const root=resolved.resolvedRepository.repoRoot,id=resolved.courseIdentity.originalFeatureId;
 transport(root,input.candidateCommit,input.registrationCommit,id,resolved.aliases);
 const history=resolved.registeredHistory,parent=history.at(-1)?.record;
 const tree=gitBytes(root,['rev-parse',`${input.candidateCommit}^{tree}`],'CCA-RANGE-TREE').toString('utf8').trim();
 const commits=range(root,input.baseCommit,input.candidateCommit),changed=gitBytes(root,['diff','--name-only','-z',input.baseCommit,input.candidateCommit,'--'],'CCA-RANGE-READ').toString('utf8').split('\0').filter(Boolean);
 if(parent && parent.candidate.commit!==input.baseCommit){if(parent.candidate.commit!==input.candidateCommit)fail('CCA-PARENT');}
 const correction=[],evidence=[];for(const oid of commits)(evidenceCommitV2(root,oid,id)?evidence:correction).push(oid);
 return {manifestSha256:manifestAt(root,input.registrationCommit,`specs/${id}/lifecycle.json`).sha256,historySha256:sha256Canonical(history.map(r=>r.record)),candidate:{base:input.baseCommit,commit:input.candidateCommit,tree},rangeCommits:commits,correctionCommits:correction,evidenceOnlyCommits:evidence,changedPaths:changed};}
function deterministic(root,commit,featureId,candidate,paths=null){const m=manifestAt(root,commit,`specs/${featureId}/lifecycle.json`).value,entries=[];
 for(const artifact of m.artifacts.filter(goodEvidence)){if(paths && !paths.includes(artifact.path))continue;const r=registeredArtifact(root,commit,featureId,artifact.path);let value;try{value=JSON.parse(r.blob.bytes);}catch{continue;}
  if(value?.schema!=='pipeline.critic-diagnostic-evidence.v1'||!equal(value.candidate,{commit:candidate.commit,tree:candidate.tree}))continue;
  const observation=validateCriticDiagnostic(value,{root,candidate:{commit:candidate.commit,tree:candidate.tree},readArtifact:path=>{const read=registeredArtifact(root,commit,featureId,path);return read.blob.bytes;}});
  if(observation.targeted.status!=='passed')fail('CCA-DETERMINISTIC-FAILED');entries.push({path:artifact.path,sha256:artifact.sha256});}
 entries.sort((a,b)=>a.path.localeCompare(b.path));if(!entries.length)unavailable('CCA-DETERMINISTIC-UNAVAILABLE');if(paths && (!exactSet(paths,entries.map(e=>e.path))))fail('CCA-DETERMINISTIC-SELECTION');return {entries,sha256:sha256Canonical(entries),candidate:{commit:candidate.commit,tree:candidate.tree}};}
function parentProjection(row){return row?{reviewId:row.record.reviewId,recordSha256:row.record.recordSha256,packetId:row.record.request.packetId,receiptSha256:row.consumed.receiptSha256}:null;}
function requestRead(input,resolved,history,source,evidence){const id=resolved.courseIdentity.originalFeatureId;
 const registered=registeredArtifact(resolved.resolvedRepository.repoRoot,input.registrationCommit,id,input.deltaRequestPath);
 let request;try{request=JSON.parse(registered.blob.bytes);}catch{fail('CCA-DELTA-SHAPE');}
 if(!exact(request,V2_DELTA_KEYS)||request.schema!=='pipeline.critic-delta-request.v1'||canonicalJson(request)!==registered.blob.bytes.toString('utf8')||input.deltaRequestPath!==`specs/${id}/evidence/critic-delta-request-${registered.blob.sha256}.json`)fail('CCA-DELTA-SHAPE');
 const identity=resolved.courseIdentity;
 if(request.featureId!==id||request.manifestPath!==identity.manifestPath||request.courseKey!==identity.courseKey||request.acceptedEnvelopeSha256!==identity.envelopeSha256||request.genesisRecordSha256!==identity.genesisRecordSha256||request.historySha256!==source.historySha256||!equal(request.parent,parentProjection(history.at(-1)))||!equal(request.candidate,source.candidate)||!exactSet(request.changedPaths,source.changedPaths)||!equal(request.deterministicEvidence,evidence.entries))fail('CCA-DELTA-BINDING');
 if(!exactSet(Object.keys(request.pathInvariantMap??{}),source.changedPaths))fail('CCA-DELTA-MAP');
 return {request,requestSha256:registered.blob.sha256,registration:registered.registration,parentConsumed:history.at(-1)?.consumed??null,source};}
export function readRegisteredCriticDeltaRequest(input){try{if(!exact(input,['repoRoot','candidateCommit','registrationCommit','requestPath','resolvedCourse']))fail('CCA-DELTA-READ-SHAPE');const r=input.resolvedCourse,h=consumedHistory(r),last=h.at(-1);if(!last)fail('CCA-DELTA-PARENT');const request={...input,baseCommit:last.record.candidate.commit,deltaRequestPath:input.requestPath};const source=runtimeSource(request,r),evidence=deterministic(input.repoRoot,input.registrationCommit,r.courseIdentity.originalFeatureId,source.candidate);return ok(requestRead(request,r,h,source,evidence));}catch(error){return refused(error);}}
export function deriveCriticCourseAdmissionV2({source:bound,acceptedCriterion,consumedHistory:history,deltaRequest,deterministicEvidence:evidence,budgets}){
 const source=bound.source,identity=bound.courseIdentity,parent=parentProjection(history.at(-1));
 const acceptance=acceptedCriterion?.ok?{basis:acceptedCriterion.acceptance.authorityBasis,cryptographicallyAuthenticated:acceptedCriterion.acceptance.cryptographicallyAuthenticated,envelopeSha256:acceptedCriterion.acceptance.envelopeSha256,criterionSourcePath:acceptedCriterion.source.path,criterionSourceSha256:acceptedCriterion.source.sha256,criterionId:acceptedCriterion.locator.criterionId,criterionExcerptSha256:acceptedCriterion.locator.excerptSha256,criterionParserVersion:acceptedCriterion.criterion.parserVersion??'pipeline.critic-criterion-parser.v1',sourceBindingsSha256:acceptedCriterion.acceptance.bindingSha256}:null;
 const projection={schema:'pipeline.critic-course-admission.v2',courseIdentity:identity,source,parent,acceptance,deltaRequestSha256:deltaRequest?.requestSha256??null,deterministicEvidenceSha256:evidence?.sha256??null,budgets,decision:{status:'refused',mode:null,code:'RE-COURSE-INCOMPLETE',affectedInvariantIds:[]}};
 const last=history.at(-1);if(last?.consumed.receipt.reviewPass===true && last.record.coverage.complete && last.record.findings.every(f=>f.status!=='open')){projection.decision={status:'stopped-pass',mode:null,code:'RE-CONSUMED-PACKAGE-PASS',affectedInvariantIds:[]};return projection;}
 const d=deltaRequest?.request,attempt={round:budgets.reviewRound,correctionCommits:budgets.correctionCommitCount,requestedMode:history.length?'delta':'full',...(d?{base:d.candidate.base,head:d.candidate.commit,tree:d.candidate.tree,changedPaths:d.changedPaths,changedBehaviorClaims:d.changedBehaviorClaims,priorReceipt:{id:d.parent.reviewId,sha256:d.parent.receiptSha256},pathInvariantMap:d.pathInvariantMap,pathInvariantMapSha256:d.pathInvariantMapSha256,coordinatorImpactConfirmed:d.coordinatorImpactConfirmed,trustBoundaryChanged:d.trustBoundaryChanged,impactAmbiguous:d.impactAmbiguous}:{})};
 const admission=admitAuthenticatedReviewAttempt({attempt,acceptedCriterion});projection.decision={status:admission.courseGateRequired?'stopped-budget':admission.ok?'admitted':'refused',mode:admission.ok?admission.mode:null,code:admission.code,affectedInvariantIds:admission.affectedInvariantIds??[]};return projection;}
function featureReviewUnit(input,resolved){
 const root=resolved.resolvedRepository.repoRoot,identity=resolved.courseIdentity;
 const genesis=manifestAt(root,identity.genesisCandidate.base,identity.manifestPath).value;
 const current=manifestAt(root,input.candidateCommit,identity.manifestPath).value;
 const path=`specs/${identity.originalFeatureId}/design/critic-review-unit.json`;
 const units=genesis.artifacts.filter(e=>e.path===path);
 const unit=units[0];
 if(units.length!==1||!exact(unit,["class","path","sha256","authority","mutability","retention"])||unit.class!=="design"||unit.authority!==false||unit.mutability!=="immutable"||unit.retention!=="retain"||!SHA256.test(unit.sha256??""))fail("CCA-REVIEW-UNIT-REQUIRED");
 if(!current.artifacts.some(e=>equal(unit,e)))fail("CCA-REVIEW-UNIT-BINDING");
 const blob=observedBlob(root,identity.genesisCandidate.base,path);
 if(blob.sha256!==unit.sha256)fail("CCA-REVIEW-UNIT-BINDING");
 let declaration;try{declaration=JSON.parse(blob.bytes);}catch{fail("CCA-REVIEW-UNIT-BINDING");}
 const specs=genesis.artifacts.filter(e=>e.class==="spec"&&e.authority===true);
 if(specs.length!==1||!safe(specs[0].path)||!current.artifacts.some(e=>e.class==="spec"&&e.authority===true&&e.path===specs[0].path))fail("CCA-REVIEW-UNIT-SPEC");
 const observed=readCriticReviewUnit({repoRoot:root,baseCommit:identity.genesisCandidate.base,candidateCommit:input.candidateCommit,specPath:specs[0].path,logicalWorkIds:declaration.logicalWorkIds,reviewUnitPath:unit.path});
 if(observed.reference.sha256!==unit.sha256)fail("CCA-REVIEW-UNIT-BINDING");
 assertFeatureCriticReviewUnitOwnership({repoRoot:root,courseKey:identity.courseKey,logicalWorkIds:observed.declaration.logicalWorkIds});
 return {...observed.reference,specPath:observed.declaration.specPath};
}
function runtimeCompose(input,{preparing=false,evidencePaths=null}={}){
 if(!exact(input,V2_REQUEST_KEYS)||!MODES.has(input.requestedMode)||![input.baseCommit,input.candidateCommit,input.registrationCommit].every(v=>OID.test(v??'')))fail('CCA-RUNTIME-SHAPE');
 const resolvedResult=resolveRegisteredCriticCourseIdentity(Object.fromEntries(['repoRoot','featureId','baseCommit','candidateCommit','registrationCommit','acceptedReference'].map(k=>[k,input[k]])));if(!resolvedResult.ok){if(resolvedResult.status==='unavailable')unavailable(resolvedResult.code);fail(resolvedResult.code);}const resolved=resolvedResult.value,history=consumedHistory(resolved),source=runtimeSource(input,resolved);
 const last=history.at(-1),pass=last?.consumed.receipt.reviewPass===true&&last.record.coverage.complete&&last.record.findings.every(f=>f.status!=='open');
 if(!pass && (history.length?input.requestedMode!=='delta':input.requestedMode!=='full'))fail('CCA-REQUESTED-MODE');
 if(last && !pass && last.record.candidate.commit!==input.baseCommit)fail('CCA-PARENT');
 const allCorrections=new Set();
 for(let index=0;index<history.length;index++){
  const record=history[index].record;
  if(index>0)for(const oid of range(resolved.resolvedRepository.repoRoot,record.diff.base,record.candidate.commit)){if(!evidenceCommitV2(resolved.resolvedRepository.repoRoot,oid,resolved.courseIdentity.originalFeatureId))allCorrections.add(oid);}
  if(record.course.reviewRound!==index+1||record.course.correctionCommitCount!==allCorrections.size)fail('CCA-HISTORIC-COUNTER-BINDING');
 }
 const previousCount=allCorrections.size;
 const count=history.length?previousCount+source.correctionCommits.filter(oid=>!allCorrections.has(oid)).length:0;
 const budgets={reviewRound:history.length+1,correctionCommitCount:count,maxReviewRounds:CRITIC_DISPATCH_LIMITS.criticRounds,maxCorrectionCommits:CRITIC_DISPATCH_LIMITS.correctionCommits,executionBudgetEvidenceSha256:null};
 if(pass)return {resolved,history,source,evidence:null,criterion:null,delta:null,budgets};
 // Source-owned immutable consumed history fixes the batch's next round.
 // An accepted actual-PASS criterion cannot authorize a fifth invocation.
 if(budgets.reviewRound>CRITIC_DISPATCH_LIMITS.criticRounds || budgets.correctionCommitCount>CRITIC_DISPATCH_LIMITS.correctionCommits)
  return {resolved,history,source,evidence:null,criterion:null,delta:null,budgets};
 if(history.length && source.correctionCommits.length===0)fail('CCA-CORRECTION-RANGE');
 source.reviewUnit=featureReviewUnit(input,resolved);
 const evidence=deterministic(resolved.resolvedRepository.repoRoot,input.registrationCommit,resolved.courseIdentity.originalFeatureId,source.candidate,evidencePaths);
 const criterion=null;
 const delta=history.length&&!preparing?(typeof input.deltaRequestPath==='string'?requestRead(input,resolved,history,source,evidence):fail('CCA-DELTA-REQUIRED')):null;
 return {resolved,history,source,evidence,criterion,delta,budgets};
}
function emptyProjection(input,error){return {schema:'pipeline.critic-course-admission.v2',courseIdentity:null,source:null,parent:null,acceptance:null,deltaRequestSha256:null,deterministicEvidenceSha256:null,budgets:null,decision:{status:error?.status??'refused',mode:null,code:error?.code??'CCA-RUNTIME-READBACK',affectedInvariantIds:[]}};}
export function readCriticCourseAdmission(input){try{const c=runtimeCompose(input);return deriveCriticCourseAdmissionV2({source:{courseIdentity:c.resolved.courseIdentity,source:c.source},acceptedCriterion:c.criterion,consumedHistory:c.history,deltaRequest:c.delta,deterministicEvidence:c.evidence,budgets:c.budgets});}catch(error){return emptyProjection(input,error);}}
function artifact(path,descriptor){const bytes=Buffer.from(canonicalJson(descriptor)),sha256=digest(bytes);return {path:path.replace('<digest>',sha256),sha256,bytes,registration:{class:'candidate-evidence',path:path.replace('<digest>',sha256),sha256,authority:false,mutability:'immutable',retention:'retain'}};}
export function prepareRegisteredCriticDeltaRequest(input){try{
 if(!exact(input,['courseRequest','changedBehaviorClaims','pathInvariantMap','coordinatorImpactConfirmed','trustBoundaryChanged','impactAmbiguous','deterministicEvidencePaths'])||!exact(input.courseRequest,V2_REQUEST_KEYS.filter(k=>k!=='deltaRequestPath')))fail('CCA-DELTA-PREPARE-SHAPE');
 const request={...input.courseRequest,deltaRequestPath:null},c=runtimeCompose(request,{preparing:true,evidencePaths:input.deterministicEvidencePaths});if(!c.history.length)fail('CCA-DELTA-PARENT');if(c.budgets.reviewRound>CRITIC_DISPATCH_LIMITS.criticRounds || c.budgets.correctionCommitCount>CRITIC_DISPATCH_LIMITS.correctionCommits)fail('CCA-REVIEW-BUDGET-EXHAUSTED');
 const i=c.resolved.courseIdentity,descriptor={schema:'pipeline.critic-delta-request.v1',featureId:i.originalFeatureId,manifestPath:i.manifestPath,courseKey:i.courseKey,acceptedEnvelopeSha256:i.envelopeSha256,genesisRecordSha256:i.genesisRecordSha256,historySha256:c.source.historySha256,parent:parentProjection(c.history.at(-1)),candidate:c.source.candidate,changedPaths:c.source.changedPaths,changedBehaviorClaims:input.changedBehaviorClaims,pathInvariantMap:input.pathInvariantMap,pathInvariantMapSha256:sha256Canonical(input.pathInvariantMap),coordinatorImpactConfirmed:input.coordinatorImpactConfirmed,trustBoundaryChanged:input.trustBoundaryChanged,impactAmbiguous:input.impactAmbiguous,deterministicEvidence:c.evidence.entries};
 return ok({descriptor,artifact:artifact(`specs/${i.originalFeatureId}/evidence/critic-delta-request-<digest>.json`,descriptor)});
 }catch(error){return refused(error);}}
export function prepareRegisteredCriticCourseAlias(input){try{
 if(!exact(input,['repoRoot','registrationCommit','originalFeatureId','aliasFeatureId','relation','acceptedReference'])||!['rename','split'].includes(input.relation)||![input.originalFeatureId,input.aliasFeatureId].every(v=>FEATURE_ID.test(v??'')))fail('CCA-ALIAS-SHAPE');
 const root=realpathSync(input.repoRoot),original=manifestAt(root,input.registrationCommit,`specs/${input.originalFeatureId}/lifecycle.json`),alias=manifestAt(root,input.registrationCommit,`specs/${input.aliasFeatureId}/lifecycle.json`);
 if(alias.value.feature?.id!==input.aliasFeatureId||alias.value.supersedes!==input.originalFeatureId||!equal(alias.value.candidate,original.value.candidate))fail('CCA-ALIAS-RELATION');
 for(const e of alias.value.artifacts.filter(e=>e.authority===true)){const path=e.path.replace(`specs/${input.aliasFeatureId}/`,`specs/${input.originalFeatureId}/`);if(!original.value.artifacts.some(row=>row.path===path&&row.sha256===e.sha256&&row.authority===true)||observedBlob(root,input.registrationCommit,e.path).sha256!==observedBlob(root,input.registrationCommit,path).sha256)fail('CCA-ALIAS-AUTHORITY');}
 const history=retainedV2(root,input.originalFeatureId,input.registrationCommit);const first=history.rows[0]?.record;if(!first)unavailable('CCA-ALIAS-GENESIS-UNAVAILABLE');const binding=first.courseBinding;if(!binding)unavailable('CCA-ALIAS-V1-GENESIS-UNAVAILABLE');
 acceptedRead(root,input.originalFeatureId,input.acceptedReference);
 const descriptor={schema:'pipeline.critic-course-alias.v1',originalFeatureId:input.originalFeatureId,aliasFeatureId:input.aliasFeatureId,relation:input.relation,parentManifestPath:`specs/${input.originalFeatureId}/lifecycle.json`,parentManifestSha256:original.sha256,aliasManifestPath:`specs/${input.aliasFeatureId}/lifecycle.json`,aliasManifestSha256:alias.sha256,courseKey:binding.courseKey,genesisCandidate:binding.genesisCandidate,genesisRecordSha256:first.recordSha256,acceptedEnvelopeSha256:binding.envelopeSha256};
 return ok({descriptor,artifacts:[input.originalFeatureId,input.aliasFeatureId].map(id=>artifact(`specs/${id}/evidence/critic-course-alias-<digest>.json`,descriptor))});
 }catch(error){return refused(error);}}

/** Explicit same-process launch admission; legacy API5 remains unchanged. */
export function readCriticCourseAdmissionWithLaunchContext(input, options) {
  const empty = (status, code) => Object.freeze({
    schema: "pipeline.critic-course-admission.v2", courseIdentity: null,
    source: null, parent: null, acceptance: null, deltaRequestSha256: null,
    deterministicEvidenceSha256: null, budgets: null,
    decision: { status, mode: null, code, affectedInvariantIds: [] },
  });
  if (options === undefined || (exact(options, []) || exact(options, ["hostDispatchContext"]))
    && options.hostDispatchContext === undefined) {
    return empty("unavailable", "DBLO-CURRENT-HOST-UNAVAILABLE");
  }
  if (!exact(options, ["hostDispatchContext"])) return empty("refused", "DBLO-HANDLE-INVALID");
  const observed = readDispatchBudgetLaunchObservation({ rootDir: input?.repoRoot,
    hostDispatchContext: options.hostDispatchContext });
  if (!observed.ok) return empty(observed.status, observed.code);
  if (observed.value.status === "stopped-budget") return empty("stopped-budget", observed.value.code);
  if (observed.value.status !== "working" && observed.value.status !== "not-applicable") {
    return empty("refused", "DBLO-HANDLE-INVALID");
  }
  return readCriticCourseAdmission(input);
}
