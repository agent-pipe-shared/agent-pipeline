#!/usr/bin/env node
/**
 * setup.mjs — the Shareable Edition's personalization compiler.
 *
 * Turns the ONE source-of-intent config (`pipeline.user.yaml`) into the three
 * runtime-canonical configs this repo already ships and reads at every session
 * (`.claude/settings.json`, `.claude/pipeline.json`, `.claude/pipeline.yaml`) — see
 * the PRD §5/§5a/§6/§7 (Config-Schichtenmodell: user.yaml = source of intent,
 * this script = compiler, the three existing files stay runtime-canonical; no hook/skill
 * ever reads pipeline.user.yaml directly — zero code change to the guard/gate mechanics).
 *
 * DEPENDENCY-FREE (pure Node >=24, no npm packages): imports only Node builtins plus the
 * two EXISTING plugin libs this repo already ships for exactly this purpose
 * (plugins/pipeline-core/lib/yaml-lite.mjs, .../schema-lite.mjs) — briefing instruction
 * "use -- NO new dependency".
 *
 * WHY BLOCK-STYLE YAML, NOT THE PRD's FLOW-STYLE EXAMPLE (deviation, documented once here
 * -- see also pipeline.user.yaml's own header): the PRD §5 schema sketch writes
 * `models: { design: { model: opus, effort: high } }` (inline flow-style maps). yaml-lite
 * LOUDLY REJECTS flow-style collections (only empty `[]`/`{}` are supported -- see that
 * file's header "Flow collections beyond the empty literals ... THROWS"). Since the
 * briefing requires validating pipeline.user.yaml through the EXISTING yaml-lite/
 * schema-lite libs (no new dependency, no library extension), this script emits and reads
 * the semantically identical BLOCK-style form (`design:` on its own line, `model:`/
 * `effort:` nested two spaces under it) everywhere the PRD sketch used flow-style. Field
 * names, nesting, and values are unchanged -- only the flow/block YAML surface syntax
 * differs.
 *
 * COMPILE MODEL (JSON vs. YAML asymmetry, documented once): the two JSON targets
 * (settings.json, pipeline.json) are read-modify-write -- JSON.parse/JSON.stringify round-
 * trip cleanly, so every field NOT driven by pipeline.user.yaml (statusLine, permissions,
 * project, verify, handover, stakes, constraints, ritualExtensions, ...) is preserved
 * byte-faithfully. The YAML target (pipeline.yaml) is fully REGENERATED from a fixed
 * template on every compile -- yaml-lite.mjs ships no serializer (parse-only by design,
 * see its header), and pipeline.yaml's own manifest schema is closed
 * (`additionalProperties: false` at every level touched here — pipeline-manifest.schema.
 * json) so a fixed, from-scratch template is both simpler and safer than hand-rolling a
 * generic YAML dumper as a NEW library capability out of this briefing's scope.
 *
 * DRIFT DETECTION (PRD §5a "GENERATED header ... WARN on drift, overwrite only after
 * confirmation"): every compiled file gets a `GENERATED from pipeline.user.yaml ...
 * (sourceHash: <hash>)` marker embedding a short hash of the pipeline.user.yaml text that
 * produced it ($generated key for the two JSON files; a YAML comment line for
 * pipeline.yaml). On the next run, `decideCompileAction()` compares: no marker found on an
 * existing file -> this is the pre-setup COMMITTED BASELINE, not drift, overwrite freely;
 * marker's recorded hash != the CURRENT pipeline.user.yaml's hash -> the source changed,
 * a normal recompile, overwrite freely; marker's recorded hash == current hash BUT the
 * file's bytes differ from what would be regenerated -> someone hand-edited the COMPILED
 * file without touching pipeline.user.yaml -> WARN, overwrite only after an explicit y/
 * yes/j/ja confirmation (interactive mode) or never (non-interactive `--defaults`, fail-
 * safe: a script with no human to ask must never silently clobber a hand-edit) -- UNLESS
 * `--force`/`--yes` was passed: interactive mode then skips the confirmation prompt and
 * non-interactive mode is allowed to overwrite too (still with a loud WARN either way --
 * `--force` changes who decides, never whether the clobber is announced).
 *
 * GITLAB MARKETPLACE BINDING (bug fix): Claude Code has NO `git`
 * marketplace source type -- the authoritative shape (verified against the official Claude
 * Code docs) is `{ source: "url", url: "<full .git URL>" }`, which works for ANY git host,
 * including self-hosted GitLab (the earlier, WRONG shape compileSettingsJson used to emit --
 * a nonexistent "git" marketplace source type -- is fixed here). SELF-HOSTED GITLAB HOST
 * (design latitude,
 * decided BOUNDED-scope-safe): the `url` branch below still hardcodes `gitlab.com` rather than
 * threading the actually-detected remote host through `answers.platform` into
 * compileSettingsJson. Considered and rejected: `detectGitHost()`'s return contract (plain
 * "github"|"gitlab" strings) is exercised by fixed test cases in this file's own test suite
 * (remote-gitlab -> "gitlab", remote-github -> "github", etc.) -- widening it to also carry the
 * raw remote host would touch that locked contract, and the extra field would need to reach
 * BOTH the interactive (`promptAnswers`) and `--defaults` (`run()`) entry points without a
 * `pipeline.user.schema.json` change (that schema's `platform` object is
 * `additionalProperties: false`, so persisting the real host in `pipeline.user.yaml` itself
 * is out — an ephemeral, unpersisted field would need new plumbing through both paths for a
 * self-hosted-only edge case). That is exactly the "expands scope" case named in this wave's
 * briefing, so the safe fallback applies instead: keep `gitlab.com` as the default host and
 * document the manual override for self-hosted users (see the comment at the `url` branch
 * below and `pipeline.user.yaml`'s `platform:` section) -- they edit the generated
 * `.claude/settings.json` marketplace URL by hand after `node setup.mjs`.
 *
 * IDEMPOTENCY: `renderUserYaml(DEFAULT_ANSWERS)` is byte-identical to the committed
 * `pipeline.user.yaml` template shipped alongside this script (same static comments, same
 * default values) — so a first `--defaults` run against a pristine clone is already a
 * no-op diff, and a second `--defaults` run changes nothing (all three compile targets hit
 * the "up-to-date" branch of decideCompileAction, since pipeline.user.yaml itself did not
 * change between the two runs). See DoD "second run idempotent".
 *
 * DETECTION vs. QUESTIONS (PRD §6): OS + git-host + CLI are DETECTED (never asked) on
 * every run, in both interactive and `--defaults` mode; the five questions (runtime,
 * identity, language, subscription-tier model preset, autonomy preset) are asked only in
 * interactive mode and are replaced by DEFAULT_ANSWERS' values under `--defaults`.
 *
 * USAGE:
 *   node setup.mjs              interactive (readline prompts, pre-filled from any
 *                                existing pipeline.user.yaml -- re-run-safe)
 *   node setup.mjs --defaults   non-interactive: writes the conservative default
 *                                pipeline.user.yaml + compiles, no prompts (test/CI path)
 *   node setup.mjs --force      (or --yes) skips the hand-edit-drift confirmation instead of
 *                                asking (interactive) or refusing (non-interactive) -- see
 *                                "DRIFT DETECTION" above. Always prints a loud warning before
 *                                clobbering a hand-edited compiled file; combine with
 *                                --defaults for a fully unattended "just overwrite" run.
 *   node setup.mjs --help       usage text, exit 0
 *
 * VERIFY: node setup.test.mjs (pure-function coverage: detection/preset/render/drift
 * logic). NOT wired into harness/scripts/verify.mjs's TEST_SUITES list here -- that file
 * is TP-3-protected and wiring it is outside this briefing's delivery scope (out of scope,
 * flagged in the delivering briefing's report as an open item for a later wave).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { parseYaml, YamlLiteError } from "./plugins/pipeline-core/lib/yaml-lite.mjs";
import { validateAgainstSchema } from "./plugins/pipeline-core/lib/schema-lite.mjs";
import { validateManifest } from "./plugins/pipeline-core/lib/manifest.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = SCRIPT_DIR; // setup.mjs lives at the export root -- resolve relative
// to the SCRIPT's own location, not `process.cwd()`, so it stays correct no matter where the
// collegue invokes `node setup.mjs` from (PRD §6/§7: "runs anywhere").

const USER_YAML_PATH = join(ROOT_DIR, "pipeline.user.yaml");
const USER_SCHEMA_PATH = join(ROOT_DIR, "pipeline.user.schema.json");
const SETTINGS_JSON_PATH = join(ROOT_DIR, ".claude", "settings.json");
const PIPELINE_JSON_PATH = join(ROOT_DIR, ".claude", "pipeline.json");
const PIPELINE_YAML_PATH = join(ROOT_DIR, ".claude", "pipeline.yaml");

export const GENERATED_MARKER_PREFIX = "GENERATED from pipeline.user.yaml — edit there, then re-run setup";

// ---- default answers (== the committed pipeline.user.yaml template's values) -----------------
export function buildDefaultAnswers() {
  return {
    identity: { owner_name: "Your Name", repo_owner: "your-org", repo_name: "agent-pipeline", commit_trailer: true },
    language: { human_facing: "en", agent_facing: "en" },
    platform: { git_host: "github", cli: "gh" },
    agent_runtime: "claude-code",
    // worktypes = THE place to route models per work method (the three session profiles:
    // design-first/advisor/speed) -- the orchestrator's own routing. models below stays the
    // dispatch-tier palette only (mechanic/implement/deep, plus critic's review).
    worktypes: {
      design: {
        design_phase: { model: "opus", effort: "high" },
        execution_phase: { model: "opus", effort: "high" },
        advisor: "off",
      },
      feature: {
        design_phase: { model: "opus", effort: "high" },
        execution_phase: { model: "sonnet", effort: "high" },
        advisor: "opus",
      },
      mini: {
        design_phase: { model: "sonnet", effort: "high" },
        execution_phase: { model: "sonnet", effort: "high" },
        advisor: "opus",
      },
    },
    models: {
      implement: { model: "sonnet", effort: "medium" },
      mechanic: { model: "sonnet", effort: "low" },
      deep: { model: "sonnet", effort: "xhigh" },
      review: { model: "sonnet", effort: "high" },
    },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "blocking", claude_md_max_lines: 200 },
  };
}

// ---- OS / git-host / CLI detection (pure classifiers, separate from the real I/O) -------------
/** @param {NodeJS.Platform} platform */
export function classifyOs(platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "other";
}

