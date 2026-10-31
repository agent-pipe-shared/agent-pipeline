#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Read-only generator for the native Goldfish dispatch binding and the six-field briefing
 * skeleton (`binding` subcommand).
 *
 * WHY THIS EXISTS. A first Goldfish dispatch needed four attempts because the ruleset identity
 * and the model id could not be queried and every required field only surfaced as a refusal; a
 * hand-kept dispatcher script then made real mistakes (a hard-coded effort, the binding's
 * opening marker quoted in briefing prose, a stale hard-coded ruleset SHA). Every fact below is
 * therefore READ from the component that owns it and never typed:
 *
 *   candidateCommit / candidateTree  HEAD of --root (read-only git)
 *   effort + model alias             agents/<type>.md through lib/agent-model-registry.mjs
 *   model                            --model-id, checked against the alias's family; with `--runner codex`
 *                                    (default `claude`) against the model the Codex route yields for the
 *                                    role (duty.implement|mechanic|deep of the V3 runner-profile registry)
 *   tool budget                      min(tier cap, maxTurns - 15), the cap read from dispatch-policy
 *   rulesetSha                       the preflight's loaded content identity; when that is
 *                                    unavailable, the installed identity, then the content hash of
 *                                    the loaded plugin root (each fallback is a DBG-RULESET-FALLBACK
 *                                    warning; the host only format-checks the value)
 *   itemDelivery                     the acceptance criterion's own byte span, validated with the
 *                                    host's criterion parser. Two routes: this repository's own
 *                                    Alfred row (`--item` alone, id from the backlog item) or a
 *                                    consumer spec's criterion id (`--criterion`, `AC-<n>` or the
 *                                    compound `AC-E<epic>-<story>-<nn>`, found in the Markdown
 *                                    shapes below, item id `<feature>.<slug>`, no backlog item)
 *
 * PO decision D76: the write scope is admitted only when it is disjoint from every other running dispatch of the
 * checkout (open dispatch record, owner not provably gone); an overlap is DBG-SCOPE-OVERLAP, naming the dispatch,
 * the overlapping paths and the repair. The overlap predicate is the pure `scopesOverlap` of lib/slice-queue.mjs.
 *
 * PO decision D75 (A): a briefing for an item whose earlier attempt the governed queue cancelled as wrong-premise is
 * refused DBG-RECON-REQUIRED unless it carries a recon note (package field `reconNote`, flag `--recon-note`), a
 * non-empty file under scratch/ or specs/; the refusal names the slice, the earlier attempt and the repair. K106: the
 * duty ends once any slice of the same item is delivered (integrated, the lib's only completed-delivery status).
 *
 * The generator calls no model and runs no mutating git command. `binding` writes no file and
 * leaves the judgment fields (goal, context, DoD, forbidden, stop) as template placeholders;
 * `build` (PO decision D78) fills them from a closed package through
 * lib/dispatch-briefing-build.mjs and writes at most the one `--out` file under scratch/.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPointerPrompt } from "../lib/briefing-file-reference.mjs";
import { readSettledPendingPreview } from "../lib/routine-repair.mjs";

const directInvocation = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const cliArguments = process.argv.slice(2);
const cliHelp = directInvocation && cliArguments.some(argument => argument === "--help" || argument === "-h");
const USAGE = `Usage:
  node <plugin-root>/scripts/dispatch-briefing.mjs --help | -h
  node <plugin-root>/scripts/dispatch-briefing.mjs binding --dispatch-id <id> --item <slug> --agent-type <type> --model-id <model> --check <test-path> [--path <path>]...
  node <plugin-root>/scripts/dispatch-briefing.mjs build --package <package.json> [--out scratch/<briefing>.md] [--root <directory>]
  node <plugin-root>/scripts/dispatch-briefing.mjs probe --package <package.json> [--root <directory>]

probe runs every dispatch-time check of that package in dry-run (package fields, binding refusals, plan approval, registry lock),
  writes no file, takes no lock, reserves no slice, and prints ALL failures at once as JSON, each with its repair; exit 0 when ready, 2 otherwise.

binding prints a native dispatch binding and briefing skeleton as JSON; it writes no file.
  Required: --dispatch-id, --item, --agent-type, --model-id, --check.
  Types: goldfish-implementor, goldfish-mechanic, goldfish-deep.
  Optional: --root, repeated --path, --spec, --criterion, --recon-note.
  --runner claude|codex defaults to claude; the selected model must match its role route.
  --effort-escalation MP-05|MP-07 admits an agent definition effort ABOVE its Claude route effort (otherwise a contradiction is refused).
  --check is included in the write scope. Paths are repository-relative.
  --check command:<id> (D195) names a command the project calibration registers under verifyImpact (baseline or an area) instead of a
    .test file; the calibration becomes a dependency of the check and is not writable by the dispatch.
  --criterion selects a consumer Spec criterion (AC-<n> or AC-E<epic>-<story>-<nn>).

build reads one closed pipeline.dispatch-briefing-package.v1 JSON object.
  Required strings: id, item, agentType, modelId, check, title, ac, goal.
  Required non-empty string arrays: paths, context, targeted.
  Optional strings: schema, modelWhy, broader, spec, criterion, budgetRationale, reconNote, runner, effortEscalation (MP-05|MP-07, as the flag).
  Optional string arrays: newFiles (files the dispatch creates: exempt from the must-exist check AND added to the write scope), forbidden, stops, facts (coordinator facts rendered in section 1); optional positive integer: estimatedToolCalls.
  Unknown keys are refused. --package is repository-relative. Only --out writes,
  to a repository-relative scratch/*.md file; without --out the text is returned as JSON.

Help must be the only argument and needs no project setup or model store.
Binding/build still validate their project, criterion, model and scope inputs.
Generation does not authorize a dispatch or attest native execution.
`;

if (cliHelp) {
  if (cliArguments.length === 1) process.stdout.write(USAGE);
  else {
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.dispatch-briefing.refusal.v1", ok: false,
      code: "DBG-HELP-ARGUMENTS", message: "--help or -h must be the only argument; run help separately from binding/build." }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

// Help is available before loading builders whose dependency initialization can
// resolve account paths. Ordinary imports and binding/build retain their owners.
const {
  NATIVE_GOLDFISH_HOST_DIRECTIVE,
  NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA,
  parseNativeGoldfishBriefing,
  validateItemDeliveryBriefing,
} = cliHelp ? {} : await import("../lib/native-goldfish-host-return.mjs");
const { modelBelongsToFamily, parseAgentFrontmatter, resolveAgentModel } = cliHelp ? {} : await import("../lib/agent-model-registry.mjs");
const { functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } = cliHelp ? {} : await import("../lib/model-role-route-source.mjs");
const {
  BRIEFING_BUILD_SCHEMA,
  BriefingPackageRefusal,
  RECON_NOTE_PREFIXES,
  assertPackagePathsExist,
  budgetDecision,
  isReconNotePath,
  packageAdvisories,
  renderGoldfishBriefing,
  resolveBriefingCalibration,
  skeletonToolBudget,
  validateBriefingPackage,
} = cliHelp ? {} : await import("../lib/dispatch-briefing-build.mjs");
const { CRITERION_ID_SOURCE, isCriterionId, parseAcceptedCriticCriterion } = cliHelp ? {} : await import("../lib/critic-accepted-contract.mjs");
const { dispatchBudgetLineForRole, parseDispatchSlice } = cliHelp ? {} : await import("../lib/dispatch-policy.mjs");
const { snapshotPhysicalPluginRoot } = cliHelp ? {} : await import("../lib/public-core-observation.mjs");
const { protectedBaselineRuleFor, resolveProtectedBaseline } = cliHelp ? {} : await import("../lib/protected-baseline.mjs");
const { resolveProjectAuthorityPaths, resolveAuthorityArtifactPath } = cliHelp ? {} : await import("../lib/project-authority.mjs");
const { readConsumerVerifyConfiguration } = cliHelp ? {} : await import("../lib/consumer-verify.mjs");
const { observeGovernedItemIntegrationReadiness, resolveGovernedItemQueue, staleApprovalRepair } = cliHelp ? {} : await import("../lib/native-goldfish-host-state.mjs");
const { observeCurrentPlanApprovalForCalibration } = cliHelp ? {} : await import("./pipeline-state.mjs");
// D76 / K93: "running dispatch" has one reading, shared with guard-dispatch (open record, owner not provably gone, its write scope).
const { resolveGitCommonDir } = cliHelp ? {} : await import("../lib/po-key-directory.mjs");
const { readRunningDispatches } = cliHelp ? {} : await import("../lib/dispatch-record-liveness.mjs");
const { CANCEL_CLASS_HELP, CANCEL_CLASSES, scopesOverlap } = cliHelp ? {} : await import("../lib/slice-queue.mjs");
const { observeContinuityAuthorityDrift, observePipelineStartPreflight } = cliHelp ? {} : await import("./pipeline-start-preflight.mjs");
const { continuityAuthorityDriftRefusalText, continuityAuthorityDriftSources } = cliHelp ? {} : await import("../lib/continuity-authority-drift.mjs");
const sessionAuthorityRegistry = cliHelp ? {} : await import("../lib/session-authority-registry.mjs");
const { inspectSignedDescriptorCustodyRepository } = cliHelp ? {} : await import("../lib/worktree-lifecycle.mjs");
const { loadMapBundle } = cliHelp ? {} : await import("./module-inventory.mjs");
const { owningModules } = cliHelp ? {} : await import("./architecture-boundary-check.mjs");

export const DISPATCH_BINDING_SCHEMA = "pipeline.dispatch-briefing.binding.v1";
export const DISPATCH_REFUSAL_SCHEMA = "pipeline.dispatch-briefing.refusal.v1";

const BLOCK_OPEN = "<!-- pipeline-native-goldfish-host-commit:v3";
const BLOCK_CLOSE = "-->";
const AGENT_TYPES = Object.freeze(["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]);
const ACCEPTED_CRITERION_STATUSES = Object.freeze(["explicit-actual-independent-pass", "no-explicit-criterion"]);
const SINGLE_FLAGS = Object.freeze({
  "--root": "root", "--dispatch-id": "dispatchId", "--item": "item", "--agent-type": "agentType",
  "--model-id": "modelId", "--check": "check", "--spec": "spec", "--criterion": "criterion", "--recon-note": "reconNote",
  "--runner": "runner", "--effort-escalation": "effortEscalation",
});
// K142 (Greenfield finding G1): the runners a binding can be generated for. `claude` is the default and every Claude
// behaviour is unchanged; `codex` checks the model id against the model the Codex route yields for the role, read from
// the V3 runner-profile registry that `model-role-dispatch-select.mjs --runner codex` also reads (this generator never
// calls that selector itself: with the model family active it prepares an invocation, and the generator is read-only).
// Antigravity is deliberately not admitted here (its behaviour is unchanged: an unknown runner is refused with a repair).
const RUNNERS = Object.freeze(["claude", "codex"]);
const DUTY_ROUTE_OF_AGENT = Object.freeze({
  "goldfish-implementor": "duty.implement", "goldfish-mechanic": "duty.mechanic", "goldfish-deep": "duty.deep",
});
// The environment keys through which `resolveActiveRunner` (pipeline-start-preflight.mjs) learns the runner of a process.
const RUNNER_SIGNAL_KEYS = Object.freeze(["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT"]);
const REPEATED_FLAGS = Object.freeze({ "--path": "paths" });
const REQUIRED_FLAGS = Object.freeze(["--dispatch-id", "--item", "--agent-type", "--model-id", "--check"]);
const READ_ONLY_GIT = new Set(["rev-parse", "status"]);
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const SHA = /^[a-f0-9]{64}$/u;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_CRITERION_BYTES = 4096;
// D195: the additive check spelling `command:<id>`; <id> is a command id registered in the project calibration (consumer-verify VERIFY_ID).
const COMMAND_CHECK_PREFIX = "command:";
const VERIFY_COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CRITERION_ID_FORMS = "AC-<n> or AC-E<epic>-<story>-<nn>";
// The bold bullet item (`- **<id>:** text`, marker `-`, `+` or `*`, at column 0) and the indented lines that continue it;
// both mirror the host parser's `markdown-acceptance-bullet-item.v1` rendering exactly.
const BOLD_BULLET = new RegExp(`^[-+*] \\*\\*(${CRITERION_ID_SOURCE}):\\*\\* (\\S.*)$`, "u");
const BULLET_CONTINUATION = /^(?: {2,}|\t)\S/u;
const CRITERION_SHAPES = "a Markdown table row whose first cell is exactly the id (criterion = the second cell), "
  + "a bold bullet item `- **<id>:** text` with its indented sub-bullets or wrapped lines (criterion = the text after `:** ` through the last indented line), "
  + "a list item or paragraph beginning `AC-<n>:`, `**AC-<n>**` or `AC-<n> —` (criterion = the rest of that line or list item), "
  + "or a heading that is exactly the id (criterion = the following paragraph)";
const DEFAULT_AGENTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "agents");

/** A typed, caller-visible refusal; the code is always a DBG-* identifier. */
export class BriefingRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BriefingRefusal";
    this.code = code;
  }
}
const refuse = (code, message) => { throw new BriefingRefusal(code, message); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Mirrors the host parser's path rule (that function is module-private there). */
function validRepoPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !/[\\\0\r\n]/u.test(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part !== ".git");
}

