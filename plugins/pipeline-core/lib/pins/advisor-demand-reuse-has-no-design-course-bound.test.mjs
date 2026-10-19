// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.advisor-demand-reuse-has-no-design-course-bound (AC-103).
 *
 * Acceptance points (backlog item, "Proposed course rule and acceptance"):
 *   A1 one Advisor consultation cycle per explicitly identified design course; governed
 *      fallback attempts stay finite inside that cycle.
 *   A2 the immutable initial question/evidence and the actual route outcome are recorded.
 *   A3 Elephant disposition and design revision proceed to readiness; packaging commits and
 *      readiness corrections cannot implicitly start another consultation cycle.
 *   A4 a materially new substantive question needs an explicitly new course (reason and prior
 *      course recorded); a new dispatch ID alone is not that decision.
 *   A5 the course budget persists and validates across restarts; refusals are truthful and
 *      never invent an Advisor PASS.
 *   A6 route admission, export consent and exact binding checks stay on every admitted attempt.
 *   A7 test matrix: same-question new dispatch/candidate, revision after advice, exhausted
 *      fallback, restart continuity, explicit new-course admission (covered by the cases below).
 * The real modules are exercised through their documented injection seams (sealed observers and
 * host store, as the adjacent store test). RED evidence runs a scratch MIRROR of the production
 * modules carrying the defect, selected through the two env overrides below; production is
 * never edited.
 *
 * Host limitation (K7): the file-mode case needs POSIX mode bits and the two managed-launch cases
 * need the managed-process fixture; they are skipped on native Windows, owner Coordinator, due
 * 2026-10-19, for the Linux/WSL run. The export-consent case runs on every host.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, "..");
const repoScratch = join(here, "..", "..", "..", "..", "scratch");
const url = (rel, envName) => process.env[envName] ?? pathToFileURL(join(lib, rel)).href;
const pure = await import(url("design-advisor-course.mjs", "ADVISOR_COURSE_PIN_PURE_MODULE"));
const storeMod = await import(url("design-advisor-course-store.mjs", "ADVISOR_COURSE_PIN_STORE_MODULE"));
const { createInitialAdvisorContext, validateInitialToFinalBinding, hashInitialAdvisorQuestion, designAdvisorValueSha256, designAdvisorBytesSha256, SOURCE_NAMES } = pure;
const { createDesignAdvisorCourseStore, designAdvisorRouteSlots } = storeMod;

const WIN = process.platform === "win32";
const HOST_LIMITATION = "host-limitation: native Windows host; owner Coordinator; due 2026-10-19 (Linux/WSL run, PO decision K7)";
const H = "1".repeat(64), DATE = "2026-09-28T00:00:00.000Z";
const CAND = { commit: "a".repeat(40), tree: "b".repeat(40) };

function context(reason = "architecture-tradeoff") {
  const sourceBytes = Object.fromEntries(SOURCE_NAMES.map(n => [n, Buffer.from(`${n}: controlled bytes\n`)]));
  const sources = Object.fromEntries(SOURCE_NAMES.map(n => [n, { path: `specs/feature/${n}.md`, sha256: designAdvisorBytesSha256(sourceBytes[n]) }]));
  const r = createInitialAdvisorContext({ repoFingerprint: H, featureId: "feature", authoringDispatchId: "author", initialCandidate: CAND, sources, sourceBytes, reason, routePolicySha256: H, createdAt: DATE });
  assert.equal(r.ok, true);
  return r.context;
}

