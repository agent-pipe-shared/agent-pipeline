#!/usr/bin/env node
/**
 * setup.test.mjs — pure-function test suite for setup.mjs.
 *
 * Coverage contract (briefing DoD field 3, item 2): classifyOs, parseFirstRemoteUrl,
 * classifyGitHost, cliForHost, detectGitHost (injected fake spawn), applyAboPreset,
 * applyAutonomyPreset, normalizeLang, renderUserYaml (idempotent + byte-identical to the
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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  classifyOs,
  parseFirstRemoteUrl,
  classifyGitHost,
  cliForHost,
  detectGitHost,
  applyAboPreset,
  applyAutonomyPreset,
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
  parseArgv,
  resolveWarnDisposition,
} from "./setup.mjs";

const USER_YAML_PATH = fileURLToPath(new URL("./pipeline.user.yaml", import.meta.url));

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
// classifyOs
// ======================================================================================
ok("classifyOs: win32 -> windows", classifyOs("win32") === "windows");
ok("classifyOs: darwin -> macos", classifyOs("darwin") === "macos");
ok("classifyOs: linux -> linux", classifyOs("linux") === "linux");
ok("classifyOs: aix (other) -> other", classifyOs("aix") === "other");

// ======================================================================================
// parseFirstRemoteUrl
// ======================================================================================
ok(
  "parseFirstRemoteUrl: normal `git remote -v` output -> first URL",
  parseFirstRemoteUrl("origin\thttps://github.com/acme/widgets.git (fetch)\norigin\thttps://github.com/acme/widgets.git (push)\n") ===
    "https://github.com/acme/widgets.git",
);
ok("parseFirstRemoteUrl: empty string -> null", parseFirstRemoteUrl("") === null);
ok("parseFirstRemoteUrl: whitespace-only -> null", parseFirstRemoteUrl("   \n  \n") === null);
ok("parseFirstRemoteUrl: non-string input -> null", parseFirstRemoteUrl(null) === null);
ok("parseFirstRemoteUrl: undefined input -> null", parseFirstRemoteUrl(undefined) === null);

// ======================================================================================
// classifyGitHost
// ======================================================================================
ok("classifyGitHost: github.com URL -> github", classifyGitHost("https://github.com/acme/widgets.git") === "github");
ok("classifyGitHost: gitlab.com URL -> gitlab", classifyGitHost("https://gitlab.com/acme/widgets.git") === "gitlab");
ok(
  "classifyGitHost: self-hosted gitlab URL (host contains 'gitlab') -> gitlab",
  classifyGitHost("git@gitlab.example.com:acme/widgets.git") === "gitlab",
);
ok("classifyGitHost: unrecognized host -> null", classifyGitHost("https://bitbucket.org/acme/widgets.git") === null);
ok("classifyGitHost: empty string -> null", classifyGitHost("") === null);
ok("classifyGitHost: null -> null", classifyGitHost(null) === null);

// ======================================================================================
// cliForHost
// ======================================================================================
ok("cliForHost: gitlab -> glab", cliForHost("gitlab") === "glab");
ok("cliForHost: github -> gh", cliForHost("github") === "gh");

// ======================================================================================
// detectGitHost (injected fake spawn — no real git/gh/glab invocation)
// ======================================================================================
function fakeSpawn(byCommand) {
  return (command) => byCommand[command] ?? { status: 1, error: new Error(`not mocked: ${command}`), stdout: "" };
}

{
  const spawn = fakeSpawn({
    git: { status: 0, stdout: "origin\thttps://gitlab.com/acme/widgets.git (fetch)\n" },
  });
  const host = detectGitHost("/fake/root", { spawn });
  ok("detectGitHost: remote is gitlab -> gitlab", host === "gitlab", host);
}
{
  const spawn = fakeSpawn({
    git: { status: 0, stdout: "origin\thttps://github.com/acme/widgets.git (fetch)\n" },
  });
  const host = detectGitHost("/fake/root", { spawn });
  ok("detectGitHost: remote is github -> github", host === "github", host);
}
{
  const spawn = fakeSpawn({
    git: { status: 0, stdout: "" }, // no remotes configured (fresh clone before P5's git init)
    gh: { status: 1, error: new Error("gh not found"), stdout: "" },
    glab: { status: 0, stdout: "glab version 1.2.3\n" },
  });
  const host = detectGitHost("/fake/root", { spawn });
  ok("detectGitHost: no remote, glab-only on PATH -> gitlab", host === "gitlab", host);
}
{
  const spawn = fakeSpawn({
    git: { status: 0, stdout: "" },
    gh: { status: 1, error: new Error("gh not found"), stdout: "" },
    glab: { status: 1, error: new Error("glab not found"), stdout: "" },
  });
  const host = detectGitHost("/fake/root", { spawn });
  ok("detectGitHost: no remote, neither CLI on PATH -> github (conservative default)", host === "github", host);
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
    "applyAboPreset max: worktypes.design is opus/high (design_phase) + opus/max (execution_phase)",
    p.worktypes.design.design_phase.model === "opus" &&
      p.worktypes.design.design_phase.effort === "high" &&
      p.worktypes.design.execution_phase.model === "opus" &&
      p.worktypes.design.execution_phase.effort === "max",
    JSON.stringify(p.worktypes.design),
  );
  ok("applyAboPreset max: worktypes.mini.advisor is opus", p.worktypes.mini.advisor === "opus");
  ok("applyAboPreset max: models.deep is sonnet/xhigh (MP-27 3-tier completeness)", p.models.deep.model === "sonnet" && p.models.deep.effort === "xhigh");
  ok(
    "applyAboPreset max: matches buildDefaultAnswers() worktypes + models",
    JSON.stringify(p.worktypes) === JSON.stringify(buildDefaultAnswers().worktypes) && JSON.stringify(p.models) === JSON.stringify(buildDefaultAnswers().models),
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
  const customized = {
    ...buildDefaultAnswers(),
    identity: { owner_name: "Jane Doe", repo_owner: "janedoe", repo_name: "my-fork", commit_trailer: false },
    platform: { git_host: "gitlab", cli: "glab" },
  };
  const text = renderUserYaml(customized);
  ok("renderUserYaml: reflects customized identity fields", text.includes('owner_name: "Jane Doe"') && text.includes('repo_owner: "janedoe"'));
  ok("renderUserYaml: reflects customized platform fields", text.includes("git_host: gitlab") && text.includes("cli: glab"));
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
  const partial = { identity: { owner_name: "Custom Name" }, autonomy: { push_policy: "standing-approved" } };
  const merged = answersFromParsed(partial, defaults);
  ok("answersFromParsed: partial merge overrides only the given identity field", merged.identity.owner_name === "Custom Name");
  ok("answersFromParsed: partial merge keeps other identity fields from defaults", merged.identity.repo_owner === defaults.identity.repo_owner);
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
// compileSettingsJson — github branch shape AND gitlab branch (source: url fix)
// ======================================================================================
{
  const answers = { ...buildDefaultAnswers(), identity: { ...buildDefaultAnswers().identity, repo_owner: "acme", repo_name: "widgets" } };
  const settings = compileSettingsJson(null, answers, "hash123");
  const source = settings.extraKnownMarketplaces["agent-pipeline"].source;
  ok("compileSettingsJson github: source.source is 'github'", source.source === "github", JSON.stringify(source));
  ok("compileSettingsJson github: repo is owner/name", source.repo === "acme/widgets", JSON.stringify(source));
  ok("compileSettingsJson github: no leftover 'url' key", source.url === undefined);
  ok("compileSettingsJson: no existing state -> synthesizes statusLine/permissions/enabledPlugins", settings.statusLine && settings.permissions && settings.enabledPlugins);
  ok("compileSettingsJson: $generated marker embeds the sourceHash", settings.$generated.includes("hash123"), settings.$generated);
}
{
  const answers = {
    ...buildDefaultAnswers(),
    identity: { ...buildDefaultAnswers().identity, repo_owner: "acme", repo_name: "widgets" },
    platform: { git_host: "gitlab", cli: "glab" },
  };
  const settings = compileSettingsJson(null, answers, "hash456");
  const source = settings.extraKnownMarketplaces["agent-pipeline"].source;
  ok("compileSettingsJson gitlab (bug fix): source.source is 'url', NOT 'git'", source.source === "url", JSON.stringify(source));
  ok("compileSettingsJson gitlab: url ends with '.git'", typeof source.url === "string" && source.url.endsWith(".git"), source.url);
  ok("compileSettingsJson gitlab: url embeds owner/repo", source.url.includes("acme/widgets.git"), source.url);
  ok("compileSettingsJson gitlab: url defaults to the gitlab.com host", source.url.startsWith("https://gitlab.com/"), source.url);
  ok("compileSettingsJson gitlab: no leftover 'repo' key (github-shape only)", source.repo === undefined);
}
{
  // existing settings.json preserved byte-faithfully outside the compiled fields (see file
  // header "COMPILE MODEL"); extraKnownMarketplaces merges rather than replaces siblings.
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
  ok("compileSettingsJson: still writes/updates the agent-pipeline marketplace entry", !!settings.extraKnownMarketplaces["agent-pipeline"]);
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
    "renderPipelineYaml: elephant model-routing mirrors worktypes.feature.execution_phase (representative value)",
    /elephant:\s*\n(?:.*\n)*?\s*model: opus\s*\n\s*effort: high/.test(yaml),
    yaml,
  );
  ok("renderPipelineYaml: elephant carries a note pointing to pipeline.user.yaml -> worktypes", /elephant:[\s\S]*?note:.*worktypes/.test(yaml));
  ok(
    "renderPipelineYaml: goldfish model-routing mirrors models.implement",
    /goldfish:\s*\n\s*model: sonnet\s*\n\s*effort: medium/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: goldfish_mechanic mirrors models.mechanic",
    /goldfish_mechanic:\s*\n\s*model: sonnet\s*\n\s*effort: low/.test(yaml),
    yaml,
  );
  ok(
    "renderPipelineYaml: goldfish_deep mirrors models.deep (MP-27 3-tier completeness)",
    /goldfish_deep:\s*\n\s*model: sonnet\s*\n\s*effort: xhigh/.test(yaml),
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

// ---- summary ----------------------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
