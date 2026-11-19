#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * One command that prepares a Goldfish or Critic dispatch (PO decision 2026-11-10; the Antigravity report asked for it).
 * It runs the existing preparation scripts in their documented order and prints the call the agent makes next. Every check
 * stays in the script that owns it: a refusal keeps that step's own code and repair. This command starts no child and never
 * commits, pushes, signs or approves. The single scripts keep working and stay the fallback (references/happy-path.md).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { admitRequestPlaceholderPaths } from "../lib/session-critic-finalizer-read.mjs";
import { createHash } from "node:crypto";
import { fillCriticBriefing, renderCriticBriefings } from "../lib/critic-briefing-build.mjs";
import { CRITIC_BRIEFING_ROLE, renderPointerPrompt } from "../lib/briefing-file-reference.mjs";
import { criticRunnerFromEnv } from "../lib/critic-route-assurance.mjs";
import { writerCommitSteps } from "../lib/writer-commit-capability.mjs";

export const DISPATCH_PREPARATION_SCHEMA = "pipeline.dispatch-preparation.v1";
const HERE = dirname(fileURLToPath(import.meta.url));
const scriptPath = (name) => join(HERE, name);
const SELF = fileURLToPath(import.meta.url);
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u;
const ADMIT_REQUEST_FILE = "scratch/session-critic-finalization-request.json";

export const PREPARE_DISPATCH_HELP = `Usage:
  node <plugin-root>/scripts/prepare-dispatch.mjs goldfish --root <root> --package <package.json> [--out scratch/<briefing>.md] [--no-goldfish-running]
  node <plugin-root>/scripts/prepare-dispatch.mjs critic --root <root> --spec <path> --base <ref> --candidate <full commit id> [--guardrail <path>]... [--evidence <path>]...
       [--task-id <id>] [--prior-critic <path>] [--delta-request <path>] [--correction-input-bindings <file>] [--registration-commit <full commit id>] [--successor-of <feature-id>] [--label <name> -- <check command> <args>]
  node <plugin-root>/scripts/prepare-dispatch.mjs critic-fill --root <root> --briefing <path> --fill NAME=value [--fill NAME=value]...
  node <plugin-root>/scripts/prepare-dispatch.mjs --help | -h

Prints one JSON object of schema ${DISPATCH_PREPARATION_SCHEMA}: status "ready" (exit 0), "commit-required" or "stopped" (exit 2).
"next" names the call to make; "stop" keeps the failed step's own code and repair. This command starts no child and never commits, pushes, signs or approves.

goldfish: probes the package and reports ALL failures at once, builds the briefing, and on Codex also runs the native preparation.
  The package fields are listed by: node <plugin-root>/scripts/dispatch-briefing.mjs --help
  --out defaults to scratch/<package name>.briefing.md. --no-goldfish-running says that no Goldfish is running: only then does a pending
  registry heal run, once. Without it, the heal command is returned in "beforeDispatch".
critic: with --label, runs the check command as Critic diagnostic evidence under the Spec's evidence directory, registers it and stops once with
  "commit-required": commit exactly commitPaths in one evidence-only commit, then run the identical command again. Without --label, pass existing --evidence.
  It then runs the preflight and writes ${ADMIT_REQUEST_FILE}; "next.placeholders" names the values only you can fill before "next.admitCommand".
  A request you had already filled is kept and named in "previousRequest": if that Critic still runs, finalize it with that file. A --label that recorded another candidate is refused.
  --candidate must be the full commit id, because the evidence commit moves HEAD. The preflight derives the registration commit itself; pass --registration-commit only when it reports several candidates.
  --successor-of <feature-id> names the DISCARDED predecessor of a feature whose registered manifest does not declare it (supersedes is null): the first full review may then start from the commit before the inherited implementation, a strict ancestor of the commit that first added the feature manifest. The predecessor must be recorded as discarded in the State and, when the manifest declares supersedes, must equal it. It is needed for the first round only; a later round recovers the predecessor from the retained course.
critic-fill: the Claude route to hand a Critic its briefing as a verified pointer instead of retyping the ~12k-token file. --briefing is a draft the critic verb wrote
  (scratch/critic-briefing/<folder>/critic[-<part>].briefing.md); every <FILL ...> slot needs one --fill NAME=value: MODEL_ID takes the concrete model id (one token, never
  inherit) and EFFORT one of low, medium, high, xhigh, max. A value for no slot, an open slot, a value outside that vocabulary and a draft with a Codex or Antigravity slot are
  refused; nothing else in the file can change. It writes critic[-<part>].final.md beside the draft (never over it) with a Critic generator marker and prints "promptPointer": the two-line prompt
  to pass, unchanged and alone, to a direct Claude Agent call of pipeline-core:critic. The dispatch guard verifies the file and the Critic receives the filled briefing exactly.
  Antigravity and Codex carriers still carry the full text; a Workflow carrier refuses a pointer.
`;

