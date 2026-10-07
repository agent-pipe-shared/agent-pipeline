// SPDX-License-Identifier: SUL-1.0
// U2-T: RED tests for the ADR-0085 design review receipt module.
// Contract: the ADR-0085 U1-U3 API contract (plans/adr-0085-u1-u3-api-contract.md), sections 3 and 5 "U2"
// (tests 1-18, test 15 keeps nextRound null after a delta per section 6, PO-Q2 option b), plus the
// import rule from its header (U2 imports only node:crypto and canonical).
// design-review-receipt.mjs does not exist yet: this file fails on the missing module until it is built.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonical } from "./po-approval-proof.mjs";
import {
  DESIGN_REVIEW_MAX_ROUNDS,
  DESIGN_REVIEW_RECEIPT_MAX_BYTES,
  DESIGN_REVIEW_RECEIPT_SCHEMA,
  checkDesignReviewReceiptSources,
  createDesignReviewReceipt,
  parseDesignReviewReceipt,
  summarizeDesignReviewReceipt,
} from "./design-review-receipt.mjs";

// ---------------------------------------------------------------- fixture F

const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytesOf = (value) => Buffer.from(`${canonical(value)}\n`, "utf8");
const clone = (value) => structuredClone(value);
const refuse = (code) => ({ ok: false, code });

const FEATURE = "feat-x";
const PRD_PATH = "specs/feat-x/prd_feat-x.md";
const SPEC_PATH = "specs/feat-x/spec.md";
const DESIGN_PATH = "specs/feat-x/design.md";
const REQ_PATH = "specs/feat-x/spec.requirements.json";
const TRACE_PATH = "specs/feat-x/traceability.md";
const REPORT1_PATH = "specs/feat-x/review/design-review-1.md";
const REPORT2_PATH = "specs/feat-x/review/design-review-2.md";
const RECEIPT1_PATH = "specs/feat-x/review/design-review-1.receipt.json";
const RECEIPT2_PATH = "specs/feat-x/review/design-review-2.receipt.json";
const REVIEWED_AT = "2026-10-07T10:00:00.000Z";
const REVIEWER = { runner: "claude", model: "claude-opus-4-7" };

const SOURCES_1 = {
  prd: { path: PRD_PATH, sha256: sha("prd-1") },
  spec: { path: SPEC_PATH, sha256: sha("spec-1") },
  companions: [
    { path: DESIGN_PATH, sha256: sha("design-1") },
    { path: REQ_PATH, sha256: sha("req-1") },
    { path: TRACE_PATH, sha256: sha("trace-1") },
  ],
};
const SOURCES_2 = { ...clone(SOURCES_1), spec: { path: SPEC_PATH, sha256: sha("spec-2") } };
const REPORT_1 = { path: REPORT1_PATH, sha256: sha("report-1") };
const REPORT_2 = { path: REPORT2_PATH, sha256: sha("report-2") };

const RECEIPT_KEYS = [
  "featureId", "kind", "openFindingIds", "previousReceiptPath", "previousReceiptSha256", "report",
  "reviewedAt", "reviewer", "round", "schema", "sources", "verdict",
];

/** A hand-built, valid initial (round 1, PASS) receipt object. Independent of the module under test. */
function initialObject(over = {}) {
  return {
    schema: DESIGN_REVIEW_RECEIPT_SCHEMA,
    featureId: FEATURE,
    kind: "initial",
    round: 1,
    previousReceiptPath: null,
    previousReceiptSha256: null,
    sources: clone(SOURCES_1),
    reviewer: clone(REVIEWER),
    report: clone(REPORT_1),
    verdict: "pass",
    openFindingIds: [],
    reviewedAt: REVIEWED_AT,
    ...over,
  };
}

/** A hand-built, valid delta (round 2, one open finding) receipt object. */
function deltaObject(over = {}) {
  return initialObject({
    kind: "delta",
    round: 2,
    previousReceiptPath: RECEIPT1_PATH,
    previousReceiptSha256: sha("previous-receipt"),
    sources: clone(SOURCES_2),
    report: clone(REPORT_2),
    verdict: "open-findings",
    openFindingIds: ["F-3"],
    ...over,
  });
}

function createInput(over = {}) {
  return {
    featureId: FEATURE,
    previous: null,
    sources: clone(SOURCES_1),
    reviewer: clone(REVIEWER),
    report: clone(REPORT_1),
    openFindingIds: [],
    reviewedAt: REVIEWED_AT,
    ...over,
  };
}

const parse = (value) => parseDesignReviewReceipt(Buffer.isBuffer(value) ? value : bytesOf(value));
const create = (over) => createDesignReviewReceipt(createInput(over));
const previousOf = (object, path = RECEIPT1_PATH) => ({ path, bytes: bytesOf(object) });
const mutated = (build, fn) => { const object = build(); fn(object); return object; };

