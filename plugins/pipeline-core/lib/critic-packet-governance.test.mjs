#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
  CriticPacketGovernanceError,
  deriveCriticPacketGovernance,
  validateCriticPacketGovernance,
} from "./critic-packet-governance.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`PASS CPG${String(passed).padStart(2, "0")} ${name}\n`);
}

function oid(seed) {
  return seed.repeat(40).slice(0, 40);
}

function input(overrides = {}) {
  return {
    schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
    manifest: {
      schema: "pipeline.manifest.v0",
      governance: {
        guidelines_path: "governance/team/guidelines",
        policies_path: "governance/team/policies",
      },
    },
    candidateFiles: [
      { path: ".claude/pipeline.yaml", blobOid: oid("a"), readable: true },
      { path: "governance/team/guidelines/01-naming.md", blobOid: oid("b"), readable: true },
      { path: "governance/team/policies/checklist.md", blobOid: oid("c"), readable: true },
      { path: "governance/team/policies/retention.md", blobOid: oid("d"), readable: true },
      { path: "roles/critic.md", blobOid: oid("e"), readable: true },
      { path: "plugins/pipeline-core/skills/critic-review/SKILL.md", blobOid: oid("f"), readable: true },
      { path: "plugins/pipeline-core/hooks/guard-git.mjs", blobOid: oid("1"), readable: true },
      { path: "plugins/pipeline-core/scripts/critic-verdict.schema.json", blobOid: oid("2"), readable: true },
      { path: "harness/review-protocol.md", blobOid: oid("3"), readable: true },
      { path: "src/ordinary.mjs", blobOid: oid("4"), readable: true },
      { path: "docs/state.md", blobOid: oid("5"), readable: true },
    ],
    changedPaths: [
      ".claude/pipeline.yaml",
      "roles/critic.md",
      "plugins/pipeline-core/skills/critic-review/SKILL.md",
      "plugins/pipeline-core/hooks/guard-git.mjs",
      "plugins/pipeline-core/scripts/critic-verdict.schema.json",
      "harness/review-protocol.md",
      "src/ordinary.mjs",
    ],
    ...overrides,
  };
}

check("derives manifest governance contents and every changed critical surface with candidate blob OIDs", () => {
  const packet = deriveCriticPacketGovernance(input());
  assert.deepEqual(packet.governance, {
    manifestPath: ".claude/pipeline.yaml",
    guidelinesPath: "governance/team/guidelines",
    policiesPath: "governance/team/policies",
  });
  assert.deepEqual(packet.required.map(({ path }) => path), [
    ".claude/pipeline.yaml",
    "governance/team/guidelines/01-naming.md",
    "governance/team/policies/checklist.md",
    "governance/team/policies/retention.md",
    "harness/review-protocol.md",
    "plugins/pipeline-core/hooks/guard-git.mjs",
    "plugins/pipeline-core/scripts/critic-verdict.schema.json",
    "plugins/pipeline-core/skills/critic-review/SKILL.md",
    "roles/critic.md",
  ]);
  const manifest = packet.required.find(({ path }) => path === ".claude/pipeline.yaml");
  assert.deepEqual(manifest, { path: ".claude/pipeline.yaml", candidateBlobOid: oid("a"), reasons: ["changed-manifest", "manifest-governance-binding"] });
  assert.deepEqual(validateCriticPacketGovernance(input(), packet), { ok: true, code: "CPG-PACKET-VALID" });
});

check("recognizes dynamic governance roots even when they live outside the default governance tree", () => {
  const source = input({
    manifest: { governance: { guidelines_path: "company/guides", policies_path: "company/policy" } },
    candidateFiles: [
      { path: ".claude/pipeline.yaml", blobOid: oid("a"), readable: true },
      { path: "company/guides/guide.md", blobOid: oid("b"), readable: true },
      { path: "company/policy/checklist.md", blobOid: oid("c"), readable: true },
      { path: "company/policy/limits.md", blobOid: oid("d"), readable: true },
    ],
    changedPaths: ["company/guides/guide.md"],
  });
  const reference = deriveCriticPacketGovernance(source).required.find(({ path }) => path === "company/guides/guide.md");
  assert.deepEqual(reference.reasons, ["changed-governance", "governance-guidelines"]);
});

