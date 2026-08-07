// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, candidate-bound Nova B5 freeze and evidence-manifest contracts.
 *
 * Candidate worktree tolerance (ADR-0061 / one-approval-all-layers design, Change 3):
 * `approve-push` writes its authorization into TRACKED `project/pipeline-state.json`, so
 * before this tolerance existed every approved push dirtied the tree, Verify refused the
 * candidate, and committing the record moved `HEAD` past the `forCommit` the approval
 * names -- approve, verify and push could not all three be walked. `classifyNovaCandidateWorktree`
 * therefore returns the distinct status `approval-pending` (never `clean`) for exactly one
 * shape of dirt: a single modified tracked path, `project/pipeline-state.json`, whose parsed
 * difference against its `HEAD` blob is precisely the transition `approve-push` emits for the
 * CURRENT `HEAD` commit -- a `pushApproval.lastApproved` bound to that commit plus the one
 * `criticalProofConsumption` entry for its proof, and nothing else. The tolerance is safe
 * because the evidence candidate is `HEAD`'s commit and tree, which this permitted difference
 * provably cannot alter: every field that could change what was tested must still be
 * structurally identical to `HEAD`, the run is labelled `approval-pending` rather than `exact`
 * so it can never be mistaken for a run on a pristine tree, and every other tree -- a second
 * modified path, any other field, a foreign `forCommit`, an unreadable or unparseable state
 * file -- still fails closed to `dirty`.
 */
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

/** The one tracked path whose approval transition the candidate freeze tolerates. */
export const NOVA_APPROVAL_STATE_PATH = "project/pipeline-state.json";
/** Distinct from `clean`/`dirty`/`unavailable`: a candidate carrying only an armed push approval. */
export const NOVA_APPROVAL_PENDING_STATUS = "approval-pending";
/** Distinct from `exact`/`drift`/`preflight-rejected`/`unavailable`: the binding such a run earns. */
export const NOVA_APPROVAL_PENDING_BINDING = "approval-pending";

// Exactly the fields `approve-push` (pipeline-state.mjs) writes, and no others. A record
// carrying an extra field did not come from that writer, so it is not the tolerated transition.
const APPROVAL_KEYS = Object.freeze(["approvedBy", "approvedAt", "forCommit", "criticalProof", "remote", "destination", "threatModel"]);
const CONSUMPTION_KEYS = Object.freeze(["proofSha256", "kind", "consumedAt"]);
// The only three top-level keys that writer touches; everything else must survive untouched.
const TRANSITION_KEYS = Object.freeze(new Set(["pushApproval", "criticalProofConsumption", "updatedAt"]));
// `git status --porcelain=v1` codes for "tracked file, content modified" (index and/or worktree).
// Every other code -- add, delete, rename, copy, unmerged, untracked, ignored -- is refused.
const MODIFIED_CODES = Object.freeze(new Set([" M", "M ", "MM"]));

/** Structural JSON equality: parsed values only, never a text or diff comparison. */
function same(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  }
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}

const untouched = (state) => Object.fromEntries(Object.entries(state).filter(([key]) => !TRANSITION_KEYS.has(key)));

/**
 * Is the parsed difference between the `HEAD` state and the worktree state exactly the
 * push-approval transition `approve-push` writes for `headCommit`? Structural throughout.
 *
 * @param {{headState: object, worktreeState: object, headCommit: string}} input
 * @returns {boolean}
 */
export function isPushApprovalTransition({ headState, worktreeState, headCommit } = {}) {
  if (!object(headState) || !object(worktreeState) || !OID.test(headCommit ?? "")) return false;
  // Nothing outside the writer's three keys may differ -- not a gate record, not `activeFeature`,
  // not `schema`. This is what keeps the tolerance to ONE transition instead of to the file.
  if (!same(untouched(headState), untouched(worktreeState))) return false;
  if (!exact(worktreeState.pushApproval, ["lastApproved"])) return false;
  const approval = worktreeState.pushApproval.lastApproved;
  if (!exact(approval, APPROVAL_KEYS)) return false;
  // The approval must authorize the candidate that is about to be verified, not an older one.
  if (approval.forCommit !== headCommit) return false;
  if (typeof approval.approvedBy !== "string" || approval.approvedBy === "") return false;
  if (typeof approval.approvedAt !== "string" || approval.approvedAt === "") return false;
  if (typeof approval.remote !== "string" || approval.remote === "") return false;
  if (typeof approval.destination !== "string" || approval.destination === "") return false;
  if (!exact(approval.threatModel, ["path", "sha256"]) || !PATH.test(approval.threatModel.path ?? "") || !SHA.test(approval.threatModel.sha256 ?? "")) return false;
  const proof = approval.criticalProof;
  if (!object(proof) || !SHA.test(proof.proofSha256 ?? "")) return false;
  // The writer stamps `updatedAt` with the approval's own timestamp in the same transaction.
  if (worktreeState.updatedAt !== approval.approvedAt) return false;
  const before = headState.criticalProofConsumption ?? [];
  const after = worktreeState.criticalProofConsumption;
  if (!Array.isArray(before) || !Array.isArray(after) || after.length !== before.length + 1) return false;
  if (!before.every((entry, index) => same(entry, after[index]))) return false;
  const appended = after[after.length - 1];
  if (!exact(appended, CONSUMPTION_KEYS)) return false;
  return appended.proofSha256 === proof.proofSha256 && appended.kind === "push" && appended.consumedAt === approval.approvedAt;
}

/** Read + parse one state document; any unavailable, unreadable or non-object source is `null`. */
function parseState(read) {
  if (typeof read !== "function") return null;
  let text;
  try { text = read(); } catch { return null; }
  if (typeof text !== "string") return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  return object(parsed) ? parsed : null;
}

/**
 * Classify one candidate worktree. `clean` and `dirty` keep their pre-existing meanings; the
 * single tolerated exception is `NOVA_APPROVAL_PENDING_STATUS`. Every uncertainty -- a
 * malformed porcelain line, a missing `HEAD` blob, an unparseable state file -- fails closed
 * to `dirty`, because an unreadable comparison is never a tolerance.
 *
 * @param {{porcelain: string, headCommit: string, readHeadState: () => (string|null),
 *          readWorktreeState: () => (string|null), statePath?: string}} input
 * @returns {"clean"|"approval-pending"|"dirty"}
 */
export function classifyNovaCandidateWorktree({ porcelain, headCommit, readHeadState, readWorktreeState, statePath = NOVA_APPROVAL_STATE_PATH } = {}) {
  if (typeof porcelain !== "string") return "dirty";
  if (porcelain === "") return "clean";
  const lines = porcelain.split("\n").filter((line) => line !== "");
  if (lines.length !== 1) return "dirty";
  const [line] = lines;
  if (line.length < 4 || line.charAt(2) !== " ") return "dirty";
  if (!MODIFIED_CODES.has(line.slice(0, 2)) || line.slice(3) !== statePath) return "dirty";
  if (!OID.test(headCommit ?? "")) return "dirty";
  const headState = parseState(readHeadState);
  const worktreeState = parseState(readWorktreeState);
  if (headState === null || worktreeState === null) return "dirty";
  return isPushApprovalTransition({ headState, worktreeState, headCommit }) ? NOVA_APPROVAL_PENDING_STATUS : "dirty";
}
