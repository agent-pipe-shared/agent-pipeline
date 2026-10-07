// SPDX-License-Identifier: SUL-1.0
// RED pins for U1 of ADR-0085: design-consistency-check.mjs (does not exist yet).
// Contract: specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md
// sections 2 (API, input, result, Entry, code table, review clauses, determinism),
// 5 "U1" (tests 1-20) and the section 6 resolutions (PO-Q1 option A / decision Y,
// PO-Q2 option b / decision Z). Every fixture is pure in-memory data: no
// filesystem, no git. ReceiptSummary inputs are literal objects (U1 never
// imports U2).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DESIGN_CONSISTENCY_CHECK_SCHEMA,
  DESIGN_CONSISTENCY_CODES,
  DesignConsistencyCheckError,
  checkDesignConsistency,
  currentDesignSources,
  parseTraceabilityIds,
  registerFromRequirementTraceability,
  reviewChainInconsistencies,
} from "./design-consistency-check.mjs";
import { canonical } from "./po-approval-proof.mjs";
import { TECHNICAL_SPEC_MARKER } from "./po-gate-authority.mjs";
import {
  REQUIREMENT_TRACEABILITY_SCHEMA,
  RequirementTraceabilityError,
  evaluateRequirementTraceability,
  requirementMapPath,
} from "./requirement-traceability.mjs";

// ---------------------------------------------------------------------------
// Shared fixture F (contract section 5), built in memory.
// ---------------------------------------------------------------------------

const FEATURE = "feat-x";
const DIR = "specs/feat-x";
const PRD_PATH = `${DIR}/prd_feat-x.md`;
const SPEC_PATH = `${DIR}/spec.md`;
const DESIGN_PATH = `${DIR}/design.md`;
const MAP_PATH = `${DIR}/spec.requirements.json`;
const TRACE_PATH = `${DIR}/traceability.md`;
const RECEIPT_1 = `${DIR}/review/design-review-1.json`;
const RECEIPT_2 = `${DIR}/review/design-review-2.json`;
const REPORT_1 = `${DIR}/review/design-review-1.md`;

const REGISTER_IDS = ["AC-ONE", "AC-THREE", "AC-TWO"];
const TRACE_ORDER = ["AC-ONE", "AC-TWO", "AC-THREE"];
const SPEC_TEXT = "# Spec feat-x\n\nThe requirements are AC-ONE, AC-TWO and AC-THREE.\n";

const enc = (text) => new TextEncoder().encode(text);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestOf = (label) => sha256(`u1-fixture:${label}`);
const markerLine = (digest) => `<!-- technical-spec-sha256: ${digest} -->`;
const prdTextOf = (markers) => ["# PRD feat-x", "", ...markers, "", "Body text.", ""].join("\n");
const traceabilityText = (ids) => [
  "# Traceability",
  "",
  "| ID | Requirement | Evidence |",
  "| --- | --- | --- |",
  ...ids.map((id) => `| ${id} | requirement ${id} | evidence ${id} |`),
  "",
].join("\n");

const cleanState = (path, sha) => ({ path, tracked: true, modified: false, ignored: false, regular: true, sha256: sha });

/** The SourceSet a correct implementation must derive from the input (independent of the module under test). */
function sourcesOf(input) {
  const digestAt = (path) => input.pathStates.find((state) => state.path === path).sha256;
  return {
    prd: { path: input.submission.planPath, sha256: sha256(input.prdBytes) },
    spec: { path: input.submission.specPath, sha256: sha256(input.specBytes) },
    companions: [...input.companions].sort().map((path) => ({ path, sha256: digestAt(path) })),
  };
}

function withDigest(sources, path, digest) {
  const next = structuredClone(sources);
  if (path === next.prd.path) next.prd.sha256 = digest;
  else if (path === next.spec.path) next.spec.sha256 = digest;
  else next.companions.find((companion) => companion.path === path).sha256 = digest;
  return next;
}

/** A literal ReceiptSummary (closed keys); `previous` supplies the chain link of a delta unless overridden. */
function makeSummary({
  n = 1,
  kind = "initial",
  sources,
  verdict = "pass",
  openFindingIds = [],
  featureId = FEATURE,
  previous = null,
  previousPath,
  previousSha,
  reportSha,
}) {
  const delta = kind === "delta";
  return {
    path: `${DIR}/review/design-review-${n}.json`,
    sha256: digestOf(`receipt-${n}`),
    featureId,
    kind,
    round: delta ? 2 : 1,
    previousReceiptPath: delta ? (previousPath ?? previous.path) : null,
    previousReceiptSha256: delta ? (previousSha ?? previous.sha256) : null,
    sources,
    report: { path: `${DIR}/review/design-review-${n}.md`, sha256: reportSha ?? digestOf(`report-${n}`) },
    verdict,
    openFindingIds,
  };
}

function attachReceipts(input, receipts) {
  input.reviewReceipts = receipts;
  if (receipts === null) return;
  const known = new Set(input.pathStates.map((state) => state.path));
  const add = (path, sha) => {
    if (known.has(path)) return;
    known.add(path);
    input.pathStates.push(cleanState(path, sha));
  };
  for (const receipt of receipts) {
    if (Object.hasOwn(receipt, "refusal")) {
      add(receipt.path, digestOf(`refusal-stub:${receipt.path}`));
    } else {
      add(receipt.path, receipt.sha256);
      add(receipt.report.path, receipt.report.sha256);
    }
  }
}

/**
 * Builds a fully consistent input (fixture F) and applies the requested
 * deviations. `receipts` is `null`, an array, or a function of the current
 * SourceSet; the default is one initial PASS summary bound to the current
 * sources. `states` patches pathStates entries after everything is attached.
 */
