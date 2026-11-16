// SPDX-License-Identifier: SUL-1.0
// ALF-G4C: tests for the design review receipt producer. A receipt is produced from files on disk with the
// review time taken from the clock, the runner from the runtime signal and the reviewer model from the
// Critic agent definition; no flag can supply any of those values.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { parseDesignReviewReceipt, summarizeDesignReviewReceipt } from "../lib/design-review-receipt.mjs";
import { createReceiptFromDisk, detectRunner, main } from "./design-review-receipt.mjs";

const SCRIPT = fileURLToPath(new URL("./design-review-receipt.mjs", import.meta.url));
const CRITIC_MD = new URL("../agents/critic.md", import.meta.url);
const RUNNER_VARS = ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];
const CLAUDE = { CLAUDECODE: "1" };
const CLOCK = "2026-10-18T09:30:00.000Z";
const now = () => new Date(CLOCK);

const sha = (value) => createHash("sha256").update(value).digest("hex");
const criticModel = () => /^model:[ \t]*(\S+)[ \t]*$/mu.exec(readFileSync(CRITIC_MD, "utf8"))[1];

const PRD = "specs/feat-x/prd.md";
const SPEC = "specs/feat-x/spec.md";
const DESIGN = "specs/feat-x/design.md";
const REPORT1 = "specs/feat-x/review/design-review-1.md";
const REPORT2 = "specs/feat-x/review/design-review-2.md";
const RECEIPT1 = "specs/feat-x/review/design-review-1.receipt.json";
const RECEIPT2 = "specs/feat-x/review/design-review-2.receipt.json";

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "drc-"));
  mkdirSync(join(repo, "specs/feat-x/review"), { recursive: true });
  writeFileSync(join(repo, PRD), "# PRD\n\nproduct text\n");
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v1\n");
  writeFileSync(join(repo, DESIGN), "# Design\n\ncompanion text\n");
  writeFileSync(join(repo, REPORT1), "# Critic report\n\nVerdict: PASS\n");
  writeFileSync(join(repo, REPORT2), "# Critic report round 2\n\nVerdict: PASS\n");
  return repo;
}

const request = (repo, over = {}) => ({
  repo, featureId: "feat-x", reportPath: REPORT1, prdPath: PRD, specPath: SPEC,
  companionPaths: [], previousPath: null, openFindingIds: [], outPath: RECEIPT1, ...over,
});

/** Run main in-process, capturing stdout/stderr. */
function runMain(argv, env = CLAUDE, deps = {}) {
  const out = [];
  const err = [];
  const code = main(argv, env, { now, writeFn: (text) => out.push(text), errorFn: (text) => err.push(text), ...deps });
  const stdout = out.join("");
  return { code, stdout, stderr: err.join(""), json: stdout === "" ? null : JSON.parse(stdout) };
}

const baseArgv = (repo, over = {}) => {
  const values = { repo, feature: "feat-x", report: REPORT1, prd: PRD, spec: SPEC, out: RECEIPT1, ...over };
  return ["create", ...Object.entries(values).flatMap(([name, value]) => [`--${name}`, value])];
};

function strippedEnv() {
  const env = { ...process.env };
  for (const name of RUNNER_VARS) delete env[name];
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function spawnCli(argv, extraEnv = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: "utf8", env: { ...strippedEnv(), ...extraEnv } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: result.stdout.trim() === "" ? null : JSON.parse(result.stdout) };
}

const withRepo = (body) => (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return body(repo, t);
};

// ----------------------------------------------------------------------------- production

test("a produced receipt parses, summarizes, and carries the clock, the report hash and the Critic model", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo), { env: CLAUDE, now });
  assert.equal(result.ok, true);
  const bytes = readFileSync(join(repo, RECEIPT1));
  const parsed = parseDesignReviewReceipt(bytes);
  assert.equal(parsed.ok, true);
  assert.equal(summarizeDesignReviewReceipt({ path: RECEIPT1, bytes }).ok, true);
  assert.equal(parsed.receipt.reviewedAt, CLOCK);
  assert.equal(parsed.receipt.report.path, REPORT1);
  assert.equal(parsed.receipt.report.sha256, sha(readFileSync(join(repo, REPORT1))));
  assert.equal(parsed.receipt.sources.prd.sha256, sha(readFileSync(join(repo, PRD))));
  assert.equal(parsed.receipt.sources.spec.sha256, sha(readFileSync(join(repo, SPEC))));
  assert.equal(parsed.receipt.reviewer.model, "unknown");
  assert.notEqual(parsed.receipt.reviewer.model, criticModel());
  assert.equal(parsed.receipt.reviewer.runner, "claude");
  assert.equal(parsed.receipt.kind, "initial");
  assert.equal(parsed.receipt.round, 1);
  assert.equal(parsed.receipt.verdict, "pass");
  assert.equal(result.sha256, parsed.sha256);
  assert.equal(result.path, RECEIPT1);
}));

test("companions are hashed from disk and open findings are sorted into the receipt", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { companionPaths: [DESIGN], openFindingIds: ["F-TWO", "F-ONE"] }), { env: CLAUDE, now });
  assert.equal(result.ok, true);
  const parsed = parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1)));
  assert.deepEqual(parsed.receipt.sources.companions, [{ path: DESIGN, sha256: sha(readFileSync(join(repo, DESIGN))) }]);
  assert.deepEqual(parsed.receipt.openFindingIds, ["F-ONE", "F-TWO"]);
  assert.equal(parsed.receipt.verdict, "open-findings");
}));

