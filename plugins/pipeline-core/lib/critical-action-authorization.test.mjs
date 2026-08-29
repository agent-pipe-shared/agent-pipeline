// SPDX-License-Identifier: SUL-1.0
/**
 * Unit tests for the raw-push authorization decision (ADR-0056 §6).
 *
 * Every case builds a REAL Ed25519 keypair and a real signature, because the whole
 * point of this module is that a recorded approval is not believed — it is verified.
 * A test that stubbed the crypto would prove nothing about the property being claimed.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { criticalActionSha256, criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "./po-approval-proof.mjs";
import { authorizeRecordedDeploy, authorizeRecordedPush } from "./critical-action-authorization.mjs";

const roots = [];
let checks = 0;
const check = (label, fn) => { fn(); checks += 1; process.stdout.write(`ok ${label}\n`); };

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const PLAN_SHA = "c".repeat(64);
const SPEC_SHA = "d".repeat(64);
const THREAT_MODEL_PATH = "specs/demo/threat-model.md";
const REMOTE = "upstream";
const DESTINATION = "refs/heads/main";
const NOW = "2026-08-06T12:00:00.000Z";
const EXPIRES = "2026-08-07T06:00:00.000Z";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}

/**
 * A repository whose committed policy carries the trust anchor, plus the threat-model
 * file the subject digest binds. `anchor: null` writes the pre-anchor policy shape.
 *
 * SETUP-1: `trustAnchors` (plural, an array) switches the fixture to the v3 SET schema
 * instead of v1's single `trustAnchor` -- `[]` is the "any well-formed key" posture,
 * a populated array enforces membership. `anchor` and `trustAnchors` are mutually
 * exclusive; `trustAnchors` wins if both are given a non-undefined value.
 */
