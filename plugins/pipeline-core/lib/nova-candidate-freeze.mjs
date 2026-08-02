// SPDX-License-Identifier: SUL-1.0
/** Closed, candidate-bound Nova B5 freeze and evidence-manifest contracts. */
import { canonicalJson, sha256Canonical } from "./review-economy.mjs";

export const NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V1 = "pipeline.nova-b5-candidate-freeze.v1";
export const NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2 = "pipeline.nova-b5-candidate-freeze.v2";
// V1 remains the historical pre-v0.4.7 record. New callers choose V2
// explicitly, so a legacy base cannot be emitted by accident.
export const NOVA_B5_CANDIDATE_FREEZE_SCHEMA = NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V1;
export const NOVA_B5_EVIDENCE_MANIFEST_SCHEMA = "pipeline.nova-b5-evidence-manifest.v1";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const PATH = /^(?!\/)(?!.*\\\\)[A-Za-z0-9._@+/-]{1,512}$/u;
const BRANCH = /^feat\/sprint-nova-codex-v046$/u;
const POST_V047_BASE = "89cb12b99e3fd86ac44878d0c23b278f00538921";
const DEFERRED = Object.freeze([
  "B2-I remote broker integration",
  "B3-I direct Antigravity implementation",
  "live B4 forge operation",
  "B6 native Apple Silicon lifecycle, Critic and PO close",
]);
const FREEZE_ROOT = Object.freeze(["schema", "candidate", "base", "portfolio", "backlog", "gates", "deferred", "status", "recordSha256"]);
const MANIFEST_ROOT = Object.freeze(["schema", "candidate", "sources", "scope", "recordSha256"]);
const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const candidate = (value, branch = false) => exact(value, branch ? ["commit", "tree", "branch"] : ["commit", "tree"])
  && OID.test(value.commit ?? "") && OID.test(value.tree ?? "") && (!branch || BRANCH.test(value.branch ?? ""));
const source = (value) => exact(value, ["path", "sha256"]) && PATH.test(value.path ?? "") && SHA.test(value.sha256 ?? "");
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const digest = (schema, record) => {
  const { recordSha256, ...core } = record;
  return sha256Canonical({ schema, ...core });
};

function freezeBaseCode(record) {
  if (!object(record) || !exact(record.base, ["release", "commit"])) return "NBF-SHAPE";
  if (record.schema === NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V1) {
    return record.base.release === "v0.4.6" && OID.test(record.base.commit ?? "") ? null : "NBF-SHAPE";
  }
  if (record.schema === NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2) {
    return record.base.release === "v0.4.7" && record.base.commit === POST_V047_BASE ? null : "NBF-BASE";
  }
  return "NBF-SHAPE";
}

function freezeCode(record) {
  const baseCode = freezeBaseCode(record);
  if (!exact(record, FREEZE_ROOT) || !new Set([NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V1, NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2]).has(record.schema)
    || !candidate(record.candidate, true)
    || !exact(record.portfolio, ["bindingPath", "bindingSha256", "issueCount", "cyborgInput"])
    || record.portfolio.bindingPath !== "specs/sprint-nova-epic/design/backlog-spec-bindings.json" || !SHA.test(record.portfolio.bindingSha256 ?? "")
    || record.portfolio.issueCount !== 17 || record.portfolio.cyborgInput !== "none"
    || !exact(record.backlog, ["status", "indexSha256", "statusSha256", "ledgerSha256"]) || record.backlog.status !== "green"
    || ![record.backlog.indexSha256, record.backlog.statusSha256, record.backlog.ledgerSha256].every((value) => SHA.test(value ?? ""))
    || !exact(record.gates, ["verify", "security"]) || ![record.gates.verify, record.gates.security].every((gate) => exact(gate, ["path", "sha256", "exitCode", "binding"])
      && PATH.test(gate.path ?? "") && SHA.test(gate.sha256 ?? "") && gate.exitCode === 0 && ["exact-clean-candidate", "clean-exact-candidate"].includes(gate.binding))
    || !Array.isArray(record.deferred) || record.deferred.length !== DEFERRED.length || !record.deferred.every((value, index) => value === DEFERRED[index])
    || record.status !== "frozen-awaiting-external-native-gates" || !SHA.test(record.recordSha256 ?? "")) return "NBF-SHAPE";
  if (baseCode !== null) return baseCode;
  return record.recordSha256 === digest(record.schema, record) ? null : "NBF-DIGEST";
}

function manifestCode(record) {
  if (!exact(record, MANIFEST_ROOT) || record.schema !== NOVA_B5_EVIDENCE_MANIFEST_SCHEMA || !candidate(record.candidate)
    || !Array.isArray(record.sources) || record.sources.length !== 7 || !record.sources.every(source)
    || !record.sources.every((value, index) => index === 0 || record.sources[index - 1].path < value.path)
    || record.scope !== "candidate-freeze-only; native Apple Silicon, independent Critic and PO close remain pending" || !SHA.test(record.recordSha256 ?? "")) return "NBM-SHAPE";
  return record.recordSha256 === digest(NOVA_B5_EVIDENCE_MANIFEST_SCHEMA, record) ? null : "NBM-DIGEST";
}

export function validateNovaB5CandidateFreeze(record) { const code = freezeCode(record); return { ok: code === null, code }; }
export function validateNovaB5EvidenceManifest(record) { const code = manifestCode(record); return { ok: code === null, code }; }
export function sealNovaB5CandidateFreeze(draft) {
  if (!object(draft) || Object.hasOwn(draft, "schema") || Object.hasOwn(draft, "recordSha256")) throw new TypeError("NBF-DRAFT");
  const record = { schema: NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V1, ...structuredClone(draft), recordSha256: "0".repeat(64) };
  const { recordSha256, ...core } = record; record.recordSha256 = sha256Canonical({ schema: record.schema, ...core });
  if (!validateNovaB5CandidateFreeze(record).ok) throw new TypeError("NBF-DRAFT"); return freeze(record);
}
export function sealNovaB5CandidateFreezeV2(draft) {
  if (!object(draft) || Object.hasOwn(draft, "schema") || Object.hasOwn(draft, "recordSha256")) throw new TypeError("NBF-DRAFT");
  const record = { schema: NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2, ...structuredClone(draft), recordSha256: "0".repeat(64) };
  const { recordSha256, ...core } = record; record.recordSha256 = sha256Canonical({ schema: record.schema, ...core });
  if (!validateNovaB5CandidateFreeze(record).ok) throw new TypeError("NBF-DRAFT"); return freeze(record);
}
export function sealNovaB5EvidenceManifest(draft) {
  if (!object(draft) || Object.hasOwn(draft, "schema") || Object.hasOwn(draft, "recordSha256")) throw new TypeError("NBM-DRAFT");
  const record = { schema: NOVA_B5_EVIDENCE_MANIFEST_SCHEMA, ...structuredClone(draft), recordSha256: "0".repeat(64) };
  const { recordSha256, ...core } = record; record.recordSha256 = sha256Canonical({ schema: NOVA_B5_EVIDENCE_MANIFEST_SCHEMA, ...core });
  if (!validateNovaB5EvidenceManifest(record).ok) throw new TypeError("NBM-DRAFT"); return freeze(record);
}