/** Extracts the first remote's URL from `git remote -v` output, or null. */
export function parseFirstRemoteUrl(gitRemoteVOutput) {
  if (typeof gitRemoteVOutput !== "string") return null;
  const line = gitRemoteVOutput.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  return parts.length >= 2 ? parts[1] : null;
}

/** @param {string|null} remoteUrl @returns {"github"|"gitlab"|null} */
export function classifyGitHost(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl === "") return null;
  if (/github\.com/i.test(remoteUrl)) return "github";
  if (/gitlab/i.test(remoteUrl)) return "gitlab";
  return null;
}

/** @param {"github"|"gitlab"} host @returns {"gh"|"glab"} */
export function cliForHost(host) {
  return host === "gitlab" ? "glab" : "gh";
}

/**
 * Detects the git host: `git remote -v` first (real signal), then CLI availability
 * (`gh`/`glab` on PATH) as a fallback heuristic (briefing: "from git remote -v or
 * availability of gh/glab"), then "github" as the conservative, deterministic default
 * (matches buildDefaultAnswers().platform.git_host — fresh clones without a remote yet,
 * like this export before P5's `git init`, always resolve here).
 * @param {string} rootDir
 * @param {{spawn?: typeof spawnSync}} [deps] - injectable for tests
 */
export function detectGitHost(rootDir, deps = {}) {
  const spawn = deps.spawn ?? spawnSync;
  const remoteRes = safeSpawn(spawn, "git", ["remote", "-v"], { cwd: rootDir });
  const fromRemote = classifyGitHost(parseFirstRemoteUrl(remoteRes.stdout));
  if (fromRemote) return fromRemote;

  const hasGh = safeSpawn(spawn, "gh", ["--version"]).ok;
  const hasGlab = safeSpawn(spawn, "glab", ["--version"]).ok;
  if (hasGlab && !hasGh) return "gitlab";
  return "github";
}

function safeSpawn(spawn, command, args, opts = {}) {
  try {
    const res = spawn(command, args, { encoding: "utf8", windowsHide: true, ...opts });
    if (!res || res.error || res.status !== 0) return { ok: false, stdout: "" };
    return { ok: true, stdout: res.stdout ?? "" };
  } catch {
    return { ok: false, stdout: "" };
  }
}

