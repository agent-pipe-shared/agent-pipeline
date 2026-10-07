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
const RV2_CODES = Object.freeze({
  statusMismatch: "LOC-STATUS-MISMATCH",
  schemaMismatch: "LOC-SCHEMA-MISMATCH",
  digestMismatch: "LOC-DIGEST-MISMATCH",
  compareFlagFalse: "LOC-COMPARE-FLAG-FALSE",
  compareFlagMissing: "LOC-COMPARE-FLAG-MISSING",
  fieldMissing: "LOC-FIELD-MISSING",
  receiptAmbiguous: "LOC-RECEIPT-AMBIGUOUS",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
