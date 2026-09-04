#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * stop-suggest.test.mjs — test suite for the Stop-hook next-step suggester
 * (stop-suggest.mjs, task AP1-P5 "OIN").
 *
 * Coverage contract (briefing DoD case classes):
 *   - no manifest (loadManifestSafe -> null, absent file) -> silent
 *   - manifest invalid (loadManifestSafe -> null, schema/semantic violation) -> silent
 *   - no state file -> silent
 *   - no activeFeature -> silent
 *   - malformed state JSON -> silent
 *   - mid-phase -> correct next suggestion (exact English message asserted)
 *   - disabled phase skipped (never appears as "next")
 *   - condition-false phase (has_ui:false) skipped
 *   - has_ui:true includes ui-design
 *   - last phase -> completion message
 *   - planApproved:false entering implementation -> mentions missing approval
 *   - unknown mode string -> no crash
 *   - subprocess smoke (real script spawn, fixture cwd, exit 0 + JSON shape)
 *
 * Test strategy (mirrors staleness-check.test.mjs): the pure resolver functions
 * (`loadStateSafe`, `resolveSuggestion`, `decideOutput`) are imported directly and exercised
 * with plain constructed manifest/state objects (or, for the file-reading paths, tiny
 * fixture files) - no real repo state is read except in the two "real manifest.mjs
 * integration" cases (absent/invalid manifest via the real `loadManifestSafe`) and the final
 * subprocess smoke. `run()` / the full CLI is additionally verified by spawning the real
 * script as a subprocess with `CLAUDE_PROJECT_DIR` pointed at a fixture repo root (existing
 * repo convention, see guard-git.test.mjs / staleness-check.test.mjs).
 *
 * REMOVED (this task, 2026-09-04, NVA-B-NOCOMPACT-1): the staged context-budget tiering
 * (warn/overdue/block, nag-cap, soft-nudge ladder, usage-staleness warning, re-arm, and the
 * write-then-emit persistence guard around `decision:"block"`) is gone from stop-suggest.mjs;
 * every case that pinned it is deleted below, not left red. What survives from the G-B
 * extension is the suggestion-dedup feature (now scoped to just the phase-suggestion
 * fingerprint) plus a regression sweep proving the hook never again emits anything
 * context-related, at any usage level, even when a legacy statusline usage file is present.
 *
 * Run:   node plugins/pipeline-core/hooks/stop-suggest.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifestSafe } from "../lib/manifest.mjs";
import {
  PHASE_GATE_MAP,
  loadCloseCoordinatorSafe,
  loadStateSafe,
  resolveSuggestion,
  decideOutput,
  resolveSessionIdFromInput,
  markerPath,
  loadMarkerSafe,
  writeMarkerSafe,
  decideDedupedOutput,
} from "./stop-suggest.mjs";
import {
  createCloseCoordinator,
  storeCloseCoordinator,
} from "../scripts/publication-close-journal.mjs";

const SCRIPT = fileURLToPath(new URL("./stop-suggest.mjs", import.meta.url));

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

