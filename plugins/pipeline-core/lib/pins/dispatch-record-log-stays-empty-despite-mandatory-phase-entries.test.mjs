// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.dispatch-record-log-stays-empty-despite-mandatory-phase-entries (AC-163).
// Original item: backlog/items/2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries.md
// Proposal point: "a mechanical check at dispatch close that rejects a terminal record with an empty log".
// Restated by PO decision D77 (K6, specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md):
//   "a new terminal record with an empty log is refused at write; committed v3 history stays readable".
// Both halves are pinned, plus the v4 read refusal:
//   write half  - writeDispatchRecordObject refuses a NEW terminal v3 or v4 record with log: [] (code record-log,
//                 message names the repair) and leaves no file behind; the completed-undelivered v4 observation keeps
//                 its documented exception.
//   read half   - a committed terminal v3 record with an empty log (NVA-B-CONSUMER-SAFE-STALE-ALLOWLIST-1,
//                 NVA-B-INSTALLER-ATTESTATION-RUNNER-PARITY-1) stays readable; a terminal v4 record with an empty log
//                 stays refused at read, so the v4 write refusal is defense in depth behind the read validator.
// All cases drive the real validators and the real writer; nothing is mocked.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { validateDispatchRecord, validatePreviousDispatchRecord, reportSha256, OUTCOME_CLASSIFICATION_SCHEMA } from "../dispatch-record.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { writeDispatchRecordObject } from "../../scripts/dispatch-record-write.mjs";
import { checkDispatchRecordCollision } from "../guard/dispatch-record-lane.mjs";
import { CLOSING_ALLOWANCE } from "../dispatch-budget-core.mjs";

const SHA = "a".repeat(40);
const DONE = "b".repeat(40);
const trigger = () => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5", reason: "no mandatory review trigger" });
const base = { taskId: "PIN-LOG-1", agentType: "goldfish-implementor", model: "claude-sonnet-5-5", effort: "medium", rulesetSha: "0.7.0+local", dispatcher: "Elephant", criticSkip: skip() };
const v3Opening = () => ({ schema: "pipeline.dispatch-record.v3", ...base, candidateCommit: SHA, resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null });
const reportText = "Done.";
const v3Terminal = (log) => ({ ...v3Opening(), candidateCommit: DONE, resultSha256: "d".repeat(64), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] } });
const v4Terminal = (log) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", ...base, candidateCommit: DONE, resultSha256: reportSha256(reportText), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] }, outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" } });
const undelivered = () => {
  const { criticSkip, ...rest } = base;
  return { schema: "pipeline.dispatch-record.v4", runner: "antigravity", ...rest, model: "gemini-3.8-flash-high", effort: "high", candidateCommit: SHA, resultSha256: null,
    outcome: "completed-no-delivery", commits: [], log: [], report: null,
    outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "PIN-LOG-1", attemptId: "attempt-1" },
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: { ...trigger(), rigorLevel: 2 }, appliedRow: "T3" } };
};
const goodLog = [{ phase: "verify", toolUseCount: 12, note: "focused checks passed" }];
const REPAIR = /append the mandatory phase entries/u;
const writeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "pin-log-write-"));
  mkdirSync(join(root, "evidence"));
  return root;
};
const target = (record) => `evidence/dispatch-record-${record.taskId}.json`;
const refusal = (fn) => { try { fn(); } catch (error) { return error; } return null; };

test("control: an in-progress opening may start with an empty log (progress not yet made)", () => {
  assert.deepEqual(validatePreviousDispatchRecord(v3Opening()).log, []);
});

test("control: a terminal record carrying phase entries validates (v3 and v4)", () => {
  assert.equal(validatePreviousDispatchRecord(v3Terminal(goodLog)).log.length, 1);
  assert.equal(validateDispatchRecord(v4Terminal(goodLog)).log.length, 1);
});

test("log entries are strictly shaped: phase and non-negative integer toolUseCount are required", () => {
  for (const bad of [[{ phase: "", toolUseCount: 1 }], [{ phase: "verify" }], [{ phase: "verify", toolUseCount: -1 }], [{ phase: "verify", toolUseCount: 1.5 }], [{ phase: "verify", toolUseCount: 1, extra: true }]]) {
    assert.throws(() => validateDispatchRecord(v4Terminal(bad)), `entry ${JSON.stringify(bad)} must be rejected`);
  }
});

test("log is bounded (<= 2048 entries)", () => {
  const entries = Array.from({ length: 2049 }, () => ({ phase: "p", toolUseCount: 1 }));
  assert.throws(() => validateDispatchRecord(v4Terminal(entries)));
});

