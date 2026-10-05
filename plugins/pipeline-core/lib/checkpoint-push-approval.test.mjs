// SPDX-License-Identifier: SUL-1.0
/**
 * Unit tests for the shared feature-checkpoint push approval check (PUSHSIG slice S1;
 * specs/sprint-alfred-epic/design/feature-branch-push-signature-design.md, sections 3.2 and 5).
 *
 * Every approval case builds a REAL (ephemeral, in-memory, test-only) Ed25519 keypair and
 * a real signature, because the property under test is that a recorded approval is
 * VERIFIED, never believed. No key material is read from or written to a real location.
 *
 * Design case -> test map (guard-level cases C1..C12 live in the S2 guard test; this file
 * is the library level: mode matrix, verifier, porcelain classifier):
 *   C1  no approval                       -> CPA2, CPA3
 *   C2  stale approval (other commit)     -> CPA4 (+ CPA5 other tree)
 *   C3  valid approval, no evidence       -> CPA1 (+ CPA1B pure/no-mutation, CPS3 no evidence read)
 *   C4  other destination / other remote  -> CPA7 (+ CPA8 rewritten record)
 *   C5  expired approval                  -> CPA6
 *   C6  wrong/absent signature            -> CPA10, CPA11, CPA12
 *   C7  threat model edited after signing -> CPA9
 *   C8  chat / standing unchanged         -> CPM2, CPM3 (mode matrix; the verifier is not consulted)
 *   C10 dirty-state exemption (classifier)-> CPP1..CPP12
 *   C11 unreadable policy -> signature    -> CPM4..CPM6 (mode) + CPA13 (verifier fails closed)
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { criticalProofWaiverFor } from "./critical-human-proof-policy.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import {
  checkCheckpointPushApproval, checkpointApprovalMode, classifyCheckpointPorcelain,
} from "./checkpoint-push-approval.mjs";

const roots = [];
let checks = 0;
const check = (label, fn) => { fn(); checks += 1; process.stdout.write(`ok ${label}\n`); };

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const OTHER_COMMIT = "e".repeat(40);
const PLAN_SHA = "c".repeat(64);
const SPEC_SHA = "d".repeat(64);
const THREAT_MODEL_PATH = "project/push-threat-model.md";
const REMOTE = "origin";
const DESTINATION = "refs/heads/feat/alfred/push-signature";
const NOW = "2026-10-05T12:00:00.000Z";
const EXPIRES = "2026-10-05T13:00:00.000Z";
const AFTER_EXPIRY = "2026-10-05T14:00:00.000Z";
const STATE_PATH = "project/pipeline-state.json";
const LEGACY_STATE_PATH = ".claude/pipeline-state.json";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}

/**
 * A repository root holding the proof policy and the threat model the subject digest
 * binds. `anchorKey` populates a v3 trust-anchor set; `anchorKey: null` writes the
 * pre-anchor v1 shape (trust-on-first-use posture); `policy: "absent"` writes no policy
 * file at all; `policy: "garbage"` writes bytes that are not JSON.
 */
function fixture({ anchorKey, threatModelBody = "# push threat model\n", policy = "present" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "checkpoint-approval-"));
  roots.push(root);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, THREAT_MODEL_PATH), threatModelBody);
  const policyPath = join(root, "project", "critical-human-proof.json");
  if (policy === "garbage") {
    writeFileSync(policyPath, "{ this is not json");
  } else if (policy === "present") {
    const document = anchorKey === null
      ? { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }
      : {
        schema: "pipeline.critical-human-proof-policy.v3",
        requiredKinds: ["push", "deploy", "publication"],
        waivedKinds: [],
        trustAnchors: [{ keyReference: "po-key-1", publicKeySha256: anchorKey.publicKeySha256 }],
      };
    writeFileSync(policyPath, `${JSON.stringify(document, null, 2)}\n`);
  }
  return {
    root,
    threatModel: { path: THREAT_MODEL_PATH, sha256: createHash("sha256").update(threatModelBody).digest("hex") },
  };
}