const WORKDIR = mkdtempSync(join(tmpdir(), "stop-suggest-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
function writeRaw(path, text) {
  writeFileSync(path, text);
}

// ---- fixture manifest builder (plain JS objects, bypasses the YAML/schema layer on
// purpose - manifest.mjs's own suite already covers that layer; here we only need
// activePhases()/gateConfig()-shaped input) --------------------------------------------------
function manifestFixture({ uiEnabled = true, hasUi = false, secScanEnabled = true, secMode = "blocking", devPlanMode = "blocking", pushMode = "blocking", profile = "full-sdlc" } = {}) {
  return {
    schema: "pipeline.manifest.v0",
    phases: [
      { name: "design", enabled: true },
      { name: "implementation", enabled: true },
      { name: "security-scan", enabled: secScanEnabled },
      { name: "ui-design", enabled: uiEnabled, condition: "has_ui" },
    ],
    gates: {
      "dev-plan": { mode: devPlanMode, type: "human" },
      push: { mode: pushMode, type: "human" },
      security: { mode: secMode, type: "automated" },
    },
    profiles: {
      active: profile,
      [profile]: { phases: ["design", "implementation", "security-scan", "ui-design"] },
    },
    flags: { has_ui: hasUi },
  };
}

function stateFixture(phase, extra = {}) {
  return { schema: "pipeline.state.v0", activeFeature: { id: "F1", phase, ...extra } };
}

// ======================================================================================
// PHASE_GATE_MAP sanity
// ======================================================================================
ok("PHASE_GATE_MAP maps implementation -> dev-plan gate, no command", PHASE_GATE_MAP.implementation.gate === "dev-plan" && PHASE_GATE_MAP.implementation.command === null);
ok(
  "PHASE_GATE_MAP maps security-scan -> security gate + scan command",
  PHASE_GATE_MAP["security-scan"].gate === "security" && PHASE_GATE_MAP["security-scan"].command === "node plugins/pipeline-core/scripts/security-scan.mjs",
);

// ======================================================================================
// no manifest / manifest invalid -> silent (real manifest.mjs integration)
// ======================================================================================
{
  const rootDir = fixtureDir("manifest-absent");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  // .claude/pipeline.yaml intentionally NOT written.
  const manifest = loadManifestSafe(rootDir);
  ok("loadManifestSafe returns null when the manifest file is absent", manifest === null);
  const { stdout } = decideOutput(manifest, stateFixture("implementation"));
  ok("decideOutput: no manifest -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("manifest-invalid");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(join(rootDir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\nphases:\n  - name: design\n    enabled: not-a-boolean\n");
  const manifest = loadManifestSafe(rootDir);
  ok("loadManifestSafe returns null for a schema-invalid manifest", manifest === null);
  const { stdout } = decideOutput(manifest, stateFixture("implementation"));
  ok("decideOutput: invalid manifest -> silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// no state file / malformed state JSON -> silent
// ======================================================================================
{
  const state = loadStateSafe(join(WORKDIR, "does-not-exist", "pipeline-state.json"));
  ok("loadStateSafe returns null when the state file is missing", state === null);
  const { stdout } = decideOutput(manifestFixture(), state);
  ok("decideOutput: no state file -> silent (empty stdout)", stdout === "", stdout);
}

{
  const dir = fixtureDir("state-malformed");
  const statePath = join(dir, "pipeline-state.json");
  writeRaw(statePath, "{ this is not valid JSON ][");
  const state = loadStateSafe(statePath);
  ok("loadStateSafe returns null on malformed JSON", state === null);
  const { stdout } = decideOutput(manifestFixture(), state);
  ok("decideOutput: malformed state -> silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// no activeFeature -> silent
// ======================================================================================
{
  const state = { schema: "pipeline.state.v0" };
  const message = resolveSuggestion(manifestFixture(), state);
  ok("resolveSuggestion: no activeFeature -> null (silent)", message === null, message);
}

{
  const message = resolveSuggestion(manifestFixture(), { schema: "pipeline.state.v0", activeFeature: { id: "F1" } });
  ok("resolveSuggestion: activeFeature without phase -> null (silent)", message === null, message);
}

// ======================================================================================
// unknown / inactive phase -> silent
// ======================================================================================
{
  const message = resolveSuggestion(manifestFixture(), stateFixture("does-not-exist"));
  ok("resolveSuggestion: phase not in active-phase list -> null (silent)", message === null, message);
}

// ======================================================================================
// mid-phase -> correct next suggestion (exact English message)
// ======================================================================================
{
  const manifest = manifestFixture({ secMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("implementation"));
  const expected = 'Pipeline: phase "implementation" active → next step: "security-scan" (Gate: security, mode: blocking). Check: node plugins/pipeline-core/scripts/security-scan.mjs';
  ok("resolveSuggestion: implementation -> security-scan exact English message", message === expected, message);
}

// ======================================================================================
// disabled phase skipped (security-scan disabled -> never the "next" phase)
// ======================================================================================
{
  const manifest = manifestFixture({ secScanEnabled: false, hasUi: false });
  const message = resolveSuggestion(manifest, stateFixture("implementation"));
  ok("resolveSuggestion: disabled security-scan is skipped -> no mention of it", message !== null && !message.includes("security-scan"), message);
  ok("resolveSuggestion: disabled security-scan skipped -> implementation becomes the last active phase (completion message)", message !== null && message.includes("push gate"), message);
}

// ======================================================================================
// condition-false phase (has_ui:false) skipped
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: false });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  ok("resolveSuggestion: has_ui false -> ui-design skipped, security-scan is the last active phase", message !== null && message.includes("push gate") && !message.includes("ui-design"), message);
}

// ======================================================================================
// has_ui:true includes ui-design
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: true });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  ok("resolveSuggestion: has_ui true -> next phase after security-scan is ui-design", message === 'Pipeline: phase "security-scan" active → next step: "ui-design".', message);
}

// ======================================================================================
// last phase -> completion message
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: false, secScanEnabled: true, pushMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  const expected = 'Pipeline: all phases of profile "full-sdlc" complete — push gate (mode: blocking) is the last step.';
  ok("resolveSuggestion: last active phase -> exact completion message", message === expected, message);
}

