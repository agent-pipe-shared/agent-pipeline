#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * setup-check.test.mjs — test suite for the SessionStart setup-completion reminder hook
 * (setup-check.mjs, AP2 P3a completion wave).
 *
 * Coverage contract (briefing DoD field 3, item 3):
 *   - isStillDefault: unconfigured intent -> true, configured intent -> false,
 *     missing/empty setup block -> false, null -> false
 *   - buildSetupIncompleteMessage: "missing" vs "default-markers" wording
 *   - decideOutput: missing file -> active JSON, default markers -> active JSON, fully
 *     set-up -> silent empty, unparseable/ambiguous -> silent empty
 *
 * Plus a real-CLI-subprocess section (mirrors staleness-check.test.mjs /
 * post-compact-reground.test.mjs's pattern) exercising run()'s CLAUDE_PROJECT_DIR-relative
 * file read against OS-tmpdir fixtures -- never this repo's real pipeline.user.yaml.
 *
 * Run:   node plugins/pipeline-core/hooks/setup-check.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SETUP_INTENT, isStillDefault, buildSetupIncompleteMessage, decideOutput,
  decideFromProjectDir, reconcileSetupObservation,
} from "./setup-check.mjs";
import { observePipelineStartPreflight } from "../scripts/pipeline-start-preflight.mjs";

const SCRIPT = fileURLToPath(new URL("./setup-check.mjs", import.meta.url));

