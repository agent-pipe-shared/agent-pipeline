// RV-2 pins (Spec 20.3, "RV-2"): CAS-conflict classification of a legacy
// session-cleanup receipt requires matching bounded status/schema/digest AND
// matching compare flags; a mismatch or an ambiguity preserves the bytes and
// returns a typed unavailable result. Classification never writes.
//
// QG-04 RED pin (slice S3, "classify-only"; design note
// specs/sprint-alfred-epic/design/recovery-availability-rv-2026-10-08.md, Q4
// option B): `./legacy-owner-custody.mjs` does not exist yet, so this file fails
// at import. That is the deliverable of this commit.
//
// Receipt field names are the REAL ones the lifecycle code uses, not inventions:
//   - schema constant `CLEANUP_RECEIPT_SCHEMA` = "pipeline.session-cleanup-receipt.v1"
//     (worktree-lifecycle.mjs line 45);
//   - receipt keys `schema, sessionSha256, status, counts, outcomes, completedAt`
//     (sanitizedCleanupReceipt, worktree-lifecycle.mjs 1689-1711); the status
//     values the code writes are "complete" and "blocked" (1738, 1783, 1813);
//   - `sessionSha256` is sha256 of the UTF-8 session ID (1700);
//   - location `<local-root>/session-cleanup/receipts/<sessionId>.json`
//     (cleanupReceiptPath, 1207-1210);
//   - the closure check that already compares schema, sessionSha256 and
//     status === "complete" (inspectSessionClosure, 1230-1238).
// What the code does NOT have is a "compare flag" field: no receipt, descriptor
// or plan carries one. Spec 1158-1159 asks the classifier to COLLECT matching
// compare flags next to the status/schema/digest data, so the flags below are
// part of the NEW module's input contract (defined by these pins), not a
// pre-existing field.
//
// Contract pinned here (synchronous, never throws for a classification outcome):
//   classifyLegacyReceipt({ receiptsDirectory, sessionId, compare }) -> result
//   - receiptsDirectory: the `session-cleanup/receipts` directory of one local root;
//   - candidate receipts for the session: the entry `<sessionId>.json` plus any
//     other entry whose name starts with `<sessionId>.` (for example a `.bak`
//     snapshot); entries of other sessions are not candidates;
//   - compare: { statusMatches, schemaMatches, digestMatches }, booleans the
//     caller collected from an independent comparison; ALL must be exactly true;
//   - matching  -> { classification: "matching", mutated: false };
//   - otherwise -> { status: "unavailable", code: <LOC- code>, mutated: false }.
//
// Closed LOC- (legacy owner custody) code set for the RV-7 refusal registry:
//   LOC-STATUS-MISMATCH       receipt status is not the expected one
//   LOC-SCHEMA-MISMATCH       receipt schema is not the expected one
//   LOC-DIGEST-MISMATCH       receipt sessionSha256 is not sha256(sessionId)
//   LOC-COMPARE-FLAG-FALSE    a supplied compare flag is false
//   LOC-COMPARE-FLAG-MISSING  a required compare flag is absent (ambiguity)
//   LOC-FIELD-MISSING         a required receipt field is absent (ambiguity)
//   LOC-RECEIPT-AMBIGUOUS     two or more candidate receipts for one session
//
// RV-3 (slice S4) extends the closed LOC- set with four detached-proof codes
// (see the "RV-3: ..." block at the end of this file):
//   LOC-PROOF-BINDING-MISMATCH  a bound field differs from what the proof signed
//   LOC-PROOF-SIGNER-MISMATCH   the proof is signed by a key other than the anchor
//   LOC-PROOF-INVALID           the proof envelope is malformed
//   LOC-SESSION-NOT-ENDED       the builder was not given sessionEnded === true
const RV2_CODES = Object.freeze({
  statusMismatch: "LOC-STATUS-MISMATCH",
  schemaMismatch: "LOC-SCHEMA-MISMATCH",
  digestMismatch: "LOC-DIGEST-MISMATCH",
  compareFlagFalse: "LOC-COMPARE-FLAG-FALSE",
  compareFlagMissing: "LOC-COMPARE-FLAG-MISSING",
  fieldMissing: "LOC-FIELD-MISSING",
  receiptAmbiguous: "LOC-RECEIPT-AMBIGUOUS",
});
const RV3_CODES = Object.freeze({
  bindingMismatch: "LOC-PROOF-BINDING-MISMATCH",
  signerMismatch: "LOC-PROOF-SIGNER-MISMATCH",
  proofInvalid: "LOC-PROOF-INVALID",
  sessionNotEnded: "LOC-SESSION-NOT-ENDED",
});

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { after, before, describe, test } from "node:test";

