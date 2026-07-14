#!/usr/bin/env node
/**
 * setup.test.mjs — pure-function test suite for setup.mjs.
 *
 * Coverage contract (briefing DoD field 3, item 2): applyAboPreset, applyAutonomyPreset,
 * normalizeLang, renderUserYaml (idempotent + byte-identical to the
 * committed pipeline.user.yaml for buildDefaultAnswers()), answersFromParsed, shortHash,
 * generatedMarker/extractRecordedHash round-trip, decideCompileAction (all six branches),
 * compileSettingsJson (github shape + gitlab "source: url" fix), compilePipelineJson,
 * renderPipelineYaml, parseArgv (--defaults/--force/--yes/--help flag parsing),
 * resolveWarnDisposition (the --force/--yes hand-edit-drift override, all three branches).
 *
 * Every function under test here is a PURE builder/classifier (setup.mjs's own header:
 * "I/O happens in the caller") — none of them touch the filesystem, so no OS tmpdir is
 * needed for this suite. This test file never reads/writes this repo's real .claude/
 * configs or pipeline.user.yaml (read-only comparison against the committed
 * pipeline.user.yaml for the byte-identity check only).
 *
 * Run:   node setup.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "./plugins/pipeline-core/lib/yaml-lite.mjs";
import { validateAgainstSchema } from "./plugins/pipeline-core/lib/schema-lite.mjs";

import {
  applyAboPreset,
  applyAutonomyPreset,
  resolveRoutingAnswers,
  normalizeLang,
  buildDefaultAnswers,
  renderUserYaml,
  answersFromParsed,
  shortHash,
  generatedMarker,
  extractRecordedHash,
  decideCompileAction,
  compileSettingsJson,
  compilePipelineJson,
  renderPipelineYaml,
  validateCompiledPipelineYaml,
  validateSharedLock,
  parseArgv,
  resolveWarnDisposition,
  run,
} from "./setup.mjs";

const USER_YAML_PATH = fileURLToPath(new URL("./pipeline.user.yaml", import.meta.url));
const THREE_SCOPE_FIXTURES_PATH = fileURLToPath(new URL("./templates/three-scope-fixtures.md", import.meta.url));
const PLUGINS_PATH = fileURLToPath(new URL("./plugins", import.meta.url));

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

// ======================================================================================
// generated runtime manifest preflight — canonical schema + semantic authority
// ======================================================================================
{
  const result = validateCompiledPipelineYaml(renderPipelineYaml(buildDefaultAnswers(), "preflight-ok"));
  ok("validateCompiledPipelineYaml: generated default projection passes canonical validation", result.status === "ok", JSON.stringify(result.errors));
}
{
  const root = mkdtempSync(join(tmpdir(), "setup-overlay-missing-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  symlinkSync(PLUGINS_PATH, join(root, "plugins"), "dir");
  const sentinels = new Map([
    [join(root, "pipeline.user.yaml"), "source-before\n"],
    [join(root, ".claude", "settings.json"), "settings-before\n"],
    [join(root, ".claude", "pipeline.json"), "pipeline-before\n"],
    [join(root, ".claude", "pipeline.yaml"), "manifest-before\n"],
  ]);
  for (const [path, content] of sentinels) writeFileSync(path, content);
  const code = await run(["--defaults"], {
    rootDir: root,
    spawn: () => ({ status: 0, stdout: `${"a".repeat(40)}\n` }),
  });
  const unchanged = [...sentinels].every(([path, content]) => readFileSync(path, "utf8") === content);
  ok("run: missing private-overlay fails before source or runtime mutation byte-identically", code === 1 && unchanged);
  rmSync(root, { recursive: true, force: true });
}
{
  const root = mkdtempSync(join(tmpdir(), "setup-overlay-real-idempotent-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  symlinkSync(PLUGINS_PATH, join(root, "plugins"), "dir");
  const sha = "a".repeat(40);
  mkdirSync(join(root, ".pipeline"), { recursive: true });
  writeFileSync(join(root, ".pipeline", "private-overlay.yaml"), `shared:\n  sha: ${sha}\n`);
  // This deliberately malformed local-only mapping proves setup consumes neither local
  // coordinates nor a second configuration source; only the anonymous overlay lock is read.
  writeFileSync(join(root, ".pipeline", "machine-local.yaml"), "local: [not parsed by setup\n");
  const deps = {
    rootDir: root,
    spawn: (command, args) =>
      command === "git" && args[0] === "rev-parse" ? { status: 0, stdout: `${sha}\n` } : { status: 1, stdout: "" },
  };
  const first = await run(["--defaults"], deps);
  const outputs = ["pipeline.user.yaml", ".claude/settings.json", ".claude/pipeline.json", ".claude/pipeline.yaml"];
  const firstBytes = outputs.map((path) => readFileSync(join(root, path), "utf8"));
  const second = await run(["--defaults"], deps);
  const secondBytes = outputs.map((path) => readFileSync(join(root, path), "utf8"));
  ok("run: matching real private-overlay plus synthetic git HEAD permits deterministic setup", first === 0);
  ok("run: matching real overlay rerun is idempotent without reading machine-local mapping", second === 0 && JSON.stringify(firstBytes) === JSON.stringify(secondBytes));
  rmSync(root, { recursive: true, force: true });
}

// ======================================================================================
// private overlay lock — exact immutable SHA and fail-closed before mutation
// ======================================================================================
{
  const sha = "a".repeat(40);
  ok("validateSharedLock: exact 40-hex lock matches checked-out Public Core", validateSharedLock(sha, sha).ok === true);
  ok("validateSharedLock: missing lock fails closed", validateSharedLock(undefined, sha).reason === "missing-or-malformed-shared-sha");
  ok("validateSharedLock: abbreviated lock fails closed", validateSharedLock("a".repeat(12), sha).reason === "missing-or-malformed-shared-sha");
  ok("validateSharedLock: mismatch fails before mutation", validateSharedLock(sha, "b".repeat(40)).reason === "shared-sha-mismatch");
}
{
  const fixtures = readFileSync(THREE_SCOPE_FIXTURES_PATH, "utf8");
  ok("three-scope fixtures: consumer has no overlay and therefore safe-stops", fixtures.includes("Consumer") && fixtures.includes("must fail before mutation"));
  ok("three-scope fixtures: maintainer lock is anonymous full 40-hex", fixtures.includes(`sha: ${"a".repeat(40)}`));
  ok("three-scope fixtures: ignored mapping is never a setup projection", fixtures.includes("setup never reads or projects the mapping"));
}

{
  const root = mkdtempSync(join(tmpdir(), "setup-preflight-no-write-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  const sentinels = new Map([
    [join(root, "pipeline.user.yaml"), "existing-user-source\n"],
    [join(root, ".claude", "settings.json"), "existing-settings\n"],
    [join(root, ".claude", "pipeline.json"), "existing-pipeline-json\n"],
    [join(root, ".claude", "pipeline.yaml"), "existing-pipeline-yaml\n"],
  ]);
  for (const [path, content] of sentinels) writeFileSync(path, content);
  const code = await run(["--defaults"], { rootDir: root, renderPipelineYamlFn: () => "schema: wrong.schema\n" });
  const unchanged = [...sentinels].every(([path, content]) => existsSync(path) && readFileSync(path, "utf8") === content);
  ok("run: invalid generated manifest exits 1 and leaves source plus all runtime targets byte-identical", code === 1 && unchanged);
  rmSync(root, { recursive: true, force: true });
}
{
  const answers = {
    ...buildDefaultAnswers(),
    release: {
      environments: {
        prod: { adapter: "missing-adapter", healthcheck: "check", rollback: "rollback", promotion: "human-gate" },
      },
      adapters: {},
    },
  };
  const result = validateCompiledPipelineYaml(renderPipelineYaml(answers, "preflight-invalid"));
  ok(
    "validateCompiledPipelineYaml: semantic release error is rejected before compiler writes",
    result.status === "invalid" && result.errors.some((error) => error.path === "release.environments.prod.adapter"),
    JSON.stringify(result.errors),
  );
}

// ======================================================================================
// applyAboPreset
// ======================================================================================
{
  const p = applyAboPreset("pro");
  ok(
    "applyAboPreset pro: worktypes.design is sonnet (no opus)",
    p.worktypes.design.design_phase.model === "sonnet" && p.worktypes.design.execution_phase.model === "sonnet",
    JSON.stringify(p.worktypes.design),
  );
  ok(
    "applyAboPreset pro: worktypes.feature.advisor stays off",
    p.worktypes.feature.advisor === "off",
  );
  ok(
    "applyAboPreset pro: worktypes.mini.advisor is sonnet (no bigger model available)",
    p.worktypes.mini.advisor === "sonnet",
  );
  ok("applyAboPreset pro: models.implement sonnet/medium", p.models.implement.model === "sonnet" && p.models.implement.effort === "medium");
  ok("applyAboPreset pro: models.deep sonnet/xhigh", p.models.deep.model === "sonnet" && p.models.deep.effort === "xhigh");
}
{
  const p = applyAboPreset("max");
  ok(
    "applyAboPreset max: worktypes.design is opus/high (design_phase) + opus/high (execution_phase, 2026-07-10 routing revision: no more effort:max in execution_phase)",
    p.worktypes.design.design_phase.model === "opus" &&
      p.worktypes.design.design_phase.effort === "high" &&
      p.worktypes.design.execution_phase.model === "opus" &&
      p.worktypes.design.execution_phase.effort === "high",
    JSON.stringify(p.worktypes.design),
  );
  ok(
    "applyAboPreset max: worktypes.feature.execution_phase is sonnet/high (2026-07-10 routing revision)",
    p.worktypes.feature.execution_phase.model === "sonnet" && p.worktypes.feature.execution_phase.effort === "high",
    JSON.stringify(p.worktypes.feature.execution_phase),
  );
  ok("applyAboPreset max: worktypes.feature.advisor is opus (2026-07-10 routing revision)", p.worktypes.feature.advisor === "opus");
  ok("applyAboPreset max: worktypes.mini.advisor is opus", p.worktypes.mini.advisor === "opus");
  ok(
    "applyAboPreset max: worktypes.mini execution_phase/design_phase are both high (no leftover max)",
    p.worktypes.mini.design_phase.effort === "high" && p.worktypes.mini.execution_phase.effort === "high",
  );
  ok("applyAboPreset max: models.deep is sonnet/xhigh (MP-27 3-tier completeness, models UNCHANGED)", p.models.deep.model === "sonnet" && p.models.deep.effort === "xhigh");
  ok(
    "applyAboPreset max: matches buildDefaultAnswers() worktypes + models",
    JSON.stringify(p.worktypes) === JSON.stringify(buildDefaultAnswers().worktypes) && JSON.stringify(p.models) === JSON.stringify(buildDefaultAnswers().models),
  );
}
{
  const p = applyAboPreset("pro");
  ok(
    "applyAboPreset pro: execution_phase effort is high everywhere (2026-07-10 routing revision, no more max)",
    p.worktypes.design.execution_phase.effort === "high" &&
      p.worktypes.feature.execution_phase.effort === "high" &&
      p.worktypes.mini.execution_phase.effort === "high",
    JSON.stringify({ design: p.worktypes.design.execution_phase, feature: p.worktypes.feature.execution_phase, mini: p.worktypes.mini.execution_phase }),
  );
}
{
  const p = applyAboPreset("api");
  ok(
    "applyAboPreset api/eigene fallback: shares the max preset (opus/high design)",
    p.worktypes.design.design_phase.model === "opus" && p.worktypes.design.design_phase.effort === "high",
  );
}
{
  const p = applyAboPreset("something-unrecognized");
  ok(
    "applyAboPreset unrecognized tier: falls back to the max preset",
    p.worktypes.design.design_phase.model === "opus" && p.worktypes.design.design_phase.effort === "high",
  );
}

// ======================================================================================
// applyAutonomyPreset
// ======================================================================================
{
  const a = applyAutonomyPreset("konservativ");
  ok(
    "applyAutonomyPreset konservativ: gated / feature-branch",
    a.push_policy === "gated" && a.branch_model === "feature-branch" && a.wip_limit === 1,
    JSON.stringify(a),
  );
}
{
  const a = applyAutonomyPreset("autonom");
  ok(
    "applyAutonomyPreset autonom: standing-approved / direct-main",
    a.push_policy === "standing-approved" && a.branch_model === "direct-main" && a.wip_limit === 1,
    JSON.stringify(a),
  );
}
{
  const a = applyAutonomyPreset("Autonomous");
  ok("applyAutonomyPreset case/prefix-insensitive ('Autonomous') -> autonom branch", a.push_policy === "standing-approved");
}
{
  const a = applyAutonomyPreset(undefined);
  ok("applyAutonomyPreset undefined -> conservative default", a.push_policy === "gated");
}

// ======================================================================================
// resolveRoutingAnswers -- re-run safety (Critic finding #2): pressing Enter on a re-run
// must NEVER clobber an existing personalized worktypes/models/autonomy with the generic
// preset. See setup.mjs's own JSDoc above resolveRoutingAnswers for the full rationale.
// ======================================================================================
{
  const previous = {
    worktypes: {
      design: { design_phase: { model: "opus", effort: "high" }, execution_phase: { model: "opus", effort: "high" }, advisor: "off" },
      feature: { design_phase: { model: "sonnet", effort: "high" }, execution_phase: { model: "sonnet", effort: "high" }, advisor: "sonnet" },
      mini: { design_phase: { model: "sonnet", effort: "high" }, execution_phase: { model: "sonnet", effort: "high" }, advisor: "sonnet" },
    },
    models: {
      implement: { model: "haiku", effort: "medium" },
      mechanic: { model: "haiku", effort: "low" },
      deep: { model: "sonnet", effort: "xhigh" },
      review: { model: "sonnet", effort: "high" },
    },
    autonomy: { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 1 },
  };
  const resolved = resolveRoutingAnswers("", "", previous);
  ok(
    "resolveRoutingAnswers: empty tier answer KEEPS the existing personalized worktypes (no clobber by the generic preset -- Critic finding #2)",
    JSON.stringify(resolved.worktypes) === JSON.stringify(previous.worktypes),
    JSON.stringify(resolved.worktypes),
  );
  ok(
    "resolveRoutingAnswers: empty tier answer KEEPS the existing personalized models",
    JSON.stringify(resolved.models) === JSON.stringify(previous.models),
  );
  ok(
    "resolveRoutingAnswers: empty autonomy answer KEEPS the existing personalized autonomy",
    JSON.stringify(resolved.autonomy) === JSON.stringify(previous.autonomy),
  );
}
{
  const previous = buildDefaultAnswers();
  const resolved = resolveRoutingAnswers("pro", "autonomous", previous);
  ok(
    "resolveRoutingAnswers: explicit tier answer ('pro') applies the fresh preset, overriding previous (deliberate override)",
    JSON.stringify(resolved.worktypes.design) === JSON.stringify(applyAboPreset("pro").worktypes.design),
  );
  ok(
    "resolveRoutingAnswers: explicit autonomy answer ('autonomous') applies standing-approved/direct-main",
    resolved.autonomy.push_policy === "standing-approved" && resolved.autonomy.branch_model === "direct-main",
  );
  ok(
    "resolveRoutingAnswers: explicit autonomous preset nudges feature.advisor to opus",
    resolved.worktypes.feature.advisor === "opus",
  );
}
{
  // Mutation safety: the autonomous feature.advisor nudge must not mutate the caller's
  // `previous` object (relevant when worktypes came from the "keep" branch).
  const previous = buildDefaultAnswers();
  const before = JSON.stringify(previous.worktypes);
  const resolved = resolveRoutingAnswers("", "autonomous", previous);
  ok(
    "resolveRoutingAnswers: does not mutate the caller's `previous.worktypes` object",
    JSON.stringify(previous.worktypes) === before,
  );
  ok("resolveRoutingAnswers: returned worktypes DOES carry the nudge", resolved.worktypes.feature.advisor === "opus");
}
{
  // A fresh install (no existing pipeline.user.yaml) -> previous === buildDefaultAnswers(),
  // which equals applyAboPreset("max") (see the "matches buildDefaultAnswers()" test above)
  // -- so keeping on empty answers is a behaviour no-op for first-time setup.
  const previous = buildDefaultAnswers();
  const resolved = resolveRoutingAnswers("", "", previous);
  ok(
    "resolveRoutingAnswers: fresh install (defaults as previous) + empty answers == applyAboPreset('max') (no-op vs. old behaviour)",
    JSON.stringify(resolved.worktypes) === JSON.stringify(applyAboPreset("max").worktypes) &&
      JSON.stringify(resolved.models) === JSON.stringify(applyAboPreset("max").models),
  );
}

// ======================================================================================
// normalizeLang
// ======================================================================================
ok("normalizeLang: 'en' -> en", normalizeLang("en") === "en");
ok("normalizeLang: 'de' -> de", normalizeLang("de") === "de");
ok("normalizeLang: anything else -> de (conservative default)", normalizeLang("fr") === "de");
ok("normalizeLang: undefined -> de", normalizeLang(undefined) === "de");

// ======================================================================================
// renderUserYaml — idempotency + byte-identity to the committed pipeline.user.yaml
// ======================================================================================
{
  const defaults = buildDefaultAnswers();
  const first = renderUserYaml(defaults);
  const second = renderUserYaml(defaults);
  ok("renderUserYaml: idempotent (same answers -> byte-identical text twice)", first === second);

  const committed = readFileSync(USER_YAML_PATH, "utf8");
  ok(
    "renderUserYaml(buildDefaultAnswers()) is byte-identical to the committed pipeline.user.yaml template",
    first === committed,
    first === committed ? undefined : `lengths: rendered=${first.length} committed=${committed.length}`,
  );
}
{
  const customized = { ...buildDefaultAnswers(), setup: { intent: "maintainer" } };
  const text = renderUserYaml(customized);
  ok("renderUserYaml: reflects customized public setup intent", text.includes("intent: maintainer"));
  ok("renderUserYaml: never renders identity or platform coordinates", !text.includes("identity:") && !text.includes("platform:"));
}
{
  // worktypes rendering: "off" quotes as a string sentinel, a model name renders bare.
  const withAdvisorSet = {
    ...buildDefaultAnswers(),
    worktypes: { ...buildDefaultAnswers().worktypes, feature: { ...buildDefaultAnswers().worktypes.feature, advisor: "opus" } },
  };
  const text = renderUserYaml(withAdvisorSet);
  ok("renderUserYaml: worktypes block present, above models", text.indexOf("worktypes:") > -1 && text.indexOf("worktypes:") < text.indexOf("models:"));
  ok("renderUserYaml: worktypes.design.advisor renders as quoted \"off\"", text.includes('advisor: "off"'));
  ok("renderUserYaml: worktypes.feature.advisor reflects an assigned model name (bare, unquoted)", text.includes("advisor: opus") && !text.includes('advisor: "opus"'));
  ok("renderUserYaml: models block carries the new deep tier", text.includes("deep:") && text.includes("effort: xhigh"));
  ok("renderUserYaml: models block no longer carries design/advisor", !/^\s{2}design:/m.test(text.slice(text.indexOf("\nmodels:"))));
}
{
  // release: static commented starter example (ADR-0033/0034) -- always present, entirely
  // commented out (matches the existing "Advanced/autonomous example" convention in this same
  // function), so it never changes parsed behavior regardless of `answers`.
  const text = renderUserYaml(buildDefaultAnswers());
  ok("renderUserYaml: carries the commented release: starter example", text.includes("# release:"));
  ok("renderUserYaml: release starter is placed after gates:, before the Advanced/autonomous example", text.indexOf("gates:") < text.indexOf("# release:") && text.indexOf("# release:") < text.indexOf("Advanced/autonomous example"));
  ok("renderUserYaml: no LIVE (uncommented) release: key -- stays inert by default", !/^release:/m.test(text));
}

// ======================================================================================
// answersFromParsed
// ======================================================================================
{
  const defaults = buildDefaultAnswers();
  ok("answersFromParsed: null parsed -> defaults", JSON.stringify(answersFromParsed(null, defaults)) === JSON.stringify(defaults));
  ok(
    "answersFromParsed: non-object parsed -> defaults",
    JSON.stringify(answersFromParsed("not an object", defaults)) === JSON.stringify(defaults),
  );
}
{
  const defaults = buildDefaultAnswers();
  const partial = { setup: { intent: "maintainer" }, autonomy: { push_policy: "standing-approved" } };
  const merged = answersFromParsed(partial, defaults);
  ok("answersFromParsed: partial merge overrides public setup intent", merged.setup.intent === "maintainer");
  ok("answersFromParsed: partial merge overrides autonomy.push_policy", merged.autonomy.push_policy === "standing-approved");
  ok("answersFromParsed: partial merge keeps autonomy.branch_model from defaults", merged.autonomy.branch_model === defaults.autonomy.branch_model);
  ok("answersFromParsed: untouched top-level blocks (language) stay at defaults", JSON.stringify(merged.language) === JSON.stringify(defaults.language));
}
{
  const defaults = buildDefaultAnswers();
  const partial = {
    worktypes: { feature: { advisor: "opus" } },
    models: { deep: { effort: "max" } },
  };
  const merged = answersFromParsed(partial, defaults);
  ok("answersFromParsed: partial worktypes.feature.advisor override applied", merged.worktypes.feature.advisor === "opus");
  ok(
    "answersFromParsed: worktypes.feature.design_phase/execution_phase kept from defaults (partial worktype object)",
    JSON.stringify(merged.worktypes.feature.design_phase) === JSON.stringify(defaults.worktypes.feature.design_phase),
  );
  ok("answersFromParsed: untouched worktypes (design, mini) stay at defaults", JSON.stringify(merged.worktypes.design) === JSON.stringify(defaults.worktypes.design) && JSON.stringify(merged.worktypes.mini) === JSON.stringify(defaults.worktypes.mini));
  ok("answersFromParsed: partial models.deep.effort override applied", merged.models.deep.effort === "max");
  ok("answersFromParsed: models.deep.model kept from defaults (partial tier object)", merged.models.deep.model === defaults.models.deep.model);
  ok("answersFromParsed: untouched models tiers (implement, mechanic, review) stay at defaults", JSON.stringify(merged.models.implement) === JSON.stringify(defaults.models.implement));
}
{
  // release: OPTIONAL passthrough only (ADR-0033/0034 anti-bloat guarantee) -- no default shape
  // exists to merge over, so absence must stay absence, never a synthesized empty object.
  const defaults = buildDefaultAnswers();
  ok("answersFromParsed: no release key in parsed -> no release key in result", !("release" in answersFromParsed({}, defaults)));
  ok("answersFromParsed: buildDefaultAnswers() itself carries no release key", !("release" in defaults));
  const withRelease = { release: { environments: { test: { adapter: "a", healthcheck: "h", rollback: "r" } } } };
  const merged = answersFromParsed(withRelease, defaults);
  ok("answersFromParsed: a present release section is threaded through unchanged", JSON.stringify(merged.release) === JSON.stringify(withRelease.release));
  ok("answersFromParsed: a non-object release is dropped, not passed through", !("release" in answersFromParsed({ release: "not an object" }, defaults)));
}

// ======================================================================================
// shortHash — determinism
// ======================================================================================
{
  const h1 = shortHash("hello world");
  const h2 = shortHash("hello world");
  const h3 = shortHash("hello world!");
  ok("shortHash: deterministic (same input -> same hash)", h1 === h2, `${h1} vs ${h2}`);
  ok("shortHash: different input -> different hash", h1 !== h3);
  ok("shortHash: 16 hex chars", /^[0-9a-f]{16}$/.test(h1), h1);
}

// ======================================================================================
// generatedMarker / extractRecordedHash — round-trip
// ======================================================================================
{
  const hash = shortHash("some source text");
  const marker = generatedMarker(hash);
  ok("generatedMarker: embeds the sourceHash", marker.includes(`sourceHash: ${hash}`), marker);
  const roundTripped = extractRecordedHash(`// ${marker}\n{"a": 1}`);
  ok("extractRecordedHash: round-trips the embedded hash", roundTripped === hash, roundTripped);
}
ok("extractRecordedHash: no marker present -> null", extractRecordedHash('{"a": 1}') === null);
ok("extractRecordedHash: non-string input -> null", extractRecordedHash(null) === null);

// ======================================================================================
// decideCompileAction — all six branches
// ======================================================================================
{
  const d = decideCompileAction({ existsOnDisk: false, parsedOk: true, existingRaw: null, wantedText: "x", recordedHash: null, currentSourceHash: "h1" });
  ok("decideCompileAction: file absent -> write/initial", d.action === "write" && d.reason === "initial", JSON.stringify(d));
}
{
  const d = decideCompileAction({
    existsOnDisk: true,
    parsedOk: false,
    existingRaw: "{ not valid json",
    wantedText: "x",
    recordedHash: null,
    currentSourceHash: "h1",
  });
  ok("decideCompileAction: exists but unparseable -> warn/unparseable", d.action === "warn" && d.reason === "unparseable", JSON.stringify(d));
}
{
  const d = decideCompileAction({ existsOnDisk: true, parsedOk: true, existingRaw: "same-text", wantedText: "same-text", recordedHash: "h1", currentSourceHash: "h1" });
  ok("decideCompileAction: existing bytes == wanted bytes -> skip/up-to-date", d.action === "skip" && d.reason === "up-to-date", JSON.stringify(d));
}
{
  // Committed baseline: exists, parses, differs from wanted, but carries NO recorded hash
  // at all (i.e. never compiled before) -> overwrite freely, this is the pre-setup template.
  const d = decideCompileAction({
    existsOnDisk: true,
    parsedOk: true,
    existingRaw: "committed-baseline-text",
    wantedText: "newly-compiled-text",
    recordedHash: null,
    currentSourceHash: "h1",
  });
  ok("decideCompileAction: committed baseline (no recorded hash) -> write/baseline", d.action === "write" && d.reason === "baseline", JSON.stringify(d));
}
{
  // Source changed: recorded hash present but differs from the CURRENT source hash -> normal recompile.
  const d = decideCompileAction({
    existsOnDisk: true,
    parsedOk: true,
    existingRaw: "old-compiled-text",
    wantedText: "new-compiled-text",
    recordedHash: "h-old",
    currentSourceHash: "h-new",
  });
  ok("decideCompileAction: recorded hash != current source hash -> write/source-changed", d.action === "write" && d.reason === "source-changed", JSON.stringify(d));
}
{
  // Drift: recorded hash == current source hash (source unchanged since last compile), yet the
  // file's bytes differ from what would be regenerated -> someone hand-edited the compiled file.
  const d = decideCompileAction({
    existsOnDisk: true,
    parsedOk: true,
    existingRaw: "hand-edited-text",
    wantedText: "regenerated-text",
    recordedHash: "h1",
    currentSourceHash: "h1",
  });
  ok("decideCompileAction: recorded hash == current hash but bytes differ -> warn/drift", d.action === "warn" && d.reason === "drift", JSON.stringify(d));
}

// ======================================================================================
// resolveWarnDisposition — the --force/--yes override for decideCompileAction's "warn" branch
// ======================================================================================
ok(
  "resolveWarnDisposition: force + interactive -> write-forced (skips the confirm prompt)",
  resolveWarnDisposition({ force: true, interactive: true }) === "write-forced",
);
ok(
  "resolveWarnDisposition: force + non-interactive -> write-forced (allows the otherwise-refused clobber)",
  resolveWarnDisposition({ force: true, interactive: false }) === "write-forced",
);
ok(
  "resolveWarnDisposition: no force + interactive -> prompt (unchanged existing behaviour)",
  resolveWarnDisposition({ force: false, interactive: true }) === "prompt",
);
ok(
  "resolveWarnDisposition: no force + non-interactive -> refuse (still never silently clobbers a hand-edit)",
  resolveWarnDisposition({ force: false, interactive: false }) === "refuse",
);

// ======================================================================================
// parseArgv — flag parsing, including the new --force/--yes flags
// ======================================================================================
{
  const opts = parseArgv([]);
  ok("parseArgv: no flags -> defaults=false, force=false, help=false", !opts.defaults && !opts.force && !opts.help, JSON.stringify(opts));
}
ok("parseArgv: --force -> force=true", parseArgv(["--force"]).force === true);
ok("parseArgv: --yes -> force=true (alias)", parseArgv(["--yes"]).force === true);
ok("parseArgv: --defaults --force -> both true", (() => {
  const o = parseArgv(["--defaults", "--force"]);
  return o.defaults === true && o.force === true;
})());
ok("parseArgv: --defaults alone -> force stays false", parseArgv(["--defaults"]).force === false);

// ======================================================================================
// compileSettingsJson — public projection carries only the generic marketplace binding
// ======================================================================================
{
  const settings = compileSettingsJson(null, buildDefaultAnswers(), "hash123");
  ok(
    "compileSettingsJson: projects the generic agent-pipeline marketplace mapping",
    settings.extraKnownMarketplaces?.["agent-pipeline"]?.source?.repo === "agent-pipeline/agent-pipeline",
    JSON.stringify(settings.extraKnownMarketplaces),
  );
  ok("compileSettingsJson: no existing state -> synthesizes statusLine/enabledPlugins", settings.statusLine && settings.enabledPlugins);
  ok(
    "compileSettingsJson: gated (default) push_policy -> NO permissions key (ADR-0017 no bleed-over)",
    settings.permissions === undefined,
    JSON.stringify(settings.permissions),
  );
  ok("compileSettingsJson: $generated marker embeds the sourceHash", settings.$generated.includes("hash123"), settings.$generated);
}
{
  // standing-approved push_policy -> synthesized settings.json DOES grant prompt-less git
  // push*, mirroring the same condition renderPipelineYaml() uses (briefing fix, 2026-07-11).
  const answers = {
    ...buildDefaultAnswers(),
    autonomy: { ...buildDefaultAnswers().autonomy, push_policy: "standing-approved" },
  };
  const settings = compileSettingsJson(null, answers, "hash123-standing");
  ok(
    "compileSettingsJson: standing-approved push_policy -> permissions.allow contains both git push* entries",
    Array.isArray(settings.permissions?.allow) &&
      settings.permissions.allow.includes("Bash(git push*)") &&
      settings.permissions.allow.includes("PowerShell(git push*)"),
    JSON.stringify(settings.permissions),
  );
  ok("compileSettingsJson: standing-approved -> statusLine/enabledPlugins still present", settings.statusLine && settings.enabledPlugins);
}
{
  // Existing settings.json is preserved outside the compiled fields; the generic pipeline
  // marketplace projection merges rather than replacing siblings.
  const existing = {
    statusLine: { type: "command", command: "custom-status-line.mjs" },
    someUnrelatedField: "preserved",
    extraKnownMarketplaces: { "other-plugin": { source: { source: "github", repo: "other/repo" } } },
  };
  const answers = buildDefaultAnswers();
  const settings = compileSettingsJson(existing, answers, "hash789");
  ok("compileSettingsJson: preserves unrelated existing top-level fields", settings.someUnrelatedField === "preserved");
  ok("compileSettingsJson: preserves the caller's own statusLine untouched", settings.statusLine.command === "custom-status-line.mjs");
  ok("compileSettingsJson: preserves a pre-existing sibling marketplace entry", !!settings.extraKnownMarketplaces["other-plugin"]);
  ok(
    "compileSettingsJson: replaces a legacy agent-pipeline mapping with the generic binding",
    settings.extraKnownMarketplaces["agent-pipeline"]?.source?.repo === "agent-pipeline/agent-pipeline",
    JSON.stringify(settings.extraKnownMarketplaces["agent-pipeline"]),
  );
}

// ======================================================================================
// compilePipelineJson
// ======================================================================================
{
  const answers = { ...buildDefaultAnswers(), autonomy: { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 2 }, gates: { ...buildDefaultAnswers().gates, claude_md_max_lines: 250 } };
  const pj = compilePipelineJson(null, answers, "hashABC");
  ok("compilePipelineJson: no existing state -> synthesizes project/verify/handover", pj.project && pj.verify && pj.handover);
  ok("compilePipelineJson: autonomy field mirrors answers.autonomy.push_policy", pj.autonomy === "standing-approved", pj.autonomy);
  ok("compilePipelineJson: branchModel mirrors answers.autonomy.branch_model", pj.branchModel === "direct-main", pj.branchModel);
  ok("compilePipelineJson: wipLimit mirrors answers.autonomy.wip_limit", pj.wipLimit === 2, pj.wipLimit);
  ok("compilePipelineJson: claudeMdMaxLines mirrors answers.gates.claude_md_max_lines", pj.claudeMdMaxLines === 250, pj.claudeMdMaxLines);
  ok("compilePipelineJson: $generated marker embeds the sourceHash", pj.$generated.includes("hashABC"), pj.$generated);
}
{
  const existing = { project: "existing-project-name", customField: "kept", constraints: ["already there"] };
  const answers = buildDefaultAnswers();
  const pj = compilePipelineJson(existing, answers, "hashDEF");
  ok("compilePipelineJson: preserves existing unrelated fields (project, customField, constraints)", pj.project === "existing-project-name" && pj.customField === "kept");
  ok("compilePipelineJson: overwrites autonomy/branchModel/wipLimit/claudeMdMaxLines from answers regardless", pj.autonomy === answers.autonomy.push_policy);
}

// ======================================================================================
// renderPipelineYaml — contains model-routing + gate values from answers
// ======================================================================================
{
  const answers = {
    ...buildDefaultAnswers(),
    worktypes: {
      ...buildDefaultAnswers().worktypes,
      feature: { design_phase: { model: "opus", effort: "max" }, execution_phase: { model: "opus", effort: "high" }, advisor: "off" },
    },
    models: {
      implement: { model: "sonnet", effort: "medium" },
      mechanic: { model: "sonnet", effort: "low" },
      deep: { model: "sonnet", effort: "xhigh" },
      review: { model: "haiku", effort: "high" },
    },
    gates: { dev_plan: "warn", push: "blocking", security: "off", claude_md_max_lines: 200 },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
  };
  const yaml = renderPipelineYaml(answers, "hashGHI");
  ok(
    "renderPipelineYaml: full feature execution route mirrors worktypes.feature.execution_phase",
    /elephant_feature_execution:\s*\n\s*model: opus\s*\n\s*effort: high/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: all six profile-phase routes are projected",
    (yaml.match(/^  elephant_(?:design|feature|mini)_(?:design|execution):$/gm) ?? []).length === 6,
  );
  ok(
    "renderPipelineYaml: goldfish model-routing mirrors models.implement",
    /goldfish:\s*\n\s*model: sonnet-5\s*\n\s*effort: medium/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: goldfish_mechanic mirrors models.mechanic",
    /goldfish_mechanic:\s*\n\s*model: sonnet-5\s*\n\s*effort: low/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: goldfish_deep mirrors models.deep (MP-27 3-tier completeness)",
    /goldfish_deep:\s*\n\s*model: sonnet-5\s*\n\s*effort: xhigh/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: critic model-routing mirrors models.review",
    /critic:\s*\n\s*model: haiku\s*\n\s*effort: high/.test(yaml),
    yaml,
  );
  ok("renderPipelineYaml: dev-plan gate mode mirrors gates.dev_plan", yaml.includes("mode: warn"));
  ok("renderPipelineYaml: security gate mode mirrors gates.security", /security:\s*\n\s*mode: off/.test(yaml), yaml);
  ok("renderPipelineYaml: push approval is 'required' when push_policy is gated", yaml.includes("approval: required"));
  ok("renderPipelineYaml: sourceHash embedded in the GENERATED header comment", yaml.includes("hashGHI"));
}
{
  const answers = { ...buildDefaultAnswers(), autonomy: { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 1 } };
  const yaml = renderPipelineYaml(answers, "hashJKL");
  ok("renderPipelineYaml: push approval is 'standing-approved' when push_policy is standing-approved", yaml.includes("approval: standing-approved"));
}

// ======================================================================================
// renderPipelineYaml — release: section is CONDITIONAL on answers.release (ADR-0033/0034
// anti-bloat guarantee: absent release = zero new behavior in the compiled manifest)
// ======================================================================================
{
  const yaml = renderPipelineYaml(buildDefaultAnswers(), "hashNoRelease");
  ok("renderPipelineYaml: no answers.release -> compiled manifest carries NO release: section at all", !yaml.includes("release:"));
}
{
  const answers = {
    ...buildDefaultAnswers(),
    release: {
      environments: {
        test: { adapter: "vercel-preview", healthcheck: "cmd-test", rollback: "proc-test" },
        prod: { adapter: "vercel-prod", healthcheck: "cmd-prod", rollback: "proc-prod", promotion: "human-gate" },
      },
      adapters: {
        "vercel-preview": { executor: "ci", deploy: "wf-preview", credentials: "oidc" },
        "vercel-prod": { executor: "ci", trigger: { refs: ["refs/tags/v*"] }, deploy: "wf-prod", credentials: "oidc" },
      },
    },
  };
  const yaml = renderPipelineYaml(answers, "hashWithRelease");
  ok("renderPipelineYaml: a present answers.release DOES render a release: section", yaml.includes("\nrelease:"));
  ok("renderPipelineYaml: release.environments.test.adapter present", /environments:\s*\n\s*test:\s*\n\s*adapter: vercel-preview/.test(yaml), yaml);
  ok("renderPipelineYaml: release.environments.prod.promotion present (human-gate)", /prod:[\s\S]*?promotion: human-gate/.test(yaml), yaml);
  ok("renderPipelineYaml: release.adapters.vercel-prod.trigger.refs rendered as a YAML list item", /refs:\s*\n\s*- refs\/tags\/v\*/.test(yaml), yaml);
  ok("renderPipelineYaml: release.adapters credentials rendered (never inline secret values, SEC-08)", /credentials: oidc/.test(yaml));

  const reparsed = parseYaml(yaml);
  ok("renderPipelineYaml: compiled release: section re-parses via yaml-lite back to the same shape", JSON.stringify(reparsed.release) === JSON.stringify(answers.release));
  const manifestSchema = JSON.parse(readFileSync(new URL("./plugins/pipeline-core/scripts/pipeline-manifest.schema.json", import.meta.url), "utf8"));
  const { valid, errors } = validateAgainstSchema(reparsed.release, manifestSchema.properties.release);
  ok("renderPipelineYaml: compiled release: section validates against pipeline-manifest.schema.json's release shape", valid, errors.join("; "));
}

// ---- summary ----------------------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