// ---- subscription-tier / autonomy presets (pure) -----------------------------------------------
/**
 * @param {string} tier - "pro" | "max" | anything else ("api"/custom: uses the Max preset as a
 *   starting point)
 * @returns {{worktypes: object, models: object}} both preset-filled blocks -- worktypes carries
 *   the orchestrator/session-profile routing, models the dispatch-tier palette (see
 *   buildDefaultAnswers() for the shape).
 */
export function applyAboPreset(tier) {
  if (tier === "pro") {
    return {
      worktypes: {
        design: {
          design_phase: { model: "sonnet", effort: "high" },
          execution_phase: { model: "sonnet", effort: "high" },
          advisor: "off",
        },
        feature: {
          design_phase: { model: "sonnet", effort: "max" },
          execution_phase: { model: "sonnet", effort: "high" },
          advisor: "off",
        },
        mini: {
          design_phase: { model: "sonnet", effort: "max" },
          execution_phase: { model: "sonnet", effort: "high" },
          advisor: "sonnet",
        },
      },
      models: {
        implement: { model: "sonnet", effort: "medium" },
        mechanic: { model: "sonnet", effort: "low" },
        deep: { model: "sonnet", effort: "xhigh" },
        review: { model: "sonnet", effort: "high" },
      },
    };
  }
  // "max" (recommended) and "api"/custom (freely editable starting point) share the preset.
  return {
    worktypes: {
      design: {
        design_phase: { model: "opus", effort: "high" },
        execution_phase: { model: "opus", effort: "high" },
        advisor: "off",
      },
      feature: {
        design_phase: { model: "opus", effort: "high" },
        execution_phase: { model: "sonnet", effort: "high" },
        advisor: "opus",
      },
      mini: {
        design_phase: { model: "sonnet", effort: "high" },
        execution_phase: { model: "sonnet", effort: "high" },
        advisor: "opus",
      },
    },
    models: {
      implement: { model: "sonnet", effort: "medium" },
      mechanic: { model: "sonnet", effort: "low" },
      deep: { model: "sonnet", effort: "xhigh" },
      review: { model: "sonnet", effort: "high" },
    },
  };
}

/** @param {string} preset - "autonom"/"autonomous" or anything else ("conservative") */
export function applyAutonomyPreset(preset) {
  const p = String(preset ?? "").toLowerCase();
  if (p.startsWith("autonom")) return { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 1 };
  return { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 };
}

/**
 * Resolves worktypes/models/autonomy for a (re-)run, given the raw subscription-tier and
 * autonomy-preset CLI answers plus the previously-parsed pipeline.user.yaml (or
 * buildDefaultAnswers() on a fresh install). RE-RUN SAFETY (Critic finding #2, 2026-07-10):
 * pressing Enter (empty answer, "") on EITHER question KEEPS the corresponding previous.*
 * values untouched -- a fresh preset is applied ONLY when the operator types an explicit
 * tier/preset, the deliberate override. Before this fix, promptAnswers() derived worktypes/
 * models/autonomy ONLY from applyAboPreset()/applyAutonomyPreset() and never consulted
 * `previous`, so pressing Enter through a re-run silently replaced a personalized routing
 * with the generic preset. On a fresh install `previous` already equals buildDefaultAnswers(),
 * which in turn equals applyAboPreset("max") (see the "matches buildDefaultAnswers()" test) --
 * so this is a no-op behaviour change for first-time setup.
 * @param {string} aboIn - raw (trimmed, lowercased) subscription-tier answer, "" = keep
 * @param {string} autonomyIn - raw (trimmed, lowercased) autonomy-preset answer, "" = keep
 * @param {object} previous - answersFromParsed(...) result (existing personalization or defaults)
 */
export function resolveRoutingAnswers(aboIn, autonomyIn, previous) {
  let worktypes;
  let models;
  if (aboIn === "") {
    worktypes = {
      design: { ...previous.worktypes.design },
      feature: { ...previous.worktypes.feature },
      mini: { ...previous.worktypes.mini },
    };
    models = { ...previous.models };
  } else {
    ({ worktypes, models } = applyAboPreset(aboIn));
  }

  let autonomy;
  if (autonomyIn === "") {
    autonomy = previous.autonomy;
  } else {
    autonomy = applyAutonomyPreset(autonomyIn);
    if (autonomyIn.startsWith("autonom")) worktypes.feature.advisor = "opus";
  }

  return { worktypes, models, autonomy };
}

export function normalizeLang(value) {
  return value === "en" ? "en" : "de";
}

/** Renders an advisor field: "off" gets quoted (a deliberate string sentinel, not a YAML
 * literal off-state -- yaml-lite has no bool coercion for it, but the quoting stays for human
 * readability/parity with the PRD's authoritative example); a model name renders bare. */
function renderAdvisor(value) {
  return value === "off" ? `"off"` : value;
}

// ---- pipeline.user.yaml: render + parse + validate ---------------------------------------------
/** Renders the FULL commented pipeline.user.yaml text for a given answers object. Deterministic:
 * same answers -> byte-identical text (idempotency, see file header). */