import { CLEANUP_RECEIPT_SCHEMA } from "./worktree-lifecycle.mjs";
import { classifyLegacyReceipt } from "./legacy-owner-custody.mjs";
import {
  canonical,
  createPoApprovalIntent,
  PO_APPROVAL_PROOF_SCHEMA,
  verifyPoApprovalProof,
} from "./po-approval-proof.mjs";

const SESSION_ID = "legacy-session-01";
const OTHER_SESSION_ID = "legacy-session-02";
const COMPARE_FLAGS = Object.freeze(["statusMatches", "schemaMatches", "digestMatches"]);

function sha256Of(text) {
  return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

/** The shape sanitizedCleanupReceipt() writes for a session with no resources. */
function validReceipt(sessionId = SESSION_ID) {
  return {
    schema: CLEANUP_RECEIPT_SCHEMA,
    sessionSha256: sha256Of(sessionId),
    status: "complete",
    counts: { registered: 0, removed: 0, blocked: 0 },
    outcomes: [],
    completedAt: "2026-10-01T12:00:00.000Z",
  };
}

function allTrueFlags() {
  return Object.fromEntries(COMPARE_FLAGS.map((flag) => [flag, true]));
}

/** Recursive listing: relative path -> { bytes | null for a directory, size, mtimeMs }. */
function snapshot(root) {
  const entries = new Map();
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const key = relative(root, full).split(sep).join("/");
      const info = lstatSync(full);
      if (info.isDirectory()) {
        entries.set(key, { bytes: null, size: null, mtimeMs: null });
        walk(full);
      } else {
        entries.set(key, { bytes: readFileSync(full), size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  };
  walk(root);
  return entries;
}

function assertSnapshotsIdentical(listingBefore, listingAfter, label) {
  assert.deepStrictEqual([...listingAfter.keys()], [...listingBefore.keys()], `${label}: the directory listing changed`);
  for (const [key, was] of listingBefore) {
    const now = listingAfter.get(key);
    if (was.bytes === null) {
      assert.equal(now.bytes, null, `${label}: ${key} stopped being a directory`);
      continue;
    }
    assert.ok(Buffer.isBuffer(now.bytes) && was.bytes.equals(now.bytes), `${label}: bytes of ${key} changed`);
    assert.equal(now.size, was.size, `${label}: size of ${key} changed`);
    assert.equal(now.mtimeMs, was.mtimeMs, `${label}: ${key} was rewritten (mtime changed)`);
  }
}

describe("RV-2: legacy receipt CAS-conflict classification", () => {
  let root;
  let counter = 0;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "rv2-legacy-owner-custody-"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** A fresh receipts directory; `files` maps entry name -> object (JSON) or string. */
  function fixture(files) {
    counter += 1;
    const receiptsDirectory = join(root, `case-${counter}`, "session-cleanup", "receipts");
    mkdirSync(receiptsDirectory, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(receiptsDirectory, name), typeof content === "string" ? content : `${JSON.stringify(content)}\n`);
    }
    return { receiptsDirectory, caseRoot: join(root, `case-${counter}`) };
  }

  function classify(receiptsDirectory, overrides = {}) {
    return classifyLegacyReceipt({
      receiptsDirectory,
      sessionId: SESSION_ID,
      compare: allTrueFlags(),
      ...overrides,
    });
  }

  /** Run a classification that must be typed-unavailable and leave every byte alone. */
  function assertUnavailableAndUntouched({ receiptsDirectory, caseRoot }, expectedCode, overrides = {}) {
    const bytesBefore = snapshot(caseRoot);
    const result = classify(receiptsDirectory, overrides);
    const bytesAfter = snapshot(caseRoot);
    assert.equal(result.status, "unavailable");
    assert.equal(result.code, expectedCode);
    assert.ok(Object.values(RV2_CODES).includes(result.code), `${result.code} is outside the closed LOC- set`);
    assert.match(result.code, /^LOC-/u);
    assert.equal(result.mutated, false);
    assert.notEqual(result.classification, "matching", "a mismatch or ambiguity must never classify as matching");
    assertSnapshotsIdentical(bytesBefore, bytesAfter, expectedCode);
    return result;
  }

  test("RV-2: matching status, schema and digest with all compare flags true classifies as matching", () => {
    const f = fixture({ [`${SESSION_ID}.json`]: validReceipt() });
    const bytesBefore = snapshot(f.caseRoot);
    const result = classify(f.receiptsDirectory);
    assert.equal(result.classification, "matching");
    assert.equal(result.mutated, false);
    assert.notEqual(result.status, "unavailable");
    assertSnapshotsIdentical(bytesBefore, snapshot(f.caseRoot), "matching");
  });

  test("RV-2: a receipt of another session in the same directory is not a candidate and does not break matching", () => {
    const f = fixture({
      [`${SESSION_ID}.json`]: validReceipt(),
      [`${OTHER_SESSION_ID}.json`]: validReceipt(OTHER_SESSION_ID),
      // Shares the session ID as a plain string prefix but is a different session.
      [`${SESSION_ID}0.json`]: validReceipt(`${SESSION_ID}0`),
    });
    const bytesBefore = snapshot(f.caseRoot);
    const result = classify(f.receiptsDirectory);
    assert.equal(result.classification, "matching");
    assert.equal(result.mutated, false);
    assertSnapshotsIdentical(bytesBefore, snapshot(f.caseRoot), "neighbour sessions");
  });

  test("RV-2: a status mismatch returns typed unavailable and preserves the bytes", () => {
    const f = fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), status: "blocked" } });
    assertUnavailableAndUntouched(f, RV2_CODES.statusMismatch);
  });

  test("RV-2: a schema mismatch returns typed unavailable and preserves the bytes", () => {
    const f = fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), schema: "pipeline.session-cleanup-receipt.v0" } });
    assertUnavailableAndUntouched(f, RV2_CODES.schemaMismatch);
  });

  test("RV-2: a digest mismatch returns typed unavailable and preserves the bytes", () => {
    const f = fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), sessionSha256: sha256Of(OTHER_SESSION_ID) } });
    assertUnavailableAndUntouched(f, RV2_CODES.digestMismatch);
  });

  for (const flag of COMPARE_FLAGS) {
    test(`RV-2: compare flag ${flag}=false returns typed unavailable and preserves the bytes`, () => {
      const f = fixture({ [`${SESSION_ID}.json`]: validReceipt() });
      assertUnavailableAndUntouched(f, RV2_CODES.compareFlagFalse, { compare: { ...allTrueFlags(), [flag]: false } });
    });
  }

  for (const field of ["schema", "status", "sessionSha256"]) {
    test(`RV-2: ambiguity - required receipt field ${field} missing returns typed unavailable and preserves the bytes`, () => {
      const receipt = validReceipt();
      delete receipt[field];
      const f = fixture({ [`${SESSION_ID}.json`]: receipt });
      assertUnavailableAndUntouched(f, RV2_CODES.fieldMissing);
    });
  }

  for (const flag of COMPARE_FLAGS) {
    test(`RV-2: ambiguity - compare flag ${flag} absent returns typed unavailable and preserves the bytes`, () => {
      const f = fixture({ [`${SESSION_ID}.json`]: validReceipt() });
      const compare = allTrueFlags();
      delete compare[flag];
      assertUnavailableAndUntouched(f, RV2_CODES.compareFlagMissing, { compare });
    });
  }

  test("RV-2: ambiguity - two identical candidate receipts for one session return typed unavailable and preserve the bytes", () => {
    // A valid matching receipt plus a `.bak` snapshot: ambiguity outranks matching.
    const f = fixture({
      [`${SESSION_ID}.json`]: validReceipt(),
      [`${SESSION_ID}.json.bak`]: validReceipt(),
    });
    assertUnavailableAndUntouched(f, RV2_CODES.receiptAmbiguous);
  });

  test("RV-2: ambiguity - two conflicting candidate receipts for one session return typed unavailable and preserve the bytes", () => {
    const f = fixture({
      [`${SESSION_ID}.json`]: validReceipt(),
      [`${SESSION_ID}.json.bak`]: { ...validReceipt(), status: "blocked" },
    });
    assertUnavailableAndUntouched(f, RV2_CODES.receiptAmbiguous);
  });

  test("RV-2: classification never writes - listing, bytes, sizes and mtimes are identical after every call", () => {
    // One sweep root holding every scenario above, classified repeatedly.
    const scenarios = [
      fixture({ [`${SESSION_ID}.json`]: validReceipt() }),
      fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), status: "blocked" } }),
      fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), schema: "pipeline.session-cleanup-receipt.v0" } }),
      fixture({ [`${SESSION_ID}.json`]: { ...validReceipt(), sessionSha256: sha256Of(OTHER_SESSION_ID) } }),
      fixture({ [`${SESSION_ID}.json`]: { schema: CLEANUP_RECEIPT_SCHEMA } }),
      fixture({ [`${SESSION_ID}.json`]: validReceipt(), [`${SESSION_ID}.json.bak`]: validReceipt() }),
      fixture({ [`${SESSION_ID}.json`]: "{ not json at all" }),
      fixture({}),
    ];
    const missingReceiptsDirectory = join(root, "never-created", "session-cleanup", "receipts");
    const sweepBefore = snapshot(root);
    const compareVariants = [
      allTrueFlags(),
      { ...allTrueFlags(), digestMatches: false },
      { statusMatches: true },
      {},
    ];
    // The outcome for malformed/empty/absent inputs is pinned by later slices
    // (RV-4); this sweep only requires that no call writes. A thrown refusal is
    // tolerated there (null result); a returned result must say mutated: false.
    const callAndCheck = (receiptsDirectory, overrides) => {
      let result = null;
      try {
        result = classify(receiptsDirectory, overrides);
      } catch {
        result = null;
      }
      if (result !== null) assert.equal(result.mutated, false);
    };
    for (const scenario of scenarios) {
      for (const compare of compareVariants) {
        for (let repeat = 0; repeat < 2; repeat += 1) callAndCheck(scenario.receiptsDirectory, { compare });
      }
    }
    callAndCheck(missingReceiptsDirectory, {});
    assertSnapshotsIdentical(sweepBefore, snapshot(root), "sweep");
    assert.equal(existsSync(join(root, "never-created")), false, "classification created a directory for an absent receipts path");
  });
});

