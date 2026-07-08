#!/usr/bin/env node
/**
 * critic-bare.mjs -- Neutral-cwd headless-critic wrapper.
 *
 * TOOLING, NOT A HOOK/GUARDRAIL: this script is a self-contained CLI tool
 * (policies/tooling-policy.md tool-type matrix). It is not wired into any
 * hook, ritual, or the Critic contract by this delivery -- that wiring
 * (updating templates/prompts/critic-review.md, harness/review-protocol.md
 * §2.3, roles/critic.md CR-09 to point at this script) is a separate,
 * deferred work package. This script just has to exist, self-test green,
 * and be invocable.
 *
 * WHY NEUTRAL-CWD, NOT --bare
 * ----------------------------------------------------------------------
 * Three defects of the headless path were empirically reproduced (CLI
 * 2.1.200):
 *   1. `claude -p --bare` reproducibly breaks the OAuth credential lookup
 *      ("Not logged in"); the same call WITHOUT --bare works. Do not add
 *      --bare back in here -- re-test only via the tooling-radar trigger
 *      (re-run the mini-test on every Claude Code CLI update).
 *   2. Without --add-dir <repo>, repo reads from a neutral cwd are
 *      outside-workspace; the headless process cannot ask the permission
 *      question and hangs SILENTLY (observed: 16 min, 3 CPU-s, 0 output).
 *   3. A prompt piped via stdin never arrives in a background headless run
 *      (observed twice: 15 min, 0 bytes stdout+stderr); passing the prompt
 *      as a CLI argument works.
 * The substitute for --bare's isolation is running `claude -p` (no --bare)
 * from a NEUTRAL working directory (default: os.tmpdir()) so this repo's
 * own CLAUDE.md/hooks do not auto-load via cwd-discovery. The repo under
 * review is made readable explicitly via --add-dir.
 *
 * RESIDUAL DEVIATION (documented, not fixed here): user-scope ~/.claude
 * settings/memory are HOME-scoped, not cwd-scoped, and still apply even
 * from a neutral cwd. Full input isolation exists only at the (currently
 * broken) --bare level -- accepted trade-off, see ADR-0003.
 *
 * HARDENING DoD IMPLEMENTED HERE (all mandatory)
 * ----------------------------------------------------------------------
 *  - Prompt passed as a CLI ARGUMENT (read from --prompt-file), never via
 *    stdin; stdin is explicitly `ignore`d on the child so nothing can ever
 *    block waiting for it (see spawnCritic()).
 *  - --add-dir <repo-abspath> always passed for the review target.
 *  - --output-format stream-json always passed for a live heartbeat.
 *  - Hard max-runtime cap AND an idle-watchdog (no stdout/stderr data
 *    within N seconds) -- either fires an auto-kill of the child plus a
 *    loud, explicit banner on stderr. Never a silent hang (attachWatchdog()).
 *  - stderr captured on a buffer separate from stdout throughout (runOnce()).
 *  - The final stream-json "result" event is parsed, its `result` text is
 *    parsed as the verdict JSON, and that verdict is VALIDATED against
 *    critic-verdict.schema.json with a hand-rolled validator (no schema
 *    library dependency -- see validateAgainstSchema()). Invalid or missing
 *    verdict -> non-zero exit + an explicit error message; this script
 *    never fabricates a pass.
 *  - `total_cost_usd` is extracted from the result event and printed as
 *    `total_cost_usd=<value>` (MP-20 headless telemetry convention).
 *  - Config via CLI flags with env-var fallbacks, sane defaults -- see
 *    USAGE below / --help.
 *
 * NOT IMPLEMENTED HERE (deliberately, scope boundary of this delivery)
 * ----------------------------------------------------------------------
 *  - No --json-schema flag is sent to the CHILD CLI. The fixed design for
 *    this delivery only requires the WRAPPER to validate the verdict
 *    post-hoc against the schema file (done above); constraining the
 *    child's own output via a CLI-level --json-schema flag is a distinct,
 *    unverified behavior outside the --bare path this backlog item found
 *    broken, and is left for the deferred wiring/codification package.
 *  - Wiring into any hook, skill, agent, or the Critic contract documents.
 *  - A real `claude -p` invocation is never exercised by this script's own
 *    tests (needs auth; the live path has documented defects above) -- all
 *    tests use mock stream-json fixtures or harmless local `node -e` child
 *    processes.
 *
 * CLI ARGUMENTS SENT TO THE CHILD (see buildChildArgs()):
 *   claude -p <promptText> --add-dir <repoAbs> --output-format stream-json
 *          --model <model>
 *
 * RESTART / RERUN NOTE
 * ----------------------------------------------------------------------
 * Exit code 2 (watchdog kill) always means the child was fully terminated
 * before this script exits (attachWatchdog awaits the child's own "exit"
 * event after calling .kill(), so there is no orphan process to clean up
 * manually) -- it is always safe to rerun immediately. A single idle/
 * max-runtime kill can be a transient blip (auth prompt, network hiccup):
 * rerun once. If a rerun times out again on the SAME task, that is a
 * genuine hang, not noise -- stop, do not loop, inspect auth/session
 * state manually, and only then consider raising --idle-seconds /
 * --max-seconds. Exit codes 4/5/6 (no result event / unparseable verdict /
 * schema-invalid verdict) are not timing issues; rerunning without
 * changing the prompt or investigating the child's raw stdout/stderr is
 * unlikely to help.
 *
 * Node built-ins only, ESM. See critic-bare.test.mjs for the test suite
 * (mock fixtures + real harmless child processes, no auth/network).
 */

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = join(SCRIPT_DIR, "critic-verdict.schema.json");