function summaryOf(object, path = RECEIPT1_PATH) {
  const result = summarizeDesignReviewReceipt({ path, bytes: bytesOf(object) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.summary;
}

const sourcesWith = (fn, base = SOURCES_1) => { const sources = clone(base); fn(sources); return sources; };
const manyCompanions = (n) => Array.from({ length: n }, (_, i) => ({ path: `specs/feat-x/c-${String(i).padStart(3, "0")}.md`, sha256: sha(`c-${i}`) }));
const manyIds = (n) => Array.from({ length: n }, (_, i) => `ID-${String(i).padStart(3, "0")}`);

const UNSAFE_PATHS = [
  ["backslash", "specs\\feat-x\\x.md"],
  ["leading parent segment", "../r.md"],
  ["inner parent segment", "specs/feat-x/../r.md"],
  ["dot segment", "specs/./r.md"],
  ["empty segment", "specs//r.md"],
  ["absolute", "/abs/r.md"],
  ["drive letter", "C:/x"],
  ["drive letter without slash", "c:r.md"],
  ["trailing slash", "specs/feat-x/review/"],
  ["leading space", " specs/r.md"],
  ["trailing space", "specs/r.md "],
  ["empty", ""],
  ["NUL", "specs/r\0.md"],
  ["241 characters", `specs/${"a".repeat(232)}.md`],
];
const SAFE_240 = `specs/${"a".repeat(231)}.md`;

// ------------------------------------------------------------------- U2-1

test("U2-1: exports the contract constants and the four functions", () => {
  assert.equal(DESIGN_REVIEW_RECEIPT_SCHEMA, "pipeline.design-review-receipt.v1");
  assert.equal(DESIGN_REVIEW_MAX_ROUNDS, 2);
  assert.equal(DESIGN_REVIEW_RECEIPT_MAX_BYTES, 65536);
  for (const fn of [createDesignReviewReceipt, parseDesignReviewReceipt, summarizeDesignReviewReceipt, checkDesignReviewReceiptSources]) {
    assert.equal(typeof fn, "function");
  }
});

test("U2-1: create an initial PASS receipt - bytes are canonical(receipt) plus one newline, sha256 is over the file bytes", () => {
  const result = create();
  assert.equal(result.ok, true);
  assert.deepStrictEqual(Object.keys(result).sort(), ["bytes", "ok", "receipt", "sha256"]);
  const expected = initialObject();
  assert.deepStrictEqual(result.receipt, expected);
  assert.deepStrictEqual(Object.keys(result.receipt).sort(), RECEIPT_KEYS);
  assert.ok(result.bytes instanceof Uint8Array);
  const expectedBytes = Buffer.from(`${canonical(expected)}\n`, "utf8");
  assert.ok(Buffer.from(result.bytes).equals(expectedBytes), "bytes must be exactly canonical(receipt) + LF");
  assert.equal(result.sha256, sha(expectedBytes));
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  const text = Buffer.from(result.bytes).toString("utf8");
  assert.equal(text.indexOf("\n"), text.length - 1, "exactly one trailing newline and no other line break");
  assert.deepStrictEqual(JSON.parse(text), expected);
  for (const forbidden of ["dispatchId", "courseId", "authoringDispatchId", "candidate"]) {
    assert.equal(Object.hasOwn(result.receipt, forbidden), false, forbidden);
  }
});

test("U2-1: creation is deterministic", () => {
  const first = create();
  const second = create();
  assert.ok(Buffer.from(first.bytes).equals(Buffer.from(second.bytes)));
  assert.equal(first.sha256, second.sha256);
});

// ------------------------------------------------------------------- U2-2

test("U2-2: finding IDs are sorted by code unit and the verdict is derived from them", () => {
  const result = create({ openFindingIds: ["F-3", "AC-ONE", "F-10"] });
  assert.equal(result.ok, true);
  assert.deepStrictEqual(result.receipt.openFindingIds, ["AC-ONE", "F-10", "F-3"]);
  assert.equal(result.receipt.verdict, "open-findings");
  const expected = initialObject({ verdict: "open-findings", openFindingIds: ["AC-ONE", "F-10", "F-3"] });
  assert.ok(Buffer.from(result.bytes).equals(bytesOf(expected)));
  const permuted = create({ openFindingIds: ["F-10", "F-3", "AC-ONE"] });
  assert.equal(permuted.sha256, result.sha256, "input order of IDs must not change the receipt");
});

test("U2-2: an empty finding list derives PASS", () => {
  const result = create({ openFindingIds: [] });
  assert.equal(result.receipt.verdict, "pass");
  assert.deepStrictEqual(result.receipt.openFindingIds, []);
});

test("U2-2: duplicate finding IDs are refused", () => {
  assert.deepStrictEqual(create({ openFindingIds: ["F-3", "F-3"] }), refuse("DRR-FINDING-IDS"));
  assert.deepStrictEqual(create({ openFindingIds: ["F-3", "AC-ONE", "F-3"] }), refuse("DRR-FINDING-IDS"));
});

// ------------------------------------------------------------------- U2-3

test("U2-3: parse round-trips a created initial receipt", () => {
  const created = create();
  const parsed = parseDesignReviewReceipt(created.bytes);
  assert.equal(parsed.ok, true);
  assert.deepStrictEqual(Object.keys(parsed).sort(), ["ok", "receipt", "sha256"]);
  assert.deepStrictEqual(parsed.receipt, created.receipt);
  assert.equal(parsed.sha256, created.sha256);
  assert.equal(parsed.sha256, sha(created.bytes));
});

test("U2-3: parse round-trips a created delta receipt and accepts a plain Uint8Array", () => {
  const previous = previousOf(initialObject());
  const created = create({ previous, sources: clone(SOURCES_2), report: clone(REPORT_2), openFindingIds: ["F-3"] });
  assert.equal(created.ok, true);
  const parsed = parseDesignReviewReceipt(new Uint8Array(created.bytes));
  assert.equal(parsed.ok, true);
  assert.deepStrictEqual(parsed.receipt, created.receipt);
  assert.equal(parsed.sha256, created.sha256);
});

// ------------------------------------------------------------------- U2-4

test("U2-4: anything but canonical(receipt) plus one newline is DRR-NONCANONICAL", () => {
  const valid = initialObject();
  const variants = {
    "pretty-printed": Buffer.from(`${JSON.stringify(valid, null, 2)}\n`),
    "insertion-order keys": Buffer.from(`${JSON.stringify(valid)}\n`),
    "no trailing newline": Buffer.from(canonical(valid)),
    "two trailing newlines": Buffer.from(`${canonical(valid)}\n\n`),
    "CRLF terminator": Buffer.from(`${canonical(valid)}\r\n`),
    "leading whitespace": Buffer.from(` ${canonical(valid)}\n`),
  };
  for (const [label, bytes] of Object.entries(variants)) {
    assert.deepStrictEqual(parseDesignReviewReceipt(bytes), refuse("DRR-NONCANONICAL"), label);
  }
});

test("U2-4: NONCANONICAL is decided before SHAPE (a pretty-printed receipt with an extra key)", () => {
  const object = initialObject({ dispatchId: "d-1" });
  assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.from(`${JSON.stringify(object, null, 2)}\n`)), refuse("DRR-NONCANONICAL"));
});