function build(options = {}) {
  const specBytes = enc(options.specText ?? SPEC_TEXT);
  const specSha = sha256(specBytes);
  const prdBytes = enc(options.prdText ?? prdTextOf([markerLine(specSha)]));
  const traceBytes = enc(options.traceText ?? traceabilityText(TRACE_ORDER));
  const companions = [...(options.companions ?? [DESIGN_PATH, MAP_PATH, TRACE_PATH])];
  const known = { [DESIGN_PATH]: digestOf("design-v1"), [MAP_PATH]: digestOf("sidecar-v1"), [TRACE_PATH]: sha256(traceBytes), ...options.digests };
  const input = {
    submission: { featureId: FEATURE, planPath: PRD_PATH, planSha256: sha256(prdBytes), specPath: SPEC_PATH, specSha256: specSha, ...options.submission },
    prdBytes,
    specBytes,
    companions,
    traceability: Object.hasOwn(options, "traceability") ? options.traceability : { path: TRACE_PATH, bytes: traceBytes },
    register: options.register ?? { mode: "declared", mapPath: MAP_PATH, ids: [...REGISTER_IDS] },
    pathStates: [
      cleanState(PRD_PATH, sha256(prdBytes)),
      cleanState(SPEC_PATH, specSha),
      ...companions.map((path) => cleanState(path, known[path] ?? digestOf(path))),
    ],
    reviewReceipts: null,
  };
  const receipts = Object.hasOwn(options, "receipts") ? options.receipts : (current) => [makeSummary({ sources: current })];
  attachReceipts(input, typeof receipts === "function" ? receipts(sourcesOf(input)) : receipts);
  for (const [path, patch] of Object.entries(options.states ?? {})) {
    const existing = input.pathStates.find((state) => state.path === path);
    if (existing) Object.assign(existing, patch);
    else input.pathStates.push({ ...cleanState(path, digestOf(path)), ...patch });
  }
  return input;
}

const entry = (code, fields = {}) => ({ code, path: null, ids: [], expected: null, observed: null, ...fields });
const isInputError = (error) => error instanceof DesignConsistencyCheckError && error.code === "DCC-INPUT";

function assertInconsistent(result, entries) {
  assert.equal(result.ok, false);
  assert.deepEqual(result.inconsistencies, entries);
}

function directChain(input) {
  return reviewChainInconsistencies({ featureId: FEATURE, receipts: input.reviewReceipts, currentSources: sourcesOf(input) });
}

// ---------------------------------------------------------------------------
// U1-1 .. U1-4: consistent fixture, marker clauses.
// ---------------------------------------------------------------------------

test("U1-1: the consistent fixture is ok with counts 3/3 and a filled review", () => {
  const input = build();
  const result = checkDesignConsistency(input);
  assert.deepEqual(result, {
    schema: DESIGN_CONSISTENCY_CHECK_SCHEMA,
    ok: true,
    featureId: FEATURE,
    sources: sourcesOf(input),
    register: { mode: "declared", mapPath: MAP_PATH, registerCount: 3, traceabilityCount: 3 },
    review: {
      rounds: 1,
      latestReceiptSha256: input.reviewReceipts[0].sha256,
      verdict: "pass",
      openFindingIds: [],
      unreviewedSourceDelta: [],
    },
    inconsistencies: [],
  });
  assert.equal(DESIGN_CONSISTENCY_CHECK_SCHEMA, "pipeline.design-consistency-check.v1");
});

test("U1-1: currentDesignSources returns the sorted SourceSet with a null digest for an absent companion", () => {
  const ABSENT = `${DIR}/absent.md`;
  const input = build({
    companions: [TRACE_PATH, ABSENT, DESIGN_PATH, MAP_PATH],
    states: { [ABSENT]: { tracked: false, sha256: null } },
    receipts: null,
  });
  const sources = currentDesignSources({
    submission: input.submission,
    prdBytes: input.prdBytes,
    specBytes: input.specBytes,
    companions: input.companions,
    pathStates: [...input.pathStates].reverse(),
  });
  assert.deepEqual(sources, sourcesOf(input));
  assert.deepEqual(sources.companions.map(({ path }) => path), [ABSENT, DESIGN_PATH, MAP_PATH, TRACE_PATH]);
  assert.equal(sources.companions[0].sha256, null);
});

test("U1-2: a PRD without the technical-spec marker yields only DCC-PRD-MARKER-MISSING", () => {
  const input = build({ prdText: prdTextOf([]) });
  assertInconsistent(checkDesignConsistency(input), [entry("DCC-PRD-MARKER-MISSING", { path: PRD_PATH })]);
});

test("U1-3: two markers yield only DCC-PRD-MARKER-DUPLICATE with the count as observed", () => {
  const specSha = sha256(enc(SPEC_TEXT));
  assertInconsistent(
    checkDesignConsistency(build({ prdText: prdTextOf([markerLine(specSha), markerLine(specSha)]) })),
    [entry("DCC-PRD-MARKER-DUPLICATE", { path: PRD_PATH, observed: "2" })],
  );
  assertInconsistent(
    checkDesignConsistency(build({ prdText: prdTextOf([markerLine(specSha), markerLine(digestOf("other-spec"))]) })),
    [entry("DCC-PRD-MARKER-DUPLICATE", { path: PRD_PATH, observed: "2" })],
  );
});

test("U1-4: a single marker with a stale digest yields only DCC-PRD-MARKER-STALE", () => {
  const specSha = sha256(enc(SPEC_TEXT));
  const stale = digestOf("older-spec");
  assertInconsistent(
    checkDesignConsistency(build({ prdText: prdTextOf([markerLine(stale)]) })),
    [entry("DCC-PRD-MARKER-STALE", { path: PRD_PATH, expected: specSha, observed: stale })],
  );
});

// ---------------------------------------------------------------------------
// U1-5: marker grammar parity with the real TECHNICAL_SPEC_MARKER.
// ---------------------------------------------------------------------------

function expectedMarkerEntries(text, specSha) {
  const digests = [...text.matchAll(TECHNICAL_SPEC_MARKER)].map((match) => match[1]);
  if (digests.length === 0) return [entry("DCC-PRD-MARKER-MISSING", { path: PRD_PATH })];
  if (digests.length > 1) return [entry("DCC-PRD-MARKER-DUPLICATE", { path: PRD_PATH, observed: String(digests.length) })];
  return digests[0] === specSha ? [] : [entry("DCC-PRD-MARKER-STALE", { path: PRD_PATH, expected: specSha, observed: digests[0] })];
}