let pass = 0;
const failures = [];
function ok(id, condition, detail) {
  if (condition) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail !== undefined ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

const WORKDIR = mkdtempSync(join(tmpdir(), "setup-check-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeRaw(path, text) {
  writeFileSync(path, text);
}

// ======================================================================================
// isStillDefault
// ======================================================================================
ok(
  "isStillDefault: unconfigured setup intent -> true",
  isStillDefault({ setup: { intent: DEFAULT_SETUP_INTENT } }) === true,
);
ok(
  "isStillDefault: consumer setup intent -> false",
  isStillDefault({ setup: { intent: "consumer" } }) === false,
);
ok("isStillDefault: setup block missing entirely -> false", isStillDefault({ language: { human_facing: "de" } }) === false);
ok("isStillDefault: setup block empty object -> false", isStillDefault({ setup: {} }) === false);
ok("isStillDefault: setup not an object (string) -> false", isStillDefault({ setup: "not an object" }) === false);
ok("isStillDefault: parsed is null -> false", isStillDefault(null) === false);
ok("isStillDefault: parsed is a non-object (array) -> false", isStillDefault([]) === false);
ok("isStillDefault: parsed is undefined -> false", isStillDefault(undefined) === false);

// ======================================================================================
// buildSetupIncompleteMessage — "missing" vs "default-markers" wording
// ======================================================================================
{
  const msg = buildSetupIncompleteMessage("missing");
  ok("buildSetupIncompleteMessage missing: names the setup.mjs command", msg.includes("setup.mjs"), msg);
  ok("buildSetupIncompleteMessage missing: mentions the file is absent (fresh clone)", msg.includes("is still missing"), msg);
  ok(
    "buildSetupIncompleteMessage missing: does NOT use the default-markers wording",
    !msg.includes("default markers"),
    msg,
  );
}
{
  const msg = buildSetupIncompleteMessage("default-markers");
  ok("buildSetupIncompleteMessage default-markers: names the setup.mjs command", msg.includes("setup.mjs"), msg);
  ok("buildSetupIncompleteMessage default-markers: names the unconfigured intent", msg.includes("unconfigured setup intent"), msg);
  ok(
    "buildSetupIncompleteMessage default-markers: does NOT use the 'is still missing' missing-file wording",
    !msg.includes("is still missing"),
    msg,
  );
}
ok(
  "buildSetupIncompleteMessage: missing vs default-markers produce genuinely different text",
  buildSetupIncompleteMessage("missing") !== buildSetupIncompleteMessage("default-markers"),
);

// ======================================================================================
// decideOutput
// ======================================================================================
{
  const { stdout, json, payload } = decideOutput({ fileExists: false, parsed: null });
  ok("decideOutput missing file: non-empty stdout (active)", stdout !== "", stdout);
  ok("decideOutput missing file: json=true", json === true);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* asserted below */
  }
  ok("decideOutput missing file: stdout is valid JSON", parsed !== null, stdout);
  ok("decideOutput missing file: hookSpecificOutput.hookEventName is SessionStart", parsed?.hookSpecificOutput?.hookEventName === "SessionStart");
  ok("decideOutput missing file: systemMessage matches the 'missing' wording", parsed?.systemMessage === buildSetupIncompleteMessage("missing"));
  ok("decideOutput missing file: additionalContext mirrors systemMessage", parsed?.hookSpecificOutput?.additionalContext === parsed?.systemMessage);
  ok("decideOutput missing file: payload matches the parsed stdout", JSON.stringify(payload) === stdout.trim());
}
{
  const { stdout, json } = decideOutput({ fileExists: true, parsed: { setup: { intent: DEFAULT_SETUP_INTENT } } });
  ok("decideOutput default markers: non-empty stdout (active)", stdout !== "", stdout);
  ok("decideOutput default markers: json=true", json === true);
  const parsed = JSON.parse(stdout);
  ok(
    "decideOutput default markers: systemMessage matches the 'default-markers' wording",
    parsed.systemMessage === buildSetupIncompleteMessage("default-markers"),
  );
}
{
  const { stdout, json } = decideOutput({
    fileExists: true,
    parsed: { setup: { intent: "maintainer" } },
  });
  ok("decideOutput fully set-up: silent (empty stdout)", stdout === "", stdout);
  ok("decideOutput fully set-up: json=false", json === false);
}
{
  // Unparseable/ambiguous: caller already resolved this to `parsed: null` while
  // `fileExists: true` (setup-check.mjs's own run() does this on any read/parse error) --
  // fail-open, never a guess-based nag.
  const { stdout, json } = decideOutput({ fileExists: true, parsed: null });
  ok("decideOutput unparseable (file exists, parsed null): silent (empty stdout)", stdout === "", stdout);
  ok("decideOutput unparseable: json=false", json === false);
}
{
  // Ambiguous shape: parsed is a non-object (e.g. a bare YAML scalar document) -- isStillDefault
  // returns false (no identity block to read), so this is silent too.
  const { stdout } = decideOutput({ fileExists: true, parsed: "just a string" });
  ok("decideOutput ambiguous non-object parsed: silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// Full CLI process (spawns the real script; CLAUDE_PROJECT_DIR points at tmp fixtures)
// ======================================================================================
function runCli(rootDir) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir },
  });
  // Some restricted runners disallow subprocess creation (EPERM). Exercise the
  // same filesystem resolver in that case; normal CI still validates the real
  // executable entrypoint above.
  if (res.error?.code === "EPERM") {
    const { stdout } = decideFromProjectDir(rootDir);
    return { status: 0, stdout, stderr: "" };
  }
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

{
  const rootDir = fixtureDir("cli-missing-file");
  // pipeline.user.yaml intentionally not written.
  const { status, stdout } = runCli(rootDir);
  ok("CLI: missing pipeline.user.yaml -> exit 0", status === 0);
  ok("CLI: missing pipeline.user.yaml -> active JSON on stdout", stdout.trim() !== "" && JSON.parse(stdout).systemMessage.includes("setup.mjs"), stdout);
}

{
  const rootDir = fixtureDir("cli-default-markers");
  writeRaw(
    join(rootDir, "pipeline.user.yaml"),
    `setup:\n  intent: "${DEFAULT_SETUP_INTENT}"\n`,
  );
  const { status, stdout } = runCli(rootDir);
  ok("CLI: default markers -> exit 0", status === 0);
  const parsed = JSON.parse(stdout);
  ok("CLI: default markers -> active JSON, unconfigured-intent wording", parsed.systemMessage.includes("unconfigured setup intent"), stdout);
}