const HELP_COMMAND = "node <plugin-root>/scripts/prepare-dispatch.mjs --help";
/** C31-C1 (B3): an argument refusal shows the usage line of the failed verb and the runnable help command, never the whole help (a 3.9 KB text repeated in the context per refusal). */
function usageRepair(verb) {
  const lines = PREPARE_DISPATCH_HELP.split("\n");
  const at = lines.findIndex((line) => line.startsWith(`  node <plugin-root>/scripts/prepare-dispatch.mjs ${verb} `));
  if (at < 0) return `every verb and flag: ${HELP_COMMAND}`;
  let end = at + 1;
  while (lines[end]?.startsWith("       [")) end += 1;
  return `usage: ${lines.slice(at, end).map((line) => line.trim()).join(" ")} ; every verb and flag: ${HELP_COMMAND}`;
}

const lastJson = (text) => {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return null;
  try { return JSON.parse(trimmed); } catch { /* a step may print lines before its result */ }
  const line = trimmed.split(/\r?\n/u).reverse().find((entry) => entry.startsWith("{"));
  if (line === undefined) return null;
  try { return JSON.parse(line); } catch { return null; }
};

function outcome(verb, status, fields) { return Object.freeze({ schema: DISPATCH_PREPARATION_SCHEMA, verb, status, ...fields }); }

/** A step's own refusal, unchanged: its code and repair are what the agent acts on. */
function stopped(verb, step, value, fallback, extra = {}) {
  const code = typeof value?.code === "string" ? value.code : fallback;
  const reason = value?.reason ?? value?.message ?? value?.error ?? "the step did not return a usable result";
  // C31-M2 (L10a): the preflight's own refusal reaches the agent whole (its code, and the field and expected form its reason names); only the other steps' free output is bounded.
  return outcome(verb, "stopped", { stop: { step, code, reason: step === "preflight" ? String(reason) : String(reason).slice(0, 1500), repair: value?.repair ?? `read the output of step ${step}, fix the cause and run the identical command again` }, ...extra });
}