test("U1-5: marker counting is line-anchored and in exact parity with TECHNICAL_SPEC_MARKER", () => {
  const specSha = sha256(enc(SPEC_TEXT));
  // CONTRACT NOTE (section 2 / test 5 says a CRLF PRD yields MISSING "in parity with po-gate-authority"):
  // under the real regex (/^...$/gmu) JavaScript treats \r as a line terminator, so a CRLF PRD matches
  // exactly once. The two statements contradict each other, so the CRLF expectation is NOT hard-coded
  // here; it is derived from the real TECHNICAL_SPEC_MARKER (pure parity, the stated intent).
  const cases = [
    { name: "exact line", text: prdTextOf([markerLine(specSha)]), count: 1 },
    { name: "trailing text", text: prdTextOf([`${markerLine(specSha)} trailing`]), count: 0 },
    { name: "leading text", text: prdTextOf([`see ${markerLine(specSha)}`]), count: 0 },
    { name: "indented", text: prdTextOf([`  ${markerLine(specSha)}`]), count: 0 },
    { name: "uppercase digest", text: prdTextOf([markerLine(specSha.toUpperCase())]), count: 0 },
    { name: "63 hex characters", text: prdTextOf([markerLine(specSha.slice(1))]), count: 0 },
    { name: "CRLF line endings", text: prdTextOf([markerLine(specSha)]).replaceAll("\n", "\r\n"), count: null },
    { name: "inside a fenced block", text: prdTextOf(["```", markerLine(specSha), "```"]), count: null },
  ];
  for (const { name, text, count } of cases) {
    if (count !== null) assert.equal([...text.matchAll(TECHNICAL_SPEC_MARKER)].length, count, `fixture sanity: ${name}`);
    const result = checkDesignConsistency(build({ prdText: text }));
    assert.deepEqual(result.inconsistencies, expectedMarkerEntries(text, specSha), name);
    assert.equal(result.ok, result.inconsistencies.length === 0, name);
  }
});

// ---------------------------------------------------------------------------
// U1-6, U1-7: digest drift against the submission.
// ---------------------------------------------------------------------------

test("U1-6: a PRD digest differing from submission.planSha256 yields only DCC-PRD-DIGEST-DRIFT", () => {
  const declared = digestOf("declared-prd");
  const input = build({ submission: { planSha256: declared } });
  assertInconsistent(checkDesignConsistency(input), [
    entry("DCC-PRD-DIGEST-DRIFT", { path: PRD_PATH, expected: declared, observed: sha256(input.prdBytes) }),
  ]);
});

test("U1-7: a Spec digest differing from submission.specSha256 yields only DCC-SPEC-DIGEST-DRIFT", () => {
  const declared = digestOf("declared-spec");
  const input = build({ submission: { specSha256: declared } });
  assertInconsistent(checkDesignConsistency(input), [
    entry("DCC-SPEC-DIGEST-DRIFT", { path: SPEC_PATH, expected: declared, observed: sha256(input.specBytes) }),
  ]);
});

// ---------------------------------------------------------------------------
// U1-8 .. U1-10: register reconciliation.
// ---------------------------------------------------------------------------

test("U1-8: a removed AC-TWO row yields DCC-COUNT-MISMATCH at the traceability path with count 2", () => {
  const result = checkDesignConsistency(build({ traceText: traceabilityText(["AC-ONE", "AC-THREE"]) }));
  assertInconsistent(result, [entry("DCC-COUNT-MISMATCH", { path: TRACE_PATH, ids: ["AC-TWO"] })]);
  assert.deepEqual(result.register, { mode: "declared", mapPath: MAP_PATH, registerCount: 3, traceabilityCount: 2 });
  assert.notEqual(result.review, null, "the review block is independent of register findings");
  assert.equal(result.review.rounds, 1);
});

test("U1-9: an extra AC-FOUR row yields DCC-COUNT-MISMATCH at the sidecar path", () => {
  const result = checkDesignConsistency(build({ traceText: traceabilityText([...TRACE_ORDER, "AC-FOUR"]) }));
  assertInconsistent(result, [entry("DCC-COUNT-MISMATCH", { path: MAP_PATH, ids: ["AC-FOUR"] })]);
  assert.deepEqual(result.register, { mode: "declared", mapPath: MAP_PATH, registerCount: 3, traceabilityCount: 4 });
});

test("U1-9: a missing and an extra ID yield two DCC-COUNT-MISMATCH entries sorted by path", () => {
  const result = checkDesignConsistency(build({ traceText: traceabilityText(["AC-ONE", "AC-THREE", "AC-FOUR"]) }));
  assertInconsistent(result, [
    entry("DCC-COUNT-MISMATCH", { path: MAP_PATH, ids: ["AC-FOUR"] }),
    entry("DCC-COUNT-MISMATCH", { path: TRACE_PATH, ids: ["AC-TWO"] }),
  ]);
});

test("U1-10: AC-ONE listed twice yields only DCC-ID-DUPLICATE and counts duplicates", () => {
  const result = checkDesignConsistency(build({ traceText: traceabilityText(["AC-ONE", "AC-ONE", "AC-TWO", "AC-THREE"]) }));
  assertInconsistent(result, [entry("DCC-ID-DUPLICATE", { path: TRACE_PATH, ids: ["AC-ONE"] })]);
  assert.deepEqual(result.register, { mode: "declared", mapPath: MAP_PATH, registerCount: 3, traceabilityCount: 4 });
});

// ---------------------------------------------------------------------------
// U1-11: parseTraceabilityIds.
// ---------------------------------------------------------------------------

test("U1-11: parseTraceabilityIds collects only valid first-cell IDs of unfenced table rows, in document order", () => {
  const long80 = `AC-${"A".repeat(77)}`;
  const long81 = `AC-${"A".repeat(78)}`;
  assert.equal(long80.length, 80);
  assert.equal(long81.length, 81);
  const lines = [
    "# Traceability",
    "",
    "AC-NINE appears in prose and is not a table row.",
    "| ID | Requirement | Evidence |",
    "| --- | --- | --- |",
    "| `AC-ONE` | backticked first cell | e1 |",
    "|AC-TWO|no spaces around the cell|e2|",
    "   | AC-THREE | indented row | e3 |",
    "```md",
    "| AC-FENCED | inside a backtick fence | e4 |",
    "```",
    "  ~~~",
    "| AC-TILDE | inside a tilde fence | e5 |",
    "~~~",
    "| K1-x | a lowercase identifier is not a valid ID | e6 |",
    "| Some prose in the first cell | | e7 |",
    "| ``AC-DOUBLE`` | only one backtick pair is removed | e8 |",
    "| AC-ONE | duplicates are kept | e9 |",
    `| ${long80} | exactly 80 characters | e10 |`,
    `| ${long81} | 81 characters is too long | e11 |`,
    "| AC-FOUR | trailing row | e12 |",
  ];
  const expected = ["AC-ONE", "AC-TWO", "AC-THREE", "AC-ONE", long80, "AC-FOUR"];
  assert.deepEqual(parseTraceabilityIds(lines.join("\n")), expected);
  assert.deepEqual(parseTraceabilityIds(lines.join("\r\n")), expected);
  assert.deepEqual(parseTraceabilityIds(`${lines.join("\n")}\n`), expected);
  assert.deepEqual(parseTraceabilityIds(""), []);
});