{
  const rootDir = fixtureDir("cli-fully-set-up");
  writeRaw(
    join(rootDir, "pipeline.user.yaml"),
    `setup:\n  intent: "maintainer"\n`,
  );
  const { status, stdout } = runCli(rootDir);
  ok("CLI: fully set up -> exit 0", status === 0);
  ok("CLI: fully set up -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("cli-malformed-yaml");
  // Flow-style mapping is OUTSIDE yaml-lite's strict subset -> parseYaml throws -> fail-open.
  writeRaw(join(rootDir, "pipeline.user.yaml"), `setup: { intent: "consumer" }\n`);
  const { status, stdout } = runCli(rootDir);
  ok("CLI: malformed/unsupported YAML -> exit 0 (fail-open, never blocks)", status === 0);
  ok("CLI: malformed/unsupported YAML -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("cli-yaml-array-document");
  // A well-formed yaml-lite document whose top-level value is an array, not an object --
  // run()'s own `!Array.isArray(value)` guard treats this as parsed=null (ambiguous).
  writeRaw(join(rootDir, "pipeline.user.yaml"), `- one\n- two\n`);
  const { status, stdout } = runCli(rootDir);
  ok("CLI: top-level YAML array (non-object document) -> exit 0", status === 0);
  ok("CLI: top-level YAML array (non-object document) -> silent (ambiguous, fail-open)", stdout === "", stdout);
}

// ======================================================================================
// Reachability (backlog item 2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md,
// Direction 3): the `default-markers` branch's `resolvingSteps()` names `node setup.mjs`, which
// SETUP.md forbids a marketplace-installed CONSUMER to run. This proves that branch never
// actually fires for that audience, because no shipped consumer code path ever writes a
// `setup:` key into pipeline.user.yaml -- an onboarding-generated file has the shape below
// (mirrors this repo's own tracked pipeline.user.yaml minus the `setup` key, which no library
// under plugins/pipeline-core/lib/ ever writes).
// ======================================================================================
{
  const rootDir = fixtureDir("onboarding-generated-shape");
  writeRaw(
    join(rootDir, "pipeline.user.yaml"),
    [
      "advisor_export:",
      "  consent: \"approved\"",
      "agent_runtime: \"claude-code\"",
      "autonomy:",
      "  branch_model: \"feature-branch\"",
      "  push_policy: \"gated\"",
      "  wip_limit: 3",
      "gates:",
      "  claude_md_max_lines: 200",
      "  dev_plan: \"blocking\"",
      "  push: \"blocking\"",
      "  push_approval: \"signature\"",
      "  security: \"blocking\"",
      "language:",
      "  agent_facing: \"en\"",
      "  human_facing: \"en\"",
      "",
    ].join("\n"),
  );
  const { stdout, observation } = decideFromProjectDir(rootDir);
  ok(
    "onboarding-generated shape (no setup: key at all) -> the hook is silent (default-markers never fires)",
    stdout === "" && observation === null,
    stdout,
  );
}

// ======================================================================================
// Lifecycle reconciliation (SETUPSTATUS-1): one lifecycle, one answer for one human
//
// This hook and `pipeline-start-preflight` observe DIFFERENT things and neither is derived
// from the other: the hook reads `pipeline.user.yaml` (project personalization), the
// preflight resolves the loaded plugin distribution's identity. Neither can observe
// "onboarding is in progress" -- which is exactly why the hook declares its statement a
// point-in-time snapshot UNCONDITIONALLY and names the step that resolves it, and why the
// preflight declares what its own `status` ranges over. `reconcileSetupObservation` is the
// contract that makes "both statements can be true for one reader at once" checkable
// instead of a matter of prose.
// ======================================================================================
const PREFLIGHT_MANIFEST = JSON.stringify({ version: "0.5.3+test" });
function preflightPluginList(version) {
  return () => JSON.stringify({
    installed: [{
      pluginId: "pipeline-core@agent-pipeline",
      name: "pipeline-core",
      marketplaceName: "agent-pipeline",
      version,
      installed: true,
      enabled: true,
      source: { source: "local", path: "/cache/agent-pipeline/plugins/pipeline-core" },
      marketplaceSource: { sourceType: "git", source: "https://example.invalid/agent-pipeline.git" },
    }],
    available: [],
  });
}
/** Injected end-to-end: no subprocess, no home-directory read, no real plugin registry. */
function preflightAt(rootDir, installedVersion = "0.5.3+test") {
  return observePipelineStartPreflight({
    env: {},
    pluginList: preflightPluginList(installedVersion),
    read: () => PREFLIGHT_MANIFEST,
    cwd: rootDir,
  });
}

// ---- (a) pipeline.user.yaml absent, lifecycle mid-onboarding ---------------------------
{
  const rootDir = fixtureDir("reconcile-mid-onboarding"); // pipeline.user.yaml intentionally absent
  const hook = decideFromProjectDir(rootDir);
  const preflight = preflightAt(rootDir);
  ok("(a) preflight reports ready while pipeline.user.yaml is absent", preflight.status === "ready", preflight.status);
  ok("(a) the hook is NOT silenced -- it still reports what it saw", hook.stdout !== "");
  const verdict = reconcileSetupObservation({ preflight, observation: hook.observation });
  ok("(a) hook statement and preflight status are reconcilable", verdict.reconcilable === true, verdict.basis);
  ok(
    "(a) reconciliation rests on a declared snapshot over a disjoint scope, not on coincidence",
    verdict.basis === "declared-snapshot-disjoint-scope",
    verdict.basis,
  );
  ok(
    "(a) the hook declares its view point-in-time and non-authoritative",
    hook.observation?.kind === "point-in-time" && hook.observation?.authoritative === false,
  );
  ok(
    "(a) the hook names at least one step that will change its answer",
    Array.isArray(hook.observation?.resolvedBy) && hook.observation.resolvedBy.length > 0,
  );
  const message = JSON.parse(hook.stdout).systemMessage;
  ok(
    "(a) the human-facing message repeats every named resolving step verbatim",
    hook.observation.resolvedBy.every((step) => message.includes(step)),
    message,
  );
  ok(
    "(a) the message states it is not the pipeline-start readiness verdict",
    message.includes("not the pipeline-start readiness verdict"),
    message,
  );
  ok(
    "(a) the message names the onboarding step that writes the file",
    message.includes("authority-seed"),
    message,
  );
}

// ---- (b) setup genuinely complete ------------------------------------------------------
{
  const rootDir = fixtureDir("reconcile-complete");
  writeRaw(join(rootDir, "pipeline.user.yaml"), `setup:\n  intent: "maintainer"\n`);
  const hook = decideFromProjectDir(rootDir);
  const preflight = preflightAt(rootDir);
  ok("(b) setup complete: the hook is silent", hook.stdout === "", hook.stdout);
  ok("(b) setup complete: the hook emits no observation at all", hook.observation === null);
  ok("(b) setup complete: preflight is ready", preflight.status === "ready", preflight.status);
  const verdict = reconcileSetupObservation({ preflight, observation: hook.observation });
  ok(
    "(b) setup complete: both agree",
    verdict.reconcilable === true && verdict.basis === "hook-silent",
    verdict.basis,
  );
}

// ---- (c) setup genuinely absent, no onboarding in progress -----------------------------
// Neither component can see "onboarding is running", so the hook's statement has to hold
// against EVERY preflight status, not just the one observed during the greenfield run.
{
  const rootDir = fixtureDir("reconcile-no-onboarding");
  const hook = decideFromProjectDir(rootDir);
  for (const [label, preflight] of [
    ["ready", preflightAt(rootDir)],
    ["plugin-refresh-required", preflightAt(rootDir, "0.5.2+test")],
  ]) {
    ok(`(c) preflight status is ${label}`, preflight.status === label, preflight.status);
    const verdict = reconcileSetupObservation({ preflight, observation: hook.observation });
    ok(`(c) hook and preflight (${label}) agree -- reconcilable`, verdict.reconcilable === true, verdict.basis);
  }
}

// ---- the reconciliation contract itself ------------------------------------------------
{
  const { observation } = decideOutput({ fileExists: false, parsed: null });
  const declaredPreflight = { status: "ready", statusScope: "plugin-distribution-identity" };
  ok(
    "reconcile: a preflight that does not declare its scope is NOT reconcilable",
    reconcileSetupObservation({ preflight: { status: "ready" }, observation }).reconcilable === false,
  );
  ok(
    "reconcile: a hook claiming authority is NOT reconcilable",
    reconcileSetupObservation({
      preflight: declaredPreflight,
      observation: { ...observation, authoritative: true },
    }).reconcilable === false,
  );
  ok(
    "reconcile: a hook claiming to block is NOT reconcilable",
    reconcileSetupObservation({
      preflight: declaredPreflight,
      observation: { ...observation, blocking: true },
    }).reconcilable === false,
  );
  ok(
    "reconcile: a hook that names no resolving step is NOT reconcilable",
    reconcileSetupObservation({
      preflight: declaredPreflight,
      observation: { ...observation, resolvedBy: [] },
    }).reconcilable === false,
  );
  // Route (A) escape hatch: if the two are ever put on ONE source, the predicate stops
  // accepting a declaration and demands identical verdicts.
  ok(
    "reconcile: same scope + differing verdicts -> NOT reconcilable",
    reconcileSetupObservation({
      preflight: { status: "ready", statusScope: observation.scope },
      observation,
    }).reconcilable === false,
  );
  ok(
    "reconcile: same scope + identical verdicts -> reconcilable (route A stays open)",
    reconcileSetupObservation({
      preflight: { status: observation.status, statusScope: observation.scope },
      observation,
    }).reconcilable === true,
  );
}

// ---- (d) the hook informs, it never gates ----------------------------------------------
const BLOCKING_KEYS = [
  "continue", "decision", "permissionDecision", "permissionDecisionReason",
  "stopReason", "block", "deny", "exitCode",
];
function carriesBlockingKey(value) {
  if (value === null || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKING_KEYS.includes(key)) return true;
    if (carriesBlockingKey(nested)) return true;
  }
  return false;
}
{
  const states = [
    ["mid-onboarding (file absent)", fixtureDir("gate-absent"), null],
    ["setup complete", fixtureDir("gate-complete"), `setup:\n  intent: "maintainer"\n`],
    ["unconfigured markers", fixtureDir("gate-default"), `setup:\n  intent: "${DEFAULT_SETUP_INTENT}"\n`],
  ];
  for (const [label, rootDir, content] of states) {
    if (content !== null) writeRaw(join(rootDir, "pipeline.user.yaml"), content);
    const { status, stdout } = runCli(rootDir);
    ok(`(d) ${label}: exit status stays 0 (never blocks)`, status === 0, String(status));
    const payload = stdout.trim() === "" ? null : JSON.parse(stdout);
    ok(`(d) ${label}: emitted payload carries no blocking/gating key`, !carriesBlockingKey(payload));
    const { observation } = decideFromProjectDir(rootDir);
    ok(
      `(d) ${label}: the hook never claims authority over readiness`,
      observation === null || (observation.authoritative === false && observation.blocking === false),
    );
  }
}

// ---- cleanup + summary -----------------------------------------------------------------
try {
  rmSync(WORKDIR, { recursive: true, force: true });
} catch {
  // best-effort cleanup; leftover temp dirs never fail the suite
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