// ------------------------------------------------------------------- U2-5

test("U2-5: an extra top-level key (dispatch, course, authoring or candidate field) is DRR-SHAPE", () => {
  for (const key of ["dispatchId", "courseId", "authoringDispatchId", "candidate", "anything"]) {
    assert.deepStrictEqual(parse(initialObject({ [key]: "x" })), refuse("DRR-SHAPE"), key);
  }
});

test("U2-5: every missing top-level key is DRR-SHAPE (including reviewer)", () => {
  for (const key of Object.keys(initialObject())) {
    const object = initialObject();
    delete object[key];
    assert.deepStrictEqual(parse(object), refuse("DRR-SHAPE"), `missing ${key}`);
  }
  assert.deepStrictEqual(create({ reviewer: undefined }), refuse("DRR-SHAPE"));
});

test("U2-5: nested objects are closed too (reviewer, report, sources, prd, spec, companion)", () => {
  const nested = {
    reviewer: (r) => { r.reviewer.dispatchId = "d-1"; },
    report: (r) => { r.report.note = "x"; },
    sources: (r) => { r.sources.extra = 1; },
    "sources.prd": (r) => { r.sources.prd.mode = "x"; },
    "sources.spec": (r) => { r.sources.spec.mode = "x"; },
    "sources.companion": (r) => { r.sources.companions[0].note = "x"; },
  };
  for (const [label, fn] of Object.entries(nested)) {
    assert.deepStrictEqual(parse(mutated(initialObject, fn)), refuse("DRR-SHAPE"), label);
  }
  assert.deepStrictEqual(create({ reviewer: { ...REVIEWER, dispatchId: "d-1" } }), refuse("DRR-SHAPE"));
});

test("U2-5: malformed values are DRR-SHAPE (schema string, digests, null companion digest, wrong types)", () => {
  const bad = {
    "wrong schema": (r) => { r.schema = "pipeline.design-review-receipt.v2"; },
    "null companion digest": (r) => { r.sources.companions[0].sha256 = null; },
    "uppercase prd digest": (r) => { r.sources.prd.sha256 = sha("prd-1").toUpperCase(); },
    "short report digest": (r) => { r.report.sha256 = "abc"; },
    "companions not an array": (r) => { r.sources.companions = {}; },
    "featureId not a string": (r) => { r.featureId = 5; },
    "reviewedAt not a string": (r) => { r.reviewedAt = 1790000000000; },
  };
  for (const [label, fn] of Object.entries(bad)) {
    assert.deepStrictEqual(parse(mutated(initialObject, fn)), refuse("DRR-SHAPE"), label);
  }
  assert.deepStrictEqual(parse(deltaObject({ previousReceiptSha256: "not-a-digest" })), refuse("DRR-SHAPE"));
  assert.deepStrictEqual(parse(deltaObject({ previousReceiptPath: 5 })), refuse("DRR-SHAPE"));
});

test("U2-5: a JSON value that is not an object is DRR-SHAPE", () => {
  for (const text of ["null\n", "[]\n", "42\n", "\"x\"\n"]) {
    assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.from(text)), refuse("DRR-SHAPE"), text.trim());
  }
});

test("U2-5: SHAPE is decided before PATH (extra key plus an unsafe report path)", () => {
  assert.deepStrictEqual(parse(initialObject({ dispatchId: "d-1", report: { path: "../r.md", sha256: sha("r") } })), refuse("DRR-SHAPE"));
});

// ------------------------------------------------------------------- U2-6

test("U2-6: PASS with open findings and open-findings without findings are both DRR-VERDICT", () => {
  assert.deepStrictEqual(parse(initialObject({ verdict: "pass", openFindingIds: ["F-3"] })), refuse("DRR-VERDICT"));
  assert.deepStrictEqual(parse(initialObject({ verdict: "open-findings", openFindingIds: [] })), refuse("DRR-VERDICT"));
  assert.deepStrictEqual(parse(deltaObject({ verdict: "pass" })), refuse("DRR-VERDICT"));
  assert.deepStrictEqual(parse(deltaObject({ verdict: "open-findings", openFindingIds: [] })), refuse("DRR-VERDICT"));
});

test("U2-6: a consistent PASS and a consistent open-findings receipt parse", () => {
  assert.equal(parse(initialObject()).ok, true);
  assert.equal(parse(initialObject({ verdict: "open-findings", openFindingIds: ["AC-ONE", "F-3"] })).ok, true);
});

test("U2-6: VERDICT is decided before KIND-ROUND", () => {
  assert.deepStrictEqual(parse(initialObject({ verdict: "pass", openFindingIds: ["F-3"], round: 2 })), refuse("DRR-VERDICT"));
});

// ------------------------------------------------------------------- U2-7

test("U2-7: lowercase, unsorted, duplicate, malformed, over-long or 65 finding IDs are DRR-FINDING-IDS at parse", () => {
  const bad = {
    lowercase: ["f-3"],
    unsorted: ["F-3", "AC-ONE"],
    "unsorted by code unit (F-10 sorts before F-3)": ["F-3", "F-10"],
    duplicate: ["F-3", "F-3"],
    "no hyphen group": ["F3"],
    "empty trailing group": ["F-"],
    "eight hyphen groups": ["A-B-C-D-E-F-G-H-I"],
    "81 characters": [`A-${"B".repeat(79)}`],
    "65 IDs": manyIds(65),
  };
  for (const [label, ids] of Object.entries(bad)) {
    assert.deepStrictEqual(parse(initialObject({ verdict: "open-findings", openFindingIds: ids })), refuse("DRR-FINDING-IDS"), label);
  }
});

test("U2-7: boundary IDs parse (64 IDs, 80 characters, seven hyphen groups)", () => {
  for (const ids of [manyIds(64), [`A-${"B".repeat(78)}`], ["A-B-C-D-E-F-G-H"]]) {
    assert.equal(parse(initialObject({ verdict: "open-findings", openFindingIds: ids })).ok, true, ids[0]);
  }
});