function fixture({ anchor, trustAnchors, threatModelBody = "# threat model\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "push-proof-"));
  roots.push(root);
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", "demo"), { recursive: true });
  writeFileSync(join(root, THREAT_MODEL_PATH), threatModelBody);
  const policy = trustAnchors === undefined
    ? { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] }
    : { schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push", "deploy", "publication"], waivedKinds: [], trustAnchors };
  if (trustAnchors === undefined && anchor !== null) policy.trustAnchor = anchor;
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify(policy, null, 2)}\n`);
  return {
    root,
    threatModel: { path: THREAT_MODEL_PATH, sha256: createHash("sha256").update(threatModelBody).digest("hex") },
  };
}

/**
 * A machine plane whose `poKeyDirectory` resolves to a real `trust-policy.json` naming
 * `key` -- the fixture form of "this machine has its own registered operator key"
 * (NVA-CF-TOFUFIX: `authorizeRecordedPush`/`authorizeRecordedDeploy`'s trust-on-first-use
 * gate now requires exactly this before accepting+pinning an anchor-less policy's first
 * verifying signature). Returns `{ homedirFn }`, the one override
 * `resolveLocalOperatorKeyAnchor`'s dependency-injection shape needs -- the real
 * `existsSync`/`readFileSync` do the rest against this fixture's own temp directories.
 */
function machinePlaneFixture(key, keyReference = "po-key-1") {
  const home = mkdtempSync(join(tmpdir(), "machine-home-"));
  roots.push(home);
  const keyDirectory = mkdtempSync(join(tmpdir(), "po-key-dir-"));
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
  const signature = sign(null, Buffer.from(intent.sha256, "utf8"), signWith);
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference,
    publicKey: key.publicPem,
    signatureBase64: signature.toString("base64"),
  };
  const canonical = (value) => Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
      : JSON.stringify(value);
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

const call = (root, state, overrides = {}) => authorizeRecordedPush({
  projectDir: root,
  state,
  candidate: { commit: COMMIT, tree: TREE },
  remote: REMOTE,
  destination: DESTINATION,
  now: NOW,
  ...overrides,
});

try {
  // PPA1 -- the happy path. Everything the guard can observe about the push matches
  // what the key holder signed, so the raw push is authorized.
  check("PPA1 exact binding with a verifying signature authorizes the push", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    const result = call(root, stateFor(record));
    assert.equal(result.code, "PUSH-PROOF-VERIFIED");
    assert.equal(result.authorized, true);
  });

  // PPA2 -- trust-on-first-use (PO decision, 2026-08-29; backlog:
  // 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md), NARROWED
  // the same day (NVA-CF-TOFUFIX, "TOFU-Fix" -> "A: Provenienz verlangen"): a policy with
  // genuinely no trust anchor recorded no longer accepts+pins ANY well-formed key -- only a
  // key that resolves to THIS machine's own registered operator key
  // (`resolveLocalOperatorKeyAnchor`, `lib/machine-plane.mjs`). A throwaway key with no
  // relationship to any machine the PO operates -- the exact shape a self-fabricated proof
  // or a nested repository's own committed key takes (SIG-11/PG12s13/PG12s14) -- is refused
  // outright, never pinned.
  check("PPA2 a first use signed by a key with no local-machine provenance is refused, not pinned", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: null });
    const record = approvalRecord({ key, threatModel });
    const result = call(root, stateFor(record));
    assert.equal(result.authorized, false);
    assert.equal(result.code, "PUSH-PROOF-TRUST-ANCHOR-MISSING");
    const written = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
    assert.equal(written.schema, "pipeline.critical-human-proof-policy.v1", "an unauthorized signer must never be written back as a trust anchor");
    assert.ok(!Object.hasOwn(written, "trustAnchor"), "no anchor is pinned when provenance was never established");
  });

  // PPA2B -- the real happy path this narrowing exists to keep working: a key that DOES
  // resolve to this machine's own registered operator key still authorizes and pins on
  // first use, exactly as PPA2 asserted before the narrowing.
  check("PPA2B a first use signed by the machine's own resolvable operator key authorizes and pins it", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: null });
    const machinePlaneDeps = machinePlaneFixture(key);
    const record = approvalRecord({ key, threatModel });
    const result = call(root, stateFor(record), { machinePlaneDeps });
    assert.equal(result.code, "PUSH-PROOF-VERIFIED");
    assert.equal(result.authorized, true);
    const written = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
    assert.equal(written.schema, "pipeline.critical-human-proof-policy.v3");
    assert.deepEqual(written.requiredKinds, ["push", "deploy", "publication"]);
    assert.deepEqual(written.waivedKinds, []);
    assert.deepEqual(written.trustAnchors, [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }]);
  });

  // PPA2A -- the pin actually restricts: once the first call has recorded a key, a second,
  // genuinely different key is refused rather than being accepted under the same open
  // posture PPA2B relied on for the first call. The second key needs no local provenance of
  // its own to demonstrate this -- membership against the now-populated set is what refuses
  // it, the same TRUST-MISMATCH path PPA3/PPA23 already exercise, independent of this gate.
  check("PPA2A trust-on-first-use pins: a second call under a different key is refused after the first pins", () => {
    const first = keypair();
    const second = keypair();
    const { root, threatModel } = fixture({ anchor: null });
    const machinePlaneDeps = machinePlaneFixture(first);
    const firstResult = call(root, stateFor(approvalRecord({ key: first, threatModel })), { machinePlaneDeps });
    assert.equal(firstResult.authorized, true);
    const secondResult = call(root, stateFor(approvalRecord({ key: second, threatModel })), { machinePlaneDeps });
    assert.equal(secondResult.authorized, false);
    assert.equal(secondResult.code, "PUSH-PROOF-TRUST-MISMATCH");
  });

  // PPA3 -- the attack the anchor exists for: a forged record signed by a key the
  // operator never installed. The signature is perfectly valid; it is simply not theirs.
  check("PPA3 a valid signature from an unanchored key is refused", () => {
    const operator = keypair();
    const attacker = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: operator.publicKeySha256 } });
    const record = approvalRecord({ key: attacker, threatModel });
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-TRUST-MISMATCH");
  });

  // PPA4/PPA5 -- the binding half. The approval was signed for one destination; the
  // push must not be able to redirect it to another remote or another ref.
  check("PPA4 a different remote is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record), { remote: "origin" }).code, "PUSH-PROOF-BINDING-MISMATCH");
  });

  check("PPA5 a different destination ref is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record), { destination: "refs/heads/other" }).code, "PUSH-PROOF-BINDING-MISMATCH");
  });

  // PPA6 -- a record that merely CLAIMS this remote while the signed subject says
  // otherwise. PPA4/PPA5 catch the honest mismatch; this catches the edited record.
  check("PPA6 a record whose stated binding contradicts the signed subject is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel, destination: "refs/heads/other" });
    record.destination = DESTINATION; // the lie: the guard-visible field is rewritten
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-SUBJECT-MISMATCH");
  });

  // PPA7 -- the commit half of the candidate.
  check("PPA7 an approval bound to another commit is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel, candidate: { commit: "e".repeat(40), tree: TREE } });
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-COMMIT-MISMATCH");
  });

  // PPA8 -- the tree half. Same commit, different content: only reachable by a state
  // edit, and refused because the intent digest covers the tree.
  check("PPA8 a candidate tree that differs from the signed one is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record), { candidate: { commit: COMMIT, tree: "f".repeat(40) } }).code, "PUSH-PROOF-SUBJECT-MISMATCH");
  });

  // PPA9 -- expiry is part of the signed action, and time is checked against the push,
  // not against the approval.
  check("PPA9 an expired proof is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record), { now: "2026-08-08T00:00:00.000Z" }).code, "PUSH-PROOF-EXPIRED");
  });

  // PPA10 -- the threat model is part of the signed subject, so changing the file after
  // approval invalidates the authorization rather than silently carrying it forward.
  check("PPA10 a threat model whose bytes changed after approval is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    writeFileSync(join(root, THREAT_MODEL_PATH), "# tampered\n");
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-THREAT-MODEL");
  });

  // PPA11 -- a record written before this contract existed carries no proof object.
  // It must not authorize a raw push; it can still clear the old executor route.
  check("PPA11 a legacy record without the proof object is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    delete record.criticalProof.proof;
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-RECORD-INCOMPLETE");
  });

  // PPA12 -- the plan/spec authority is inside the signed intent. An approval issued
  // under a different plan cannot be replayed under this one.
  check("PPA12 an approval issued under a different plan authority is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel, planSha256: "1".repeat(64) });
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-INTENT-MISMATCH");
  });

  // PPA13 -- the anchor names WHICH key, not just any key the operator ever held.
  check("PPA13 a proof under a different key reference is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel, keyReference: "po-key-2" });
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-INVALID");
  });

  // PPA14 -- the recorded digest must be the digest of the recorded proof, so the
  // consumption ledger below cannot be pointed at a different object.
  check("PPA14 a recorded proof digest that does not match the proof is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    record.criticalProof.proofSha256 = "9".repeat(64);
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-DIGEST-MISMATCH");
  });

  // PPA15 -- approve-push writes the consumption entry in the same transaction. A
  // record without one was not produced by the writer.
  check("PPA15 a proof with no consumption entry is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    const state = stateFor(record);
    state.criticalProofConsumption = [];
    assert.equal(call(root, state).code, "PUSH-PROOF-NOT-CONSUMED");
  });

  // PPA16 -- an anchor is a key identity, and a malformed one is a broken gate, not a
  // permissive one.
  check("PPA16 a malformed trust anchor fails closed", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: "not-a-digest" } });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record)).code, "CRITICAL-PROOF-POLICY-TRUST-ANCHOR-INVALID");
  });

  // PPA17 -- the threat-model path travels in the record, so it is an attacker-chosen
  // string. It must stay inside the repository.
  check("PPA17 a threat model path escaping the repository is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const record = approvalRecord({ key, threatModel });
    record.threatModel = { path: "../outside.md", sha256: threatModel.sha256 };
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-THREAT-MODEL");
  });

  // PPA18 -- no approval at all. The guard's own commit check runs earlier, but this
  // module must never answer "authorized" on a missing record.
  check("PPA18 a missing approval record is refused", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    assert.equal(call(root, { activeFeature: { id: "demo-feature" } }).code, "PUSH-PROOF-RECORD-INCOMPLETE");
  });

  // PPA19 -- T6 Critic F4. `readCriticalHumanProofPolicy` admits `trustAnchor` on BOTH
  // schema versions, but every fixture in every suite wrote `.v1`, so the `.v2` arm of that
  // shape check had never executed anywhere. A project that uses an ADR-0055 waiver is
  // necessarily on `.v2`, so this is the shape a proof-waiving project actually ships.
  //
  // Placed here rather than in the reader's own CHP suite deliberately: this exercises the
  // branch end-to-end through the consumer that depends on it, and the reader's suite is
  // TP-9 protected, so a lift would have been the only other route to the same coverage.
  check("PPA19 a v2 policy carrying both a waiver and an anchor still authorizes", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v2",
      requiredKinds: ["push", "deploy", "publication"],
      waivedKinds: [{ kind: "deploy", reason: "operator decision recorded for this fixture" }],
      trustAnchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 },
    }, null, 2)}\n`);
    const result = call(root, stateFor(approvalRecord({ key, threatModel })));
    assert.equal(result.code, "PUSH-PROOF-VERIFIED");
  });

  // PPA20 -- the same v2 shape with a malformed anchor must still fail closed; an added
  // optional key must not become a hole in the version that carries waivers.
  check("PPA20 a v2 policy with a malformed anchor fails closed", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v2",
      requiredKinds: ["push", "deploy", "publication"],
      waivedKinds: [],
      trustAnchor: { keyReference: "po-key-1", publicKeySha256: "nope" },
    }, null, 2)}\n`);
    assert.equal(call(root, stateFor(approvalRecord({ key, threatModel }))).code, "CRITICAL-PROOF-POLICY-TRUST-ANCHOR-INVALID");
  });

  // ---- SETUP-1: the v3 trust-anchor SET, exercised end-to-end through the real guard-time
  // authorization decision (nova-setup-bootstrap.md Sec5a). Every posture below builds a REAL
  // Ed25519 keypair and a real signature, same discipline as the rest of this file.

  // PPA21 -- posture 1: no set configured (v3, empty trustAnchors) accepts a brand-new key
  // that never appeared in any committed document.
  check("PPA21 an empty v3 trust-anchor set authorizes a brand-new key (any-key posture)", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ trustAnchors: [] });
    const result = call(root, stateFor(approvalRecord({ key, threatModel })));
    assert.equal(result.code, "PUSH-PROOF-VERIFIED");
    assert.equal(result.authorized, true);
    // SETUP-1: the signer is recorded in this accepting case too, though nothing gated on it.
    assert.equal(result.keyReference, "po-key-1");
    assert.equal(result.publicKeySha256, key.publicKeySha256);
  });

  // PPA22 -- posture 2: a populated v3 set with the signing key as a member.
  check("PPA22 a populated v3 trust-anchor set authorizes a member key", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ trustAnchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
    const result = call(root, stateFor(approvalRecord({ key, threatModel })));
    assert.equal(result.authorized, true);
    assert.equal(result.keyReference, "po-key-1");
    assert.equal(result.publicKeySha256, key.publicKeySha256);
  });

  // PPA23 -- posture 3: a populated v3 set that does NOT include the signing key (same
  // claimed keyReference as PPA3's single-anchor case, so this exercises membership on the
  // actual key content, not merely on the label).
  check("PPA23 a populated v3 trust-anchor set refuses a non-member key", () => {
    const key = keypair();
    const other = keypair();
    const { root, threatModel } = fixture({ trustAnchors: [{ keyReference: "po-key-1", publicKeySha256: other.publicKeySha256 }] });
    const result = call(root, stateFor(approvalRecord({ key, threatModel })));
    assert.equal(result.authorized, false);
    assert.equal(result.code, "PUSH-PROOF-TRUST-MISMATCH");
  });

  // PPA24 -- posture 4: a malformed key is refused in BOTH postures (any-key and set).
  check("PPA24 a malformed public key is refused whether or not a trust-anchor set is configured", () => {
    const key = keypair();
    const { root: anyRoot, threatModel: anyThreatModel } = fixture({ trustAnchors: [] });
    const anyRecord = approvalRecord({ key, threatModel: anyThreatModel });
    anyRecord.criticalProof.proof.publicKey = "not a real key";
    assert.equal(call(anyRoot, stateFor(anyRecord)).authorized, false);

    const { root: setRoot, threatModel: setThreatModel } = fixture({ trustAnchors: [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }] });
    const setRecord = approvalRecord({ key, threatModel: setThreatModel });
    setRecord.criticalProof.proof.publicKey = "not a real key";
    assert.equal(call(setRoot, stateFor(setRecord)).authorized, false);
  });

  // PPA25 -- an empty v3 set does not bypass EXPIRY or BINDING: any-key relaxes WHICH key,
  // nothing else the signed subject already governs.
  check("PPA25 the any-key posture still enforces the signed binding and expiry", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ trustAnchors: [] });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record), { remote: "origin" }).code, "PUSH-PROOF-BINDING-MISMATCH");
  });

  // ---- the release route ------------------------------------------------------------
  //
  // Same property, different signed subject. These exist because hardening only the push
  // would have left `checkDeployApprovals` matching on artifact/environment alone, which
  // did not read the recorded proof at all.

  const ARTIFACT = "v1.2.3";
  const ENVIRONMENT = "production";

  /** The chain approve-deploy writes: subject {artifact, environment} -> action -> proof. */
  function deployRecord({ key, candidate = { commit: COMMIT, tree: TREE }, artifact = ARTIFACT, environment = ENVIRONMENT,
    expiresAt = EXPIRES, keyReference = "po-key-1", featureId = "demo-feature",
    planSha256 = PLAN_SHA, specSha256 = SPEC_SHA } = {}) {
    const action = {
      kind: "deploy",
      subjectSha256: criticalActionSubjectSha256({ kind: "deploy", candidate, subject: { artifact, environment } }),
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
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), key.privateKey).toString("base64"),
    };
    const canonical = (value) => Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value !== null && typeof value === "object"
        ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
        : JSON.stringify(value);
    return {
      forArtifact: artifact, forEnvironment: environment, approvedBy: "Human", approvedAt: NOW,
      criticalProof: {
        proofSha256: createHash("sha256").update(canonical(proof)).digest("hex"),
        intentSha256: intent.sha256, action, proof,
      },
    };
  }

  const deployState = (entries) => ({
    activeFeature: { id: "demo-feature" },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
    deployApprovals: entries,
  });

  const callDeploy = (root, state, overrides = {}) => authorizeRecordedDeploy({
    projectDir: root, state, candidate: { commit: COMMIT, tree: TREE },
    artifact: ARTIFACT, environment: ENVIRONMENT, now: NOW, ...overrides,
  });

  // DPA1 -- the happy path on the release route.
  check("DPA1 a verifying deploy proof authorizes the deploy-triggering push", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const result = callDeploy(root, deployState([deployRecord({ key })]));
    assert.equal(result.code, "DEPLOY-PROOF-VERIFIED");
    assert.equal(result.authorized, true);
  });

  // DPA2 -- the gap this closes: the OLD check accepted exactly this record, because it
  // matched on artifact/environment/!usedAt and never looked at the proof.
  check("DPA2 an approval entry carrying no proof at all is refused", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const entry = deployRecord({ key });
    delete entry.criticalProof;
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-RECORD-INCOMPLETE");
  });

  // DPA3 -- an approval for one environment must not authorize another.
  check("DPA3 an approval for a different environment is refused", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const entry = deployRecord({ key, environment: "staging" });
    entry.forEnvironment = ENVIRONMENT; // the lie the tuple match alone could not see
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-SUBJECT-MISMATCH");
  });

  // DPA4 -- same for the artifact.
  check("DPA4 an approval for a different artifact is refused", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const entry = deployRecord({ key, artifact: "v9.9.9" });
    entry.forArtifact = ARTIFACT;
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-SUBJECT-MISMATCH");
  });

  // DPA5 -- the declared workflow tightening: the signed intent covers the candidate, so
  // an approval no longer survives arbitrary later commits.
  check("DPA5 an approval signed for another candidate does not carry to this one", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const entry = deployRecord({ key, candidate: { commit: "e".repeat(40), tree: TREE } });
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-SUBJECT-MISMATCH");
  });

  // DPA6 -- a foreign key on the release route, mirroring PPA3.
  check("DPA6 a valid signature from an unanchored key is refused", () => {
    const operator = keypair();
    const attacker = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: operator.publicKeySha256 } });
    assert.equal(callDeploy(root, deployState([deployRecord({ key: attacker })])).code, "DEPLOY-PROOF-TRUST-MISMATCH");
  });

  // DPA7 -- consume-deploy's single-use mark is this route's replay control, and it must
  // still hold once the proof is verified rather than being bypassed by it.
  check("DPA7 an already-used approval is not reusable", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const entry = deployRecord({ key });
    entry.usedAt = NOW;
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-RECORD-INCOMPLETE");
  });

  // DPA8 -- the writer appends, so several unused entries for one tuple are ordinary. A
  // stale one must not mask a valid one.
  check("DPA8 a stale entry does not mask a valid one for the same tuple", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const stale = deployRecord({ key, candidate: { commit: "e".repeat(40), tree: TREE } });
    assert.equal(callDeploy(root, deployState([stale, deployRecord({ key })])).code, "DEPLOY-PROOF-VERIFIED");
  });

  // DPA9 -- expiry applies here too.
  check("DPA9 an expired deploy proof is refused", () => {
    const key = keypair();
    const { root } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    assert.equal(callDeploy(root, deployState([deployRecord({ key })]), { now: "2026-08-08T00:00:00.000Z" }).code, "DEPLOY-PROOF-EXPIRED");
  });

  // DPA10 -- NARROWED, mirroring PPA2 on the release route: no anchor at all no longer
  // means "any verifying deploy proof authorizes and pins" -- only a key resolving to this
  // machine's own registered operator key does.
  check("DPA10 a first deploy signed by a key with no local-machine provenance is refused, not pinned", () => {
    const key = keypair();
    const { root } = fixture({ anchor: null });
    const result = callDeploy(root, deployState([deployRecord({ key })]));
    assert.equal(result.authorized, false);
    assert.equal(result.code, "DEPLOY-PROOF-TRUST-ANCHOR-MISSING");
    const written = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
    assert.equal(written.schema, "pipeline.critical-human-proof-policy.v1", "an unauthorized signer must never be written back as a trust anchor");
  });

  // DPA10B -- the real happy path, mirroring PPA2B on the release route: the machine's own
  // resolvable operator key still authorizes and pins a first deploy.
  check("DPA10B a first deploy signed by the machine's own resolvable operator key authorizes and pins it", () => {
    const key = keypair();
    const { root } = fixture({ anchor: null });
    const machinePlaneDeps = machinePlaneFixture(key);
    const result = callDeploy(root, deployState([deployRecord({ key })]), { machinePlaneDeps });
    assert.equal(result.code, "DEPLOY-PROOF-VERIFIED");
    assert.equal(result.authorized, true);
    const written = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
    assert.equal(written.schema, "pipeline.critical-human-proof-policy.v3");
    assert.deepEqual(written.trustAnchors, [{ keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 }]);
  });

  // DPA10A -- the pin restricts here too: a second, different key is refused once the
  // first deploy call has recorded one.
  check("DPA10A trust-on-first-use pins on the deploy route: a second call under a different key is refused after the first pins", () => {
    const first = keypair();
    const second = keypair();
    const { root } = fixture({ anchor: null });
    const machinePlaneDeps = machinePlaneFixture(first);
    const firstResult = callDeploy(root, deployState([deployRecord({ key: first })]), { machinePlaneDeps });
    assert.equal(firstResult.authorized, true);
    const secondResult = callDeploy(root, deployState([deployRecord({ key: second })]), { machinePlaneDeps });
    assert.equal(secondResult.authorized, false);
    assert.equal(secondResult.code, "DEPLOY-PROOF-TRUST-MISMATCH");
  });

  // DPA11 -- a push proof must not be spendable as a deploy proof.
  check("DPA11 a proof of another kind is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const pushed = approvalRecord({ key, threatModel });
    const entry = { forArtifact: ARTIFACT, forEnvironment: ENVIRONMENT, criticalProof: pushed.criticalProof };
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-KIND");
  });

  // DPA12 -- the two routes share one policy file: a key pinned by a push authorization
  // also governs the deploy route, so a different key is refused there too. This is the
  // design decision that trust-on-first-use is one shared mechanism, not a per-kind one.
  // The provenance gate only matters for the FIRST (anchor-less) call that does the
  // pinning; once pinned, membership governs regardless of the attacker key's provenance.
  check("DPA12 a key pinned by the push route also governs the deploy route (shared policy file)", () => {
    const pushed = keypair();
    const attacker = keypair();
    const { root, threatModel } = fixture({ anchor: null });
    const machinePlaneDeps = machinePlaneFixture(pushed);
    const pushResult = call(root, stateFor(approvalRecord({ key: pushed, threatModel })), { machinePlaneDeps });
    assert.equal(pushResult.authorized, true);
    const deployResult = callDeploy(root, deployState([deployRecord({ key: attacker })]));
    assert.equal(deployResult.authorized, false);
    assert.equal(deployResult.code, "DEPLOY-PROOF-TRUST-MISMATCH");
  });

  process.stdout.write(`\n${checks}/${checks} critical-action authorization checks passed\n`);
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
