// RV-4 pins (Spec 20.3, "RV-4", spec.md 1207-1211; design note
// specs/sprint-alfred-epic/design/recovery-availability-rv-2026-10-08.md, slice
// S5 "RV-4 replay/archive"): a valid matching receipt keeps its exact bytes and
// metadata and replays only with the full actual replay preconditions; a valid
// conflicting receipt and a bounded, readable invalid/malformed receipt are
// archived ONLY by a signed disposition; an absent receipt binds absence without
// fabricating anything; an unreadable, symlinked or ambiguous target returns a
// typed unavailable result. Every refusal and every unavailable result mutates
// nothing.
//
// QG-04 RED pin (test-only commit, new file by design: the sibling
// `legacy-owner-custody.test.mjs` belongs to the RV-3 slice and is not touched
// here): `./legacy-owner-custody.mjs` does not export
// `applyLegacyCustodyDisposition` yet. A static named import of a missing export
// would break this whole file at link time, so every case imports it
// dynamically (rv4Export) and fails with a message naming the missing export;
// that is the deliverable. The single fixture-guard case does not need it and
// stays green, so a red file never hides a broken fixture.
//
// Contract pinned here (the function may be sync or async; the cases await it;
// it returns a typed result for every outcome below and never throws for one):
//   applyLegacyCustodyDisposition({ receiptsDirectory, sessionId, package,
//       proof, anchor, archiveRoot }) -> result
//   - package/proof/anchor are exactly the RV-3 values: the
//     `pipeline.legacy-custody-authorization.v1` package and the real
//     `pipeline.po-approval-proof.v1` envelope over it, and the external
//     { keyReference, publicKeySha256 } anchor. The apply path verifies the
//     proof (verifyLegacyCustodyProof) BEFORE it touches any byte;
//   - the target is `<receiptsDirectory>/<sessionId>.json`; candidates are that
//     entry plus any `<sessionId>.*` entry (RV-2 rule, e.g. a `.bak` snapshot);
//   - result shapes (all carry `mutated`):
//       preserve a matching receipt  -> { status: "preserved",      mutated: false }
//       signed archive               -> { status: "archived",       mutated: true  }
//       signed bind-absence          -> { status: "absence-bound",  mutated: false }
//       defective proof              -> { status: "refused",     code: <RV-3 code>, mutated: false }
//       unsafe/ambiguous/unmet       -> { status: "unavailable", code: <LOC- code>, mutated: false }
//   - archive layout MIRRORS the existing zero-authority primitive
//     `archiveOrphanSessionDescriptor` (worktree-lifecycle.mjs 1098-1181, paths
//     from orphanArchivePaths 953-960, exclusive publish 993-1023, append-only
//     audit 1025-1034): the bytes are published exclusively at
//     `<archiveRoot>/archived/<sessionId>.<receiptSha256>.json`, the readback
//     must equal the original bytes, one JSON line is appended to
//     `<archiveRoot>/legacy-custody-archive-audit.jsonl`, and only then is the
//     original name removed. No temp file may survive. The primitive itself is
//     descriptor-bound (repository discovery, owner-runtime eligibility, no
//     signature), so it is not callable for a receipt as is; the S5
//     implementation reuses its private mechanics (design note Q4 option B:
//     export the private helpers additively), these pins fix the observable
//     result;
//   - audit line fields pinned: `schema` (string), `sessionId`,
//     `receiptSha256`, `disposition` ("archive"), `archivedAt` (ISO date
//     string); further keys are not forbidden here.
// NOT pinned in this slice (named so they are not mistaken for covered): the
// positive replay path (its preconditions are an input the replay slice
// defines), receipt drift / concurrent writer / interrupted archive (RV-5), and
// State/proof/history byte-identity (RV-6).
//
// Closed LOC- additions for the RV-7 refusal registry (RV4_CODES below):
//   LOC-REPLAY-PRECONDITION  disposition "replay" without the full actual replay preconditions
//   LOC-TARGET-UNSAFE        the receipt target is a symlink or otherwise unsafe to read
//   LOC-RECEIPT-AMBIGUOUS    two or more candidate receipts for one session (pre-existing, RV-2)
const RV3_CODES = Object.freeze({
  bindingMismatch: "LOC-PROOF-BINDING-MISMATCH",
  signerMismatch: "LOC-PROOF-SIGNER-MISMATCH",
  proofInvalid: "LOC-PROOF-INVALID",
});
const RV4_CODES = Object.freeze({
  replayPrecondition: "LOC-REPLAY-PRECONDITION",
  targetUnsafe: "LOC-TARGET-UNSAFE",
  receiptAmbiguous: "LOC-RECEIPT-AMBIGUOUS",
});

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { after, before, describe, test } from "node:test";