function fixture(overrides = {}) {
  mkdirSync(repoScratch, { recursive: true });
  const common = realpathSync(mkdtempSync(join(repoScratch, "advisor-course-pin-")));
  const initial = context();
  const brands = new WeakMap(), receipts = new Map();
  const hostStore = {
    readForBinding(ref, binding) {
      const p = receipts.get(ref.id);
      if (!p || p.hostReceipt.sha256 !== ref.sha256 || designAdvisorValueSha256(p.courseBinding) !== designAdvisorValueSha256(binding.courseBinding)) return { status: "unavailable", code: "HOST-UNKNOWN" };
      const o = Object.freeze({}); brands.set(o, p); return o;
    },
    project(o) { if (!brands.has(o)) throw Error("unbranded"); return brands.get(o); },
  };
  const options = {
    gitCommonDir: common, repoFingerprint: H, featureId: "feature", runner: "codex",
    observeInitialContext: c => ({ status: "verified", contextSha256: designAdvisorValueSha256(c) }),
    observeCourseDecision: m => ({ status: "approved", ...m, decisionRef: "explicit-input", decisionSha256: H }),
    observeNoChild: m => ({ courseBinding: m, outcome: "unavailable", code: "callback-unavailable", childStarted: false, inputSubmitted: false, attemptCount: 0 }),
    hostStore, ...overrides,
  };
  const store = createDesignAdvisorCourseStore(options);
  return { common, initial, store, options, receipts, close: () => rmSync(common, { recursive: true, force: true }) };
}
async function openAndReserve(f) {
  const opened = await f.store.openInitialCourse({ initialContext: f.initial });
  assert.equal(opened.status, "available");
  const r = f.store.reserveCycle({ courseId: opened.courseId, initialContextSha256: opened.initialContextSha256 });
  assert.equal(r.status, "reserved");
  return r;
}
const dispatchOf = f => ({ dispatchId: "advisor", queueRevision: 0, candidateCommit: f.initial.initialCandidate.commit, candidateTree: f.initial.initialCandidate.tree });
function courseDir(f, courseId) {
  const root = join(f.common, "agent-pipeline", "design-advisor-courses");
  return join(root, readdirSync(root)[0], courseId);
}
function successorContext(f) {
  const next = structuredClone(f.initial);
  next.reason = "risk-review";
  next.questionSha256 = hashInitialAdvisorQuestion({ reason: next.reason, sources: next.sources });
  return next;
}
function answer(f, a, hostReceipt) {
  f.receipts.set(hostReceipt.id, { courseBinding: a.courseBinding, outcome: "answered", initialQuestionSha256: f.initial.questionSha256, initialEvidenceSha256: f.initial.evidenceSha256, hostReceipt, advisoryReceipt: { id: "advisor", sha256: H }, requestSha256: H, recipeSha256: H, answerSha256: H, reportCanonicalSha256: H, proposalSetSha256: designAdvisorValueSha256([]) });
}
const RECEIPT = { id: "drh_" + "2".repeat(32), sha256: "3".repeat(64) };

// ---- A1 -------------------------------------------------------------------------------------
test("A1: one cycle per course; a second reserve, a fresh reader and a terminal course never grant another cycle", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f);
    assert.equal(f.store.reserveCycle({ courseId: r.courseId, initialContextSha256: r.initialContextSha256 }).status, "recovery-required");
    assert.equal(createDesignAdvisorCourseStore(f.options).reserveCycle({ courseId: r.courseId, initialContextSha256: r.initialContextSha256 }).status, "recovery-required");
    assert.equal((await f.store.finalizeNoChild(r.token)).status, "reuse-terminal");
    for (const s of [f.store, createDesignAdvisorCourseStore(f.options)]) {
      const again = s.reserveCycle({ courseId: r.courseId, initialContextSha256: r.initialContextSha256 });
      assert.equal(again.status, "reuse-terminal");
      assert.equal(again.token, undefined);
    }
  } finally { f.close(); }
});