// ---------------------------------------------------------------------------
// U1-12, U1-13: register modes (PO-Q1 option A / decision Y).
// ---------------------------------------------------------------------------

test("U1-12: an undeclared register is a visible skip: ok, mode undeclared, null counts, no register code", () => {
  const undeclared = { mode: "undeclared", mapPath: MAP_PATH };
  // With a traceability file present (its content, even duplicated IDs, is not reconciled).
  const withTraceability = checkDesignConsistency(build({
    companions: [DESIGN_PATH, TRACE_PATH],
    traceText: traceabilityText(["AC-ONE", "AC-ONE", "AC-NINE"]),
    register: undeclared,
  }));
  assert.equal(withTraceability.ok, true);
  assert.deepEqual(withTraceability.inconsistencies, []);
  assert.deepEqual(withTraceability.register, { mode: "undeclared", mapPath: MAP_PATH, registerCount: null, traceabilityCount: null });
  // Without any traceability file at all.
  const without = checkDesignConsistency(build({ companions: [DESIGN_PATH], traceability: null, register: undeclared }));
  assert.equal(without.ok, true);
  assert.deepEqual(without.inconsistencies, []);
  assert.deepEqual(without.register, { mode: "undeclared", mapPath: MAP_PATH, registerCount: null, traceabilityCount: null });
  assert.equal(DESIGN_CONSISTENCY_CODES.includes("DCC-REGISTER-UNDECLARED"), false);
});

test("U1-13: an invalid register yields only DCC-REGISTER-INVALID with the RT code and skips reconciliation", () => {
  const result = checkDesignConsistency(build({
    register: { mode: "invalid", mapPath: MAP_PATH, rtCode: "RT-MAP-SPEC-DIGEST" },
    traceText: traceabilityText(["AC-ONE", "AC-ONE", "AC-FOUR"]),
  }));
  assertInconsistent(result, [entry("DCC-REGISTER-INVALID", { path: MAP_PATH, observed: "RT-MAP-SPEC-DIGEST" })]);
  assert.deepEqual(result.register, { mode: "invalid", mapPath: MAP_PATH, registerCount: null, traceabilityCount: null });
});

// ---------------------------------------------------------------------------
// U1-14: adapter against the real requirement-traceability module.
// ---------------------------------------------------------------------------

function evaluateIn(files, specPath = SPEC_PATH) {
  const inventory = new Map(Object.entries(files).map(([path, bytes], index) => [path, {
    path, blobOid: String(index + 1).padStart(40, "a"), mode: "100644", readable: true, bytes,
  }]));
  return evaluateRequirementTraceability({
    specPath,
    candidate: { commit: "a".repeat(40), tree: "b".repeat(40) },
    candidateFiles: inventory,
    readCandidateFile: (path) => inventory.get(path).bytes,
  });
}

function sidecarBytes(specBytes, specSha256 = sha256(specBytes)) {
  return enc(`${JSON.stringify({
    schema: REQUIREMENT_TRACEABILITY_SCHEMA,
    specPath: SPEC_PATH,
    specSha256,
    criteria: [
      { id: "AC-ONE", predicate: "path-exists", path: DESIGN_PATH },
      { id: "AC-THREE", predicate: "path-exists", path: "src/not-present.js" },
      { id: "AC-TWO", predicate: "path-exists", path: DESIGN_PATH },
    ],
  })}\n`);
}

test("U1-14: registerFromRequirementTraceability maps declared, undeclared and RT errors to the three register shapes", () => {
  const specBytes = enc(SPEC_TEXT);
  const mapPath = requirementMapPath(SPEC_PATH);
  assert.equal(mapPath, MAP_PATH);

  const declared = evaluateIn({ [SPEC_PATH]: specBytes, [MAP_PATH]: sidecarBytes(specBytes), [DESIGN_PATH]: enc("design") });
  assert.equal(declared.mode, "declared");
  assert.equal(declared.missingCriteria.length, 1, "fixture sanity: AC-THREE is absent, and its status must be ignored");
  const declaredRegister = registerFromRequirementTraceability(declared, mapPath);
  assert.deepEqual(declaredRegister, { mode: "declared", mapPath: MAP_PATH, ids: ["AC-ONE", "AC-THREE", "AC-TWO"] });

  const undeclared = evaluateIn({ [SPEC_PATH]: specBytes });
  assert.equal(undeclared.mode, "undeclared");
  assert.deepEqual(registerFromRequirementTraceability(undeclared, mapPath), { mode: "undeclared", mapPath: MAP_PATH });

  let thrown = null;
  try {
    evaluateIn({ [SPEC_PATH]: specBytes, [MAP_PATH]: sidecarBytes(specBytes, digestOf("stale-spec")), [DESIGN_PATH]: enc("design") });
  } catch (error) { thrown = error; }
  assert.ok(thrown instanceof RequirementTraceabilityError);
  assert.equal(thrown.code, "RT-MAP-SPEC-DIGEST");
  assert.deepEqual(registerFromRequirementTraceability(thrown, mapPath), { mode: "invalid", mapPath: MAP_PATH, rtCode: "RT-MAP-SPEC-DIGEST" });

  // The adapter output is a valid `register` input for the check.
  assert.equal(checkDesignConsistency(build({ register: declaredRegister })).ok, true);
  const undeclaredResult = checkDesignConsistency(build({ register: registerFromRequirementTraceability(undeclared, mapPath) }));
  assert.equal(undeclaredResult.ok, true);
  assert.equal(undeclaredResult.register.mode, "undeclared");
  const invalidResult = checkDesignConsistency(build({ register: registerFromRequirementTraceability(thrown, mapPath) }));
  assert.deepEqual(invalidResult.inconsistencies.map(({ code }) => code), ["DCC-REGISTER-INVALID"]);
});

// ---------------------------------------------------------------------------
// U1-15, U1-16: companion binding and path states.
// ---------------------------------------------------------------------------