export function renderUserYaml(answers) {
  const a = answers;
  return `# pipeline.user.yaml — your personal Pipeline profile.
# The ONE file that makes the Pipeline "yours". The methodology core stays generic.
#
# Change it → re-run \`node setup.mjs\` (recompiles the runtime configs:
# .claude/settings.json, .claude/pipeline.json, .claude/pipeline.yaml). This file is
# the SOURCE of intent — the three compiled files are runtime-canonical and each
# carries a "GENERATED from pipeline.user.yaml" header; hand-edits THERE are detected
# as drift on the next \`setup.mjs\` run and overwritten only after confirmation
# (layer model).
#
# This is the committed TEMPLATE state with conservative but working defaults
# (a new colleague starts safe AND immediately functional). The SessionStart hook
# \`setup-check.mjs\` recognizes this default state (owner_name/repo_owner unchanged)
# and reminds you to run \`node setup.mjs\` as long as no real setup has run yet.

identity:
  owner_name: "${a.identity.owner_name}"           # appears nowhere in the methodology core, only in YOUR artifacts (commit trailer etc.)
  repo_owner: "${a.identity.repo_owner}"            # GitHub org/user or GitLab group of YOUR OWN repo
  repo_name: "${a.identity.repo_name}"       # name of YOUR OWN repo (setup.mjs binds the plugin to it)
  commit_trailer: ${a.identity.commit_trailer}              # Co-Authored-By trailer on commits

language:
  human_facing: ${a.language.human_facing}                  # what the Pipeline PRODUCES: commits, reviews, new docs (de|en)
  agent_facing: ${a.language.agent_facing}                  # roles/guardrails/skills (recommended: en)
  # Note: the SHIPPED documentation is de (human) / en (agent).

platform:
  git_host: ${a.platform.git_host}                  # github | gitlab   (setup.mjs detects it from \`git remote -v\`)
  cli: ${a.platform.cli}                           # gh | glab         (setup.mjs sets this to match the host)
  # Note on self-hosted GitLab: setup.mjs binds the marketplace binding to gitlab.com by
  # default; for your own GitLab host, adjust the generated marketplace URL in
  # .claude/settings.json (extraKnownMarketplaces) by hand afterwards.

agent_runtime: ${a.agent_runtime}          # claude-code (full enforcement) | other (methodology only → docs/runtime-boundary.md)

# setup.mjs asks your subscription tier and writes matching presets for both blocks
# below (worktypes = orchestrator/session-profile routing, models = dispatch-tier routing):
#   Pro:  all sonnet, effort-tiered (methodology fully usable)
#   Max:  opus orchestrator + sonnet dispatch tiers (recommended, default below)
#   API/custom: enter names freely (setup.mjs pre-fills with the Max preset as a starting point)
#
# THE place to route models per work method (= the three session profiles: design-first,
# advisor, speed). Bugfix rule: a mini-scoped bugfix runs as \`mini\`; anything larger runs
# as \`feature\` (QG-07 repro-first applies either way).
worktypes:
  design:                           # profile design-first -- features with a real design phase
    design_phase:
      model: ${a.worktypes.design.design_phase.model}
      effort: ${a.worktypes.design.design_phase.effort}   # orchestrator until plan approval
    execution_phase:
      model: ${a.worktypes.design.execution_phase.model}
      effort: ${a.worktypes.design.execution_phase.effort} # orchestrator after approval
    advisor: ${renderAdvisor(a.worktypes.design.advisor)}
  feature:                          # profile advisor -- the everyday method
    design_phase:
      model: ${a.worktypes.feature.design_phase.model}
      effort: ${a.worktypes.feature.design_phase.effort}  # Opus designs; Sonnet executes below (phases differ)
    execution_phase:
      model: ${a.worktypes.feature.execution_phase.model}
      effort: ${a.worktypes.feature.execution_phase.effort}
    advisor: ${renderAdvisor(a.worktypes.feature.advisor)} # "off" | a model name (autonomous preset sets a model here)
  mini:                             # profile speed -- mini-feature / hotfix
    design_phase:
      model: ${a.worktypes.mini.design_phase.model}
      effort: ${a.worktypes.mini.design_phase.effort}
    execution_phase:
      model: ${a.worktypes.mini.execution_phase.model}
      effort: ${a.worktypes.mini.execution_phase.effort}
    advisor: ${renderAdvisor(a.worktypes.mini.advisor)}    # fixed pairing (small model orchestrates, bigger advisor watches)

models:                             # dispatch tiers only (MP-27: mechanic/implement/deep, plus critic's review)
  implement:
    model: ${a.models.implement.model}
    effort: ${a.models.implement.effort}
  mechanic:
    model: ${a.models.mechanic.model}
    effort: ${a.models.mechanic.effort}
  deep:
    model: ${a.models.deep.model}
    effort: ${a.models.deep.effort}
  review:
    model: ${a.models.review.model}
    effort: ${a.models.review.effort}

autonomy:
  push_policy: ${a.autonomy.push_policy}                # gated | standing-approved
  branch_model: ${a.autonomy.branch_model}      # feature-branch | direct-main
  wip_limit: ${a.autonomy.wip_limit}

gates:
  dev_plan: ${a.gates.dev_plan}                # blocking | warn | off
  push: ${a.gates.push}
  security: ${a.gates.security}
  claude_md_max_lines: ${a.gates.claude_md_max_lines}

# OPTIONAL — omit entirely for zero added behavior (anti-bloat guarantee, ADR-0033/0034).
# Release/Promotion phase (optional SDLC tail phase): uncomment and adapt only for a project
# that actually deploys; see docs/deploy/README.md for the full guide. Two-environment
# vercel-preview/vercel-prod starter shape (fields ground-truthed in
# plugins/pipeline-core/scripts/pipeline-manifest.schema.json's \`release\` property):
#
# release:
#   environments:
#     test:
#       adapter: vercel-preview       # must reference a declared adapter (integrity check)
#       healthcheck: <command-or-workflow-ref>
#       rollback: <procedure-ref>     # MANDATORY per environment
#     prod:
#       adapter: vercel-prod
#       healthcheck: <command-or-workflow-ref>
#       rollback: <procedure-ref>
#       promotion: human-gate         # fixed value in v1
#   adapters:
#     vercel-preview:
#       executor: ci                  # ci | local -- the swappable driver
#       deploy: <workflow-ref>        # test-env deploy (merge-triggered), no release refs
#       credentials: oidc             # oidc | ci-secret | external -- never inline values
#     vercel-prod:
#       executor: ci
#       trigger:
#         refs:
#           - refs/tags/v*            # ci executor: release-triggering ref patterns
#       deploy: <workflow-ref>        # local executor: a command reference instead
#       credentials: oidc

# -----------------------------------------------------------------------------------------
# Advanced/autonomous example (NOT active — for orientation only; setup.mjs writes these
# values automatically when you choose "Autonomous" for the autonomy preset):
#
# autonomy:
#   push_policy:  standing-approved
#   branch_model: direct-main
#   wip_limit: 1
#
# worktypes:
#   feature:
#     advisor: opus
# -----------------------------------------------------------------------------------------
`;
}

/** Safe parse: returns the parsed object, or null on any read/parse/shape problem (fail-open). */
export function loadUserYamlSafe(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { raw: null, parsed: null };
  }
  try {
    const parsed = parseYaml(raw);
    return { raw, parsed: parsed && typeof parsed === "object" ? parsed : null };
  } catch {
    return { raw, parsed: null };
  }
}

/** Merges a (possibly partial/invalid) previously-parsed user.yaml object over the defaults, so
 * re-running interactively pre-fills prompts with the user's own last answers where present. */