// ===========================================================================
// RV-3 pins (Spec 20.3, "RV-3"; design note Q2, slice S4): the detached human
// proof binds the exact receipt bytes (as sha256 + size) or explicit absence,
// the repository, the classification/comparison, the disposition, the
// session-ended confirmation and the CAS precondition. Change any one of them
// after signing and the proof stops verifying.
//
// QG-04 RED pin: `./legacy-owner-custody.mjs` exists (RV-2) but does not export
// `buildLegacyCustodyAuthorization` or `verifyLegacyCustodyProof` yet. A static
// named import of a missing export would break the whole file at link time and
// take the 17 RV-2 cases down with it, so the RV-3 block imports them
// dynamically, one export at a time, inside each case. The RV-3 cases that call
// them fail with a message naming the missing export; that is the deliverable.
//
// Contract pinned here (both functions synchronous):
//   buildLegacyCustodyAuthorization({ repository, receipt, classification,
//       disposition, sessionEnded, casPrecondition }) -> package
//     package = { schema: "pipeline.legacy-custody-authorization.v1",
//                 repository, receipt, classification, disposition,
//                 sessionEnded: true, casPrecondition }   (no other keys)
//     - receipt is { sha256, size } or { absent: true }; never the bytes (the
//       receipt is owner-private; the package binds a digest and a length);
//     - repository is { commit, tree } (design note Q2, option A: the git
//       root-commit OID and its tree, as createPoApprovalIntent's `candidate`);
//     - sessionEnded must be exactly `true`; anything else returns the typed
//       refusal { ok: false, code: "LOC-SESSION-NOT-ENDED" } and no package;
//     - the inputs are not mutated.
//   verifyLegacyCustodyProof({ package, proof, anchor }) -> { ok: true } |
//       { ok: false, code }
//     - proof is the real `pipeline.po-approval-proof.v1` envelope
//       (po-approval-proof.mjs): { schema, intentSha256, keyReference,
//       publicKey, signatureBase64 }, an Ed25519 signature over the UTF-8 hex
//       intent sha;
//     - anchor is the externally supplied trust policy
//       { keyReference, publicKeySha256 }; it is never read from the proof;
//     - the signed intent is derived from the package ALONE (custodyIntentFor()
//       below is the pinned derivation): kind "legacy-custody", subjectSha256 =
//       sha256(canonical(package)), candidate = package.repository, decision =
//       package.disposition. Nothing else is needed to verify;
//     - each case below exercises ONE defect, so no precedence between the
//       codes is pinned:
//         malformed envelope                              -> LOC-PROOF-INVALID
//         well-formed envelope, intentSha256 differs from
//           the intent derived from the package           -> LOC-PROOF-BINDING-MISMATCH
//         embedded public key is not the anchor's         -> LOC-PROOF-SIGNER-MISMATCH
// Key material is generated in-process; no real key directory is read.
// ===========================================================================
const RV3_SCHEMA = "pipeline.legacy-custody-authorization.v1";
const RV3_DOMAIN_SHA256 = sha256Of(RV3_SCHEMA);