test("A1/A7: fallback attempts are finite (registry slots) and an exhausted or answered slot cannot be re-spent", async () => {
  assert.equal(designAdvisorRouteSlots({ runner: "codex" }).length, 1);
  const claude = designAdvisorRouteSlots({ runner: "claude" });
  assert.ok(claude.length >= 1 && claude.length <= 4);
  assert.equal(claude.filter(s => s.kind === "consult").length, 1);
  const f = fixture();
  try {
    const r = await openAndReserve(f), slot = r.slots[0];
    assert.equal(r.slots.length, 1);
    const a = f.store.reserveAttempt(r.token, { ...slot, dispatch: dispatchOf(f), requestSha256: H });
    assert.equal(a.status, "attempt-reserved");
    answer(f, a, RECEIPT);
    assert.equal((await f.store.finalizeAttempt(r.token, { hostReceipt: RECEIPT })).status, "attempt-finalized");
    const beyond = f.store.reserveAttempt(r.token, { ...slot, slot: 2, dispatch: dispatchOf(f), requestSha256: H });
    assert.notEqual(beyond.status, "attempt-reserved");
    assert.equal((await f.store.finalizeCycle(r.token, { hostReceipt: RECEIPT })).status, "reuse-terminal");
    assert.notEqual(f.store.reserveAttempt(r.token, { ...slot, dispatch: dispatchOf(f), requestSha256: H }).status, "attempt-reserved");
    assert.equal(f.store.readCurrent().attempts.length, 1);
  } finally { f.close(); }
});

// ---- A2 -------------------------------------------------------------------------------------
test("A2: the initial context stays byte-immutable and the actual outcome is recorded with the initial question/evidence digests", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f), dir = courseDir(f, r.courseId);
    const before = readFileSync(join(dir, "initial.json"));
    assert.equal(designAdvisorValueSha256(JSON.parse(before)), r.initialContextSha256);
    const a = f.store.reserveAttempt(r.token, { ...r.slots[0], dispatch: dispatchOf(f), requestSha256: H });
    answer(f, a, RECEIPT);
    await f.store.finalizeAttempt(r.token, { hostReceipt: RECEIPT });
    const done = await f.store.finalizeCycle(r.token, { hostReceipt: RECEIPT });
    assert.equal(done.outcome, "answered");
    assert.equal(done.terminalObservation.initialQuestionSha256, f.initial.questionSha256);
    assert.equal(done.terminalObservation.initialEvidenceSha256, f.initial.evidenceSha256);
    const changed = structuredClone(f.initial);
    changed.authoringDispatchId = "another-dispatch"; changed.initialCandidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
    assert.equal((await createDesignAdvisorCourseStore(f.options).openInitialCourse({ initialContext: changed })).courseId, r.courseId);
    assert.ok(readFileSync(join(dir, "initial.json")).equals(before));
  } finally { f.close(); }
});

// ---- A3 -------------------------------------------------------------------------------------
function binding() {
  const initial = context(), courseId = "dac_course", F = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const consultation = { courseId, initialContextSha256: designAdvisorValueSha256(initial), dispatch: { dispatchId: "advisor", queueRevision: 0, candidateCommit: CAND.commit, candidateTree: CAND.tree }, questionSha256: initial.questionSha256, evidenceSha256: initial.evidenceSha256, receiptSha256: H, answerSha256: H, reportCanonicalSha256: H, proposalSetSha256: designAdvisorValueSha256([{ proposalId: "p1", text: "x" }]) };
  const disposition = { schema: "pipeline.design-advisor-disposition.v1", courseId, consultationSha256: designAdvisorValueSha256(consultation), proposalSetSha256: consultation.proposalSetSha256, items: [{ proposalId: "p1", decision: "adopt", rationale: "Preserves original requirement.", revisionCommit: F.commit }], ownerDispatchId: "owner", createdAt: DATE };
  const sources = structuredClone(initial.sources); sources.design.sha256 = "2".repeat(64);
  const revisions = [{ schema: "pipeline.design-advisor-revision.v1", courseId, seq: 1, priorRevisionSha256: null, candidate: F, sources, parentCommit: CAND.commit, proposalIds: ["p1"], reason: "advisor-disposition" }];
  return { initial, courseId, consultation, disposition, revisions, final: { candidate: F, sources } };
}
function extend(b, reason, sources, hex) {
  const prev = b.revisions.at(-1), candidate = { commit: hex.repeat(40), tree: prev.candidate.tree };
  b.revisions.push({ schema: "pipeline.design-advisor-revision.v1", courseId: b.courseId, seq: b.revisions.length + 1, priorRevisionSha256: designAdvisorValueSha256(prev), candidate, sources, parentCommit: prev.candidate.commit, proposalIds: [], reason });
  b.final = { candidate, sources };
}

