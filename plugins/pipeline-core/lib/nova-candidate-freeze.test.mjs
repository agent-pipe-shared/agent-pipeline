#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  NOVA_B5_CANDIDATE_FREEZE_SCHEMA,
  NOVA_B5_EVIDENCE_MANIFEST_SCHEMA,
  sealNovaB5CandidateFreeze,
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
const manifest = sealNovaB5EvidenceManifest(manifestDraft());
assert.equal(freeze.schema, NOVA_B5_CANDIDATE_FREEZE_SCHEMA);
assert.equal(manifest.schema, NOVA_B5_EVIDENCE_MANIFEST_SCHEMA);
assert.deepEqual(validateNovaB5CandidateFreeze(freeze), { ok: true, code: null });
assert.deepEqual(validateNovaB5EvidenceManifest(manifest), { ok: true, code: null });
const tampered = structuredClone(freeze); tampered.portfolio.issueCount = 16;
assert.equal(validateNovaB5CandidateFreeze(tampered).code, "NBF-SHAPE");
const changed = structuredClone(freeze); changed.candidate.tree = oid("c");
assert.equal(validateNovaB5CandidateFreeze(changed).code, "NBF-DIGEST");
const unsorted = structuredClone(manifest); [unsorted.sources[0], unsorted.sources[1]] = [unsorted.sources[1], unsorted.sources[0]];
assert.equal(validateNovaB5EvidenceManifest(unsorted).code, "NBM-SHAPE");
console.log("nova-candidate-freeze: 8/8 checks passed.");