test("native host finalizer sources a non-empty log for a successful return (source-shape pin)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, "../native-goldfish-host-finalizer.mjs"), "utf8");
  assert.match(src, /log:\s*observedNativeHostProgress\(/u);
  assert.match(src, /phase:\s*"host-dispatch-prepared"/u);
  assert.match(src, /phase:\s*"host-return-observed"/u);
});

// READ half (D77): committed v3 history with an empty log stays readable, through both v3 entry points.
test("ACCEPTANCE: committed v3 history stays readable - a terminal v3 record with an empty log validates at read", () => {
  assert.deepEqual(validatePreviousDispatchRecord(v3Terminal([])).log, []);
  assert.deepEqual(validateDispatchRecord(v3Terminal([])).log, []);
});

// READ half (D77): the v4 contract is unchanged - a terminal v4 record with an empty log is refused at read.
test("ACCEPTANCE: a terminal v4 authored-commit record with an empty log is rejected at read, naming the repair", () => {
  const error = refusal(() => validateDispatchRecord(v4Terminal([])));
  assert.ok(error, "terminal v4 record with log: [] must fail validation");
  assert.equal(error.code, "record-log");
  assert.match(error.message, REPAIR);
});

// WRITE half (D77): a NEW terminal record with an empty log is refused at write, with a message that names the repair.
// For v3 this is the only gate, because the read validator accepts committed v3 history; for v4 the read validator
// already refuses first, so this case pins that the writer's observable result is the same typed refusal.
for (const [label, build] of [["v3", v3Terminal], ["v4", v4Terminal]]) {
  test(`ACCEPTANCE: a new terminal ${label} record with an empty log is refused at write and leaves no file`, () => {
    const root = writeRoot();
    const record = build([]);
    const error = refusal(() => writeDispatchRecordObject({ repoRoot: root, target: target(record), record }));
    assert.ok(error, `terminal ${label} record with log: [] must not be written`);
    assert.equal(error.code, "record-log");
    assert.match(error.message, REPAIR);
    assert.equal(existsSync(join(root, target(record))), false, "a refused write leaves no record behind");
  });
}

test("control: a new terminal v3 record with one log entry is written", () => {
  const root = writeRoot();
  const record = { ...v3Terminal(goodLog), model: "claude-sonnet-5" };
  const receipt = writeDispatchRecordObject({ repoRoot: root, target: target(record), record });
  assert.equal(receipt.target, target(record));
  assert.equal(existsSync(join(root, target(record))), true);
});

// Added acceptance (0.7.0, F-06): "a dispatch record and a design review can be started from a generated, valid skeleton
// with the digests pre-filled; the agent fills judgment fields only". The dispatch-record half is pinned by
// scripts/dispatch-briefing.test.mjs ("init-dispatch-record prints a valid opening v4 record ..."). The design-review half
// is the receipt producer: it takes the review's judgment (open finding ids, an observed identity) and derives every
// digest, the time and the runner itself. This case drives the real producer and the real receipt parser.
test("ACCEPTANCE: a design review receipt is generated with every digest derived from disk; the caller supplies only judgment", async () => {
  const { createReceiptFromDisk } = await import("../../scripts/design-review-receipt.mjs");
  const { parseDesignReviewReceipt } = await import("../design-review-receipt.mjs");
  const { createHash } = await import("node:crypto");
  const { writeFileSync } = await import("node:fs");
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  const repo = mkdtempSync(join(tmpdir(), "pin-log-receipt-"));
  mkdirSync(join(repo, "specs/f/review"), { recursive: true });
  const files = { "specs/f/prd.md": "# PRD\n", "specs/f/spec.md": "# Spec\n", "specs/f/review/report.md": "# Report\n" };
  for (const [path, text] of Object.entries(files)) writeFileSync(join(repo, path), text);
  const request = { repo, featureId: "feat-x", reportPath: "specs/f/review/report.md", prdPath: "specs/f/prd.md",
    specPath: "specs/f/spec.md", outPath: "specs/f/review/receipt.json", openFindingIds: ["F-TWO", "F-ONE"] };
  const result = createReceiptFromDisk(request, { env: { CLAUDECODE: "1" }, now: () => new Date("2026-10-18T09:30:00.000Z") });
  assert.equal(result.ok, true, JSON.stringify(result));
  const parsed = parseDesignReviewReceipt(readFileSync(join(repo, request.outPath)));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.receipt.sources.prd.sha256, digest(files["specs/f/prd.md"]));
  assert.equal(parsed.receipt.sources.spec.sha256, digest(files["specs/f/spec.md"]));
  assert.equal(parsed.receipt.report.sha256, digest(files["specs/f/review/report.md"]));
  assert.equal(parsed.receipt.reviewedAt, "2026-10-18T09:30:00.000Z");
  assert.equal(parsed.receipt.reviewer.runner, "claude");
  assert.deepEqual(parsed.receipt.openFindingIds, ["F-ONE", "F-TWO"]);
  assert.equal(parsed.receipt.verdict, "open-findings");
  // A digest cannot be supplied by hand: the request shape has no field for one.
  assert.equal(Object.keys(request).some((key) => /sha|digest|hash/iu.test(key)), false);
});

