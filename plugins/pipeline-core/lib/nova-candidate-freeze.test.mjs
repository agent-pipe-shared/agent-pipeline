#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOVA_APPROVAL_PENDING_BINDING,
  NOVA_APPROVAL_PENDING_STATUS,
  NOVA_APPROVAL_STATE_PATH,
  NOVA_B5_CANDIDATE_FREEZE_SCHEMA,
  NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2,
  NOVA_B5_EVIDENCE_MANIFEST_SCHEMA,
  classifyNovaCandidateWorktree,
  isPushApprovalTransition,
  sealNovaB5CandidateFreeze,
  sealNovaB5CandidateFreezeV2,
  sealNovaB5EvidenceManifest,
  validateNovaB5CandidateFreeze,
  validateNovaB5EvidenceManifest,
} from "./nova-candidate-freeze.mjs";

const h = (char) => char.repeat(64);
const oid = (char) => char.repeat(40);
const candidate = { commit: oid("a"), tree: oid("b"), branch: "feat/sprint-nova-codex-v046" };
const freezeDraft = () => ({
  candidate, base: { release: "v0.4.6", commit: oid("c") },
  portfolio: { bindingPath: "specs/sprint-nova-epic/design/backlog-spec-bindings.json", bindingSha256: h("d"), issueCount: 17, cyborgInput: "none" },
  backlog: { status: "green", indexSha256: h("e"), statusSha256: h("f"), ledgerSha256: h("0") },
  gates: { verify: { path: "specs/sprint-nova-epic/evidence/nova-b/verify.json", sha256: h("1"), exitCode: 0, binding: "exact-clean-candidate" }, security: { path: "specs/sprint-nova-epic/evidence/nova-b/security.json", sha256: h("2"), exitCode: 0, binding: "clean-exact-candidate" } },
  deferred: ["B2-I remote broker integration", "B3-I direct Antigravity implementation", "live B4 forge operation", "B6 native Apple Silicon lifecycle, Critic and PO close"],
  status: "frozen-awaiting-external-native-gates",
});
const manifestDraft = () => ({ candidate: { commit: candidate.commit, tree: candidate.tree }, sources: ["backlog/STATUS.md", "backlog/index.json", "backlog/transitions.ndjson", "specs/sprint-nova-epic/design/backlog-spec-bindings.json", "specs/sprint-nova-epic/evidence/nova-b/candidate-freeze.json", "specs/sprint-nova-epic/evidence/nova-b/security.json", "specs/sprint-nova-epic/evidence/nova-b/verify.json"].sort().map((path, index) => ({ path, sha256: h(String(index + 3)) })), scope: "candidate-freeze-only; native Apple Silicon, independent Critic and PO close remain pending" });
const freeze = sealNovaB5CandidateFreeze(freezeDraft());
const postRebaseDraft = () => ({ ...freezeDraft(), base: { release: "v0.4.7", commit: "89cb12b99e3fd86ac44878d0c23b278f00538921" } });
const postRebaseFreeze = sealNovaB5CandidateFreezeV2(postRebaseDraft());
const manifest = sealNovaB5EvidenceManifest(manifestDraft());
assert.equal(freeze.schema, NOVA_B5_CANDIDATE_FREEZE_SCHEMA);
assert.equal(manifest.schema, NOVA_B5_EVIDENCE_MANIFEST_SCHEMA);
assert.deepEqual(validateNovaB5CandidateFreeze(freeze), { ok: true, code: null });
assert.equal(postRebaseFreeze.schema, NOVA_B5_CANDIDATE_FREEZE_SCHEMA_V2);
assert.deepEqual(validateNovaB5CandidateFreeze(postRebaseFreeze), { ok: true, code: null });
assert.deepEqual(validateNovaB5EvidenceManifest(manifest), { ok: true, code: null });
const tampered = structuredClone(freeze); tampered.portfolio.issueCount = 16;
assert.equal(validateNovaB5CandidateFreeze(tampered).code, "NBF-SHAPE");
const changed = structuredClone(freeze); changed.candidate.tree = oid("c");
assert.equal(validateNovaB5CandidateFreeze(changed).code, "NBF-DIGEST");
const wrongPostRebaseBase = structuredClone(postRebaseFreeze); wrongPostRebaseBase.base.commit = oid("c");
assert.equal(validateNovaB5CandidateFreeze(wrongPostRebaseBase).code, "NBF-BASE");
assert.deepEqual(validateNovaB5CandidateFreeze(null), { ok: false, code: "NBF-SHAPE" });
const v2Schema = JSON.parse(readFileSync(new URL("../scripts/nova-b5-candidate-freeze-v2.schema.json", import.meta.url), "utf8"));
assert.equal(v2Schema.$comment, "SPDX-License-Identifier: SUL-1.0");
for (const key of ["candidate", "base", "portfolio", "backlog", "gates"]) assert.equal(v2Schema.properties[key].additionalProperties, false);
assert.equal(v2Schema.properties.deferred.items, false);
const manifestSchema = JSON.parse(readFileSync(new URL("../scripts/nova-b5-evidence-manifest.schema.json", import.meta.url), "utf8"));
assert.equal(manifestSchema.$comment, "SPDX-License-Identifier: SUL-1.0");
assert.equal(manifestSchema.properties.candidate.additionalProperties, false);
assert.equal(manifestSchema.properties.sources.minItems, 7);
assert.equal(manifestSchema.properties.sources.maxItems, 7);
assert.equal(manifestSchema.properties.sources.items.$ref, "#/$defs/source");
assert.equal(manifestSchema.$defs.source.additionalProperties, false);
const unsorted = structuredClone(manifest); [unsorted.sources[0], unsorted.sources[1]] = [unsorted.sources[1], unsorted.sources[0]];
assert.equal(validateNovaB5EvidenceManifest(unsorted).code, "NBM-SHAPE");