// ======================================================================================
// planApproved:false entering implementation -> mentions missing approval
// ======================================================================================
{
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design", { planApproved: false }));
  ok("resolveSuggestion: planApproved false -> message mentions the missing approval", message !== null && message.includes("planApproved") && message.includes("missing"), message);
  ok("resolveSuggestion: planApproved false -> gate clause names dev-plan", message.includes("Gate: dev-plan"), message);
}

{
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design", { planApproved: true }));
  ok("resolveSuggestion: planApproved true -> no missing-approval hint", message !== null && !message.includes("missing"), message);
}

{
  // planApproved entirely absent (not just false) must be treated the same as false.
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design"));
  ok("resolveSuggestion: planApproved absent -> treated as not approved (mentions missing approval)", message.includes("missing"), message);
}

// ======================================================================================
// unknown mode string -> no crash
// ======================================================================================
{
  const manifest = manifestFixture({ secMode: "supervised" }); // not in the blocking|warn|off enum
  let message = null;
  let threw = false;
  try {
    message = resolveSuggestion(manifest, stateFixture("implementation"));
  } catch {
    threw = true;
  }
  ok("resolveSuggestion: unrecognized gate mode string does not throw", threw === false);
  ok("resolveSuggestion: unrecognized gate mode string is echoed verbatim", message !== null && message.includes("mode: supervised"), message);
}

{
  // Gate referenced by PHASE_GATE_MAP but entirely absent from manifest.gates.
  const manifest = manifestFixture();
  delete manifest.gates.security;
  let threw = false;
  let message = null;
  try {
    message = resolveSuggestion(manifest, stateFixture("implementation"));
  } catch {
    threw = true;
  }
  ok("resolveSuggestion: gate missing from manifest.gates does not throw", threw === false);
  ok("resolveSuggestion: gate missing from manifest.gates falls back to 'unknown' mode", message !== null && message.includes("mode: unknown"), message);
}

// ======================================================================================
// subprocess smoke (real script spawn, fixture repo root, exit 0 + JSON shape)
// ======================================================================================
function runCli(fakeProjectDir) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: fakeProjectDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

{
  const rootDir = fixtureDir("smoke-suggestion");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(
    join(rootDir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "",
    ].join("\n"),
  );
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), stateFixture("implementation"));

  const { status, stdout, stderr } = runCli(rootDir);
  ok("CLI smoke (suggestion case): exit 0", status === 0, `status=${status} stderr=${stderr}`);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* leave null, asserted below */
  }
  ok("CLI smoke (suggestion case): stdout is valid JSON", parsed !== null, stdout);
  ok("CLI smoke (suggestion case): systemMessage present", typeof parsed?.systemMessage === "string" && parsed.systemMessage.length > 0, stdout);
  ok("CLI smoke (suggestion case): systemMessage names security-scan", parsed?.systemMessage?.includes("security-scan") === true, stdout);
  ok("CLI smoke (suggestion case): hookSpecificOutput.hookEventName is Stop", parsed?.hookSpecificOutput?.hookEventName === "Stop");
  ok(
    "CLI smoke (suggestion case): additionalContext mirrors systemMessage",
    parsed?.hookSpecificOutput?.additionalContext === parsed?.systemMessage,
  );
}