/** The Codex task route of a duty (read-only registry projection), or null when the registry yields none. */
function defaultCodexRoute(taskRoute) {
  try {
    const scoped = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "codex");
    return scoped.ok ? scoped.taskRoutes.find((entry) => entry.taskRoute === taskRoute) ?? null : null;
  } catch { return null; }
}

/** The Claude task route of a duty (read-only registry projection), or null when the registry yields none. */
function defaultClaudeRoute(taskRoute) {
  try {
    const scoped = functionalTaskRoutesForRunner(registeredFunctionalTaskRoutes(), "claude");
    return scoped.ok ? scoped.taskRoutes.find((entry) => entry.taskRoute === taskRoute) ?? null : null;
  } catch { return null; }
}

const EFFORT_RANK = Object.freeze({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 });
const EFFORT_ESCALATION_ACTS = Object.freeze(["MP-05", "MP-07"]);

/**
 * What the preflight observation receives. Claude: exactly `{ cwd }`, as before this change. Codex: the same call with an
 * environment whose runner signals say Codex (the preflight resolves its runner from the environment of the process, so a
 * Claude or Antigravity marker inherited from the calling shell would otherwise make it observe the wrong runner).
 */
function preflightInputFor(runner, root) {
  if (runner !== "codex") return { cwd: root };
  const env = { ...process.env };
  for (const key of RUNNER_SIGNAL_KEYS) delete env[key];
  return { cwd: root, env };
}

/** Strict flag parse: unknown, repeated and valueless flags are refusals, never ignored. */
export function parseBindingArgv(argv) {
  if (!Array.isArray(argv) || argv[0] !== "binding") {
    refuse("DBG-SUBCOMMAND", `the subcommands are "binding", "build" and "probe"; got ${JSON.stringify(argv?.[0] ?? null)}`);
  }
  const values = { paths: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("--")) refuse("DBG-ARGUMENT-UNEXPECTED", `unexpected argument ${JSON.stringify(token)}; every input is a --flag`);
    const equals = token.indexOf("=");
    const flag = equals === -1 ? token : token.slice(0, equals);
    const single = Object.hasOwn(SINGLE_FLAGS, flag);
    if (!single && !Object.hasOwn(REPEATED_FLAGS, flag)) refuse("DBG-FLAG-UNKNOWN", `unknown flag ${flag}`);
    let value;
    if (equals !== -1) value = token.slice(equals + 1);
    else {
      value = argv[index + 1];
      if (typeof value !== "string" || value.startsWith("--")) refuse("DBG-FLAG-VALUE", `flag ${flag} needs a value`);
      index++;
    }
    if (value === "") refuse("DBG-FLAG-VALUE", `flag ${flag} needs a non-empty value`);
    if (single) {
      const key = SINGLE_FLAGS[flag];
      if (Object.hasOwn(values, key)) refuse("DBG-FLAG-REPEATED", `flag ${flag} may be given once`);
      values[key] = value;
    } else values.paths.push(value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!Object.hasOwn(values, SINGLE_FLAGS[flag])) refuse("DBG-FLAG-MISSING", `required flag ${flag} is missing`);
  }
  return values;
}

function defaultGit(root, args) {
  if (!READ_ONLY_GIT.has(args[0])) throw new Error(`refusing non-read-only git subcommand ${args[0]}`);
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
}

/** The governed queue row of a slice id, or null outside an approved item course (read-only). */
function defaultQueueRow(root, sliceId) {
  try {
    const governed = resolveGovernedItemQueue({ root });
    return governed.status === "required" ? governed.normalized.slices.find((row) => row.id === sliceId) ?? null : null;
  } catch { return null; }
}

const defaultRunningDispatches = (root) => readRunningDispatches(root, { queueRowFn: defaultQueueRow, parseBriefing: parseNativeGoldfishBriefing });

const STOP_FAILURE_SCHEMA = "pipeline.native-goldfish-host-stop-failure.v1";
// D180b: the diagnostic lives outside the inventoried native Goldfish namespace; the legacy directory is still read.
const STOP_FAILURE_DIR = ["agent-pipeline", "run", "native-goldfish-host-diagnostics"];
const STOP_FAILURE_LEGACY_DIR = ["agent-pipeline", "run", "native-goldfish-host-commit"];
const STOP_FAILURE_NAME = /^stop-failure-[A-Za-z0-9._-]+\.json$/u;

/**
 * PF-61: the persisted stop-failure diagnostics of background Goldfish whose host commit failed at SubagentStop (read-only).
 * At most 20 regular, non-symlink files, each read bounded to 64 KiB; only objects of the stop-failure schema with string
 * dispatchId and code are kept. Any fault yields an empty list. Never deletes, moves or rewrites a file.
 */
function defaultStopFailures(root) {
  try {
    const common = resolveGitCommonDir(root);
    if (typeof common !== "string") return [];
    const candidates = [];
    const seen = new Set();
    for (const parts of [STOP_FAILURE_DIR, STOP_FAILURE_LEGACY_DIR]) {
      try {
        const directory = resolve(common, ...parts);
        for (const name of readdirSync(directory).filter((entry) => STOP_FAILURE_NAME.test(entry)).sort()) {
          if (seen.has(name)) continue;
          seen.add(name);
          candidates.push({ name, dir: directory, rel: parts.join("/") });
        }
      } catch { /* an absent directory holds no diagnostic */ }
    }
    const kept = [];
    for (const { name, dir, rel } of candidates.slice(0, 20)) {
      try {
        const file = resolve(dir, name);
        const info = lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink()) continue;
        const fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        let text;
        try {
          const buffer = Buffer.alloc(65536 + 1);
          const length = readSync(fd, buffer, 0, buffer.length, 0);
          if (length > 65536) continue;
          text = buffer.subarray(0, length).toString("utf8");
        } finally { closeSync(fd); }
        const value = JSON.parse(text);
        if (value && typeof value === "object" && value.schema === STOP_FAILURE_SCHEMA && typeof value.dispatchId === "string" && typeof value.code === "string") kept.push({ ...value, file: name, directory: rel });
      } catch { /* an unreadable entry is no diagnostic */ }
    }
    return kept;
  } catch { return []; }
}

/** Every slice row of the governed queue (read-only); an empty list outside an approved item course or when it cannot be read. */
function defaultQueueRows(root) {
  try {
    const governed = resolveGovernedItemQueue({ root });
    return governed.status === "required" ? governed.normalized.slices : [];
  } catch { return []; }
}

/**
 * D196 (R1): slices of the governed item course that were started and have not finished. The queue stores no started state
 * (SLICE_STATES is ready|hold-po|blocked-external|deferred|cancelled); a started slice is a native pending state without a terminal
 * record (phase "active"), which is also what a budget checkpoint leaves (the reservation stays live). A fault yields none (warn only).
 * Read straight from the pending files: the full item delivery inspection verifies every historical member and took minutes on a
 * repository with a long dispatch history, which hung every build. Only a slice the governed queue still holds as ready counts:
 * an old dispatch whose pending state was never settled but whose slice was cancelled or never queued is no owner.
 */