export function answersFromParsed(parsed, defaults = buildDefaultAnswers()) {
  if (!parsed || typeof parsed !== "object") return defaults;
  const d = defaults;
  const g = (obj, key, fallback) => (obj && typeof obj === "object" && obj[key] !== undefined ? obj[key] : fallback);
  const mergeWorktype = (def, val) => ({
    design_phase: { ...def.design_phase, ...(val?.design_phase ?? {}) },
    execution_phase: { ...def.execution_phase, ...(val?.execution_phase ?? {}) },
    advisor: g(val, "advisor", def.advisor),
  });
  return {
    identity: { ...d.identity, ...(parsed.identity && typeof parsed.identity === "object" ? parsed.identity : {}) },
    language: { ...d.language, ...(parsed.language && typeof parsed.language === "object" ? parsed.language : {}) },
    platform: { ...d.platform, ...(parsed.platform && typeof parsed.platform === "object" ? parsed.platform : {}) },
    agent_runtime: g(parsed, "agent_runtime", d.agent_runtime),
    worktypes: {
      design: mergeWorktype(d.worktypes.design, parsed.worktypes?.design),
      feature: mergeWorktype(d.worktypes.feature, parsed.worktypes?.feature),
      mini: mergeWorktype(d.worktypes.mini, parsed.worktypes?.mini),
    },
    models: {
      implement: { ...d.models.implement, ...(parsed.models?.implement ?? {}) },
      mechanic: { ...d.models.mechanic, ...(parsed.models?.mechanic ?? {}) },
      deep: { ...d.models.deep, ...(parsed.models?.deep ?? {}) },
      review: { ...d.models.review, ...(parsed.models?.review ?? {}) },
    },
    autonomy: { ...d.autonomy, ...(parsed.autonomy ?? {}) },
    gates: { ...d.gates, ...(parsed.gates ?? {}) },
    // release: OPTIONAL passthrough only (ADR-0033/0034) -- no default, no merge-over-defaults
    // (there IS no default shape to merge over). Present in `parsed` only when a project
    // hand-edited pipeline.user.yaml to uncomment/fill in its own `release:` section; absent
    // otherwise, which is what keeps renderPipelineYaml()'s compiled output release-free
    // (anti-bloat guarantee) on every repo that never touches this.
    ...(parsed.release && typeof parsed.release === "object" ? { release: parsed.release } : {}),
  };
}

// ---- hashing + generated-marker helpers ---------------------------------------------------------
export function shortHash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

export function generatedMarker(sourceHash) {
  return `${GENERATED_MARKER_PREFIX} (sourceHash: ${sourceHash})`;
}

export function extractRecordedHash(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/sourceHash:\s*([0-9a-f]+)/);
  return m ? m[1] : null;
}

// ---- drift decision (pure) -----------------------------------------------------------------------
/**
 * @param {{existsOnDisk: boolean, parsedOk: boolean, existingRaw: string|null,
 *   wantedText: string, recordedHash: string|null, currentSourceHash: string}} args
 * @returns {{action: "write"|"skip"|"warn", reason: string}}
 */
export function decideCompileAction({ existsOnDisk, parsedOk, existingRaw, wantedText, recordedHash, currentSourceHash }) {
  if (!existsOnDisk) return { action: "write", reason: "initial" };
  if (!parsedOk) return { action: "warn", reason: "unparseable" };
  if (existingRaw === wantedText) return { action: "skip", reason: "up-to-date" };
  if (recordedHash === null) return { action: "write", reason: "baseline" };
  if (recordedHash !== currentSourceHash) return { action: "write", reason: "source-changed" };
  return { action: "warn", reason: "drift" };
}

/**
 * Pure resolution of what happens when `decideCompileAction()` returns "warn" (hand-edit
 * drift, or an existing file that failed to parse), given `--force`/`--yes` and whether the
 * run is interactive. Does no I/O and no prompting itself -- `applyCompileDecision()` uses
 * the returned disposition to decide whether to write immediately, prompt the user, or
 * refuse. `force` always wins over `interactive`: a forced run never blocks on a prompt.
 * @param {{force: boolean, interactive: boolean}} args
 * @returns {"write-forced"|"prompt"|"refuse"}
 */
export function resolveWarnDisposition({ force, interactive }) {
  if (force) return "write-forced";
  if (interactive) return "prompt";
  return "refuse";
}

// ---- compile targets (pure builders; I/O happens in the caller) ---------------------------------
/** @param {object|null} existing - previously-parsed settings.json, or null if absent/corrupt */
export function compileSettingsJson(existing, answers, sourceHash) {
  const base =
    existing && typeof existing === "object"
      ? { ...existing }
      : {
          statusLine: { type: "command", command: "node plugins/pipeline-core/scripts/statusline-context.mjs" },
          // Standing push-approval is opt-in only (ADR-0017: no bleed-over into projects that
          // keep push gated) -- mirrors the same condition renderPipelineYaml() uses below.
          ...(answers.autonomy.push_policy === "standing-approved"
            ? { permissions: { allow: ["Bash(git push*)", "PowerShell(git push*)"] } }
            : {}),
          enabledPlugins: { "pipeline-core@agent-pipeline": true },
        };
  const marketplaceName = "agent-pipeline"; // local alias key stays stable (D2: same alias, own repo underneath)
  // GitLab: Claude Code marketplace source type is "url" (NOT "git" -- that type does not
  // exist), value = the full .git clone URL. Host is gitlab.com by default -- self-hosted
  // GitLab users: edit the marketplace url below by hand after setup.mjs runs (see file header
  // "GITLAB MARKETPLACE BINDING" and pipeline.user.yaml's platform: section for the full
  // rationale on why the detected host isn't threaded through automatically here).
  const source =
    answers.platform.git_host === "gitlab"
      ? { source: "url", url: `https://gitlab.com/${answers.identity.repo_owner}/${answers.identity.repo_name}.git` }
      : { source: "github", repo: `${answers.identity.repo_owner}/${answers.identity.repo_name}` };
  base.extraKnownMarketplaces = { ...(base.extraKnownMarketplaces ?? {}), [marketplaceName]: { source } };
  base.$generated = generatedMarker(sourceHash);
  return base;
}