test("A3/A7: revision after advice, packaging commits and readiness corrections extend one chain without a new cycle", async () => {
  const b = binding();
  assert.equal(validateInitialToFinalBinding(b).ok, true);
  const noDrift = binding(); extend(noDrift, "packaging-only", noDrift.revisions[0].sources, "e");
  assert.equal(validateInitialToFinalBinding(noDrift).ok, true);
  const corrected = binding(); const s2 = structuredClone(corrected.revisions[0].sources); s2.traceability.sha256 = "4".repeat(64);
  extend(corrected, "readiness-correction", s2, "f");
  assert.equal(validateInitialToFinalBinding(corrected).ok, true);
  const f = fixture();
  try {
    const r = await openAndReserve(f); await f.store.finalizeNoChild(r.token);
    const before = f.store.readCurrent().stateSha256;
    assert.equal(validateInitialToFinalBinding(noDrift).ok, true);
    assert.equal(f.store.readCurrent().stateSha256, before);
    assert.equal(f.store.reserveCycle({ courseId: r.courseId, initialContextSha256: r.initialContextSha256 }).status, "reuse-terminal");
  } finally { f.close(); }
});

test("A3/A4: packaging cannot drift sources, packaging/correction cannot smuggle proposals, a changed input needs a new course", () => {
  const drift = binding(); const s = structuredClone(drift.revisions[0].sources); s.spec.sha256 = "5".repeat(64);
  extend(drift, "packaging-only", s, "e");
  assert.equal(validateInitialToFinalBinding(drift).code, "DAC-PACKAGING-SOURCE-DRIFT");
  const smuggle = binding(); extend(smuggle, "readiness-correction", smuggle.revisions[0].sources, "e");
  smuggle.revisions.at(-1).proposalIds = ["p1"];
  assert.equal(validateInitialToFinalBinding(smuggle).ok, false);
  const input = binding(); input.revisions[0].sources.input.sha256 = "9".repeat(64);
  assert.equal(validateInitialToFinalBinding(input).code, "DAC-NEW-COURSE-REQUIRED");
  const relabeled = binding(); relabeled.consultation.dispatch.candidateCommit = "c".repeat(40);
  assert.equal(validateInitialToFinalBinding(relabeled).ok, false);
});

// ---- A4 -------------------------------------------------------------------------------------
test("A4/A7: a new dispatch/candidate for the same question reuses the course; a new course needs terminal parent, new question and a fresh owner decision", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f);
    const changed = structuredClone(f.initial); changed.authoringDispatchId = "other"; changed.initialCandidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
    const reused = await f.store.openInitialCourse({ initialContext: changed });
    assert.equal(reused.courseId, r.courseId);
    assert.equal(reused.status, "recovery-required");
    const next = successorContext(f);
    assert.equal((await f.store.openNewCourse({ initialContext: next, parentCourseId: r.courseId })).code, "DACS-NEW-COURSE-PARENT");
    await f.store.finalizeNoChild(r.token);
    assert.equal((await createDesignAdvisorCourseStore({ ...f.options, observeCourseDecision: null }).openNewCourse({ initialContext: next, parentCourseId: r.courseId })).status, "unavailable");
    assert.equal(f.store.readCurrent().courseId, r.courseId);
    assert.equal((await f.store.openNewCourse({ initialContext: f.initial, parentCourseId: r.courseId })).code, "DACS-NO-NEW-SUBSTANTIVE-QUESTION");
    const made = await f.store.openNewCourse({ initialContext: next, parentCourseId: r.courseId });
    assert.equal(made.status, "available");
    assert.notEqual(made.courseId, r.courseId);
    const rec = JSON.parse(readFileSync(join(courseDir(f, made.courseId), "course.json")));
    assert.equal(rec.initiation.kind, "new-substantive-question");
    assert.equal(rec.initiation.decisionRef, "explicit-input");
    assert.equal(rec.parentCourse.courseId, r.courseId);
    assert.match(rec.parentCourse.terminalRecordSha256, /^[a-f0-9]{64}$/);
    const second = f.store.reserveCycle({ courseId: made.courseId, initialContextSha256: made.initialContextSha256 });
    await f.store.finalizeNoChild(second.token);
    assert.equal((await f.store.openNewCourse({ initialContext: f.initial, parentCourseId: made.courseId })).code, "DACS-OWNER-DECISION-REUSED");
  } finally { f.close(); }
});