export function defaultStartedOwners(root, queueRows = defaultQueueRows(root)) {
  try {
    const live = new Set(queueRows.filter((entry) => entry?.state === "ready").map((entry) => entry.id));
    if (live.size === 0) return [];
    // A slice with a commit carrying its Dispatch trailer is delivered (one git call; the full integration read takes tens of seconds).
    const trailers = execFileSync("git", ["-C", root, "log", "--format=%(trailers:key=Dispatch,valueonly,separator=%x0a)"], { encoding: "utf8", maxBuffer: 1 << 26 });
    for (const line of trailers.split("\n")) { const id = /^(\S+) \(goldfish\)$/u.exec(line.trim())?.[1]; if (id) live.delete(id); }
    if (live.size === 0) return [];
    const commonDir = resolve(root, execFileSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim());
    const dir = resolve(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
    if (!existsSync(dir)) return [];
    const names = readdirSync(dir);
    const started = [];
    for (const name of names.filter((row) => /^pending-(claude|codex)-[a-f0-9]{64}\.json$/u.test(row))) {
      try {
        const bytes = readFileSync(resolve(dir, name));
        if (names.includes(`authority-terminal-${createHash("sha256").update(bytes).digest("hex")}.json`)) continue;
        const value = JSON.parse(bytes.toString("utf8"));
        if (typeof value?.delivery?.itemId === "string" && live.has(value?.binding?.dispatchId)) started.push({ dispatchId: value.binding.dispatchId, itemId: value.delivery.itemId });
      } catch { /* an unreadable pending file names no owner */ }
    }
    return started;
  } catch { return []; }
}

/**
 * K106: ids of the governed queue slices the lib treats as a completed delivery. The queue stores no delivered state
 * (SLICE_STATES is ready|hold-po|blocked-external|deferred|cancelled); readyAndLive derives status "done" from the
 * integrated ids this observation returns (native integration record or orchestrator commit evidence). A refused
 * observation, a fault or a repository without an item course yields no delivery (the safe direction: the duty stays).
 */
function defaultIntegratedSliceIds(root) {
  try {
    const observed = observeGovernedItemIntegrationReadiness({ root });
    return observed.status === "observed" ? [...observed.integrated] : [];
  } catch { return []; }
}

/** K106: is any row of this item, other than the wrong-premise attempts themselves, an integrated (delivered) slice? Never throws. */
function hasDeliveredSliceOfItem(rows, itemId, wrongPremiseIds, readIntegrated, root) {
  let ids;
  try { ids = readIntegrated(root); } catch { return false; }
  if (!Array.isArray(ids) && !(ids instanceof Set)) return false;
  const delivered = new Set(ids);
  return rows.some((entry) => entry?.delivery?.itemId === itemId && delivered.has(entry.id) && !wrongPremiseIds.includes(entry.id));
}

/** K12: the session-authority registry lock as a reader sees it (never taken), or null when it cannot be observed. */
function defaultRegistryLock(root) {
  try { return sessionAuthorityRegistry.inspectSessionAuthorityLock({ repository: inspectSignedDescriptorCustodyRepository(root) }); } catch { return null; }
}
// The registry's own bound when it exports one (K12); a short fixed default otherwise, so this script never needs the
// registry module and the bound to be changed in the same commit.
const REGISTRY_LOCK_WAIT_MS = Number.isSafeInteger(sessionAuthorityRegistry.SESSION_AUTHORITY_LOCK_WAIT_MS) ? sessionAuthorityRegistry.SESSION_AUTHORITY_LOCK_WAIT_MS : 1500;
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function defaultSpecPathFromState(root) {
  try {
    const paths = resolveProjectAuthorityPaths({ rootDir: root });
    if (paths.status !== "ready" || typeof paths.state !== "string") return null;
    const specPath = JSON.parse(readFileSync(resolve(root, paths.state), "utf8"))?.planSubmission?.specPath;
    return typeof specPath === "string" ? specPath : null;
  } catch { return null; }
}

/** A regular, non-symlinked file strictly inside the (already real) root, or null. */
function readRepoFile(root, rel) {
  try {
    const absolute = resolve(root, rel);
    const inside = relative(root, absolute);
    if (inside === "" || inside.startsWith("..") || realpathSync(absolute) !== absolute) return null;
    const info = lstatSync(absolute);
    return info.isSymbolicLink() || !info.isFile() ? null : readFileSync(absolute);
  } catch { return null; }
}

/** Find the 3-column acceptance-table rows whose Criterion cell names the item; byte spans are exact. */
function findCriterionRows(sourceBytes, needle) {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  const rows = [];
  let byteOffset = 0;
  for (const raw of source.split(/(?<=\n)/u)) {
    const text = raw.replace(/\r?\n$/u, "");
    const lineOffset = byteOffset;
    byteOffset += Buffer.byteLength(raw);
    if (!text.includes(needle)) continue;
    const bars = [];
    for (let index = 0; index < text.length; index++) if (text[index] === "|") bars.push(index);
    if (bars.length !== 4 || text.slice(0, bars[0]).trim() !== "" || text.slice(bars[3] + 1).trim() !== "") continue;
    const cells = [0, 1, 2].map((column) => {
      const cell = text.slice(bars[column] + 1, bars[column + 1]);
      const start = bars[column] + 1 + (cell.length - cell.trimStart().length);
      const value = cell.trim();
      return {
        value,
        startByte: lineOffset + Buffer.byteLength(text.slice(0, start)),
        endByte: lineOffset + Buffer.byteLength(text.slice(0, start + value.length)),
      };
    });
    if (cells[1].value.includes(needle)) rows.push(cells);
  }
  return rows;
}

/** Cells of one Markdown table row (leading bar required, escaped bars kept); `from`/`to` index the line. */
function tableCells(text) {
  const bars = [];
  for (let index = 0; index < text.length; index++) if (text[index] === "|" && text[index - 1] !== "\\") bars.push(index);
  if (bars.length === 0 || text.slice(0, bars[0]).trim() !== "") return [];
  const cells = [];
  for (let column = 0; column < bars.length; column++) {
    const start = bars[column] + 1;
    const end = column + 1 < bars.length ? bars[column + 1] : text.length;
    const segment = text.slice(start, end);
    const value = segment.trim();
    if (column + 1 === bars.length && value === "") break;
    const from = start + (segment.length - segment.trimStart().length);
    cells.push({ value, from, to: from + value.length });
  }
  return cells;
}

/**
 * Every place a consumer spec states criterion `id`, in the supported Markdown shapes, with the
 * exact byte span of the criterion text. Fenced code blocks are skipped. A consumer's ordinary
 * criterion id needs no Alfred wording and no backlog item. An id is only ever resolved by exact
 * equality (a longer id that merely starts with it, a heading that merely mentions it and a table
 * cell that merely references it are not occurrences); the host parser still has the last word.
 */
function findCriterionOccurrences(sourceBytes, id) {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  const lines = [];
  let byteOffset = 0;
  for (const raw of source.split(/(?<=\n)/u)) {
    const text = raw.replace(/\r?\n$/u, "");
    lines.push({ text, offset: byteOffset });
    byteOffset += Buffer.byteLength(raw);
  }
  const span = (startLine, from, endLine, to) => ({
    startByte: startLine.offset + Buffer.byteLength(startLine.text.slice(0, from)),
    endByte: endLine.offset + Buffer.byteLength(endLine.text.slice(0, to)),
  });
  const leading = new RegExp(`^(?<lead>[ \\t]*(?:>[ \\t]*)*(?<marker>(?:[-*+]|[0-9]{1,3}[.)])[ \\t]+)?)(?<open>\\*\\*|__)?${id}(?![0-9A-Za-z_])`, "u");
  const listMarker = /^\s*(?:[-*+]|[0-9]{1,3}[.)])[ \t]/u;
  const found = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenced = /^\s*(`{3,}|~{3,})/u.exec(line.text);
    if (fenced) { fence = fence === null ? fenced[1][0] : fence === fenced[1][0] ? null : fence; continue; }
    if (fence !== null) continue;
    if (line.text.trimStart().startsWith("|")) {
      const cells = tableCells(line.text);
      // A two-column acceptance table (`Nr. | Kriterium`) numbers its rows `n` or `R-n`; the host parser maps both to `AC-n`
      // (scanAcceptedCriterionRows, lib/critic-accepted-contract.mjs), so the generator must find the same row.
      const twoColumnNumber = cells.length === 2 ? /^(?:R-)?([1-9][0-9]*)$/u.exec(cells[0].value)?.[1] : undefined;
      const rowIsId = cells.length >= 2 && (cells[0].value === id || (twoColumnNumber !== undefined && `AC-${twoColumnNumber}` === id));
      if (rowIsId && cells[1].value !== "") {
        found.push({ shape: "table-row", ...span(line, cells[1].from, line, cells[1].to) });
      }
      continue;
    }
    const heading = /^ {0,3}#{1,6}[ \t]+(.*)$/u.exec(line.text);
    if (heading) {
      // The host parser admits a heading only when it IS the id; a heading that merely mentions it is a reference.
      if (heading[1].replace(/(?:\s+#+)?\s*$/u, "") !== id) continue;
      let first = index + 1;
      while (first < lines.length && lines[first].text.trim() === "") first++;
      if (first >= lines.length || /^\s*(?:#{1,6}[ \t]|`{3}|~{3}|\|)/u.test(lines[first].text)) continue;
      let last = first;
      while (last + 1 < lines.length && lines[last + 1].text.trim() !== "" && !/^\s*(?:#{1,6}[ \t]|`{3}|~{3})/u.test(lines[last + 1].text)) last++;
      const from = lines[first].text.length - lines[first].text.trimStart().length;
      found.push({ shape: "heading", ...span(lines[first], from, lines[last], lines[last].text.trimEnd().length) });
      continue;
    }
    const bold = BOLD_BULLET.exec(line.text);
    if (bold) {
      // A bold bullet item owns the indented lines after it (sub-bullets, wrapped text): they are its scope, never separate statements.
      let last = index;
      while (last + 1 < lines.length && BULLET_CONTINUATION.test(lines[last + 1].text)) last++;
      if (bold[1] === id) found.push({ shape: "bold bullet item", ...span(line, line.text.length - bold[2].length, lines[last], lines[last].text.trimEnd().length) });
      index = last;
      continue;
    }
    const lead = leading.exec(line.text);
    if (!lead) continue;
    let consumed = lead[0].length;
    const take = (pattern) => {
      const matched = pattern.exec(line.text.slice(consumed));
      if (matched) consumed += matched[0].length;
      return matched !== null;
    };
    let delimited = take(/^:/u);
    if (lead.groups.open && take(lead.groups.open === "**" ? /^\*\*/u : /^__/u)) delimited = true;
    if (take(/^[ \t]*(?:[:—–]|-(?=[ \t]))/u)) delimited = true;
    if (!delimited) continue;
    const rest = line.text.slice(consumed);
    const from = consumed + (rest.length - rest.trimStart().length);
    const to = line.text.trimEnd().length;
    if (to <= from) continue;
    let last = index;
    if (lead.groups.marker) {
      while (last + 1 < lines.length && /^(?: {2,}|\t)\S/u.test(lines[last + 1].text) && !listMarker.test(lines[last + 1].text)) last++;
    }
    found.push({ shape: "line", ...span(line, from, lines[last], lines[last].text.trimEnd().length) });
  }
  return found;
}

/** The host's own parser must accept the criterion text exactly as the existing Alfred route requires. */
function requireAcceptedCriterion(specBytes, specPath, locator, describe) {
  const criterion = parseAcceptedCriticCriterion({
    sourceBytes: new Uint8Array(specBytes),
    locator,
    packageContext: { featureId: specPath.split("/")[1], sourceBindings: [{ path: specPath, sha256: locator.sourceSha256, role: "spec" }] },
  });
  if (!ACCEPTED_CRITERION_STATUSES.includes(criterion.status)) {
    refuse("DBG-CRITERION-REFUSED", `the host criterion parser reports ${criterion.status} (${criterion.code}) for ${describe}`);
  }
}

function toolBudgetFor(agentType, maxTurns) {
  const cap = /≤(\d+) tool uses/u.exec(dispatchBudgetLineForRole(agentType) ?? "");
  if (!cap) refuse("DBG-BUDGET-TIER", `no tool-budget tier cap is defined for ${agentType}`);
  const tierCap = Number(cap[1]);
  const budget = Math.min(tierCap, maxTurns - 15);
  if (!Number.isSafeInteger(budget) || budget < 1) refuse("DBG-BUDGET-TIER", `${agentType} maxTurns ${maxTurns} leaves no tool budget after the 15-call reserve`);
  return { tierCap, budget, checkpoint: Math.floor(budget * 0.8) };
}

/** Invariants the host relies on that no flag combination should be able to break. */
export function assertBindingInvariants(binding) {
  const checks = binding?.itemDelivery?.checks;
  if (!Array.isArray(checks) || checks.length !== 1 || !Array.isArray(binding.allowedPaths)) refuse("DBG-BINDING-INVALID", "the binding must carry exactly one item-delivery check");
  const [check] = checks;
  if (check.command !== undefined) {
    // D195: the calibration the command is registered in is a dependency, never a write path (the command stays human-approved).
    if (binding.allowedPaths.includes(check.path)) refuse("DBG-CHECK-COMMAND-PATH-WRITABLE", `the calibration ${check.path} that registers command ${check.command} must not be among the allowed paths`);
    if (!check.dependencies.includes(check.path)) refuse("DBG-BINDING-INVALID", `the calibration ${check.path} must be a dependency of command check ${check.command}`);
  } else if (!binding.allowedPaths.includes(check.path) || !check.dependencies.includes(check.path)) {
    refuse("DBG-CHECK-NOT-IN-PATHS", `check ${check.path} is not among the allowed paths`);
  }
  if (!binding.allowedPaths.every((path) => check.dependencies.includes(path))) refuse("DBG-BINDING-INVALID", "every allowed path must be a dependency of the check");
  const delivery = validateItemDeliveryBriefing(binding.itemDelivery);
  if (!delivery.ok) refuse("DBG-BINDING-INVALID", `item delivery is invalid: ${delivery.code}`);
}