/** @param {object|null} existing - previously-parsed pipeline.json, or null if absent/corrupt */
export function compilePipelineJson(existing, answers, sourceHash) {
  const base =
    existing && typeof existing === "object"
      ? { ...existing }
      : {
          project: answers.identity.repo_name,
          verify: "node harness/scripts/verify.mjs",
          handover: "docs/state.md",
          verification: "docs+tests",
          worktree: "optional",
          stakes: "unclassified",
          constraints: [],
          ritualExtensions: {},
        };
  base.autonomy = answers.autonomy.push_policy;
  base.branchModel = answers.autonomy.branch_model;
  base.wipLimit = answers.autonomy.wip_limit;
  base.claudeMdMaxLines = answers.gates.claude_md_max_lines;
  base.$generated = generatedMarker(sourceHash);
  return base;
}

/** Fully regenerated from a fixed template on every compile (see file header "COMPILE MODEL"). */
/** Renders the compiled `release:` section for .claude/pipeline.yaml -- ONLY called with a
 * present object by renderPipelineYaml() below (ADR-0033/0034 anti-bloat guarantee: an absent
 * `release` in pipeline.user.yaml means the compiled manifest carries no release: section at
 * all, zero behavior change). Targeted serializer for the known release shape
 * (pipeline-manifest.schema.json's `release` property / pipeline.user.schema.json's mirror) --
 * not a generic YAML stringifier (this repo has no YAML serializer dependency, only the
 * yaml-lite PARSER, see file header imports). Returns "" on anything not a present object. */
function renderReleaseSection(release) {
  if (!release || typeof release !== "object") return "";
  const lines = ["", "release:"];
  const environments = release.environments && typeof release.environments === "object" ? release.environments : {};
  const envKeys = Object.keys(environments);
  if (envKeys.length > 0) lines.push("  environments:");
  for (const key of envKeys) {
    const env = environments[key] ?? {};
    lines.push(`    ${key}:`);
    if (env.adapter !== undefined) lines.push(`      adapter: ${env.adapter}`);
    if (env.target !== undefined) lines.push(`      target: ${env.target}`);
    if (env.healthcheck !== undefined) lines.push(`      healthcheck: ${env.healthcheck}`);
    if (env.rollback !== undefined) lines.push(`      rollback: ${env.rollback}`);
    if (env.promotion !== undefined) lines.push(`      promotion: ${env.promotion}`);
  }
  const adapters = release.adapters && typeof release.adapters === "object" ? release.adapters : {};
  const adapterKeys = Object.keys(adapters);
  if (adapterKeys.length > 0) lines.push("  adapters:");
  for (const key of adapterKeys) {
    const ad = adapters[key] ?? {};
    lines.push(`    ${key}:`);
    if (ad.executor !== undefined) lines.push(`      executor: ${ad.executor}`);
    if (ad.trigger && Array.isArray(ad.trigger.refs)) {
      lines.push("      trigger:");
      lines.push("        refs:");
      for (const ref of ad.trigger.refs) lines.push(`          - ${ref}`);
    }
    if (ad.command !== undefined) lines.push(`      command: ${ad.command}`);
    if (ad.deploy !== undefined) lines.push(`      deploy: ${ad.deploy}`);
    if (ad.credentials !== undefined) lines.push(`      credentials: ${ad.credentials}`);
  }
  return lines.join("\n") + "\n";
}

export function renderPipelineYaml(answers, sourceHash) {
  const pushApproval = answers.autonomy.push_policy === "standing-approved" ? "standing-approved" : "required";
  const base = `# pipeline.yaml -- declarative pipeline manifest (.claude/pipeline.yaml, schema pipeline.manifest.v0).
# ${generatedMarker(sourceHash)}
# ADDITIVE to .claude/pipeline.json (project calibration) -- disjoint field sets.
# Validate with: node harness/scripts/validate-manifest.mjs

schema: pipeline.manifest.v0

phases:
  - name: design
    enabled: true
  - name: implementation
    enabled: true
  - name: security-scan
    enabled: true
  - name: ui-design
    enabled: true
    condition: has_ui

gates:
  dev-plan:
    mode: ${answers.gates.dev_plan}
    type: human
  push:
    mode: ${answers.gates.push}
    type: human
    approval: ${pushApproval}
  security:
    mode: ${answers.gates.security}
    type: automated

security:
  scanners:
    gitleaks:
      enabled: true
    osv-scanner:
      enabled: true
    semgrep:
      enabled: true
      rules_dir: governance/examples/policies/semgrep

modelRouting:
  # elephant: pipeline-manifest.schema.json's modelRouting shape is a flat {model, effort, note}
  # per role (schema-lite has no $ref/oneOf to express worktypes' nested per-phase routing
  # without invasive manifest-schema surgery -- out of this delivery's scope, flagged in the
  # delivering briefing's report). This is a REPRESENTATIVE value (feature worktype, execution
  # phase) -- the full per-worktype/phase orchestrator routing is authoritative in
  # pipeline.user.yaml -> worktypes.
  elephant:
    model: ${answers.worktypes.feature.execution_phase.model}
    effort: ${answers.worktypes.feature.execution_phase.effort}
    note: "representative value (worktypes.feature.execution_phase) -- full per-worktype/phase routing lives in pipeline.user.yaml -> worktypes"
  goldfish:
    model: ${answers.models.implement.model}
    effort: ${answers.models.implement.effort}
  goldfish_mechanic:
    model: ${answers.models.mechanic.model}
    effort: ${answers.models.mechanic.effort}
  goldfish_deep:
    model: ${answers.models.deep.model}
    effort: ${answers.models.deep.effort}
  critic:
    model: ${answers.models.review.model}
    effort: ${answers.models.review.effort}

profiles:
  active: full-sdlc
  quick:
    phases:
      - implementation
  full-sdlc:
    phases:
      - design
      - implementation
      - security-scan
      - ui-design

governance:
  guidelines_path: governance/examples/guidelines
  policies_path: governance/examples/policies

flags:
  has_ui: false
`;
  return base + renderReleaseSection(answers.release);
}

/**
 * Parses and validates a generated runtime manifest through the canonical manifest authority.
 * The CLI runs this before writing pipeline.user.yaml or any compiled target, preventing a
 * malformed or semantically invalid projection from leaving a partial compile behind.
 */
export function validateCompiledPipelineYaml(text, rootDir = ROOT_DIR) {
  let manifest;
  try {
    manifest = parseYaml(text);
  } catch (error) {
    return { status: "invalid", errors: [{ reason: error.message }], warnings: [] };
  }
  return validateManifest(manifest, { rootDir });
}