// ---- A5 -------------------------------------------------------------------------------------
test("A5/A7: a finite course cap bounds successor courses and refuses without touching the store", async () => {
  const f = fixture();
  try {
    const first = await openAndReserve(f); await f.store.finalizeNoChild(first.token);
    const next = successorContext(f);
    let seq = 1, current = first;
    const bounded = createDesignAdvisorCourseStore({ ...f.options, observeCourseDecision: m => ({ status: "approved", ...m, decisionRef: "owner-" + (++seq), decisionSha256: designAdvisorValueSha256({ seq }) }) });
    for (let n = 2; n <= 32; n++) {
      current = await bounded.openNewCourse({ initialContext: n % 2 === 0 ? next : f.initial, parentCourseId: current.courseId });
      assert.equal(current.status, "available");
      const res = bounded.reserveCycle({ courseId: current.courseId, initialContextSha256: current.initialContextSha256 });
      assert.equal((await bounded.finalizeNoChild(res.token)).status, "reuse-terminal");
    }
    const inventory = readdirSync(f.common, { recursive: true }).sort();
    assert.equal((await bounded.openNewCourse({ initialContext: f.initial, parentCourseId: current.courseId })).code, "DACS-INDEX-BOUND");
    assert.deepEqual(readdirSync(f.common, { recursive: true }).sort(), inventory);
  } finally { f.close(); }
});

test("A5: restart keeps the budget; tampered, oversized or reset state is refused as unavailable, never as a fresh cycle; reads claim no authority", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f);
    const fresh = createDesignAdvisorCourseStore(f.options);
    assert.equal(fresh.readCurrent().status, "recovery-required");
    const read = fresh.readCurrent();
    assert.equal(read.hostExecutionVerified, false);
    assert.equal(read.implementationAuthority, false);
    const state2 = join(courseDir(f, r.courseId), "state-0002.json");
    const value = JSON.parse(readFileSync(state2)); value.status = "available";
    writeFileSync(state2, JSON.stringify(value) + "\n", { mode: 0o600 });
    const bad = createDesignAdvisorCourseStore(f.options);
    assert.equal(bad.readCurrent().status, "unavailable");
    assert.notEqual(bad.reserveCycle({ courseId: r.courseId, initialContextSha256: r.initialContextSha256 }).status, "reserved");
  } finally { f.close(); }
  const g = fixture();
  try {
    await openAndReserve(g);
    const root = join(g.common, "agent-pipeline", "design-advisor-courses");
    writeFileSync(join(root, readdirSync(root)[0], "index-0001.json"), Buffer.alloc(65537));
    assert.equal(g.store.readCurrent().status, "unavailable");
  } finally { g.close(); }
});

test("A5: a no-child or failed route is recorded as unavailable/failed and the course never reports an answered result", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f);
    const done = await f.store.finalizeNoChild(r.token);
    assert.equal(done.status, "reuse-terminal");
    assert.equal(done.outcome, "unavailable");
    assert.equal(done.terminalObservation.childStarted, false);
    assert.equal(done.terminalObservation.inputSubmitted, false);
    assert.equal(done.terminalObservation.attemptCount, 0);
    assert.equal(done.hostExecutionVerified, false);
    assert.equal(done.implementationAuthority, false);
  } finally { f.close(); }
  const g = fixture({ observeNoChild: m => ({ courseBinding: m, outcome: "answered", code: "x", childStarted: false, inputSubmitted: false, attemptCount: 0 }) });
  try {
    const r = await openAndReserve(g);
    assert.equal((await g.store.finalizeNoChild(r.token)).status, "unavailable");
    assert.equal(g.store.readCurrent().status, "recovery-required");
  } finally { g.close(); }
});