/**
 * FB3-PF-54 (D56 (1)): the architecture map's facts for the touched paths, one line per owning
 * module, so a briefing names the boundary instead of leaving it to whoever writes the context.
 * Prose only: no parser reads these lines, and no map is never a refusal.
 */
export function architectureContextLines(root, paths, loadMap = loadMapBundle) {
  if (!existsSync(resolve(root, "architecture/map"))) return ["- Architecture: this project has no architecture map (`architecture/map`)."];
  const bundle = loadMap(root);
  if (!bundle.ok) return [`- Architecture: the map does not load (${bundle.errors.length} error(s)); \`architecture-boundary-check.mjs --root <root>\` names them.`];
  const byModule = new Map();
  const unowned = [];
  for (const path of paths) {
    const owners = owningModules(path, bundle.modules);
    if (owners.length !== 1) { unowned.push(path); continue; }
    if (!byModule.has(owners[0].id)) byModule.set(owners[0].id, { module: owners[0], paths: [] });
    byModule.get(owners[0].id).paths.push(path);
  }
  const lines = [...byModule.values()].sort((a, b) => a.module.id.localeCompare(b.module.id)).map(({ module, paths: owned }) => {
    const deps = module.allowedDependencies.length ? module.allowedDependencies.map((id) => `\`${id}\``).join(", ") : "none";
    const contracts = module.publicContracts.length ? `; public contracts ${module.publicContracts.slice(0, 8).map((p) => `\`${p}\``).join(", ")}${module.publicContracts.length > 8 ? ` and ${module.publicContracts.length - 8} more` : ""}` : "";
    return `- Architecture, module \`${module.id}\` (${owned.map((p) => `\`${p}\``).join(", ")}): ${module.responsibility.trim().replace(/\.?$/u, ".")} Imports only within the module or from: ${deps}${contracts}.`;
  });
  if (unowned.length) lines.push(`- Architecture: no single module owns ${unowned.map((p) => `\`${p}\``).join(", ")}; the boundary check reports such a source file until the map assigns it.`);
  return lines;
}

/** Build the binding, its block and the skeleton from parsed options. Throws BriefingRefusal. */
export function generateDispatchBinding(options, deps = {}) {
  const git = deps.git ?? defaultGit;
  const observePreflight = deps.observePreflight ?? observePipelineStartPreflight;
  const resolveBaseline = deps.resolveBaseline ?? resolveProtectedBaseline;
  const defaultSpecPath = deps.defaultSpecPath ?? defaultSpecPathFromState;
  const snapshotPluginRoot = deps.snapshotPluginRoot ?? snapshotPhysicalPluginRoot;
  const agentsDir = deps.agentsDir ?? DEFAULT_AGENTS_DIR;
  const warnings = [];
  // The readiness probe passes a collector: a refusal whose following steps need no value it would have produced is then recorded
  // and the generator goes on. Without a collector (every other caller) this IS refuse, so the refusals are unchanged.
  const soft = deps.softRefusals ? (code, message) => { deps.softRefusals.push({ code, message }); } : refuse;

  const { dispatchId, item, agentType, modelId, check } = options;
  const runner = options.runner ?? "claude";
  const effortEscalation = options.effortEscalation;
  if (!RUNNERS.includes(runner)) refuse("DBG-RUNNER-UNKNOWN", `unknown runner ${JSON.stringify(runner)}; repair: pass --runner ${RUNNERS.join(" or ")} (default ${RUNNERS[0]}), or omit the flag for a Claude dispatch`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(dispatchId)) refuse("DBG-DISPATCH-ID", `dispatch id ${JSON.stringify(dispatchId)} must match [A-Za-z0-9][A-Za-z0-9._:-]{0,119}`);
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(item)) refuse("DBG-ITEM-SLUG", `item slug ${JSON.stringify(item)} must be lowercase letters, digits and hyphens`);
  if (options.criterion !== undefined && !isCriterionId(options.criterion)) refuse("DBG-CRITERION-ID", `criterion ${JSON.stringify(options.criterion)} must be ${CRITERION_ID_FORMS}`);
  if (!AGENT_TYPES.includes(agentType)) refuse("DBG-AGENT-TYPE-UNKNOWN", `unknown agent type ${JSON.stringify(agentType)}; expected one of ${AGENT_TYPES.join(", ")}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(modelId)) refuse("DBG-MODEL-ID", `model id ${JSON.stringify(modelId)} is not a model identifier`);
  const commandId = check.startsWith(COMMAND_CHECK_PREFIX) ? check.slice(COMMAND_CHECK_PREFIX.length) : null;
  for (const path of [...(commandId === null ? [check] : []), ...options.paths]) {
    if (!validRepoPath(path)) refuse("DBG-PATH-INVALID", `path ${JSON.stringify(path)} must be repository-relative without .., ., .git or backslash segments`);
  }
  if (options.reconNote !== undefined && !isReconNotePath(options.reconNote)) {
    refuse("DBG-PATH-INVALID", `recon note ${JSON.stringify(options.reconNote)} must be a repository-relative file path under ${RECON_NOTE_PREFIXES.join(" or ")} without .., ., .git or backslash segments`);
  }
  if (commandId === null && !/\.test\.(?:mjs|cjs|js)$/u.test(check)) soft("DBG-CHECK-NOT-TEST", `check ${check} must be a .test.mjs, .test.cjs or .test.js file (or command:<id> of a command the project calibration registers under verifyImpact)`);
  if (commandId !== null && !VERIFY_COMMAND_ID.test(commandId)) refuse("DBG-CHECK-COMMAND-UNKNOWN", `check ${check} does not carry a command id of the shape ${VERIFY_COMMAND_ID}`);
  const allowedPaths = [...new Set([...(commandId === null ? [check] : []), ...options.paths])].sort();

  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }

  // D195: a command check is bound to the calibration file that registers it; the id must be registered at this commit.
  let commandCheckPath = null;
  if (commandId !== null) {
    commandCheckPath = (deps.calibrationRelPath ?? ((rootDir) => resolveAuthorityArtifactPath("calibration", { rootDir }).relPath))(root);
    let registered = null;
    let why = "";
    try {
      const configuration = (deps.readConsumerVerify ?? readConsumerVerifyConfiguration)(root);
      registered = [...configuration.baseline, ...configuration.areas.flatMap((area) => area.commands)].map((entry) => entry.id);
    } catch (error) { why = ` (${String(error?.message ?? error).slice(0, 160)})`; }
    if (registered === null || !registered.includes(commandId)) {
      soft("DBG-CHECK-COMMAND-UNKNOWN", `command ${commandId} is not registered in the project calibration ${commandCheckPath}${why}. repair: register it as {"id": "${commandId}", "command": "<the real verify command>"} under verifyImpact.baseline in ${commandCheckPath} (schema pipeline.project-verify-impact.v1), commit that calibration so the candidate commit of this briefing carries it, and run this command again`);
    }
    if (allowedPaths.includes(commandCheckPath)) soft("DBG-CHECK-COMMAND-PATH-WRITABLE", `the calibration ${commandCheckPath} that registers command ${commandId} must not be a --path of the same dispatch (the command stays human-approved)`);
  }

  // Original acceptance: the criterion, its byte span, and (Alfred route only) the backlog item it names.
  const specPath = options.spec ?? defaultSpecPath(root);
  if (typeof specPath !== "string" || specPath === "") refuse("DBG-SPEC-UNRESOLVED", "no --spec was given and the project authority state names no plan spec; pass --spec");
  if (!/^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(specPath) || specPath.split("/").some((part) => part === "." || part === ".." || part === "")) {
    refuse("DBG-SPEC-PATH", `spec path ${JSON.stringify(specPath)} must be specs/<feature>/<file>`);
  }
  const specBytes = readRepoFile(root, specPath);
  if (!specBytes || specBytes.byteLength < 1) refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not a readable regular file under --root`);
  let locator;
  let itemId;
  if (options.criterion !== undefined) {
    // Generic route: a consumer's own `AC-<n>`; the item id is derived, no backlog item is involved.
    let occurrences;
    try { occurrences = findCriterionOccurrences(specBytes, options.criterion); } catch { refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not valid UTF-8`); }
    if (occurrences.length === 0) refuse("DBG-CRITERION-MISSING", `${options.criterion} is not stated in ${specPath} in a supported shape: ${CRITERION_SHAPES}`);
    if (occurrences.length > 1) refuse("DBG-CRITERION-AMBIGUOUS", `${occurrences.length} places in ${specPath} state ${options.criterion} (${occurrences.map((entry) => entry.shape).join(", ")}); exactly one is required`);
    const [only] = occurrences;
    if (only.endByte - only.startByte > MAX_CRITERION_BYTES) refuse("DBG-CRITERION-TOO-LONG", `${options.criterion} is ${only.endByte - only.startByte} bytes in ${specPath}; the locator span is limited to ${MAX_CRITERION_BYTES}`);
    locator = {
      schema: "pipeline.critic-criterion-locator.v1",
      sourcePath: specPath,
      sourceSha256: sha256(specBytes),
      criterionId: options.criterion,
      startByte: only.startByte,
      endByte: only.endByte,
      excerptSha256: sha256(specBytes.subarray(only.startByte, only.endByte)),
    };
    requireAcceptedCriterion(specBytes, specPath, locator, `${options.criterion} of item ${item}`);
    itemId = `${specPath.split("/")[1]}.${item}`;
    if (!ITEM_ID.test(itemId)) refuse("DBG-ITEM-ID", `derived item id ${JSON.stringify(itemId)} does not match ${ITEM_ID}`);
  } else {
    const needle = `Original Alfred item ${item} is delivered`;
    let rows;
    try { rows = findCriterionRows(specBytes, needle); } catch { refuse("DBG-SPEC-UNREADABLE", `spec ${specPath} is not valid UTF-8`); }
    if (rows.length === 0) refuse("DBG-AC-ROW-MISSING", `no 3-column acceptance row in ${specPath} names "${needle}" (item ${item}); repair: if this is a fresh fix-wave attempt covered by an existing accepted criterion, bind that actual criterion with --criterion AC-<n> and keep its approved Spec text unchanged; otherwise obtain the missing acceptance authority through the normal design route`);
    if (rows.length > 1) refuse("DBG-AC-ROW-AMBIGUOUS", `${rows.length} acceptance rows in ${specPath} name "${needle}" (item ${item})`);
    const [idCell, criterionCell, evidenceCell] = rows[0];
    if (!isCriterionId(idCell.value)) refuse("DBG-AC-ROW-ID", `the row naming item ${item} has id cell ${JSON.stringify(idCell.value)}, not ${CRITERION_ID_FORMS}`);
    locator = {
      schema: "pipeline.critic-criterion-locator.v1",
      sourcePath: specPath,
      sourceSha256: sha256(specBytes),
      criterionId: idCell.value,
      startByte: criterionCell.startByte,
      endByte: criterionCell.endByte,
      excerptSha256: sha256(specBytes.subarray(criterionCell.startByte, criterionCell.endByte)),
    };
    requireAcceptedCriterion(specBytes, specPath, locator, `${idCell.value} of item ${item}`);
    const itemPath = /backlog\/items\/[A-Za-z0-9][A-Za-z0-9._-]*\.md/u.exec(evidenceCell.value)?.[0];
    if (!itemPath) refuse("DBG-ITEM-EVIDENCE-MISSING", `the Evidence cell of ${idCell.value} names no backlog/items/*.md file (item ${item}); repair: put the item's backlog/items/<file>.md path in that row's Evidence cell, or file the item first (backlog/README.md) and name it there`);
    const itemBytes = readRepoFile(root, itemPath);
    if (!itemBytes) refuse("DBG-ITEM-UNREADABLE", `backlog item ${itemPath} named by ${idCell.value} is not a readable regular file`);
    const declaredId = parseAgentFrontmatter(itemBytes.toString("utf8")).id;
    itemId = declaredId;
    if (typeof declaredId !== "string" || !ITEM_ID.test(declaredId)) {
      itemId = `pipeline.${item}`;
      warnings.push({ code: "DBG-ITEM-ID-FALLBACK", path: itemPath, message: `${itemPath} has no usable id: frontmatter; fell back to ${itemId}` });
    }
  }

  // PF-47: a dispatch id that already names a governed queue row must match it; the admission would refuse
  // the drift later under another name, so the binding refuses now and names the row's exact scope.
  const row = (deps.queueRow ?? defaultQueueRow)(root, dispatchId);
  if (row && row.delivery?.status !== "unbound-legacy") {
    if (row.state !== "ready") soft("DBG-QUEUE-ROW-NOT-READY", `slice ${dispatchId} is ${row.state} in the governed queue and cannot be rebound; choose a new --dispatch-id`);
    if (row.delivery?.itemId !== itemId) soft("DBG-QUEUE-ROW-DRIFT", `slice ${dispatchId} belongs to item ${row.delivery?.itemId} in the governed queue, not ${itemId}; choose a new --dispatch-id`);
    const scope = [...(row.writeScope ?? [])].sort();
    if (JSON.stringify(scope) !== JSON.stringify(allowedPaths)) {
      const checks = scope.filter((path) => /\.test\.(?:mjs|cjs|js)$/u.test(path));
      soft("DBG-QUEUE-ROW-DRIFT", `slice ${dispatchId} has the write scope ${scope.join(", ")} in the governed queue; this call gives ${allowedPaths.join(", ")}. Rebind with exactly that scope: --check ${commandId !== null || checks.includes(check) ? check : checks[0] ?? "<one .test file of it>"} (or --check command:<registered id> for a repository without a unit-test runner) and one --path for each other path, or choose a new --dispatch-id (slice-queue.mjs cancel ${dispatchId} --reason "<why>" --class <${CANCEL_CLASSES.join("|")}> first when it still holds a successor; pick the class that says why it ends: ${CANCEL_CLASSES.map((name) => `${name} = ${CANCEL_CLASS_HELP[name]}`).join("; ")})`);
    }
  }

  // AC-175 part A (D209/D210): the bootstrap already observes continuity-source drift; a dispatch built on moved authority bytes
  // is an open recovery, not a silent pass. The same projection (observeContinuityAuthorityDrift), the same recovery, no new verb.
  // A project without a State or continuity, a malformed record, a failing observer and a current record all yield null here, so
  // none of them changes any output byte. A source that cannot be compared at all is a warning (bootstrap's fail-open reading).
  const continuityDrift = (() => {
    try { return (deps.observeContinuityDrift ?? ((rootDir) => observeContinuityAuthorityDrift({ rootDir })))(root) ?? null; } catch { return null; }
  })();
  const driftSources = continuityAuthorityDriftSources(continuityDrift);
  if (driftSources.changed.length > 0) {
    soft("DBG-CONTINUITY-AUTHORITY-DRIFT", continuityAuthorityDriftRefusalText(driftSources.changed, driftSources.unobservable));
  } else if (driftSources.unobservable.length > 0) {
    warnings.push({ code: "DBG-CONTINUITY-AUTHORITY-UNOBSERVABLE", message: `the continuity record binds digests for ${driftSources.unobservable.map((entry) => `${entry.role} ${entry.path}`).join(", ")}, which could not be compared with the checkout (missing, unsafe or not a single regular file); the dispatch was not checked against them. See the bootstrap advisory continuityAuthorityDrift` });
  }

  // D75 (A): a briefing for an item whose earlier attempt the governed queue cancelled as wrong-premise repeats that stop
  // unless it carries a recon note that corrects the premise. Other classes, other items and a repository without a queue
  // are not touched, and nothing in the output changes unless a note is given.
  const queueRows = (deps.queueRows ?? defaultQueueRows)(root) ?? [];
  const wrongPremise = queueRows
    .filter((entry) => entry?.state === "cancelled" && entry.cancelClass === "wrong-premise" && entry.delivery?.itemId === itemId && entry.id !== dispatchId)
    .map((entry) => entry.id).sort();  // K106: the duty ends once a slice of the SAME item was delivered (integrated: the lib's only completed-delivery status).
  // The integration read runs only when a wrong-premise cancel exists; any fault leaves the duty in force.
  const dutyEnded = wrongPremise.length > 0 && hasDeliveredSliceOfItem(queueRows, itemId, wrongPremise, deps.integratedSliceIds ?? defaultIntegratedSliceIds, root);
  if (wrongPremise.length > 0 && !dutyEnded) {
    const readNote = options.reconNote === undefined ? null : readRepoFile(root, options.reconNote);
    if (readNote === null || readNote.toString("utf8").trim() === "") {
      const fault = options.reconNote === undefined ? "none was given" : `${options.reconNote} is not a non-empty regular file under --root`;
      soft("DBG-RECON-REQUIRED", `slice ${dispatchId} re-dispatches item ${itemId}, whose earlier attempt ${wrongPremise.join(", ")} the governed queue cancelled as wrong-premise (${CANCEL_CLASS_HELP["wrong-premise"]}); a new briefing built on the same premise repeats that stop, so it must carry a recon note and ${fault}. repair: write a recon note (what the earlier attempt assumed, what the code or Spec actually shows, the corrected premise) under ${RECON_NOTE_PREFIXES.join(" or ")}, add it to the briefing package as "reconNote": "<repository-relative path>" (for the binding command: --recon-note <path>), and regenerate the briefing. This duty ends once a slice of item ${itemId} has been delivered (integrated into the candidate): after that no recon note is needed for this item`);
    }
  }

  // D196 (R1): warn, never refuse, when another slice of this item is started and unfinished (a running or budget-checkpointed owner).
  const startedOwners = (() => { try { const found = (deps.startedOwners ?? defaultStartedOwners)(root); return Array.isArray(found) ? found : []; } catch { return []; } })()
    .filter((entry) => entry && entry.itemId === itemId && entry.dispatchId !== dispatchId && typeof entry.dispatchId === "string")
    .map((entry) => entry.dispatchId).sort();
  for (const owner of startedOwners) {
    warnings.push({ code: "DBG-CHECKPOINTED-OWNER", dispatchId: owner, message: `slice ${owner} of item ${itemId} is started and not finished, so a fresh dispatch for the same outcome is the successor route. Standard procedure: read its report, grant extra calls with node <plugin>/scripts/dispatch-budget-grant.mjs --agent-id <the agent id of that run> --extra <1..30> --reason "<why>" and resume the SAME agent with SendMessage. A fresh dispatch is meant only for an agent that is lost or has run itself into a corner (successor reason elephant-restart, owner-lost, context-poisoned or new-vertical-outcome). To release the slice instead: node <plugin>/scripts/slice-queue.mjs cancel ${owner} --started --reason "<why>" --class budget` });
  }

  // D76: the write scope is admitted only when it is disjoint from every other running dispatch of this checkout. The check
  // dependencies of this binding are its allowed paths (assertBindingInvariants), so one scope test covers both clauses.
  const others = (deps.runningDispatches ?? defaultRunningDispatches)(root).filter((entry) => entry.dispatchId !== dispatchId);
  const unreadable = others.filter((entry) => !Array.isArray(entry.writeScope) || entry.writeScope.length === 0);
  for (const entry of others) {
    if (unreadable.includes(entry)) continue;
    const pairs = [];
    for (const path of allowedPaths) for (const theirs of entry.writeScope) if (scopesOverlap([path], [theirs])) pairs.push(path === theirs ? path : `${path} (against ${theirs})`);
    if (pairs.length === 0) continue;
    soft("DBG-SCOPE-OVERLAP", `the write scope of ${dispatchId} overlaps the write scope of running dispatch ${entry.dispatchId} (${entry.record ?? "open dispatch record"}, owner ${entry.verdict ?? "unknown"}) on ${pairs.join(", ")}; two dispatches writing the same paths in one checkout overwrite each other. repair, one of: bind this dispatch with a write scope disjoint from ${entry.dispatchId} (drop or narrow the overlapping --path); wait until ${entry.dispatchId} has a terminal dispatch record and bind again; if ${entry.dispatchId} is abandoned, finalize its record with a terminal outcome through the sanctioned dispatch-record writer; or run this dispatch in its own worktree`);
  }
  if (unreadable.length > 0) {
    warnings.push({ code: "DBG-RUNNING-SCOPE-UNKNOWN", message: `the write scope of running dispatch(es) ${unreadable.map((entry) => entry.dispatchId).join(", ")} could not be read (no governed queue row and no generated briefing under scratch/), so this binding was not checked against them; confirm the scopes are disjoint before dispatching` });
  }

  // PF-61: a background Goldfish whose host commit failed at SubagentStop left a diagnostic nobody else reads (SubagentStop
  // surfaces no stderr). Non-blocking: never refuses and never deletes the file; the next successful completion removes it.
  const stopFailures = (deps.stopFailures ?? defaultStopFailures)(root);
  const stopEntries = (Array.isArray(stopFailures) ? stopFailures : [])
    .filter((entry) => entry && typeof entry === "object" && entry.schema === STOP_FAILURE_SCHEMA && typeof entry.dispatchId === "string" && typeof entry.code === "string")
    .sort((a, b) => String(a.observedAt ?? "").localeCompare(String(b.observedAt ?? "")) || a.dispatchId.localeCompare(b.dispatchId));
  // W7 (PO 2026-10-30): a routine must be used, not only present. The settled pending states of finished dispatches make every authority
  // scan walk them and keep the stop-failure rule from retiring records; the typed step below is the routine-repair heal that clears both.
  // Read-only: this build never runs it.
  const settledPreview = (() => {
    try {
      const found = (deps.settledPending ?? readSettledPendingPreview)(root);
      return found && Number.isSafeInteger(found.settledCount) && found.settledCount >= 0 && Array.isArray(found.leavingDispatchIds) ? found : null;
    } catch { return null; }
  })();
  const leavingIds = new Set(settledPreview?.leavingDispatchIds ?? []);
  const leavingEntries = stopEntries.filter((entry) => leavingIds.has(entry.dispatchId));
  let preDispatch = null;
  if (settledPreview !== null && (settledPreview.settledCount > 0 || leavingEntries.length > 0)) {
    const argv = ["node", fileURLToPath(new URL("./routine-repair.mjs", import.meta.url)), "run", "heal", "--root", root, "--reason", "retire settled pending states before dispatch"];
    preDispatch = [{ kind: "routine-repair", argv, why: `${settledPreview.settledCount} settled pending states, ${leavingEntries.length} stop-failure records` }];
    warnings.push({ code: "DBG-SETTLED-PENDING-HEAL", message: `${settledPreview.settledCount} settled pending states and ${leavingEntries.length} stop-failure record(s) of settled dispatches remain; run before dispatching: ${argv.join(" ")}` });
  }
  for (const entry of stopEntries.filter((row) => !leavingIds.has(row.dispatchId) || preDispatch === null)) {
    const name = typeof entry.file === "string" && entry.file !== "" ? entry.file : `stop-failure-${entry.dispatchId}.json`;
    warnings.push({ code: "DBG-HOST-COMMIT-STOP-FAILURE", dispatchId: entry.dispatchId, path: `${[STOP_FAILURE_DIR, STOP_FAILURE_LEGACY_DIR].map((parts) => parts.join("/")).find((rel) => rel === entry.directory) ?? STOP_FAILURE_DIR.join("/")}/${name}`, message: `background Goldfish ${entry.dispatchId} ended without a host commit (${entry.code}, status ${entry.status}, candidate ${entry.commit}, observed ${entry.observedAt}); verify its diff, commit it yourself with the Dispatch trailer, then rebuild; the diagnostic is removed by the next successful completion` });
  }

  // Agent definition: effort, model alias and the maxTurns cliff.
  const resolved = resolveAgentModel(agentType, { agentsDir });
  if (!resolved) refuse("DBG-AGENT-UNRESOLVED", `no agent definition with a model for ${agentType} under the plugin agents directory`);
  if (typeof resolved.effort !== "string" || resolved.effort === "") refuse("DBG-AGENT-UNRESOLVED", `agent definition ${agentType} declares no effort`);
  // The check protects one thing: the briefed model must be the family the dispatch will really run (MP-29: only the
  // tool-layer `model` parameter of the dispatch call selects it; this flag states and checks the briefed id, nothing more,
  // and no effect on a Codex dispatch beyond that is claimed). Claude: the alias family of the agent definition. Codex: the
  // agent definition's alias is a Claude concept, so the id is checked against the model the Codex route yields for the role.
  let codexRoute = null;
  if (runner === "codex") {
    const taskRoute = DUTY_ROUTE_OF_AGENT[agentType];
    codexRoute = (deps.codexRoute ?? defaultCodexRoute)(taskRoute);
    if (!codexRoute || codexRoute.state === "unavailable" || typeof codexRoute.selector?.value !== "string") {
      refuse("DBG-MODEL-ROUTE-UNAVAILABLE", `the Codex route ${taskRoute} for ${agentType} is ${codexRoute?.state === "unavailable" ? "unavailable" : "not registered"} in the runner profile registry, so model id ${modelId} cannot be checked against it; repair: pick the --agent-type whose Codex route is available (${Object.entries(DUTY_ROUTE_OF_AGENT).map(([type, route]) => `${type} = ${route}`).join(", ")}; \`node <plugin-root>/scripts/model-role-dispatch-select.mjs --repo-root <repo> --runner codex --task-route ${taskRoute}\` shows the route), or dispatch with --runner claude`);
    }
    const expected = codexRoute.selector.value;
    const matches = codexRoute.selector.kind === "alias" ? modelBelongsToFamily(modelId, expected) : modelId === expected;
    if (!matches) {
      refuse("DBG-MODEL-FAMILY", `model id ${modelId} is not the model the Codex route ${taskRoute} selects for ${agentType} (${expected}); repair: pass --model-id ${expected} together with --runner codex, or omit --runner for a Claude dispatch`);
    }
  } else if (!modelBelongsToFamily(modelId, resolved.model)) {
    refuse("DBG-MODEL-FAMILY", `model id ${modelId} does not belong to the ${resolved.model} family that agent definition ${agentType} declares; repair: pass a --model-id of the ${resolved.model} family (the id the dispatch will really run: the tool-layer \`model\` parameter of the dispatch call selects it, MP-29), or pass the --agent-type whose definition declares the family you mean (${AGENT_TYPES.join(", ")}), or pass --runner codex for a Codex dispatch (its model is then checked against the Codex route)`);
  }
  // The effort the run is briefed with: the Codex route's own effort for a Codex dispatch (the agent definition's effort is the Claude one).
  // Claude (W2-R2): the Claude Agent tool cannot pass an effort (MP-29), so the agent definition's frontmatter effort is what the run
  // really gets. It must therefore EQUAL the configured route's effort for the duty; a contradiction is refused before launch, unless
  // an explicit MP-05/MP-07 escalation admits an above-route pin. An unreadable route keeps the frontmatter effort and says so.
  let effort = typeof codexRoute?.effort === "string" && codexRoute.effort !== "" ? codexRoute.effort : resolved.effort;
  let claudeRouteDuty = null;
  if (effortEscalation !== undefined && !EFFORT_ESCALATION_ACTS.includes(effortEscalation)) {
    refuse("DBG-EFFORT-ESCALATION-UNKNOWN", `--effort-escalation ${JSON.stringify(effortEscalation)} is not a recognised escalation act; repair: pass --effort-escalation ${EFFORT_ESCALATION_ACTS.join(" or ")} (the model-policy act that authorises the above-route effort; in a briefing package the key "effortEscalation"), or omit it`);
  }
  if (runner !== "codex") {
    const taskRoute = DUTY_ROUTE_OF_AGENT[agentType];
    const route = (deps.claudeRoute ?? defaultClaudeRoute)(taskRoute);
    const routeEffort = route && route.state !== "unavailable" && typeof route.effort === "string" && route.effort !== "" ? route.effort : null;
    if (routeEffort === null) {
      warnings.push({ code: "DBG-EFFORT-ROUTE-UNKNOWN", message: `the Claude route ${taskRoute} for ${agentType} could not be read from the runner profile registry, so the effort ${resolved.effort} of the agent definition was not checked against the configured route` });
    } else if (routeEffort === resolved.effort) {
      claudeRouteDuty = taskRoute;
    } else if (effortEscalation !== undefined && (EFFORT_RANK[resolved.effort] ?? 0) > (EFFORT_RANK[routeEffort] ?? Infinity)) {
      claudeRouteDuty = taskRoute;
      warnings.push({ code: "DBG-EFFORT-ESCALATION", message: `${effortEscalation} escalation: agent definition ${agentType} pins effort ${resolved.effort}, above the ${routeEffort} the configured Claude route ${taskRoute} selects; the binding records ${resolved.effort}, the effort the run will really get` });
    } else {
      refuse("DBG-EFFORT-ROUTE-CONTRADICTION", `agent definition ${agentType} pins effort ${resolved.effort} but the configured Claude route ${taskRoute} selects effort ${routeEffort}; the Claude Agent tool cannot pass an effort (MP-29), so the frontmatter pin would silently win; repair: align the effort of agents/${agentType}.md with the route, or change the route in pipeline.user.yaml, or (a deliberate above-route escalation) pass --effort-escalation MP-05 or MP-07 (MP-05/MP-07; in a briefing package the key "effortEscalation"), or pass the --agent-type whose definition matches the route`);
    }
  }
  let maxTurns;
  try { maxTurns = Number.parseInt(parseAgentFrontmatter(readFileSync(resolve(agentsDir, `${agentType}.md`), "utf8")).maxTurns, 10); } catch { maxTurns = NaN; }
  if (!Number.isSafeInteger(maxTurns)) refuse("DBG-AGENT-UNRESOLVED", `agent definition ${agentType} declares no integer maxTurns`);
  const budget = toolBudgetFor(agentType, maxTurns);

  // The ruleset identity. The host only format-checks `rulesetSha` (64 hex) and copies it into its
  // receipt and the dispatch record, so a lesser-but-real identity of the same kind is admissible when
  // the loaded one is unavailable (it is, for a Claude local-development install: the preflight derives
  // a loaded identity only from a self-application checkout, a verified receipt or a Codex registry
  // binding). Order: loaded, installed, content hash of the loaded plugin root. Each fallback warns.
  let observation;
  let observationFault = null;
  const observeOnce = () => {
    observationFault = null;
    try { observation = observePreflight(preflightInputFor(runner, root)); } catch (error) { observation = undefined; observationFault = error?.code ?? "observer-threw"; }
  };
  observeOnce();
  let identity = observation?.rulesetSource?.loadedIdentity;
  let identityStatus = observationFault ?? (identity ? String(identity.status) : "absent");
  let rulesetSha = null;
  let rulesetFallback = null;
  // K12: a lock-held registry is a transient state, never a reason to settle for a lesser identity. Before any
  // fallback the lock is observed; a live or unjudgeable holder is waited for (bounded), the preflight is
  // observed again once it clears, and a lock that stays held is refused typed, naming the holder and the retry.
  if (!(identityStatus === "available" && typeof identity?.value === "string" && SHA.test(identity.value))) {
    const lockOf = deps.registryLock ?? defaultRegistryLock;
    const pause = deps.pause ?? sleepMs;
    const now = deps.now ?? Date.now;
    const deadline = now() + REGISTRY_LOCK_WAIT_MS;
    let lock = lockOf(root);
    let waited = false;
    while ((lock?.status === "held" && lock.owner !== "dead") && now() < deadline) { pause(50); waited = true; lock = lockOf(root); }
    if (lock?.status === "held") {
      const holder = lock.pid === null || lock.pid === undefined ? "an owner it does not record" : `pid ${lock.pid}`;
      refuse("DBG-RULESET-LOCK-HELD", `the session-authority registry lock is held by ${holder} (${lock.owner}, for ${lock.ageSeconds}s) and no fallback ruleset identity is taken while it is (preflight status: ${identityStatus}); repair: retry this command; to wait longer run \`node <plugin-root>/scripts/session-authority-repair.mjs wait --root <repo> --timeout 120\`; if the owner is gone or cannot be judged run \`... release-lock --root <repo> --no-pipeline-running --reason "<why>"\``);
    }
    if (waited || observationFault === "SDC-LOCK-HELD") {
      observeOnce();
      identity = observation?.rulesetSource?.loadedIdentity;
      identityStatus = observationFault ?? (identity ? String(identity.status) : "absent");
      if (observationFault === "SDC-LOCK-HELD") refuse("DBG-RULESET-LOCK-HELD", `the session-authority registry lock was still contended when the ruleset identity was read again, so no fallback identity is taken; repair: retry this command`);
    }
  }
  if (identityStatus === "available" && typeof identity?.value === "string" && SHA.test(identity.value)) rulesetSha = identity.value;
  else {
    const installed = observation?.rulesetSource?.installedIdentity;
    if (installed?.status === "available" && typeof installed.value === "string" && SHA.test(installed.value)) {
      rulesetSha = installed.value;
      rulesetFallback = "installedIdentity.value of the preflight ruleset source";
    } else if (typeof observation?.pluginRoot === "string" && observation.pluginRoot !== "") {
      try {
        const snapshot = snapshotPluginRoot(observation.pluginRoot);
        if (typeof snapshot?.contentSha256 === "string" && SHA.test(snapshot.contentSha256)) {
          rulesetSha = snapshot.contentSha256;
          rulesetFallback = "content hash of the loaded plugin root (snapshotPhysicalPluginRoot, lib/public-core-observation.mjs)";
        }
      } catch { /* no source exists: refused below */ }
    }
    if (rulesetFallback) warnings.push({ code: "DBG-RULESET-FALLBACK", source: rulesetFallback, message: `the loaded ruleset identity is ${identityStatus}; used the ${rulesetFallback}` });
  }
  if (rulesetSha === null) {
    refuse("DBG-RULESET-UNAVAILABLE", `the loaded ruleset identity is not available (status: ${identityStatus}) and no installed identity or plugin-root content hash exists to fall back to`);
  }
  const rulesetVersion = observation.rulesetSource?.selectedPlugin?.version;

  // Candidate: HEAD of --root, read-only.
  let candidateCommit;
  let candidateTree;
  try {
    candidateCommit = String(git(root, ["rev-parse", "HEAD"])).trim();
    candidateTree = String(git(root, ["rev-parse", "HEAD^{tree}"])).trim();
  } catch { refuse("DBG-GIT-HEAD", "git rev-parse HEAD failed under --root"); }
  if (!OID.test(candidateCommit) || !OID.test(candidateTree)) refuse("DBG-GIT-HEAD", "git returned a malformed commit or tree id");
  try {
    if (String(git(root, ["status", "--porcelain", "--", specPath])).trim() !== "") {
      warnings.push({ code: "DBG-SPEC-UNCOMMITTED", path: specPath, message: `${specPath} differs from HEAD; the locator hashes the working-tree bytes, not the candidate's` });
    }
  } catch { warnings.push({ code: "DBG-SPEC-STATE-UNKNOWN", path: specPath, message: `git status failed for ${specPath}` }); }

  // Protected surface: a warning per matching path, naming the rule.
  const baseline = resolveBaseline({ rootDir: root });
  if (baseline?.status !== "ready") {
    warnings.push({ code: "DBG-BASELINE-UNAVAILABLE", message: "the protected baseline could not be resolved; no path was checked against it" });
  } else {
    for (const path of allowedPaths) {
      const rule = protectedBaselineRuleFor(baseline.entries, path);
      if (rule) warnings.push({ code: "DBG-PROTECTED-PATH", path, ruleId: rule.id, message: `${path} matches protected-baseline rule ${rule.id}` });
    }
  }

  const binding = {
    schema: NATIVE_GOLDFISH_ITEM_BRIEFING_SCHEMA,
    dispatchId,
    candidateCommit,
    candidateTree,
    runner,
    role: `pipeline-core:${agentType}`,
    agentType,
    model: modelId,
    effort,
    rulesetSha,
    allowedPaths,
    criticDecision: {
      schema: "pipeline.critic-required-decision.v1",
      trigger: {
        schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false },
      },
      appliedRow: "T1",
    },
    itemDelivery: {
      schema: "pipeline.item-delivery-briefing.v1",
      sliceId: dispatchId,
      itemId,
      criterionLocator: locator,
      checks: [commandId === null
        ? { id: `${dispatchId.toLowerCase()}-check`, path: check, dependencies: [...allowedPaths] }
        : { id: `${dispatchId.toLowerCase()}-check`, path: commandCheckPath, command: commandId, dependencies: [...new Set([...allowedPaths, commandCheckPath])].sort() }],
    },
  };
  assertBindingInvariants(binding);
  // The host's Codex-native v3 shape names the agent by `nativeAgentType: "worker"` instead of `agentType` (the host derives
  // the agent type from the role); the Claude shape is serialised exactly as before.
  const serialised = runner === "codex"
    ? Object.fromEntries(Object.entries(binding).map(([key, value]) => (key === "agentType" ? ["nativeAgentType", "worker"] : [key, value])))
    : binding;

  const block = `${BLOCK_OPEN}\n${JSON.stringify(serialised)}\n${BLOCK_CLOSE}`;
  const field6 = [
    `- Ruleset: ${rulesetVersion ? `\`${rulesetVersion}\` · ` : ""}content identity \`${rulesetSha}\`${rulesetFallback ? ` (fallback: ${rulesetFallback})` : ""}.`,
    runner === "codex"
      ? `- Model/effort: \`${modelId}\` / ${effort} (${agentType}; Codex route \`${DUTY_ROUTE_OF_AGENT[agentType]}\`).`
      : `- Model/effort: \`${modelId}\` / ${effort} (${agentType}; agent definition alias \`${resolved.model}\`${claudeRouteDuty === null ? "" : `; Claude route \`${claudeRouteDuty}\``}).`,
    `- Tier: ${agentType}. Worktree: {{WORKTREE}}.`,
    // PF-42: governed item admission reads these two lines (parseDispatchSlice); the skeleton carries them.
    `- Slice: ${dispatchId}`,
    `- Write scope: ${allowedPaths.join(", ")}`,
    `- **Tool budget (TB-09, hard cap):** ≤${budget.budget} tool uses (min(tier cap ${budget.tierCap}, maxTurns ${maxTurns} - 15)). 80 % checkpoint at about call ${budget.checkpoint}: stop editing and end the turn with an interim report naming what remains.`,
  ];
  const skeleton = [
    block, "", NATIVE_GOLDFISH_HOST_DIRECTIVE, "",
    `## Briefing ${dispatchId}: {{TITLE}}`, "",
    "### 1. Goal", "", "{{GOAL}}", "",
    "### 2. Context files", "", ...architectureContextLines(root, allowedPaths, deps.loadMapBundle), "", "{{CONTEXT_FILES}}", "",
    "### 3. DoD checks", "", "{{DOD_CHECKS}}", "",
    "### 4. Forbidden", "", "{{FORBIDDEN}}", "",
    "### 5. Stop conditions", "", "{{STOP_CONDITIONS}}", "",
    "### 6. Dispatch metadata", "", ...field6, "",
  ].join("\n");

  // Self-check: the host's own parser must accept exactly what is about to be handed out.
  if (skeleton.split(BLOCK_OPEN.slice(0, BLOCK_OPEN.lastIndexOf(":v") + 2)).length !== 2) refuse("DBG-SELFCHECK-MARKER", "the skeleton must contain the binding opening marker exactly once");
  const parsed = parseNativeGoldfishBriefing(skeleton);
  if (!parsed.ok) refuse("DBG-SELFCHECK-PARSE", `the host parser rejects the generated skeleton: ${parsed.code}`);
  const { criticDecision: _decision, ...parsedAll } = parsed.binding;
  // The host adds `agentType` and `adapterVersion` to a Codex-native binding it reads back; neither is in the block.
  const { agentType: _derived, adapterVersion: _adapter, ...parsedCodex } = parsedAll;
  const parsedRest = runner === "codex" ? parsedCodex : parsedAll;
  const { criticDecision: _own, ...ownRest } = serialised;
  if (JSON.stringify(parsedRest) !== JSON.stringify(ownRest)) refuse("DBG-SELFCHECK-PARSE", "the host parser read back a different binding than was generated");
  const named = parseDispatchSlice(skeleton);
  if (named.sliceId !== dispatchId || JSON.stringify(named.writeScope) !== JSON.stringify([...allowedPaths])) refuse("DBG-SELFCHECK-SLICE", "the admission parser reads a different slice or write scope from the generated skeleton");

  // A Codex result carries `agentType` beside `nativeAgentType`, as the host's read-back does (renderGoldfishBriefing reads it).
  return { schema: DISPATCH_BINDING_SCHEMA, ok: true, block, binding: runner === "codex" ? { ...serialised, agentType } : binding, skeleton, warnings, ...(preDispatch === null ? {} : { preDispatch }) };
}