test("a delta round chains to the previous receipt by path and digest", withRepo((repo) => {
  assert.equal(createReceiptFromDisk(request(repo, { openFindingIds: ["F-ONE"] }), { env: CLAUDE, now }).ok, true);
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v2\n");
  const later = () => new Date("2026-10-18T10:45:00.000Z");
  const delta = createReceiptFromDisk(request(repo, { reportPath: REPORT2, previousPath: RECEIPT1, outPath: RECEIPT2 }), { env: CLAUDE, now: later });
  assert.equal(delta.ok, true);
  const parsed = parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT2)));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.receipt.kind, "delta");
  assert.equal(parsed.receipt.round, 2);
  assert.equal(parsed.receipt.previousReceiptPath, RECEIPT1);
  assert.equal(parsed.receipt.previousReceiptSha256, sha(readFileSync(join(repo, RECEIPT1))));
  assert.equal(parsed.receipt.reviewedAt, "2026-10-18T10:45:00.000Z");
  assert.equal(parsed.receipt.sources.spec.sha256, sha(readFileSync(join(repo, SPEC))));
}));

// C30-6 (PO 2026-11-16): the open findings of a receipt are the report's blocking findings, read from the bound report text.
const SPLIT = (blocking, questions) => ["Verdict: NOT READY", "", "Blocking findings:", ...blocking.map((id) => `- ${id} text`), "", "Questions:", ...questions.map((id) => `- ${id} text`), ""].join("\n");

test("C30-6: the receipt's open findings must equal the report's blocking findings; a question never holds the design", withRepo((repo) => {
  writeFileSync(join(repo, REPORT1), SPLIT(["DESIGN-REVIEW-1"], ["DESIGN-QUESTION-1", "DESIGN-QUESTION-2"]));
  const asQuestion = createReceiptFromDisk(request(repo, { openFindingIds: ["DESIGN-REVIEW-1", "DESIGN-QUESTION-1"] }), { env: CLAUDE, now });
  assert.equal(asQuestion.ok, false);
  assert.equal(asQuestion.code, "DRC-FINDINGS-SPLIT");
  assert.match(asQuestion.message, /a question is not an open finding.*DESIGN-QUESTION-1/u);
  const dropped = createReceiptFromDisk(request(repo, { openFindingIds: [] }), { env: CLAUDE, now });
  assert.equal(dropped.code, "DRC-FINDINGS-SPLIT");
  assert.match(dropped.message, /not passed as --open-finding: DESIGN-REVIEW-1/u);
  assert.equal(readdirSync(join(repo, "specs/feat-x/review")).some((name) => name.endsWith(".receipt.json")), false, "nothing is written on a refusal");
  const exact = createReceiptFromDisk(request(repo, { openFindingIds: ["DESIGN-REVIEW-1"] }), { env: CLAUDE, now });
  assert.equal(exact.ok, true, JSON.stringify(exact));
  assert.deepEqual(exact.receipt.openFindingIds, ["DESIGN-REVIEW-1"]);
}));

test("C30-6: a report with only questions makes a passing receipt", withRepo((repo) => {
  writeFileSync(join(repo, REPORT1), SPLIT([], ["DESIGN-QUESTION-1"]).replace("Verdict: NOT READY", "Verdict: READY").replace("Blocking findings:\n", "Blocking findings:\n- none\n"));
  const result = createReceiptFromDisk(request(repo, { openFindingIds: [] }), { env: CLAUDE, now });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.receipt.verdict, "pass");
}));

test("C30-6: one full round and two delta rounds; the replay of the stopped run (review, correction, no receipt, a second full review) is answered by the delta route, and round 4 is refused", withRepo((repo) => {
  // Round 1, then two delta rounds, each over a corrected spec.
  assert.equal(createReceiptFromDisk(request(repo, { openFindingIds: ["F-ONE"] }), { env: CLAUDE, now }).ok, true);
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v2\n");
  writeFileSync(join(repo, "specs/feat-x/review/design-review-3.md"), "# Round 3\n\nVerdict: NOT READY\n");
  writeFileSync(join(repo, "specs/feat-x/review/design-review-4.md"), "# Round 4\n\nVerdict: NOT READY\n");
  const second = createReceiptFromDisk(request(repo, { reportPath: REPORT2, previousPath: RECEIPT1, outPath: RECEIPT2, openFindingIds: ["F-ONE"] }), { env: CLAUDE, now });
  assert.equal(second.ok, true, JSON.stringify(second));
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v3\n");
  const third = createReceiptFromDisk(request(repo, { reportPath: "specs/feat-x/review/design-review-3.md", previousPath: RECEIPT2, outPath: "specs/feat-x/review/design-review-3.receipt.json", openFindingIds: ["F-ONE"] }), { env: CLAUDE, now });
  assert.equal(third.ok, true, JSON.stringify(third));
  assert.equal(third.receipt.round, 3);
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v4\n");
  const fourth = createReceiptFromDisk(request(repo, { reportPath: "specs/feat-x/review/design-review-4.md", previousPath: "specs/feat-x/review/design-review-3.receipt.json", outPath: "specs/feat-x/review/design-review-4.receipt.json", openFindingIds: ["F-ONE"] }), { env: CLAUDE, now });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.code, "DRR-ROUND-CAP");
  assert.match(fourth.message, /one full round and at most two delta rounds/u);
  assert.match(fourth.message, /present-plan/u, "the refusal names the way on");
}));

test("the runner comes from the runtime signal, with the claude, antigravity and codex signals and nothing else", () => {
  assert.equal(detectRunner({ CLAUDECODE: "1" }), "claude");
  assert.equal(detectRunner({ ANTIGRAVITY_AGENT: "1" }), "antigravity");
  assert.equal(detectRunner({ AI_AGENT: "antigravity" }), "antigravity");
  assert.equal(detectRunner({ CODEX_SESSION_ID: "abc" }), "codex");
  assert.equal(detectRunner({ CODEX_THREAD_ID: "abc" }), "codex");
  assert.equal(detectRunner({}), null);
  assert.equal(detectRunner({ CLAUDECODE: "0" }), null);
  assert.equal(detectRunner({ CLAUDECODE: "" }), null);
  assert.equal(detectRunner({ CODEX_SESSION_ID: "", CODEX_THREAD_ID: "" }), null);
  assert.equal(detectRunner({ AI_AGENT: "something-else" }), null);
});