test("U2-7: create refuses lowercase, malformed, over-long and 65 IDs and accepts the boundaries", () => {
  for (const ids of [["f-3"], ["F3"], [`A-${"B".repeat(79)}`], ["A-B-C-D-E-F-G-H-I"], manyIds(65)]) {
    assert.deepStrictEqual(create({ openFindingIds: ids }), refuse("DRR-FINDING-IDS"), ids[0]);
  }
  for (const ids of [manyIds(64), [`A-${"B".repeat(78)}`], ["A-B-C-D-E-F-G-H"]]) {
    const result = create({ openFindingIds: ids });
    assert.equal(result.ok, true, ids[0]);
    assert.equal(result.receipt.verdict, "open-findings");
  }
});

test("U2-7: FINDING-IDS is decided before VERDICT", () => {
  assert.deepStrictEqual(parse(initialObject({ verdict: "pass", openFindingIds: ["f-3"] })), refuse("DRR-FINDING-IDS"));
});

// ------------------------------------------------------------------- U2-8

const CREATE_PATH_FIELDS = {
  "report.path": (path) => createInput({ report: { path, sha256: sha("r") } }),
  "prd.path": (path) => createInput({ sources: sourcesWith((s) => { s.prd.path = path; }) }),
  "spec.path": (path) => createInput({ sources: sourcesWith((s) => { s.spec.path = path; }) }),
  "companion path": (path) => createInput({ sources: sourcesWith((s) => { s.companions.push({ path, sha256: sha("x") }); }) }),
};
const PARSE_PATH_FIELDS = {
  "report.path": (path) => initialObject({ report: { path, sha256: sha("r") } }),
  "prd.path": (path) => mutated(initialObject, (r) => { r.sources.prd.path = path; }),
  "spec.path": (path) => mutated(initialObject, (r) => { r.sources.spec.path = path; }),
  "companion path": (path) => mutated(initialObject, (r) => { r.sources.companions[0].path = path; }),
  previousReceiptPath: (path) => deltaObject({ previousReceiptPath: path }),
};

test("U2-8: create refuses every unsafe path in report, PRD, Spec and companion position with DRR-PATH", () => {
  for (const [field, build] of Object.entries(CREATE_PATH_FIELDS)) {
    for (const [label, path] of UNSAFE_PATHS) {
      assert.deepStrictEqual(createDesignReviewReceipt(build(path)), refuse("DRR-PATH"), `${field}: ${label}`);
    }
  }
});

test("U2-8: parse refuses every unsafe path (including previousReceiptPath) with DRR-PATH", () => {
  for (const [field, build] of Object.entries(PARSE_PATH_FIELDS)) {
    for (const [label, path] of UNSAFE_PATHS) {
      assert.deepStrictEqual(parse(build(path)), refuse("DRR-PATH"), `${field}: ${label}`);
    }
  }
});

test("U2-8: a 240-character path is a safe path", () => {
  assert.equal(create({ report: { path: SAFE_240, sha256: sha("r") } }).ok, true);
  assert.equal(create({ sources: sourcesWith((s) => { s.companions.push({ path: SAFE_240, sha256: sha("x") }); }) }).ok, true);
  assert.equal(parse(initialObject({ report: { path: SAFE_240, sha256: sha("r") } })).ok, true);
});

test("U2-8: a report path equal to the PRD, the Spec or a companion is DRR-PATH (create and parse)", () => {
  for (const path of [PRD_PATH, SPEC_PATH, DESIGN_PATH, REQ_PATH, TRACE_PATH]) {
    assert.deepStrictEqual(create({ report: { path, sha256: sha("r") } }), refuse("DRR-PATH"), `create ${path}`);
    assert.deepStrictEqual(parse(initialObject({ report: { path, sha256: sha("r") } })), refuse("DRR-PATH"), `parse ${path}`);
  }
});

test("U2-8: a report path equal to the previous receipt path is DRR-PATH (create and parse); an unsafe previous path too", () => {
  const input = { previous: previousOf(initialObject()), sources: clone(SOURCES_2), openFindingIds: ["F-3"] };
  assert.equal(create({ ...input, report: clone(REPORT_2) }).ok, true, "control: a distinct report path is accepted");
  assert.deepStrictEqual(create({ ...input, report: { path: RECEIPT1_PATH, sha256: sha("r") } }), refuse("DRR-PATH"));
  assert.deepStrictEqual(parse(deltaObject({ report: { path: RECEIPT1_PATH, sha256: sha("r") } })), refuse("DRR-PATH"));
  assert.deepStrictEqual(create({ ...input, report: clone(REPORT_2), previous: previousOf(initialObject(), "../p.json") }), refuse("DRR-PATH"));
});

test("U2-8: PATH is decided before SOURCES (unsafe path in an unsorted companion list)", () => {
  const object = mutated(initialObject, (r) => {
    r.sources.companions = [{ path: "specs/feat-x/z.md", sha256: sha("z") }, { path: "specs\\a.md", sha256: sha("a") }];
  });
  assert.deepStrictEqual(parse(object), refuse("DRR-PATH"));
});

// ------------------------------------------------------------------- U2-9

test("U2-9: create sorts companions by code unit, not by locale", () => {
  const scrambled = sourcesWith((s) => {
    s.companions = [
      { path: TRACE_PATH, sha256: sha("trace-1") },
      { path: "specs/feat-x/a-notes.md", sha256: sha("a") },
      { path: DESIGN_PATH, sha256: sha("design-1") },
      { path: "specs/feat-x/B-notes.md", sha256: sha("b") },
    ];
  });
  const result = create({ sources: scrambled });
  assert.equal(result.ok, true);
  assert.deepStrictEqual(result.receipt.sources.companions.map((c) => c.path), [
    "specs/feat-x/B-notes.md", "specs/feat-x/a-notes.md", DESIGN_PATH, TRACE_PATH,
  ]);
  const ordered = create({ sources: sourcesWith((s) => { s.companions = clone(result.receipt.sources.companions); }) });
  assert.equal(ordered.sha256, result.sha256, "companion input order must not change the receipt");
  assert.equal(parseDesignReviewReceipt(result.bytes).ok, true);
});