const BUILD_FLAGS = Object.freeze({ "--root": "root", "--package": "package", "--out": "out" });

/** `build --package <repo-relative json> [--out scratch/<file>.md] [--root <dir>]`; the same strict flag rules as `binding`. */
export function parseBuildArgv(argv) {
  const values = {};
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string" || !Object.hasOwn(BUILD_FLAGS, token)) refuse("DBG-FLAG-UNKNOWN", `unknown build argument ${JSON.stringify(token)}; build takes --package, --out and --root`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) refuse("DBG-FLAG-VALUE", `flag ${token} needs a value`);
    index++;
    const key = BUILD_FLAGS[token];
    if (Object.hasOwn(values, key)) refuse("DBG-FLAG-REPEATED", `flag ${token} may be given once`);
    values[key] = value;
  }
  if (values.package === undefined) refuse("DBG-FLAG-MISSING", "required flag --package is missing; repair: name the package JSON file, repository-relative");
  if (!validRepoPath(values.package)) refuse("DBG-PATH-INVALID", `package path ${JSON.stringify(values.package)} must be repository-relative without .., ., .git or backslash segments`);
  if (values.out !== undefined && (!validRepoPath(values.out) || !values.out.startsWith("scratch/") || !values.out.endsWith(".md"))) {
    refuse("DBG-PATH-INVALID", `--out ${JSON.stringify(values.out)} must be a repository-relative scratch/<name>.md path; repair: write the briefing under scratch/`);
  }
  return values;
}