/** Present-receipt inputs: a conflicting receipt, archived by signed disposition. */
function rv3PresentInputs() {
  const receiptBytes = JSON.stringify({ ...validReceipt(), status: "blocked" });
  return {
    repository: { commit: sha256Of("rv3-root-commit").slice(0, 40), tree: sha256Of("rv3-root-tree").slice(0, 40) },
    receipt: { sha256: sha256Of(receiptBytes), size: Buffer.byteLength(receiptBytes) },
    classification: {
      classification: "conflicting",
      compare: { statusMatches: false, schemaMatches: true, digestMatches: true },
    },
    disposition: "archive",
    sessionEnded: true,
    casPrecondition: { receiptPath: `${SESSION_ID}.json`, expectedState: "present" },
  };
}

/** Absent-receipt inputs: explicit absence, bound without fabricating a digest. */
function rv3AbsentInputs() {
  return {
    ...rv3PresentInputs(),
    receipt: { absent: true },
    classification: { classification: "absent" },
    disposition: "bind-absence",
    casPrecondition: { receiptPath: `${SESSION_ID}.json`, expectedState: "absent" },
  };
}

/** The package the builder must produce for `inputs`, spelled out by hand so the verify cases do not depend on the builder. */
function rv3Package(inputs) {
  return { schema: RV3_SCHEMA, ...structuredClone(inputs) };
}