export const DEFAULTS = Object.freeze({
  // The wrapper is model-agnostic tooling; the actual tier used at dispatch is an Elephant /
  // model-policy (MP-05/MP-07) decision passed in via --model. "sonnet" is just a sane default.
  model: "sonnet",
  // 15 min ceiling for a legitimately slow-but-working review; both documented hangs (see header)
  // ran 15-16 min with ZERO output the entire time, so this is a ceiling on runaway cost/time, not
  // the primary hang-detector -- that job belongs to idleSeconds below.
  maxSeconds: 900,
  // 2 min of zero stdout/stderr activity is the actual hang-detector: both documented hangs had
  // 0 bytes of output for their entire (15-16 min) duration, so even this conservative buffer
  // catches them far earlier than waiting for maxSeconds to expire on its own.
  idleSeconds: 120,
  neutralCwd: tmpdir(),
  schema: DEFAULT_SCHEMA_PATH,
});

export const EXIT = Object.freeze({
  OK: 0,
  GENERIC_ERROR: 1,
  WATCHDOG_KILLED: 2,
  CHILD_NONZERO: 3,
  NO_RESULT_EVENT: 4,
  VERDICT_PARSE_ERROR: 5,
  SCHEMA_INVALID: 6,
});

const USAGE = `critic-bare.mjs -- neutral-cwd headless-critic wrapper (tooling, not a hook)

Runs a critic as a headless \`claude -p\` process from a NEUTRAL working
directory so this repo's CLAUDE.md/hooks do not auto-load (see the file
header for the full rationale and the three empirically-documented defects
this replaces the --bare flag for).

USAGE:
  node critic-bare.mjs --repo <path> --prompt-file <path> [options]
  node critic-bare.mjs --help

REQUIRED (for a real run):
  --repo <path>          Repo under review; made readable via --add-dir.
  --prompt-file <path>   File containing the full critic prompt. The prompt
                         is passed to the child as an ARGUMENT, never via
                         stdin (stdin-pipe hangs forever in a background
                         headless run -- documented empirically).

OPTIONS (env fallback in parens; a CLI flag wins if both are given):
  --model <name>         (CRITIC_BARE_MODEL)        default: ${DEFAULTS.model}
  --max-seconds <n>      (CRITIC_BARE_MAX_SECONDS)  default: ${DEFAULTS.maxSeconds}
  --idle-seconds <n>     (CRITIC_BARE_IDLE_SECONDS) default: ${DEFAULTS.idleSeconds}
  --neutral-cwd <path>   (CRITIC_BARE_NEUTRAL_CWD)  default: os.tmpdir()
  --schema <path>        verdict schema file        default: colocated critic-verdict.schema.json
  --help, -h             print this text and exit 0

EXIT CODES:
  0  verdict obtained and schema-valid (this does NOT mean pass:true -- the
     wrapper relays the verdict, the Elephant makes the gate decision)
  1  usage/config error (bad flags, missing required option, bad path) or
     an unexpected internal failure
  2  watchdog killed the child (idle timeout or max-runtime cap) -- see
     stderr for a loud, explicit report; never a silent hang
  3  child process itself exited with a non-zero code
  4  no "result"-type stream-json event found in child stdout
  5  the result event's text was not valid JSON (cannot extract a verdict)
  6  verdict JSON parsed but failed schema validation

See the file header for the restart/rerun note and known limitations.
`;

