// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTRIBUTION_BOUNDARY,
  FINAL_GATE,
  INSTRUCTION_SCHEMA,
  REQUIRED_DENY_SET,
  SUPPORTED_ADAPTER,
  SUPPORTED_TOOLS,
  describeAfkProviderCapability,
  advanceAfkWallClock,
  canonicalJsonFile,
  classifyActivationReplay,
  evaluateAfkLifecycle,
  isNormalizedRepoPath,
  parseCanonicalInstruction,
  prepareAfkActivation,
  sha256Canonical,
  sha256Raw,
  validateActivationReceipt,
} from "./afk-assumption-mode.mjs";

const NOW = "2026-07-18T12:00:00.000Z";
const LATER = "2026-07-18T13:00:00.000Z";
const COMMIT40 = "a".repeat(40);
const TREE40 = "b".repeat(40);
const ADAPTER_BYTES = Buffer.from("trusted adapter\n");

function clone(value) {
  return structuredClone(value);
}

function fixture(objectFormat = "sha1") {
  const commit = objectFormat === "sha1" ? COMMIT40 : "a".repeat(64);
  const tree = objectFormat === "sha1" ? TREE40 : "b".repeat(64);
  const files = {
    prd: { path: "specs/batman/prd.md", bytes: Buffer.from("prd\n") },
    spec: { path: "specs/batman/spec.md", bytes: Buffer.from("spec\n") },
    courseBrief: { path: "specs/batman/course.md", bytes: Buffer.from("course\n") },
  };
  const statePreimage = Buffer.from(`${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "sprint-batman-epic", planPath: files.prd.path, phase: "implementation" },
  }, null, 2)}\n`);
  const surface = {
    provider: "claude",
    adapterId: SUPPORTED_ADAPTER,
    adapterBytes: ADAPTER_BYTES,
    tools: [...SUPPORTED_TOOLS],
  };
  const instruction = {
    schema: INSTRUCTION_SCHEMA,
    attributedBy: "po",
    expiresAt: LATER,
    finalGate: FINAL_GATE,
    feature: { id: "sprint-batman-epic", ref: "refs/heads/feat/sprint-batman" },
    base: { commit, tree, objectFormat },
    statePreimageSha256: sha256Raw(statePreimage),
    authority: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, {
      path: value.path,
      sha256: sha256Raw(value.bytes),
    }])),
    packages: ["pipeline-core"],
    pathAllowlist: {
      read: ["plugins/pipeline-core", "specs/batman"],
      write: ["plugins/pipeline-core/lib", "plugins/pipeline-core/scripts"],
    },
    surface: {
      provider: surface.provider,
      adapterId: surface.adapterId,
      adapterSha256: sha256Raw(surface.adapterBytes),
      tools: [...surface.tools],
      toolInventorySha256: sha256Canonical(surface.tools),
    },
    budgets: { entries: 3, files: 5, bytes: 65536 },
    deny: [...REQUIRED_DENY_SET],
  };
  const git = {
    objectFormat,
    head: commit,
    tree,
    indexTree: tree,
    worktreeTree: tree,
    detached: true,
    clean: true,
    featureRefCheckouts: 0,
    worktreeInventory: Buffer.from("trusted worktree inventory\0"),
    worktreeCount: 2,
  };
  return { instruction, statePreimage, authority: files, surface, git };
}

function prepare(overrides = {}, objectFormat = "sha1") {
  const base = fixture(objectFormat);
  return prepareAfkActivation({
    ...base,
    activationId: "d".repeat(32),
    activatedAt: NOW,
    ...overrides,
  });
}

function redigest(receipt) {
  const { receiptSha256: _old, ...preceding } = receipt;
  return { ...preceding, receiptSha256: sha256Canonical(preceding) };
}

test("canonical activation instruction is accepted byte-exactly", () => {
  const { instruction } = fixture();
  const parsed = parseCanonicalInstruction(Buffer.from(canonicalJsonFile(instruction)));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, instruction);
});

