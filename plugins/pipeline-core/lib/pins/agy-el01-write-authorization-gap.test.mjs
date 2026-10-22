// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.agy-el01-write-authorization-gap (AC-109).
// The Antigravity Edit/Write route must run the same EL-01 write-time tripwire
// (guard-el01-tripwire.mjs) the Claude route runs. Drives the real adapter.
// The authenticated Antigravity role carrier is NOT available; the role source
// is the same one the Claude route uses (an open dispatch record), never a
// prompt-asserted role.
//
// WHAT THIS PIN COVERS, AND WHAT IT DOES NOT (AC-109 is reported PARTIAL).
// Covered: parity only. The Antigravity Edit/Write route runs the same EL-01
// tripwire as the Claude route and refuses a write when the tripwire's own
// conditions hold and no dispatch record is open (cases below).
// NOT delivered, and deliberately NOT claimed by any case in this file: the
// carrier, worker-scope and fail-closed clauses of AC-109 as reconstructed in
// specs/sprint-alfred-epic/plans/acceptance-reconstruction/R2.md line 11 --
// authorization only from authenticated per-call carrier evidence that the
// caller is an admitted, owned worker AND that the target path lies inside that
// worker's scope, refused (fail closed) when that evidence is missing or
// unauthenticated. guard-el01-tripwire.mjs has no carrier input and no
// worker-scope input, so none of those three clauses can be exercised here.
// DISPOSITION (the question of R2.md line 14 is decided): Elephant decision E6
// (plans/elephant-decisions-2026-10-19.md) accepts the criterion on a documented
// "carrier unavailable" disposition, and PO decision D63 (plans/po-decisions-2026-10-18.md,
// 2026-10-20) closes AC-109 as not reconstructable. Antigravity provides no authenticated
// per-call carrier today, so no carrier or worker-scope behaviour is pinned here and none is
// owed. MEASURED AGAINST E6's rationale ("the fail-closed refusal is already the safe
// state"): that held for the three adapter cases below only. The tripwire exited 0 in the
// conditions listed next; PO decision D86 (2026-10-22, "EL-01 tripwire fails open ... fixed")
// orders them fixed, and the direct-hook cases further down pin the result.
//
// CONDITIONS of hooks/guard-el01-tripwire.mjs that exited 0 or 1 (allow), each probed with
// crafted input against the unchanged hook and classified. The list is what reading the file
// and probing found; it is NOT a proof of completeness.
//  (a) already fail-closed, pinned below with no RED step: an upper-case "HIGH" value, a
//      closed dispatch record, a traversal under an exempt prefix ("docs/../src"), and a
//      spec referenced by an absolute path outside the root.
//  (b) really fail-open, now fail-closed with a Cause: and a Repair: line (RED pins first,
//      all red on the unchanged hook with exit 0/1 where 2 was expected):
//      2b  state file invalid JSON (was exit 1 "skipped (fail-open)"), empty, a top-level
//          array or null, or present but unreadable (a directory, a permission error);
//      3b  activeFeature present but not an object with a non-empty string id;
//      4   the spec path cannot be resolved (no continuity path, no planPath directory) or
//          the resolved spec cannot be read;
//      5   a Risk class row the parser could not read: bold/code markup around the label or
//          the value, or a value outside low | medium | high ("critical").
//      Unevaluable evidence is treated as the risk flag being set: an open dispatch record
//      still admits the write, and the unreadable state file itself stays writable so the
//      repair is runnable.
//  (c) intentionally exits 0, by a recorded decision or contract (pinned as such below
//      where the behaviour is a decision rather than a gap):
//      1   the repository is not governed (hook line 158; pin
//          pipeline-hooks-act-in-repositories-that-never-opted-in);
//      2a  no state file / 3 no active feature: no feature means no risk flag can be set
//          (hook header TRIGGER CONDITION); 5a a low or medium risk class: EL-01's own
//          stage-0 exception holds;
//      0b  an absolute target outside the project root, EL-01's permitted prefixes
//          (docs/, specs/, backlog/items/, .claude/) and the dispatch-record*.json basename
//          bootstrap exemption (PO decision 2026-08-18 in the hook header).
//  OPEN, reported and NOT changed (each needs a decision the dispatch does not carry):
//      0a  unparseable hook input and an empty write target exit 0 (documented family-wide
//          contract of lib/tool-write-target.mjs, 2026-08-06: a guard is a safety net for the
//          paths it can see; diverging only the tripwire is a design call);
//      5b  a spec with NO Risk class row (or an unfilled placeholder) still reads as not
//          risk-flagged: 8 of the 11 live specs carry no row, so refusing on absence needs a
//          backfill decision first;
//      6   ANY open dispatch record anywhere under the project admits any writer: the record
//          is not bound to the calling session, role or target path, and the writer can
//          create its own record (the dispatch-record*.json basename is write-exempt).
//          Binding needs the authenticated carrier or a session id in the record schema,
//          both outside the hook (E6, D63).
// The third adapter case above touches only condition 6, and only to show that the tripwire
// itself stops refusing: it is not evidence that the caller is an authorized worker.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGovernanceScopeController } from "../governance-scope.mjs";