// ---- CLI I/O layer: real filesystem, real prompts, real exit -----------------------------------
function readJsonSafe(path) {
  if (!existsSync(path)) return { existsOnDisk: false, parsedOk: true, raw: null, parsed: null };
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { existsOnDisk: true, parsedOk: false, raw: null, parsed: null };
  }
  try {
    return { existsOnDisk: true, parsedOk: true, raw, parsed: JSON.parse(raw) };
  } catch {
    return { existsOnDisk: true, parsedOk: false, raw, parsed: null };
  }
}

async function applyCompileDecision({ label, path, existingState, wantedText, sourceHash, interactive, rl, force = false }) {
  const recordedHash = extractRecordedHash(existingState.raw);
  const decision = decideCompileAction({
    existsOnDisk: existingState.existsOnDisk,
    parsedOk: existingState.parsedOk,
    existingRaw: existingState.raw,
    wantedText,
    recordedHash,
    currentSourceHash: sourceHash,
  });

  if (decision.action === "skip") {
    console.log(`  ${label}: already up to date (unchanged).`);
    return { wrote: false, decision };
  }
  if (decision.action === "write") {
    writeFileSync(path, wantedText);
    console.log(`  ${label}: compiled (${decision.reason}).`);
    return { wrote: true, decision };
  }

  // decision.action === "warn"
  const reasonText =
    decision.reason === "unparseable"
      ? "the existing file is not valid JSON/YAML -- please check it by hand"
      : "hand-edit drift detected (file diverges from the last compile, although pipeline.user.yaml has not changed since)";
  console.warn(`  WARNING ${label}: ${reasonText}.`);

  const disposition = resolveWarnDisposition({ force, interactive: interactive && !!rl });
  if (disposition === "write-forced") {
    console.warn(`  WARNING ${label}: --force/--yes set -- overwriting the hand-edited file WITHOUT confirmation.`);
    writeFileSync(path, wantedText);
    console.log(`  ${label}: overwritten (--force).`);
    return { wrote: true, decision };
  }
  if (disposition === "prompt") {
    const answer = (await rl.question(`  Overwrite ${label} anyway? [y/N] `)).trim().toLowerCase();
    if (["y", "yes", "j", "ja"].includes(answer)) {
      writeFileSync(path, wantedText);
      console.log(`  ${label}: overwritten (confirmation received).`);
      return { wrote: true, decision };
    }
  }
  console.warn(`  ${label}: NOT overwritten -- please reconcile manually.`);
  return { wrote: false, decision };
}

async function promptAnswers(rl, previous) {
  console.log("\n=== Agent-Pipeline Setup ===\n");

  const runtimeIn = (await rl.question(`Runtime? [claude-code/other] (${previous.agent_runtime}) `)).trim();
  const agent_runtime = runtimeIn === "other" ? "other" : runtimeIn === "" ? previous.agent_runtime : "claude-code";
  if (agent_runtime === "other") {
    console.log(
      "  Note: 'other' means portable methodology without full hook/gate enforcement -- see docs/runtime-boundary.md.",
    );
  }

  const owner_name = (await rl.question(`Your name (${previous.identity.owner_name}): `)).trim() || previous.identity.owner_name;
  const repo_owner =
    (await rl.question(`GitHub/GitLab owner of your repo (${previous.identity.repo_owner}): `)).trim() || previous.identity.repo_owner;
  const repo_name = (await rl.question(`Repo name (${previous.identity.repo_name}): `)).trim() || previous.identity.repo_name;

  const humanIn = (await rl.question(`Language -- human-facing (commits/reviews/new docs) [de/en] (${previous.language.human_facing}): `)).trim();
  const agentIn = (await rl.question(`Language -- agent-facing (roles/guardrails/skills) [de/en] (${previous.language.agent_facing}): `)).trim();

  const aboIn = (
    await rl.question(
      `Subscription tier -- press Enter to KEEP your current worktypes/models routing, or type pro/max/api to re-pick a preset (overwrites routing): `,
    )
  ).trim().toLowerCase();
  if (aboIn !== "" && aboIn !== "pro" && aboIn !== "max") {
    console.log(
      "  API/custom chosen: models pre-filled with the Max preset -- enter your own model names/effort values directly in pipeline.user.yaml and re-run `node setup.mjs` afterwards.",
    );
  }

  const autonomyIn = (
    await rl.question(
      `Autonomy preset -- press Enter to KEEP your current autonomy setting, or type conservative/autonomous to re-pick a preset (overwrites it): `,
    )
  ).trim().toLowerCase();
  const { worktypes, models, autonomy } = resolveRoutingAnswers(aboIn, autonomyIn, previous);

  const git_host = detectGitHost(ROOT_DIR);
  const cli = cliForHost(git_host);
  console.log(`  Detected: OS=${classifyOs(process.platform)}, git host=${git_host}, CLI=${cli}.`);

  return {
    identity: { owner_name, repo_owner, repo_name, commit_trailer: previous.identity.commit_trailer },
    language: { human_facing: humanIn ? normalizeLang(humanIn) : previous.language.human_facing, agent_facing: agentIn ? normalizeLang(agentIn) : previous.language.agent_facing },
    platform: { git_host, cli },
    agent_runtime,
    worktypes,
    models,
    autonomy,
    gates: previous.gates,
    // release: carried over unchanged (no prompt asks about it -- ADR-0033/0034 is opt-in via a
    // hand-edited pipeline.user.yaml, never via this interactive flow); only present at all when
    // `previous` (answersFromParsed of the existing file) already had one.
    ...(previous.release !== undefined ? { release: previous.release } : {}),
  };
}

function printNextSteps(answers) {
  // Command shape must match compileSettingsJson's marketplace source (github: shorthand,
  // gitlab: full .git clone URL -- gitlab.com marketplace source type is "url", not "git").
  const addCmd =
    answers.platform.git_host === "gitlab"
      ? `claude plugin marketplace add https://gitlab.com/${answers.identity.repo_owner}/${answers.identity.repo_name}.git --scope project`
      : `claude plugin marketplace add ${answers.identity.repo_owner}/${answers.identity.repo_name} --scope project`;
  console.log(`
Setup complete.

Next steps:
  1. Bind the plugin to your own repo (if not already done):
       ${addCmd}
       claude plugin install pipeline-core@agent-pipeline --scope project
  2. Start a new Claude Code session -- the bootstrap check runs automatically
     (/pipeline-core:pipeline-start).
  3. Try a first run in the "quick" profile (details: SETUP.md).
  4. pipeline.user.yaml is adjustable any time -- re-run \`node setup.mjs\` afterwards.
  5. Before your first big feature: a quick look at docs/design/README.md pays
     off (optional design pre-stage, self-service brainstorming guide).
  6. Keep the plugin current -- project scope is the only supported
     install/update scope (an extra user-scope install becomes a stale
     second copy, never a shortcut); refresh with, always in this order:
       claude plugin marketplace update agent-pipeline
       claude plugin update pipeline-core@agent-pipeline --scope project
       /reload-plugins
     (details: docs/adr/0001-distribution-plugin-marketplace.md, addendum)

Details: SETUP.md (main entry point), docs/usage.md (day to day).
`);
}