// ---- A6 -------------------------------------------------------------------------------------
test("A6: attempts need exact route step, request digest and initial candidate; a fabricated or foreign host receipt cannot finalize", async () => {
  const f = fixture();
  try {
    const r = await openAndReserve(f), slot = r.slots[0], ok = dispatchOf(f);
    for (const bad of [{ routeStepSha256: "f".repeat(64) }, { dispatch: { ...ok, candidateCommit: "c".repeat(40) } }, { dispatch: { ...ok, candidateTree: "d".repeat(40) } }, { requestSha256: "not-a-digest" }, { slot: 2 }]) {
      assert.equal(f.store.reserveAttempt(r.token, { ...slot, dispatch: ok, requestSha256: H, ...bad }).code, "DACS-ATTEMPT-BUDGET");
    }
    const a = f.store.reserveAttempt(r.token, { ...slot, dispatch: ok, requestSha256: H });
    assert.equal(a.status, "attempt-reserved");
    assert.equal((await f.store.finalizeAttempt(r.token, { hostReceipt: { id: "drh_" + "f".repeat(32), sha256: H } })).status, "unavailable");
    answer(f, { ...a, courseBinding: { ...a.courseBinding, slot: 9 } }, RECEIPT);
    assert.notEqual((await f.store.finalizeAttempt(r.token, { hostReceipt: RECEIPT })).status, "attempt-finalized");
    assert.equal(createDesignAdvisorCourseStore(f.options).readCurrent().status, "recovery-required");
    assert.equal((await f.store.finalizeNoChild(r.token)).code, "DACS-NO-CHILD-HAS-ATTEMPT");
  } finally { f.close(); }
});

test("A6: the course initial context needs actual provenance and does not mint a cycle without it", async () => {
  const f = fixture({ observeInitialContext: null });
  try {
    const res = await f.store.openInitialCourse({ initialContext: f.initial });
    assert.equal(res.status, "unavailable");
    assert.equal(f.store.readCurrent().status, "absent");
    assert.equal(f.store.reserveCycle({ courseId: "dac_invented", initialContextSha256: H }).status, "refused");
  } finally { f.close(); }
});