test("each runner signal lands in reviewer.runner of the written receipt", withRepo((repo) => {
  const cases = [[{ ANTIGRAVITY_AGENT: "1" }, "antigravity"], [{ CODEX_THREAD_ID: "t-1" }, "codex"]];
  for (const [env, runner] of cases) {
    const out = `specs/feat-x/review/${runner}.receipt.json`;
    assert.equal(createReceiptFromDisk(request(repo, { outPath: out }), { env, now }).ok, true);
    assert.equal(parseDesignReviewReceipt(readFileSync(join(repo, out))).receipt.reviewer.runner, runner);
  }
}));

test("the receipt bytes are exactly what the library returned: canonical JSON plus one LF", withRepo((repo) => {
  assert.equal(createReceiptFromDisk(request(repo), { env: CLAUDE, now }).ok, true);
  const text = readFileSync(join(repo, RECEIPT1), "utf8");
  assert.ok(text.endsWith("}\n"));
  assert.equal(text.indexOf("\n"), text.length - 1);
}));

// ----------------------------------------------------------------------------- refusals

test("a missing report is refused as a missing file and nothing is written", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { reportPath: "specs/feat-x/review/nope.md" }), { env: CLAUDE, now });
  assert.deepEqual([result.ok, result.code], [false, "DRC-FILE-MISSING"]);
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("a missing PRD, Spec, companion or previous receipt is a missing file", withRepo((repo) => {
  for (const over of [{ prdPath: "specs/feat-x/none.md" }, { specPath: "specs/feat-x/none.md" }, { companionPaths: ["specs/feat-x/none.md"] }, { previousPath: "specs/feat-x/none.json" }]) {
    assert.equal(createReceiptFromDisk(request(repo, over), { env: CLAUDE, now }).code, "DRC-FILE-MISSING", JSON.stringify(over));
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("an unsafe output path is refused, and so is an unsafe source path", withRepo((repo) => {
  for (const outPath of ["../escape.json", "/abs/receipt.json", "a\\b.json", "specs//x.json", "specs/", "", "specs/./x.json", " specs/x.json", "C:/x.json", "specs/x\0.json"]) {
    assert.equal(createReceiptFromDisk(request(repo, { outPath }), { env: CLAUDE, now }).code, "DRC-PATH-UNSAFE", JSON.stringify(outPath));
  }
  for (const over of [{ reportPath: "../report.md" }, { prdPath: "/etc/hostname" }, { specPath: "specs/../spec.md" }, { companionPaths: ["../x.md"] }, { previousPath: "..\\x.json" }]) {
    assert.equal(createReceiptFromDisk(request(repo, over), { env: CLAUDE, now }).code, "DRC-PATH-UNSAFE", JSON.stringify(over));
  }
}));

test("an existing output is refused and left byte-identical", withRepo((repo) => {
  writeFileSync(join(repo, RECEIPT1), "do not touch\n");
  const result = createReceiptFromDisk(request(repo), { env: CLAUDE, now });
  assert.deepEqual([result.ok, result.code], [false, "DRC-OUT-EXISTS"]);
  assert.equal(readFileSync(join(repo, RECEIPT1), "utf8"), "do not touch\n");
}));

// C18 (AGY report): the refusal said only that the file is never overwritten; it now also names the way forward.
test("DRC-OUT-EXISTS names a new --out path as the way forward and keeps the existing file", withRepo((repo) => {
  writeFileSync(join(repo, RECEIPT1), "do not touch\n");
  const result = createReceiptFromDisk(request(repo), { env: CLAUDE, now });
  assert.equal(result.code, "DRC-OUT-EXISTS");
  assert.match(result.message, /choose a new --out path/u);
  assert.match(result.message, /never overwritten/u);
  assert.equal(readFileSync(join(repo, RECEIPT1), "utf8"), "do not touch\n");
}));

// Antigravity greenfield 2026-11-08: an old report was stamped onto a changed PRD and bound by the second signature.
test("a report already bound to other PRD or Spec bytes is refused, names the earlier receipt and writes nothing", withRepo((repo) => {
  assert.equal(createReceiptFromDisk(request(repo), { env: CLAUDE, now }).ok, true);
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v2\n");
  const result = createReceiptFromDisk(request(repo, { outPath: RECEIPT2 }), { env: CLAUDE, now });
  assert.deepEqual([result.ok, result.code], [false, "DRC-REPORT-REUSED"]);
  assert.match(result.message, /design-review-1\.receipt\.json/u);
  assert.match(result.message, /run the review again/u);
  assert.equal(existsSync(join(repo, RECEIPT2)), false);
}));

test("control: the same report over the same bytes and a new report over changed bytes are both still accepted", withRepo((repo) => {
  assert.equal(createReceiptFromDisk(request(repo), { env: CLAUDE, now }).ok, true);
  assert.equal(createReceiptFromDisk(request(repo, { outPath: RECEIPT2 }), { env: CLAUDE, now }).ok, true);
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v2\n");
  const third = "specs/feat-x/review/design-review-3.receipt.json";
  assert.equal(createReceiptFromDisk(request(repo, { reportPath: REPORT2, outPath: third }), { env: CLAUDE, now }).ok, true);
}));

test("an output whose directory does not exist is refused, never created", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { outPath: "specs/feat-x/other/receipt.json" }), { env: CLAUDE, now });
  assert.equal(result.code, "DRC-OUT-PARENT-MISSING");
  assert.equal(existsSync(join(repo, "specs/feat-x/other")), false);
}));