test("missing, unknown and noncanonical instruction input fails closed", () => {
  const { instruction } = fixture();
  assert.equal(parseCanonicalInstruction("").code, "AFK-INSTRUCTION-INVALID");
  assert.equal(parseCanonicalInstruction(`${JSON.stringify(instruction)}\n`).code, "AFK-INSTRUCTION-NONCANONICAL");
  const unknown = { ...instruction, approval: true };
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(unknown)).code, "AFK-INSTRUCTION-INVALID");
  const missing = clone(instruction);
  delete missing.finalGate;
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(missing)).code, "AFK-INSTRUCTION-INVALID");
});

test("paths reject empty, dot, parent, drive, backslash, NUL and .git components", () => {
  assert.equal(isNormalizedRepoPath("specs/batman/spec.md"), true);
  for (const path of ["", ".", "a/../b", "C:/repo/a", "a\\b", "a\0b", ".git/config", "a/.GIT/b", "a//b"]) {
    assert.equal(isNormalizedRepoPath(path), false, path);
  }
});

test("feature refs are exact valid local branch refs", () => {
  for (const ref of ["refs/tags/batman", "refs/heads/a..b", "refs/heads/.hidden", "refs/heads/a.lock"]) {
    const { instruction } = fixture();
    instruction.feature.ref = ref;
    assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID", ref);
  }
});

test("sorted unique package and path allowlists are mandatory", () => {
  const { instruction } = fixture();
  instruction.packages = ["z", "a"];
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID");
  instruction.packages = ["a", "a"];
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID");
  instruction.packages = ["a"];
  instruction.pathAllowlist.read = ["a/.git/config"];
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID");
});

test("valid SHA-1 activation binds every authority and worktree field before WAL", () => {
  const outcome = prepare();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.action, "append-intent");
  assert.equal(outcome.mutation, "wal");
  assert.equal(outcome.receipt.attributionBoundary, ATTRIBUTION_BOUNDARY);
  assert.equal(outcome.receipt.statePreimageSha256, fixture().instruction.statePreimageSha256);
  assert.equal(outcome.receipt.worktree.inventorySha256, sha256Raw(fixture().git.worktreeInventory));
  assert.equal(outcome.receipt.worktree.detached, true);
  assert.equal(validateActivationReceipt(outcome.receipt).ok, true);
});

test("valid SHA-256 object repository uses 64-character OIDs", () => {
  const outcome = prepare({}, "sha256");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.receipt.base.commit.length, 64);
  assert.equal(outcome.receipt.worktree.head.length, 64);
});

test("object format and OID length mismatch is invalid", () => {
  const { instruction } = fixture("sha256");
  instruction.base.commit = COMMIT40;
  assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID");
});

test("complete raw state preimage digest is compared without a revision surrogate", () => {
  const base = fixture();
  const stale = Buffer.concat([base.statePreimage, Buffer.from(" ")]);
  const outcome = prepareAfkActivation({
    ...base, statePreimage: stale, activationId: "d".repeat(32), activatedAt: NOW,
  });
  assert.equal(outcome.code, "AFK-STATE-PREIMAGE-STALE");
  assert.equal(outcome.mutation, "none");
});

test("malformed state and different active feature fail closed", () => {
  const malformed = fixture();
  malformed.statePreimage = Buffer.from("{");
  malformed.instruction.statePreimageSha256 = sha256Raw(malformed.statePreimage);
  assert.equal(prepareAfkActivation({ ...malformed, activationId: "d".repeat(32), activatedAt: NOW }).code,
    "AFK-STATE-PREIMAGE-INVALID");

  const different = fixture();
  different.statePreimage = Buffer.from(`${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "other", planPath: different.instruction.authority.prd.path, phase: "implementation" },
  })}\n`);
  different.instruction.statePreimageSha256 = sha256Raw(different.statePreimage);
  assert.equal(prepareAfkActivation({ ...different, activationId: "d".repeat(32), activatedAt: NOW }).code,
    "AFK-STATE-PREIMAGE-INVALID");
});

test("an existing AFK state projection blocks a replacement activation", () => {
  const base = fixture();
  const state = JSON.parse(base.statePreimage.toString("utf8"));
  state.afk = { status: "review-required", activationId: "f".repeat(32) };
  base.statePreimage = Buffer.from(`${JSON.stringify(state)}\n`);
  base.instruction.statePreimageSha256 = sha256Raw(base.statePreimage);
  const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
  assert.equal(outcome.code, "AFK-LIVE-ACTIVATION-EXISTS");
  assert.equal(outcome.mutation, "none");
});

