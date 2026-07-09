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
 * "nutzen -- KEINE neue Dependency".
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
 * change between the two runs). See DoD "zweiter Lauf idempotent".
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
 * is TP-3-protected and wiring it is outside this briefing's Lieferumfang (out of scope,
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = SCRIPT_DIR; // setup.mjs lives at the export root -- resolve relative
// to the SCRIPT's own location, not `process.cwd()`, so it stays correct no matter where the
// collegue invokes `node setup.mjs` from (PRD §6/§7: "läuft überall").

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
    language: { human_facing: "de", agent_facing: "en" },
    platform: { git_host: "github", cli: "gh" },
    agent_runtime: "claude-code",
    models: {
      design: { model: "opus", effort: "high" },
      implement: { model: "sonnet", effort: "medium" },
      mechanic: { model: "sonnet", effort: "low" },
      review: { model: "sonnet", effort: "high" },
      advisor: { enabled: false },
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
 * (`gh`/`glab` on PATH) as a fallback heuristic (briefing: "aus git remote -v bzw.
 * Verfügbarkeit von gh/glab"), then "github" as the conservative, deterministic default
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
/** @param {string} tier - "pro" | "max" | anything else ("api"/eigene: Max-Preset als Startpunkt) */
export function applyAboPreset(tier) {
  if (tier === "pro") {
    return {
      design: { model: "sonnet", effort: "high" },
      implement: { model: "sonnet", effort: "medium" },
      mechanic: { model: "sonnet", effort: "low" },
      review: { model: "sonnet", effort: "high" },
      advisor: { enabled: false },
    };
  }
  // "max" (recommended) and "api"/eigene (freely editable starting point) share the preset.
  return {
    design: { model: "opus", effort: "high" },
    implement: { model: "sonnet", effort: "medium" },
    mechanic: { model: "sonnet", effort: "low" },
    review: { model: "sonnet", effort: "high" },
    advisor: { enabled: false },
  };
}

/** @param {string} preset - "autonom"/"autonomous" or anything else ("konservativ") */
export function applyAutonomyPreset(preset) {
  const p = String(preset ?? "").toLowerCase();
  if (p.startsWith("autonom")) return { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 1 };
  return { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 };
}

export function normalizeLang(value) {
  return value === "en" ? "en" : "de";
}

// ---- pipeline.user.yaml: render + parse + validate ---------------------------------------------
/** Renders the FULL commented pipeline.user.yaml text for a given answers object. Deterministic:
 * same answers -> byte-identical text (idempotency, see file header). */
export function renderUserYaml(answers) {
  const a = answers;
  return `# pipeline.user.yaml — dein persönliches Pipeline-Profil.
# Die EINE Datei, die die Pipeline "deine" macht. Der Methodik-Kern bleibt generisch.
#
# Ändern → \`node setup.mjs\` erneut ausführen (kompiliert die Laufzeit-Configs neu:
# .claude/settings.json, .claude/pipeline.json, .claude/pipeline.yaml). Diese Datei ist
# die QUELLE der Absicht — die drei kompilierten Dateien sind laufzeit-kanonisch und
# tragen je einen "GENERATED from pipeline.user.yaml"-Header; Hand-Edits DORT werden bei
# der nächsten \`setup.mjs\`-Ausführung als Drift erkannt und nur nach Bestätigung
# überschrieben (Schichtenmodell).
#
# Dies ist der committete TEMPLATE-Zustand mit konservativen, aber lauffähigen Defaults
# (der Neu-Kollege startet sicher UND sofort funktionsfähig). Der SessionStart-Hook
# \`setup-check.mjs\` erkennt diesen Default-Zustand (owner_name/repo_owner unverändert)
# und erinnert an \`node setup.mjs\`, solange kein echtes Setup gelaufen ist.

identity:
  owner_name: "${a.identity.owner_name}"           # erscheint nirgends im Methodik-Kern, nur in DEINEN Artefakten (Commit-Trailer etc.)
  repo_owner: "${a.identity.repo_owner}"            # GitHub-Org/-User bzw. GitLab-Gruppe deines EIGENEN Repos
  repo_name: "${a.identity.repo_name}"       # Name deines EIGENEN Repos (setup.mjs bindet das Plugin darauf)
  commit_trailer: ${a.identity.commit_trailer}              # Co-Authored-By-Trailer an Commits

language:
  human_facing: ${a.language.human_facing}                  # was die Pipeline PRODUZIERT: Commits, Reviews, neue Docs (de|en)
  agent_facing: ${a.language.agent_facing}                  # Rollen/Guardrails/Skills (Empfehlung: en)
  # Hinweis: die MITGELIEFERTE Doku ist de (human) / en (agent).

platform:
  git_host: ${a.platform.git_host}                  # github | gitlab   (setup.mjs erkennt es aus \`git remote -v\`)
  cli: ${a.platform.cli}                           # gh | glab         (setup.mjs setzt das passend zum Host)
  # Hinweis Self-Hosted GitLab: setup.mjs bindet das Marketplace-Binding standardmaessig an
  # gitlab.com; bei einem eigenen GitLab-Host die generierte Marketplace-URL in
  # .claude/settings.json (extraKnownMarketplaces) danach von Hand anpassen.

agent_runtime: ${a.agent_runtime}          # claude-code (volles Enforcement) | other (nur Methodik → docs/runtime-boundary.md)

# setup.mjs fragt deine Abo-Stufe und schreibt ein Preset:
#   Pro:  alles sonnet, effort-gestaffelt (Methodik voll nutzbar)
#   Max:  opus-Orchestrator + sonnet-3-Tier (empfohlen, Default unten)
#   API/eigene: Namen frei eintragen (setup.mjs befüllt mit dem Max-Preset als Startpunkt)
models:
  design:
    model: ${a.models.design.model}
    effort: ${a.models.design.effort}
  implement:
    model: ${a.models.implement.model}
    effort: ${a.models.implement.effort}
  mechanic:
    model: ${a.models.mechanic.model}
    effort: ${a.models.mechanic.effort}
  review:
    model: ${a.models.review.model}
    effort: ${a.models.review.effort}
  advisor:
    enabled: ${a.models.advisor.enabled}                  # optionales 2nd-Opinion-Muster; DEFAULT AUS
    # Fallback ohne Advisor-Zugang: advisor-consult-Subagent (dokumentiert)

autonomy:
  push_policy: ${a.autonomy.push_policy}                # gated | standing-approved
  branch_model: ${a.autonomy.branch_model}      # feature-branch | direct-main
  wip_limit: ${a.autonomy.wip_limit}

gates:
  dev_plan: ${a.gates.dev_plan}                # blocking | warn | off
  push: ${a.gates.push}
  security: ${a.gates.security}
  claude_md_max_lines: ${a.gates.claude_md_max_lines}

# -----------------------------------------------------------------------------------------
# Advanced/Autonom-Beispiel (NICHT aktiv — nur zur Orientierung; setup.mjs schreibt diese
# Werte automatisch, wenn du beim Autonomie-Preset "Autonom" wählst):
#
# autonomy:
#   push_policy:  standing-approved
#   branch_model: direct-main
#   wip_limit: 1
#
# models:
#   advisor:
#     enabled: true
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
  return {
    identity: { ...d.identity, ...(parsed.identity && typeof parsed.identity === "object" ? parsed.identity : {}) },
    language: { ...d.language, ...(parsed.language && typeof parsed.language === "object" ? parsed.language : {}) },
    platform: { ...d.platform, ...(parsed.platform && typeof parsed.platform === "object" ? parsed.platform : {}) },
    agent_runtime: g(parsed, "agent_runtime", d.agent_runtime),
    models: {
      design: { ...d.models.design, ...(parsed.models?.design ?? {}) },
      implement: { ...d.models.implement, ...(parsed.models?.implement ?? {}) },
      mechanic: { ...d.models.mechanic, ...(parsed.models?.mechanic ?? {}) },
      review: { ...d.models.review, ...(parsed.models?.review ?? {}) },
      advisor: { ...d.models.advisor, ...(parsed.models?.advisor ?? {}) },
    },
    autonomy: { ...d.autonomy, ...(parsed.autonomy ?? {}) },
    gates: { ...d.gates, ...(parsed.gates ?? {}) },
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
          permissions: { allow: ["Bash(git push*)", "PowerShell(git push*)"] },
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
export function renderPipelineYaml(answers, sourceHash) {
  const pushApproval = answers.autonomy.push_policy === "standing-approved" ? "standing-approved" : "required";
  return `# pipeline.yaml -- declarative pipeline manifest (.claude/pipeline.yaml, schema pipeline.manifest.v0).
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
  elephant:
    model: ${answers.models.design.model}
    effort: ${answers.models.design.effort}
  goldfish:
    model: ${answers.models.implement.model}
    effort: ${answers.models.implement.effort}
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
    console.log(`  ${label}: bereits aktuell (unveraendert).`);
    return { wrote: false, decision };
  }
  if (decision.action === "write") {
    writeFileSync(path, wantedText);
    console.log(`  ${label}: kompiliert (${decision.reason}).`);
    return { wrote: true, decision };
  }

  // decision.action === "warn"
  const reasonText =
    decision.reason === "unparseable"
      ? "die bestehende Datei ist kein gueltiges JSON/YAML -- bitte von Hand pruefen"
      : "Hand-Edit-Drift erkannt (Datei weicht vom letzten Kompilat ab, obwohl pipeline.user.yaml seither unveraendert ist)";
  console.warn(`  WARNUNG ${label}: ${reasonText}.`);

  const disposition = resolveWarnDisposition({ force, interactive: interactive && !!rl });
  if (disposition === "write-forced") {
    console.warn(`  WARNUNG ${label}: --force/--yes gesetzt -- ueberschreibe die hand-editierte Datei OHNE Rueckfrage.`);
    writeFileSync(path, wantedText);
    console.log(`  ${label}: ueberschrieben (--force).`);
    return { wrote: true, decision };
  }
  if (disposition === "prompt") {
    const answer = (await rl.question(`  ${label} trotzdem ueberschreiben? [y/N] `)).trim().toLowerCase();
    if (["y", "yes", "j", "ja"].includes(answer)) {
      writeFileSync(path, wantedText);
      console.log(`  ${label}: ueberschrieben (Bestaetigung erhalten).`);
      return { wrote: true, decision };
    }
  }
  console.warn(`  ${label}: NICHT ueberschrieben -- bitte manuell abgleichen.`);
  return { wrote: false, decision };
}

async function promptAnswers(rl, previous) {
  console.log("\n=== Agent-Pipeline Setup ===\n");

  const runtimeIn = (await rl.question(`Runtime? [claude-code/other] (${previous.agent_runtime}) `)).trim();
  const agent_runtime = runtimeIn === "other" ? "other" : runtimeIn === "" ? previous.agent_runtime : "claude-code";
  if (agent_runtime === "other") {
    console.log(
      "  Hinweis: 'other' bedeutet portable Methodik ohne volles Hook-/Gate-Enforcement -- siehe docs/runtime-boundary.md.",
    );
  }

  const owner_name = (await rl.question(`Dein Name (${previous.identity.owner_name}): `)).trim() || previous.identity.owner_name;
  const repo_owner =
    (await rl.question(`GitHub/GitLab-Owner deines Repos (${previous.identity.repo_owner}): `)).trim() || previous.identity.repo_owner;
  const repo_name = (await rl.question(`Repo-Name (${previous.identity.repo_name}): `)).trim() || previous.identity.repo_name;

  const humanIn = (await rl.question(`Sprache -- human-facing (Commits/Reviews/neue Docs) [de/en] (${previous.language.human_facing}): `)).trim();
  const agentIn = (await rl.question(`Sprache -- agent-facing (Rollen/Guardrails/Skills) [de/en] (${previous.language.agent_facing}): `)).trim();

  const aboIn = (await rl.question(`Abo-Stufe? [pro/max/api] (max) `)).trim().toLowerCase() || "max";
  const models = applyAboPreset(aboIn);
  if (aboIn !== "pro" && aboIn !== "max") {
    console.log(
      "  API/eigene gewaehlt: Modelle mit dem Max-Preset vorbefuellt -- trage deine eigenen Modellnamen/Effort-Werte direkt in pipeline.user.yaml ein und fuehre `node setup.mjs` danach erneut aus.",
    );
  }

  const autonomyIn = (await rl.question(`Autonomie-Preset? [konservativ/autonom] (konservativ) `)).trim().toLowerCase() || "konservativ";
  const autonomy = applyAutonomyPreset(autonomyIn);
  if (autonomyIn.startsWith("autonom")) models.advisor = { enabled: true };

  const git_host = detectGitHost(ROOT_DIR);
  const cli = cliForHost(git_host);
  console.log(`  Erkannt: Betriebssystem=${classifyOs(process.platform)}, Git-Host=${git_host}, CLI=${cli}.`);

  return {
    identity: { owner_name, repo_owner, repo_name, commit_trailer: previous.identity.commit_trailer },
    language: { human_facing: humanIn ? normalizeLang(humanIn) : previous.language.human_facing, agent_facing: agentIn ? normalizeLang(agentIn) : previous.language.agent_facing },
    platform: { git_host, cli },
    agent_runtime,
    models,
    autonomy,
    gates: previous.gates,
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
Setup abgeschlossen.

Naechste Schritte:
  1. Plugin im eigenen Repo binden (falls noch nicht geschehen):
       ${addCmd}
       claude plugin install pipeline-core@agent-pipeline --scope project
  2. Neue Claude-Code-Session starten -- der Bootstrap-Check laeuft automatisch
     (/pipeline-core:pipeline-start).
  3. Ersten Lauf im Profil "quick" ausprobieren (Details: SETUP.md).
  4. pipeline.user.yaml jederzeit anpassbar -- danach \`node setup.mjs\` erneut ausfuehren.

Details: SETUP.md (Haupteinstieg), docs/usage.md (Alltag).
`);
}

export function parseArgv(argv) {
  return {
    defaults: argv.includes("--defaults"),
    help: argv.includes("--help") || argv.includes("-h"),
    force: argv.includes("--force") || argv.includes("--yes"),
  };
}

export async function run(argv = process.argv.slice(2)) {
  const opts = parseArgv(argv);
  if (opts.help) {
    console.log(
      "Usage: node setup.mjs [--defaults] [--force|--yes] [--help]\n  (no flags)     interactive setup\n  --defaults     non-interactive: conservative defaults, no prompts (test/CI)\n  --force/--yes  skip the hand-edit-drift confirmation (interactive) or allow the\n                 otherwise-refused overwrite (non-interactive) -- always warns loudly first\n  --help         this text",
    );
    return 0;
  }

  const defaults = buildDefaultAnswers();
  const { raw: existingUserYamlRaw, parsed: existingUserYamlParsed } = loadUserYamlSafe(USER_YAML_PATH);
  const previous = answersFromParsed(existingUserYamlParsed, defaults);

  let rl = null;
  let answers;
  if (opts.defaults) {
    // Detection still runs (never a "question") -- only the five interactive questions are
    // replaced by the deterministic defaults (see file header "DETECTION vs. QUESTIONS").
    const git_host = detectGitHost(ROOT_DIR);
    answers = { ...defaults, platform: { git_host, cli: cliForHost(git_host) } };
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

  if (existingUserYamlRaw !== userYamlText) {
    writeFileSync(USER_YAML_PATH, userYamlText);
    console.log("pipeline.user.yaml geschrieben.");
  } else {
    console.log("pipeline.user.yaml bereits aktuell (unveraendert).");
  }

  const sourceHash = shortHash(userYamlText);
  const interactive = !opts.defaults;

  console.log("\nKompiliere Laufzeit-Configs:");

  const settingsState = readJsonSafe(SETTINGS_JSON_PATH);
  const settingsWanted = JSON.stringify(compileSettingsJson(settingsState.parsed, answers, sourceHash), null, 2) + "\n";
  await applyCompileDecision({
    label: ".claude/settings.json",
    path: SETTINGS_JSON_PATH,
    existingState: settingsState,
    wantedText: settingsWanted,
    sourceHash,
    interactive,
    rl,
    force: opts.force,
  });

  const pipelineJsonState = readJsonSafe(PIPELINE_JSON_PATH);
  const pipelineJsonWanted = JSON.stringify(compilePipelineJson(pipelineJsonState.parsed, answers, sourceHash), null, 2) + "\n";
  await applyCompileDecision({
    label: ".claude/pipeline.json",
    path: PIPELINE_JSON_PATH,
    existingState: pipelineJsonState,
    wantedText: pipelineJsonWanted,
    sourceHash,
    interactive,
    rl,
    force: opts.force,
  });

  const pipelineYamlExists = existsSync(PIPELINE_YAML_PATH);
  const pipelineYamlRaw = pipelineYamlExists ? readFileSync(PIPELINE_YAML_PATH, "utf8") : null;
  const pipelineYamlWanted = renderPipelineYaml(answers, sourceHash);
  await applyCompileDecision({
    label: ".claude/pipeline.yaml",
    path: PIPELINE_YAML_PATH,
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