function rv3Signer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    privateKey,
    publicKeyPem,
    anchor: { keyReference: "rv3-fixture-key", publicKeySha256: sha256Of(publicKeyPem) },
  };
}

/** The pinned intent derivation: a pure function of the package. */
function custodyIntentFor(pkg) {
  return createPoApprovalIntent({
    kind: "legacy-custody",
    featureId: "legacy-custody",
    planSha256: RV3_DOMAIN_SHA256,
    specSha256: RV3_DOMAIN_SHA256,
    candidate: pkg.repository,
    policyRevision: "legacy-custody-v1",
    subjectSha256: sha256Of(canonical(pkg)),
    decision: pkg.disposition,
  });
}

/** Signs with the real po-approval-proof envelope and recipe (Ed25519 over the UTF-8 hex intent sha). */
function signCustodyPackage(pkg, signer, { keyReference = signer.anchor.keyReference } = {}) {
  const intent = custodyIntentFor(pkg);
  return {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference,
    publicKey: signer.publicKeyPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), signer.privateKey).toString("base64"),
  };
}

/** Dynamic, per-export import: a missing export fails only the cases that need it. */
async function rv3Export(name) {
  const mod = await import("./legacy-owner-custody.mjs");
  assert.equal(
    typeof mod[name],
    "function",
    `legacy-owner-custody.mjs does not export ${name}() yet (RV-3 RED pin, slice S4)`,
  );
  return mod[name];
}

function assertRefusal(result, code, label) {
  assert.equal(result?.ok, false, `${label}: expected a refusal, got ${JSON.stringify(result)}`);
  assert.equal(result.code, code, `${label}: wrong refusal code`);
}