/** Same fixture form of "this machine has its own registered operator key" the authorization tests use. */
function machinePlaneFixture(key, keyReference = "po-key-1") {
  const home = mkdtempSync(join(tmpdir(), "checkpoint-machine-home-"));
  roots.push(home);
  const keyDirectory = mkdtempSync(join(tmpdir(), "checkpoint-po-key-dir-"));
  roots.push(keyDirectory);
  writeFileSync(join(keyDirectory, "trust-policy.json"), `${JSON.stringify({ keyReference, publicKeySha256: key.publicKeySha256 }, null, 2)}\n`);
  mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(home, ".agent-pipeline", "machine.json"), `${JSON.stringify({
    schema: "pipeline.machine-plane.v1",
    poKeyDirectory: keyDirectory,
    pushApprovalDefault: "signature",
    routing: null, language: null, session: null, usage: null,
    updatedAt: NOW,
  }, null, 2)}\n`);
  return { homedirFn: () => home };
}

/** An empty fake home: this machine has no registered operator key at all. */
function emptyMachinePlane() {
  const home = mkdtempSync(join(tmpdir(), "checkpoint-empty-home-"));
  roots.push(home);
  return { homedirFn: () => home };
}

const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
    : JSON.stringify(value);

/** The exact chain approve-push writes: subject -> action -> intent -> detached proof. */
function approvalRecord({
  key, threatModel, candidate = { commit: COMMIT, tree: TREE },
  remote = REMOTE, destination = DESTINATION, expiresAt = EXPIRES,
  keyReference = "po-key-1", featureId = "demo-feature",
  planSha256 = PLAN_SHA, specSha256 = SPEC_SHA, signWith = key.privateKey,
}) {
  const action = {
    kind: "push",
    subjectSha256: criticalActionSubjectSha256({
      kind: "push",
      candidate,
      subject: { sourceCommit: candidate.commit, remote, destination, threatModel },
    }),
    expiresAt,
  };
  const intent = createPoApprovalIntent({
    kind: "critical-action", featureId, planSha256, specSha256, candidate,
    policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved",
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference,
    publicKey: key.publicPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), signWith).toString("base64"),
  };
  const proofSha256 = createHash("sha256").update(canonical(proof)).digest("hex");
  return {
    approvedBy: "Human", approvedAt: NOW, forCommit: candidate.commit,
    criticalProof: { proofSha256, intentSha256: intent.sha256, action, proof },
    remote, destination, threatModel,
  };
}

function stateFor(record, { featureId = "demo-feature", planSha256 = PLAN_SHA, specSha256 = SPEC_SHA } = {}) {
  return {
    activeFeature: { id: featureId },
    planApproval: { poGateAuthority: { planSha256, specSha256 } },
    pushApproval: { lastApproved: record },
    criticalProofConsumption: [{ proofSha256: record.criticalProof.proofSha256, kind: "push", consumedAt: NOW }],
  };
}

const call = (root, state, overrides = {}) => checkCheckpointPushApproval({
  projectDir: root,
  anchorDir: root,
  state,
  candidate: { commit: COMMIT, tree: TREE },
  remote: REMOTE,
  destination: DESTINATION,
  now: NOW,
  ...overrides,
});