test("no runner signal is refused and nothing is written", withRepo((repo) => {
  for (const env of [{}, { CLAUDECODE: "0" }, { CODEX_SESSION_ID: "" }]) {
    const result = createReceiptFromDisk(request(repo), { env, now });
    assert.deepEqual([result.ok, result.code], [false, "DRC-NO-RUNNER"], JSON.stringify(env));
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("the Critic agent definition is never consulted: an agent profile's model cannot become the executed model", withRepo((repo) => {
  const profile = join(repo, "critic-profile.md");
  writeFileSync(profile, "---\nname: critic\nmodel: profile-model-7\n---\nbody\n");
  const result = createReceiptFromDisk(request(repo), { env: CLAUDE, now, criticAgentUrl: pathToFileURL(profile) });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.reviewer.model, "unknown");
  assert.equal(result.observedIdentity, "unknown");
  assert.notEqual(result.receipt.reviewer.model, "profile-model-7");
  assert.equal(readFileSync(join(repo, RECEIPT1), "utf8").includes("profile-model-7"), false);
}));

test("no observation records unknown, with the role named and no requested route", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo), { env: CLAUDE, now });
  assert.equal(result.ok, true);
  assert.deepEqual([result.reviewerRole, result.requestedRoute, result.observedIdentity], ["critic", null, "unknown"]);
  assert.equal(result.receipt.reviewer.model, "unknown");
}));