const tripwire = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "hooks", "guard-el01-tripwire.mjs");
const adapter =join(dirname(fileURLToPath(import.meta.url)), "..", "..", "hooks", "antigravity-pretool-guard.mjs");

function riskFixture({ openDispatch }) {
  const root = mkdtempSync(join(tmpdir(), "agy-el01-pin-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(root, "specs", "feat-1"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    activeFeature: { id: "feat-1", phase: "implementation", planPath: "specs/feat-1/prd.md" },
  }));
  writeFileSync(join(root, "specs", "feat-1", "spec.md"), "| Risk class | high |\n| Rigor level | 2 |\n");
  if (openDispatch) {
    writeFileSync(join(root, "dispatch-record.json"), JSON.stringify({
      taskId: "T-1", model: "m", rulesetSha: "a".repeat(64), dispatcher: "elephant", outcome: "in-progress", log: [],
    }));
  }
  return root;
}

function runAgy(root, toolCall) {
  const result = spawnSync(process.execPath, [adapter], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify({ workspacePaths: [root], toolCall }),
    encoding: "utf8",
    timeout: 20_000,
  });
  if (result.status === 2) return { decision: "deny", reason: String(result.stderr) };
  assert.equal(result.status, 0, `adapter failed: ${result.stderr}`);
  return JSON.parse(String(result.stdout).trim());
}

const writeCall = (root) => ({ name: "write_to_file", args: { TargetFile: join(root, "src", "code.js"), CodeContent: "const a = 1;" } });
const editCall = (root) => ({ name: "replace_file_content", args: { TargetFile: join(root, "src", "code.js"), TargetContent: "a", ReplacementContent: "b" } });

