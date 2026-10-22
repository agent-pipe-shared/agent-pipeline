// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review, D64 clauses
// (2026-10-20 Codex WSL greenfield, second run): (1) the Spec's acceptance criteria are located with the
// parser that registration and dispatch use BEFORE present-plan; (2) the review chain counts spent rounds
// independently of file names, and a sanitized report does not reset the count.
//
// Both clauses are driven for real: present-plan refuses a Spec whose criterion rows the parser cannot locate, and the receipt
// chain carries and checks the original/published report digest pair (D64 acceptance, 2026-10-22).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isCriterionId, scanAcceptedCriterionRows } from "../critic-accepted-contract.mjs";
import * as contract from "../critic-accepted-contract.mjs";
import { createDesignApprovalBinding } from "../design-approval-binding.mjs";
import { DESIGN_REVIEW_MAX_ROUNDS, createDesignReviewReceipt, summarizeDesignReviewReceipt } from "../design-review-receipt.mjs";
import { canonical } from "../po-approval-proof.mjs";
import { createReceiptFromDisk } from "../../scripts/design-review-receipt.mjs";
import { run, statePath } from "../../scripts/pipeline-state.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const ref = (path, text) => ({ path, sha256: sha(text) });
const sources = (specText) => ({ prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", specText), companions: [] });
const reviewer = { runner: "claude", model: "claude-sonnet-5-5" };

const specWith = (table) => `# Spec\n\n## Acceptance criteria\n\n${table}\n`;
const FOUR_COLUMN = specWith("| ID | Criterion | Test | Status |\n| --- | --- | --- | --- |\n| AC-1 | The thing works | t.test.mjs | open |");
const THREE_COLUMN = specWith("| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-1 | The thing works | t.test.mjs |");
const LEADING_ZERO = specWith("| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-01 | A leading-zero id | t.test.mjs |");
const TWO_COLUMN = specWith("| # | Criterion |\n| --- | --- |\n| 1 | The thing works |");

function receipt(specText, previous, name, ids = []) {
  const made = createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer, report: ref(name, name),
    openFindingIds: ids, reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}

test("D64 criterion parser: the supported shapes locate their rows (control for the refusals below)", () => {
  assert.deepEqual(scanAcceptedCriterionRows(THREE_COLUMN).map((row) => row.id), ["AC-1"]);
  assert.deepEqual(scanAcceptedCriterionRows(TWO_COLUMN).map((row) => row.id), ["AC-1"]);
  assert.equal(isCriterionId("AC-1"), true);
});

test("D64 criterion parser: the four-column table of the greenfield run locates no criterion", () => {
  assert.deepEqual(scanAcceptedCriterionRows(FOUR_COLUMN), []);
});

test("D64 criterion parser: a leading-zero id is not a criterion id and its row is not located", () => {
  assert.equal(isCriterionId("AC-01"), false);
  assert.equal(isCriterionId("AC-0"), false);
  assert.deepEqual(scanAcceptedCriterionRows(LEADING_ZERO), []);
});

test("D64 criterion parser (RED mirror): the located-row check is meaningful, a shape the parser supports is distinguishable from the unsupported one", () => {
  assert.notDeepEqual(scanAcceptedCriterionRows(THREE_COLUMN), scanAcceptedCriterionRows(FOUR_COLUMN));
});

test("D64 review chain: the spent-round count follows the chain, not the file names; a third round is refused under any name", () => {
  assert.equal(DESIGN_REVIEW_MAX_ROUNDS, 2);
  const r1 = receipt("spec-v1", null, "specs/f1/report-a.md", ["F-ONE"]);
  const r2 = receipt("spec-v2", { path: "specs/f1/anything-but-round-two.json", bytes: r1.bytes }, "specs/f1/report-b.md");
  assert.deepEqual([r2.receipt.kind, r2.receipt.round], ["delta", 2]);
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-1.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/report-c.md", "c"), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.deepEqual([third.ok, third.code], [false, "DRR-ROUND-EXCEEDED"]);
});

test("D64 review chain (RED mirror): a producer given a predecessor derives round 2 from the chain, the caller cannot label it 'initial'", () => {
  const r1 = receipt("spec-v1", null, "specs/f1/report-a.md");
  const forged = JSON.parse(Buffer.from(r1.bytes).toString("utf8"));
  assert.equal(forged.round, 1);
  assert.equal(forged.kind, "initial");
  const mislabelled = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-1.json", bytes: r1.bytes }, sources: sources("spec-v2"), reviewer,
    report: ref("specs/f1/report-b.md", "b"), openFindingIds: [], reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(mislabelled.ok, true);
  assert.equal(mislabelled.receipt.round, 2, "the producer derives round 2 from the chain; the caller cannot pick 'initial'");
});

// ---- present-plan: the criterion refusal (real present-plan on a disposable feature-profile root) ----
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const FEATURE = "feature-test";
function capture(fn) {
  const out = []; const err = [];
  const beforeLog = console.log; const beforeError = console.error;
  console.log = (...values) => out.push(values.join(" "));
  console.error = (...values) => err.push(values.join(" "));
  try { return { code: fn(), stdout: out.join("\n"), stderr: err.join("\n") }; }
  finally { console.log = beforeLog; console.error = beforeError; }
}
/** A submitted feature-profile root whose Spec is `spec`; the PRD carries the matching marker. */
function submittedRoot(spec, { governed = true } = {}) {
  const scratch = resolve(pluginRoot, "../../scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "alf-k11-d64-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  execFileSync("git", ["init", "-q", root], { env });
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "test: fixture base",
    "-m", "AI-Assisted: true\nDispatch: ALF-K11 (goldfish)"], { env });
  const planPath = `specs/${FEATURE}/prd.md`; const specPath = `specs/${FEATURE}/spec.md`;
  const now = "2026-10-03T00:00:00.000Z";
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, `specs/${FEATURE}`), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  // The consent marker is what makes this disposable root a governed project (AC-264 / D85: a governed project's submit-plan also checks the delivery hand-off).
  if (governed) writeFileSync(join(root, ".agent-pipeline/onboarding-consent.json"), JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: now }));
  const plan = `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${sha(spec)} -->\n# PRD\n${FEATURE}\n`;
  writeFileSync(join(root, planPath), plan);
  writeFileSync(join(root, specPath), spec);
  const evidence = { schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en", sourceSha256: "1".repeat(64), runtimeSha256: "2".repeat(64), receiptSha256: "3".repeat(64), repositoryFingerprint: "4".repeat(64) };
  const continuity = { schema: "pipeline.continuity.v0", featureId: FEATURE, revision: 0, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: planPath, sha256: sha(plan) }, spec: { path: specPath, sha256: sha(spec) }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
  writeFileSync(statePath(root), JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: FEATURE, planPath, phase: "design" }, planApproved: false, continuity, updatedAt: now }));
  const deps = { dir: root, now: () => now, gitCandidate: () => ({ ok: true, ...CANDIDATE }), gitHead: () => ({ ok: true, commit: CANDIDATE.commit }),
    gitUserName: () => "Fixture", poGateProfile: () => ({ ok: true, value: evidence }),
    poGateAuthority: () => ({ ok: true, value: { ...evidence, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: sha(plan), specPath, specSha256: sha(spec) } }),
    designAdvisoryAdmission: () => ({ ok: true, id: "a".repeat(64) }), runner: "codex" };
  const submitted = capture(() => run(["submit-plan", "--by", "coordinator", "--profile", "feature"], deps));
  assert.equal(submitted.code, 0, submitted.stderr);
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, "evidence/review-1.json"), "{}\n");
  return { root, deps, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function presentPlan(spec, options) {
  const f = submittedRoot(spec, options);
  try { return capture(() => run(["present-plan", "--by", "Fixture", "--review-receipt", "evidence/review-1.json"], f.deps)); }
  finally { f.cleanup(); }
}
const SUPPORTED_SHAPE_NAMES = [/\| # \| Criterion \| Evidence \|/u, /AC-<n>/u, /leading zero/u];

test("D64 present-plan: an unsupported criterion shape or id is refused before present-plan with the supported shapes named", () => {
  for (const [label, spec, id] of [["four-column table", FOUR_COLUMN, "AC-1"], ["leading-zero id", LEADING_ZERO, "AC-01"]]) {
    const refused = presentPlan(spec, { governed: false });
    assert.equal(refused.code, 2, label);
    assert.match(refused.stderr, /present-plan refused \(CAC-CRITERION-UNSUPPORTED\)/u, `${label}: ${refused.stderr}`);
    assert.ok(refused.stderr.includes(id), `${label}: names the offending id`);
    for (const shape of SUPPORTED_SHAPE_NAMES) assert.match(refused.stderr, shape, `${label}: names the supported shapes`);
  }
});

test("D64 present-plan (RED mirror): the refusal is scoped; a supported Spec and a Spec with no criterion rows are not refused by it", () => {
  for (const [label, spec] of [["supported three-column", THREE_COLUMN], ["supported two-column", TWO_COLUMN], ["no criterion rows at all", "# Technical Spec\nGuard admission regression.\n"]]) {
    const result = presentPlan(spec, { governed: false });
    assert.equal(result.code, 2, `${label}: the later receipt check still stops the bare fixture`);
    assert.doesNotMatch(result.stderr, /CAC-CRITERION-UNSUPPORTED/u, `${label}: ${result.stderr}`);
    assert.match(result.stderr, /present-plan refused \(DRR-/u, `${label}: ${result.stderr}`);
  }
});

// AC-264 / D85 (PO decision 2026-10-22): a GOVERNED project's submit-plan also checks the delivery hand-off, so a Spec with no admitted row never reaches
// present-plan there (the cases above run an ungoverned root, with the Spec bytes and assertions unchanged). D64 stays reachable in a governed root when
// the Spec has at least one admitted row beside the unsupported one, and an unready hand-off is refused at submit-plan with its typed code.
test("D64 present-plan with the delivery hand-off wired: governed root, one admitted row beside an unsupported one is still refused by D64; a Spec with no admitted row is refused at submit-plan", () => {
  const mixed = `${LEADING_ZERO}\n| # | Criterion |\n| --- | --- |\n| 1 | A supported row beside the unsupported AC-01 |\n`;
  assert.deepEqual(scanAcceptedCriterionRows(mixed).map((row) => row.id), ["AC-1"], "control: exactly one row is admitted, AC-01 is not");
  const refused = presentPlan(mixed);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /present-plan refused \(CAC-CRITERION-UNSUPPORTED\)/u, refused.stderr);
  assert.throws(() => presentPlan(FOUR_COLUMN), /PLR-HANDOFF-NO-CRITERION/u, "submit-plan stops a governed Spec with no admitted row, before present-plan");
});

test("D64 criterion inspection: the located and the unsupported rows come from the parser's own scan", () => {
  assert.equal(typeof contract.inspectSpecCriterionRows, "function");
  const ok = contract.inspectSpecCriterionRows(THREE_COLUMN);
  assert.deepEqual([ok.ok, ok.located], [true, ["AC-1"]]);
  const none = contract.inspectSpecCriterionRows("# Spec\n\nNo criteria.\n");
  assert.deepEqual([none.ok, none.located], [true, []]);
  const four = contract.inspectSpecCriterionRows(FOUR_COLUMN);
  assert.deepEqual([four.ok, four.code, four.unsupported.map((row) => row.id)], [false, "CAC-CRITERION-UNSUPPORTED", ["AC-1"]]);
  const zero = contract.inspectSpecCriterionRows(LEADING_ZERO);
  assert.deepEqual([zero.ok, zero.unsupported.map((row) => row.id)], [false, ["AC-01"]]);
  // A row outside a normative acceptance heading is not a criterion row and is never refused.
  assert.equal(contract.inspectSpecCriterionRows("# Spec\n\n## Examples\n\n| ID | Criterion | Test | Status |\n| --- | --- | --- | --- |\n| AC-1 | x | t | open |\n").ok, true);
  // The same id stated in a supported shape elsewhere is located, so a cross-reference row does not refuse the Spec.
  assert.equal(contract.inspectSpecCriterionRows(`${THREE_COLUMN}\n| AC-1 | tests/x.test.js | covered | open |\n`).ok, true);
  // A criterion id located twice is ambiguous at dispatch and is refused here too.
  const twice = contract.inspectSpecCriterionRows(specWith("| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-1 | one | t.test.mjs |\n| AC-1 | two | t.test.mjs |"));
  assert.deepEqual([twice.ok, twice.unsupported.map((row) => row.reason)], [false, ["duplicate"]]);
});

// ---- the sanitized review-chain digest pair ----
const ORIGINAL = sha("original report, unsanitized");
const PUBLISHED = sha("published report, sanitized");
const pairReport = (name, published = PUBLISHED, original = ORIGINAL) => ({ path: name, sha256: published, originalSha256: original });

test("D64 review chain: a sanitized report binds the original and the published digest and a delta after a formal correction needs no budget exception", () => {
  const specV1 = FOUR_COLUMN;
  const first = createDesignReviewReceipt({ featureId: "f1", previous: null, sources: sources(specV1), reviewer, report: pairReport("specs/f1/report-a.md"),
    openFindingIds: ["F-FORMAT"], reviewedAt: "2026-10-10T00:00:00.000Z" });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.receipt.report, { path: "specs/f1/report-a.md", sha256: PUBLISHED, originalSha256: ORIGINAL });
  assert.deepEqual(summarizeDesignReviewReceipt({ path: "specs/f1/receipt-1.json", bytes: first.bytes }).summary.report, first.receipt.report);
  // The formal correction changes the Spec bytes only; the delta is round 2 of the same chain, so no exception is needed.
  const corrected = createDesignReviewReceipt({ featureId: "f1", previous: { path: "specs/f1/receipt-1.json", bytes: first.bytes }, sources: sources(THREE_COLUMN),
    reviewer, report: pairReport("specs/f1/report-b.md", sha("b-published"), sha("b-original")), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z" });
  assert.equal(corrected.ok, true, JSON.stringify(corrected));
  assert.deepEqual([corrected.receipt.kind, corrected.receipt.round, corrected.receipt.verdict], ["delta", 2, "pass"]);
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts: [{ path: "specs/f1/receipt-1.json", bytes: first.bytes }, { path: "specs/f1/receipt-2.json", bytes: corrected.bytes }], currentSources: sources(THREE_COLUMN) });
  assert.equal(binding.ok, true, JSON.stringify(binding));
  assert.deepEqual(binding.binding.reviewReceipts.map((entry) => entry.round), [1, 2]);
  // The pair is part of what the receipt digest binds: the same review with another original digest is another receipt.
  const other = createDesignReviewReceipt({ featureId: "f1", previous: null, sources: sources(specV1), reviewer, report: pairReport("specs/f1/report-a.md", PUBLISHED, sha("another original")),
    openFindingIds: ["F-FORMAT"], reviewedAt: "2026-10-10T00:00:00.000Z" });
  assert.notEqual(other.sha256, first.sha256);
});

test("D64 review chain (RED mirror): a pair whose original equals the published digest, or is no digest, is refused with a typed code", () => {
  const make = (report) => createDesignReviewReceipt({ featureId: "f1", previous: null, sources: sources("spec-v1"), reviewer, report, openFindingIds: [], reviewedAt: "2026-10-10T00:00:00.000Z" });
  assert.deepEqual([make(pairReport("specs/f1/r.md", PUBLISHED, PUBLISHED)).ok, make(pairReport("specs/f1/r.md", PUBLISHED, PUBLISHED)).code], [false, "DRR-REPORT-PAIR"]);
  assert.equal(make(pairReport("specs/f1/r.md", PUBLISHED, "not-a-digest")).ok, false);
  assert.equal(make({ path: "specs/f1/r.md", sha256: PUBLISHED }).ok, true, "a report without an original digest stays valid (unsanitized reports are the ordinary case)");
});

test("D64 review chain: present-plan checks the pair in the receipt it is handed and refuses a forged one", () => {
  const spec = THREE_COLUMN;
  const f = submittedRoot(spec);
  try {
    const good = createDesignReviewReceipt({ featureId: FEATURE, previous: null,
      sources: { prd: ref(`specs/${FEATURE}/prd.md`, readFileSync(join(f.root, `specs/${FEATURE}/prd.md`), "utf8")), spec: ref(`specs/${FEATURE}/spec.md`, spec), companions: [] },
      reviewer, report: pairReport(`specs/${FEATURE}/review.md`), openFindingIds: [], reviewedAt: "2026-10-10T00:00:00.000Z" });
    assert.equal(good.ok, true, JSON.stringify(good));
    const forged = JSON.parse(Buffer.from(good.bytes).toString("utf8"));
    forged.report.originalSha256 = forged.report.sha256;
    writeFileSync(join(f.root, "evidence/review-1.json"), `${canonical(forged)}\n`);
    const refused = capture(() => run(["present-plan", "--by", "Fixture", "--review-receipt", "evidence/review-1.json"], f.deps));
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /present-plan refused \(DRR-REPORT-PAIR\)/u, refused.stderr);
    writeFileSync(join(f.root, "evidence/review-1.json"), Buffer.from(good.bytes));
    const accepted = capture(() => run(["present-plan", "--by", "Fixture", "--review-receipt", "evidence/review-1.json"], f.deps));
    assert.doesNotMatch(accepted.stderr, /DRR-REPORT-PAIR|DRR-SHAPE|DRR-JSON|DRR-NONCANONICAL/u, `a well-formed pair passes the receipt parse: ${accepted.stderr}`);
  } finally { f.cleanup(); }
});