/** The binding options one closed package yields for an agent type (shared by build and probe). */
function packageBindingOptions(root, pkg, agentType) {
  return {
    root, dispatchId: pkg.id, item: pkg.item, agentType, modelId: pkg.modelId,
    // PF-68 (PO decision 2026-10-29): a file the dispatch creates and declares under newFiles is part of the write scope.
    check: pkg.check, paths: [...new Set([...pkg.paths, ...(pkg.newFiles ?? [])])], spec: pkg.spec, criterion: pkg.criterion, reconNote: pkg.reconNote, runner: pkg.runner,
    // The package carries the same escalation act as the --effort-escalation flag; the binding is its only validator.
    ...(pkg.effortEscalation === undefined ? {} : { effortEscalation: pkg.effortEscalation }),
  };
}

/** The tool-layer parameters of the Claude Agent call (tool, subagent_type, model family), or null for a Codex dispatch or an unbound tier. */
function dispatchCallBase(pkg, boundTier) {
  const family = ["opus", "sonnet", "haiku", "fable"].find((name) => String(pkg.modelId).toLowerCase().includes(name)) ?? null;
  return pkg.runner === "codex" || typeof boundTier !== "string" ? null : { tool: "Agent", subagent_type: `pipeline-core:${boundTier}`, model: family };
}