import { CLEANUP_RECEIPT_SCHEMA } from "./worktree-lifecycle.mjs";
import {
  canonical,
  createPoApprovalIntent,
  PO_APPROVAL_PROOF_SCHEMA,
  verifyPoApprovalProof,
} from "./po-approval-proof.mjs";

const SESSION_ID = "legacy-session-01";
const OTHER_SESSION_ID = "legacy-session-02";
const AUDIT_NAME = "legacy-custody-archive-audit.jsonl";
// A fixed past timestamp on every fixture receipt, so a rewrite is visible even
// on a filesystem with coarse mtime granularity.
const OLD_TIME = new Date("2026-01-01T00:00:00.000Z");

function sha256Of(data) {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

/** The shape sanitizedCleanupReceipt() writes (mirrors RV-2 validReceipt in legacy-owner-custody.test.mjs 103-113). */
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

function conflictingReceipt(sessionId = SESSION_ID) {
  return { ...validReceipt(sessionId), status: "blocked" };
}

// --- Signing helpers: minimal copies of the RV-3 block of
// legacy-owner-custody.test.mjs (RV3_SCHEMA/RV3_DOMAIN_SHA256 371-372,
// rv3Signer 406-414, custodyIntentFor 416-428, signCustodyPackage 430-440). ---
const RV3_SCHEMA = "pipeline.legacy-custody-authorization.v1";
const RV3_DOMAIN_SHA256 = sha256Of(RV3_SCHEMA);

function rv4Signer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    privateKey,
    publicKeyPem,
    anchor: { keyReference: "rv4-fixture-key", publicKeySha256: sha256Of(publicKeyPem) },
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

// --- Package builders: hand-spelled (like rv3Package), so none of these cases
// depends on the RV-3 builder export. ---
const REPOSITORY = Object.freeze({
  commit: sha256Of("rv4-root-commit").slice(0, 40),
  tree: sha256Of("rv4-root-tree").slice(0, 40),
});

const CLASSIFICATIONS = Object.freeze({
  matching: { classification: "matching", compare: { statusMatches: true, schemaMatches: true, digestMatches: true } },
  conflicting: { classification: "conflicting", compare: { statusMatches: false, schemaMatches: true, digestMatches: true } },
  malformed: { classification: "malformed" },
  absent: { classification: "absent" },
});

/** Package binding the receipt's exact bytes as sha256 + size (never the bytes). */
function presentPackage(bytes, classification, disposition, { sessionId = SESSION_ID } = {}) {
  return {
    schema: RV3_SCHEMA,
    repository: { ...REPOSITORY },
    receipt: { sha256: sha256Of(bytes), size: Buffer.byteLength(bytes) },
    classification: structuredClone(CLASSIFICATIONS[classification]),
    disposition,
    sessionEnded: true,
    casPrecondition: { receiptPath: `${sessionId}.json`, expectedState: "present" },
  };
}

/** Package binding explicit absence without fabricating a digest or size. */
function absentPackage(disposition = "bind-absence", { sessionId = SESSION_ID } = {}) {
  return {
    schema: RV3_SCHEMA,
    repository: { ...REPOSITORY },
    receipt: { absent: true },
    classification: structuredClone(CLASSIFICATIONS.absent),
    disposition,
    sessionEnded: true,
    casPrecondition: { receiptPath: `${sessionId}.json`, expectedState: "absent" },
  };
}

// --- Snapshot helpers: copied from legacy-owner-custody.test.mjs 119-151 and
// extended so a symlink is recorded as a symlink (its link text), not followed. ---
function snapshot(root) {
  const entries = new Map();
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const key = relative(root, full).split(sep).join("/");
      const info = lstatSync(full);
      if (info.isSymbolicLink()) {
        entries.set(key, { link: readlinkSync(full), bytes: null, size: null, mtimeMs: info.mtimeMs });
      } else if (info.isDirectory()) {
        entries.set(key, { link: null, bytes: null, size: null, mtimeMs: null });
        walk(full);
      } else {
        entries.set(key, { link: null, bytes: readFileSync(full), size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  };
  walk(root);
  return entries;
}

function assertEntryUnchanged(was, now, label) {
  assert.ok(now !== undefined, `${label}: entry disappeared`);
  assert.equal(now.link, was.link, `${label}: symlink text changed`);
  if (was.link !== null) {
    assert.equal(now.mtimeMs, was.mtimeMs, `${label}: symlink was rewritten`);
    return;
  }
  if (was.bytes === null) {
    assert.equal(now.bytes, null, `${label}: stopped being a directory`);
    return;
  }
  assert.ok(Buffer.isBuffer(now.bytes) && was.bytes.equals(now.bytes), `${label}: bytes changed`);
  assert.equal(now.size, was.size, `${label}: size changed`);
  assert.equal(now.mtimeMs, was.mtimeMs, `${label}: rewritten (mtime changed)`);
}

function assertSnapshotsIdentical(listingBefore, listingAfter, label) {
  assert.deepStrictEqual([...listingAfter.keys()], [...listingBefore.keys()], `${label}: the directory listing changed`);
  for (const [key, was] of listingBefore) assertEntryUnchanged(was, listingAfter.get(key), `${label}: ${key}`);
}

/** Exactly these entries disappeared and appeared; every other entry is untouched. */
function assertChangeSet(before, after, { removed, added }, label) {
  assert.deepStrictEqual(
    [...before.keys()].filter((key) => !after.has(key)).sort(),
    [...removed].sort(),
    `${label}: removed entries differ`,
  );
  assert.deepStrictEqual(
    [...after.keys()].filter((key) => !before.has(key)).sort(),
    [...added].sort(),
    `${label}: added entries differ (a temp file may have survived)`,
  );
  for (const [key, was] of before) {
    if (!removed.includes(key)) assertEntryUnchanged(was, after.get(key), `${label}: ${key}`);
  }
}

function pathPresent(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/** Dynamic import: a missing export fails only the cases that need it. */
async function rv4Export() {
  const mod = await import("./legacy-owner-custody.mjs");
  assert.equal(
    typeof mod.applyLegacyCustodyDisposition,
    "function",
    "legacy-owner-custody.mjs does not export applyLegacyCustodyDisposition() yet (RV-4 RED pin, slice S5)",
  );
  return mod.applyLegacyCustodyDisposition;
}

function readAudit(archiveRoot) {
  const text = readFileSync(join(archiveRoot, AUDIT_NAME), "utf8");
  assert.ok(text === "" || text.endsWith("\n"), "the audit log must be newline-terminated JSONL");
  return { text, entries: text.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line)) };
}

describe("RV-4: legacy custody disposition - preserve, replay, archive, absence", () => {
  const signer = rv4Signer();
  const stranger = rv4Signer();
  const anchor = signer.anchor;
  let root;
  let counter = 0;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "rv4-legacy-custody-archive-"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * A fresh case root holding `session-cleanup/receipts/` (with `files`: name ->
   * object (JSON + newline), string, or Buffer) and an EXISTING EMPTY `archive/`
   * directory, so a stray write there is a visible listing change.
   */
  function fixture(files = {}) {
    counter += 1;
    const caseRoot = join(root, `case-${counter}`);
    const receiptsDirectory = join(caseRoot, "session-cleanup", "receipts");
    const archiveRoot = join(caseRoot, "archive");
    mkdirSync(receiptsDirectory, { recursive: true });
    mkdirSync(archiveRoot, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      const path = join(receiptsDirectory, name);
      writeFileSync(path, Buffer.isBuffer(content) || typeof content === "string" ? content : `${JSON.stringify(content)}\n`);
      utimesSync(path, OLD_TIME, OLD_TIME);
    }
    return { caseRoot, receiptsDirectory, archiveRoot, receiptPath: join(receiptsDirectory, `${SESSION_ID}.json`) };
  }

  async function apply(f, pkg, proof, overrides = {}) {
    const applyDisposition = await rv4Export();
    return applyDisposition({
      receiptsDirectory: f.receiptsDirectory,
      sessionId: SESSION_ID,
      package: pkg,
      proof,
      anchor,
      archiveRoot: f.archiveRoot,
      ...overrides,
    });
  }

  /** The call must come back typed, with this status and code, and must not have mutated a single byte. */
  async function assertTypedAndUntouched(f, run, { status, code, closedSet }, label) {
    const before = snapshot(f.caseRoot);
    const result = await run();
    assert.equal(result?.status, status, `${label}: expected status ${status}, got ${JSON.stringify(result)}`);
    assert.equal(result.code, code, `${label}: wrong code`);
    assert.match(result.code, /^LOC-/u, `${label}: code is outside the LOC- namespace`);
    assert.ok(Object.values(closedSet).includes(result.code), `${label}: ${result.code} is outside the closed set`);
    assert.equal(result.mutated, false, `${label}: a ${status} result must say mutated: false`);
    assertSnapshotsIdentical(before, snapshot(f.caseRoot), label);
    return result;
  }

  /** A signed archive that must have happened: byte-identical copy, original gone, one new audit line, nothing else changed. */
  function assertArchived(f, result, before, originalBytes, { sessionId = SESSION_ID, priorAuditText = "" } = {}) {
    const sha = sha256Of(originalBytes);
    assert.equal(result?.status, "archived", `expected archived, got ${JSON.stringify(result)}`);
    assert.equal(result.mutated, true);
    assert.equal(pathPresent(join(f.receiptsDirectory, `${sessionId}.json`)), false, "the original receipt name must be gone after a verified archive");
    const archivedName = `${sessionId}.${sha}.json`;
    const archivedPath = join(f.archiveRoot, "archived", archivedName);
    const info = lstatSync(archivedPath);
    assert.ok(info.isFile() && !info.isSymbolicLink(), "the archived copy must be a regular file");
    assert.ok(readFileSync(archivedPath).equals(originalBytes), "the archived readback must equal the original bytes");
    const { text, entries } = readAudit(f.archiveRoot);
    assert.ok(text.startsWith(priorAuditText), "the audit log is append-only: earlier lines must stay byte-identical");
    const priorLineCount = priorAuditText.split("\n").filter((row) => row !== "").length;
    assert.equal(entries.length, priorLineCount + 1, "exactly one audit line is appended");
    const appended = entries.at(-1);
    assert.equal(typeof appended.schema, "string", "the audit line must carry a schema");
    assert.equal(appended.sessionId, sessionId);
    assert.equal(appended.receiptSha256, sha);
    assert.equal(appended.disposition, "archive");
    assert.equal(typeof appended.archivedAt, "string");
    assert.ok(!Number.isNaN(Date.parse(appended.archivedAt)), "archivedAt must be an ISO date string");
    // Everything else is untouched. The audit log is judged above (append-only),
    // so it is dropped from both listings before the exact change-set check.
    const auditKey = `archive/${AUDIT_NAME}`;
    const withoutAudit = (listing) => new Map([...listing].filter(([key]) => key !== auditKey));
    const added = [`archive/archived/${archivedName}`];
    if (!before.has("archive/archived")) added.push("archive/archived");
    assertChangeSet(withoutAudit(before), withoutAudit(snapshot(f.caseRoot)), {
      removed: [`session-cleanup/receipts/${sessionId}.json`],
      added,
    }, "archive");
  }

  test("RV-4: fixture guard - the signing helper emits an envelope the real po-approval-proof verifier accepts", () => {
    // Keeps the RED cases honest: if this fixture were malformed, every case
    // below would be red for the wrong reason.
    for (const pkg of [
      presentPackage(Buffer.from("receipt-bytes"), "conflicting", "archive"),
      absentPackage(),
    ]) {
      const result = verifyPoApprovalProof({
        intent: custodyIntentFor(pkg),
        trustPolicy: anchor,
        proof: signCustodyPackage(pkg, signer),
      });
      assert.equal(result.verified, true, `fixture proof rejected: ${result.code}`);
    }
  });

  // 1. A valid matching receipt is preserved exactly: bytes, size and mtime.
  test("RV-4: matching receipt + disposition preserve keeps bytes and mtime exact and reports preserved", async () => {
    const f = fixture({ [`${SESSION_ID}.json`]: validReceipt() });
    const bytes = readFileSync(f.receiptPath);
    assert.equal(lstatSync(f.receiptPath).mtimeMs, OLD_TIME.getTime(), "fixture guard: the receipt mtime was pinned");
    const pkg = presentPackage(bytes, "matching", "preserve");
    const before = snapshot(f.caseRoot);
    const result = await apply(f, pkg, signCustodyPackage(pkg, signer));
    assert.equal(result?.status, "preserved", `expected preserved, got ${JSON.stringify(result)}`);
    assert.equal(result.mutated, false);
    assert.ok(readFileSync(f.receiptPath).equals(bytes), "the receipt bytes changed");
    assert.equal(lstatSync(f.receiptPath).mtimeMs, OLD_TIME.getTime(), "the receipt mtime changed");
    assertSnapshotsIdentical(before, snapshot(f.caseRoot), "preserve");
  });

  // 2. Replay needs the full actual replay preconditions; none are supplied here.
  test("RV-4: matching receipt + disposition replay without the replay preconditions returns typed unavailable LOC-REPLAY-PRECONDITION and keeps the bytes", async () => {
    const f = fixture({ [`${SESSION_ID}.json`]: validReceipt() });
    const bytes = readFileSync(f.receiptPath);
    // The signature is valid, so the missing preconditions are the only defect.
    const pkg = presentPackage(bytes, "matching", "replay");
    const proof = signCustodyPackage(pkg, signer);
    await assertTypedAndUntouched(
      f,
      () => apply(f, pkg, proof),
      { status: "unavailable", code: RV4_CODES.replayPrecondition, closedSet: RV4_CODES },
      "replay without preconditions",
    );
  });

  // 3. A conflicting receipt is archived by a valid signed archive disposition.
  test("RV-4: conflicting receipt + valid signed archive moves the receipt under archiveRoot byte-identically, removes the original and appends one audit line", async () => {
    const f = fixture({
      [`${SESSION_ID}.json`]: conflictingReceipt(),
      [`${OTHER_SESSION_ID}.json`]: validReceipt(OTHER_SESSION_ID),
    });
    const bytes = readFileSync(f.receiptPath);
    const pkg = presentPackage(bytes, "conflicting", "archive");
    const proof = signCustodyPackage(pkg, signer);
    const before = snapshot(f.caseRoot);
    assert.equal(readdirSync(f.archiveRoot).length, 0, "fixture guard: the archive root starts empty");
    const result = await apply(f, pkg, proof);
    assertArchived(f, result, before, bytes);
    // The neighbouring session's receipt is out of scope and stays exact (assertChangeSet checks bytes and mtime).
  });

  test("RV-4: a second archive appends to the audit log and never rewrites an earlier line", async () => {
    const f = fixture({
      [`${SESSION_ID}.json`]: conflictingReceipt(),
      [`${OTHER_SESSION_ID}.json`]: conflictingReceipt(OTHER_SESSION_ID),
    });
    const first = readFileSync(f.receiptPath);
    const firstPackage = presentPackage(first, "conflicting", "archive");
    const beforeFirst = snapshot(f.caseRoot);
    assertArchived(f, await apply(f, firstPackage, signCustodyPackage(firstPackage, signer)), beforeFirst, first);
    const priorAuditText = readAudit(f.archiveRoot).text;
    const secondPath = join(f.receiptsDirectory, `${OTHER_SESSION_ID}.json`);
    const second = readFileSync(secondPath);
    const secondPackage = presentPackage(second, "conflicting", "archive", { sessionId: OTHER_SESSION_ID });
    const beforeSecond = snapshot(f.caseRoot);
    const result = await apply(f, secondPackage, signCustodyPackage(secondPackage, signer), { sessionId: OTHER_SESSION_ID });
    assertArchived(f, result, beforeSecond, second, { sessionId: OTHER_SESSION_ID, priorAuditText });
  });

  // 4. A missing or invalid proof refuses with the RV-3 code and mutates nothing.
  const PROOF_DEFECTS = [
    ["no proof at all", RV3_CODES.proofInvalid, () => undefined],
    ["a null proof", RV3_CODES.proofInvalid, () => null],
    [
      "a proof signed by a key other than the anchor",
      RV3_CODES.signerMismatch,
      (pkg) => signCustodyPackage(pkg, stranger, { keyReference: anchor.keyReference }),
    ],
  ];
  for (const [label, code, makeProof] of PROOF_DEFECTS) {
    test(`RV-4: conflicting receipt + archive with ${label} refuses with ${code} and mutates nothing`, async () => {
      const f = fixture({ [`${SESSION_ID}.json`]: conflictingReceipt() });
      const pkg = presentPackage(readFileSync(f.receiptPath), "conflicting", "archive");
      const proof = makeProof(pkg);
      await assertTypedAndUntouched(
        f,
        () => apply(f, pkg, proof),
        { status: "refused", code, closedSet: RV3_CODES },
        label,
      );
    });
  }

  test("RV-4: conflicting receipt + archive whose package changed after signing refuses with LOC-PROOF-BINDING-MISMATCH and mutates nothing", async () => {
    const f = fixture({ [`${SESSION_ID}.json`]: conflictingReceipt() });
    const signed = presentPackage(readFileSync(f.receiptPath), "conflicting", "archive");
    const proof = signCustodyPackage(signed, signer);
    // The repository identity has no on-disk counterpart for the apply path to
    // contradict, so only the detached proof can notice this change.
    const tampered = structuredClone(signed);
    tampered.repository.tree = sha256Of("another-root-tree").slice(0, 40);
    assert.notDeepStrictEqual(tampered, signed, "fixture guard: the package was changed");
    await assertTypedAndUntouched(
      f,
      () => apply(f, tampered, proof),
      { status: "refused", code: RV3_CODES.bindingMismatch, closedSet: RV3_CODES },
      "tampered package",
    );
  });

  // 5. A bounded, readable, malformed receipt archives byte-identically - only with a signature.
  const MALFORMED_FORMS = [
    ["non-JSON text", () => "{ not json at all"],
    ["truncated JSON", () => `${JSON.stringify(validReceipt()).slice(0, 40)}`],
    ["binary garbage", () => Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x80, 0x0a, 0xc3, 0x28])],
  ];
  for (const [label, makeBytes] of MALFORMED_FORMS) {
    test(`RV-4: malformed receipt (${label}) + valid signed archive archives it byte-identically`, async () => {
      const f = fixture({ [`${SESSION_ID}.json`]: makeBytes() });
      const bytes = readFileSync(f.receiptPath);
      assert.ok(bytes.length > 0 && bytes.length < 4096, "fixture guard: the malformed receipt is bounded and readable");
      const pkg = presentPackage(bytes, "malformed", "archive");
      const before = snapshot(f.caseRoot);
      const result = await apply(f, pkg, signCustodyPackage(pkg, signer));
      assertArchived(f, result, before, bytes);
    });

    test(`RV-4: malformed receipt (${label}) + archive without a signature refuses with LOC-PROOF-INVALID and mutates nothing`, async () => {
      const f = fixture({ [`${SESSION_ID}.json`]: makeBytes() });
      const pkg = presentPackage(readFileSync(f.receiptPath), "malformed", "archive");
      await assertTypedAndUntouched(
        f,
        () => apply(f, pkg, undefined),
        { status: "refused", code: RV3_CODES.proofInvalid, closedSet: RV3_CODES },
        `unsigned ${label}`,
      );
    });
  }

  // 6. An absent receipt binds absence; nothing is fabricated.
  test("RV-4: absent receipt + package binding { absent: true } + signed disposition reports absence-bound and creates nothing at the receipt path", async () => {
    const f = fixture({});
    const pkg = absentPackage();
    assert.deepStrictEqual(pkg.receipt, { absent: true }, "fixture guard: no fabricated digest or size");
    assert.equal(pathPresent(f.receiptPath), false, "fixture guard: the receipt is absent");
    const before = snapshot(f.caseRoot);
    const result = await apply(f, pkg, signCustodyPackage(pkg, signer));
    assert.equal(result?.status, "absence-bound", `expected absence-bound, got ${JSON.stringify(result)}`);
    assert.equal(result.mutated, false);
    assert.equal(pathPresent(f.receiptPath), false, "a receipt was fabricated at the receipt path");
    assertSnapshotsIdentical(before, snapshot(f.caseRoot), "absence-bound");
  });

  // 7. Unsafe or ambiguous targets are typed unavailable and mutate nothing.
  test("RV-4: a symlinked receipt path returns typed unavailable LOC-TARGET-UNSAFE and mutates nothing", async (t) => {
    const f = fixture({});
    const real = join(f.caseRoot, "elsewhere", "real-receipt.json");
    mkdirSync(dirname(real), { recursive: true });
    writeFileSync(real, `${JSON.stringify(conflictingReceipt())}\n`);
    utimesSync(real, OLD_TIME, OLD_TIME);
    try {
      symlinkSync(real, f.receiptPath);
    } catch (error) {
      if (process.platform === "win32" && error?.code === "EPERM") {
        t.skip("win32 without symlink privilege: symlinkSync threw EPERM, so a symlinked receipt cannot be constructed here");
        return;
      }
      throw error;
    }
    assert.ok(lstatSync(f.receiptPath).isSymbolicLink(), "fixture guard: the receipt path is a symlink");
    // Valid signature over the target's bytes: the symlink is the only defect.
    const pkg = presentPackage(readFileSync(real), "conflicting", "archive");
    const proof = signCustodyPackage(pkg, signer);
    await assertTypedAndUntouched(
      f,
      () => apply(f, pkg, proof),
      { status: "unavailable", code: RV4_CODES.targetUnsafe, closedSet: RV4_CODES },
      "symlinked receipt",
    );
  });

  test("RV-4: two candidate receipts for one session return typed unavailable LOC-RECEIPT-AMBIGUOUS and mutate nothing", async () => {
    const f = fixture({
      [`${SESSION_ID}.json`]: conflictingReceipt(),
      [`${SESSION_ID}.json.bak`]: validReceipt(),
    });
    // Valid signature over the primary receipt: the second candidate is the only defect.
    const pkg = presentPackage(readFileSync(f.receiptPath), "conflicting", "archive");
    const proof = signCustodyPackage(pkg, signer);
    await assertTypedAndUntouched(
      f,
      () => apply(f, pkg, proof),
      { status: "unavailable", code: RV4_CODES.receiptAmbiguous, closedSet: RV4_CODES },
      "two candidates",
    );
  });
});