/**
 * Parse CLI argv into an options object. Pure function -- never touches the filesystem or
 * process.exit; throws on a malformed invocation so the caller decides how to report it.
 */
export function parseCliArgs(argv, env = process.env) {
  const opts = {
    help: false,
    repo: env.CRITIC_BARE_REPO,
    promptFile: env.CRITIC_BARE_PROMPT_FILE,
    model: env.CRITIC_BARE_MODEL || DEFAULTS.model,
    maxSeconds: env.CRITIC_BARE_MAX_SECONDS !== undefined ? Number(env.CRITIC_BARE_MAX_SECONDS) : DEFAULTS.maxSeconds,
    idleSeconds:
      env.CRITIC_BARE_IDLE_SECONDS !== undefined ? Number(env.CRITIC_BARE_IDLE_SECONDS) : DEFAULTS.idleSeconds,
    neutralCwd: env.CRITIC_BARE_NEUTRAL_CWD || DEFAULTS.neutralCwd,
    schema: DEFAULTS.schema,
  };

  const takeValue = (flag, i) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} requires a value`);
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--repo":
        opts.repo = takeValue(a, i);
        i++;
        break;
      case "--prompt-file":
        opts.promptFile = takeValue(a, i);
        i++;
        break;
      case "--model":
        opts.model = takeValue(a, i);
        i++;
        break;
      case "--max-seconds":
        opts.maxSeconds = Number(takeValue(a, i));
        i++;
        break;
      case "--idle-seconds":
        opts.idleSeconds = Number(takeValue(a, i));
        i++;
        break;
      case "--neutral-cwd":
        opts.neutralCwd = takeValue(a, i);
        i++;
        break;
      case "--schema":
        opts.schema = takeValue(a, i);
        i++;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }

  if (!opts.help) {
    if (!Number.isFinite(opts.maxSeconds) || opts.maxSeconds <= 0) {
      throw new Error(`--max-seconds must be a positive number, got: ${opts.maxSeconds}`);
    }
    if (!Number.isFinite(opts.idleSeconds) || opts.idleSeconds <= 0) {
      throw new Error(`--idle-seconds must be a positive number, got: ${opts.idleSeconds}`);
    }
  }

  return opts;
}

export function printUsage(stream = process.stdout) {
  stream.write(USAGE);
}

// ---------------------------------------------------------------------------------------------
// Schema loading (file I/O) + validation. The hand-rolled JSON-Schema validator itself (no
// library dependency; understands exactly the keywords used in critic-verdict.schema.json:
// type, required, properties, items, enum, additionalProperties) now lives in
// plugins/pipeline-core/lib/schema-lite.mjs (extracted verbatim) so other
// callers can reuse it without a copy -- extend it in lockstep with the schema file; it
// silently ignores keywords it doesn't know. `validateAgainstSchema` is re-exported here
// unchanged so existing importers of this module (critic-bare.test.mjs) keep working.
// ---------------------------------------------------------------------------------------------

export function loadSchema(schemaPath = DEFAULTS.schema) {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

export { validateAgainstSchema };

// ---------------------------------------------------------------------------------------------
// stream-json parsing (NDJSON events from `claude -p --output-format stream-json`).
// ---------------------------------------------------------------------------------------------

export function parseStreamJsonEvents(text) {
  const events = [];
  const parseErrors = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      parseErrors.push({ line, message: err.message });
    }
  }
  return { events, parseErrors };
}

/** The LAST type:"result" event wins (defensive against a hypothetical duplicate). */
export function findResultEvent(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i] && typeof events[i] === "object" && events[i].type === "result") {
      return events[i];
    }
  }
  return undefined;
}

export function extractCost(resultEvent) {
  if (!resultEvent || typeof resultEvent.total_cost_usd !== "number") return undefined;
  return resultEvent.total_cost_usd;
}

/** Returns { verdict, error, raw }. `verdict` is undefined and `error` is set on any failure --
 *  never fabricates a verdict. */
export function extractVerdict(resultEvent) {
  if (!resultEvent) {
    return { verdict: undefined, error: 'no "result"-type event found in stream-json output' };
  }
  const raw = resultEvent.result;
  if (typeof raw !== "string" || raw.trim() === "") {
    return { verdict: undefined, error: 'result event has no non-empty "result" text field' };
  }
  try {
    const verdict = JSON.parse(raw);
    return { verdict, error: undefined, raw };
  } catch (err) {
    return { verdict: undefined, error: `final result text is not valid JSON: ${err.message}`, raw };
  }
}

// ---------------------------------------------------------------------------------------------
// Child process construction + the spawn seam (tests inject spawnFn; production uses real spawn).
// ---------------------------------------------------------------------------------------------

export function buildChildArgs({ repoAbs, promptText, model }) {
  return ["-p", promptText, "--add-dir", repoAbs, "--output-format", "stream-json", "--model", model];
}

export function spawnCritic({ repoAbs, promptText, model, neutralCwd }, spawnFn = nodeSpawn) {
  const args = buildChildArgs({ repoAbs, promptText, model });
  return spawnFn("claude", args, {
    cwd: neutralCwd,
    // stdin explicitly "ignore"d: the prompt travels as a CLI argument, never via stdin -- this
    // closes the stdin-hang bug class defensively even if a future flag combo tried to read it.
    stdio: ["ignore", "pipe", "pipe"],
    // shell is HARD-CODED false -- never enabled, on any code path; no flag can turn it on.
    // Routing the child command through a shell concatenates unescaped argument content into a
    // command line: an empirically-proven command-injection primitive (a `&` in promptText
    // executed a second command). The array-args form above is the safe mechanism; a Windows
    // .cmd-shim compatibility path, if ever needed, must use array args too -- shell execution
    // must never be re-enabled here (see file header: explicitly out of scope, deferred).
    shell: false,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------------------------
// Watchdog: hard max-runtime cap + idle timer. Auto-kills the child and reports why -- the core
// anti-hang guarantee. Testable directly against a real (harmless) child process.
// ---------------------------------------------------------------------------------------------

/**
 * Attaches a max-runtime timer and an idle timer (reset on any stdout/stderr data) to `child`.
 * Whichever fires first kills the child and calls onTimeout({ reason, elapsedMs, limitSeconds })
 * exactly once. Returns { cleanup, wasKilled, killedReason } -- always call cleanup() once the
 * child has actually exited (naturally or via kill) to clear the timers.
 */
export function attachWatchdog(child, { maxSeconds, idleSeconds }, onTimeout) {
  const startedAt = Date.now();
  let reason = null;
  let idleTimer;

  const fire = (why) => {
    if (reason) return; // already fired once -- never double-kill/double-report
    reason = why;
    child.kill();
    onTimeout({
      reason: why,
      elapsedMs: Date.now() - startedAt,
      limitSeconds: why === "idle" ? idleSeconds : maxSeconds,
    });
  };

  const maxTimer = setTimeout(() => fire("max-runtime"), Math.round(maxSeconds * 1000));

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fire("idle"), Math.round(idleSeconds * 1000));
  };
  resetIdle();

  const onActivity = () => resetIdle();
  child.stdout?.on("data", onActivity);
  child.stderr?.on("data", onActivity);

  const cleanup = () => {
    clearTimeout(maxTimer);
    clearTimeout(idleTimer);
    child.stdout?.off?.("data", onActivity);
    child.stderr?.off?.("data", onActivity);
  };
  child.once("exit", cleanup);
  child.once("error", cleanup);

  return { cleanup, wasKilled: () => reason !== null, killedReason: () => reason };
}

function printWatchdogBanner(info, extra) {
  const lines = [
    "=== CRITIC-BARE WATCHDOG TIMEOUT -- child auto-killed, this is NOT a silent hang ===",
    `reason: ${info.reason} (limit ${info.limitSeconds}s, elapsed ~${(info.elapsedMs / 1000).toFixed(2)}s)`,
    `child exit after kill: code=${extra.code ?? "null"} signal=${extra.signal ?? "null"}`,
    extra.stderrBuf && extra.stderrBuf.trim()
      ? `child stderr so far:\n${extra.stderrBuf}`
      : "child stderr so far: (empty)",
    "ACTION: rerun once (a single timeout can be a transient blip). If the SAME task",
    "times out again, stop and inspect auth/session state manually before raising",
    "--idle-seconds/--max-seconds. See the script header RESTART/RERUN note.",
    "====================================================================================",
  ];
  process.stderr.write(lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

/**
 * Runs one critic invocation end to end and returns an EXIT code (never throws on an expected
 * failure path -- only an actual bug should reject this promise). `deps.spawnFn` is the test seam.
 */
export async function runOnce(opts, deps = {}) {
  const spawnFn = deps.spawnFn ?? nodeSpawn;

  if (!existsSync(opts.neutralCwd)) {
    process.stderr.write(`error: --neutral-cwd path does not exist: ${opts.neutralCwd}\n`);
    return EXIT.GENERIC_ERROR;
  }
  const repoAbs = resolve(opts.repo);
  if (!existsSync(repoAbs)) {
    process.stderr.write(`error: --repo path does not exist: ${repoAbs}\n`);
    return EXIT.GENERIC_ERROR;
  }
  const promptFileAbs = resolve(opts.promptFile);
  if (!existsSync(promptFileAbs)) {
    process.stderr.write(`error: --prompt-file path does not exist: ${promptFileAbs}\n`);
    return EXIT.GENERIC_ERROR;
  }
  let schema;
  try {
    schema = loadSchema(resolve(opts.schema));
  } catch (err) {
    process.stderr.write(`error: could not load --schema file: ${err.message}\n`);
    return EXIT.GENERIC_ERROR;
  }
  const promptText = readFileSync(promptFileAbs, "utf8");

  const child = spawnCritic(
    { repoAbs, promptText, model: opts.model, neutralCwd: opts.neutralCwd },
    spawnFn,
  );

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout?.on("data", (chunk) => {
    stdoutBuf += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk) => {
    stderrBuf += chunk.toString("utf8");
  });

  let timeoutInfo = null;
  const watchdog = attachWatchdog(child, { maxSeconds: opts.maxSeconds, idleSeconds: opts.idleSeconds }, (info) => {
    timeoutInfo = info;
  });

  const exited = await new Promise((res) => {
    child.once("exit", (code, signal) => res({ code, signal }));
    child.once("error", (err) => {
      stderrBuf += `\nspawn error: ${err.message}\n`;
      res({ code: null, signal: null });
    });
  });
  watchdog.cleanup();

  if (timeoutInfo) {
    printWatchdogBanner(timeoutInfo, { ...exited, stderrBuf });
    return EXIT.WATCHDOG_KILLED;
  }
  if (exited.code !== 0) {
    process.stderr.write(`error: critic child exited with code ${exited.code} (signal: ${exited.signal ?? "none"})\n`);
    if (stderrBuf.trim()) process.stderr.write(`--- child stderr ---\n${stderrBuf}\n`);
    return EXIT.CHILD_NONZERO;
  }

  const { events, parseErrors } = parseStreamJsonEvents(stdoutBuf);
  if (parseErrors.length > 0) {
    process.stderr.write(`warning: ${parseErrors.length} stream-json line(s) failed to parse\n`);
  }
  const resultEvent = findResultEvent(events);
  if (!resultEvent) {
    process.stderr.write('error: no "result"-type event found in stream-json output -- cannot extract a verdict.\n');
    return EXIT.NO_RESULT_EVENT;
  }

  const cost = extractCost(resultEvent);
  console.log(`total_cost_usd=${cost ?? "unknown"}`);

  const { verdict, error: verdictError } = extractVerdict(resultEvent);
  if (verdictError) {
    process.stderr.write(`error: ${verdictError}\n`);
    return EXIT.VERDICT_PARSE_ERROR;
  }

  const { valid, errors } = validateAgainstSchema(verdict, schema);
  if (!valid) {
    process.stderr.write("error: verdict failed schema validation:\n");
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    return EXIT.SCHEMA_INVALID;
  }

  console.log(JSON.stringify(verdict, null, 2));
  return EXIT.OK;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n`);
    printUsage(process.stderr);
    process.exitCode = EXIT.GENERIC_ERROR;
    return;
  }

  if (opts.help || argv.length === 0) {
    printUsage(process.stdout);
    process.exitCode = EXIT.OK;
    return;
  }

  if (!opts.repo || !opts.promptFile) {
    process.stderr.write("error: --repo and --prompt-file are both required for a real run.\n\n");
    printUsage(process.stderr);
    process.exitCode = EXIT.GENERIC_ERROR;
    return;
  }

  try {
    process.exitCode = await runOnce(opts);
  } catch (err) {
    process.stderr.write(`error: unexpected failure in critic-bare: ${err.stack ?? err.message}\n`);
    process.exitCode = EXIT.GENERIC_ERROR;
  }
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  main();
}