test("U1-15: a traceability file or a declared sidecar missing from the companions yields DCC-COMPANION-UNBOUND", () => {
  assertInconsistent(
    checkDesignConsistency(build({ companions: [DESIGN_PATH, MAP_PATH] })),
    [entry("DCC-COMPANION-UNBOUND", { path: TRACE_PATH })],
  );
  assertInconsistent(
    checkDesignConsistency(build({ companions: [DESIGN_PATH, TRACE_PATH] })),
    [entry("DCC-COMPANION-UNBOUND", { path: MAP_PATH })],
  );
});

test("U1-16: five extra companions yield UNSAFE x2, IGNORED, UNTRACKED, MODIFIED in code then path order", () => {
  const UNTRACKED = `${DIR}/notes-untracked.md`;
  const MODIFIED = `${DIR}/notes-modified.md`;
  const IGNORED = `${DIR}/notes-ignored.md`;
  const NON_REGULAR = `${DIR}/notes-link.md`;
  const TRAVERSAL = `${DIR}/../x.md`;
  const input = build({
    companions: [DESIGN_PATH, MAP_PATH, TRACE_PATH, UNTRACKED, MODIFIED, IGNORED, NON_REGULAR, TRAVERSAL],
    states: {
      [UNTRACKED]: { tracked: false },
      [MODIFIED]: { modified: true },
      [IGNORED]: { tracked: false, ignored: true },
      [NON_REGULAR]: { regular: false, modified: true },
      [TRAVERSAL]: { tracked: false },
    },
  });
  const result = checkDesignConsistency(input);
  assertInconsistent(result, [
    entry("DCC-PATH-UNSAFE", { path: TRAVERSAL }),
    entry("DCC-PATH-UNSAFE", { path: NON_REGULAR }),
    entry("DCC-PATH-IGNORED", { path: IGNORED }),
    entry("DCC-PATH-UNTRACKED", { path: UNTRACKED }),
    entry("DCC-PATH-MODIFIED", { path: MODIFIED }),
  ]);
  assert.equal(result.inconsistencies.some(({ code, path }) => code === "DCC-PATH-UNTRACKED" && path === TRAVERSAL), false, "an unsafe path never also reports UNTRACKED");
  assert.equal(result.inconsistencies.some(({ code, path }) => code === "DCC-PATH-MODIFIED" && path === NON_REGULAR), false, "an unsafe path never also reports MODIFIED");
  const sourcePaths = result.sources.companions.map(({ path }) => path);
  assert.deepEqual(sourcePaths, [...sourcePaths].sort(), "source companions are sorted by code unit");
});

test("U1-16: bound PRD, Spec, receipt and report paths are subject to the same path-state clauses", () => {
  const prdAndSpec = checkDesignConsistency(build({ states: { [PRD_PATH]: { modified: true }, [SPEC_PATH]: { tracked: false } } }));
  assertInconsistent(prdAndSpec, [
    entry("DCC-PATH-UNTRACKED", { path: SPEC_PATH }),
    entry("DCC-PATH-MODIFIED", { path: PRD_PATH }),
  ]);
  const receiptAndReport = checkDesignConsistency(build({ states: { [RECEIPT_1]: { modified: true }, [REPORT_1]: { ignored: true, tracked: false } } }));
  assertInconsistent(receiptAndReport, [
    entry("DCC-PATH-IGNORED", { path: REPORT_1 }),
    entry("DCC-PATH-MODIFIED", { path: RECEIPT_1 }),
  ]);
});

test("U1-16: an absent companion is untracked and appears with a null digest in the current sources", () => {
  const ABSENT = `${DIR}/absent.md`;
  const result = checkDesignConsistency(build({
    companions: [DESIGN_PATH, MAP_PATH, TRACE_PATH, ABSENT],
    states: { [ABSENT]: { tracked: false, sha256: null } },
    receipts: null,
  }));
  assertInconsistent(result, [entry("DCC-PATH-UNTRACKED", { path: ABSENT }), entry("DCC-REVIEW-RECEIPT-MISSING")]);
  assert.deepEqual(result.sources.companions.find(({ path }) => path === ABSENT), { path: ABSENT, sha256: null });
});

// ---------------------------------------------------------------------------
// U1-17, U1-18: review receipts missing / too many.
// ---------------------------------------------------------------------------

test("U1-17: null or empty reviewReceipts yield exactly DCC-REVIEW-RECEIPT-MISSING and a null review", () => {
  for (const receipts of [null, []]) {
    const input = build({ receipts });
    const result = checkDesignConsistency(input);
    assertInconsistent(result, [entry("DCC-REVIEW-RECEIPT-MISSING")]);
    assert.equal(result.review, null);
    assert.deepEqual(directChain(input), [entry("DCC-REVIEW-RECEIPT-MISSING")]);
  }
});

test("U1-18: three summaries yield DCC-REVIEW-ROUND-EXCEEDED with observed 3 and no chain finding", () => {
  const input = build({
    receipts: (current) => [1, 2, 3].map((n) => makeSummary({
      n, kind: "delta", sources: current, previousPath: `${DIR}/review/design-review-${n - 1}.json`, previousSha: digestOf(`receipt-${n - 1}`),
    })),
  });
  const result = checkDesignConsistency(input);
  assertInconsistent(result, [entry("DCC-REVIEW-ROUND-EXCEEDED", { observed: "3" })]);
  assert.equal(result.review, null);
  assert.deepEqual(directChain(input), [entry("DCC-REVIEW-ROUND-EXCEEDED", { observed: "3" })]);
});

// ---------------------------------------------------------------------------
// U1-19: review chain and source binding (a)-(g), PO-Q2 option b.
// ---------------------------------------------------------------------------

const OLD_DESIGN = digestOf("design-v0");

test("U1-19: (a) a delta that names the wrong previous digest yields DCC-REVIEW-DELTA-CHAIN", () => {
  const wrong = digestOf("wrong-previous");
  const input = build({
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) });
      return [initial, makeSummary({ n: 2, kind: "delta", sources: current, previous: initial, previousSha: wrong, verdict: "open-findings", openFindingIds: ["F-3"] })];
    },
  });
  const [initial, delta] = input.reviewReceipts;
  const expected = [entry("DCC-REVIEW-DELTA-CHAIN", { path: delta.path, expected: initial.sha256, observed: wrong })];
  const result = checkDesignConsistency(input);
  assertInconsistent(result, expected);
  assert.equal(result.review, null);
  assert.deepEqual(directChain(input), expected);
});