{
  // No manifest at all in this fixture root -> silent CLI, still exit 0.
  const rootDir = fixtureDir("smoke-silent");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  const { status, stdout, stderr } = runCli(rootDir);
  ok("CLI smoke (no manifest): exit 0", status === 0, `status=${status} stderr=${stderr}`);
  ok("CLI smoke (no manifest): empty stdout (silent)", stdout === "", stdout);
}

// ==========================================================================================
// DEDUP EXTENSION (`.claude/plans/2026-07-07-retro-speed.md` package G-B, kept): a fingerprint
// of the resolved phase-suggestion text is persisted per session so an unchanged suggestion
// does not re-fire chatter on every turn. Everything above this marker is the ORIGINAL
// pre-dedup suite (unmodified) -- the 35 cases must all still pass, proving the phase-
// suggestion contract stayed byte-compatible.
//
// REMOVED (this task, 2026-09-04, NVA-B-NOCOMPACT-1): every case that used to pin the staged
// context-budget tiering (warn/overdue/block), the nag-cap, the window-independent soft-nudge
// ladder, the usage-staleness warning, the re-arm step, or the write-then-emit persistence
// guard around `decision:"block"` -- all of that mechanism is gone from stop-suggest.mjs (see
// its header). What remains below is the surviving dedup feature (now scoped to just the
// phase-suggestion fingerprint; `consecutiveBlocks`/`lastEmittedTotalTokens` dropped from the
// marker shape) plus a regression sweep proving the hook never again emits anything
// context-related, at any usedPct the old ladder used to react to, even when a legacy
// statusline usage file is still present on disk.
// ==========================================================================================

// ---- resolveSessionIdFromInput (pure) ---------------------------------------------------
ok("resolveSessionIdFromInput: valid {session_id} -> the string", resolveSessionIdFromInput({ session_id: "sess-1" }) === "sess-1");
ok("resolveSessionIdFromInput: null input -> null", resolveSessionIdFromInput(null) === null);
ok("resolveSessionIdFromInput: object without session_id -> null", resolveSessionIdFromInput({}) === null);
ok("resolveSessionIdFromInput: empty-string session_id -> null", resolveSessionIdFromInput({ session_id: "" }) === null);
ok("resolveSessionIdFromInput: non-string session_id -> null", resolveSessionIdFromInput({ session_id: 123 }) === null);

// ---- markerPath / loadMarkerSafe / writeMarkerSafe --------------------------------------
{
  const rootDir = fixtureDir("marker-path");
  ok(
    "markerPath: builds .claude/.stop-suggest-<session_id>.json under rootDir",
    markerPath(rootDir, "sess-1") === join(rootDir, ".claude", ".stop-suggest-sess-1.json"),
  );
}
{
  const marker = loadMarkerSafe(join(WORKDIR, "marker-absent", ".claude", ".stop-suggest-none.json"));
  ok("loadMarkerSafe: missing file -> null", marker === null);
}
{
  const dir = fixtureDir("marker-roundtrip");
  const p = join(dir, ".claude", ".stop-suggest-sess-1.json");
  const wrote = writeMarkerSafe(p, { lastFingerprint: "foo" });
  ok("writeMarkerSafe: reports success", wrote === true);
  const readBack = loadMarkerSafe(p);
  ok(
    "writeMarkerSafe + loadMarkerSafe: round-trips the marker shape",
    readBack !== null && readBack.lastFingerprint === "foo",
    JSON.stringify(readBack),
  );
}
{
  // ".claude" exists as a FILE (not a directory) -> writeFileSync must fail (ENOTDIR) ->
  // writeMarkerSafe fails closed (returns false), never throws.
  const dir = fixtureDir("marker-unwritable");
  writeRaw(join(dir, ".claude"), "not a directory");
  const p = join(dir, ".claude", ".stop-suggest-sess-1.json");
  let threw = false;
  let wrote = null;
  try {
    wrote = writeMarkerSafe(p, { lastFingerprint: "x" });
  } catch {
    threw = true;
  }
  ok("writeMarkerSafe: unwritable target never throws", threw === false);
  ok("writeMarkerSafe: unwritable target reports failure", wrote === false);
}