/** The D196 (R4) estimate warnings of build, as a pure function of the package and the binding's tool budget. */
function estimateWarningsOf(pkg, budget) {
  const estimateWarnings = [];
  if (Number.isSafeInteger(pkg.estimatedToolCalls) && Number.isSafeInteger(budget) && pkg.estimatedToolCalls > budget) {
    if (!/grant/iu.test(String(pkg.budgetRationale ?? ""))) estimateWarnings.push({ code: "DBG-ESTIMATE-ABOVE-BASE", message: `estimatedToolCalls ${pkg.estimatedToolCalls} exceeds the base cap ${budget} and budgetRationale does not say a grant is planned; repair: name the planned grant in budgetRationale (the word grant), or lower the estimate` });
    if (pkg.estimatedToolCalls > 2 * (budget + 30)) estimateWarnings.push({ code: "DBG-ESTIMATE-NEEDS-SPLIT", message: `estimatedToolCalls ${pkg.estimatedToolCalls} is more than twice the base cap ${budget} plus one grant step of 30; repair: split the outcome along independent criteria into slices with disjoint scopes` });
  }
  return estimateWarnings;
}

/** Renders the complete briefing of one closed package (PO decision D78); writes only the --out file. */
export function buildDispatchBriefing(options, deps = {}) {
  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }
  const bytes = readRepoFile(root, options.package);
  if (!bytes) refuse("DBG-PACKAGE-UNREADABLE", `package ${options.package} is not a readable regular file under --root; repair: write the package there`);
  let pkg;
  try { pkg = JSON.parse(bytes.toString("utf8")); } catch { refuse("DBG-PACKAGE-UNREADABLE", `package ${options.package} is not valid JSON; repair: fix its JSON`); }
  validateBriefingPackage(pkg);
  assertPackagePathsExist(root, pkg, deps.pathExists);
  const calibration = resolveBriefingCalibration(root, deps.calibration);
  const bind = (agentType) => generateDispatchBinding(packageBindingOptions(root, pkg, agentType), deps);
  // Test-first budget (D193, PO 2026-10-29): an estimate above the tier cap is refused unless the package plans a grant; the tier is never raised silently.
  const generated = bind(pkg.agentType);
  const budget = skeletonToolBudget(generated.skeleton);
  const decision = budgetDecision(pkg, budget);
  // D196 (R4): warnings only. An estimate above the base cap with no planned grant, and one far above a single grant step.
  const estimateWarnings = estimateWarningsOf(pkg, budget);
  const rendered = renderGoldfishBriefing(pkg, generated, calibration, decision);
  if (options.out !== undefined) {
    const target = resolve(root, options.out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, rendered.text, "utf8");
  }
  // The Claude Agent call the dispatcher makes next, so the tool-layer parameters need not be derived from the contract (MP-29):
  // the tier of the (possibly raised) binding, the model family of the package's model id, the briefing passed verbatim.
  const boundTier = generated.binding?.agentType;
  const base = dispatchCallBase(pkg, boundTier);
  const dispatchCall = base === null ? null : {
    ...base,
    prompt: options.out === undefined ? "the `text` field of this result, verbatim" : `the file ${options.out}, verbatim including its final newline`,
    // D183: a Claude Agent dispatch may carry this two-line pointer prompt instead of the full text; guard-dispatch hands the child the verified file bytes.
    ...(options.out === undefined || boundTier === undefined ? {} : { promptPointer: renderPointerPrompt({ text: rendered.text, path: options.out }) }),
  };
  return {
    schema: BRIEFING_BUILD_SCHEMA, ok: true, dispatchId: pkg.id, path: options.out ?? null,
    sha256: rendered.sha256, warnings: [...generated.warnings, ...packageAdvisories(pkg), ...estimateWarnings], dispatchCall, ...(generated.preDispatch === undefined ? {} : { preDispatch: generated.preDispatch }), ...(options.out === undefined ? { text: rendered.text } : {}),
  };
}