test("U2-9: create accepts zero and 64 companions and refuses 65", () => {
  assert.equal(create({ sources: sourcesWith((s) => { s.companions = []; }) }).ok, true);
  assert.equal(create({ sources: sourcesWith((s) => { s.companions = manyCompanions(64); }) }).ok, true);
  assert.deepStrictEqual(create({ sources: sourcesWith((s) => { s.companions = manyCompanions(65); }) }), refuse("DRR-SOURCES"));
});

test("U2-9: create refuses duplicate companions, a companion that is the Spec or the PRD, and PRD equal to Spec", () => {
  const duplicate = sourcesWith((s) => { s.companions.push({ path: DESIGN_PATH, sha256: sha("design-2") }); });
  assert.deepStrictEqual(create({ sources: duplicate }), refuse("DRR-SOURCES"), "duplicate companion path");
  const identicalDuplicate = sourcesWith((s) => { s.companions.push(clone(s.companions[0])); });
  assert.deepStrictEqual(create({ sources: identicalDuplicate }), refuse("DRR-SOURCES"), "identical duplicate companion");
  const holdsSpec = sourcesWith((s) => { s.companions.push({ path: SPEC_PATH, sha256: sha("spec-1") }); });
  assert.deepStrictEqual(create({ sources: holdsSpec }), refuse("DRR-SOURCES"), "companion = spec");
  const holdsPrd = sourcesWith((s) => { s.companions.push({ path: PRD_PATH, sha256: sha("prd-1") }); });
  assert.deepStrictEqual(create({ sources: holdsPrd }), refuse("DRR-SOURCES"), "companion = prd");
  const same = sourcesWith((s) => { s.spec.path = PRD_PATH; });
  assert.deepStrictEqual(create({ sources: same }), refuse("DRR-SOURCES"), "prd path = spec path");
});

test("U2-9: parse refuses unsorted companions (code-unit order), duplicates, overlap with PRD or Spec, PRD equal to Spec and 65 companions", () => {
  const cases = {
    "unsorted": mutated(initialObject, (r) => { r.sources.companions.reverse(); }),
    "locale-sorted but not code-unit-sorted": mutated(initialObject, (r) => {
      r.sources.companions = [{ path: "specs/feat-x/a-notes.md", sha256: sha("a") }, { path: "specs/feat-x/B-notes.md", sha256: sha("b") }];
    }),
    "duplicate path": mutated(initialObject, (r) => { r.sources.companions = [clone(r.sources.companions[0]), clone(r.sources.companions[0])]; }),
    "duplicate path, different digest": mutated(initialObject, (r) => {
      r.sources.companions = [{ path: DESIGN_PATH, sha256: sha("a") }, { path: DESIGN_PATH, sha256: sha("b") }];
    }),
    "companion = spec": mutated(initialObject, (r) => { r.sources.companions = [{ path: SPEC_PATH, sha256: sha("s") }]; }),
    "companion = prd": mutated(initialObject, (r) => { r.sources.companions = [{ path: PRD_PATH, sha256: sha("p") }]; }),
    "prd = spec": mutated(initialObject, (r) => { r.sources.spec.path = PRD_PATH; }),
    "65 companions": mutated(initialObject, (r) => { r.sources.companions = manyCompanions(65); }),
  };
  for (const [label, object] of Object.entries(cases)) {
    assert.deepStrictEqual(parse(object), refuse("DRR-SOURCES"), label);
  }
  assert.equal(parse(mutated(initialObject, (r) => { r.sources.companions = manyCompanions(64); })).ok, true, "64 companions parse");
  assert.equal(parse(mutated(initialObject, (r) => { r.sources.companions = []; })).ok, true, "zero companions parse");
});

test("U2-9: SOURCES is decided before FINDING-IDS", () => {
  const object = mutated(() => initialObject({ verdict: "open-findings", openFindingIds: ["f-3"] }), (r) => { r.sources.companions.reverse(); });
  assert.deepStrictEqual(parse(object), refuse("DRR-SOURCES"));
});

// ------------------------------------------------------------------ U2-10

test("U2-10: kind, round and previous receipt must agree (initial = round 1 = no previous; delta = round 2 = previous)", () => {
  const cases = {
    "initial with a previous receipt": initialObject({ previousReceiptPath: RECEIPT1_PATH, previousReceiptSha256: sha("p") }),
    "initial with round 2": initialObject({ round: 2 }),
    "initial with round 2 and a previous receipt": initialObject({ round: 2, previousReceiptPath: RECEIPT1_PATH, previousReceiptSha256: sha("p") }),
    "delta with round 1": deltaObject({ round: 1 }),
    "delta with round 1 and no previous receipt": deltaObject({ round: 1, previousReceiptPath: null, previousReceiptSha256: null }),
    "delta without a previous receipt": deltaObject({ previousReceiptPath: null, previousReceiptSha256: null }),
  };
  for (const [label, object] of Object.entries(cases)) {
    assert.deepStrictEqual(parse(object), refuse("DRR-KIND-ROUND"), label);
  }
});

test("U2-10: a consistent initial and a consistent delta parse", () => {
  assert.equal(parse(initialObject()).ok, true);
  assert.equal(parse(deltaObject()).ok, true);
});

test("U2-10: a round above 2 is DRR-ROUND-EXCEEDED at parse", () => {
  for (const round of [3, 4, 99]) {
    assert.deepStrictEqual(parse(deltaObject({ round })), refuse("DRR-ROUND-EXCEEDED"), `round ${round}`);
  }
});

// ------------------------------------------------------------------ U2-11