// W7 attestation slice (PO 2026-10-27): no verifiable source-owned dispatch observation route exists, so a self-asserted
// requested route or observed identity is refused as unattested instead of being written into the receipt. The two cases
// that used to pin acceptance are updated deliberately (see the held-patch notes); the default path still records unknown.
test("a self-asserted requested route alone is refused as unattested and nothing is written", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { requestedRoute: "opus-4-7" }), { env: CLAUDE, now });
  assert.deepEqual([result.ok, result.code], [false, "DRC-OBSERVATION-UNATTESTED"]);
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("a self-asserted observed identity, with or without a requested route, is refused as unattested and nothing is written", withRepo((repo) => {
  for (const over of [{ observedIdentity: "claude-opus-4-7" }, { requestedRoute: "opus", observedIdentity: "claude-opus-4-7" }]) {
    const result = createReceiptFromDisk(request(repo, over), { env: CLAUDE, now });
    assert.deepEqual([result.ok, result.code], [false, "DRC-OBSERVATION-UNATTESTED"], JSON.stringify(over));
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("the same unattested refusal holds on the claude, antigravity and codex runners", withRepo((repo) => {
  const runners = [{ CLAUDECODE: "1" }, { ANTIGRAVITY_AGENT: "1" }, { CODEX_THREAD_ID: "t-1" }];
  for (const env of runners) {
    for (const over of [{ observedIdentity: "claude-opus-4-7" }, { requestedRoute: "opus" }, { requestedRoute: "opus", observedIdentity: "claude-opus-4-7" }]) {
      const result = createReceiptFromDisk(request(repo, over), { env, now });
      assert.deepEqual([result.ok, result.code], [false, "DRC-OBSERVATION-UNATTESTED"], `${JSON.stringify(env)} ${JSON.stringify(over)}`);
    }
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("control: the default path with no flags still yields unknown on every runner, and carries no fallback", withRepo((repo) => {
  const cases = [[{ CLAUDECODE: "1" }, "claude"], [{ ANTIGRAVITY_AGENT: "1" }, "antigravity"], [{ CODEX_SESSION_ID: "s-1" }, "codex"]];
  for (const [env, runner] of cases) {
    const out = `specs/feat-x/review/${runner}-default.receipt.json`;
    const result = createReceiptFromDisk(request(repo, { outPath: out }), { env, now });
    assert.equal(result.ok, true, runner);
    assert.deepEqual([result.reviewerRole, result.requestedRoute, result.observedIdentity], ["critic", null, "unknown"]);
    const parsed = parseDesignReviewReceipt(readFileSync(join(repo, out)));
    assert.equal(parsed.receipt.reviewer.model, "unknown");
    assert.equal(parsed.receipt.reviewer.runner, runner);
    assert.equal(Object.hasOwn(parsed.receipt, "fallback"), false);
  }
}));

test("control: the legacy typed fallback route still works, with or without its observed identity, and is the only way to carry a route", withRepo((repo) => {
  const code = "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER";
  const plain = createReceiptFromDisk(request(repo, { requestedRoute: "duty.critic_normal", fallbackReasonCode: code }), { env: CLAUDE, now });
  assert.equal(plain.ok, true, `${plain.code}: ${plain.message}`);
  assert.equal(plain.receipt.fallback.requestedRoute, "duty.critic_normal");
  assert.equal(plain.receipt.fallback.observedIdentity, "unknown");
  const observed = createReceiptFromDisk(request(repo, { outPath: RECEIPT2, requestedRoute: "duty.critic_normal", observedIdentity: "claude-sonnet-5-5", fallbackReasonCode: code }), { env: CLAUDE, now });
  assert.equal(observed.ok, true, `${observed.code}: ${observed.message}`);
  assert.equal(observed.receipt.fallback.observedIdentity, "claude-sonnet-5-5");
}));

test("a malformed requested route or observed identity is refused and writes nothing", withRepo((repo) => {
  for (const over of [{ observedIdentity: "has space" }, { observedIdentity: "" }, { requestedRoute: "" }, { requestedRoute: "two words" }]) {
    const result = createReceiptFromDisk(request(repo, over), { env: CLAUDE, now });
    assert.deepEqual([result.ok, result.code], [false, "DRC-USAGE"], JSON.stringify(over));
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("the command line reports role, requested route and observed identity separately", withRepo((repo) => {
  const plain = runMain(baseArgv(repo));
  assert.deepEqual([plain.json.reviewerRole, plain.json.requestedRoute, plain.json.observedIdentity], ["critic", null, "unknown"]);
  // W7 attestation slice: a self-asserted route/identity on the command line is refused, typed, and writes nothing.
  const observed = runMain(baseArgv(repo, { out: RECEIPT2, "requested-route": "opus", "observed-identity": "claude-opus-4-7" }));
  assert.equal(observed.code, 2);
  assert.equal(observed.json.status, "refused");
  assert.equal(observed.json.code, "DRC-OBSERVATION-UNATTESTED");
  assert.equal(existsSync(join(repo, RECEIPT2)), false);
}));

test("library refusals pass through under their own code and write nothing", withRepo((repo) => {
  const badFinding = createReceiptFromDisk(request(repo, { openFindingIds: ["not an id"] }), { env: CLAUDE, now });
  assert.deepEqual([badFinding.ok, badFinding.code], [false, "DRR-FINDING-IDS"]);
  // D23: the refusal names the offending id and what an id looks like (F1 has no hyphen and is refused the same way).
  assert.match(badFinding.message, /"not an id" is not a valid finding id: an id is upper-case letters and digits.*AC-155/u);
  const f1 = createReceiptFromDisk(request(repo, { openFindingIds: ["F1", "AC-155"] }), { env: CLAUDE, now });
  assert.match(f1.message, /"F1" is not a valid finding id/u);
  assert.doesNotMatch(f1.message, /"AC-155"/u, "a valid id is not named as wrong");
  const twice = createReceiptFromDisk(request(repo, { openFindingIds: ["AC-155", "AC-155"] }), { env: CLAUDE, now });
  assert.match(twice.message, /a finding id is given twice/u);
  const sameSources = createReceiptFromDisk(request(repo, { specPath: PRD }), { env: CLAUDE, now });
  assert.equal(sameSources.code, "DRR-SOURCES");
  const badFeature = createReceiptFromDisk(request(repo, { featureId: "Not A Feature" }), { env: CLAUDE, now });
  assert.equal(badFeature.code, "DRR-SHAPE");
  // Glossover G1: the refusal names the field and the shape instead of the bare code.
  assert.match(badFeature.message, /DRR-SHAPE: --feature "Not A Feature" is not a valid feature id .*\^\[a-z\]\[a-z0-9-\]\{0,63\}\$/u);
  const datedFeature = createReceiptFromDisk(request(repo, { featureId: "2026-10-26-epic2" }), { env: CLAUDE, now });
  assert.equal(datedFeature.code, "DRR-SHAPE");
  assert.match(datedFeature.message, /--feature "2026-10-26-epic2" is not a valid feature id/u);
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("a delta over unchanged sources is refused by the library and writes nothing", withRepo((repo) => {
  assert.equal(createReceiptFromDisk(request(repo), { env: CLAUDE, now }).ok, true);
  const result = createReceiptFromDisk(request(repo, { reportPath: REPORT2, previousPath: RECEIPT1, outPath: RECEIPT2 }), { env: CLAUDE, now });
  assert.deepEqual([result.ok, result.code], [false, "DRR-DELTA-UNCHANGED"]);
  assert.equal(existsSync(join(repo, RECEIPT2)), false);
}));

test("a source that is a symbolic link out of the repository is refused", withRepo((repo, t) => {
  const outside = mkdtempSync(join(tmpdir(), "drc-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "report.md"), "outside\n");
  try {
    symlinkSync(join(outside, "report.md"), join(repo, "specs/feat-x/review/linked.md"));
  } catch {
    t.skip("symbolic links are not available here");
    return;
  }
  const result = createReceiptFromDisk(request(repo, { reportPath: "specs/feat-x/review/linked.md" }), { env: CLAUDE, now });
  assert.equal(result.code, "DRC-FILE-UNSAFE");
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

// ----------------------------------------------------------------------------- command line

test("main reports a created receipt as one JSON object on stdout", withRepo((repo) => {
  const run = runMain([...baseArgv(repo), "--companion", DESIGN, "--open-finding", "F-ONE", "--open-finding", "F-TWO"]);
  assert.equal(run.code, 0);
  assert.equal(run.json.status, "created");
  assert.equal(run.json.path, RECEIPT1);
  assert.equal(run.json.sha256, sha(readFileSync(join(repo, RECEIPT1))));
  assert.equal(run.json.reviewedAt, CLOCK);
  const parsed = parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1)));
  assert.deepEqual(parsed.receipt.openFindingIds, ["F-ONE", "F-TWO"]);
  assert.equal(parsed.receipt.sources.companions.length, 1);
}));

test("main reports a refusal as a typed JSON object and a non-zero exit", withRepo((repo) => {
  const run = runMain(baseArgv(repo, { report: "specs/feat-x/review/nope.md" }));
  assert.equal(run.code, 2);
  assert.equal(run.json.status, "refused");
  assert.equal(run.json.code, "DRC-FILE-MISSING");
  assert.match(run.stderr, /DRC-FILE-MISSING/u);
}));

test("usage errors are typed: no subcommand, an unknown subcommand, a missing required flag, a missing value, a duplicate flag", withRepo((repo) => {
  assert.equal(runMain([]).json.code, "DRC-USAGE");
  assert.equal(runMain(["make"]).json.code, "DRC-USAGE");
  assert.equal(runMain(["create"]).json.code, "DRC-USAGE");
  assert.equal(runMain(baseArgv(repo).slice(0, -1)).json.code, "DRC-USAGE");
  assert.equal(runMain([...baseArgv(repo), "--feature", "feat-y"]).json.code, "DRC-USAGE");
  assert.equal(runMain([...baseArgv(repo), "stray"]).json.code, "DRC-USAGE");
  for (const run of [runMain([]), runMain(["make"])]) assert.equal(run.code, 2);
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("an unknown flag is refused by name", withRepo((repo) => {
  const run = runMain([...baseArgv(repo), "--frobnicate", "1"]);
  assert.equal(run.code, 2);
  assert.equal(run.json.code, "DRC-UNKNOWN-FLAG");
  assert.match(run.json.message, /--frobnicate/u);
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("no flag accepts a timestamp, a hash, a runner or a model", withRepo((repo) => {
  const flags = ["--reviewed-at", "--reviewedAt", "--timestamp", "--now", "--sha256", "--hash", "--report-sha256", "--prd-sha256", "--digest", "--model", "--runner", "--reviewer"];
  for (const flag of flags) {
    const run = runMain([...baseArgv(repo), flag, "2020-01-01T00:00:00.000Z"]);
    assert.equal(run.code, 2, flag);
    assert.equal(run.json.code, "DRC-FORBIDDEN-FLAG", flag);
    assert.ok(run.json.message.includes(flag), `${flag} is named in the refusal`);
  }
  const equalsForm = runMain([...baseArgv(repo), "--reviewed-at=2020-01-01T00:00:00.000Z"]);
  assert.equal(equalsForm.json.code, "DRC-FORBIDDEN-FLAG");
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("main takes the clock from its dependency, not from the command line", withRepo((repo) => {
  const run = runMain(baseArgv(repo), CLAUDE, { now: () => new Date("2027-01-02T03:04:05.678Z") });
  assert.equal(run.json.reviewedAt, "2027-01-02T03:04:05.678Z");
  assert.equal(parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1))).receipt.reviewedAt, "2027-01-02T03:04:05.678Z");
}));

test("main without a runner signal is refused", withRepo((repo) => {
  const run = runMain(baseArgv(repo), {});
  assert.equal(run.code, 2);
  assert.equal(run.json.code, "DRC-NO-RUNNER");
}));

test("the spawned command reads the real clock and the ambient runner signal", withRepo((repo) => {
  const before = Date.now();
  const run = spawnCli(baseArgv(repo), { CLAUDECODE: "1" });
  const after = Date.now();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.json.status, "created");
  const parsed = parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1)));
  assert.equal(parsed.ok, true);
  const stamped = Date.parse(parsed.receipt.reviewedAt);
  assert.ok(stamped >= before && stamped <= after, `reviewedAt ${parsed.receipt.reviewedAt} outside [${before}, ${after}]`);
  assert.equal(parsed.receipt.reviewer.runner, "claude");
  assert.equal(parsed.receipt.reviewer.model, "unknown");
  assert.notEqual(parsed.receipt.reviewer.model, criticModel());
}));

test("the spawned command with every runner signal stripped refuses and writes nothing", withRepo((repo) => {
  const run = spawnCli(baseArgv(repo));
  assert.equal(run.status, 2);
  assert.equal(run.json.code, "DRC-NO-RUNNER");
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("the spawned command refuses a forbidden flag even with a valid runner signal", withRepo((repo) => {
  for (const flag of ["--reviewed-at", "--sha256", "--model", "--runner"]) {
    const run = spawnCli([...baseArgv(repo), flag, "claude"], { CLAUDECODE: "1" });
    assert.equal(run.status, 2, flag);
    assert.equal(run.json.code, "DRC-FORBIDDEN-FLAG", flag);
  }
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));

test("the script carries the shebang and SPDX header and importing it runs nothing", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.ok(source.startsWith("#!/usr/bin/env node\n// SPDX-License-Identifier: SUL-1.0\n"));
  assert.equal(typeof main, "function");
});

// ----------------------------------------------------------------------------- D247: host-observed reviewer model (L3 part 3)

/** A private control area and a fake background child transcript, both outside the repository. */
function observationWorld(t, models = ["claude-opus-4"]) {
  const base = mkdtempSync(join(tmpdir(), "drc-obs-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const commonDir = join(base, "common");
  mkdirSync(join(base, "session", "subagents"), { recursive: true });
  writeFileSync(join(base, "session.jsonl"), "");
  const lines = models.map((model) => JSON.stringify({ type: "assistant", message: { role: "assistant", model, content: [{ type: "text", text: "x" }] } }));
  lines.push(JSON.stringify({ type: "assistant", message: { role: "assistant", model: "<synthetic>", content: [] } }));
  writeFileSync(join(base, "session", "subagents", "agent-a1.jsonl"), `${lines.join("\n")}\n`);
  const stop = (text) => ({ hook_event_name: "SubagentStop", agent_type: "pipeline-core:readiness-reviewer", agent_id: "a1", transcript_path: join(base, "session.jsonl"), last_assistant_message: text });
  return { commonDir, stop, deps: { commonDirFn: () => commonDir } };
}

test("D247: a background reviewer stop is recorded with the child transcript's models, and an unrelated stop is not", async (t) => {
  const { recordDesignReviewObservation, readDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t, ["claude-sonnet-4", "claude-opus-4"]);
  const recorded = recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("# Review\n\nVerdict: PASS\n"), nowMs: 1 });
  assert.equal(recorded.status, "recorded");
  assert.equal(recorded.model, "claude-opus-4");
  assert.equal(recorded.assurance, "host-observed-child-transcript");
  const record = readDesignReviewObservation({ commonDir: world.commonDir, resultSha256: sha("# Review\n\nVerdict: PASS\n") });
  assert.deepEqual(record.modelsUsed, ["claude-sonnet-4", "claude-opus-4"], "first-use order, the host's synthetic placeholder is no model");
  assert.equal(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("# Review\n\nVerdict: PASS\n") }).status, "already-recorded");
  assert.equal(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: { ...world.stop("x"), agent_type: "pipeline-core:critic" } }).status, "not-applicable");
  assert.equal(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "codex", input: world.stop("x") }).status, "not-applicable", "no Codex route is built");
});

test("D247: a foreground reviewer result is recorded with its resolved model; a background launch is left to the stop", async (t) => {
  const { recordDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t);
  const post = (response) => ({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_input: { subagent_type: "pipeline-core:readiness-reviewer" }, tool_response: response });
  assert.equal(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: post({ status: "async_launched" }) }).status, "not-applicable");
  assert.deepEqual(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: post({ status: "completed", content: [{ type: "text", text: "r" }] }) }), { status: "unobserved", code: "DRO-NO-RESOLVED-MODEL" });
  const recorded = recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude",
    input: post({ status: "completed", resolvedModel: "claude-opus-4-1", modelsUsed: ["claude-opus-4-1"], content: [{ type: "text", text: "report" }] }) });
  assert.equal(recorded.status, "recorded");
  assert.equal(recorded.assurance, "host-observed-tool-use");
  assert.equal(recorded.model, "claude-opus-4-1");
});

test("D247: a child transcript that is a symlink or holds no model is refused, never read through", async (t) => {
  const { observeClaudeDesignReview } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t, []);
  assert.deepEqual(observeClaudeDesignReview(world.stop("r")), { status: "unobserved", code: "DRO-NO-TRANSCRIPT-MODEL" });
  const linked = observationWorld(t);
  const file = join(linked.stop("r").transcript_path.slice(0, -".jsonl".length), "subagents", "agent-a1.jsonl");
  rmSync(file);
  symlinkSync(join(tmpdir(), "nowhere.jsonl"), file);
  assert.deepEqual(observeClaudeDesignReview(linked.stop("r")), { status: "unobserved", code: "DRO-TRANSCRIPT-UNSAFE" });
});

test("D247: an unobserved reviewer stop leaves its reason, and export-report names it when it finds no observation", withRepo(async (repo, t) => {
  const { recordDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t, []);
  assert.deepEqual(recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("# r\n"), nowMs: Date.parse("2026-11-13T10:00:00.000Z") }),
    { status: "unobserved", code: "DRO-NO-TRANSCRIPT-MODEL" });
  const missing = runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/none.md"], CLAUDE, world.deps);
  assert.equal(missing.json.code, "DRC-OBSERVATION-MISSING");
  assert.match(missing.json.message, /The latest reviewer stop on this device was not observed: DRO-NO-TRANSCRIPT-MODEL at 2026-11-13T10:00:00\.000Z\./u);
  assert.equal(existsSync(join(repo, "specs/feat-x/review/none.md")), false);
}));

test("D247: a background reviewer's SubagentHandback is the observed text, never later trailing prose (PF-61/PF-70)", async (t) => {
  const { observeClaudeDesignReview } = await import("../lib/design-review-observation.mjs");
  const { readSubagentHandbackMessage } = await import("../lib/native-goldfish-host-finalizer.mjs");
  const world = observationWorld(t);
  const file = join(world.stop("r").transcript_path.slice(0, -".jsonl".length), "subagents", "agent-a1.jsonl");
  const handback = JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4", content: [{ type: "tool_use", name: "SubagentHandback", input: { message: "# Review\n\nVerdict: PASS\n" } }] } });
  const trailing = JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4", content: [{ type: "text", text: "Handed back." }] } });
  writeFileSync(file, `${handback}\n${trailing}\n`);
  const seen = observeClaudeDesignReview(world.stop("Handed back."), { readHandbackFn: readSubagentHandbackMessage });
  assert.equal(seen.status, "observed");
  assert.equal(seen.text, "# Review\n\nVerdict: PASS\n", "the parent receives the handback, so the handback is the report");
  const noHandback = observationWorld(t);
  assert.equal(observeClaudeDesignReview(noHandback.stop("# Plain\n"), { readHandbackFn: readSubagentHandbackMessage }).text, "# Plain\n", "without a handback the last message is the return");
});

test("D247: export-report writes the observed text, and create stamps the observation and the observed model", withRepo(async (repo, t) => {
  const { recordDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t);
  recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("# Observed review\n\nVerdict: PASS\n") });
  const out = "specs/feat-x/review/design-review-observed.md";
  const exported = runMain(["export-report", "--repo", repo, "--out", out], CLAUDE, world.deps);
  assert.equal(exported.code, 0, exported.stderr);
  assert.equal(exported.json.status, "exported");
  assert.equal(readFileSync(join(repo, out), "utf8"), "# Observed review\n\nVerdict: PASS\n", "the text as returned");
  assert.equal(runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/again.md"], CLAUDE, world.deps).json.code, "DRC-OBSERVATION-MISSING", "an exported observation is not chosen again by default");
  const created = runMain(baseArgv(repo, { report: out }), CLAUDE, world.deps);
  assert.equal(created.code, 0, created.stderr);
  assert.deepEqual(created.json.reviewerObservation, { assurance: "host-observed-child-transcript", model: "claude-opus-4" });
  assert.equal("notice" in created.json, false);
  const receipt = parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1))).receipt;
  assert.equal(receipt.reviewer.model, "claude-opus-4");
  assert.deepEqual(receipt.reviewerObservation, { assurance: "host-observed-child-transcript", modelsUsed: ["claude-opus-4"], resultSha256: sha("# Observed review\n\nVerdict: PASS\n") });
  assert.equal("reviewerObservation" in summarizeDesignReviewReceipt({ path: RECEIPT1, bytes: readFileSync(join(repo, RECEIPT1)) }).summary, false, "the binding summary never carries it");
  // One observed dispatch stamps one round: a delta round over the same report is refused, with or without --previous.
  for (const over of [{ report: out, out: RECEIPT2, previous: RECEIPT1 }, { report: out, out: RECEIPT2 }]) {
    const replayed = runMain(baseArgv(repo, over), CLAUDE, world.deps);
    assert.equal(replayed.code, 2, JSON.stringify(over));
    assert.equal(replayed.json.code, "DRC-OBSERVATION-REPLAYED");
    assert.match(replayed.json.message, /design-review-1\.receipt\.json/u);
    assert.equal(existsSync(join(repo, RECEIPT2)), false);
  }
  // In another folder, over one changed Spec byte and without --previous, it is still a replay (bound in the private store).
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v2\n");
  mkdirSync(join(repo, "evidence"), { recursive: true });
  const elsewhere = runMain(baseArgv(repo, { report: out, out: "evidence/receipt-elsewhere.json" }), CLAUDE, world.deps);
  assert.equal(elsewhere.json.code, "DRC-OBSERVATION-REPLAYED");
  assert.match(elsewhere.json.message, /other PRD or Spec bytes/u);
  assert.equal(existsSync(join(repo, "evidence/receipt-elsewhere.json")), false);
  // A receipt made by mistake and deleted before commit is made again over the same PRD and Spec.
  writeFileSync(join(repo, SPEC), "# Spec\n\nspec text v1\n");
  rmSync(join(repo, RECEIPT1));
  const again = runMain(baseArgv(repo, { report: out }), CLAUDE, world.deps);
  assert.equal(again.code, 0, again.stderr);
  assert.equal(again.json.reviewerObservation.assurance, "host-observed-child-transcript");
}));

test("D247: a sanitized report binds the observation through its unpublished original", withRepo(async (repo, t) => {
  const { recordDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t);
  recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("# Original\n") });
  const original = "specs/feat-x/review/original.md";
  assert.equal(runMain(["export-report", "--repo", repo, "--out", original], CLAUDE, world.deps).code, 0);
  const created = runMain([...baseArgv(repo), "--original-report", original], CLAUDE, world.deps);
  assert.equal(created.code, 0, created.stderr);
  assert.equal(created.json.reviewerObservation.assurance, "host-observed-child-transcript");
}));

test("D247: without an observation a Claude receipt says unobserved and names the route; Codex and Antigravity say unobserved without a notice", withRepo((repo, t) => {
  const world = observationWorld(t);
  const claude = runMain(baseArgv(repo), CLAUDE, world.deps);
  assert.equal(claude.code, 0, claude.stderr);
  assert.deepEqual(claude.json.reviewerObservation, { assurance: "unobserved", model: "unknown" });
  assert.match(claude.json.notice, /PLAN-DESIGN-REVIEW-UNOBSERVED/u);
  assert.match(claude.json.notice, /export-report/u);
  for (const [env, out] of [[{ CODEX_SESSION_ID: "s" }, "specs/feat-x/review/codex.receipt.json"], [{ ANTIGRAVITY_AGENT: "1" }, "specs/feat-x/review/agy.receipt.json"]]) {
    const run = runMain(baseArgv(repo, { report: REPORT2, out }), env, world.deps);
    assert.equal(run.code, 0, run.stderr);
    assert.deepEqual(run.json.reviewerObservation, { assurance: "unobserved", model: "unknown" });
    assert.equal("notice" in run.json, false);
  }
}));

test("D247: export-report refuses an ambiguous choice with a compact list, an unknown digest and a second write", withRepo(async (repo, t) => {
  const { recordDesignReviewObservation } = await import("../lib/design-review-observation.mjs");
  const world = observationWorld(t);
  recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("one"), nowMs: 1 });
  recordDesignReviewObservation({ commonDir: world.commonDir, runner: "claude", input: world.stop("two"), nowMs: 2 });
  const ambiguous = runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/r.md"], CLAUDE, world.deps);
  assert.equal(ambiguous.json.code, "DRC-OBSERVATION-AMBIGUOUS");
  assert.ok(ambiguous.json.message.includes(sha("one")) && ambiguous.json.message.includes(sha("two")));
  assert.equal(runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/r.md", "--observation", "a".repeat(64)], CLAUDE, world.deps).json.code, "DRC-OBSERVATION-MISSING");
  assert.equal(runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/r.md", "--observation", sha("two")], CLAUDE, world.deps).code, 0);
  assert.equal(runMain(["export-report", "--repo", repo, "--out", "specs/feat-x/review/r.md", "--observation", sha("one")], CLAUDE, world.deps).json.code, "DRC-OUT-EXISTS");
}));

test("D247: the installed hook records a reviewer's foreground result and background stop, says one line, and never blocks", withRepo((repo, t) => {
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: repo }).status, 0);
  // The hook acts only in a governed project (an ungoverned one exits at once); the onboarding consent marker governs this fixture.
  mkdirSync(join(repo, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(repo, ".agent-pipeline", "onboarding-consent.json"), `${JSON.stringify({ schema: "pipeline.onboarding-consent-marker.v1", status: "consent-given-onboarding-incomplete", consentGivenAt: CLOCK })}\n`);
  const hook = fileURLToPath(new URL("../hooks/native-goldfish-host.mjs", import.meta.url));
  const runHook = (input) => spawnSync(process.execPath, [hook, "--runner", "claude"], { cwd: repo, input: JSON.stringify({ cwd: repo, session_id: "s-1", ...input }),
    encoding: "utf8", env: { ...strippedEnv(), CLAUDECODE: "1", CLAUDE_PROJECT_DIR: repo } });
  const store = join(repo, ".git", "agent-pipeline", "design-review-observations");
  const foreground = runHook({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "tu-1", tool_input: { subagent_type: "pipeline-core:readiness-reviewer" },
    tool_response: { status: "completed", resolvedModel: "claude-opus-4", content: [{ type: "text", text: "# Foreground review\n" }] } });
  assert.equal(foreground.status, 0, foreground.stderr);
  assert.notEqual(foreground.stdout, "", `the foreground hook says one line; stderr: ${foreground.stderr}`);
  const context = JSON.parse(foreground.stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /^Design review observed: reviewer model claude-opus-4 \(host-observed-tool-use\)\. /u);
  assert.equal(context.includes("Foreground review"), false, "the returned text never reaches the agent's context through the hook");
  assert.ok(existsSync(join(store, `${sha("# Foreground review\n")}.json`)));
  const world = observationWorld(t);
  const background = runHook(world.stop("# Background review\n"));
  assert.equal(background.status, 0, background.stderr);
  assert.equal(background.stdout, "", "a stop is never blocked");
  assert.ok(existsSync(join(store, `${sha("# Background review\n")}.json`)));
}));

test("D247: a self-asserted identity stays refused next to the observation route (W7)", withRepo((repo, t) => {
  const world = observationWorld(t);
  const run = runMain([...baseArgv(repo), "--observed-identity", "claude-opus-4"], CLAUDE, world.deps);
  assert.equal(run.json.code, "DRC-OBSERVATION-UNATTESTED");
  assert.equal(existsSync(join(repo, RECEIPT1)), false);
}));