test("stale PRD, Spec or course-brief raw digest fails before mutation", () => {
  for (const key of ["prd", "spec", "courseBrief"]) {
    const base = fixture();
    base.authority[key].bytes = Buffer.from("drift\n");
    const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
    assert.equal(outcome.code, "AFK-AUTHORITY-DIGEST-STALE", key);
    assert.equal(outcome.mutation, "none");
  }
});

test("literal deny set rejects an unknown, missing or reordered capability", () => {
  for (const deny of [
    [...REQUIRED_DENY_SET, "unknown"],
    REQUIRED_DENY_SET.slice(1),
    [...REQUIRED_DENY_SET].reverse(),
  ]) {
    const { instruction } = fixture();
    instruction.deny = deny;
    assert.equal(parseCanonicalInstruction(canonicalJsonFile(instruction)).code, "AFK-INSTRUCTION-INVALID");
  }
});

test("unknown or drifted tool inventory is unsupported", () => {
  const base = fixture();
  base.instruction.surface.tools = [...SUPPORTED_TOOLS, "Write"];
  base.instruction.surface.tools.sort();
  base.instruction.surface.toolInventorySha256 = sha256Canonical(base.instruction.surface.tools);
  base.surface.tools = [...base.instruction.surface.tools];
  const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
  assert.equal(outcome.code, "AFK-PROVIDER-SURFACE-UNSUPPORTED");
  assert.equal(outcome.mutation, "none");
});

test("one-byte adapter definition drift is unsupported", () => {
  const base = fixture();
  base.surface.adapterBytes = Buffer.from("trusted adapter!\n");
  const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
  assert.equal(outcome.code, "AFK-PROVIDER-SURFACE-UNSUPPORTED");
  assert.equal(outcome.mutation, "none");
});

test("Codex v1 is explicitly unavailable without attempting activation", () => {
  const base = fixture();
  base.instruction.surface.provider = "codex";
  base.surface.provider = "codex";
  const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
  assert.deepEqual(describeAfkProviderCapability("codex"), {
    provider: "codex",
    status: "unavailable",
    code: "AFK-CODEX-CAPABILITY-UNAVAILABLE",
    mutation: "none",
  });
  assert.equal(outcome.code, "AFK-CODEX-CAPABILITY-UNAVAILABLE");
  assert.equal(outcome.mutation, "none");
});

test("unknown AFK providers remain generically unsupported", () => {
  const base = fixture();
  base.instruction.surface.provider = "other";
  base.surface.provider = "other";
  const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
  assert.deepEqual(describeAfkProviderCapability("other"), {
    provider: "other",
    status: "unsupported",
    code: "AFK-PROVIDER-SURFACE-UNSUPPORTED",
    mutation: "none",
  });
  assert.equal(outcome.code, "AFK-PROVIDER-SURFACE-UNSUPPORTED");
  assert.equal(outcome.mutation, "none");
});

test("activation at exact expiry and after expiry is refused", () => {
  assert.equal(prepare({ activatedAt: LATER }).code, "AFK-ACTIVATION-EXPIRED");
  assert.equal(prepare({ activatedAt: "2026-07-18T13:00:00.001Z" }).code, "AFK-ACTIVATION-EXPIRED");
});

test("linked feature checkout, attached caller or dirty tree is refused", () => {
  for (const change of [{ featureRefCheckouts: 1 }, { detached: false }, { clean: false }]) {
    const base = fixture();
    Object.assign(base.git, change);
    if (change.clean === false) {
      base.git.indexTree = "";
      base.git.worktreeTree = "";
    }
    const outcome = prepareAfkActivation({ ...base, activationId: "d".repeat(32), activatedAt: NOW });
    assert.equal(outcome.code, "AFK-WORKTREE-PRECONDITION");
  }
});

test("receipt digest covers every preceding canonical field", () => {
  const receipt = prepare().receipt;
  for (const mutate of [
    (value) => { value.attributedBy = "someone-else"; },
    (value) => { value.budgets.bytes += 1; },
    (value) => { value.worktree.inventorySha256 = "e".repeat(64); },
  ]) {
    const changed = clone(receipt);
    mutate(changed);
    assert.equal(validateActivationReceipt(changed).code, "AFK-RECEIPT-DIGEST-MISMATCH");
  }
});

