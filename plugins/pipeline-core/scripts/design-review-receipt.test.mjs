// SPDX-License-Identifier: SUL-1.0
// ALF-G4C: tests for the design review receipt producer. A receipt is produced from files on disk with the
// review time taken from the clock, the runner from the runtime signal and the reviewer model from the
// Critic agent definition; no flag can supply any of those values.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("a requested route is recorded as requested and never as executed", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { requestedRoute: "opus-4-7" }), { env: CLAUDE, now });
  assert.equal(result.ok, true);
  assert.equal(result.requestedRoute, "opus-4-7");
  assert.equal(result.observedIdentity, "unknown");
  assert.equal(result.receipt.reviewer.model, "unknown");
  assert.equal(readFileSync(join(repo, RECEIPT1), "utf8").includes("opus-4-7"), false);
}));

test("a supplied observation is recorded as observed, apart from the requested route", withRepo((repo) => {
  const result = createReceiptFromDisk(request(repo, { requestedRoute: "opus", observedIdentity: "claude-opus-4-7" }), { env: CLAUDE, now });
  assert.equal(result.ok, true);
  assert.equal(result.requestedRoute, "opus");
  assert.equal(result.observedIdentity, "claude-opus-4-7");
  assert.equal(result.receipt.reviewer.model, "claude-opus-4-7");
  assert.equal(parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT1))).ok, true);
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
  const observed = runMain(baseArgv(repo, { out: RECEIPT2, "requested-route": "opus", "observed-identity": "claude-opus-4-7" }));
  assert.equal(observed.code, 0, observed.stderr);
  assert.deepEqual([observed.json.requestedRoute, observed.json.observedIdentity], ["opus", "claude-opus-4-7"]);
  assert.equal(parseDesignReviewReceipt(readFileSync(join(repo, RECEIPT2))).receipt.reviewer.model, "claude-opus-4-7");
}));

test("library refusals pass through under their own code and write nothing", withRepo((repo) => {
  const badFinding = createReceiptFromDisk(request(repo, { openFindingIds: ["not an id"] }), { env: CLAUDE, now });
  assert.deepEqual([badFinding.ok, badFinding.code], [false, "DRR-FINDING-IDS"]);
  const sameSources = createReceiptFromDisk(request(repo, { specPath: PRD }), { env: CLAUDE, now });
  assert.equal(sameSources.code, "DRR-SOURCES");
  const badFeature = createReceiptFromDisk(request(repo, { featureId: "Not A Feature" }), { env: CLAUDE, now });
  assert.equal(badFeature.code, "DRR-SHAPE");
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