// Runs on every host: no managed child process and no Linux-only readiness host store are needed,
// because a denial after the course opened is decided by the sealed admission seam alone. The
// first export decision belongs to the pre-course source-metadata gate (a denial there refuses
// without opening a course); the second belongs to the post-course initial admission, which is the
// path that must consume the course with zero attempts.
test("A6: export consent denial leaves the course consumed with zero attempts (coordinator, sealed admission seam)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { coordinateInitialDesignAdvisory } = await import(pathToFileURL(join(lib, "design-advisory-coordinator-v2.mjs")).href);
  const { createCodexAdvisorExecution } = await import(pathToFileURL(join(lib, "codex-advisor-execution.mjs")).href);
  mkdirSync(repoScratch, { recursive: true });
  const root = realpathSync(mkdtempSync(join(repoScratch, "advisor-consent-pin-")));
  try {
    const git = a => execFileSync("git", a, { cwd: root, timeout: 10000, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
    git(["init", "--quiet"]); git(["config", "user.email", "fixture@example.invalid"]); git(["config", "user.name", "Synthetic fixture"]);
    const sources = Object.fromEntries(SOURCE_NAMES.map(n => {
      const content = `Synthetic ${n} document.\n`; writeFileSync(join(root, `${n}.md`), content);
      return [n, { path: `${n}.md`, sha256: createHash("sha256").update(content).digest("hex") }];
    }));
    writeFileSync(join(root, "pipeline.user.yaml"), "advisor_export:\n  consent: approved\n");
    git(["add", ...SOURCE_NAMES.map(n => `${n}.md`)]); git(["commit", "--quiet", "-m", "Synthetic sources"]);
    const commit = git(["rev-parse", "HEAD"]), tree = git(["rev-parse", "HEAD^{tree}"]);
    const dispatch = { dispatchId: "advisor-fixture", queueRevision: 0, candidateCommit: commit, candidateTree: tree };
    const route = { model: "fixture-model", effort: "high", sourceSha256: "b".repeat(64), candidateCommit: commit };
    const admissionWith = exportDecisions => {
      const calls = { export: 0 };
      return { calls, admission: { requireReady: () => ({ status: "ready" }), observeCurrentMetadata: m => m, observeRegisteredRoute: m => m.route,
        admitHostExport: () => ({ decision: exportDecisions[Math.min(calls.export++, exportDecisions.length - 1)] }) } };
    };
    const execute = admission => coordinateInitialDesignAdvisory({ repoRoot: root, featureId: "advisor-feature", authoringDispatchId: "elephant-author", sources, reason: "risk-review", profile: "feature", dispatch, route,
      hostExecution: createCodexAdvisorExecution({ repoRoot: root, trustedExecutablePath: process.execPath, inputDirectory: root, admission }) });
    const deny = admissionWith(["approved", "denied"]);
    const denied = await execute(deny.admission);
    assert.equal(denied.status, "unavailable-pending-final-approval", JSON.stringify(denied));
    assert.equal(deny.calls.export, 2);
    assert.equal(denied.course.outcome, "permission-denied");
    assert.equal(denied.course.attempts.length, 0);
    assert.equal(denied.failureEvidence.childStarted, false);
    assert.equal(denied.failureEvidence.inputSubmitted, false);
    assert.equal(denied.failureEvidence.attemptCount, 0);
    // the consumed course is not reopened by a later, fully consenting attempt
    const again = await execute(admissionWith(["approved"]).admission);
    assert.equal(again.code, "DAC2-COURSE-ALREADY-EXISTS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("A5: file-mode drift of private course metadata fails closed (needs POSIX mode bits)", { skip: WIN ? HOST_LIMITATION + "; chmod mode bits unavailable on win32" : false }, async () => {
  const { chmodSync } = await import("node:fs");
  const f = fixture();
  try {
    await openAndReserve(f);
    const root = join(f.common, "agent-pipeline", "design-advisor-courses");
    chmodSync(join(root, readdirSync(root)[0], "index-0001.json"), 0o644);
    assert.equal(f.store.readCurrent().status, "unavailable");
  } finally { f.close(); }
});

// ---- A4/A7 second managed launch -------------------------------------------------------------
// The first managed launch publishes advisor-finalization.json into its own, already released
// journal directory. The inventory used to reject that file as an unknown managed entry, so the
// next launch in the same repository ended in recovery-required / SDC-AUTHORITY-UNAVAILABLE.
async function managedLaunchModules() {
  const load = rel => import(pathToFileURL(join(lib, rel)).href);
  const [fixtureMod, coordinator, support, journal, worktree] = await Promise.all([
    load("codex-advisor-host.fixture.mjs"), load("design-advisory-coordinator-v2.mjs"), load("native-managed-authority-support.mjs"),
    load("codex-host-process-journal.mjs"), load("worktree-lifecycle.mjs")]);
  return { advisorHostFixture: fixtureMod.advisorHostFixture, coordinate: coordinator.coordinateInitialDesignAdvisory,
    readInventory: support.readNativeManagedInventory, createPort: journal.createManagedCodexAuthorityProducerPort,
    inspectRepository: worktree.inspectSignedDescriptorCustodyRepository };
}
const launchArgs = f => ({ repoRoot: f.root, featureId: "advisor-feature", authoringDispatchId: "elephant-author", sources: f.sources, reason: "risk-review", profile: "feature", dispatch: f.args.dispatch, route: f.route, hostExecution: f.execution });
const ownerDecision = m => ({ status: "approved", ...m, decisionRef: "owner-new-question", decisionSha256: "a".repeat(64) });
function retainedLaunchDirectories(root) {
  const base = join(root, ".git", "agent-pipeline", "advisor-codex");
  return readdirSync(base, { recursive: true }).filter(p => p.endsWith("advisor-finalization.json")).map(p => dirname(join(base, p)));
}

test("A4/A7: a second managed launch in the same repository is not refused by the first launch's retained finalization record", { skip: WIN ? HOST_LIMITATION + "; coordinator fixture CRHS-INPUT on win32" : false }, async t => {
  const { advisorHostFixture, coordinate } = await managedLaunchModules();
  const f = advisorHostFixture(t), input = launchArgs(f);
  const first = await coordinate(input);
  assert.equal(first.status, "answered", JSON.stringify(first));
  assert.equal(retainedLaunchDirectories(f.root).length, 1);
  const successor = await coordinate({ ...input, reason: "architecture-tradeoff", dispatch: { ...input.dispatch, dispatchId: "advisor-successor" }, newCourseParentId: first.courseBinding.courseId, observeInitialCourseDecision: ownerDecision });
  assert.equal(successor.status, "answered", JSON.stringify(successor));
  assert.notEqual(successor.courseBinding.courseId, first.courseBinding.courseId);
  assert.equal(retainedLaunchDirectories(f.root).length, 2);
});

test("A4/A7: only a terminal-verified launch is released; unknown, mis-schemed and unterminated entries still fail closed", { skip: WIN ? HOST_LIMITATION + "; coordinator fixture CRHS-INPUT on win32" : false }, async t => {
  const { advisorHostFixture, coordinate, readInventory, createPort, inspectRepository } = await managedLaunchModules();
  const { unlinkSync } = await import("node:fs");
  const f = advisorHostFixture(t);
  assert.equal((await coordinate(launchArgs(f))).status, "answered");
  const repository = inspectRepository(f.root), [dir] = retainedLaunchDirectories(f.root);
  const reasonOf = run => { try { run(); } catch (error) { return error.reason; } return null; };
  const held = () => createPort({ repository }).readBaseline().legacyOperations.length;
  // the retained finalization record is classified and its completed launch is no longer held
  assert.equal(reasonOf(() => readInventory(repository, "managed-codex")), null);
  assert.equal(held(), 0);
  // a launch without its terminal journal is not terminal-verified and stays held
  const terminalPath = join(dir, "terminal.json"), terminalBytes = readFileSync(terminalPath);
  unlinkSync(terminalPath);
  assert.equal(held(), 1);
  writeFileSync(terminalPath, terminalBytes, { mode: 0o600 });
  assert.equal(held(), 0);
  // an entry outside the closed name list is still refused
  const foreign = join(dir, "foreign.json");
  writeFileSync(foreign, JSON.stringify({ schema: "pipeline.codex-host-foreign.v1" }), { mode: 0o600 });
  assert.equal(reasonOf(() => readInventory(repository, "managed-codex")), "native-managed-unknown-managed-entry");
  unlinkSync(foreign);
  assert.equal(reasonOf(() => readInventory(repository, "managed-codex")), null);
  // a finalization name carrying another record's schema is still refused
  const finalization = join(dir, "advisor-finalization.json"), finalizationBytes = readFileSync(finalization);
  writeFileSync(finalization, JSON.stringify({ schema: "pipeline.codex-readiness-finalization.v1" }), { mode: 0o600 });
  assert.equal(reasonOf(() => readInventory(repository, "managed-codex")), "native-managed-managed-schema");
  writeFileSync(finalization, finalizationBytes, { mode: 0o600 });
  assert.equal(reasonOf(() => readInventory(repository, "managed-codex")), null);
});