export function parseArgv(argv) {
  return {
    defaults: argv.includes("--defaults"),
    help: argv.includes("--help") || argv.includes("-h"),
    force: argv.includes("--force") || argv.includes("--yes"),
  };
}

export async function run(argv = process.argv.slice(2), deps = {}) {
  const rootDir = deps.rootDir ?? ROOT_DIR;
  const renderPipelineYamlFn = deps.renderPipelineYamlFn ?? renderPipelineYaml;
  const userYamlPath = join(rootDir, "pipeline.user.yaml");
  const settingsJsonPath = join(rootDir, ".claude", "settings.json");
  const pipelineJsonPath = join(rootDir, ".claude", "pipeline.json");
  const pipelineYamlPath = join(rootDir, ".claude", "pipeline.yaml");
  const opts = parseArgv(argv);
  if (opts.help) {
    console.log(
      "Usage: node setup.mjs [--defaults] [--force|--yes] [--help]\n  (no flags)     interactive setup\n  --defaults     non-interactive: conservative defaults, no prompts (test/CI)\n  --force/--yes  skip the hand-edit-drift confirmation (interactive) or allow the\n                 otherwise-refused overwrite (non-interactive) -- always warns loudly first\n  --help         this text",
    );
    return 0;
  }

  const defaults = buildDefaultAnswers();
  const { raw: existingUserYamlRaw, parsed: existingUserYamlParsed } = loadUserYamlSafe(userYamlPath);
  const previous = answersFromParsed(existingUserYamlParsed, defaults);

  let rl = null;
  let answers;
  if (opts.defaults) {
    // Detection still runs (never a "question") -- only the five interactive questions are
    // replaced by the deterministic defaults (see file header "DETECTION vs. QUESTIONS").
    const git_host = detectGitHost(rootDir);
    answers = {
      ...defaults,
      platform: { git_host, cli: cliForHost(git_host) },
      // release: carried over from the existing pipeline.user.yaml, if any -- `--defaults`
      // resets the five interactive answers, never a hand-edited release: section (ADR-0033/0034).
      ...(previous.release !== undefined ? { release: previous.release } : {}),
    };
  } else {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      answers = await promptAnswers(rl, previous);
    } catch (err) {
      rl.close();
      console.error(`setup.mjs: interactive prompt failed (${err.message}). Try \`node setup.mjs --defaults\`.`);
      return 1;
    }
  }

  const userYamlText = renderUserYaml(answers);
  let parsedForValidation;
  try {
    parsedForValidation = parseYaml(userYamlText);
  } catch (err) {
    if (rl) rl.close();
    console.error(`setup.mjs: internal error -- generated pipeline.user.yaml failed to parse: ${err.message}`);
    return 1;
  }
  const schema = JSON.parse(readFileSync(USER_SCHEMA_PATH, "utf8"));
  const { valid, errors } = validateAgainstSchema(parsedForValidation, schema);
  if (!valid) {
    if (rl) rl.close();
    console.error("setup.mjs: internal error -- generated pipeline.user.yaml failed schema validation:");
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }

  const sourceHash = shortHash(userYamlText);
  const pipelineYamlWanted = renderPipelineYamlFn(answers, sourceHash);
  const manifestPreflight = validateCompiledPipelineYaml(pipelineYamlWanted, rootDir);
  if (manifestPreflight.status !== "ok") {
    if (rl) rl.close();
    console.error("setup.mjs: generated .claude/pipeline.yaml failed canonical validation; no files were written:");
    for (const error of manifestPreflight.errors) {
      console.error(`  ${error.reason ?? error.message ?? `${error.path}: expected ${error.expected}, got ${error.got}`}`);
    }
    return 1;
  }

  if (existingUserYamlRaw !== userYamlText) {
    writeFileSync(userYamlPath, userYamlText);
    console.log("pipeline.user.yaml written.");
  } else {
    console.log("pipeline.user.yaml already up to date (unchanged).");
  }

  const interactive = !opts.defaults;

  console.log("\nCompiling runtime configs:");

  const settingsState = readJsonSafe(settingsJsonPath);
  const settingsWanted = JSON.stringify(compileSettingsJson(settingsState.parsed, answers, sourceHash), null, 2) + "\n";
  await applyCompileDecision({
    label: ".claude/settings.json",
    path: settingsJsonPath,
    existingState: settingsState,
    wantedText: settingsWanted,
    sourceHash,
    interactive,
    rl,
    force: opts.force,
  });

  const pipelineJsonState = readJsonSafe(pipelineJsonPath);
  const pipelineJsonWanted = JSON.stringify(compilePipelineJson(pipelineJsonState.parsed, answers, sourceHash), null, 2) + "\n";
  await applyCompileDecision({
    label: ".claude/pipeline.json",
    path: pipelineJsonPath,
    existingState: pipelineJsonState,
    wantedText: pipelineJsonWanted,
    sourceHash,
    interactive,
    rl,
    force: opts.force,
  });

  const pipelineYamlExists = existsSync(pipelineYamlPath);
  const pipelineYamlRaw = pipelineYamlExists ? readFileSync(pipelineYamlPath, "utf8") : null;
  await applyCompileDecision({
    label: ".claude/pipeline.yaml",
    path: pipelineYamlPath,
    existingState: { existsOnDisk: pipelineYamlExists, parsedOk: true, raw: pipelineYamlRaw, parsed: null },
    wantedText: pipelineYamlWanted,
    sourceHash,
    interactive,
    rl,
    force: opts.force,
  });

  if (rl) rl.close();
  printNextSteps(answers);
  return 0;
}

// Only auto-run when executed directly (`node setup.mjs`), never on import (setup.test.mjs
// imports the exported functions above without triggering the real CLI/exit) -- same
// Windows-safe pathToFileURL comparison used throughout this plugin (e.g.
// post-compact-reground.mjs, staleness-check.mjs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