// ---- decideDedupedOutput (pure) -- the dedup decision core ------------------------------
{
  const { stdout, marker } = decideDedupedOutput({ phaseMessage: null, priorMarker: null });
  ok("decideDedupedOutput: nothing to say, no prior marker -> silent, marker null", stdout === "" && marker === null);
}
{
  const { stdout, marker } = decideDedupedOutput({
    phaseMessage: null,
    priorMarker: { lastFingerprint: "Pipeline: Phase X" },
  });
  ok(
    "decideDedupedOutput: nothing to say now, but a prior marker exists -> silent, fingerprint carried over unchanged",
    stdout === "" && marker !== null && marker.lastFingerprint === "Pipeline: Phase X",
    JSON.stringify(marker),
  );
}
{
  // First turn ever (no prior marker): a phase suggestion always emits.
  const { stdout, marker } = decideDedupedOutput({ phaseMessage: "Pipeline: Phase X", priorMarker: null });
  ok("decideDedupedOutput: first turn, phase message -> emits", stdout !== "" && stdout.includes("Pipeline: Phase X"), stdout);
  ok(
    "decideDedupedOutput: first turn -> marker fingerprint is the phase message",
    marker.lastFingerprint === "Pipeline: Phase X",
    JSON.stringify(marker),
  );
}
{
  // Second turn, IDENTICAL phase message as the prior marker -> dedup silences it.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X" };
  const { stdout, marker } = decideDedupedOutput({ phaseMessage: "Pipeline: Phase X", priorMarker });
  ok("decideDedupedOutput: identical phase message as last turn -> silent (dedup)", stdout === "", stdout);
  ok("decideDedupedOutput: dedup case still refreshes the marker (same fingerprint)", marker.lastFingerprint === priorMarker.lastFingerprint);
}
{
  // Phase message CHANGES (pipeline-state changed) -> re-emits despite an existing marker.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X" };
  const { stdout } = decideDedupedOutput({ phaseMessage: "Pipeline: Phase Y", priorMarker });
  ok("decideDedupedOutput: phase message change -> re-emits", stdout !== "" && stdout.includes("Pipeline: Phase Y"), stdout);
}
{
  // Payload shape: systemMessage + hookSpecificOutput mirror, no decision/reason field ever.
  const { stdout } = decideDedupedOutput({ phaseMessage: "Pipeline: Phase X", priorMarker: null });
  const parsed = JSON.parse(stdout);
  ok("decideDedupedOutput: payload has systemMessage", parsed.systemMessage === "Pipeline: Phase X");
  ok(
    "decideDedupedOutput: payload hookSpecificOutput mirrors systemMessage",
    parsed.hookSpecificOutput?.hookEventName === "Stop" && parsed.hookSpecificOutput?.additionalContext === "Pipeline: Phase X",
  );
  ok("decideDedupedOutput: payload NEVER carries a decision field", parsed.decision === undefined, stdout);
}

// ---- CLI end-to-end (real subprocess, real marker file on disk) ------------------------
function runCliWithStdin(fakeProjectDir, inputObj) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(inputObj),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: fakeProjectDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function writeGbFixture(rootDir, { phase = "implementation" } = {}) {
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(
    join(rootDir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "",
    ].join("\n"),
  );
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), stateFixture(phase));
}

{
  const rootDir = fixtureDir("cli-full-flow");
  writeGbFixture(rootDir);

  const r1 = runCliWithStdin(rootDir, { session_id: "sess-1" });
  ok("CLI: 1st turn exits 0", r1.status === 0, `stderr=${r1.stderr}`);
  ok("CLI: 1st turn emits the phase suggestion", r1.stdout.includes("security-scan"), r1.stdout);
  ok("CLI: 1st turn has no decision field", !r1.stdout.includes('"decision"'), r1.stdout);

  const r2 = runCliWithStdin(rootDir, { session_id: "sess-1" });
  ok("CLI: 2nd turn, unchanged state -> deduped to silence", r2.status === 0 && r2.stdout === "", `status=${r2.status} stdout=${r2.stdout}`);
}