test("U1-19: (a) a delta that names the wrong previous path, or a second receipt that is not a delta, yields DCC-REVIEW-DELTA-CHAIN", () => {
  const wrongPath = build({
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) });
      return [initial, makeSummary({ n: 2, kind: "delta", sources: current, previous: initial, previousPath: `${DIR}/review/elsewhere.json` })];
    },
  });
  const [initial, delta] = wrongPath.reviewReceipts;
  assertInconsistent(checkDesignConsistency(wrongPath), [
    entry("DCC-REVIEW-DELTA-CHAIN", { path: delta.path, expected: initial.sha256, observed: delta.previousReceiptSha256 }),
  ]);

  const notDelta = build({
    receipts: (current) => [
      makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) }),
      makeSummary({ n: 2, sources: current }),
    ],
  });
  const [first, second] = notDelta.reviewReceipts;
  assertInconsistent(checkDesignConsistency(notDelta), [
    entry("DCC-REVIEW-DELTA-CHAIN", { path: second.path, expected: first.sha256, observed: null }),
  ]);
});

test("U1-19: (a) a chain whose oldest receipt is not an initial receipt names that receipt's path", () => {
  const input = build({
    receipts: (current) => [makeSummary({ n: 2, kind: "delta", sources: current, previousPath: RECEIPT_1, previousSha: digestOf("receipt-1") })],
  });
  assertInconsistent(checkDesignConsistency(input), [entry("DCC-REVIEW-DELTA-CHAIN", { path: RECEIPT_2 })]);
});

test("U1-19: (b) a delta whose sources equal the initial sources yields DCC-REVIEW-DELTA-CHAIN with null fields", () => {
  const input = build({
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: current });
      return [initial, makeSummary({ n: 2, kind: "delta", sources: structuredClone(current), previous: initial })];
    },
  });
  const result = checkDesignConsistency(input);
  assertInconsistent(result, [entry("DCC-REVIEW-DELTA-CHAIN")]);
  assert.deepEqual(directChain(input), [entry("DCC-REVIEW-DELTA-CHAIN")]);
});

test("U1-19: (c) a latest receipt bound to an old design.md digest yields DCC-REVIEW-RECEIPT-BINDING with canonical-set digests", () => {
  const input = build({ receipts: (current) => [makeSummary({ sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) })] });
  const [receipt] = input.reviewReceipts;
  const expected = [entry("DCC-REVIEW-RECEIPT-BINDING", {
    path: receipt.path,
    expected: sha256(canonical(sourcesOf(input))),
    observed: sha256(canonical(receipt.sources)),
  })];
  const result = checkDesignConsistency(input);
  assertInconsistent(result, expected);
  assert.equal(result.review, null);
  assert.deepEqual(directChain(input), expected);
});

test("U1-19: (d) changed report bytes yield DCC-REVIEW-RECEIPT-BINDING at the report path", () => {
  const input = build({ states: { [REPORT_1]: { sha256: digestOf("report-changed-after-review") } } });
  const result = checkDesignConsistency(input);
  assert.equal(result.ok, false);
  assert.deepEqual(result.inconsistencies.map(({ code, path }) => ({ code, path })), [{ code: "DCC-REVIEW-RECEIPT-BINDING", path: REPORT_1 }]);
  assert.equal(result.review, null);
  assert.deepEqual(directChain(input), [], "report drift is a checkDesignConsistency-only clause");
});

test("U1-19: (e) a refusal stub yields only DCC-REVIEW-RECEIPT-BINDING with the DRR code as observed and stops the chain", () => {
  const stubOnly = build({ receipts: [{ path: RECEIPT_1, refusal: "DRR-NONCANONICAL" }] });
  const result = checkDesignConsistency(stubOnly);
  assertInconsistent(result, [entry("DCC-REVIEW-RECEIPT-BINDING", { path: RECEIPT_1, observed: "DRR-NONCANONICAL" })]);
  assert.equal(result.review, null);
  assert.deepEqual(directChain(stubOnly), [entry("DCC-REVIEW-RECEIPT-BINDING", { path: RECEIPT_1, observed: "DRR-NONCANONICAL" })]);

  const stubStops = build({
    receipts: (current) => [makeSummary({ n: 1, featureId: "feat-y", sources: current }), { path: RECEIPT_2, refusal: "DRR-SHAPE" }],
  });
  assertInconsistent(checkDesignConsistency(stubStops), [entry("DCC-REVIEW-RECEIPT-BINDING", { path: RECEIPT_2, observed: "DRR-SHAPE" })]);
});

test("U1-19: (h) a summary for another feature yields DCC-REVIEW-RECEIPT-BINDING with expected and observed featureId", () => {
  const input = build({ receipts: (current) => [makeSummary({ featureId: "feat-y", sources: current })] });
  assertInconsistent(checkDesignConsistency(input), [
    entry("DCC-REVIEW-RECEIPT-BINDING", { path: RECEIPT_1, expected: FEATURE, observed: "feat-y" }),
  ]);
});

test("U1-19: (f) a delta receipt with later source drift is no inconsistency and lists the unreviewed delta", () => {
  const reviewedDesign = digestOf("design-reviewed");
  const reviewedPrd = digestOf("prd-reviewed");
  const reviewedTrace = digestOf("traceability-reviewed");
  const input = build({
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) });
      const reviewed = withDigest(withDigest(withDigest(current, DESIGN_PATH, reviewedDesign), PRD_PATH, reviewedPrd), TRACE_PATH, reviewedTrace);
      return [initial, makeSummary({ n: 2, kind: "delta", sources: reviewed, previous: initial, verdict: "open-findings", openFindingIds: ["F-3"] })];
    },
  });
  const current = sourcesOf(input);
  const result = checkDesignConsistency(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inconsistencies, []);
  assert.deepEqual(result.review, {
    rounds: 2,
    latestReceiptSha256: input.reviewReceipts[1].sha256,
    verdict: "open-findings",
    openFindingIds: ["F-3"],
    unreviewedSourceDelta: [
      { path: DESIGN_PATH, reviewedSha256: reviewedDesign, currentSha256: current.companions.find(({ path }) => path === DESIGN_PATH).sha256 },
      { path: PRD_PATH, reviewedSha256: reviewedPrd, currentSha256: current.prd.sha256 },
      { path: TRACE_PATH, reviewedSha256: reviewedTrace, currentSha256: current.companions.find(({ path }) => path === TRACE_PATH).sha256 },
    ],
  });
  assert.deepEqual(directChain(input), [], "the shared review clauses report no entry after a delta receipt");
});

