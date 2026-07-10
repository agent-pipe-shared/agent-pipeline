#!/usr/bin/env node
/**
 * critic-bare.test.mjs -- versioned test suite for the neutral-cwd headless-critic wrapper
 * (critic-bare.mjs) and its verdict schema (critic-verdict.schema.json).
 *
 * Same plain-assertion style + "N/N cases passed." output convention as
 * plugins/pipeline-core/hooks/guard-git.test.mjs (read first to match the pattern).
 *
 * NO real auth, NO network, NO real `claude` invocation anywhere in this file (forbidden by the
 * dispatching briefing; the live headless path also has documented defects -- see the wrapper's
 * own file header). Two test strategies:
 *   - Pure-function / mocked-child cases: import the wrapper's exported functions directly and
 *     drive them with fixture data, or with a FakeChild (a plain EventEmitter standing in for a
 *     child_process.ChildProcess) injected through the spawnFn seam.
 *   - Real-child watchdog cases: spawn an actual, harmless `node -e` process (never `claude`) and
 *     attach the real attachWatchdog()/runOnce() machinery to it -- proving the auto-kill
 *     guarantee against a genuine OS process, not a mocked kill() call.
 *
 * Hermetics: CLI-level cases strip all CRITIC_BARE_* env vars from the spawned child's base env
 * (same rationale/technique as guard-git.test.mjs's PIPELINE_GUARD_OVERRIDE stripping) so an
 * ambient environment variable on the dev machine can never leak into an expectation.
 *
 * Run:   node plugins/pipeline-core/scripts/critic-bare.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULTS,
  EXIT,
  parseCliArgs,
  loadSchema,
  validateAgainstSchema,
  parseStreamJsonEvents,
  findResultEvent,
  extractCost,
  extractVerdict,
  buildChildArgs,
  attachWatchdog,
  runOnce,
} from "./critic-bare.mjs";

const SCRIPT = fileURLToPath(new URL("./critic-bare.mjs", import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL("./critic-verdict.schema.json", import.meta.url));

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

// ---- CLI-level black-box cases (spawnSync, mirrors guard-git.test.mjs's runGuard pattern) -----
function runCli(args) {
  const { CRITIC_BARE_REPO, CRITIC_BARE_PROMPT_FILE, CRITIC_BARE_MODEL, CRITIC_BARE_MAX_SECONDS, CRITIC_BARE_IDLE_SECONDS, CRITIC_BARE_NEUTRAL_CWD, ...baseEnv } =
    process.env;
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: baseEnv });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
function checkCli(id, args, expectExit, { stdoutIncludes, stderrIncludes } = {}) {
  const { code, stdout, stderr } = runCli(args);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stdoutIncludes ?? [])) {
    if (!stdout.includes(needle)) problems.push(`stdout missing "${needle}"`);
  }
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  record(id, problems.length === 0, problems.join("; "));
}

checkCli("CLI help     --help exits 0 with usage text", ["--help"], 0, {
  stdoutIncludes: ["--repo", "--prompt-file", "EXIT CODES"],
});
checkCli("CLI noargs   no arguments at all exits 0 with usage text (same contract as --help)", [], 0, {
  stdoutIncludes: ["--repo", "USAGE:"],
});
checkCli("CLI cfgerr   --repo without --prompt-file exits 1 with an explicit error", ["--repo", "."], 1, {
  stderrIncludes: ["--prompt-file"],
});
checkCli("CLI unknown  an unrecognized flag exits 1 with an explicit error", ["--bogus"], 1, {
  stderrIncludes: ["unknown argument"],
});

// ---- parseCliArgs (pure function) --------------------------------------------------------------
{
  const opts = parseCliArgs([], {});
  record(
    "ARGS defaults  no flags/env -> DEFAULTS applied",
    opts.model === DEFAULTS.model &&
      opts.maxSeconds === DEFAULTS.maxSeconds &&
      opts.idleSeconds === DEFAULTS.idleSeconds &&
      opts.help === false,
    `opts=${JSON.stringify(opts)}`,
  );
}
{
  const opts = parseCliArgs(["--max-seconds", "42", "--model", "opus"], {});
  record("ARGS flags     CLI flags override defaults", opts.maxSeconds === 42 && opts.model === "opus", `opts=${JSON.stringify(opts)}`);
}
{
  const opts = parseCliArgs([], { CRITIC_BARE_MODEL: "haiku" });
  record("ARGS env       env fallback applies when no flag is given", opts.model === "haiku", `opts=${JSON.stringify(opts)}`);
}
{
  const opts = parseCliArgs(["--model", "opus"], { CRITIC_BARE_MODEL: "haiku" });
  record("ARGS precedence  a CLI flag wins over env when both are given", opts.model === "opus", `opts=${JSON.stringify(opts)}`);
}
{
  let threw = false;
  try {
    parseCliArgs(["--max-seconds", "not-a-number"], {});
  } catch {
    threw = true;
  }
  record("ARGS invalid   a non-numeric --max-seconds throws on a non-help invocation", threw, "expected parseCliArgs to throw");
}
{
  const args = buildChildArgs({ repoAbs: "/tmp/repo", promptText: "hello", model: "sonnet" });
  const expected = ["-p", "hello", "--add-dir", "/tmp/repo", "--output-format", "stream-json", "--model", "sonnet"];
  record(
    "ARGS childargs  buildChildArgs produces the exact fixed CLI shape (no --json-schema pass-through, by design)",
    JSON.stringify(args) === JSON.stringify(expected),
    `args=${JSON.stringify(args)}`,
  );
}

// ---- stream-json parsing (pure functions) ------------------------------------------------------
{
  const text = [
    JSON.stringify({ type: "system", subtype: "init" }),
    "",
    JSON.stringify({ type: "assistant", message: "reviewing" }),
    JSON.stringify({ type: "result", total_cost_usd: 0.05, result: '{"pass":true}' }),
  ].join("\n");
  const { events, parseErrors } = parseStreamJsonEvents(text);
  record(
    "PARSE ndjson    parses multi-line NDJSON and skips blank lines",
    events.length === 3 && parseErrors.length === 0,
    `events=${events.length} parseErrors=${parseErrors.length}`,
  );
}
{
  const text = [JSON.stringify({ type: "system" }), "{ not json", JSON.stringify({ type: "result", result: "{}" })].join("\n");
  const { events, parseErrors } = parseStreamJsonEvents(text);
  record(
    "PARSE tolerant  a malformed line is collected as a parseError instead of throwing",
    events.length === 2 && parseErrors.length === 1,
    `events=${events.length} parseErrors=${JSON.stringify(parseErrors)}`,
  );
}
{
  const events = [
    { type: "result", result: "first" },
    { type: "assistant" },
    { type: "result", result: "last" },
  ];
  const found = findResultEvent(events);
  record("PARSE lastresult  findResultEvent returns the LAST type:result event", found?.result === "last", `found=${JSON.stringify(found)}`);
}
{
  const found = findResultEvent([{ type: "assistant" }]);
  record("PARSE noresult  findResultEvent returns undefined when none is present", found === undefined, `found=${JSON.stringify(found)}`);
}
{
  record("COST present    extractCost reads a numeric total_cost_usd", extractCost({ total_cost_usd: 0.1234 }) === 0.1234, "expected 0.1234");
}
{
  const a = extractCost({});
  const b = extractCost({ total_cost_usd: "x" });
  record("COST missing    extractCost returns undefined when absent/non-numeric", a === undefined && b === undefined, `a=${a} b=${b}`);
}
{
  const { verdict, error } = extractVerdict({ result: '{"pass":true,"findings":[]}' });
  record(
    "VERDICT parse   extractVerdict parses the embedded JSON text out of the result event",
    error === undefined && verdict.pass === true,
    `verdict=${JSON.stringify(verdict)} error=${error}`,
  );
}
{
  const { verdict, error } = extractVerdict({ result: "not json at all" });
  record(
    "VERDICT badjson  extractVerdict reports an explicit error on non-JSON result text",
    verdict === undefined && typeof error === "string" && error.includes("not valid JSON"),
    `error=${error}`,
  );
}
{
  const { verdict, error } = extractVerdict(undefined);
  record("VERDICT noevent  extractVerdict reports an explicit error when there is no result event", verdict === undefined && typeof error === "string", `error=${error}`);
}

// ---- schema validation (loads the REAL shipped schema file) --------------------------------------
const SCHEMA = loadSchema(SCHEMA_PATH);
const VALID_VERDICT = {
  findings: [
    {
      gap: "no rollback path documented",
      risk: "operational risk if migration fails, minor",
      severity: "minor",
      evidence: "docs/migration.md:12",
      spec_ref: "AC-3",
    },
  ],
  deliberately_not_flagged: ["spec fidelity", "scope", "security surface"],
  trajectory_verdict: "consistent",
  trajectory_evidence: "evidence log matches the claimed command and exit code",
  briefing_violations: [],
  pass: true,
};

{
  const { valid, errors } = validateAgainstSchema(VALID_VERDICT, SCHEMA);
  record("SCHEMA valid       a fully-valid verdict fixture passes against the shipped schema", valid && errors.length === 0, `errors=${JSON.stringify(errors)}`);
}
{
  const missingPass = { ...VALID_VERDICT };
  delete missingPass.pass;
  const { valid, errors } = validateAgainstSchema(missingPass, SCHEMA);
  record(
    "SCHEMA missing-pass  a verdict without `pass` fails validation and names the field",
    !valid && errors.some((e) => e.includes('"pass"')),
    `errors=${JSON.stringify(errors)}`,
  );
}
{
  const badSeverity = { ...VALID_VERDICT, findings: [{ ...VALID_VERDICT.findings[0], severity: "critical" }] };
  const { valid, errors } = validateAgainstSchema(badSeverity, SCHEMA);
  record(
    "SCHEMA bad-severity  an out-of-enum severity fails validation and names the field",
    !valid && errors.some((e) => e.includes("severity")),
    `errors=${JSON.stringify(errors)}`,
  );
}
{
  const extra = { ...VALID_VERDICT, unexpected_field: "should not be here" };
  const { valid, errors } = validateAgainstSchema(extra, SCHEMA);
  record(
    "SCHEMA extra-field  an unexpected top-level property fails validation (additionalProperties:false)",
    !valid && errors.some((e) => e.includes("unexpected_field")),
    `errors=${JSON.stringify(errors)}`,
  );
}
{
  const empties = { ...VALID_VERDICT, findings: [], deliberately_not_flagged: [], briefing_violations: [] };
  const { valid, errors } = validateAgainstSchema(empties, SCHEMA);
  record(
    "SCHEMA empty-arrays  empty findings/deliberately_not_flagged/briefing_violations are VALID (anti-overreporting, §2.5)",
    valid && errors.length === 0,
    `errors=${JSON.stringify(errors)}`,
  );
}

// ---- mocked end-to-end runOnce (FakeChild via the spawnFn seam -- no real auth/network) ----------
function makeFakeChild({ lines, exitCode = 0 }) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.__killed = true;
  };
  setImmediate(() => {
    for (const line of lines) child.stdout.emit("data", Buffer.from(line + "\n"));
    child.emit("exit", exitCode, null);
  });
  return child;
}
function resultLine({ verdict, cost = 0.1234 }) {
  return JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: cost, result: JSON.stringify(verdict) });
}
async function withCapturedOutput(fn) {
  const outLines = [];
  const errLines = [];
  const origLog = console.log;
  const origErrWrite = process.stderr.write.bind(process.stderr);
  console.log = (...args) => outLines.push(args.join(" "));
  process.stderr.write = (chunk) => {
    errLines.push(String(chunk));
    return true;
  };
  try {
    const result = await fn();
    return { result, stdout: outLines.join("\n"), stderr: errLines.join("") };
  } finally {
    console.log = origLog;
    process.stderr.write = origErrWrite;
  }
}

const FIXTURE_DIR = mkdtempSync(join(tmpdir(), "critic-bare-test-"));
const REPO_DIR = join(FIXTURE_DIR, "repo");
mkdirSync(REPO_DIR, { recursive: true });
const PROMPT_FILE = join(FIXTURE_DIR, "prompt.txt");
writeFileSync(PROMPT_FILE, "You are the Critic. Review the diff and emit the verdict JSON.");
const BASE_OPTS = {
  repo: REPO_DIR,
  promptFile: PROMPT_FILE,
  model: DEFAULTS.model,
  maxSeconds: 5,
  idleSeconds: 5,
  neutralCwd: tmpdir(),
  schema: SCHEMA_PATH,
};

{
  const lines = [JSON.stringify({ type: "system", subtype: "init" }), resultLine({ verdict: VALID_VERDICT, cost: 0.4321 })];
  const { result, stdout } = await withCapturedOutput(() => runOnce(BASE_OPTS, { spawnFn: () => makeFakeChild({ lines }) }));
  record(
    "E2E valid            mocked valid-verdict fixture parses+validates, exit 0, cost printed",
    result === EXIT.OK && stdout.includes("total_cost_usd=0.4321"),
    `result=${result} stdout=${JSON.stringify(stdout)}`,
  );
}
{
  const missingPass = { ...VALID_VERDICT };
  delete missingPass.pass;
  const lines = [resultLine({ verdict: missingPass })];
  const { result, stderr } = await withCapturedOutput(() => runOnce(BASE_OPTS, { spawnFn: () => makeFakeChild({ lines }) }));
  record(
    "E2E schema-invalid(pass)      missing `pass` fails validation, non-zero exit, explicit error",
    result === EXIT.SCHEMA_INVALID && stderr.includes("pass"),
    `result=${result} stderr=${JSON.stringify(stderr)}`,
  );
}
{
  const badSeverity = { ...VALID_VERDICT, findings: [{ ...VALID_VERDICT.findings[0], severity: "critical" }] };
  const lines = [resultLine({ verdict: badSeverity })];
  const { result, stderr } = await withCapturedOutput(() => runOnce(BASE_OPTS, { spawnFn: () => makeFakeChild({ lines }) }));
  record(
    "E2E schema-invalid(severity)  bad severity fails validation, non-zero exit, explicit error",
    result === EXIT.SCHEMA_INVALID && stderr.includes("severity"),
    `result=${result} stderr=${JSON.stringify(stderr)}`,
  );
}
{
  const { result, stderr } = await withCapturedOutput(() => runOnce(BASE_OPTS, { spawnFn: () => makeFakeChild({ lines: [], exitCode: 1 }) }));
  record(
    "E2E child-nonzero    a child exiting non-zero is reported, non-zero exit",
    result === EXIT.CHILD_NONZERO && stderr.includes("code 1"),
    `result=${result} stderr=${JSON.stringify(stderr)}`,
  );
}
{
  const lines = [JSON.stringify({ type: "system", subtype: "init" }), JSON.stringify({ type: "assistant", message: "no result event ever arrives" })];
  const { result, stderr } = await withCapturedOutput(() => runOnce(BASE_OPTS, { spawnFn: () => makeFakeChild({ lines, exitCode: 0 }) }));
  record(
    "E2E no-result-event  a missing result event is reported, non-zero exit",
    result === EXIT.NO_RESULT_EVENT && stderr.includes("result"),
    `result=${result} stderr=${JSON.stringify(stderr)}`,
  );
}

// ---- REAL child watchdog kills (the anti-hang proof, DoD condition 4) --------------------------
// Direct attachWatchdog() calls against a real, harmless `node -e` process -- never `claude`, no
// auth/network. maxSeconds/idleSeconds are deliberately mismatched (one large, one tiny) per case
// so each timer's OWN reason-discrimination is proven independently of the other.
async function testAttachWatchdogIdle() {
  const start = Date.now();
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 999999)"], { stdio: ["ignore", "pipe", "pipe"] });
  let info = null;
  const watchdog = attachWatchdog(child, { maxSeconds: 5, idleSeconds: 0.3 }, (i) => {
    info = i;
  });
  await new Promise((res) => child.once("exit", res));
  watchdog.cleanup();
  const elapsedMs = Date.now() - start;
  record(
    "WD-idle direct   attachWatchdog auto-kills a silent real child via the idle timer",
    info?.reason === "idle" && elapsedMs < 5000,
    `info=${JSON.stringify(info)} elapsedMs=${elapsedMs}`,
  );
  console.log(`   observed idle-kill latency: ${elapsedMs}ms (idle limit configured: 300ms)`);
}
async function testAttachWatchdogIdleReset() {
  const start = Date.now();
  // A real child that emits output every ~100ms for ten emissions (~1s total), well past the 300ms
  // idle window overall -- but each individual gap between emissions is well INSIDE that window.
  // idleSeconds (0.3s) is deliberately SHORTER than maxSeconds (5s), so max-runtime can never mask
  // a broken idle-reset the way the sustained-activity coverage in testAttachWatchdogMaxRuntime does
  // (that case uses the opposite ordering by design and proves the max-runtime timer specifically).
  // If resetIdle()/onActivity were removed or broken, the initial idle timer armed by attachWatchdog
  // would never be re-armed on subsequent data events and would fire at ~300ms -- long before the
  // child's natural exit at ~1000ms+ -- killing it early. A genuinely-working reset instead lets the
  // child run to completion and exit on its own.
  const child = spawn(
    process.execPath,
    ["-e", "let n = 0; const iv = setInterval(() => { process.stdout.write('x'); if (++n >= 10) clearInterval(iv); }, 100);"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let info = null;
  const watchdog = attachWatchdog(child, { maxSeconds: 5, idleSeconds: 0.3 }, (i) => {
    info = i;
  });
  await new Promise((res) => child.once("exit", res));
  watchdog.cleanup();
  const elapsedMs = Date.now() - start;
  record(
    "WD-idle-reset direct  sustained sub-idle-threshold activity keeps re-arming the idle timer -- child is NOT killed, exits naturally",
    info === null && elapsedMs < 5000,
    `info=${JSON.stringify(info)} elapsedMs=${elapsedMs}`,
  );
  console.log(`   observed natural-exit latency: ${elapsedMs}ms (idle limit 300ms; a broken resetIdle would instead fire the kill near ~300ms)`);
}
async function testAttachWatchdogMaxRuntime() {
  const start = Date.now();
  const child = spawn(process.execPath, ["-e", "setInterval(() => process.stdout.write('x'), 50); setTimeout(() => {}, 999999)"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let info = null;
  const watchdog = attachWatchdog(child, { maxSeconds: 0.3, idleSeconds: 5 }, (i) => {
    info = i;
  });
  await new Promise((res) => child.once("exit", res));
  watchdog.cleanup();
  const elapsedMs = Date.now() - start;
  record(
    "WD-max direct    attachWatchdog auto-kills a real child via the max-runtime cap even while it is producing healthy output",
    info?.reason === "max-runtime" && elapsedMs < 5000,
    `info=${JSON.stringify(info)} elapsedMs=${elapsedMs}`,
  );
  console.log(`   observed max-runtime-kill latency: ${elapsedMs}ms (max-runtime limit configured: 300ms)`);
}
async function testRunOnceIdleKillEndToEnd() {
  const start = Date.now();
  const realHarmlessSpawnFn = () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 999999)"], { stdio: ["ignore", "pipe", "pipe"] });
  const opts = { ...BASE_OPTS, maxSeconds: 5, idleSeconds: 0.3 };
  const { result, stderr } = await withCapturedOutput(() => runOnce(opts, { spawnFn: realHarmlessSpawnFn }));
  const elapsedMs = Date.now() - start;
  record(
    "E2E-WD idle      runOnce's full flow kills a REAL child via the idle watchdog and reports loudly on stderr",
    result === EXIT.WATCHDOG_KILLED && stderr.includes("WATCHDOG TIMEOUT") && stderr.includes("idle") && elapsedMs < 5000,
    `result=${result} elapsedMs=${elapsedMs} stderr=${JSON.stringify(stderr)}`,
  );
  console.log(`   observed end-to-end idle-kill latency: ${elapsedMs}ms (idle limit configured: 300ms)`);
}

await testAttachWatchdogIdle();
await testAttachWatchdogIdleReset();
await testAttachWatchdogMaxRuntime();
await testRunOnceIdleKillEndToEnd();

// ---- Summary --------------------------------------------------------------------------------------
for (const dir of [FIXTURE_DIR]) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