test("U2-11: create a delta receipt (spec digest changed, one open finding)", () => {
  const previous = previousOf(initialObject());
  const reviewedAt = "2026-10-07T11:30:00.000Z";
  const result = create({ previous, sources: clone(SOURCES_2), report: clone(REPORT_2), openFindingIds: ["F-3"], reviewedAt });
  assert.equal(result.ok, true, JSON.stringify(result));
  const expected = deltaObject({ previousReceiptSha256: sha(previous.bytes), reviewedAt });
  assert.deepStrictEqual(result.receipt, expected);
  assert.equal(result.receipt.kind, "delta");
  assert.equal(result.receipt.round, 2);
  assert.equal(result.receipt.previousReceiptPath, RECEIPT1_PATH);
  assert.equal(result.receipt.previousReceiptSha256, sha(previous.bytes));
  assert.equal(result.receipt.verdict, "open-findings");
  assert.ok(Buffer.from(result.bytes).equals(bytesOf(expected)));
  assert.equal(result.sha256, sha(bytesOf(expected)));
  assert.deepStrictEqual(parseDesignReviewReceipt(result.bytes).receipt, expected);
});

test("U2-11: any single changed source (PRD, Spec, companion digest, added or removed companion) permits a delta", () => {
  const variants = {
    "spec digest": (s) => { s.spec.sha256 = sha("spec-2"); },
    "prd digest": (s) => { s.prd.sha256 = sha("prd-2"); },
    "companion digest": (s) => { s.companions[0].sha256 = sha("design-2"); },
    "companion added": (s) => { s.companions.push({ path: "specs/feat-x/zz-extra.md", sha256: sha("extra") }); },
    "companion removed": (s) => { s.companions.pop(); },
  };
  const previous = previousOf(initialObject());
  for (const [label, fn] of Object.entries(variants)) {
    const sources = sourcesWith(fn);
    const result = create({ previous, sources, report: clone(REPORT_2), openFindingIds: ["F-3"] });
    assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.receipt.kind, "delta", label);
    assert.deepStrictEqual(result.receipt.sources, sources, label);
  }
});

test("U2-11: a delta without open findings is a round-2 PASS", () => {
  const result = create({ previous: previousOf(initialObject({ verdict: "open-findings", openFindingIds: ["F-3"] })), sources: clone(SOURCES_2), report: clone(REPORT_2), openFindingIds: [] });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.verdict, "pass");
  assert.equal(result.receipt.round, 2);
});

// ------------------------------------------------------------------ U2-12

test("U2-12: a delta over identical sources is DRR-DELTA-UNCHANGED", () => {
  const previous = previousOf(initialObject());
  assert.deepStrictEqual(create({ previous, sources: clone(SOURCES_1), report: clone(REPORT_2) }), refuse("DRR-DELTA-UNCHANGED"));
});

test("U2-12: a different report, findings or timestamp does not make unchanged sources changed", () => {
  const previous = previousOf(initialObject());
  const result = create({
    previous, sources: clone(SOURCES_1), report: clone(REPORT_2), openFindingIds: ["F-3", "AC-ONE"], reviewedAt: "2026-10-08T08:00:00.000Z",
  });
  assert.deepStrictEqual(result, refuse("DRR-DELTA-UNCHANGED"));
});

test("U2-12: unchanged is judged on canonical sources, so companion input order does not matter", () => {
  const previous = previousOf(initialObject());
  const reordered = sourcesWith((s) => { s.companions.reverse(); });
  assert.deepStrictEqual(create({ previous, sources: reordered, report: clone(REPORT_2) }), refuse("DRR-DELTA-UNCHANGED"));
});

// ------------------------------------------------------------------ U2-13

test("U2-13: a delta on a delta is DRR-ROUND-EXCEEDED, even when the sources changed", () => {
  const previous = previousOf(deltaObject(), RECEIPT2_PATH);
  const sources = sourcesWith((s) => { s.companions[0].sha256 = sha("design-3"); }, SOURCES_2);
  const report = { path: "specs/feat-x/review/design-review-3.md", sha256: sha("report-3") };
  assert.deepStrictEqual(create({ previous, sources, report }), refuse("DRR-ROUND-EXCEEDED"));
});

test("U2-13: ROUND-EXCEEDED is decided before the chain and unchanged checks of create", () => {
  const report = { path: "specs/feat-x/review/design-review-3.md", sha256: sha("report-3") };
  const otherFeature = previousOf(deltaObject({ featureId: "feat-y" }), RECEIPT2_PATH);
  assert.deepStrictEqual(create({ previous: otherFeature, sources: clone(SOURCES_2), report }), refuse("DRR-ROUND-EXCEEDED"), "previous is a round-2 receipt of another feature");
  const identical = previousOf(deltaObject(), RECEIPT2_PATH);
  assert.deepStrictEqual(create({ previous: identical, sources: clone(SOURCES_2), report }), refuse("DRR-ROUND-EXCEEDED"), "previous is a round-2 receipt over identical sources");
});

// ------------------------------------------------------------------ U2-14

test("U2-14: a previous receipt of another feature, another PRD path or another Spec path is DRR-DELTA-CHAIN", () => {
  const otherPrd = initialObject({ sources: sourcesWith((s) => { s.prd.path = "specs/feat-x/prd_other.md"; }) });
  const otherSpec = initialObject({ sources: sourcesWith((s) => { s.spec.path = "specs/feat-x/spec-other.md"; }) });
  const cases = {
    "another featureId": initialObject({ featureId: "feat-y" }),
    "another PRD path": otherPrd,
    "another Spec path": otherSpec,
  };
  for (const [label, object] of Object.entries(cases)) {
    const result = create({ previous: previousOf(object), sources: clone(SOURCES_2), report: clone(REPORT_2) });
    assert.deepStrictEqual(result, refuse("DRR-DELTA-CHAIN"), label);
  }
  const movedPrd = sourcesWith((s) => { s.prd.path = "specs/feat-x/prd_moved.md"; s.spec.sha256 = sha("spec-2"); });
  assert.deepStrictEqual(create({ previous: previousOf(initialObject()), sources: movedPrd, report: clone(REPORT_2) }), refuse("DRR-DELTA-CHAIN"), "new PRD path");
  const movedSpec = sourcesWith((s) => { s.spec.path = "specs/feat-x/spec-moved.md"; });
  assert.deepStrictEqual(create({ previous: previousOf(initialObject()), sources: movedSpec, report: clone(REPORT_2) }), refuse("DRR-DELTA-CHAIN"), "new Spec path");
  assert.deepStrictEqual(create({ featureId: "feat-y", previous: previousOf(initialObject()), sources: clone(SOURCES_2), report: clone(REPORT_2) }), refuse("DRR-DELTA-CHAIN"), "new featureId");
});