test("control: the completed-undelivered v4 observation keeps its empty-log exception at read and at write", () => {
  const record = undelivered();
  assert.deepEqual(validateDispatchRecord(record).log, []);
  const root = writeRoot();
  const receipt = writeDispatchRecordObject({ repoRoot: root, target: target(record), record });
  assert.equal(receipt.target, target(record));
  assert.equal(existsSync(join(root, target(record))), true);
});

// ---------------------------------------------------------------------------------------------------------------------
// MEASUREMENT (ALF-K24): why were the per-phase log entries skipped - budget pressure, ordering or wording?
// The item's Proposal asks for this measurement; it was recorded nowhere. Each cause is derived from the code and the
// briefing texts below and shown on a fixture. Nothing is mocked except the lane's own injection seams.
// ---------------------------------------------------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "../..");
const text = (relative) => readFileSync(resolve(pluginRoot, relative), "utf8");
const AGENTS = ["goldfish-implementor", "goldfish-deep", "goldfish-mechanic"];
const bullet = (source, heading) => source.split("\n").find((line) => line.includes(heading)) ?? "";

// --- ORDERING: the commit-then-record collision (lane code, unclaimed record path) ---------------------------------------
const ORDER_ID = "ORDER-LOG-1";
const BASE = "1".repeat(40);
const COMMIT_1 = "2".repeat(40);
const COMMIT_2 = "3".repeat(40);
const RECORD_PATH = `evidence/dispatch-record-${ORDER_ID}.json`;
const REQUESTED = `/repo/${RECORD_PATH}`;
// An unclaimed record: no resolvable git common dir means no owner claim (an orchestrator-made record, or a runner whose
// payload carries no agent identity). The lane then falls back to the git-history and terminal-overwrite tests.
const lane = (existing, incoming, { priorCommit = null } = {}) => checkDispatchRecordCollision({
  relPath: RECORD_PATH, requested: REQUESTED, payload: incoming === null ? "not json" : JSON.stringify(incoming), root: "/repo", input: null,
  dependencies: {
    resolveGitCommonDirFn: () => null,
    existsSyncFn: (path) => existing !== null && path === REQUESTED,
    readFileSyncFn: () => JSON.stringify(existing),
    gitCommitForTaskIdFn: () => priorCommit,
  } });
const interim = (candidateCommit, commits, log) => ({ ...v4Terminal(log), taskId: ORDER_ID, outcome: "committed-pending-report", candidateCommit, commits, resultSha256: reportSha256(reportText), report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] } });

test("MEASURED ordering (a): a record opened AFTER the first commit that cites its task id is refused, so only a terminal write remains", () => {
  const opening = { ...v3Opening(), taskId: ORDER_ID };
  assert.equal(lane(null, opening), null, "control: the opening written first (before any commit cites the id) is admitted");
  const hit = lane(null, opening, { priorCommit: COMMIT_1 });
  assert.ok(hit, "an in-progress opening after a citing commit must be refused");
  assert.match(hit.reason, /already bound to commit/u);
});

test("MEASURED ordering (b): an Edit-shaped partial payload can never append to an unclaimed interim record", () => {
  const existing = interim(COMMIT_1, [COMMIT_1], goodLog);
  const hit = lane(existing, null);
  assert.ok(hit, "an Edit payload is not JSON, so on an unclaimed terminal-by-denylist record it cannot prove identity");
  assert.match(hit.reason, /already been used by a completed dispatch/u);
});