test("D64 review chain: the producer derives the pair from an original report file and refuses the same bytes for both", () => {
  const f = submittedRoot(THREE_COLUMN);
  try {
    writeFileSync(join(f.root, `specs/${FEATURE}/review.md`), "published (sanitized) report\n");
    writeFileSync(join(f.root, `specs/${FEATURE}/review-original.md`), "original report with a private path\n");
    const request = { repo: f.root, featureId: FEATURE, reportPath: `specs/${FEATURE}/review.md`, prdPath: `specs/${FEATURE}/prd.md`, specPath: `specs/${FEATURE}/spec.md` };
    const env = { CLAUDECODE: "1" };
    const now = () => new Date("2026-10-10T00:00:00.000Z");
    const same = createReceiptFromDisk({ ...request, originalReportPath: `specs/${FEATURE}/review.md`, outPath: `specs/${FEATURE}/receipt-a.json` }, { env, now });
    assert.deepEqual([same.ok, same.code], [false, "DRR-REPORT-PAIR"]);
    const made = createReceiptFromDisk({ ...request, originalReportPath: `specs/${FEATURE}/review-original.md`, outPath: `specs/${FEATURE}/receipt-b.json` }, { env, now });
    assert.equal(made.ok, true, JSON.stringify(made));
    assert.equal(made.receipt.report.originalSha256, sha("original report with a private path\n"));
    assert.equal(made.receipt.report.sha256, sha("published (sanitized) report\n"));
  } finally { f.cleanup(); }
});