{
  // No session_id resolvable (stdin has no session_id field) -> dedup structurally impossible
  // -> the hook ALWAYS emits (matches every pre-dedup smoke test's behavior).
  const rootDir = fixtureDir("cli-no-session-id");
  writeGbFixture(rootDir);
  const r1 = runCliWithStdin(rootDir, {});
  const r2 = runCliWithStdin(rootDir, {});
  ok("CLI: no session_id -> turn 1 emits", r1.stdout.includes("security-scan"), r1.stdout);
  ok("CLI: no session_id -> turn 2 (identical state) ALSO emits (no dedup possible)", r2.stdout.includes("security-scan"), r2.stdout);
  ok("CLI: no session_id -> both turns byte-identical (no marker to diverge on)", r1.stdout === r2.stdout, `r1=${r1.stdout} r2=${r2.stdout}`);
}

{
  // Malformed stdin entirely (not valid JSON) -> never crashes, degrades to "no session_id".
  const rootDir = fixtureDir("cli-malformed-stdin");
  writeGbFixture(rootDir);
  const res = spawnSync(process.execPath, [SCRIPT], { input: "{ not json at all ][", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir } });
  ok("CLI: malformed stdin -> exit 0 (never crashes)", res.status === 0, `stderr=${res.stderr}`);
  ok("CLI: malformed stdin -> phase suggestion still emitted (fail-open)", (res.stdout ?? "").includes("security-scan"), res.stdout);
}

// ==========================================================================================
// NO-CONTEXT-BUDGET REGRESSION SWEEP (this task, 2026-09-04, NVA-B-NOCOMPACT-1, AC-1/AC-2):
// a legacy `.claude/.usage-<session_id>.json` statusline snapshot -- the exact file the old
// tiering used to read -- is written at every usedPct the old ladder used to react to
// (including well above the old 85% "block" floor). The hook must never read it: no
// `decision` field, and no message substring that ever named context usage, a compaction
// demand, or the removed tiers, at ANY of these usage levels. Established by RUNNING the real
// CLI subprocess, not by reading the source.
// ==========================================================================================
{
  const forbiddenSubstrings = ["/compact", "compact", "EMERGENCY", "mandatory", "Mandatory", "OVERDUE", "overdue", "Context "];
  const usagePoints = [25, 50, 60, 75, 85, 90, 100];
  for (const [i, usedPct] of usagePoints.entries()) {
    const rootDir = fixtureDir(`sweep-no-context-${i}`);
    writeGbFixture(rootDir);
    mkdirSync(join(rootDir, ".claude"), { recursive: true });
    const sessionId = `sess-sweep-${i}`;
    writeJson(join(rootDir, ".claude", `.usage-${sessionId}.json`), {
      usedPct,
      totalTokens: usedPct * 10000,
      updatedAt: new Date().toISOString(),
    });
    const r = runCliWithStdin(rootDir, { session_id: sessionId });
    ok(`sweep no-context (usedPct ${usedPct}): exits 0`, r.status === 0, `stderr=${r.stderr}`);
    ok(`sweep no-context (usedPct ${usedPct}): NO decision field`, !r.stdout.includes('"decision"'), r.stdout);
    for (const needle of forbiddenSubstrings) {
      ok(`sweep no-context (usedPct ${usedPct}): stdout never contains "${needle}"`, !r.stdout.includes(needle), r.stdout);
    }
    ok(`sweep no-context (usedPct ${usedPct}): phase suggestion still present (surviving feature untouched)`, r.stdout.includes("security-scan"), r.stdout);
  }
}
{
  // Same sweep with NO phase suggestion available (unknown phase) -- isolates the case where
  // the hook would previously have emitted a STANDALONE context clause with nothing else to
  // say. Must now be fully silent at every usage level, including the old block floor.
  const forbiddenSubstrings = ["/compact", "EMERGENCY", "mandatory", "OVERDUE", "overdue", "Context "];
  const usagePoints = [85, 100];
  for (const [i, usedPct] of usagePoints.entries()) {
    const rootDir = fixtureDir(`sweep-no-context-standalone-${i}`);
    writeGbFixture(rootDir, { phase: "does-not-exist" });
    const sessionId = `sess-sweep-standalone-${i}`;
    writeJson(join(rootDir, ".claude", `.usage-${sessionId}.json`), {
      usedPct,
      totalTokens: usedPct * 10000,
      updatedAt: new Date().toISOString(),
    });
    const r = runCliWithStdin(rootDir, { session_id: sessionId });
    ok(`sweep standalone (usedPct ${usedPct}): exits 0`, r.status === 0, `stderr=${r.stderr}`);
    ok(`sweep standalone (usedPct ${usedPct}): fully silent (no phase, no context, tier gone)`, r.stdout === "", r.stdout);
    for (const needle of forbiddenSubstrings) {
      ok(`sweep standalone (usedPct ${usedPct}): stdout never contains "${needle}"`, !r.stdout.includes(needle), r.stdout);
    }
  }
}
{
  // A stale usage file (the old staleness feature's exact trigger) is also inert now.
  const rootDir = fixtureDir("sweep-stale-usage-inert");
  writeGbFixture(rootDir);
  const sessionId = "sess-stale-inert";
  const staleUpdatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h old
  writeJson(join(rootDir, ".claude", `.usage-${sessionId}.json`), { usedPct: 90, totalTokens: 900000, updatedAt: staleUpdatedAt });
  const r = runCliWithStdin(rootDir, { session_id: sessionId });
  ok("sweep stale usage: exits 0", r.status === 0, `stderr=${r.stderr}`);
  ok("sweep stale usage: no 'stale' wording at all (feature removed)", !r.stdout.includes("stale"), r.stdout);
  ok("sweep stale usage: phase suggestion still present", r.stdout.includes("security-scan"), r.stdout);
}
{
  // Malformed usage file -> was already fail-open before; still fail-open (harmlessly unread) now.
  const rootDir = fixtureDir("sweep-usage-malformed");
  writeGbFixture(rootDir);
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(join(rootDir, ".claude", ".usage-sess-malformed.json"), "{ not json ][");
  const r = runCliWithStdin(rootDir, { session_id: "sess-malformed" });
  ok("sweep usage malformed: exits 0", r.status === 0, `stderr=${r.stderr}`);
  ok("sweep usage malformed: no decision field", !r.stdout.includes('"decision"'), r.stdout);
  ok("sweep usage malformed: phase suggestion still present", r.stdout.includes("security-scan"), r.stdout);
}