test("U1-19: (f) a delta receipt whose reviewed companion is now absent lists a null current digest next to the path finding", () => {
  const reviewedDesign = digestOf("design-reviewed");
  const input = build({
    states: { [DESIGN_PATH]: { tracked: false, sha256: null } },
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) });
      return [initial, makeSummary({ n: 2, kind: "delta", sources: withDigest(current, DESIGN_PATH, reviewedDesign), previous: initial })];
    },
  });
  const result = checkDesignConsistency(input);
  assertInconsistent(result, [entry("DCC-PATH-UNTRACKED", { path: DESIGN_PATH })]);
  assert.deepEqual(result.review.unreviewedSourceDelta, [{ path: DESIGN_PATH, reviewedSha256: reviewedDesign, currentSha256: null }]);
});

test("U1-19: (g) an initial receipt with source drift yields DCC-REVIEW-RECEIPT-BINDING exactly as in (c)", () => {
  const input = build({ receipts: (current) => [makeSummary({ sources: withDigest(current, SPEC_PATH, digestOf("spec-v0")) })] });
  const [receipt] = input.reviewReceipts;
  const result = checkDesignConsistency(input);
  assertInconsistent(result, [entry("DCC-REVIEW-RECEIPT-BINDING", {
    path: receipt.path,
    expected: sha256(canonical(sourcesOf(input))),
    observed: sha256(canonical(receipt.sources)),
  })]);
  assert.equal(result.review, null);
});

// ---------------------------------------------------------------------------
// U1-20: determinism, exact key sets, DCC-INPUT.
// ---------------------------------------------------------------------------