export const DISPATCH_PROBE_SCHEMA = "pipeline.dispatch-readiness-probe.v1";
const PROBE_FLAGS = Object.freeze({ "--root": "root", "--package": "package" });

/** `probe --package <repo-relative json> [--root <dir>]`; the same strict flag rules as `build`. */
export function parseProbeArgv(argv) {
  const values = {};
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string" || !Object.hasOwn(PROBE_FLAGS, token)) refuse("DBG-FLAG-UNKNOWN", `unknown probe argument ${JSON.stringify(token)}; probe takes --package and --root`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "" || value.startsWith("--")) refuse("DBG-FLAG-VALUE", `flag ${token} needs a value`);
    index++;
    const key = PROBE_FLAGS[token];
    if (Object.hasOwn(values, key)) refuse("DBG-FLAG-REPEATED", `flag ${token} may be given once`);
    values[key] = value;
  }
  if (values.package === undefined) refuse("DBG-FLAG-MISSING", "required flag --package is missing; repair: name the package JSON file, repository-relative");
  if (!validRepoPath(values.package)) refuse("DBG-PATH-INVALID", `package path ${JSON.stringify(values.package)} must be repository-relative without .., ., .git or backslash segments`);
  return values;
}

/** The text a refusal message carries from its first "repair" on, or the whole message when it names no labelled repair. */
function repairOf(message) {
  const at = String(message).indexOf("repair");
  return at === -1 ? String(message) : String(message).slice(at);
}

/**
 * Readiness probe (backlog: the first dispatch in a consumer repository): the checks a dispatch of one package meets, in dry-run,
 * ALL failures collected instead of the first. Read-only by construction: it writes no file, never takes the session-authority
 * registry lock (it only reads it) and never reserves a slice. Where a binding refusal needs a value the later steps use, it is
 * recorded as the one finding of the binding and the checks that depend on it are named under `skipped`.
 */
export function probeDispatchReadiness(options, deps = {}) {
  let root;
  try { root = realpathSync(resolve(options.root ?? process.cwd())); } catch { refuse("DBG-ROOT-UNREADABLE", "--root cannot be resolved to a directory"); }
  const findings = [];
  const skipped = [];
  const find = (check, code, message, repair, kind = "failure") => { findings.push({ code, check, message, repair, kind }); };
  const failWith = (check, error) => {
    const known = error instanceof BriefingRefusal || error instanceof BriefingPackageRefusal;
    const message = String(error?.message ?? error);
    find(check, known ? error.code : "DBG-INTERNAL", message, repairOf(message));
  };
  const fieldsOk = (() => {
    const bytes = readRepoFile(root, options.package);
    if (!bytes) { find("package-fields", "DBG-PACKAGE-UNREADABLE", `package ${options.package} is not a readable regular file under --root`, "repair: write the package there"); return null; }
    try { return validateBriefingPackage(JSON.parse(bytes.toString("utf8"))); } catch (error) {
      if (error instanceof SyntaxError) find("package-fields", "DBG-PACKAGE-UNREADABLE", `package ${options.package} is not valid JSON`, "repair: fix its JSON");
      else failWith("package-fields", error);
      return null;
    }
  })();
  const pkg = fieldsOk;
  let calibration = null;
  let generated = null;
  let decision = null;
  let warnings = [];
  if (pkg === null) skipped.push("package-paths", "calibration", "binding", "tool-budget", "render");
  else {
    try { assertPackagePathsExist(root, pkg, deps.pathExists); } catch (error) { failWith("package-paths", error); }
    try { calibration = resolveBriefingCalibration(root, deps.calibration); } catch (error) { failWith("calibration", error); }
    const softRefusals = [];
    try { generated = generateDispatchBinding(packageBindingOptions(root, pkg, pkg.agentType), { ...deps, softRefusals }); } catch (error) { failWith("binding", error); }
    for (const refusal of softRefusals) find("binding", refusal.code, refusal.message, repairOf(refusal.message));
    if (generated === null) skipped.push("tool-budget", "render");
    else {
      const budget = skeletonToolBudget(generated.skeleton);
      try { decision = budgetDecision(pkg, budget); } catch (error) { failWith("tool-budget", error); }
      warnings = [...generated.warnings, ...packageAdvisories(pkg), ...estimateWarningsOf(pkg, budget)];
      if (decision !== null && calibration !== null && findings.length === 0) {
        try { renderGoldfishBriefing(pkg, generated, calibration, decision); } catch (error) { failWith("render", error); }
      } else if (findings.length > 0 || decision === null || calibration === null) skipped.push("render");
    }
  }

  // The plan approval the item course needs (read-only reader; the refusal code and the repair of the dispatch itself).
  try {
    const approval = (deps.observePlanApproval ?? observeCurrentPlanApprovalForCalibration)({ rootDir: root });
    if (approval?.status !== "eligible") {
      const code = typeof approval?.code === "string" ? approval.code : `PLAN-APPROVAL-${String(approval?.status ?? "UNKNOWN").toUpperCase()}`;
      find("plan-approval", code, `the current plan approval is ${approval?.status ?? "unreadable"} (${code}${approval?.detail ? `: ${approval.detail}` : ""})`, approval?.repair ?? staleApprovalRepair(code));
    }
  } catch (error) {
    find("plan-approval", "DBG-PROBE-APPROVAL-UNREADABLE", `the plan approval could not be read: ${String(error?.message ?? error).slice(0, 200)}`, "repair: read node <plugin-root>/scripts/pipeline-state.mjs inspect");
  }

  // The registry lock is only READ here (never taken): a holder is a finding, a lock that cannot be observed is reported as skipped.
  let lock = null;
  try { lock = (deps.registryLock ?? defaultRegistryLock)(root); } catch { lock = null; }
  if (lock === null || lock === undefined) {
    find("registry-lock", "DBG-PROBE-LOCK-UNOBSERVED", "the session-authority registry lock could not be observed, so this check was skipped, not passed", "repair: run the probe again inside the repository checkout, or read node <plugin-root>/scripts/session-authority-repair.mjs", "skipped");
  } else if (lock.status === "held") {
    const holder = lock.pid === null || lock.pid === undefined ? "an owner it does not record" : `pid ${lock.pid}`;
    const message = `the session-authority registry lock is held by ${holder} (${lock.owner}, for ${lock.ageSeconds}s)`;
    const repair = lock.owner === "dead"
      ? `repair: its owner is not alive; run node ${fileURLToPath(new URL("./routine-repair.mjs", import.meta.url))} run heal --root ${root} --reason "retire the registry lock of a dead owner before dispatching"`
      : `repair: wait for the owner, node ${fileURLToPath(new URL("./session-authority-repair.mjs", import.meta.url))} wait --root ${root} --timeout 120; if the owner is gone or cannot be judged run the same script with release-lock --root ${root} --no-pipeline-running --reason "<why>"`;
    find("registry-lock", "DBG-PROBE-REGISTRY-LOCK-HELD", message, repair);
  }

  const ready = findings.length === 0;
  const base = ready && pkg !== null ? dispatchCallBase(pkg, generated?.binding?.agentType) : null;
  return {
    schema: DISPATCH_PROBE_SCHEMA, ok: ready, ready, findings, warnings,
    ...(skipped.length === 0 ? {} : { skipped }),
    ...(ready ? { dispatchCall: base === null ? null : { ...base, prompt: `the briefing file that build --package ${options.package} --out scratch/<briefing>.md writes, verbatim including its final newline` } } : {}),
  };
}

/** Argv in, result object out; never throws for a refusal. */
export function runDispatchBriefing(argv, deps = {}) {
  try {
    if (Array.isArray(argv) && argv[0] === "probe") return probeDispatchReadiness(parseProbeArgv(argv), deps);
    if (Array.isArray(argv) && argv[0] === "build") return buildDispatchBriefing(parseBuildArgv(argv), deps);
    return generateDispatchBinding(parseBindingArgv(argv), deps);
  } catch (error) {
    const code = error instanceof BriefingRefusal || error instanceof BriefingPackageRefusal ? error.code : "DBG-INTERNAL";
    return { schema: DISPATCH_REFUSAL_SCHEMA, ok: false, code, message: String(error?.message ?? error) };
  }
}

if (directInvocation && !cliHelp) {
  const result = runDispatchBriefing(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