// ---- cleanup + summary -----------------------------------------------------------------
try {
  rmSync(WORKDIR, { recursive: true, force: true });
} catch {
  // best-effort cleanup; leftover temp dirs never fail the suite
}

{
  const root = fixtureDir("h5-private-coordinator");
  mkdirSync(join(root, ".git"), { recursive: true });
  const coordinator = createCloseCoordinator({
    lifecycleId: "close-f1",
    featureId: "F1",
    activeFeature: { id: "F1", planPath: "specs/f1/prd.md", phase: "implementation" },
    authority: {
      implementationResultSha256: null,
      pipelineStateSha256: "1".repeat(64),
      planSha256: "2".repeat(64),
      prdSha256: "3".repeat(64),
      specSha256: "4".repeat(64),
    },
  });
  storeCloseCoordinator({
    gitCommonDir: join(root, ".git"),
    coordinator,
    expectedRawSha256: null,
  });
  const discovered = loadCloseCoordinatorSafe(root, stateFixture("implementation"));
  ok("H5 Stop discovery reads the exact private coordinator", discovered?.lifecycleId === "close-f1");
  const message = resolveSuggestion(manifestFixture(), stateFixture("implementation"), discovered);
  ok("H5 Stop discovery names the durable next transition", message?.includes("checkpointed"), message);
  const forgedProjection = resolveSuggestion(
    manifestFixture(),
    stateFixture("implementation", { coordinatorPhase: "closed-local" }),
  );
  ok("H5 project State cannot forge a terminal coordinator phase", forgedProjection?.includes("security-scan"), forgedProjection);
}

{
  const coordinatorSuggestion = resolveSuggestion(
    manifestFixture(),
    stateFixture("implementation"),
    { phase: "candidate-frozen" },
  );
  ok("coordinator phase names exact next transition", coordinatorSuggestion.includes("final-verify-green"));
  const terminalSuggestion = resolveSuggestion(
    manifestFixture(),
    stateFixture("implementation"),
    { phase: "closed-local" },
  );
  ok("coordinator terminal is silent", terminalSuggestion === null);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