/** A refusal is `{ok:false, code, reason}` with a typed code and a non-empty static reason. */
function assertRefused(result, code) {
  assert.equal(result.ok, false, `expected a refusal, got ${JSON.stringify(result)}`);
  assert.equal(result.code, code);
  assert.equal(typeof result.reason, "string");
  assert.notEqual(result.reason, "");
  assert.equal(Object.hasOwn(result, "proofSha256"), false, "a refusal must not carry a proof digest");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

try {
  // ---- mode matrix --------------------------------------------------------------------

  const STRICT_GATE = { mode: "strict", approval: "required" };
  const CHAT_WAIVER = {
    waived: true, code: null,
    waiver: { kind: "push", reason: "gates.push_approval: chat (pipeline.user.yaml)", mode: "chat", source: "pipeline.user.yaml" },
  };

  check("CPM1 signature is the default when neither the gate nor the waiver says otherwise", () => {
    assert.equal(checkpointApprovalMode({ pushGate: STRICT_GATE, waiver: { waived: false, code: null } }), "signature");
    assert.equal(checkpointApprovalMode({ pushGate: { mode: "strict" }, waiver: { waived: false, code: null } }), "signature");
  });

  check("CPM2 a standing-approved gate yields standing, ahead of any waiver", () => {
    const gate = { mode: "strict", approval: "standing-approved" };
    assert.equal(checkpointApprovalMode({ pushGate: gate, waiver: { waived: false, code: null } }), "standing");
    assert.equal(checkpointApprovalMode({ pushGate: gate, waiver: CHAT_WAIVER }), "standing");
    // The literal design rule is "standing iff approval === standing-approved": the
    // protected lane's own auto-pass (guard-push.mjs:2274) never reads a waiver either.
    assert.equal(checkpointApprovalMode({ pushGate: gate, waiver: { waived: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" } }), "standing");
  });

  check("CPM3 a genuine waiver with a null code yields chat", () => {
    assert.equal(checkpointApprovalMode({ pushGate: STRICT_GATE, waiver: CHAT_WAIVER }), "chat");
    const policyWaiver = { waived: true, code: null, waiver: { kind: "push", reason: "explicit reasoned stand-down" } };
    assert.equal(checkpointApprovalMode({ pushGate: STRICT_GATE, waiver: policyWaiver }), "chat");
  });

  check("CPM4 a waiver carrying any fault code never yields chat", () => {
    assert.equal(checkpointApprovalMode({ pushGate: STRICT_GATE, waiver: { waived: false, code: "CRITICAL-PROOF-POLICY-UNREADABLE" } }), "signature");
    // A contradictory record (waived AND faulted) must still resolve to the strict mode.
    assert.equal(checkpointApprovalMode({
      pushGate: STRICT_GATE,
      waiver: { waived: true, code: "CRITICAL-PROOF-POLICY-UNREADABLE", waiver: CHAT_WAIVER.waiver },
    }), "signature");
  });

  check("CPM5 missing or malformed inputs resolve to signature and never throw", () => {
    const hostile = [
      undefined, null, {}, { pushGate: null, waiver: null }, { waiver: "waived" }, { waiver: [] },
      { waiver: { waived: "true", code: null } }, { waiver: { waived: 1, code: null } },
      { waiver: { waived: true, code: "" } },
      { pushGate: "standing-approved" }, { pushGate: ["standing-approved"] },
      { pushGate: { approval: "STANDING-APPROVED" } }, { pushGate: { approval: " standing-approved" } },
      { pushGate: { approval: ["standing-approved"] } },
    ];
    for (const input of hostile) assert.equal(checkpointApprovalMode(input), "signature", JSON.stringify(input) ?? String(input));
  });

  check("CPM6 an unreadable proof policy, read by the real waiver reader, resolves to signature", () => {
    const { root } = fixture({ policy: "garbage" });
    const waiver = criticalProofWaiverFor(root, "push");
    assert.equal(waiver.waived, false);
    assert.equal(typeof waiver.code, "string", "the reader must report the fault as a typed code");
    assert.equal(checkpointApprovalMode({ pushGate: STRICT_GATE, waiver }), "signature");
  });

  // ---- verifier -----------------------------------------------------------------------

  check("CPA1 a current approval bound to commit, remote, destination and threat model is admitted without any evidence", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    // No Verify / security / Critic evidence exists anywhere in this repository fixture.
    assert.equal(existsSync(join(root, "evidence")), false);
    const record = approvalRecord({ key, threatModel });
    const result = call(root, stateFor(record));
    assert.deepEqual(result, { ok: true, proofSha256: record.criticalProof.proofSha256, keyReference: "po-key-1" });
  });

  check("CPA1B the verdict does not mutate its inputs (deep-frozen state still verifies)", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const state = deepFreeze(stateFor(approvalRecord({ key, threatModel })));
    const candidate = deepFreeze({ commit: COMMIT, tree: TREE });
    assert.equal(call(root, state, { candidate }).ok, true);
  });

  check("CPA2 no approval record at all is refused as missing-or-stale", () => {
    const key = keypair();
    const { root } = fixture({ anchorKey: key });
    for (const state of [
      { activeFeature: { id: "demo-feature" } },
      { pushApproval: {} },
      { pushApproval: { lastApproved: null } },
      { pushApproval: { lastApproved: "approved" } },
      { pushApproval: { lastApproved: [] } },
      { pushApproval: "approved" },
    ]) assertRefused(call(root, state), "CHECKPOINT-APPROVAL-STALE");
  });

  check("CPA3 a state record that is absent or not an object is refused as state-missing", () => {
    const key = keypair();
    const { root } = fixture({ anchorKey: key });
    for (const state of [undefined, null, "state", 7, []]) assertRefused(call(root, state), "CHECKPOINT-APPROVAL-STATE-MISSING");
  });

  check("CPA4 an approval for another commit (a stale approval) is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const record = approvalRecord({ key, threatModel, candidate: { commit: OTHER_COMMIT, tree: TREE } });
    assertRefused(call(root, stateFor(record)), "CHECKPOINT-APPROVAL-STALE");
  });

  check("CPA5 an approval for another tree at the same commit is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const record = approvalRecord({ key, threatModel });
    assertRefused(call(root, stateFor(record), { candidate: { commit: COMMIT, tree: "f".repeat(40) } }), "PUSH-PROOF-SUBJECT-MISMATCH");
  });

  check("CPA6 an expired approval is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const record = approvalRecord({ key, threatModel });
    assertRefused(call(root, stateFor(record), { now: AFTER_EXPIRY }), "PUSH-PROOF-EXPIRED");
  });

  check("CPA7 an approval bound to another destination or another remote is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const state = stateFor(approvalRecord({ key, threatModel }));
    assertRefused(call(root, state, { destination: "refs/heads/feat/alfred/other" }), "CHECKPOINT-APPROVAL-BINDING");
    assertRefused(call(root, state, { remote: "upstream" }), "CHECKPOINT-APPROVAL-BINDING");
    // An approval given for main must not be redirectable onto a feature ref.
    const forMain = stateFor(approvalRecord({ key, threatModel, destination: "refs/heads/main" }));
    assertRefused(call(root, forMain), "CHECKPOINT-APPROVAL-BINDING");
  });

  check("CPA8 a record whose stated binding was rewritten to agree with the push but contradicts the signed subject is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const record = approvalRecord({ key, threatModel, destination: "refs/heads/feat/alfred/other" });
    record.destination = DESTINATION; // the lie: the guard-visible field is rewritten
    assertRefused(call(root, stateFor(record)), "PUSH-PROOF-SUBJECT-MISMATCH");
  });

  check("CPA9 a threat model edited, or removed, after signing revokes the approval", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const state = stateFor(approvalRecord({ key, threatModel }));
    assert.equal(call(root, state).ok, true, "control: the untouched threat model verifies");
    writeFileSync(join(root, THREAT_MODEL_PATH), "# tampered after signing\n");
    assertRefused(call(root, state), "PUSH-PROOF-THREAT-MODEL");
    rmSync(join(root, THREAT_MODEL_PATH));
    assertRefused(call(root, state), "PUSH-PROOF-THREAT-MODEL");
  });

  check("CPA10 a record without a proof object, or with a proof signed by the wrong key, is refused", () => {
    const key = keypair();
    const impostor = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    // No signature material at all.
    const bare = approvalRecord({ key, threatModel });
    delete bare.criticalProof.proof;
    assertRefused(call(root, stateFor(bare)), "PUSH-PROOF-RECORD-INCOMPLETE");
    const hollow = approvalRecord({ key, threatModel });
    hollow.criticalProof = { proofSha256: "0".repeat(64) };
    assertRefused(call(root, stateFor(hollow)), "PUSH-PROOF-RECORD-INCOMPLETE");
    // Claims the anchored key but the signature bytes come from somebody else.
    const forged = approvalRecord({ key, threatModel, signWith: impostor.privateKey });
    assertRefused(call(root, stateFor(forged)), "PUSH-PROOF-SIGNATURE-MISMATCH");
    // A perfectly valid signature from a key the operator never installed.
    const unanchored = approvalRecord({ key: impostor, threatModel });
    assertRefused(call(root, stateFor(unanchored)), "PUSH-PROOF-TRUST-MISMATCH");
  });

  check("CPA11 an approval issued under another plan authority, or never consumed, is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const foreignPlan = approvalRecord({ key, threatModel, planSha256: "1".repeat(64) });
    assertRefused(call(root, stateFor(foreignPlan)), "PUSH-PROOF-INTENT-MISMATCH");
    const unconsumed = stateFor(approvalRecord({ key, threatModel }));
    unconsumed.criticalProofConsumption = [];
    assertRefused(call(root, unconsumed), "PUSH-PROOF-NOT-CONSUMED");
  });

  check("CPA12 a chat-style record (no critical proof, waiver attribution) never satisfies the signature check", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const chatRecord = {
      approvedBy: "Human", approvedAt: NOW, forCommit: COMMIT, remote: REMOTE, destination: DESTINATION, threatModel,
      criticalProof: null,
      criticalProofWaiver: { kind: "push", mode: "chat-attributed-unattested", source: "pipeline.user.yaml" },
      humanApproval: { kind: "push", mode: "chat-attributed-unattested" },
    };
    const state = { activeFeature: { id: "demo-feature" }, pushApproval: { lastApproved: chatRecord } };
    assertRefused(call(root, state), "PUSH-PROOF-RECORD-INCOMPLETE");
  });

  check("CPA13 an unreadable, or absent, proof policy fails closed", () => {
    const key = keypair();
    const { root: garbageRoot, threatModel } = fixture({ policy: "garbage" });
    const record = approvalRecord({ key, threatModel });
    assertRefused(call(garbageRoot, stateFor(record)), "CRITICAL-PROOF-POLICY-UNREADABLE");
    // No policy file at all and no operator key registered on this machine: the route is
    // unavailable, it does not degrade to "no check needed".
    const { root: absentRoot, threatModel: absentModel } = fixture({ policy: "absent" });
    const absentRecord = approvalRecord({ key, threatModel: absentModel });
    assertRefused(
      call(absentRoot, stateFor(absentRecord), { machinePlaneDeps: emptyMachinePlane() }),
      "PUSH-PROOF-TRUST-ANCHOR-MISSING",
    );
  });

  check("CPA14 the trust anchor comes from the governed anchor directory, never from the pushed repository", () => {
    const operator = keypair();
    const attacker = keypair();
    // The pushed repository carries a policy that trusts the attacker's own key ...
    const { root: pushedRoot, threatModel } = fixture({ anchorKey: attacker });
    // ... while the governed root trusts only the operator.
    const { root: governedRoot } = fixture({ anchorKey: operator });
    const state = stateFor(approvalRecord({ key: attacker, threatModel }));
    assert.equal(call(pushedRoot, state, { anchorDir: pushedRoot }).ok, true, "control: the repository's own anchor would have admitted it");
    assertRefused(call(pushedRoot, state, { anchorDir: governedRoot }), "PUSH-PROOF-TRUST-MISMATCH");
  });

  check("CPA15 the machine-plane injection reaches the trust-on-first-use gate (provenance required to admit and pin)", () => {
    const own = keypair();
    const foreign = keypair();
    const { root, threatModel } = fixture({ anchorKey: null });
    const machinePlaneDeps = machinePlaneFixture(own);
    // A signer without local-machine provenance is refused, never pinned.
    assertRefused(
      call(root, stateFor(approvalRecord({ key: foreign, threatModel })), { machinePlaneDeps }),
      "PUSH-PROOF-TRUST-ANCHOR-MISSING",
    );
    const policyPath = join(root, "project", "critical-human-proof.json");
    assert.equal(JSON.parse(readFileSync(policyPath, "utf8")).schema, "pipeline.critical-human-proof-policy.v1");
    // The machine's own operator key is admitted (documented side effect: the delegate pins it).
    const record = approvalRecord({ key: own, threatModel });
    assert.equal(call(root, stateFor(record), { machinePlaneDeps }).ok, true);
    assert.equal(JSON.parse(readFileSync(policyPath, "utf8")).schema, "pipeline.critical-human-proof-policy.v3");
  });

  check("CPA16 invalid or missing operands are refused with the verifier's typed input code, and nothing throws", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    const state = stateFor(approvalRecord({ key, threatModel }));
    for (const overrides of [
      { candidate: undefined }, { candidate: null }, { candidate: { commit: COMMIT } }, { candidate: { tree: TREE } },
      { candidate: { commit: COMMIT, tree: "not-an-oid" } }, { candidate: { commit: COMMIT, tree: COMMIT } },
      { remote: "" }, { remote: undefined }, { remote: 7 }, { destination: "" }, { destination: undefined },
      { now: undefined }, { now: "not-a-date" }, { projectDir: undefined }, { projectDir: 7 },
    ]) {
      assertRefused(call(root, state, overrides), "PUSH-PROOF-INPUT-INVALID");
    }
    assertRefused(checkCheckpointPushApproval(), "CHECKPOINT-APPROVAL-STATE-MISSING");
    assertRefused(checkCheckpointPushApproval(null), "CHECKPOINT-APPROVAL-STATE-MISSING");
  });

  check("CPA17 the cheap binding checks run before the signature check, in the designed order", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    // Stale AND expired: the commit binding is reported, not the expiry.
    const stale = stateFor(approvalRecord({ key, threatModel, candidate: { commit: OTHER_COMMIT, tree: TREE } }));
    assertRefused(call(root, stale, { now: AFTER_EXPIRY }), "CHECKPOINT-APPROVAL-STALE");
    // Wrong destination AND expired: the destination binding is reported.
    const bound = stateFor(approvalRecord({ key, threatModel }));
    assertRefused(call(root, bound, { destination: "refs/heads/feat/alfred/other", now: AFTER_EXPIRY }), "CHECKPOINT-APPROVAL-BINDING");
    // State missing wins over everything.
    assertRefused(call(root, null, { now: AFTER_EXPIRY, remote: "" }), "CHECKPOINT-APPROVAL-STATE-MISSING");
  });

  check("CPA18 failure texts never carry the remote operand (SEC-01), whatever the failure", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchorKey: key });
    // Built at run time so no credential-bearing URL literal exists in the source.
    const tokenValue = "zq8w".repeat(3);
    const credentialUrl = `https://user:${tokenValue}@example.invalid/org/repo.git`;
    // Binding failure: the approval names `origin`, the push names a credential-bearing URL.
    const mismatch = call(root, stateFor(approvalRecord({ key, threatModel })), { remote: credentialUrl });
    assertRefused(mismatch, "CHECKPOINT-APPROVAL-BINDING");
    assert.equal(JSON.stringify(mismatch).includes(tokenValue), false);
    // A matching remote that fails for another reason (expiry) must not echo it either.
    const expired = call(
      root,
      stateFor(approvalRecord({ key, threatModel, remote: credentialUrl })),
      { remote: credentialUrl, now: AFTER_EXPIRY },
    );
    assertRefused(expired, "PUSH-PROOF-EXPIRED");
    assert.equal(JSON.stringify(expired).includes(tokenValue), false);
    assert.equal(JSON.stringify(expired).includes("example.invalid"), false);
  });

  check("CPA19 an internal fault while reading the record is a typed refusal, never an exception", () => {
    const key = keypair();
    const { root } = fixture({ anchorKey: key });
    const exploding = { get pushApproval() { throw new Error("boom: leaked-detail-xyz"); } };
    const result = call(root, exploding);
    assertRefused(result, "CHECKPOINT-APPROVAL-VERIFIER-FAULT");
    assert.equal(JSON.stringify(result).includes("leaked-detail-xyz"), false, "the fault text must not leak the underlying error");
  });

  // ---- porcelain classifier -----------------------------------------------------------

  const CLEAN = { clean: true, approvalRecordOnly: false };
  const RECORD_ONLY = { clean: false, approvalRecordOnly: true };
  const DIRTY = { clean: false, approvalRecordOnly: false };
  const STATES = [STATE_PATH, LEGACY_STATE_PATH];

  check("CPP1 empty porcelain output is clean, and is not the approval-record exemption", () => {
    assert.deepEqual(classifyCheckpointPorcelain("", STATES), CLEAN);
    assert.deepEqual(classifyCheckpointPorcelain("\n", STATES), CLEAN);
    assert.deepEqual(classifyCheckpointPorcelain("\r\n", STATES), CLEAN);
  });

  check("CPP2 exactly one unstaged modification of the tracked state record is the approval-record case", () => {
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, STATES), RECORD_ONLY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}`, STATES), RECORD_ONLY, "no trailing newline");
  });

  check("CPP3 CRLF line endings are tolerated", () => {
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\r\n`, STATES), RECORD_ONLY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\r\n?? other\r\n`, STATES), DIRTY);
  });

  check("CPP4 either state path (neutral or legacy) is accepted when it is the one named", () => {
    assert.deepEqual(classifyCheckpointPorcelain(` M ${LEGACY_STATE_PATH}\n`, STATES), RECORD_ONLY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, [STATE_PATH]), RECORD_ONLY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${LEGACY_STATE_PATH}\n`, [STATE_PATH]), DIRTY, "a path that is not named is not exempt");
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, STATE_PATH), RECORD_ONLY, "a single string is accepted");
  });

  check("CPP5 both state paths modified at once is not exactly one entry and stays dirty", () => {
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n M ${LEGACY_STATE_PATH}\n`, STATES), DIRTY);
  });

  check("CPP6 any other modified file keeps the tree dirty, alone or next to the state record", () => {
    assert.deepEqual(classifyCheckpointPorcelain(" M src/app.mjs\n", STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n M src/app.mjs\n`, STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(` M src/app.mjs\n M ${STATE_PATH}\n`, STATES), DIRTY);
  });

  check("CPP7 an untracked file, even one named like the state record, stays dirty", () => {
    assert.deepEqual(classifyCheckpointPorcelain("?? notes.md\n", STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(`?? ${STATE_PATH}\n`, STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(`?? ${STATE_PATH}\n?? other.md\n`, STATES), DIRTY);
  });

  check("CPP8 a staged, deleted, added or conflicted state record stays dirty", () => {
    for (const status of ["M ", "MM", "A ", "AM", " D", "D ", "UU", "!!", " T"]) {
      assert.deepEqual(classifyCheckpointPorcelain(`${status} ${STATE_PATH}\n`, STATES), DIRTY, status);
    }
  });

  check("CPP9 a rename or copy that touches the state record stays dirty", () => {
    assert.deepEqual(classifyCheckpointPorcelain(`R  old.json -> ${STATE_PATH}\n`, STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(`R  ${STATE_PATH} -> old.json\n`, STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH} -> elsewhere.json\n`, STATES), DIRTY);
  });

  check("CPP10 near-miss paths are not the state record (suffix, prefix, case, quoting, trailing space)", () => {
    for (const path of [
      `${STATE_PATH}.bak`, `sub/${STATE_PATH}`, `project/PIPELINE-STATE.JSON`, `"${STATE_PATH}"`,
      `${STATE_PATH} `, ` ${STATE_PATH}`, "project/", "project/pipeline-state.jsonx",
    ]) assert.deepEqual(classifyCheckpointPorcelain(` M ${path}\n`, STATES), DIRTY, JSON.stringify(path));
  });

  check("CPP11 text that lost its leading space to a trim reads as a staged change and is refused", () => {
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`.trim(), STATES), DIRTY);
    assert.deepEqual(classifyCheckpointPorcelain(`M ${STATE_PATH}`, STATES), DIRTY);
  });

  check("CPP12 malformed input and unusable path lists never grant the exemption and never throw", () => {
    for (const text of [undefined, null, 7, {}, [], " M", " M ", "  ", "garbage", "\n\n x \n"]) {
      assert.deepEqual(classifyCheckpointPorcelain(text, STATES), DIRTY, JSON.stringify(text) ?? String(text));
    }
    for (const paths of [undefined, null, [], "", [""], [7], {}, ["/abs/state.json"], ["../state.json"], ["project//state.json"], [`${String.fromCharCode(67)}:/state.json`], ["."], ["project/"]]) {
      assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, paths), DIRTY, JSON.stringify(paths) ?? String(paths));
    }
    // Windows spellings of the allowed path are normalised to the porcelain's forward slashes.
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, ["project\\pipeline-state.json"]), RECORD_ONLY);
    assert.deepEqual(classifyCheckpointPorcelain(` M ${STATE_PATH}\n`, ["./project/pipeline-state.json"]), RECORD_ONLY);
    // An empty list while the tree is clean is still clean.
    assert.deepEqual(classifyCheckpointPorcelain("", []), CLEAN);
  });

  // ---- module shape (design 3.2: pure, no evidence anywhere on this path) ---------------

  const moduleSource = readFileSync(fileURLToPath(new URL("./checkpoint-push-approval.mjs", import.meta.url)), "utf8");

  check("CPS1 the module starts with the SPDX line", () => {
    assert.equal(moduleSource.split("\n", 1)[0], "// SPDX-License-Identifier: SUL-1.0");
  });

  check("CPS2 the module performs no I/O of its own: its only import is the authorization module", () => {
    const specifiers = [...moduleSource.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gmu)].map((match) => match[1]);
    assert.deepEqual(specifiers, ["./critical-action-authorization.mjs"]);
    assert.equal(/\bimport\s*\(/u.test(moduleSource), false, "no dynamic import");
    assert.equal(/node:(fs|child_process|net|http|https)/u.test(moduleSource), false);
  });

  check("CPS3 the module never reads Verify, security or Critic evidence", () => {
    assert.equal(/verify-latest|security-latest|critic-latest|evidence\//iu.test(moduleSource), false);
  });

  process.stdout.write(`\n${checks}/${checks} checkpoint push approval checks passed\n`);
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