const rotate = (list, by) => [...list.slice(by), ...list.slice(0, by)];
function seededShuffle(list, seed) {
  const copy = [...list];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const other = state % (index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
const orderings = (list) => [[...list].reverse(), rotate(list, 1), rotate(list, list.length - 1), seededShuffle(list, 7), seededShuffle(list, 42)];

const PROBLEM_UNTRACKED = `${DIR}/zzz-untracked.md`;
const PROBLEM_MODIFIED = `${DIR}/aaa-modified.md`;
function problemInput({ rows = ["AC-ONE", "AC-THREE", "AC-FOUR"], ids = REGISTER_IDS, companions } = {}) {
  return build({
    prdText: prdTextOf([]),
    submission: { specSha256: digestOf("declared-spec") },
    traceText: traceabilityText(rows),
    companions: companions ?? [DESIGN_PATH, MAP_PATH, TRACE_PATH, PROBLEM_UNTRACKED, PROBLEM_MODIFIED],
    register: { mode: "declared", mapPath: MAP_PATH, ids: [...ids] },
    states: { [PROBLEM_UNTRACKED]: { tracked: false }, [PROBLEM_MODIFIED]: { modified: true } },
    receipts: null,
  });
}
function expectedProblemEntries(specSha256) {
  return [
    entry("DCC-PATH-UNTRACKED", { path: PROBLEM_UNTRACKED }),
    entry("DCC-PATH-MODIFIED", { path: PROBLEM_MODIFIED }),
    entry("DCC-SPEC-DIGEST-DRIFT", { path: SPEC_PATH, expected: digestOf("declared-spec"), observed: specSha256 }),
    entry("DCC-PRD-MARKER-MISSING", { path: PRD_PATH }),
    entry("DCC-COUNT-MISMATCH", { path: MAP_PATH, ids: ["AC-FOUR"] }),
    entry("DCC-COUNT-MISMATCH", { path: TRACE_PATH, ids: ["AC-TWO"] }),
    entry("DCC-REVIEW-RECEIPT-MISSING"),
  ];
}

test("U1-20: the result is sorted by code index, path and ids, and independent of input order", () => {
  const baselineInput = problemInput();
  const specSha256 = sha256(baselineInput.specBytes);
  const baseline = checkDesignConsistency(baselineInput);
  assert.equal(baseline.ok, false);
  assert.deepEqual(baseline.inconsistencies, expectedProblemEntries(specSha256));
  assert.deepEqual(checkDesignConsistency(problemInput()), baseline, "same input, deep-equal result");

  // Input ORDER of companions, register ids and pathStates must not matter. (The traceability rows are
  // file content: reordering them changes the file's bytes and digest, so they are not shuffled.)
  const companions = [DESIGN_PATH, MAP_PATH, TRACE_PATH, PROBLEM_UNTRACKED, PROBLEM_MODIFIED];
  orderings(companions).forEach((shuffledCompanions, index) => {
    const shuffledInput = problemInput({
      companions: shuffledCompanions,
      ids: orderings(REGISTER_IDS)[index],
    });
    shuffledInput.pathStates = orderings(shuffledInput.pathStates)[index];
    assert.deepEqual(checkDesignConsistency(shuffledInput), baseline, `ordering variant ${index}`);
  });
});

test("U1-20: a delta-chain result is independent of companion and pathState order and the call does not mutate its input", () => {
  const makeInput = () => build({
    receipts: (current) => {
      const initial = makeSummary({ n: 1, sources: withDigest(current, DESIGN_PATH, OLD_DESIGN) });
      return [initial, makeSummary({ n: 2, kind: "delta", sources: withDigest(current, DESIGN_PATH, digestOf("design-reviewed")), previous: initial })];
    },
  });
  const baselineInput = makeInput();
  const snapshot = structuredClone(baselineInput);
  const baseline = checkDesignConsistency(baselineInput);
  assert.deepEqual(baselineInput, snapshot, "the input is not mutated");
  assert.equal(baseline.ok, true);
  orderings(baselineInput.companions).forEach((shuffledCompanions, index) => {
    const variant = makeInput();
    variant.companions = shuffledCompanions;
    variant.pathStates = orderings(variant.pathStates)[index];
    assert.deepEqual(checkDesignConsistency(variant), baseline, `ordering variant ${index}`);
  });
});

test("U1-20: exports, result, register, review and Entry key sets are exactly the contract's", () => {
  assert.deepEqual(DESIGN_CONSISTENCY_CODES, [
    "DCC-PATH-UNSAFE",
    "DCC-PATH-IGNORED",
    "DCC-PATH-UNTRACKED",
    "DCC-PATH-MODIFIED",
    "DCC-PRD-DIGEST-DRIFT",
    "DCC-SPEC-DIGEST-DRIFT",
    "DCC-PRD-MARKER-MISSING",
    "DCC-PRD-MARKER-DUPLICATE",
    "DCC-PRD-MARKER-STALE",
    "DCC-COMPANION-UNBOUND",
    "DCC-REGISTER-INVALID",
    "DCC-ID-DUPLICATE",
    "DCC-COUNT-MISMATCH",
    "DCC-REVIEW-RECEIPT-MISSING",
    "DCC-REVIEW-RECEIPT-BINDING",
    "DCC-REVIEW-ROUND-EXCEEDED",
    "DCC-REVIEW-DELTA-CHAIN",
  ]);
  assert.equal(Object.isFrozen(DESIGN_CONSISTENCY_CODES), true);
  assert.ok(DesignConsistencyCheckError.prototype instanceof Error);

  const resultKeys = ["featureId", "inconsistencies", "ok", "register", "review", "schema", "sources"];
  const registerKeys = ["mapPath", "mode", "registerCount", "traceabilityCount"];
  const reviewKeys = ["latestReceiptSha256", "openFindingIds", "rounds", "unreviewedSourceDelta", "verdict"];
  const entryKeys = ["code", "expected", "ids", "observed", "path"];

  const clean = checkDesignConsistency(build());
  assert.deepEqual(Object.keys(clean).sort(), resultKeys);
  assert.deepEqual(Object.keys(clean.register).sort(), registerKeys);
  assert.deepEqual(Object.keys(clean.review).sort(), reviewKeys);
  assert.deepEqual(Object.keys(clean.sources).sort(), ["companions", "prd", "spec"]);

  const problem = checkDesignConsistency(problemInput());
  assert.deepEqual(Object.keys(problem).sort(), resultKeys);
  assert.equal(problem.review, null);
  for (const item of problem.inconsistencies) assert.deepEqual(Object.keys(item).sort(), entryKeys);
  for (const item of problem.inconsistencies) assert.ok(DESIGN_CONSISTENCY_CODES.includes(item.code));

  const undeclared = checkDesignConsistency(build({ companions: [DESIGN_PATH], traceability: null, register: { mode: "undeclared", mapPath: MAP_PATH } }));
  assert.deepEqual(Object.keys(undeclared.register).sort(), registerKeys);
  const invalid = checkDesignConsistency(build({ register: { mode: "invalid", mapPath: MAP_PATH, rtCode: "RT-MAP-JSON" } }));
  assert.deepEqual(Object.keys(invalid.register).sort(), registerKeys);
});

test("U1-20: DCC-INPUT is thrown for a missing Spec pathState, tracked and ignored together, and a PRD digest that is not its bytes' digest", () => {
  const missingSpecState = build();
  missingSpecState.pathStates = missingSpecState.pathStates.filter(({ path }) => path !== SPEC_PATH);
  assert.throws(() => checkDesignConsistency(missingSpecState), isInputError);

  const trackedAndIgnored = build({ states: { [DESIGN_PATH]: { tracked: true, ignored: true } } });
  assert.throws(() => checkDesignConsistency(trackedAndIgnored), isInputError);

  const prdDigestMismatch = build({ states: { [PRD_PATH]: { sha256: digestOf("not-the-prd-bytes") } } });
  assert.throws(() => checkDesignConsistency(prdDigestMismatch), isInputError);
});

test("U1-20: further caller errors from the contract's DCC-INPUT list are thrown, never reported as inconsistencies", () => {
  const mutations = [
    ["input is not an object", () => null],
    ["unknown top-level key", (input) => { input.extra = 1; return input; }],
    ["missing submission", (input) => { delete input.submission; return input; }],
    ["wrong-typed companions", (input) => { input.companions = DESIGN_PATH; return input; }],
    ["wrong-typed prdBytes", (input) => { input.prdBytes = "text"; return input; }],
    ["duplicate companions", (input) => { input.companions.push(DESIGN_PATH); return input; }],
    ["companions contain the PRD path", (input) => { input.companions.push(PRD_PATH); return input; }],
    ["companions contain the Spec path", (input) => { input.companions.push(SPEC_PATH); return input; }],
    ["pathState missing for a companion", (input) => { input.pathStates = input.pathStates.filter(({ path }) => path !== DESIGN_PATH); return input; }],
    ["pathState for an unbound path", (input) => { input.pathStates.push(cleanState(`${DIR}/unbound.md`, digestOf("unbound"))); return input; }],
    ["duplicate pathState entry", (input) => { input.pathStates.push(cleanState(DESIGN_PATH, digestOf("design-v1"))); return input; }],
    ["Spec pathState digest differs from the Spec bytes", (input) => { input.pathStates.find(({ path }) => path === SPEC_PATH).sha256 = digestOf("other"); return input; }],
    ["traceability bytes differ from their pathState digest", (input) => { input.traceability = { path: TRACE_PATH, bytes: enc("changed") }; return input; }],
    ["traceability path is not <spec dir>/traceability.md", (input) => { input.traceability.path = `${DIR}/other.md`; return input; }],
    ["declared register without traceability", (input) => { input.traceability = null; return input; }],
    ["invalid register without traceability", (input) => { input.register = { mode: "invalid", mapPath: MAP_PATH, rtCode: "RT-MAP-JSON" }; input.traceability = null; return input; }],
    ["register id breaks the pattern", (input) => { input.register.ids = ["ac-one"]; return input; }],
    ["register ids are not unique", (input) => { input.register.ids = ["AC-ONE", "AC-ONE"]; return input; }],
    ["more than 64 register ids", (input) => { input.register.ids = Array.from({ length: 65 }, (_, index) => `AC-${index + 1}`); return input; }],
    ["summary digest differs from its pathState digest", (input) => { input.reviewReceipts[0].sha256 = digestOf("other-receipt"); return input; }],
    ["initial summary with round 2", (input) => { input.reviewReceipts[0].round = 2; return input; }],
    ["delta summary without a previous link", (input) => { Object.assign(input.reviewReceipts[0], { kind: "delta", round: 2 }); return input; }],
    ["summary with an extra key", (input) => { input.reviewReceipts[0].extra = true; return input; }],
  ];
  for (const [label, mutate] of mutations) {
    const mutated = mutate(build());
    assert.throws(() => checkDesignConsistency(mutated), isInputError, label);
  }
});