const defaultRunner = (root) => (executable, argv) => spawnSync(executable, argv, { cwd: root, encoding: "utf8", shell: false, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
const stepOf = (run) => (name, argv) => {
  const result = run(process.execPath, [scriptPath(name), ...argv]);
  return { exit: result.status ?? 1, value: lastJson(result.stdout) ?? lastJson(result.stderr), raw: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
};
// A step that gives a code but no words still has to show what it printed: the repair points at this output.
const asReason = (step) => (step.value?.reason ?? step.value?.message ?? step.value?.error ? step.value : { ...(step.value ?? {}), reason: step.raw === "" ? undefined : step.raw });

function packageRunner(root, packagePath, deps) {
  try { return JSON.parse((deps.readFile ?? readFileSync)(resolve(root, packagePath), "utf8")).runner ?? "claude"; } catch { return "claude"; }
}

function healCommand(warning) { return /\bnode\s+\S*routine-repair\.mjs\b.*$/u.exec(String(warning?.message ?? ""))?.[0] ?? null; }

export function prepareGoldfishDispatch({ root, packagePath, out = null, noGoldfishRunning = false }, deps = {}) {
  const verb = "goldfish";
  if (typeof packagePath !== "string" || packagePath === "") return stopped(verb, "arguments", { code: "PREP-ARGUMENT", reason: "--package is required", repair: usageRepair("goldfish") }, "PREP-ARGUMENT");
  const run = deps.runCommand ?? defaultRunner(root);
  const step = stepOf(run);
  const probeArgv = ["probe", "--package", packagePath, "--root", root];
  let probe = step("dispatch-briefing.mjs", probeArgv);
  const heal = probe.value?.warnings?.find((warning) => warning.code === "DBG-SETTLED-PENDING-HEAL") ?? null;
  // A plugin path with a space does not match the pattern: the whole warning still names the command, so nothing is lost.
  let beforeDispatch = heal === null ? null : healCommand(heal) ?? heal.message;
  if (heal !== null && noGoldfishRunning === true) {
    const repaired = step("routine-repair.mjs", ["run", "heal", "--root", root, "--reason", "retire settled pending states before dispatch"]);
    if (repaired.exit !== 0) return stopped(verb, "heal", asReason(repaired), "PREP-HEAL-FAILED");
    beforeDispatch = null;
    probe = step("dispatch-briefing.mjs", probeArgv);
  }
  if (probe.value?.ready !== true) {
    const findings = Array.isArray(probe.value?.findings) ? probe.value.findings : [];
    return stopped(verb, "probe", findings[0] ?? asReason(probe), "PREP-PROBE-FAILED", { findings });
  }
  const briefing = out ?? `scratch/${basename(packagePath).replace(/\.json$/u, "").replace(/\.package$/u, "")}.briefing.md`;
  const built = step("dispatch-briefing.mjs", ["build", "--package", packagePath, "--out", briefing, "--root", root]);
  if (built.exit !== 0 || built.value?.ok !== true) return stopped(verb, "build", asReason(built), "PREP-BUILD-FAILED");
  const warnings = built.value.warnings ?? [];
  const runner = packageRunner(root, packagePath, deps);
  const common = { runner, briefing, sha256: built.value.sha256 ?? null, warnings, ...(beforeDispatch === null ? {} : { beforeDispatch }) };
  if (runner === "codex") {
    const prepared = step("codex-native-dispatch-prepare.mjs", ["prepare", "--root", root, "--briefing", briefing]);
    if (prepared.exit !== 0 || !["prepared", "not-applicable"].includes(prepared.value?.status)) return stopped(verb, "codex-prepare", asReason(prepared), "PREP-CODEX-PREPARE-FAILED");
    return outcome(verb, "ready", { ...common, next: { tool: "spawn_agent", ...prepared.value.spawn_agent, ...(prepared.value.bindWindowSeconds === undefined ? {} : { bindWindowSeconds: prepared.value.bindWindowSeconds }), note: prepared.value.next ?? null } });
  }
  if (runner === "antigravity") {
    return outcome(verb, "ready", { ...common, next: { tool: "invoke_subagent", arguments: "flat, one child per call: TypeName is the bare role name, Prompt is the briefing file verbatim including its final newline, Workspace is \"branch\" (a code-writing child runs in its own worktree; AGY-NATIVE-WORKSPACE-NOT-ISOLATED refuses any other)", briefing, reference: "skills/pipeline-start/references/antigravity-native-dispatch.md" } });
  }
  return outcome(verb, "ready", { ...common, next: built.value.dispatchCall ?? null });
}

const gitOutput = (run, argv) => { const result = run("git", argv); return result.status === 0 ? String(result.stdout ?? "").trim() : ""; };
const recordedDiagnosticCandidate = (path, read) => { try { return JSON.parse(read(path, "utf8"))?.candidate?.commit ?? null; } catch { return null; } };

/** `finalize` reads this same file. A request the agent has already filled keeps its content under its packet's name; an untouched draft is simply replaced. */
function setAsideFilledRequest(target, deps) {
  if (!(deps.exists ?? existsSync)(target)) return null;
  let held;
  try { held = JSON.parse((deps.readFile ?? readFileSync)(target, "utf8")); } catch { return null; }
  if (admitRequestPlaceholderPaths(held).length > 0) return null;
  const packet = String(held?.packetId ?? "unknown").replace(/[^A-Za-z0-9._-]/gu, "_");
  const aside = ADMIT_REQUEST_FILE.replace(/\.json$/u, `.${packet}.json`);
  (deps.rename ?? renameSync)(target, join(dirname(target), basename(aside)));
  return aside;
}

const shellWord = (word) => (/^[\w./@+=:\\-]+$/u.test(word) ? word : JSON.stringify(word));
const sameSet = (left, right) => left.length === right.length && [...left].sort().join("\0") === [...right].sort().join("\0");

/**
 * C31-C1 (L14): the ONE commit step of `commit-required`, derived and never run here. The owned commit route (commit-pipeline-owned.mjs) commits a feature manifest
 * together with the untracked evidence it lists; its own read-only dry-run says which paths it would commit. Only when that is exactly commitPaths is it named;
 * every other answer (a refusal, other paths, nothing, no usable output) falls back to the printed steps for exactly commitPaths. This preparation still never commits.
 */
function commitStepFor({ root, commitPaths, step }) {
  const dry = step("commit-pipeline-owned.mjs", ["--root", root, "--agent", "--dry-run"]);
  const wouldCommit = dry.value?.status === "dry-run" ? [...(Array.isArray(dry.value.owned) ? dry.value.owned : []), ...(Array.isArray(dry.value.carried) ? dry.value.carried : [])] : null;
  if (wouldCommit !== null && sameSet(wouldCommit, commitPaths)) return { route: "owned-commit", executable: process.execPath, argv: [scriptPath("commit-pipeline-owned.mjs"), "--root", root, "--agent"] };
  const why = dry.value?.code ?? (dry.value?.status === "dry-run" ? "covers-other-paths" : dry.value?.status ?? "no-answer");
  return { route: "explicit-steps", ownedRoute: why, steps: writerCommitSteps(commitPaths, "chore(pipeline): commit the Critic diagnostic evidence") };
}

export function prepareCriticDispatch(input, deps = {}) {
  const verb = "critic";
  const { root, spec, base, candidate, guardrails = [], evidence = [], taskId = null, priorCritic = null, deltaRequest = null, correctionInputBindings = null, registrationCommit = null, successorOf = null, label = null, command = [] } = input;
  for (const [flag, value] of [["--spec", spec], ["--base", base], ["--candidate", candidate]]) {
    if (typeof value !== "string" || value === "") return stopped(verb, "arguments", { code: "PREP-ARGUMENT", reason: `${flag} is required`, repair: usageRepair(verb) }, "PREP-ARGUMENT");
  }
  if (!COMMIT.test(candidate)) return stopped(verb, "arguments", { code: "PREP-CANDIDATE-NOT-COMMIT", reason: `--candidate must be the full commit id, got ${candidate}`, repair: "pass the output of a rev-parse of the reviewed commit: the evidence commit moves HEAD, so a symbolic name would point at the wrong commit on the rerun" }, "PREP-CANDIDATE-NOT-COMMIT");
  if ((label === null) !== (command.length === 0)) return stopped(verb, "arguments", { code: "PREP-ARGUMENT", reason: "--label and the check command after -- come together", repair: usageRepair(verb) }, "PREP-ARGUMENT");
  if (label !== null && !LABEL.test(label)) return stopped(verb, "arguments", { code: "PREP-ARGUMENT", reason: "--label takes letters, digits, dot, underscore and hyphen", repair: usageRepair(verb) }, "PREP-ARGUMENT");
  const run = deps.runCommand ?? defaultRunner(root);
  const step = stepOf(run);
  const exists = deps.exists ?? existsSync;
  const evidencePaths = [...evidence];
  if (label !== null) {
    const evidenceDir = posix.join(posix.dirname(spec.replace(/\\/gu, "/")), "evidence");
    const out = `${evidenceDir}/${label}.json`, log = `${evidenceDir}/${label}.log`;
    if (exists(resolve(root, out)) && recordedDiagnosticCandidate(resolve(root, out), deps.readFile ?? readFileSync) !== candidate) {
      return stopped(verb, "diagnostic", { code: "PREP-LABEL-OTHER-CANDIDATE", reason: `${out} does not record the candidate ${candidate}`, repair: "pass a new --label for this candidate: the evidence of an earlier candidate cannot stand for this one" }, "PREP-LABEL-OTHER-CANDIDATE");
    }
    if (gitOutput(run, ["log", "-1", "--format=%H", "--", out]) === "") {
      if (!exists(resolve(root, out))) {
        const produced = step("critic-diagnostic-evidence.mjs", ["--root", root, "--spec", spec, "--log", log, "--out", out, "--candidate", candidate, "--base", base, ...guardrails.flatMap((path) => ["--guardrail", path]), "--", ...command]);
        if (produced.exit !== 0) return stopped(verb, "diagnostic", asReason(produced), "PREP-DIAGNOSTIC-FAILED");
      }
      const registered = step("register-feature-package.mjs", ["--root", root, "--add-diagnostic-evidence", out]);
      if (registered.exit !== 0 || registered.value?.status === "refused") return stopped(verb, "register", asReason(registered), "PREP-REGISTER-FAILED");
      const commitPaths = [...new Set([out, log, ...(registered.value?.commitPaths ?? [])])];
      const commit = commitStepFor({ root, commitPaths, step });
      return outcome(verb, "commit-required", { commitPaths, commit, rerun: { executable: process.execPath, argv: [SELF, ...criticArgv(input)] },
        next: `${commit.route === "owned-commit" ? `Run this one command, it commits exactly commitPaths (the manifest together with the evidence it lists): ${commit.argv.map(shellWord).join(" ")}` : "Run the steps of commit in order, they stage and commit exactly commitPaths in one evidence-only commit"}; then run the identical command again (rerun). Change nothing else first.` });
    }
    evidencePaths.push(out);
  }
  const preflight = step("critic-dispatch-preflight.mjs", ["--root", root, "--base", base, "--candidate", candidate, "--spec", spec,
    ...guardrails.flatMap((path) => ["--guardrail", path]), ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(registrationCommit === null ? [] : ["--registration-commit", registrationCommit]), ...(successorOf === null ? [] : ["--successor-of", successorOf]), ...(taskId === null ? [] : ["--task-id", taskId]),
    ...(priorCritic === null ? [] : ["--prior-critic", priorCritic]), ...(deltaRequest === null ? [] : ["--delta-request", deltaRequest]),
    ...(correctionInputBindings === null ? [] : ["--correction-input-bindings", correctionInputBindings])]);
  if (preflight.value?.status !== "packet-ready") return stopped(verb, "preflight", asReason(preflight), "PREP-PREFLIGHT-FAILED");
  const value = preflight.value;
  // A current-artifact review scope prints no admit request; the preflight's own result then says what follows.
  if (value.admitRequest === undefined) return outcome(verb, "ready", { preflight: value, next: { nextStep: value.nextStep ?? "the preflight returned packet-ready without an admit request; follow its result" } });
  // The briefing is built before anything is written, so a refusal here leaves no half-prepared state behind.
  const briefing = buildCriticBriefingFiles({ root, value, run, step, deps });
  if (briefing.stop !== undefined) return stopped(verb, "briefing", briefing.stop, "PREP-BRIEFING-FAILED");
  const target = resolve(root, ADMIT_REQUEST_FILE);
  const previousRequest = setAsideFilledRequest(target, deps);
  (deps.mkdir ?? mkdirSync)(dirname(target), { recursive: true });
  (deps.writeFile ?? writeFileSync)(target, `${JSON.stringify(value.admitRequest, null, 2)}\n`, "utf8");
  for (const file of briefing.files) {
    (deps.mkdir ?? mkdirSync)(dirname(resolve(root, file.path)), { recursive: true });
    (deps.writeFile ?? writeFileSync)(resolve(root, file.path), file.text, "utf8");
  }
  const admitCommand = (value.admitCommand ?? []).map((part) => part.replace("${PIPELINE_PLUGIN_ROOT}/scripts/", `${HERE.replace(/\\/gu, "/")}/`));
  return outcome(verb, "ready", {
    packetId: value.admitRequest.packetId, candidate: value.candidate?.commit ?? candidate,
    ...(previousRequest === null ? {} : { previousRequest }),
    next: { requestPath: ADMIT_REQUEST_FILE, placeholders: admitRequestPlaceholderPaths(value.admitRequest), admitCommand,
      briefings: briefing.files.map(({ path, entryId, placeholders, limitation }) => ({ path, entryId, placeholders, ...(limitation === undefined ? {} : { limitation }) })),
      ...(briefing.bindingsPath === null ? {} : { correctionInputBindings: briefing.bindingsPath }),
      briefingUse: briefing.runner === "antigravity"
        ? "After admit, each briefing file is the Prompt of one invoke_subagent call (TypeName critic, no Model), verbatim; replace only its <FILL ...> values. The `model:` row takes the concrete model id this session runs on (the Critic inherits it), never the word inherit; the call itself still passes no Model. It holds paths and refs only: add nothing. A Critic is a read-only role, so prepare each call before issuing it: write one request file with `packets` (one pipeline.role-dispatch-request.v1 packet) and that call's own TypeName, Role and Prompt, run `antigravity-native-dispatch-prepare.mjs prepare --root <root> --request <file>`, and pass the returned invocation's fields unchanged; an unprepared call is refused AGY-NATIVE-ARTIFACT-MISSING (skills/pipeline-start/references/antigravity-native-dispatch.md). This carrier carries the full text; the pointer route (critic-fill) is for a direct Claude call only."
        : "After admit, each briefing file is the prompt of one fresh Critic dispatch, verbatim; replace only its <FILL ...> values. Add nothing to it: no earlier round, no verdict, no explanation (critic-review.md, fail-closed reference boundary). "
          + "On Claude hand the briefing over as a pointer instead of retyping it: run `prepare-dispatch.mjs critic-fill --root <root> --briefing <file> --fill MODEL_ID=<concrete model id> --fill EFFORT=<effort>` and pass the printed promptPointer (two lines) as the whole prompt of the Agent call; the dispatch guard verifies the file against its marker and every later check judges the expanded text. The Antigravity and Codex carriers still carry the full text.",
      nextStep: value.nextStep,
      ...(value.taskIdResolution === undefined ? {} : { taskIdResolution: value.taskIdResolution }), ...(value.split === undefined ? {} : { split: value.split }) },
  });
}

// C30D-G3: the fill step of the Critic pointer route. It reads ONE generated draft (scratch/critic-briefing/<folder>/critic[-<part>].briefing.md), takes explicit
// NAME=value pairs for its <FILL ...> slots (a closed vocabulary, lib/critic-briefing-build.mjs), writes the FINAL file beside it (never over the draft)
// and prints the two-line pointer prompt for a direct Claude Agent call. The dispatch guard verifies the file against its Critic marker.
const CRITIC_DRAFT_PATH = /^scratch\/critic-briefing\/([A-Za-z0-9][A-Za-z0-9._-]*)\/(critic(?:-[A-Za-z0-9][A-Za-z0-9._-]*)?)\.briefing\.md$/u;

export function prepareCriticFill({ root, briefing, fills = [] }, deps = {}) {
  const verb = "critic-fill";
  const refuse = (code, reason, repair = usageRepair(verb)) => stopped(verb, code.startsWith("PREP-") ? "arguments" : "fill", { code, reason, repair }, code);
  const match = typeof briefing === "string" ? CRITIC_DRAFT_PATH.exec(briefing.replace(/\\/gu, "/")) : null;
  if (match === null) return refuse("PREP-FILL-PATH", "--briefing must be a generated draft: scratch/critic-briefing/<folder>/critic[-<part>].briefing.md, the file `prepare-dispatch.mjs critic` wrote", "pass the path printed in next.briefings of the critic verb");
  const values = new Map();
  for (const entry of fills) {
    const at = String(entry).indexOf("=");
    const name = at < 1 ? "" : String(entry).slice(0, at);
    if (!/^[A-Z0-9_]+$/u.test(name)) return refuse("PREP-ARGUMENT", `--fill takes NAME=value with an upper-case slot name (got ${JSON.stringify(String(entry).slice(0, 40))})`);
    if (values.has(name)) return refuse("PREP-ARGUMENT", `--fill ${name} was given twice`);
    values.set(name, String(entry).slice(at + 1));
  }
  const draftPath = briefing.replace(/\\/gu, "/");
  let text;
  try { text = (deps.readFile ?? readFileSync)(resolve(root, ...draftPath.split("/")), "utf8"); } catch (error) {
    return refuse("PREP-FILL-PATH", `the draft cannot be read (${error?.code ?? "error"})`, "run `prepare-dispatch.mjs critic` again; it writes the draft");
  }
  let filled;
  try { filled = fillCriticBriefing({ text: String(text), values }); } catch (error) {
    return refuse(error?.code ?? "PREP-FILL-FAILED", String(error?.message ?? error), "fix the named value or slot and run the identical command again; never edit the draft by hand");
  }
  const path = `scratch/critic-briefing/${match[1]}/${match[2]}.final.md`;
  (deps.mkdir ?? mkdirSync)(dirname(resolve(root, path)), { recursive: true });
  (deps.writeFile ?? writeFileSync)(resolve(root, path), filled.text, "utf8");
  const promptPointer = renderPointerPrompt({ text: filled.text, path });
  return outcome(verb, "ready", { path, sha256: createHash("sha256").update(filled.text, "utf8").digest("hex"), slots: filled.slots, promptPointer,
    next: { tool: "Agent", subagent_type: CRITIC_BRIEFING_ROLE, prompt: promptPointer,
      use: "Pass promptPointer unchanged as the WHOLE prompt of one direct Claude Agent call to pipeline-core:critic: it is a pointer prompt (the generator marker line plus one pipeline-briefing-file line), nothing before, between or after. The dispatch guard checks the file against its marker and hands the Critic exactly the filled briefing; every later check judges that expanded text. A Workflow, Codex or Antigravity carrier takes the full briefing text instead and refuses a pointer." } });
}

const TEMPLATE_PATH = join(HERE, "..", "templates", "prompts", "critic-review.md");

/** Correction input bindings file (derived once, never overwritten), the enumerated commits and the filled briefing text(s). */
function buildCriticBriefingFiles({ root, value, run, step, deps }) {
  const read = deps.readFile ?? readFileSync;
  const exists = deps.exists ?? existsSync;
  const base = value.base?.commit ?? value.dispatch?.reviewerInput?.baseCommit;
  const head = value.candidate?.commit;
  const folder = `scratch/critic-briefing/${String(base).slice(0, 12)}-${String(head).slice(0, 12)}`;
  let bindingsPath = null;
  const bound = value.correctionInputBindings;
  if (typeof bound?.path === "string" && bound.path !== "") bindingsPath = bound.path;
  else if (bound?.derived === true) {
    bindingsPath = `${folder}/correction-input-bindings.json`;
    let onDisk = null;
    if (exists(resolve(root, bindingsPath))) { try { onDisk = JSON.parse(read(resolve(root, bindingsPath), "utf8")).digestSha256 ?? null; } catch { onDisk = null; } }
    if (onDisk === null) {
      const derived = step("critic-correction-input-bindings.mjs", ["derive", "--root", root, "--base", base, "--head", head, "--out", bindingsPath]);
      if (derived.exit !== 0) return { stop: asReason(derived) };
      onDisk = derived.value?.digestSha256 ?? null;
    }
    if (onDisk !== bound.digestSha256) return { stop: { code: "PREP-BINDINGS-DIGEST", reason: `${bindingsPath} does not carry the digest the preflight bound (${bound.digestSha256})`, repair: `remove ${bindingsPath} and run the identical command again` } };
  }
  const listed = gitOutput(run, ["rev-list", "--reverse", `${base}..${head}`]);
  const commits = listed === "" ? [] : listed.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const runner = criticRunnerFromEnv(deps.env ?? process.env);
  let rendered;
  try {
    rendered = renderCriticBriefings({ preflight: value, templateText: (deps.readTemplate ?? (() => readFileSync(TEMPLATE_PATH, "utf8")))(), commits, bindingsPath, runner, root, projectName: basename(root), reviewPaths: Array.isArray(value.criticReviewPaths) ? value.criticReviewPaths : null });
  } catch (error) {
    return { stop: { code: error?.code ?? "PREP-BRIEFING-FAILED", reason: String(error?.message ?? error), repair: "the Critic template or the preflight result changed shape; report this code, do not hand-write the briefing" } };
  }
  const files = rendered.briefings.map((entry) => ({ ...entry, path: `${folder}/critic${entry.entryId === null ? "" : `-${entry.entryId}`}.briefing.md` }));
  return { files, bindingsPath, runner };
}

function criticArgv(input) {
  const pair = (flag, value) => (value === null || value === undefined ? [] : [flag, value]);
  return ["critic", "--root", input.root, "--spec", input.spec, "--base", input.base, "--candidate", input.candidate,
    ...(input.guardrails ?? []).flatMap((path) => ["--guardrail", path]), ...(input.evidence ?? []).flatMap((path) => ["--evidence", path]),
    ...pair("--task-id", input.taskId), ...pair("--prior-critic", input.priorCritic), ...pair("--delta-request", input.deltaRequest),
    ...pair("--correction-input-bindings", input.correctionInputBindings), ...pair("--registration-commit", input.registrationCommit), ...pair("--successor-of", input.successorOf), ...pair("--label", input.label),
    ...((input.command ?? []).length === 0 ? [] : ["--", ...input.command])];
}

const SINGLE_FLAGS = { goldfish: { "--root": "root", "--package": "packagePath", "--out": "out" },
  "critic-fill": { "--root": "root", "--briefing": "briefing" },
  critic: { "--root": "root", "--spec": "spec", "--base": "base", "--candidate": "candidate", "--task-id": "taskId", "--prior-critic": "priorCritic", "--delta-request": "deltaRequest", "--correction-input-bindings": "correctionInputBindings", "--registration-commit": "registrationCommit", "--successor-of": "successorOf", "--label": "label" } };

export function parsePrepareDispatchArgv(argv) {
  const verb = argv[0];
  if (verb !== "goldfish" && verb !== "critic" && verb !== "critic-fill") return { error: `the verbs are goldfish, critic and critic-fill; got ${JSON.stringify(verb ?? null)}` };
  const split = argv.indexOf("--");
  const flags = split < 0 ? argv.slice(1) : argv.slice(1, split);
  const options = { verb, guardrails: [], evidence: [], fills: [], command: split < 0 ? [] : argv.slice(split + 1) };
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (verb === "goldfish" && flag === "--no-goldfish-running") { options.noGoldfishRunning = true; continue; }
    const value = flags[index + 1];
    if (value === undefined || value.startsWith("--")) return { error: `${flag} needs a value` };
    index += 1;
    if (verb === "critic" && flag === "--guardrail") options.guardrails.push(value);
    else if (verb === "critic" && flag === "--evidence") options.evidence.push(value);
    else if (verb === "critic-fill" && flag === "--fill") options.fills.push(value);
    else {
      const key = SINGLE_FLAGS[verb][flag];
      if (key === undefined) return { error: `unknown flag ${flag}` };
      if (options[key] !== undefined) return { error: `${flag} was given twice` };
      options[key] = value;
    }
  }
  if (options.root === undefined) return { error: "--root is required" };
  return { options: { ...options, root: resolve(options.root) } };
}

export function runPrepareDispatch(argv, deps = {}) {
  const parsed = parsePrepareDispatchArgv(argv);
  if (parsed.error !== undefined) return stopped(["critic", "critic-fill"].includes(argv[0]) ? argv[0] : "goldfish", "arguments", { code: "PREP-ARGUMENT", reason: parsed.error, repair: usageRepair(argv[0]) }, "PREP-ARGUMENT");
  if (parsed.options.verb === "critic-fill") return prepareCriticFill(parsed.options, deps);
  return parsed.options.verb === "goldfish" ? prepareGoldfishDispatch(parsed.options, deps) : prepareCriticDispatch(parsed.options, deps);
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { process.stdout.write(PREPARE_DISPATCH_HELP); process.exit(0); }
  const result = runPrepareDispatch(argv);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "ready" ? 0 : 2);
}