test("MEASURED ordering (c): the SECOND post-commit checkpoint of a multi-commit package is refused on an unclaimed record", () => {
  const first = interim(COMMIT_1, [COMMIT_1], goodLog);
  const second = interim(COMMIT_2, [COMMIT_1, COMMIT_2], [...goodLog, { phase: "commit-2", toolUseCount: 20 }]);
  // The validator itself demands candidateCommit = the last commit for every terminal-by-denylist outcome, the interim one
  // included - so a checkpoint that follows the template literally MUST move candidateCommit with each commit.
  assert.deepEqual(validateDispatchRecord(second).commits, [COMMIT_1, COMMIT_2]);
  assert.equal(lane({ ...first, outcome: "in-progress", candidateCommit: BASE, commits: [], report: null }, first), null, "control: the first checkpoint (existing record still in-progress) is admitted");
  // QG-04 (ALF-K34, PO decision 2026-10-22 "align the unclaimed path"): K24 measured here that the unclaimed path REFUSED this write
  // (candidateCommit changed against a terminal-by-denylist record). The PO decided the unclaimed path must admit it, so the measured
  // refusal is replaced by the admission; the refusals that remain are pinned by the K34 negative controls below.
  assert.equal(lane(first, second), null, "the unclaimed path admits the second checkpoint of a multi-commit package (K34)");
});

// Decided by the PO 2026-10-22 (ALF-K34): the unclaimed path honours the contract the claimed path already honours
// (see parallel-work-in-one-checkout-is-unsafe.test.mjs, PARWORK-M2a/M2b).
test("DESIRED ordering (c): the second checkpoint is admitted on an unclaimed record too", () => {
  const first = interim(COMMIT_1, [COMMIT_1], goodLog);
  const second = interim(COMMIT_2, [COMMIT_1, COMMIT_2], [...goodLog, { phase: "commit-2", toolUseCount: 20 }]);
  assert.equal(lane(first, second), null);
});

// K34 negative controls: every refusal the unclaimed path keeps against an interim record.
const COMMIT_3 = "4".repeat(40);
const secondCheckpoint = () => interim(COMMIT_2, [COMMIT_1, COMMIT_2], [...goodLog, { phase: "commit-2", toolUseCount: 20 }]);
const COMPLETED = /already been used by a completed dispatch/u;

test("K34 control: a three-commit chain is admitted checkpoint by checkpoint", () => {
  const twoCommits = secondCheckpoint();
  const third = interim(COMMIT_3, [COMMIT_1, COMMIT_2, COMMIT_3], [...goodLog, { phase: "commit-3", toolUseCount: 30 }]);
  assert.equal(lane(twoCommits, third), null);
});

test("K34 refusal kept: a FINAL record stays immutable (changed candidateCommit and extended commits)", () => {
  const final = { ...interim(COMMIT_1, [COMMIT_1], goodLog), outcome: "completed" };
  const hit = lane(final, secondCheckpoint());
  assert.ok(hit);
  assert.match(hit.reason, COMPLETED);
});

test("K34 refusal kept: a different taskId in the incoming write is refused", () => {
  const first = interim(COMMIT_1, [COMMIT_1], goodLog);
  assert.match(lane(first, { ...secondCheckpoint(), taskId: "OTHER-TASK-1" }).reason, COMPLETED);
  assert.match(lane(first, { ...secondCheckpoint(), taskId: undefined }).reason, COMPLETED);
});

test("K34 refusal kept: shrinking, reordering or replacing the commit list is refused", () => {
  const first = interim(COMMIT_2, [COMMIT_1, COMMIT_2], goodLog);
  const next = (candidateCommit, commits) => interim(candidateCommit, commits, goodLog);
  for (const [label, incoming] of [
    ["shrunk", next(COMMIT_1, [COMMIT_1])],
    ["reordered", next(COMMIT_3, [COMMIT_2, COMMIT_1, COMMIT_3])],
    ["replaced", next(COMMIT_3, [COMMIT_3, COMMIT_2, COMMIT_1])],
    ["first commit replaced", next(COMMIT_3, [COMMIT_3, COMMIT_2, COMMIT_3])],
    ["same length, different last", next(COMMIT_3, [COMMIT_1, COMMIT_3])],
    ["emptied", next(COMMIT_1, [])],
  ]) {
    const hit = lane(first, incoming);
    assert.ok(hit, `${label} commit list must stay refused`);
    assert.match(hit.reason, COMPLETED);
  }
});

test("K34 refusal kept: an incoming write that is not the interim outcome (final, in-progress) against an interim record with changed candidateCommit", () => {
  const first = interim(COMMIT_1, [COMMIT_1], goodLog);
  const grown = secondCheckpoint();
  assert.match(lane(first, { ...grown, outcome: "completed" }).reason, COMPLETED);
  assert.match(lane(first, { ...grown, outcome: "in-progress" }).reason, COMPLETED);
});

test("K34 refusal kept: an Edit-shaped (non-JSON) append to an interim record stays refused", () => {
  assert.match(lane(interim(COMMIT_1, [COMMIT_1], goodLog), null).reason, COMPLETED);
});