// --- Candidate worktree tolerance (ADR-0061 Change 3): an approval must not invalidate the
// candidate it approves.  Exactly one shape of dirt is tolerated; everything else stays `dirty`.
const headCommit = oid("9");
const approvedAt = "2026-08-07T20:54:35.889Z";
const priorConsumption = { proofSha256: h("6"), kind: "push", consumedAt: "2026-08-06T10:00:00.000Z" };
const headState = () => ({
  schema: "pipeline.state.v1",
  planApproved: true,
  updatedAt: "2026-08-06T10:00:00.000Z",
  activeFeature: { id: "nova-b5", planPath: "specs/sprint-nova-epic/plan.md" },
  gates: { verify: { exitCode: 0, at: "2026-08-06T09:00:00.000Z" } },
  criticalProofConsumption: [priorConsumption],
});
const approvalRecord = (overrides = {}) => ({
  approvedBy: "PO", approvedAt, forCommit: headCommit,
  criticalProof: { proofSha256: h("7"), intentSha256: h("5"), action: { kind: "push", subjectSha256: h("4"), expiresAt: "2026-08-08T04:49:28.871Z" } },
  remote: "origin", destination: "refs/heads/feat/sprint-nova-codex-v046",
  threatModel: { path: "specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md", sha256: h("3") },
  ...overrides,
});
const approvedState = (record = approvalRecord(), consumption) => ({
  ...headState(),
  pushApproval: { lastApproved: record },
  criticalProofConsumption: consumption ?? [priorConsumption, { proofSha256: record.criticalProof.proofSha256, kind: "push", consumedAt: record.approvedAt }],
  updatedAt: record.approvedAt,
});
const modifiedLine = ` M ${NOVA_APPROVAL_STATE_PATH}`;
const classify = ({ porcelain = modifiedLine, commit = headCommit, head = headState(), work = approvedState(), readHeadState, readWorktreeState } = {}) =>
  classifyNovaCandidateWorktree({
    porcelain, headCommit: commit,
    readHeadState: readHeadState ?? (() => JSON.stringify(head)),
    readWorktreeState: readWorktreeState ?? (() => JSON.stringify(work)),
  });