test("U2-14: an unparseable previous receipt is DRR-DELTA-CHAIN", () => {
  const unparseable = {
    "truncated JSON": Buffer.from("{"),
    "empty": Buffer.alloc(0),
    "not canonical": Buffer.from(`${JSON.stringify(initialObject(), null, 2)}\n`),
    "extra key": bytesOf(initialObject({ dispatchId: "d-1" })),
  };
  for (const [label, bytes] of Object.entries(unparseable)) {
    const result = create({ previous: { path: RECEIPT1_PATH, bytes }, sources: clone(SOURCES_2), report: clone(REPORT_2) });
    assert.deepStrictEqual(result, refuse("DRR-DELTA-CHAIN"), label);
  }
});

// ------------------------------------------------------------------ U2-15

test("U2-15: equal sources pass, regardless of key order in the supplied object", () => {
  const summary = summaryOf(initialObject());
  assert.deepStrictEqual(checkDesignReviewReceiptSources({ summary, currentSources: clone(SOURCES_1) }), { ok: true });
  const reordered = {
    companions: SOURCES_1.companions.map((c) => ({ sha256: c.sha256, path: c.path })),
    spec: { sha256: SOURCES_1.spec.sha256, path: SOURCES_1.spec.path },
    prd: { sha256: SOURCES_1.prd.sha256, path: SOURCES_1.prd.path },
  };
  assert.deepStrictEqual(checkDesignReviewReceiptSources({ summary, currentSources: reordered }), { ok: true });
});

test("U2-15: drift after an initial receipt is DRR-SOURCE-DRIFT with nextRound 2", () => {
  const summary = summaryOf(initialObject());
  const drifts = {
    "spec digest": (s) => { s.spec.sha256 = sha("spec-9"); },
    "prd digest": (s) => { s.prd.sha256 = sha("prd-9"); },
    "companion digest": (s) => { s.companions[0].sha256 = sha("design-9"); },
    "companion absent": (s) => { s.companions[1].sha256 = null; },
    "companion added": (s) => { s.companions.push({ path: "specs/feat-x/zz-extra.md", sha256: sha("extra") }); },
    "companion removed": (s) => { s.companions.pop(); },
    "prd path": (s) => { s.prd.path = "specs/feat-x/prd_other.md"; },
  };
  for (const [label, fn] of Object.entries(drifts)) {
    const result = checkDesignReviewReceiptSources({ summary, currentSources: sourcesWith(fn) });
    assert.deepStrictEqual(result, { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: 2 }, label);
  }
});

test("U2-15: drift after a delta is DRR-SOURCE-DRIFT with nextRound null (PO-Q2 option b leaves U2 unchanged)", () => {
  const summary = summaryOf(deltaObject(), RECEIPT2_PATH);
  assert.deepStrictEqual(checkDesignReviewReceiptSources({ summary, currentSources: clone(SOURCES_2) }), { ok: true });
  const drifted = sourcesWith((s) => { s.companions[0].sha256 = sha("design-9"); }, SOURCES_2);
  assert.deepStrictEqual(checkDesignReviewReceiptSources({ summary, currentSources: drifted }), { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: null });
  assert.deepStrictEqual(checkDesignReviewReceiptSources({ summary, currentSources: clone(SOURCES_1) }), { ok: false, code: "DRR-SOURCE-DRIFT", nextRound: null });
});

// ------------------------------------------------------------------ U2-16

test("U2-16: empty input and input above 65536 bytes are DRR-SIZE", () => {
  assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.alloc(0)), refuse("DRR-SIZE"));
  assert.deepStrictEqual(parseDesignReviewReceipt(new Uint8Array(0)), refuse("DRR-SIZE"));
  assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.alloc(65537, 0x7b)), refuse("DRR-SIZE"));
});

test("U2-16: exactly 65536 bytes is not a size refusal (it is decided by the later checks)", () => {
  assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.alloc(65536, 0x7b)), refuse("DRR-JSON"));
});

test("U2-16: text that is not JSON is DRR-JSON", () => {
  for (const text of ["{", "not json", "{\"a\":", "[1,"]) {
    assert.deepStrictEqual(parseDesignReviewReceipt(Buffer.from(text)), refuse("DRR-JSON"), text);
  }
});

// ------------------------------------------------------------------ U2-17

test("U2-17: a featureId outside ^[a-z][a-z0-9-]{0,63}$ is DRR-SHAPE (create and parse)", () => {
  for (const featureId of ["Feat_X", "feat_x", "Feat-x", "1feat", "-feat", "", "f".repeat(65)]) {
    assert.deepStrictEqual(create({ featureId }), refuse("DRR-SHAPE"), `create ${JSON.stringify(featureId)}`);
    assert.deepStrictEqual(parse(initialObject({ featureId })), refuse("DRR-SHAPE"), `parse ${JSON.stringify(featureId)}`);
  }
  for (const featureId of ["f", `f${"a".repeat(63)}`, "feat-x-2"]) {
    assert.equal(create({ featureId }).ok, true, featureId);
    assert.equal(parse(initialObject({ featureId })).ok, true, featureId);
  }
});

test("U2-17: a reviewedAt that is not exactly new Date(x).toISOString() is DRR-SHAPE (create and parse)", () => {
  const bad = [
    "2026-10-07", "2026-10-07T10:00:00Z", "2026-10-07T10:00:00.0Z", "2026-10-07T10:00:00.000+00:00",
    " 2026-10-07T10:00:00.000Z", "2026-10-07T10:00:00.000Z ", "2026-10-07T10:00:00.000z", "not a date", "",
    "2026-02-30T10:00:00.000Z", "2026-13-01T10:00:00.000Z", 1790000000000,
  ];
  for (const reviewedAt of bad) {
    assert.deepStrictEqual(create({ reviewedAt }), refuse("DRR-SHAPE"), `create ${JSON.stringify(reviewedAt)}`);
    assert.deepStrictEqual(parse(initialObject({ reviewedAt })), refuse("DRR-SHAPE"), `parse ${JSON.stringify(reviewedAt)}`);
  }
  for (const reviewedAt of ["2026-10-07T10:00:00.000Z", "2024-02-29T23:59:59.999Z", "1970-01-01T00:00:00.000Z"]) {
    assert.equal(create({ reviewedAt }).ok, true, reviewedAt);
    assert.equal(parse(initialObject({ reviewedAt })).ok, true, reviewedAt);
  }
});