test("Antigravity Write without an open dispatch record is refused by guard-el01-tripwire", () => {
  const root = riskFixture({ openDispatch: false });
  try {
    const res = runAgy(root, writeCall(root));
    assert.equal(res.decision, "deny");
    assert.match(res.reason, /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Antigravity Edit without an open dispatch record is refused by guard-el01-tripwire", () => {
  const root = riskFixture({ openDispatch: false });
  try {
    const res = runAgy(root, editCall(root));
    assert.equal(res.decision, "deny");
    assert.match(res.reason, /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Antigravity Write with an open dispatch record is not refused by the EL-01 tripwire", () => {
  const root = riskFixture({ openDispatch: true });
  try {
    const res = runAgy(root, writeCall(root));
    // This lightweight fixture is not a completed lifecycle, so the separate
    // lifecycle-readiness guard still denies; the discriminating fact is that
    // the EL-01 tripwire itself no longer refuses once a dispatch is open.
    assert.doesNotMatch(String(res.reason ?? ""), /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------
// FAIL-CLOSED CONDITIONS (PO decision D86, 2026-10-22: "EL-01 tripwire fails open ... fixed").
// These cases drive guard-el01-tripwire.mjs directly. The rule they pin: in a governed
// repository, when the tripwire CANNOT EVALUATE the evidence it enforces on (a corrupt or
// unreadable state file, a malformed activeFeature, a spec it cannot resolve or read, a risk
// row it cannot interpret) it treats the feature as risk-flagged, so a write is refused unless
// a genuinely open dispatch record exists. Every refusal names its cause and one runnable
// repair. Nothing here changes the cases where there is genuinely nothing to enforce.
// ---------------------------------------------------------------------------------------
const created = [];
function freshRoot({ governed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "el01-fc-pin-"));
  created.push(root);
  if (!governed) return root;
  const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const scope = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const plan = scope.planDecision({ rootDir: root, decision: "enroll", by: "EL-01 fail-closed pin fixture" });
  const active = scope.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.ok(active.requiresEnforcement, "fixture must be governed or every case below passes vacuously");
  return root;
}
test.after(() => { for (const root of created) rmSync(root, { recursive: true, force: true }); });

const put = (root, rel, body) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof body === "string" ? body : JSON.stringify(body));
};
const STATE_REL = "project/pipeline-state.json";
const featureState = (feature = { id: "f1", planPath: "specs/f1/prd.md", phase: "implementation" }, extra = {}) => ({ schema: "pipeline.state.v0", activeFeature: feature, ...extra });
const HIGH_SPEC = "| Field | Value |\n| --- | --- |\n| Risk class | high |\n";
const openRecord = (root) => put(root, "dispatch-record-OPEN.json", {
  taskId: "T-OPEN", rulesetSha: "a".repeat(64), dispatcher: "elephant", outcome: "in-progress", log: [],
});
function fire(root, file = "src/code.mjs", toolName = "Edit") {
  const toolInput = toolName === "NotebookEdit"
    ? { notebook_path: file, cell_id: "1" }
    : { file_path: file, old_string: "a", new_string: "b" };
  const res = spawnSync(process.execPath, [tripwire], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 20_000,
  });
  return { code: res.status, stderr: String(res.stderr ?? "") };
}
function assertRefusedWithRepair(res, causeNeedle) {
  assert.equal(res.code, 2, `expected a refusal (exit 2), got exit ${res.code}: ${res.stderr.trim().slice(0, 300)}`);
  assert.match(res.stderr, /BLOCKED \(guard-el01-tripwire/);
  assert.ok(res.stderr.includes(causeNeedle), `refusal must name its cause "${causeNeedle}": ${res.stderr}`);
  assert.match(res.stderr, /^Repair: .+/m, "a refusal must carry one runnable repair");
}

// ---- (b) really fail-open before D86: now fail closed -----------------------------------
const CORRUPT_STATE = [
  ["state file is not valid JSON (verdict 2b; was exit 1 'WARN ... skipped (fail-open)')", "{not valid json", "invalid JSON"],
  ["state file is empty", "", "invalid JSON"],
  ["state file is a top-level JSON array", "[]", "not a JSON object"],
  ["state file is the JSON literal null", "null", "not a JSON object"],
];
for (const [name, body, cause] of CORRUPT_STATE) {
  test(`EL-01 tripwire fails closed: ${name}`, () => {
    const root = freshRoot();
    put(root, STATE_REL, body);
    assertRefusedWithRepair(fire(root), cause);
  });
}

test("EL-01 tripwire fails closed: state path exists but cannot be read as a file", () => {
  const root = freshRoot();
  mkdirSync(join(root, STATE_REL), { recursive: true }); // a directory where the state file belongs
  assertRefusedWithRepair(fire(root), "cannot be read");
});

for (const [name, feature] of [
  ["activeFeature is a string, not an object", "f1"],
  ["activeFeature is an array", ["f1"]],
  ["activeFeature object has an empty id", { id: "", planPath: "specs/f1/prd.md" }],
  ["activeFeature object has a non-string id", { id: 7, planPath: "specs/f1/prd.md" }],
]) {
  test(`EL-01 tripwire fails closed: ${name}`, () => {
    const root = freshRoot();
    put(root, STATE_REL, featureState(feature));
    put(root, "specs/f1/spec.md", HIGH_SPEC);
    assertRefusedWithRepair(fire(root), "activeFeature");
  });
}

for (const [name, feature, withSpecAt] of [
  ["spec path cannot be resolved: no planPath and no continuity", { id: "f1" }, "specs/f1/spec.md"],
  ["spec path cannot be resolved: planPath without a directory", { id: "f1", planPath: "prd.md" }, "spec.md"],
]) {
  test(`EL-01 tripwire fails closed: ${name}`, () => {
    const root = freshRoot();
    put(root, STATE_REL, featureState(feature));
    put(root, withSpecAt, HIGH_SPEC);
    assertRefusedWithRepair(fire(root), "cannot be resolved");
  });
}

test("EL-01 tripwire fails closed: the resolved spec file does not exist", () => {
  const root = freshRoot();
  put(root, STATE_REL, featureState());
  assertRefusedWithRepair(fire(root), "specs/f1/spec.md");
});

test("EL-01 tripwire fails closed: the resolved spec path is a directory", () => {
  const root = freshRoot();
  put(root, STATE_REL, featureState());
  mkdirSync(join(root, "specs", "f1", "spec.md"), { recursive: true });
  assertRefusedWithRepair(fire(root), "specs/f1/spec.md");
});

for (const [name, specText] of [
  ["risk-class label wrapped in bold markup", "| **Risk class** | high |\n"],
  ["risk-class value wrapped in bold markup", "| Risk class | **high** |\n"],
  ["risk-class value wrapped in backticks", "| Risk class | `high` |\n"],
  ["risk-class value is out of vocabulary (low | medium | high)", "| Risk class | critical |\n"],
]) {
  test(`EL-01 tripwire is not blinded by a spec risk row it cannot read: ${name}`, () => {
    const root = freshRoot();
    put(root, STATE_REL, featureState());
    put(root, "specs/f1/spec.md", specText);
    const res = fire(root);
    assert.equal(res.code, 2, `exit ${res.code}: ${res.stderr.trim().slice(0, 300)}`);
    assert.match(res.stderr, /BLOCKED \(guard-el01-tripwire/);
  });
}

test("EL-01 tripwire: an out-of-vocabulary risk value names the cause and the repair", () => {
  const root = freshRoot();
  put(root, STATE_REL, featureState());
  put(root, "specs/f1/spec.md", "| Risk class | critical |\n");
  assertRefusedWithRepair(fire(root), "critical");
});

// ---- the refusals above keep the sanctioned routes open ----------------------------------
test("EL-01 tripwire: an open dispatch record still admits a write when the state is corrupt or the spec is unreadable", () => {
  for (const arrange of [
    (root) => put(root, STATE_REL, "{not valid json"),
    (root) => { put(root, STATE_REL, featureState()); /* spec absent */ },
  ]) {
    const root = freshRoot();
    arrange(root);
    openRecord(root);
    const res = fire(root);
    assert.equal(res.code, 0, `exit ${res.code}: ${res.stderr.trim().slice(0, 300)}`);
  }
});

test("EL-01 tripwire: the unreadable state file itself stays writable so the named repair is runnable", () => {
  const root = freshRoot();
  put(root, STATE_REL, "{not valid json");
  const res = fire(root, STATE_REL);
  assert.equal(res.code, 0, `exit ${res.code}: ${res.stderr.trim().slice(0, 300)}`);
  // Only that one path: any other source path is still refused in the same state.
  assert.equal(fire(root, "src/code.mjs").code, 2);
});

// ---- (a) already fail-closed: proven here, RED not applicable -----------------------------
test("EL-01 tripwire already refuses: upper-case risk value, closed dispatch record, traversal under an exempt prefix", () => {
  const root = freshRoot();
  put(root, STATE_REL, featureState());
  put(root, "specs/f1/spec.md", "| Risk class | HIGH |\n");
  put(root, "dispatch-record-DONE.json", { taskId: "T-D", rulesetSha: "a".repeat(64), dispatcher: "elephant", outcome: "passed", log: [] });
  assert.equal(fire(root, "src/code.mjs").code, 2);
  assert.equal(fire(root, "docs/../src/code.mjs").code, 2);
});

test("EL-01 tripwire already refuses: a spec outside the project root that says high is still read", () => {
  const root = freshRoot();
  const elsewhere = freshRoot({ governed: false });
  put(elsewhere, "spec.md", HIGH_SPEC);
  put(root, STATE_REL, featureState({ id: "f1", planPath: "specs/f1/prd.md" }, {
    continuity: { featureId: "f1", authority: { spec: { path: join(elsewhere, "spec.md") } } },
  }));
  assert.equal(fire(root).code, 2);
});

// ---- (c) intentionally exits 0: nothing to enforce, or a recorded exemption ---------------
// 1  not governed: the Pipeline's hooks never act in a repository that did not opt in
//    (hook header line 158; pin pipeline-hooks-act-in-repositories-that-never-opted-in).
// 2a no state file / 3 no active feature: no feature means no risk flag can be set (header
//    TRIGGER CONDITION). 5a risk class low or medium: EL-01's own stage-0 exception holds.
// 0b outside the project root, EL-01's permitted prefixes and the dispatch-record bootstrap
//    exemption (PO decision 2026-08-18 in the hook header, roles/elephant.md EL-01).
test("EL-01 tripwire intentionally allows: ungoverned repository, no state, no active feature, low or medium risk", () => {
  const ungoverned = freshRoot({ governed: false });
  put(ungoverned, STATE_REL, featureState());
  put(ungoverned, "specs/f1/spec.md", HIGH_SPEC);
  assert.equal(fire(ungoverned).code, 0, "1: not governed");

  assert.equal(fire(freshRoot()).code, 0, "2a: governed, no state file");

  const noFeature = freshRoot();
  put(noFeature, STATE_REL, { schema: "pipeline.state.v0" });
  assert.equal(fire(noFeature).code, 0, "3: governed, state without activeFeature");

  for (const risk of ["low", "medium"]) {
    const root = freshRoot();
    put(root, STATE_REL, featureState());
    put(root, "specs/f1/spec.md", `| Risk class | ${risk} |\n`);
    assert.equal(fire(root).code, 0, `5a: risk class ${risk}`);
  }
});

test("EL-01 tripwire intentionally allows: outside the root, EL-01 permitted prefixes, and the dispatch-record bootstrap write", () => {
  const root = freshRoot();
  put(root, STATE_REL, featureState());
  put(root, "specs/f1/spec.md", HIGH_SPEC);
  const outside = freshRoot({ governed: false });
  assert.equal(fire(root, join(outside, "x.mjs")).code, 0, "absolute path outside the project root");
  for (const rel of ["docs/state.md", "specs/f1/prd.md", "backlog/items/x.md", ".claude/pipeline-state.json", "dispatch-record-NEW.json"]) {
    assert.equal(fire(root, rel).code, 0, rel);
  }
});
