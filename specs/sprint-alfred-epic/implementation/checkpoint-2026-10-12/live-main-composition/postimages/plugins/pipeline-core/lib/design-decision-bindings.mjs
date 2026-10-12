// SPDX-License-Identifier: SUL-1.0
/** Physical decision subsets of canonical signed DAB. Drafts never create authority. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, existsSync, mkdirSync, readdirSync, writeSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { canonicalizeJson, parseStrictJson } from './governance-event.mjs';
import { resolveProjectAuthorityPaths } from './project-authority.mjs';
import { readCriticalHumanProofPolicy } from './critical-human-proof-policy.mjs';
import { verifyDesignApprovalRequest } from './design-approval-binding.mjs';
import { verifyAgainstTrustAnchors } from './critical-human-proof-policy.mjs';
import { designAdvisoryAdmission } from './guard-devplan-policy.mjs';
import { registeredModelFamilyTaskRoutes } from './model-family-route-source.mjs';
import { registeredFunctionalTaskRoutes } from './model-role-route-source.mjs';
import { validateModelFamilyAuthoritySubject } from './model-family-authority.mjs';
import { derivePlanLifecycle } from './plan-spec-state-v2.mjs';
import { validatePoGateAuthorityForRepository, resolvePoGateRepositoryTopology, derivePoGateRepositoryFingerprint } from './po-gate-authority.mjs';
import { validateArchitectureDecisionSidecar, loadPhysicalArchitectureMap, inspectArchitectureDecisionAuthoringSources } from './architecture-effective-decisions.mjs';
import { inspectArchitectureDecisionContinuity } from './architecture-decision-continuity.mjs';
import { inspectProspectiveArchitectureManifest } from "./architecture-prospective-materialization.mjs";
import { validateAdapterContract } from './model-family-discovery.mjs';

export const DESIGN_DECISION_BINDINGS_SCHEMA = 'pipeline.design-decision-bindings.v1';
const SHA = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const REFERENCE_PATH = 'project/aggregate-design-model-policy-reference.json';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const handles = new WeakMap();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(canonicalizeJson(value));
const own = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const fail = code => ({ ok: false, code });
function requireValue(value, code) { if (!value) throw new Error(code); }
function frozen(value) {
  const copy = structuredClone(value);
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(copy); return copy;
}
function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 240
    && /^[A-Za-z0-9_@/-][A-Za-z0-9._@/-]*$/u.test(path) && !path.startsWith('/')
    && path.split('/').every(part => part && !part.startsWith('.'))
    && !/(?:^|\/)(?:private|sessions?|credentials|id_rsa|id_ed25519|[^/]*\.pem)(?:\/|$)/iu.test(path);
}
const refValid = ref => own(ref, ['path', 'sha256']) && safePath(ref.path) && SHA.test(ref.sha256);
const locator = stat => [stat.dev, stat.ino, stat.mode, stat.uid, stat.gid].map(String).join(':');
const identity = stat => [locator(stat), stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');

// Every path component and opened descriptor belongs to this repository. A
// sibling directory entry does not change an ancestor locator's identity.
function physical(root, path, limit = 1048576, internal = false) {
  requireValue(safePath(path) || (internal && ['.claude/pipeline-state.json', '.claude/pipeline.yaml'].includes(path)), 'DDB-PATH-INVALID');
  let fd;
  try {
    const parents = [];
    let cursor = root;
    for (const part of ['', ...path.split('/').slice(0, -1)]) {
      if (part) cursor = join(cursor, part);
      const stat = lstatSync(cursor, { bigint: true });
      requireValue(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(cursor) === cursor
        && (stat.mode & 0o022n) === 0n, 'DDB-PARENT-UNSAFE');
      parents.push([cursor, locator(stat)]);
    }
    const absolute = join(root, path);
    const before = lstatSync(absolute, { bigint: true });
    requireValue(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n
      && before.size > 0n && before.size <= BigInt(limit) && (before.mode & 0o022n) === 0n
      && realpathSync(absolute) === absolute, 'DDB-FILE-UNSAFE');
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    requireValue(identity(fstatSync(fd, { bigint: true })) === identity(before), 'DDB-PHYSICAL-DRIFT');
    const bytes = readFileSync(fd);
    requireValue(bytes.length === Number(before.size)
      && identity(fstatSync(fd, { bigint: true })) === identity(before)
      && identity(lstatSync(absolute, { bigint: true })) === identity(before)
      && parents.every(([name, expected]) => locator(lstatSync(name, { bigint: true })) === expected
        && realpathSync(name) === name), 'DDB-PHYSICAL-DRIFT');
    const text = decoder.decode(bytes);
    requireValue(Buffer.from(text, 'utf8').equals(bytes), 'DDB-UTF8-INVALID');
    return { bytes, text, sha256: hash(bytes), identity: identity(before), path };
  } finally { if (fd !== undefined) closeSync(fd); }
}
function rootPath(value) {
  requireValue(typeof value === 'string' && isAbsolute(value), 'DDB-ROOT-INVALID');
  const root = resolve(value);
  requireValue(root === value && realpathSync(root) === root, 'DDB-ROOT-INVALID'); return root;
}

/** Closed syntax only; no caller JSON can become an authority handle. */
export function parseDesignDecisionBindings(designBytes) {
  const bytes = Buffer.from(designBytes);
  requireValue(bytes.length > 0 && bytes.length <= 1048576, 'DDB-DESIGN-BOUNDS');
  const text = decoder.decode(bytes);
  const marker = /^```pipeline-design-decision-bindings\r?$/gmu;
  const markers = [...text.matchAll(marker)];
  if (markers.length === 0) return null;
  const blocks = [...text.matchAll(/^```pipeline-design-decision-bindings\r?\n([\s\S]*?)^```[ \t]*\r?$/gmu)];
  requireValue(markers.length === 1 && blocks.length === 1, 'DDB-BLOCK-INVALID');
  const binding = parseStrictJson(Buffer.from(blocks[0][1], 'utf8'));
  requireValue(own(binding, ['schema', 'repositoryFingerprint', 'featureId', 'architectureDecisions', 'modelPolicy', ...(binding.schema === "pipeline.design-decision-bindings.v2" ? ["prospectiveArchitecture"] : [])])
    && [DESIGN_DECISION_BINDINGS_SCHEMA, "pipeline.design-decision-bindings.v2"].includes(binding.schema) && SHA.test(binding.repositoryFingerprint)
    && typeof binding.featureId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(binding.featureId) && Array.isArray(binding.architectureDecisions)
    && binding.architectureDecisions.length <= 64, 'DDB-BINDINGS-SHAPE');
  requireValue(binding.schema !== "pipeline.design-decision-bindings.v2" || refValid(binding.prospectiveArchitecture), "DDB-PROSPECTIVE-REF");
  const ids = [];
  for (const entry of binding.architectureDecisions) {
    requireValue(own(entry, ['id', 'markdown', 'sidecar', 'chatSelection']) && ID.test(entry.id)
      && [entry.markdown, entry.sidecar, entry.chatSelection].every(refValid), 'DDB-ARCHITECTURE-SHAPE');
    ids.push(entry.id);
  }
  requireValue(ids.join('\0') === [...new Set(ids)].sort().join('\0'), 'DDB-ARCHITECTURE-ORDER');
  requireValue(binding.modelPolicy === null || (own(binding.modelPolicy, ['request', 'subjectSha256'])
    && refValid(binding.modelPolicy.request) && SHA.test(binding.modelPolicy.subjectSha256)), 'DDB-MODEL-SHAPE');
  return frozen(binding);
}

function draft(root, designPath, expectedDesignSha256, occupied = [], sources = null) {
  requireValue(SHA.test(expectedDesignSha256), 'DDB-DESIGN-DIGEST');
  const design = physical(root, designPath);
  requireValue(design.sha256 === expectedDesignSha256, 'DDB-DESIGN-DRIFT');
  const binding = parseDesignDecisionBindings(design.bytes);
  if (!binding) return { ok: true, required: false, bindingSha256: null, disclosure: null, files: [design] };
  const files = [design];
  const key = name => name.toLowerCase();
  const paths = new Set([designPath, ...occupied].map(key));
  let total = 0;
  const read = ref => {
    requireValue(refValid(ref) && !paths.has(key(ref.path)), 'DDB-PATH-COLLISION'); paths.add(key(ref.path));
    const file = physical(root, ref.path); total += file.bytes.length;
    requireValue(total <= 4194304, 'DDB-REFERENCE-BOUNDS');
    requireValue(file.sha256 === ref.sha256, 'DDB-REFERENCE-DRIFT'); files.push(file); return file;
  };
  const architectureDecisions = [];
  for (const entry of binding.architectureDecisions) {
    requireValue(/^docs\/adr\/[A-Za-z0-9._-]+\.md$/u.test(entry.markdown.path)
      && entry.sidecar.path === entry.markdown.path.slice(0, -3) + '.json', 'DDB-ADR-PAIR');
    const markdown = read(entry.markdown), sidecar = read(entry.sidecar), choice = read(entry.chatSelection);
    const record = parseStrictJson(sidecar.bytes), selection = parseStrictJson(choice.bytes);
    requireValue(validateArchitectureDecisionSidecar(record) && record.id === entry.id
      && record.status === 'accepted' && record.digest === markdown.sha256 && !record.exception,
    'DDB-ADR-INVALID');
    const moduleIds = record.moduleIds ?? [];
    requireValue(record.scope !== 'module' || record.schema === 'pipeline.architecture-decision.v2', 'DDB-ADR-MODULE-UNRESOLVED');
    requireValue(own(selection, ['schema', 'id', 'decision', 'markdownSha256', 'sidecarSha256', 'scope', 'moduleIds', 'supersedes', 'attributedTo'])
      && selection.schema === 'pipeline.design-decision-chat-selection.v1' && selection.id === entry.id
      && typeof selection.attributedTo === 'string' && selection.attributedTo.trim().length > 0
      && selection.attributedTo.length <= 160 && !/[\r\n\0]/u.test(selection.attributedTo)
      && selection.decision === 'accepted' && selection.markdownSha256 === markdown.sha256
      && selection.sidecarSha256 === sidecar.sha256 && selection.scope === record.scope
      && canonicalizeJson(selection.moduleIds) === canonicalizeJson(moduleIds)
      && selection.supersedes === (record.supersedes ?? null), 'DDB-CHAT-SELECTION-INVALID');
    if (moduleIds.length) {
      const map = loadPhysicalArchitectureMap(root);
      requireValue(map?.ok && moduleIds.every(id => map.modules.some(module => module.id === id)), 'DDB-ADR-MODULE-UNRESOLVED');
    }
    architectureDecisions.push({ entry, record, markdown: markdown.text, sidecar: record, chatSelection: selection });
  }
  let prospective = null;
  if (binding.schema === "pipeline.design-decision-bindings.v2") {
    requireValue(sources, "DDB-PROSPECTIVE-SOURCES-REQUIRED");
    prospective = inspectProspectiveArchitectureManifest({ manifest: binding.prospectiveArchitecture, sources,
      read: name => physical(root, name), existing: name => existsSync(join(root, name)) ? physical(root, name) : null });
    for (const file of prospective.files) {
      if (files.some(previous => key(previous.path) === key(file.path))) continue;
      paths.add(key(file.path)); total += file.bytes.length;
      requireValue(total <= 4194304, "DDB-REFERENCE-BOUNDS"); files.push(file);
    }
    const prospectiveModules = prospective.decisions.flatMap(row => row.record.moduleIds ?? []);
    if (prospectiveModules.length) {
      const map = loadPhysicalArchitectureMap(root);
      requireValue(map?.ok && prospectiveModules.every(id => map.modules.some(module => module.id === id)), "DDB-ADR-MODULE-UNRESOLVED");
    }
    const adrNames = readdirSync(join(root, "docs/adr")).filter(name => /\.(?:md|json)$/u.test(name));
    for (const row of prospective.decisions) requireValue(!adrNames.some(name => name.startsWith(row.entry.id.slice(0, 4) + "-") && ![row.entry.id + ".md", row.entry.id + ".json"].includes(name)), "DDB-PROSPECTIVE-NUMBER-COLLISION");
    const futureNames = new Set(prospective.decisions.flatMap(row => [row.entry.id + ".md", row.entry.id + ".json"]));
    const historicNumbers = adrNames.filter(name => !futureNames.has(name)).map(name => /^(\d{4})-/u.exec(name)?.[1]).filter(Boolean).map(Number);
    const nextNumber = Math.max(0, ...historicNumbers) + 1;
    if (!prospective.materialized) prospective.decisions.forEach((row, index) => requireValue(Number(row.entry.id.slice(0, 4)) === nextNumber + index, "DDB-PROSPECTIVE-NUMBER-DRIFT"));
    requireValue(!prospective.decisions.some(row => binding.architectureDecisions.some(entry => entry.id === row.entry.id)), "DDB-PROSPECTIVE-ID-COLLISION");
  }
  // Reuse the genuine physical ADR/supersession/inherited-conflict owners.
  // This observes authoring inputs; only the later actual DAB verifier grants a subset.
  if (architectureDecisions.length) {
    const map = loadPhysicalArchitectureMap(root);
    const areas = new Set(['project', ...(map?.ok ? map.modules.map(module => module.id) : [])]);
    for (const item of architectureDecisions) for (const id of item.record.moduleIds ?? []) areas.add(id);
    for (const area of areas) {
      const continuity = inspectArchitectureDecisionContinuity({ rootDir: root, area }, { inspectLocal: inspectArchitectureDecisionAuthoringSources });
      requireValue(continuity.status !== 'blocked', 'DDB-ARCHITECTURE-CONTINUITY');
    }
  }
  let modelRequest = null;
  if (binding.modelPolicy !== null) {
    const request = read(binding.modelPolicy.request); modelRequest = parseStrictJson(request.bytes);
    const fresh = modelRequest.schema === 'pipeline.model-family-design-request.v1';
    const keys = fresh ? ['schema', 'subject', 'adapterContractBindings']
      : ['schema', 'requestId', 'candidateAtApproval', 'subject', 'approvalIntent', 'intentSha256',
        'historicBinding', 'migrationProjection', 'adapterContractBindings', 'mappingPreview', 'qualificationBoundary'];
    requireValue(own(modelRequest, keys) && (fresh || modelRequest.schema === 'pipeline.model-family-approval-request.v1')
      && (fresh || (own(modelRequest.candidateAtApproval, ['commit', 'tree'])
      && OID.test(modelRequest.candidateAtApproval.commit) && OID.test(modelRequest.candidateAtApproval.tree)
      && modelRequest.candidateAtApproval.commit !== modelRequest.candidateAtApproval.tree))
      && digest(modelRequest.subject) === binding.modelPolicy.subjectSha256
      && Array.isArray(modelRequest.adapterContractBindings) && modelRequest.adapterContractBindings.length > 0
      && modelRequest.adapterContractBindings.length <= 64, 'DDB-MODEL-REQUEST-INVALID');
    const families = new Map();
    for (const contract of modelRequest.adapterContractBindings) {
      const expected = fresh ? ['runner', 'familyId', 'path', 'sha256', 'contractSha256']
        : ['runner', 'familyId', 'path', 'contractSha256', 'contract'];
      requireValue(own(contract, expected) && ['codex', 'claude', 'antigravity'].includes(contract.runner)
        && /^[a-z][a-z0-9-]{0,31}$/u.test(contract.familyId) && SHA.test(contract.contractSha256), 'DDB-MODEL-CONTRACT-INVALID');
      const family = `${contract.runner}:${contract.familyId}`;
      requireValue(!families.has(family), 'DDB-MODEL-CONTRACT-DUPLICATE');
      // Legacy requests bind the exact parsed contract; fresh requests bind
      // its original bytes as well as the existing canonical contract digest.
      const file = fresh ? read({ path: contract.path, sha256: contract.sha256 }) : (() => {
        requireValue(safePath(contract.path) && !paths.has(key(contract.path)), 'DDB-PATH-COLLISION');
        paths.add(key(contract.path)); const value = physical(root, contract.path); files.push(value);
        total += value.bytes.length; requireValue(total <= 4194304, 'DDB-REFERENCE-BOUNDS'); return value;
      })();
      const value = parseStrictJson(file.bytes);
      requireValue(validateAdapterContract(value).ok === true && value.runner === contract.runner
        && value.familyId === contract.familyId && digest(value) === contract.contractSha256
        && (fresh || canonicalizeJson(value) === canonicalizeJson(contract.contract)), 'DDB-MODEL-CONTRACT-DRIFT');
      families.set(family, contract.contractSha256);
    }
    requireValue(Array.isArray(modelRequest.subject?.assignments)
      && modelRequest.subject.assignments.every(row => families.get(`${row.runner}:${row.familyId}`) === row.adapterContractSha256),
    'DDB-MODEL-CONTRACT-ASSIGNMENT');
  }
  requireValue(files.every(file => { const reopened = physical(root, file.path, file.bytes.length);
    return reopened.identity === file.identity && reopened.bytes.equals(file.bytes); }), 'DDB-PHYSICAL-DRIFT');
  return { ok: true, required: true, bindingSha256: digest(binding), files, binding, modelRequest, prospective,
    disclosure: frozen({ schema: binding.schema,
      ...(prospective ? { prospectiveArchitecture: { manifest: binding.prospectiveArchitecture, targets: prospective.targets.map(({path,sha256}) => ({path,sha256})), status: "proposed-pending-aggregate-materialization" } } : {}),
      architectureDecisions: architectureDecisions.map(item => ({ id: item.record.id, status: item.record.status,
        scope: item.record.scope, moduleIds: item.record.moduleIds ?? [], references: item.entry })),
      modelPolicy: modelRequest ? { subjectSha256: digest(modelRequest.subject), subject: modelRequest.subject } : null, references: files.map(file => ({ path: file.path, sha256: file.sha256 })),
      approval: 'pending-canonical-design-signature', nativeAuthority: false }) };
}


function readSources(root, sources) {
  requireValue(own(sources, ['prd', 'spec', 'companions']) && refValid(sources.prd) && refValid(sources.spec)
    && Array.isArray(sources.companions) && sources.companions.length <= 64 && sources.companions.every(refValid), 'DDB-SOURCE-SHAPE');
  const refs = [sources.prd, sources.spec, ...sources.companions], names = refs.map(ref => ref.path);
  const folded = names.map(name => name.toLowerCase());
  requireValue(new Set(folded).size === folded.length
    && sources.companions.map(ref => ref.path).join('\0') === sources.companions.map(ref => ref.path).sort().join('\0'), 'DDB-SOURCE-COLLISION');
  const files = refs.map(ref => { const file = physical(root, ref.path); requireValue(file.sha256 === ref.sha256, 'DDB-SIGNED-SOURCE-DRIFT'); return file; });
  requireValue(files.reduce((sum, file) => sum + file.bytes.length, 0) <= 4194304, 'DDB-SOURCE-BOUNDS');
  return files;
}
function subset(root, sources) {
  const sourceFiles = readSources(root, sources);
  const carriers = sourceFiles.filter(file => parseDesignDecisionBindings(file.bytes) !== null);
  requireValue(carriers.length <= 1, 'DDB-DESCRIPTOR-AMBIGUOUS');
  if (!carriers.length) return { ok: true, required: false, handle: null, files: sourceFiles };
  const carrier = carriers[0], result = draft(root, carrier.path, carrier.sha256,
    sourceFiles.filter(file => file.path !== carrier.path).map(file => file.path), sources);
  const topology = resolvePoGateRepositoryTopology(root);
  const repositoryFingerprint = derivePoGateRepositoryFingerprint(topology);
  requireValue(result.binding.repositoryFingerprint === repositoryFingerprint, 'DDB-REPOSITORY-BINDING');
  result.files.push(...sourceFiles);
  return result;
}
export function inspectDesignDecisionBindingsDraft({ rootDir, sources } = {}) {
  try { const { files, binding, modelRequest, ...result } = subset(rootPath(rootDir), sources); return result; }
  catch (error) { return refusal(error); }
}
function refusal(error) { return fail(error?.message?.startsWith('DDB-') ? error.message : 'DDB-SOURCE-UNAVAILABLE'); }
function reopen(root, files) {
  requireValue(files.every(file => { const after = physical(root, file.path, file.bytes.length, file.internal === true);
    return after.identity === file.identity && after.bytes.equals(file.bytes); }), 'DDB-PHYSICAL-DRIFT');
}
function trust(root) {
  const policy = readCriticalHumanProofPolicy(root);
  requireValue(policy?.ok, 'DDB-TRUST-UNAVAILABLE');
  const anchors = policy.trustAnchors ?? (policy.trustAnchor ? [policy.trustAnchor] : []);
  requireValue(Array.isArray(anchors) && anchors.length > 0, 'DDB-TRUST-UNAVAILABLE'); return anchors;
}
// U3's pure request verifier deliberately delegates physical candidate
// provenance. Resolve the original commit's real tree and signed source blobs
// here, retaining lawful later descendants without requiring HEAD equality.
function candidateProvenance(root, candidate, sources) {
  requireValue(own(candidate,['commit','tree']) && OID.test(candidate.commit) && OID.test(candidate.tree), 'DDB-CANDIDATE-SHAPE');
  const git = (args, maxBuffer=1048577) => {
    const result=spawnSync('git',['-C',root,...args],{encoding:null,timeout:10000,maxBuffer,env:process.env});
    requireValue(result.status===0 && !result.error && !result.signal && Buffer.isBuffer(result.stdout), 'DDB-CANDIDATE-UNAVAILABLE');
    return result.stdout;
  };
  requireValue(git(['cat-file','-t',candidate.commit],128).toString('utf8').trim()==='commit'
    && git(['cat-file','-t',candidate.tree],128).toString('utf8').trim()==='tree'
    && git(['rev-parse','--verify',`${candidate.commit}^{tree}`],128).toString('utf8').trim()===candidate.tree, 'DDB-CANDIDATE-TREE');
  // A foreign/unrelated commit is not the approved source generation. Later
  // commits may advance the current branch; the original candidate remains an
  // ancestor, with its own immutable tree and physically matched SourceSet.
  git(['merge-base','--is-ancestor',candidate.commit,'HEAD'],128);
  for(const ref of [sources.prd,sources.spec,...sources.companions]) {
    requireValue(refValid(ref),'DDB-SOURCE-SHAPE');
    const row=git(['ls-tree','-z',candidate.commit,'--',ref.path],1024).toString('utf8');
    const match=/^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/u.exec(row);
    requireValue(match && match[3]===ref.path,'DDB-CANDIDATE-SOURCE-MODE');
    const bytes=git(['cat-file','blob',match[2]]);
    requireValue(bytes.length>0 && bytes.length<=1048576 && hash(bytes)===ref.sha256,'DDB-CANDIDATE-SOURCE-DRIFT');
  }
}
function verifyBasis(root, requestFile, approval, receiptFiles) {
  const request = parseStrictJson(requestFile.bytes), sourceFiles = readSources(root, request.binding?.sources);
  requireValue(own(approval, ['schema','mode','approvedBy','approvedAt','bindingSha256','intentSha256','proofSha256','proof'])
    && approval.schema === 'pipeline.design-approval.v1' && approval.mode === 'signature', 'DDB-WHOLE-DESIGN-SIGNATURE-REQUIRED');
  const receipts = request.binding.reviewReceipts.map((ref, index) => {
    const file = receiptFiles[index]; requireValue(file && file.originalPath === ref.path && file.sha256 === ref.sha256, 'DDB-REVIEW-RECEIPT-DRIFT');
    return { path: ref.path, bytes: file.bytes };
  });
  requireValue(receiptFiles.length === receipts.length, 'DDB-REVIEW-RECEIPT-DRIFT');
  const checked = verifyDesignApprovalRequest({ request, featureId: request.binding.featureId, receipts, currentSources: request.binding.sources });
  requireValue(checked.ok && checked.bindingSha256 === approval.bindingSha256
    && checked.intentSha256 === approval.intentSha256, 'DDB-REQUEST-BINDING');
  candidateProvenance(root, checked.candidate, request.binding.sources);
  const anchors = trust(root), proof = verifyAgainstTrustAnchors({ intent: request.approvalIntent, anchors, proof: approval.proof });
  requireValue(proof.verified && proof.proofSha256 === approval.proofSha256, 'DDB-SIGNATURE-INVALID');
  const result = subset(root, request.binding.sources);
  if (!result.required) return result;
  requireValue(result.binding.featureId === request.binding.featureId, 'DDB-FEATURE-BINDING');
  const approvalBasis = frozen({ schema: 'pipeline.aggregate-design-approval-basis.v1', requestSha256: requestFile.sha256,
    featureId: request.binding.featureId, repositoryFingerprint: result.binding.repositoryFingerprint,
    candidateAtApproval: checked.candidate, bindingSha256: checked.bindingSha256, intentSha256: checked.intentSha256,
    proofSha256: approval.proofSha256, descriptorSha256: result.bindingSha256 });
  const files = [requestFile, ...receiptFiles, ...sourceFiles, ...result.files]; reopen(root, files);
  return { ...result, approvalBasis, requestFile, receiptFiles, approval: frozen(approval), trustAnchors: frozen(anchors), files };
}
function approved(root, area) {
  requireValue(['architecture','model-policy'].includes(area), 'DDB-AREA-INVALID');
  const selected = resolveProjectAuthorityPaths({ rootDir: root });
  requireValue(selected.status === 'ready' && ['neutral','legacy'].includes(selected.source), 'DDB-PROJECT-AUTHORITY');
  const stateFile = physical(root, selected.state, 1048576, true), manifest = physical(root, selected.manifest, 1048576, true);
  stateFile.internal = manifest.internal = true;
  requireValue(stateFile.sha256 === selected.stateSha256 && manifest.sha256 === selected.manifestSha256, 'DDB-PROJECT-DRIFT');
  const state = parseStrictJson(stateFile.bytes), record = state.planApproval, binding = record?.designApprovalBinding;
  if (!['pipeline.plan-approval.v8','pipeline.plan-approval.v9'].includes(record?.schema) || !binding) {
    // Applicability precedes approval: the selected physical presentation may
    // already require aggregate approval even though no approval exists yet.
    const pendingBinding = state.planPresentation?.designApprovalBinding;
    if (pendingBinding) {
      const pendingSubset = subset(root, pendingBinding.sources);
      reopen(root, [stateFile, manifest, ...pendingSubset.files]);
      requireValue(!pendingSubset.required, 'DDB-CURRENT-APPROVAL-REQUIRED');
    }
    if (state.activeFeature?.planPath) {
      const selectedPlan = physical(root, state.activeFeature.planPath);
      requireValue(parseDesignDecisionBindings(selectedPlan.bytes)?.schema !== "pipeline.design-decision-bindings.v2", "DDB-CURRENT-APPROVAL-REQUIRED");
    }
    return { ok: true, required: false, handle: null };
  }
  const candidateSubset = subset(root, binding.sources);
  if (!candidateSubset.required) return { ok: true, required: false, handle: null };
  const presentation = state.planPresentation;
  requireValue(state.planApproved === true && !state.planRevocation && state.activeFeature?.id === binding.featureId
    && state.planSubmission?.featureId === binding.featureId && presentation?.schema === 'pipeline.plan-presentation.v3'
    && presentation.designApprovalRequestPath === `scratch/design-approval-request-${digest(binding)}.json`
    && canonicalizeJson(presentation.designApprovalBinding) === canonicalizeJson(binding)
    && presentation.submissionSha256 === record.submissionSha256 && record.approvedBy === record.designApproval?.approvedBy,
  'DDB-CURRENT-APPROVAL-REQUIRED');
  const prd = binding.sources.prd, spec = binding.sources.spec;
  const lifecycle = derivePlanLifecycle(state, { planSha256: prd.sha256, specSha256: spec.sha256 });
  requireValue(lifecycle.ok && ['approved','implementing'].includes(lifecycle.status), 'DDB-LIFECYCLE-STALE');
  requireValue(designAdvisoryAdmission(state, root, prd.path, spec.path).ok, 'DDB-CURRENT-APPROVAL-REQUIRED');
  const gate = validatePoGateAuthorityForRepository({ repoRoot: root, expectedPlanSha256: prd.sha256, expectedSpecSha256: spec.sha256 });
  requireValue(gate.ok && canonicalizeJson(gate.value) === canonicalizeJson(record.poGateAuthority)
    && gate.value.repositoryFingerprint === candidateSubset.binding.repositoryFingerprint, 'DDB-REPOSITORY-BINDING');
  const requestFile = physical(root, presentation.designApprovalRequestPath), request = parseStrictJson(requestFile.bytes);
  requireValue(canonicalizeJson(request.binding) === canonicalizeJson(binding), 'DDB-PRESENTATION-DRIFT');
  const receiptFiles = request.binding.reviewReceipts.map(ref => ({ ...physical(root, ref.path), originalPath: ref.path }));
  const result = verifyBasis(root, requestFile, record.designApproval, receiptFiles);
  result.files.push(stateFile, manifest); reopen(root, result.files); return result;
}
function branded(root, area, result, retained = null) {
  if (!result.required) return { ok: true, required: false, handle: null };
  const handle = Object.freeze(Object.create(null));
  handles.set(handle, { root, area, approvalBasis: result.approvalBasis, retained });
  return { ok: true, required: true, handle, approvalBasis: result.approvalBasis,
    disclosure: frozen({ ...result.disclosure, approval: 'approved-canonical-design-signature' }) };
}
export function inspectApprovedDesignDecisionBindings({ rootDir, area } = {}) {
  try { const root = rootPath(rootDir); return branded(root, area, approved(root, area)); } catch (error) { return refusal(error); }
}
export function readApprovedDesignDecisionBindingsHandle(handle) {
  const held = handles.get(handle); if (!held) return fail('DDB-OWNED-HANDLE-REQUIRED');
  try {
    const result = held.retained ? retained(held.root, held.retained) : approved(held.root, held.area);
    requireValue(result.required && canonicalizeJson(result.approvalBasis) === canonicalizeJson(held.approvalBasis), 'DDB-APPROVAL-DRIFT');
    return { ok: true, required: true, area: held.area, approvalBasis: result.approvalBasis, modelRequest: frozen(result.modelRequest),
      binding: frozen(result.binding), prospective: result.prospective ? frozen({ materialized: result.prospective.materialized, targets: result.prospective.targets, decisions: result.prospective.decisions }) : null, trustAnchors: result.trustAnchors };
  } catch (error) { return refusal(error); }
}
/** Fixed publication bundle derived exclusively from a genuine current DAB
 * handle. Retained authority is published last by the state-lock transaction. */
export function prepareApprovedArchitectureMaterialization(handle) {
  const held = handles.get(handle);
  if (!held) return fail('DDB-OWNED-HANDLE-REQUIRED');
  try {
    requireValue(held.area === 'architecture' && !held.retained, 'DDB-ARCHITECTURE-HANDLE-REQUIRED');
    const result = approved(held.root, held.area);
    requireValue(result.required && canonicalizeJson(result.approvalBasis) === canonicalizeJson(held.approvalBasis), 'DDB-APPROVAL-DRIFT');
    const prospectiveTargets = result.prospective?.targets ?? [];
    const targets = prospectiveTargets.filter(target => !target.present).map(({ path, bytes }) => ({ path, bytes }));
    const inventoryTargets = prospectiveTargets.map(({ path, bytes }) => ({ path, bytes }));
    const evidence = file => {
      const path = `project/design-approval-evidence/${file.sha256}.json`;
      const present = existsSync(join(held.root, path)) ? physical(held.root, path) : null;
      requireValue(!present || present.bytes.equals(file.bytes), 'DDB-RETENTION-DRIFT');
      if (!present && !targets.some(target => target.path === path)) targets.unshift({ path, bytes: file.text });
      if (!inventoryTargets.some(target => target.path === path)) inventoryTargets.unshift({ path, bytes: file.text });
      return { path, sha256: file.sha256 };
    };
    const request = evidence(result.requestFile), receipts = result.receiptFiles.map(file => ({ originalPath: file.originalPath, retained: evidence(file) }));
    const reference = { schema: 'pipeline.aggregate-design-architecture-reference.v1',
      approvalBasis: result.approvalBasis, request, receipts, approval: result.approval };
    const referencePath = `${ARCHITECTURE_REFERENCES}/${digest(result.approvalBasis)}.json`;
    const referenceBytes = `${JSON.stringify(reference, null, 2)}\n`;
    if (existsSync(join(held.root, referencePath))) {
      requireValue(physical(held.root, referencePath).text === referenceBytes && (!result.prospective || result.prospective.materialized), 'DDB-RETENTION-DRIFT');
    } else targets.push({ path: referencePath, bytes: referenceBytes });
    inventoryTargets.push({ path: referencePath, bytes: referenceBytes });
    reopen(held.root, result.files);
    return { ok: true, required: !!result.prospective, targets, inventoryTargets, referencePath, approvalBasis: result.approvalBasis };
  } catch (error) { return refusal(error); }
}
export function createDesignModelPolicyRequest({ assignments, adapterContractBindings } = {}) {
  try {
    const routeSource = registeredModelFamilyTaskRoutes();
    const subject = { revision: 'model-family-v2', predecessorAuthoritySha256: null,
      routeSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }), assignments, migration: null };
    const checked = validateModelFamilyAuthoritySubject({ subject, routeSource, trustAnchors: [], predecessor: null });
    requireValue(checked.ok && Array.isArray(adapterContractBindings) && adapterContractBindings.length > 0
      && adapterContractBindings.length <= 64 && adapterContractBindings.every(value => own(value, ['runner','familyId','path','sha256','contractSha256'])
        && refValid({path:value.path,sha256:value.sha256}) && SHA.test(value.contractSha256)), 'DDB-MODEL-REQUEST-INVALID');
    return { ok: true, request: frozen({ schema: 'pipeline.model-family-design-request.v1', subject, adapterContractBindings }), subjectSha256: digest(subject) };
  } catch (error) { return refusal(error); }
}
// This bounded writer has no caller destination or operation callback. Only an
// actually owned, freshly verified model handle can retain these public DAB
// records. PRD/spec/companions and transitive subjects remain exact physical
// references; changing them requires a newly approved binding.
function evidenceDirectory(root) {
  const project = join(root, 'project'), directory = join(project, 'design-approval-evidence');
  for (const path of [project,directory]) {
    if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
    const stat = lstatSync(path,{bigint:true});
    requireValue(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path && (stat.mode & 0o022n) === 0n, 'DDB-RETENTION-PARENT-UNSAFE');
  }
  return directory;
}
function retainFile(root, file) {
  const path = `project/design-approval-evidence/${file.sha256}.json`; let fd;
  if (existsSync(join(root,path))) { requireValue(physical(root,path).bytes.equals(file.bytes), 'DDB-RETENTION-DRIFT'); return {path,sha256:file.sha256}; }
  try {
    fd=openSync(join(root,path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    let offset=0; while(offset<file.bytes.length) offset+=writeSync(fd,file.bytes,offset,file.bytes.length-offset);
    fsyncSync(fd);
  } finally { if(fd!==undefined) closeSync(fd); }
  requireValue(physical(root,path).bytes.equals(file.bytes),'DDB-RETENTION-DRIFT'); return {path,sha256:file.sha256};
}
export function retainApprovedDesignModelPolicyReference(handle) {
  const held=handles.get(handle); if(!held) return fail('DDB-OWNED-HANDLE-REQUIRED');
  try {
    requireValue(held.area === 'model-policy' && !held.retained,'DDB-MODEL-HANDLE-REQUIRED');
    const result=approved(held.root,held.area);
    requireValue(result.required && result.modelRequest && canonicalizeJson(result.approvalBasis) === canonicalizeJson(held.approvalBasis),'DDB-APPROVAL-DRIFT');
    evidenceDirectory(held.root);
    const request=retainFile(held.root,result.requestFile), receipts=result.receiptFiles.map(file=>({originalPath:file.originalPath,retained:retainFile(held.root,file)}));
    const reference=frozen({schema:'pipeline.aggregate-design-model-policy-reference.v1',approvalBasis:result.approvalBasis,request,receipts,approval:result.approval});
    const bytes=Buffer.from(JSON.stringify(reference,null,2)+'\n'); requireValue(bytes.length<=1048576,'DDB-RETENTION-BOUNDS');
    const target=join(held.root,REFERENCE_PATH), prior=existsSync(target)?physical(held.root,REFERENCE_PATH):null;
    if(prior && prior.bytes.equals(bytes)) return {ok:true,referencePath:REFERENCE_PATH,referenceSha256:prior.sha256};
    if(prior) requireValue(own(parseStrictJson(prior.bytes),['schema','approvalBasis','request','receipts','approval'])
      && parseStrictJson(prior.bytes).schema==='pipeline.aggregate-design-model-policy-reference.v1','DDB-RETENTION-SHAPE');
    const temporary=`project/.aggregate-design-model-policy-${process.pid}-${hash(bytes)}.tmp`; let fd;
    try {
      fd=openSync(join(held.root,temporary),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
      let offset=0; while(offset<bytes.length) offset+=writeSync(fd,bytes,offset,bytes.length-offset); fsyncSync(fd); closeSync(fd); fd=undefined;
      reopen(held.root,result.files);
      requireValue(prior?physical(held.root,REFERENCE_PATH).identity===prior.identity:!existsSync(target),'DDB-RETENTION-DRIFT');
      renameSync(join(held.root,temporary),target);
    } finally { if(fd!==undefined) closeSync(fd); if(existsSync(join(held.root,temporary))) unlinkSync(join(held.root,temporary)); }
    requireValue(physical(held.root,REFERENCE_PATH).bytes.equals(bytes),'DDB-RETENTION-DRIFT');
    return {ok:true,referencePath:REFERENCE_PATH,referenceSha256:hash(bytes)};
  } catch(error) { return refusal(error); }
}
function retained(root,path) {
  requireValue(path===REFERENCE_PATH,'DDB-RETENTION-PATH');
  const file=physical(root,path), record=parseStrictJson(file.bytes);
  requireValue(own(record,['schema','approvalBasis','request','receipts','approval']) && record.schema==='pipeline.aggregate-design-model-policy-reference.v1'
    && refValid(record.request) && record.request.path===`project/design-approval-evidence/${record.request.sha256}.json`
    && Array.isArray(record.receipts) && record.receipts.length>=1 && record.receipts.length<=2,'DDB-RETENTION-SHAPE');
  const requestFile=physical(root,record.request.path); requireValue(requestFile.sha256===record.request.sha256,'DDB-RETENTION-DRIFT');
  const receipts=record.receipts.map(entry=>{
    requireValue(own(entry,['originalPath','retained']) && safePath(entry.originalPath) && refValid(entry.retained)
      && entry.retained.path===`project/design-approval-evidence/${entry.retained.sha256}.json`,'DDB-RETENTION-SHAPE');
    const value=physical(root,entry.retained.path); requireValue(value.sha256===entry.retained.sha256,'DDB-RETENTION-DRIFT'); return {...value,originalPath:entry.originalPath};
  });
  const result=verifyBasis(root,requestFile,record.approval,receipts);
  requireValue(result.required && result.modelRequest && canonicalizeJson(result.approvalBasis)===canonicalizeJson(record.approvalBasis),'DDB-RETENTION-DRIFT');
  result.files.push(file); reopen(root,result.files); return result;
}
export function readRetainedDesignModelPolicyReference({rootDir,referencePath=REFERENCE_PATH}={}) {
  try { const root=rootPath(rootDir); return branded(root,'model-policy',retained(root,referencePath),referencePath); } catch(error) { return refusal(error); }
}
export function readDesignModelPolicyPredecessor(handle) {
  try {
    const held=handles.get(handle); requireValue(held,'DDB-OWNED-HANDLE-REQUIRED');
    const read=readApprovedDesignDecisionBindingsHandle(handle); requireValue(read.ok && read.area==='model-policy' && read.modelRequest,'DDB-MODEL-HANDLE-REQUIRED');
    const root=held.root, modelRequest=read.modelRequest, path='project/model-role-approved-policy.v1.json';
    if(modelRequest?.subject?.migration===null) {
      requireValue(!existsSync(join(root,path)),'DDB-AUTHENTICATED-MIGRATION-REQUIRED'); return {ok:true,predecessor:null};
    }
    const file=physical(root,path);
    requireValue(hash(file.bytes)===modelRequest?.historicBinding?.historicBundleByteSha256,'DDB-HISTORIC-POLICY-DRIFT');
    return {ok:true,predecessor:{rawBundleBytes:file.bytes,historicRouteSource:registeredFunctionalTaskRoutes(),migrationProjection:modelRequest.migrationProjection}};
  } catch(error) { return refusal(error); }
}

// Architecture efficacy is a subset of the original aggregate approval, never
// a second ceremony. Keep each original basis immutable across feature close.
const ARCHITECTURE_REFERENCES = 'project/aggregate-design-architecture-references';
function architectureReferenceDirectory(root, create = false) {
  if (create) evidenceDirectory(root);
  const target = join(root, ARCHITECTURE_REFERENCES);
  if (!existsSync(target)) {
    if (!create) return null;
    mkdirSync(target, { mode: 0o700 });
  }
  for (const path of [join(root, 'project'), target]) {
    const stat = lstatSync(path, { bigint: true });
    requireValue(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path
      && (stat.mode & 0o022n) === 0n, 'DDB-RETENTION-PARENT-UNSAFE');
  }
  return target;
}
function architectureReferenceNames(directory) {
  const names = readdirSync(directory).sort();
  requireValue(names.length <= 64 && names.every(name => /^[a-f0-9]{64}\.json$/u.test(name)), 'DDB-RETENTION-MEMBERSHIP');
  return names;
}
export function retainApprovedDesignArchitectureReference(handle) {
  const held = handles.get(handle);
  if (!held) return fail('DDB-OWNED-HANDLE-REQUIRED');
  try {
    requireValue(held.area === 'architecture' && !held.retained, 'DDB-ARCHITECTURE-HANDLE-REQUIRED');
    const result = approved(held.root, held.area);
    requireValue(result.required && canonicalizeJson(result.approvalBasis) === canonicalizeJson(held.approvalBasis), 'DDB-APPROVAL-DRIFT');
    requireValue(!result.prospective || result.prospective.materialized, "DDB-PROSPECTIVE-NOT-MATERIALIZED");
    const directory = architectureReferenceDirectory(held.root, true);
    const names = architectureReferenceNames(directory);
    const referencePath = `${ARCHITECTURE_REFERENCES}/${digest(result.approvalBasis)}.json`;
    const request = retainFile(held.root, result.requestFile);
    const receipts = result.receiptFiles.map(file => ({ originalPath: file.originalPath, retained: retainFile(held.root, file) }));
    const reference = frozen({ schema: 'pipeline.aggregate-design-architecture-reference.v1',
      approvalBasis: result.approvalBasis, request, receipts, approval: result.approval });
    const bytes = Buffer.from(JSON.stringify(reference, null, 2) + '\n');
    requireValue(bytes.length <= 1048576, 'DDB-RETENTION-BOUNDS');
    reopen(held.root, result.files);
    if (existsSync(join(held.root, referencePath))) {
      const prior = physical(held.root, referencePath);
      requireValue(prior.bytes.equals(bytes), 'DDB-RETENTION-DRIFT');
      return { ok: true, referencePath, referenceSha256: prior.sha256 };
    }
    requireValue(names.length < 64, 'DDB-RETENTION-BOUNDS');
    requireValue(architectureReferenceNames(directory).join('\0') === names.join('\0'), 'DDB-RETENTION-MEMBERSHIP');
    let fd;
    try {
      fd = openSync(join(held.root, referencePath), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally { if (fd !== undefined) closeSync(fd); }
    requireValue(physical(held.root, referencePath).bytes.equals(bytes), 'DDB-RETENTION-DRIFT');
    const directoryFd = openSync(directory, constants.O_RDONLY);
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
    reopen(held.root, result.files);
    return { ok: true, referencePath, referenceSha256: hash(bytes) };
  } catch (error) { return refusal(error); }
}
function retainedArchitecture(root, path) {
  const file = physical(root, path), record = parseStrictJson(file.bytes);
  requireValue(own(record, ['schema', 'approvalBasis', 'request', 'receipts', 'approval'])
    && record.schema === 'pipeline.aggregate-design-architecture-reference.v1'
    && path === `${ARCHITECTURE_REFERENCES}/${digest(record.approvalBasis)}.json`
    && refValid(record.request) && record.request.path === `project/design-approval-evidence/${record.request.sha256}.json`
    && Array.isArray(record.receipts) && record.receipts.length >= 1 && record.receipts.length <= 2, 'DDB-RETENTION-SHAPE');
  const requestFile = physical(root, record.request.path);
  requireValue(requestFile.sha256 === record.request.sha256, 'DDB-RETENTION-DRIFT');
  const receipts = record.receipts.map(entry => {
    requireValue(own(entry, ['originalPath', 'retained']) && safePath(entry.originalPath) && refValid(entry.retained)
      && entry.retained.path === `project/design-approval-evidence/${entry.retained.sha256}.json`, 'DDB-RETENTION-SHAPE');
    const read = physical(root, entry.retained.path);
    requireValue(read.sha256 === entry.retained.sha256, 'DDB-RETENTION-DRIFT');
    return { ...read, originalPath: entry.originalPath };
  });
  const result = verifyBasis(root, requestFile, record.approval, receipts);
  requireValue(result.required && canonicalizeJson(result.approvalBasis) === canonicalizeJson(record.approvalBasis), 'DDB-RETENTION-DRIFT');
  result.files.push(file); reopen(root, result.files); return result;
}
export function readEffectiveDesignArchitectureAuthority({ rootDir } = {}) {
  try {
    const root = rootPath(rootDir), results = [];
    const directory = architectureReferenceDirectory(root);
    const directoryIdentity = directory ? locator(lstatSync(directory, { bigint: true })) : null;
    const names = directory ? architectureReferenceNames(directory) : [];
    for (const name of names) results.push(retainedArchitecture(root, `${ARCHITECTURE_REFERENCES}/${name}`));
    // Absence/staleness of a current feature never creates authority and does
    // not erase an independently reverified original retained approval.
    try { const current = approved(root, 'architecture'); if (current.required) results.push(current); } catch { /* no current grant */ }
    if (directory) requireValue(realpathSync(directory) === directory
      && locator(lstatSync(directory, { bigint: true })) === directoryIdentity
      && architectureReferenceNames(directory).join('\0') === names.join('\0'), 'DDB-RETENTION-MEMBERSHIP');
    const decisions = new Map(), approvalBases = new Map();
    for (const result of results) {
      reopen(root, result.files);
      approvalBases.set(digest(result.approvalBasis), result.approvalBasis);
      requireValue(!result.prospective || result.prospective.materialized, "DDB-PROSPECTIVE-NOT-MATERIALIZED");
      for (const entry of [...result.binding.architectureDecisions, ...(result.prospective?.decisions.map(row => row.entry) ?? [])]) {
        const markdown = result.files.find(file => file.path === entry.markdown.path) ?? physical(root, entry.markdown.path);
        const sidecarFile = result.files.find(file => file.path === entry.sidecar.path) ?? physical(root, entry.sidecar.path);
        const record = parseStrictJson(sidecarFile.bytes);
        requireValue(markdown.sha256 === entry.markdown.sha256 && sidecarFile.sha256 === entry.sidecar.sha256, 'DDB-REFERENCE-DRIFT');
        const value = { id: entry.id, digest: markdown.sha256, scope: record.scope, moduleIds: record.moduleIds ?? [],
          path: entry.markdown.path, sidecarPath: entry.sidecar.path, sidecarSha256: entry.sidecar.sha256,
          chatSelectionPath: entry.chatSelection.path, chatSelectionSha256: entry.chatSelection.sha256,
          supersedes: record.supersedes ?? null, approvalBasis: result.approvalBasis };
        const prior = decisions.get(entry.id);
        requireValue(!prior || (prior.digest === value.digest && prior.sidecarSha256 === value.sidecarSha256
          && prior.chatSelectionSha256 === value.chatSelectionSha256), 'DDB-ARCHITECTURE-AUTHORITY-CONFLICT');
        decisions.set(entry.id, value);
      }
    }
    return frozen({ ok: true, decisions: [...decisions.values()].sort((a,b) => a.id.localeCompare(b.id)),
      approvalBases: [...approvalBases.values()] });
  } catch (error) { return refusal(error); }
}