test("U2-17: a malformed reviewer (runner or model pattern) is DRR-SHAPE; the boundaries and bracketed models are accepted", () => {
  const bad = [
    { runner: "Claude", model: "m" }, { runner: "", model: "m" }, { runner: "1x", model: "m" }, { runner: "a b", model: "m" },
    { runner: "a".repeat(65), model: "m" },
    { runner: "claude", model: "" }, { runner: "claude", model: "-x" }, { runner: "claude", model: "a b" },
    { runner: "claude", model: "bad/model" }, { runner: "claude", model: "m".repeat(129) },
  ];
  for (const reviewer of bad) {
    assert.deepStrictEqual(create({ reviewer }), refuse("DRR-SHAPE"), `create ${JSON.stringify(reviewer)}`);
    assert.deepStrictEqual(parse(initialObject({ reviewer })), refuse("DRR-SHAPE"), `parse ${JSON.stringify(reviewer)}`);
  }
  const good = [
    { runner: "a".repeat(64), model: "m" }, { runner: "claude", model: "m".repeat(128) },
    { runner: "claude", model: "claude-opus-4-7[1m]" }, { runner: "codex", model: "gpt-5.2:high" }, { runner: "x", model: "o3" },
  ];
  for (const reviewer of good) {
    assert.equal(create({ reviewer }).ok, true, JSON.stringify(reviewer));
    assert.equal(parse(initialObject({ reviewer })).ok, true, JSON.stringify(reviewer));
  }
});

// ------------------------------------------------------------------ U2-18

test("U2-18: the summary has exactly the contract keys and the file digest", () => {
  const object = initialObject({ verdict: "open-findings", openFindingIds: ["AC-ONE", "F-3"] });
  const bytes = bytesOf(object);
  const result = summarizeDesignReviewReceipt({ path: RECEIPT1_PATH, bytes });
  assert.deepStrictEqual(result, {
    ok: true,
    summary: {
      path: RECEIPT1_PATH,
      sha256: sha(bytes),
      featureId: FEATURE,
      kind: "initial",
      round: 1,
      previousReceiptPath: null,
      previousReceiptSha256: null,
      sources: clone(SOURCES_1),
      report: clone(REPORT_1),
      verdict: "open-findings",
      openFindingIds: ["AC-ONE", "F-3"],
    },
  });
  for (const omitted of ["schema", "reviewer", "reviewedAt"]) {
    assert.equal(Object.hasOwn(result.summary, omitted), false, omitted);
  }
});

test("U2-18: a delta summary carries the previous receipt path and digest, and matches a created receipt's digest", () => {
  const previous = previousOf(initialObject());
  const created = create({ previous, sources: clone(SOURCES_2), report: clone(REPORT_2), openFindingIds: ["F-3"] });
  const result = summarizeDesignReviewReceipt({ path: RECEIPT2_PATH, bytes: created.bytes });
  assert.equal(result.ok, true);
  assert.deepStrictEqual(Object.keys(result).sort(), ["ok", "summary"]);
  assert.equal(result.summary.path, RECEIPT2_PATH);
  assert.equal(result.summary.sha256, created.sha256);
  assert.equal(result.summary.kind, "delta");
  assert.equal(result.summary.round, 2);
  assert.equal(result.summary.previousReceiptPath, RECEIPT1_PATH);
  assert.equal(result.summary.previousReceiptSha256, sha(previous.bytes));
  assert.deepStrictEqual(result.summary.sources, SOURCES_2);
  assert.deepStrictEqual(result.summary.report, REPORT_2);
  assert.equal(result.summary.verdict, "open-findings");
  assert.deepStrictEqual(Object.keys(result.summary).sort(), [
    "featureId", "kind", "openFindingIds", "path", "previousReceiptPath", "previousReceiptSha256", "report", "round", "sha256", "sources", "verdict",
  ]);
});

test("U2-18: summarize passes the parse refusal code through", () => {
  const cases = [
    [Buffer.alloc(0), "DRR-SIZE"],
    [Buffer.from("{"), "DRR-JSON"],
    [Buffer.from(`${JSON.stringify(initialObject(), null, 2)}\n`), "DRR-NONCANONICAL"],
    [bytesOf(initialObject({ dispatchId: "d-1" })), "DRR-SHAPE"],
    [bytesOf(initialObject({ verdict: "pass", openFindingIds: ["F-3"] })), "DRR-VERDICT"],
    [bytesOf(deltaObject({ round: 3 })), "DRR-ROUND-EXCEEDED"],
  ];
  for (const [bytes, code] of cases) {
    assert.deepStrictEqual(summarizeDesignReviewReceipt({ path: RECEIPT1_PATH, bytes }), refuse(code), code);
  }
});

// ------------------------------------------------------------------ U2-19

test("U2-19: the module imports only node:crypto and canonical from po-approval-proof (import rule of the contract header)", () => {
  const source = readFileSync(new URL("./design-review-receipt.mjs", import.meta.url), "utf8");
  const specifiers = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/gu)].map((match) => match[1]);
  assert.deepStrictEqual([...new Set(specifiers)].sort(), ["./po-approval-proof.mjs", "node:crypto"]);
  assert.match(source, /import\s*\{[^}]*\bcanonical\b[^}]*\}\s*from\s*["']\.\/po-approval-proof\.mjs["']/u);
  assert.doesNotMatch(source, /\bimport\s*\(/u, "no dynamic import");
  assert.doesNotMatch(source, /\brequire\s*\(/u, "no require");
  assert.doesNotMatch(source, /^\s*import\s+["']/mu, "no side-effect import");
});
