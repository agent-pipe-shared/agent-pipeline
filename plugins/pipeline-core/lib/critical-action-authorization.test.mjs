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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
 */
function fixture({ anchor, threatModelBody = "# threat model\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "push-proof-"));
  roots.push(root);
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", "demo"), { recursive: true });
  writeFileSync(join(root, THREAT_MODEL_PATH), threatModelBody);
  const policy = { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push", "deploy", "publication"] };
  if (anchor !== null) policy.trustAnchor = anchor;
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify(policy, null, 2)}\n`);
  return {
    root,
    threatModel: { path: THREAT_MODEL_PATH, sha256: createHash("sha256").update(threatModelBody).digest("hex") },
  };
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

  // PPA2 -- no committed anchor means no verifiable key, and an unverifiable proof is
  // not a proof. This is what keeps the decision out of the mutable state file.
  check("PPA2 a policy without a trust anchor cannot authorize a raw push", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: null });
    const record = approvalRecord({ key, threatModel });
    assert.equal(call(root, stateFor(record)).code, "PUSH-PROOF-TRUST-ANCHOR-MISSING");
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

  // DPA10 -- no anchor, no verifiable key, on this route as on the other.
  check("DPA10 a policy without a trust anchor cannot authorize a deploy", () => {
    const key = keypair();
    const { root } = fixture({ anchor: null });
    assert.equal(callDeploy(root, deployState([deployRecord({ key })])).code, "DEPLOY-PROOF-TRUST-ANCHOR-MISSING");
  });

  // DPA11 -- a push proof must not be spendable as a deploy proof.
  check("DPA11 a proof of another kind is refused", () => {
    const key = keypair();
    const { root, threatModel } = fixture({ anchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 } });
    const pushed = approvalRecord({ key, threatModel });
    const entry = { forArtifact: ARTIFACT, forEnvironment: ENVIRONMENT, criticalProof: pushed.criticalProof };
    assert.equal(callDeploy(root, deployState([entry])).code, "DEPLOY-PROOF-KIND");
  });

  process.stdout.write(`\n${checks}/${checks} critical-action authorization checks passed\n`);
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