test("exact receipt replay is an idempotent zero-write duplicate", () => {
  const receipt = prepare().receipt;
  const replay = classifyActivationReplay(receipt, clone(receipt), "active");
  assert.equal(replay.ok, true);
  assert.equal(replay.action, "duplicate");
  assert.equal(replay.mutation, "none");
});

test("same activation identity with different authority is a conflict", () => {
  const receipt = prepare().receipt;
  const conflict = clone(receipt);
  conflict.budgets.bytes += 1;
  const outcome = classifyActivationReplay(receipt, redigest(conflict), "admitted");
  assert.equal(outcome.code, "AFK-ACTIVATION-IDENTITY-CONFLICT");
  assert.equal(outcome.mutation, "none");
});

test("a second live activation never replaces the first", () => {
  const receipt = prepare().receipt;
  const second = redigest({ ...clone(receipt), activationId: "e".repeat(32) });
  const outcome = classifyActivationReplay(second, receipt, "active");
  assert.equal(outcome.code, "AFK-LIVE-ACTIVATION-EXISTS");
  assert.equal(outcome.mutation, "none");
});

test("active receipt permits proposals before expiry", () => {
  const outcome = evaluateAfkLifecycle({
    receipt: prepare().receipt,
    projectedState: "active",
    wallClock: "2026-07-18T12:30:00.000Z",
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.proposalsAllowed, true);
  assert.equal(outcome.preserveEntries, true);
});

test("effective expiry blocks immediately and preserves pending entries", () => {
  const outcome = evaluateAfkLifecycle({ receipt: prepare().receipt, projectedState: "active", wallClock: LATER });
  assert.equal(outcome.state, "review-required");
  assert.equal(outcome.reason, "expired");
  assert.equal(outcome.proposalsAllowed, false);
  assert.equal(outcome.preserveEntries, true);
});

test("attributed revocation and explicit review stop proposals without erasure", () => {
  const receipt = prepare().receipt;
  const revoked = evaluateAfkLifecycle({
    receipt,
    projectedState: "active",
    wallClock: "2026-07-18T12:20:00.000Z",
    revocation: { attributedBy: "po", revokedAt: "2026-07-18T12:10:00.000Z" },
  });
  assert.equal(revoked.reason, "revoked");
  assert.equal(revoked.preserveEntries, true);
  assert.equal(revoked.revocationAttribution, "po");
  const review = evaluateAfkLifecycle({
    receipt, projectedState: "active", wallClock: "2026-07-18T12:20:00.000Z", explicitReview: true,
  });
  assert.equal(review.reason, "explicit-review");
  assert.equal(review.proposalsAllowed, false);
});

test("wall-clock rollback blocks with zero mutation and cannot extend expiry", () => {
  const outcome = evaluateAfkLifecycle({
    receipt: prepare().receipt,
    projectedState: "active",
    wallClock: "2026-07-18T11:59:59.999Z",
  });
  assert.equal(outcome.code, "AFK-CLOCK-ROLLBACK");
  assert.equal(outcome.mutation, "none");
});

test("advancing lastWallClock rehashes the receipt without extending expiry", () => {
  const receipt = prepare().receipt;
  const advanced = advanceAfkWallClock(receipt, "2026-07-18T12:40:00.000Z");
  assert.equal(advanced.ok, true);
  assert.equal(advanced.receipt.lastWallClock, "2026-07-18T12:40:00.000Z");
  assert.equal(advanced.receipt.expiresAt, receipt.expiresAt);
  assert.notEqual(advanced.receipt.receiptSha256, receipt.receiptSha256);
  assert.equal(validateActivationReceipt(advanced.receipt).ok, true);
});

test("receipt attribution explicitly carries no authentication or approval authority", () => {
  const receipt = prepare().receipt;
  assert.equal(receipt.attributedBy, "po");
  assert.equal(receipt.attributionBoundary, ATTRIBUTION_BOUNDARY);
  assert.equal(Object.hasOwn(receipt, "authenticated"), false);
  assert.equal(Object.hasOwn(receipt, "approved"), false);
});