check("rejects an omitted required changed role path and a stale packet blob binding", () => {
  const source = input();
  const packet = deriveCriticPacketGovernance(source);
  const omitted = { ...packet, required: packet.required.filter(({ path }) => path !== "roles/critic.md") };
  assert.deepEqual(validateCriticPacketGovernance(source, omitted), { ok: false, code: "CPG-PACKET-OMITTED" });
  const stale = structuredClone(packet);
  stale.required.find(({ path }) => path === "roles/critic.md").candidateBlobOid = oid("9");
  assert.deepEqual(validateCriticPacketGovernance(source, stale), { ok: false, code: "CPG-PACKET-BLOB-MISMATCH" });
});

check("fails closed when required candidate content is absent or unreadable", () => {
  const missing = input({ candidateFiles: input().candidateFiles.filter(({ path }) => path !== "roles/critic.md") });
  assert.throws(() => deriveCriticPacketGovernance(missing), (error) => error instanceof CriticPacketGovernanceError && error.code === "CPG-CANDIDATE-MISSING");
  const unreadable = input({ candidateFiles: input().candidateFiles.map((entry) => entry.path === "governance/team/policies/checklist.md" ? { ...entry, readable: false } : entry) });
  assert.throws(() => deriveCriticPacketGovernance(unreadable), (error) => error instanceof CriticPacketGovernanceError && error.code === "CPG-CANDIDATE-UNREADABLE");
});

check("fails closed on an incomplete governance declaration and a missing policy checklist", () => {
  const incomplete = input({ manifest: { governance: { guidelines_path: "governance/team/guidelines" } } });
  assert.throws(() => deriveCriticPacketGovernance(incomplete), (error) => error instanceof CriticPacketGovernanceError && error.code === "CPG-GOVERNANCE-PATHS");
  const noChecklist = input({ candidateFiles: input().candidateFiles.filter(({ path }) => path !== "governance/team/policies/checklist.md") });
  assert.throws(() => deriveCriticPacketGovernance(noChecklist), (error) => error instanceof CriticPacketGovernanceError && error.code === "CPG-POLICY-CHECKLIST-MISSING");
});

check("rejects handover and scratchpad packet paths without rejecting ordinary candidate state files", () => {
  const source = input();
  const packet = deriveCriticPacketGovernance(source);
  const forbidden = structuredClone(packet);
  forbidden.required.push({ path: "docs/state.md", candidateBlobOid: oid("5"), reasons: ["changed-flow"] });
  assert.deepEqual(validateCriticPacketGovernance(source, forbidden), { ok: false, code: "CPG-PACKET-FORBIDDEN" });
  const scratchpad = input({
    candidateFiles: [...input().candidateFiles, { path: "harness/scratchpad/notes.md", blobOid: oid("6"), readable: true }],
    changedPaths: [...input().changedPaths, "harness/scratchpad/notes.md"],
  });
  assert.throws(() => deriveCriticPacketGovernance(scratchpad), (error) => error instanceof CriticPacketGovernanceError && error.code === "CPG-FORBIDDEN-PATH");
});

check("supports a candidate with no manifest while still binding changed critical packet paths", () => {
  const source = {
    schema: CRITIC_PACKET_GOVERNANCE_INPUT_SCHEMA,
    manifest: null,
    candidateFiles: [
      { path: "plugins/pipeline-core/hooks/guard-git.mjs", blobOid: oid("7"), readable: true },
    ],
    changedPaths: ["plugins/pipeline-core/hooks/guard-git.mjs"],
  };
  assert.deepEqual(deriveCriticPacketGovernance(source), {
    schema: "pipeline.critic-packet-governance.v1",
    governance: null,
    required: [{ path: "plugins/pipeline-core/hooks/guard-git.mjs", candidateBlobOid: oid("7"), reasons: ["changed-hook"] }],
  });
});

process.stdout.write(`${passed}/7 checks passed.\n`);