// 1. The tolerated shape, and its label is emphatically not `exact`.
assert.equal(classify(), NOVA_APPROVAL_PENDING_STATUS);
assert.equal(NOVA_APPROVAL_PENDING_STATUS, "approval-pending");
assert.ok(!["clean", "dirty", "unavailable"].includes(NOVA_APPROVAL_PENDING_STATUS));
assert.notEqual(NOVA_APPROVAL_PENDING_BINDING, "exact");
assert.ok(!["exact", "drift", "preflight-rejected", "unavailable", "running"].includes(NOVA_APPROVAL_PENDING_BINDING));
assert.equal(NOVA_APPROVAL_STATE_PATH, "project/pipeline-state.json");
assert.equal(isPushApprovalTransition({ headState: headState(), worktreeState: approvedState(), headCommit }), true);
// 2. Structural, never textual: reordered keys and different indentation are the same state.
const reordered = JSON.stringify(Object.fromEntries(Object.entries(approvedState()).reverse()), null, 4);
assert.equal(classify({ readWorktreeState: () => reordered }), NOVA_APPROVAL_PENDING_STATUS);
// 3. Any second modified path refuses, however innocent it looks.
assert.equal(classify({ porcelain: `${modifiedLine}\n M docs/state.md` }), "dirty");
assert.equal(classify({ porcelain: `${modifiedLine}\n?? evidence/scratch.json` }), "dirty");
// 4. A diff that changes anything else refuses, even alongside a valid approval.
assert.equal(classify({ work: { ...approvedState(), activeFeature: { id: "other", planPath: "specs/other/plan.md" } } }), "dirty");
assert.equal(classify({ work: { ...approvedState(), gates: { verify: { exitCode: 1, at: "2026-08-06T09:00:00.000Z" } } } }), "dirty");
assert.equal(classify({ work: { ...approvedState(), phase: "3" } }), "dirty");
// 5. An approval for another commit is not an approval for this candidate.
assert.equal(classify({ work: approvedState(approvalRecord({ forCommit: oid("8") })) }), "dirty");
assert.equal(isPushApprovalTransition({ headState: headState(), worktreeState: approvedState(), headCommit: oid("8") }), false);
// 6. The consumption entry is part of the transition, and it must be THIS proof's entry.
assert.equal(classify({ work: approvedState(approvalRecord(), [priorConsumption]) }), "dirty");
assert.equal(classify({ work: approvedState(approvalRecord(), [priorConsumption, { proofSha256: h("2"), kind: "push", consumedAt: approvedAt }]) }), "dirty");
assert.equal(classify({ work: approvedState(approvalRecord(), [priorConsumption, { proofSha256: h("7"), kind: "deploy", consumedAt: approvedAt }]) }), "dirty");
assert.equal(classify({ work: approvedState(approvalRecord(), []) }), "dirty");
// 7. A record the writer could not have produced -- extra field, foreign stamp -- refuses.
assert.equal(classify({ work: approvedState(approvalRecord({ note: "trust me" })) }), "dirty");
assert.equal(classify({ work: { ...approvedState(), updatedAt: "2026-08-07T23:00:00.000Z" } }), "dirty");
assert.equal(classify({ work: { ...approvedState(), pushApproval: { lastApproved: approvalRecord(), extra: 1 } } }), "dirty");
// 8. Fail closed: an unreadable or unparseable comparison is never a tolerance.
assert.equal(classify({ readWorktreeState: () => "{not json" }), "dirty");
assert.equal(classify({ readHeadState: () => "{not json" }), "dirty");
assert.equal(classify({ readHeadState: () => null }), "dirty");
assert.equal(classify({ readHeadState: () => { throw new Error("git show failed"); } }), "dirty");
assert.equal(classify({ commit: "not-a-commit" }), "dirty");
assert.equal(classifyNovaCandidateWorktree({ porcelain: null, headCommit }), "dirty");
// 9. A newly added state file has no HEAD version at all.
assert.equal(classify({ porcelain: `A  ${NOVA_APPROVAL_STATE_PATH}`, readHeadState: () => null }), "dirty");
assert.equal(classify({ porcelain: `?? ${NOVA_APPROVAL_STATE_PATH}`, readHeadState: () => null }), "dirty");
// 10. The pre-existing statuses are untouched.
assert.equal(classify({ porcelain: "" }), "clean");
assert.equal(classify({ porcelain: " M docs/state.md" }), "dirty");
assert.equal(classify({ porcelain: " D project/pipeline-state.json" }), "dirty");
assert.equal(classify({ porcelain: `R  docs/old.md -> ${NOVA_APPROVAL_STATE_PATH}` }), "dirty");
assert.equal(classify({ porcelain: "M  project/pipeline-state.json" }), NOVA_APPROVAL_PENDING_STATUS);
console.log("nova-candidate-freeze: 8/8 schema checks and 35/35 candidate-tolerance checks passed.");