test("K34 refusal kept: a non-array commits field on either side is refused", () => {
  const first = interim(COMMIT_1, [COMMIT_1], goodLog);
  assert.match(lane(first, { ...secondCheckpoint(), commits: COMMIT_2 }).reason, COMPLETED);
  assert.match(lane({ ...first, commits: undefined }, secondCheckpoint()).reason, COMPLETED);
});

// --- WORDING: what the texts an agent reads actually say about the log ---------------------------------------------------
test("MEASURED wording: the briefing names the exact log entry keys the validator accepts (phase, toolUseCount, note)", () => {
  const marker = bullet(text("templates/prompts/goldfish-task.md"), "**Cheap progress markers");
  assert.match(marker, /`phase`/u, "the progress-marker bullet must name the phase key");
  assert.match(marker, /`toolUseCount`/u, "the progress-marker bullet must name the toolUseCount key");
  assert.match(marker, /`note`/u, "the optional note key is where a command, exit code or artifact pointer fits");
});

test("MEASURED wording: the role named authoritative for the duty (GF-09-D) states the log entry, not only the briefing", () => {
  const role = text("roles/goldfish.md");
  const duty = role.slice(role.indexOf("Report durability (GF-09-D)"), role.indexOf("No new capability"));
  assert.ok(duty.length > 0, "GF-09-D block located");
  for (const needle of ["`log`", "`phase`", "`toolUseCount`"]) assert.ok(duty.includes(needle), `GF-09-D must name ${needle}`);
});

for (const agent of AGENTS) {
  test(`MEASURED wording: agents/${agent}.md names the log entry keys it asks for`, () => {
    const duty = bullet(text(`agents/${agent}.md`), "Report durability (GF-09-D");
    for (const needle of ["`log`", "`phase`", "`toolUseCount`"]) assert.ok(duty.includes(needle), `${agent} must name ${needle}`);
  });
}

// --- BUDGET + FOLD: every log entry rides on a record write the protocol already demands ---------------------------------
// There is no append primitive: the sanctioned CLI "cannot update an existing record" and a model write replaces the whole
// file, so a log-only append is a full extra tool use against the base cap. The scheduled record writes are the opening, the
// read-back, one checkpoint per commit and the final write.
const scheduledRecordWrites = ({ commits }) => 2 + commits + 1;
const logOnlyWrites = ({ suites }, folded) => (folded ? 0 : suites);

test("MEASURED budget: record maintenance is a function of commits and suites, and a log-only append costs one tool use each", () => {
  const shape = { commits: 3, suites: 4 };
  assert.equal(scheduledRecordWrites(shape), 6);
  assert.equal(logOnlyWrites(shape, false), 4, "unfolded: each suite-finish log append is its own write");
  const baseCap = 35;
  assert.ok((scheduledRecordWrites(shape) + logOnlyWrites(shape, false)) / baseCap > 0.25, "unfolded record upkeep takes more than a quarter of a 35-call base cap");
  assert.equal(CLOSING_ALLOWANCE, 5);
  // The template's closing arithmetic: message file + git add + git commit + ONE record write = four calls; one call is spare.
  assert.match(text("templates/prompts/goldfish-task.md"), /message file \+ `git add` \+ `git commit` \+ the record write are four calls/u);
});

test("ACCEPTANCE fold: the briefing carries each log entry in a record write the protocol already makes - no log-only write is demanded", () => {
  const shape = { commits: 3, suites: 4 };
  const template = text("templates/prompts/goldfish-task.md");
  const checkpoint = bullet(template, "**Report durability (GF-09-D");
  const marker = bullet(template, "**Cheap progress markers");
  const folded = /same write/u.test(checkpoint) && /in the same write/u.test(marker) && /never as a log-only write/u.test(marker);
  assert.equal(logOnlyWrites(shape, folded), 0, "log entries must ride on the checkpoint / finding / final writes");
  const role = text("roles/goldfish.md");
  assert.match(role.slice(role.indexOf("Checkpoint-after-every-commit"), role.indexOf("Report-last-act")), /same write/u, "GF-09-D step 2 folds the entry into the checkpoint");
  for (const agent of AGENTS) assert.match(bullet(text(`agents/${agent}.md`), "Report durability (GF-09-D"), /rather than as a write of its own/u, `${agent} must say the entry is not a write of its own`);
});

test("the two copies of the briefing template stay byte-identical (the fold edit touches both)", () => {
  assert.equal(text("templates/prompts/goldfish-task.md"), readFileSync(resolve(pluginRoot, "../../templates/prompts/goldfish-task.md"), "utf8"));
});