describe("RV-3: detached human proof binds the legacy custody authorization", () => {
  const signer = rv3Signer();
  const stranger = rv3Signer();
  const anchor = signer.anchor;

  test("RV-3: fixture guard - the signing helper emits an envelope the real po-approval-proof verifier accepts", () => {
    // Keeps the RED cases honest: if this fixture were malformed, every verify
    // case would be red for the wrong reason.
    const pkg = rv3Package(rv3PresentInputs());
    const result = verifyPoApprovalProof({
      intent: custodyIntentFor(pkg),
      trustPolicy: anchor,
      proof: signCustodyPackage(pkg, signer),
    });
    assert.equal(result.verified, true, `fixture proof rejected: ${result.code}`);
  });

  test("RV-3: builder emits the canonical package for a present receipt - sha256 and size, never bytes - and does not mutate its inputs", async () => {
    const build = await rv3Export("buildLegacyCustodyAuthorization");
    const inputs = rv3PresentInputs();
    const untouched = structuredClone(inputs);
    const pkg = build(inputs);
    assert.deepStrictEqual(pkg, rv3Package(untouched));
    assert.equal(pkg.schema, RV3_SCHEMA);
    assert.deepStrictEqual(Object.keys(pkg.receipt).sort(), ["sha256", "size"]);
    assert.deepStrictEqual(inputs, untouched, "the builder mutated its inputs");
  });

  test("RV-3: builder binds explicit absence as { absent: true } without fabricating a digest or size", async () => {
    const build = await rv3Export("buildLegacyCustodyAuthorization");
    const pkg = build(rv3AbsentInputs());
    assert.deepStrictEqual(pkg, rv3Package(rv3AbsentInputs()));
    assert.deepStrictEqual(pkg.receipt, { absent: true });
  });

  for (const [form, inputs] of [
    ["present receipt", rv3PresentInputs],
    ["explicit absence", rv3AbsentInputs],
  ]) {
    test(`RV-3: a valid proof over the package verifies - ${form}`, async () => {
      const verify = await rv3Export("verifyLegacyCustodyProof");
      const pkg = rv3Package(inputs());
      const result = verify({ package: pkg, proof: signCustodyPackage(pkg, signer), anchor });
      assert.equal(result.ok, true, `valid proof refused: ${JSON.stringify(result)}`);
    });
  }

  test("RV-3: a valid proof over a builder-produced package verifies end to end", async () => {
    const build = await rv3Export("buildLegacyCustodyAuthorization");
    const verify = await rv3Export("verifyLegacyCustodyProof");
    const pkg = build(rv3PresentInputs());
    const result = verify({ package: pkg, proof: signCustodyPackage(pkg, signer), anchor });
    assert.equal(result.ok, true, `valid proof refused: ${JSON.stringify(result)}`);
  });

  // One case per bound field. Each row signs `base()`, mutates a clone of the
  // signed package, and verifies the clone against the ORIGINAL proof.
  const BINDING_ROWS = [
    ["receipt sha256", rv3PresentInputs, (p) => { p.receipt.sha256 = sha256Of("tampered receipt bytes"); }],
    ["receipt size", rv3PresentInputs, (p) => { p.receipt.size += 1; }],
    ["absence flag flipped (present receipt -> absent)", rv3PresentInputs, (p) => { p.receipt = { absent: true }; }],
    [
      "absence flag flipped (absent -> present receipt)",
      rv3AbsentInputs,
      (p) => { p.receipt = { sha256: sha256Of("fabricated receipt bytes"), size: 42 }; },
    ],
    ["repository commit", rv3PresentInputs, (p) => { p.repository.commit = sha256Of("another-root-commit").slice(0, 40); }],
    ["repository tree", rv3PresentInputs, (p) => { p.repository.tree = sha256Of("another-root-tree").slice(0, 40); }],
    ["classification", rv3PresentInputs, (p) => { p.classification.classification = "matching"; }],
    ["comparison flag", rv3PresentInputs, (p) => { p.classification.compare.statusMatches = true; }],
    ["disposition", rv3PresentInputs, (p) => { p.disposition = "replay"; }],
    ["sessionEnded set to false", rv3PresentInputs, (p) => { p.sessionEnded = false; }],
    ["casPrecondition", rv3PresentInputs, (p) => { p.casPrecondition.expectedState = "absent"; }],
  ];
  for (const [field, inputs, mutate] of BINDING_ROWS) {
    test(`RV-3: changing the bound field after signing refuses with LOC-PROOF-BINDING-MISMATCH - ${field}`, async () => {
      const verify = await rv3Export("verifyLegacyCustodyProof");
      const signed = rv3Package(inputs());
      const proof = signCustodyPackage(signed, signer);
      assert.equal(verify({ package: signed, proof, anchor }).ok, true, "control: the untouched package must verify first");
      const tampered = structuredClone(signed);
      mutate(tampered);
      assert.notDeepStrictEqual(tampered, signed, "the row did not change the package");
      assertRefusal(verify({ package: tampered, proof, anchor }), RV3_CODES.bindingMismatch, field);
    });
  }

  test("RV-3: a proof signed by a key other than the anchor refuses with LOC-PROOF-SIGNER-MISMATCH", async () => {
    const verify = await rv3Export("verifyLegacyCustodyProof");
    const pkg = rv3Package(rv3PresentInputs());
    // The stranger signs the UNCHANGED package and claims the anchor's key
    // reference, so the only defect is whose key it is.
    const proof = signCustodyPackage(pkg, stranger, { keyReference: anchor.keyReference });
    assertRefusal(verify({ package: pkg, proof, anchor }), RV3_CODES.signerMismatch, "stranger key");
  });

  const validSample = signCustodyPackage(rv3Package(rv3PresentInputs()), signer);
  const MALFORMED_ENVELOPES = [
    ["null", () => null],
    ["undefined", () => undefined],
    ["a string", () => "not-an-envelope"],
    ["an array", () => []],
    ["an empty object", () => ({})],
    ["missing signatureBase64", () => { const { signatureBase64: _s, ...rest } = validSample; return rest; }],
    ["missing publicKey", () => { const { publicKey: _p, ...rest } = validSample; return rest; }],
    ["an extra key", () => ({ ...validSample, note: "unsigned" })],
    ["the wrong envelope schema", () => ({ ...validSample, schema: "pipeline.po-approval-proof.v0" })],
    ["an empty signature", () => ({ ...validSample, signatureBase64: "" })],
    ["a non-string signature", () => ({ ...validSample, signatureBase64: 12345 })],
  ];
  for (const [label, makeProof] of MALFORMED_ENVELOPES) {
    test(`RV-3: a malformed envelope refuses with LOC-PROOF-INVALID - ${label}`, async () => {
      const verify = await rv3Export("verifyLegacyCustodyProof");
      assertRefusal(verify({ package: rv3Package(rv3PresentInputs()), proof: makeProof(), anchor }), RV3_CODES.proofInvalid, label);
    });
  }

  test("RV-3: a proof whose signature bytes are corrupted never verifies", async () => {
    const verify = await rv3Export("verifyLegacyCustodyProof");
    const pkg = rv3Package(rv3PresentInputs());
    const proof = signCustodyPackage(pkg, signer);
    const bytes = Buffer.from(proof.signatureBase64, "base64");
    bytes[0] ^= 0xff;
    const result = verify({ package: pkg, proof: { ...proof, signatureBase64: bytes.toString("base64") }, anchor });
    assert.equal(result?.ok, false, `corrupted signature accepted: ${JSON.stringify(result)}`);
    assert.match(String(result.code), /^LOC-PROOF-/u, "a corrupted signature must refuse with a LOC-PROOF- code");
  });

  // sessionEnded is the human's confirmation that the owning session is over;
  // anything but the boolean true must be refused at build time, not coerced.
  const NOT_ENDED_VALUES = [
    ["false", { sessionEnded: false }],
    ["undefined", { sessionEnded: undefined }],
    ["absent", {}],
    ["null", { sessionEnded: null }],
    ["the string 'true'", { sessionEnded: "true" }],
    ["the number 1", { sessionEnded: 1 }],
  ];
  for (const [label, override] of NOT_ENDED_VALUES) {
    test(`RV-3: sessionEnded that is not exactly true refuses at build time with LOC-SESSION-NOT-ENDED - ${label}`, async () => {
      const build = await rv3Export("buildLegacyCustodyAuthorization");
      const inputs = rv3PresentInputs();
      delete inputs.sessionEnded;
      Object.assign(inputs, override);
      const result = build(inputs);
      assertRefusal(result, RV3_CODES.sessionNotEnded, label);
      assert.equal(Object.hasOwn(result, "schema"), false, "a refusal must not carry a package");
    });
  }
});
