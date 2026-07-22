#!/usr/bin/env node
/**
 * setup.mjs — the Shareable Edition's personalization compiler.
 *
 * The historical legacy v1 compiler turned its ONE source-of-intent config
 * (`pipeline.user.yaml`) into the three runtime-canonical configs this repo
 * already ships and reads at every session
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
 * THREE-SCOPE BOUNDARY: Public Core contains no account, private-repository, credential, or
 * machine coordinates. It projects the one generic public agent-pipeline marketplace binding.
 * The ignored private overlay supplies only an anonymous immutable Shared SHA; machine-local
 * credentials remain outside this compiler and are never parsed or projected here.
 *
 * LEGACY BUILDER: `renderUserYaml(DEFAULT_ANSWERS)` remains deterministic only
 * for migration fixtures and compatibility tests. It deliberately emits v1 and
 * is no longer byte-identical to the committed V3 source. Normal setup never
 * invokes this builder and never writes the source or runtime projections.
 *
 * V3 AUTHORITY CUTOVER: legacy compiler and V2 verification helpers remain for
 * compatibility tests, but normal setup accepts only `pipeline.user.v3` plus
 * its V3 runtime projections. The explicit V3 migration owns every source or
 * runtime write needed to reach that state. This prevents an old profile-level
 * `advisor: off` value from disabling runner-neutral advisory.
 *
 * USAGE:
 *   node setup.mjs              verifies the current V3 source/runtime state
 *   node setup.mjs --defaults   same verification path; it never recreates a
 *                                legacy v1 source or projection
 *   node setup.mjs --configure-advisor-export
 *                              disclose the repository export boundary, ask
 *                              with default enabled, and record only that V3
 *                              consent field atomically
 *   node setup.mjs --publish-po-profile
 *                              validates only the canonical primary PO-language
 *                              pair and publishes its private common receipt
 *   node setup.mjs --force      (or --yes) is rejected: only the V3 migration's
 *                                `apply --activate` may write V3 authority.
 *   node setup.mjs --help       usage text, exit 0
 *
 * VERIFY: node setup.test.mjs (pure-function coverage: detection/preset/render/drift
 * logic). The suite and the live routing-projection checker are wired into Full Verify.
 */
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { parseYaml, YamlLiteError } from "./plugins/pipeline-core/lib/yaml-lite.mjs";
import { validateAgainstSchema } from "./plugins/pipeline-core/lib/schema-lite.mjs";
import { loadManifest, loadPolicyLock, resolveHumanFacingLanguage, validateManifest } from "./plugins/pipeline-core/lib/manifest.mjs";
import { validatePipelineUserV2 } from "./plugins/pipeline-core/lib/runner-profiles-v2.mjs";
import { planRuntimeProjectionV2, readRuntimeProjectionV2Baselines } from "./plugins/pipeline-core/lib/runtime-projection-v2.mjs";
import { validatePipelineUserV3 } from "./plugins/pipeline-core/lib/runner-profiles-v3.mjs";
import { planRuntimeProjectionV3, readRuntimeProjectionV3Baselines } from "./plugins/pipeline-core/lib/runtime-projection-v3.mjs";
import { runToolchainPreflight } from "./plugins/pipeline-core/scripts/toolchain-preflight.mjs";
import {
  migrateLegacyRouting,
  projectClaudeManifestRouting,
  projectClaudeRouteInputs,
  projectDirectRoutingDefaults,
  projectManifestRouting,
  projectPreset,
  projectRunnerRoutes,
  routingProvenance,
  validateDirectRouting,
} from "./plugins/pipeline-core/lib/routing-projection.mjs";
import {
  PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  poGateProfileReceiptPath,
  resolvePoGateRepositoryTopology,
  serializePoGateProfileReceipt,
  validatePoGateLanguageProjection,
} from "./plugins/pipeline-core/lib/po-gate-authority.mjs";

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
export const HUMAN_FACING_LANGUAGES = Object.freeze(["de", "en"]);
export const RUNNER_PROFILE_V2_MIGRATION_COMMAND = "node plugins/pipeline-core/scripts/runner-profile-migration-v2.mjs";
export const RUNNER_PROFILE_V3_MIGRATION_COMMAND = "node plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs";
export const ADVISOR_EXPORT_CONFIGURATION_COMMAND = "node setup.mjs --configure-advisor-export";
export const ADVISOR_EXPORT_DISCLOSURE = [
  "Advisor export is repository-scoped and enabled by default.",
  "The configured same-runner advisor receives one advisory question and the allowlisted repository candidate material needed to answer it.",
  "It does not authorize secrets, credentials, unrelated paths, raw question/answer persistence, or a runner/model substitution.",
  "Set advisor_export.consent to declined to opt out; only an explicit decline keeps Advisory off without starting a probe or child.",
].join("\n");
export const ADVISOR_EXPORT_ENABLED_STATUS = "Advisory export is enabled: the repository default applies unless consent is explicitly declined; only one advisory question and allowlisted candidate material may be exported.";
export const ADVISOR_EXPORT_DISABLED_STATUS = "Advisory is disabled: advisor export consent is explicitly declined.";

export function renderAdvisorExportStatus(advisorExport) {
  return advisorExport?.enabled === true ? ADVISOR_EXPORT_ENABLED_STATUS : ADVISOR_EXPORT_DISABLED_STATUS;
}

export function renderToolchainSetupReport(preflight) {
  if (!preflight || !Array.isArray(preflight.results)) return ["Toolchain prerequisites: unavailable (invalid preflight result)."];
  const relevant = preflight.results.filter(({ status }) => status !== "not_required");
  const lines = [`Toolchain prerequisites: ${preflight.ok ? "ready" : preflight.code}.`];
  for (const entry of relevant) {
    const version = entry.version === null ? "version n/a" : `version ${entry.version}`;
    lines.push(`  ${entry.tool}: ${entry.status} (${version})`);
    if (entry.affectedClaim) lines.push(`    Blocked claim: ${entry.affectedClaim}`);
    if (entry.installCommand) lines.push(`    Review, then run: ${entry.installCommand}`);
    else if (entry.guidance && entry.status !== "ready") lines.push(`    ${entry.guidance}`);
  }
  lines.push("  Setup did not install or modify any tool.");
  return lines;
}

/** V3 is the only setup authority after the runner-neutral advisory cutover. */
export function v3MigrationRequiredMessage(schema) {
  const source = schema === "pipeline.user.v2"
    ? "The detected pipeline.user.v2 is an accepted one-way V3 migration input."
    : schema === "pipeline.user.v1" || schema === undefined || schema === null
      ? "The detected legacy source is accepted only as a V3 migration input."
      : "pipeline.user.yaml is not a current pipeline.user.v3 authority.";
  return [
    `setup.mjs: runner-neutral advisory requires pipeline.user.v3 before setup can continue. ${source}`,
    "No source or runtime projection was written.",
    "Inspect and review the digest-only plan before explicit activation:",
    `  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} inspect --root \"$PWD\"`,
    `  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} plan --root \"$PWD\"`,
    `  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} apply --root \"$PWD\" --activate`,
  ].join("\n");
}

/**
 * P3B deliberately keeps activation outside this legacy compiler.  It must
 * not turn a v0/v1 route, especially its unresolved `terra` alias, into a
 * fresh authoritative runtime projection.  I3 validates, plans, and
 * transactionally applies the frozen v2 authority instead.
 */
export function v2MigrationRequiredMessage(schema) {
  const source = schema === "pipeline.user.v1"
    ? "The detected pipeline.user.v1 is accepted only as an I3 migration input."
    : schema === undefined || schema === null
      ? "pipeline.user.yaml is absent or unreadable."
      : "pipeline.user.yaml is not a current pipeline.user.v2 authority.";
  return [
    `setup.mjs: P3B requires pipeline.user.v2 before setup can continue. ${source}`,
    "No files were written; legacy v1 routing and its Terra alias were not compiled.",
    "Inspect and review the explicit migration before activation:",
    `  ${RUNNER_PROFILE_V2_MIGRATION_COMMAND} inspect --root \"$PWD\"`,
    `  ${RUNNER_PROFILE_V2_MIGRATION_COMMAND} plan --root \"$PWD\"`,
    `  ${RUNNER_PROFILE_V2_MIGRATION_COMMAND} apply --root \"$PWD\" --activate`,
  ].join("\n");
}

/**
 * Validate the v2 source and verify that its declared I2-owned runtime
 * projections are already current.  This is deliberately read-only: I3 owns
 * explicit activation, while the legacy setup compiler must never regenerate
 * a v1 source or overwrite a v2-owned projection.
 */
export function validateV2SourceAndRuntime(intent, rootDir = ROOT_DIR) {
  const source = "pipeline.user.yaml";
  const intentValidation = validatePipelineUserV2(intent, { source });
  if (!intentValidation.ok) {
    return { ok: false, reason: "invalid-v2-source", diagnostics: intentValidation.errors };
  }
  let projection;
  try {
    projection = planRuntimeProjectionV2(intent, {
      source,
      baselines: readRuntimeProjectionV2Baselines(rootDir),
    });
  } catch (error) {
    return { ok: false, reason: "v2-runtime-unreadable", diagnostics: [{ path: "$.runtime", code: "baseline_read", message: error.message }] };
  }
  if (projection.status !== "ready") {
    return { ok: false, reason: "invalid-v2-runtime", diagnostics: projection.diagnostics ?? [] };
  }
  const staleTargets = projection.targets.filter((target) => target.changed).map((target) => target.path);
  if (staleTargets.length > 0) {
    return { ok: false, reason: "v2-runtime-drift", diagnostics: staleTargets.map((path) => ({
      path,
      code: "runtime_projection_drift",
      message: "the declared v2 runtime projection is not current",
      repair: "run the explicit runner-profile migration apply command with activation",
    })) };
  }
  return { ok: true, diagnostics: [] };
}

/** Read back the complete generated V3 manifest, including optional document Policy state. */
export function validateV3ManifestReadback(rootDir = ROOT_DIR, deps = {}) {
  const result = (deps.loadManifest ?? loadManifest)(rootDir);
  if (result.status === "ok") return { ok: true, diagnostics: [] };
  return {
    ok: false,
    reason: "invalid-v3-manifest",
    diagnostics: [{
      path: "$.runtime.manifest",
      code: "manifest_readback",
      message: "the compiled V3 manifest, document Policy, or document runtime projection is invalid",
      repair: "repair the public source/runtime mismatch before setup or activation",
    }],
  };
}

/** Read-only V3 source and runtime convergence check used by normal setup. */
export function validateV3SourceAndRuntime(intent, rootDir = ROOT_DIR) {
  const source = "pipeline.user.yaml";
  const intentValidation = validatePipelineUserV3(intent, { source });
  if (!intentValidation.ok) return { ok: false, reason: "invalid-v3-source", diagnostics: intentValidation.errors };
  let projection;
  try {
    projection = planRuntimeProjectionV3(intent, { source, baselines: readRuntimeProjectionV3Baselines(rootDir) });
  } catch (error) {
    return { ok: false, reason: "v3-runtime-unreadable", diagnostics: [{ path: "$.runtime", code: "baseline_read", message: error.message }] };
  }
  if (projection.status !== "ready") return { ok: false, reason: "invalid-v3-runtime", diagnostics: projection.diagnostics ?? [] };
  const staleTargets = projection.targets.filter((target) => target.changed).map((target) => target.path);
  if (staleTargets.length > 0) {
    return { ok: false, reason: "v3-runtime-drift", diagnostics: staleTargets.map((path) => ({
      path,
      code: "runtime_projection_drift",
      message: "the declared V3 runtime projection is not current",
      repair: "run the explicit V3 runner-profile migration apply command with activation",
    })) };
  }
  const manifestReadback = validateV3ManifestReadback(rootDir);
  if (!manifestReadback.ok) return manifestReadback;
  return { ok: true, diagnostics: [] };
}

/** Patch only the optional public-safe V3 consent block. */
export function renderAdvisorExportConsent(sourceBytes, consent) {
  if (!["approved", "declined"].includes(consent)) throw new Error("advisor export consent must be approved or declined");
  const parsed = parseYaml(sourceBytes);
  const before = validatePipelineUserV3(parsed, { source: "pipeline.user.yaml" });
  if (!before.ok) throw new Error("pipeline.user.yaml must be valid pipeline.user.v3 before advisor export consent can change");
  const eol = sourceBytes.includes("\r\n") ? "\r\n" : "\n";
  const rendered = `advisor_export:${eol}  consent: ${JSON.stringify(consent)}${eol}`;
  const lines = sourceBytes.split(/(?<=\n)/u);
  let offset = 0;
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/[\r\n]+$/u, "");
    if (!/^advisor_export:\s*(?:#.*)?$/u.test(line)) {
      offset += lines[index].length;
      continue;
    }
    const start = offset;
    let end = sourceBytes.length;
    let cursor = offset + lines[index].length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].replace(/[\r\n]+$/u, "");
      if (candidate.length > 0 && !candidate.startsWith(" ") && !candidate.startsWith("\t")) {
        end = cursor;
        break;
      }
      cursor += lines[next].length;
    }
    blocks.push({ start, end });
    offset += lines[index].length;
  }
  if (blocks.length > 1) throw new Error("pipeline.user.yaml contains duplicate advisor_export blocks");
  const updated = blocks.length === 1
    ? `${sourceBytes.slice(0, blocks[0].start)}${rendered}${sourceBytes.slice(blocks[0].end)}`
    : `${rendered}${sourceBytes}`;
  const after = validatePipelineUserV3(parseYaml(updated), { source: "pipeline.user.yaml" });
  if (!after.ok || after.advisoryExport.consent !== consent) throw new Error("advisor export consent patch did not produce valid pipeline.user.v3 authority");
  return updated;
}

function writeAdvisorExportConsentAtomic(path, bytes) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("pipeline.user.yaml must be a regular project-local file");
  const temporary = `${path}.advisor-export-${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx", mode: info.mode & 0o777 });
    const descriptor = openSync(temporary, constants.O_RDONLY);
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
    throw error;
  }
}

// AGENTS.md is deliberately outside normal setup.  These constants identify only the
// one public legacy adapter that this repository shipped; unknown files are never read
// as text, copied, logged, or overwritten.
export const LEGACY_AGENTS_ADAPTER = Object.freeze({
  byteLength: 3510,
  gitBlob: "ede2f138fd199d2789f24e5f46ce1875ff1c2c10",
});
export const MIGRATED_AGENTS_ADAPTER = `# Agent-Pipeline optional runtime adapter

This file is a pointer, not a second ruleset.

Before project work, invoke \`pipeline-core:pipeline-start\`. It is the required
methodological entry and loads the calibrated runtime authorities.

Authorities: runtime manifest \`.claude/pipeline.yaml\` and Operating Model
\`docs/operating-model.md\`. Follow their re-entry rule.

For Codex and other non-Claude runtimes this is methodology-only. It claims no
Claude hooks, foreign tool or agent integration, model binding, or global host
enforcement.
`;
export const MIGRATED_AGENTS_ADAPTER_BLOB = "be9380c80a52ae45cfcdcbb3b6e7ebf6e2df01af";
export const PIPELINE_START_AUTHORITY = Object.freeze({
  reference: "pipeline-core:pipeline-start",
  byteLength: 33583,
  sha256: "78d141525a90f7ff97c4e34489b2f180531d3b77f0fa1480fcf323842a1e4335",
});
export const MIGRATED_AGENTS_DIRTY_TRANSITION = Object.freeze({ additions: 9, deletions: 62 });

// ---- legacy v1 default answers (migration/test compatibility only) ----------------------------
export function buildDefaultAnswers() {
  const directRouting = projectDirectRoutingDefaults();
  const legacyProjection = projectClaudeRouteInputs(directRouting);
  return {
    schema: "pipeline.user.v1",
    setup: { intent: "unconfigured" },
    language: { human_facing: "en", agent_facing: "en" },
    agent_runtime: "claude-code",
    // `routing` is the sole editable v1 source. These two values are derived
    // compatibility projections for the still-stable Claude manifest only.
    routing: directRouting,
    ...legacyProjection,
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "blocking", claude_md_max_lines: 200 },
  };
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

// ---- optional AGENTS adapter migration ----------------------------------------------------------
// This boundary accepts only public-safe file metadata plus a detached digest result.  It never
// decodes, parses, retains, copies, or prints an unknown AGENTS.md body.
export function classifyAgentsAdapter({ exists, isFile = false, byteLength, gitBlob, isClean = false, worktreeBlob, additions, deletions } = {}) {
  if (!exists) return { status: "absent", mutable: false };
  if (!isFile || !Number.isInteger(byteLength)) return { status: "manual-po-gate", mutable: false };
  if (isClean && byteLength === LEGACY_AGENTS_ADAPTER.byteLength && gitBlob === LEGACY_AGENTS_ADAPTER.gitBlob) {
    return { status: "known-legacy", mutable: true };
  }
  if (isClean && byteLength === Buffer.byteLength(MIGRATED_AGENTS_ADAPTER) && gitBlob === MIGRATED_AGENTS_ADAPTER_BLOB) {
    return { status: "migrated", mutable: false };
  }
  // A successful write is intentionally not staged by setup.  Recognize only that exact
  // one-step legacy→pointer transition; no other dirty state is admissible.
  if (
    !isClean &&
    byteLength === Buffer.byteLength(MIGRATED_AGENTS_ADAPTER) &&
    gitBlob === LEGACY_AGENTS_ADAPTER.gitBlob &&
    worktreeBlob === MIGRATED_AGENTS_ADAPTER_BLOB &&
    additions === MIGRATED_AGENTS_DIRTY_TRANSITION.additions &&
    deletions === MIGRATED_AGENTS_DIRTY_TRANSITION.deletions
  ) return { status: "migrated", mutable: false };
  return { status: "manual-po-gate", mutable: false };
}

export function inspectAgentsAdapter(rootDir, deps = {}) {
  const path = join(rootDir, "AGENTS.md");
  const exists = deps.existsSync ?? existsSync;
  if (!exists(path)) return classifyAgentsAdapter({ exists: false });
  let stat;
  try {
    stat = (deps.lstatSync ?? lstatSync)(path);
  } catch {
    return { status: "manual-po-gate", mutable: false };
  }
  if (!stat.isFile()) return classifyAgentsAdapter({ exists: true, isFile: false });
  const byteLength = stat.size;
  // Do not invoke any content helper. A known public Git blob plus clean working-tree
  // metadata is the fixed integrity proof; every other same-size file is manual/PO-only.
  if (![LEGACY_AGENTS_ADAPTER.byteLength, Buffer.byteLength(MIGRATED_AGENTS_ADAPTER)].includes(byteLength)) {
    return classifyAgentsAdapter({ exists: true, isFile: true, byteLength });
  }
  const gitState = deps.agentsAdapterGitState
    ? deps.agentsAdapterGitState(path)
    : (() => {
        const spawn = deps.spawn ?? spawnSync;
        const index = safeSpawn(spawn, "git", ["ls-files", "--stage", "--", "AGENTS.md"], { cwd: rootDir }).stdout.trim();
        const blob = /^100\d+\s+([0-9a-f]{40})\s+\d+\tAGENTS\.md$/i.exec(index)?.[1] ?? null;
        let isClean = false;
        try { isClean = spawn("git", ["diff", "--quiet", "--", "AGENTS.md"], { cwd: rootDir }).status === 0; } catch { /* manual gate below */ }
        if (isClean || blob !== LEGACY_AGENTS_ADAPTER.gitBlob || byteLength !== Buffer.byteLength(MIGRATED_AGENTS_ADAPTER)) return { gitBlob: blob, isClean };
        const numstat = safeSpawn(spawn, "git", ["diff", "--numstat", "--", "AGENTS.md"], { cwd: rootDir }).stdout.trim();
        const diff = /^(\d+)\t(\d+)\tAGENTS\.md$/.exec(numstat);
        if (!diff || Number(diff[1]) !== MIGRATED_AGENTS_DIRTY_TRANSITION.additions || Number(diff[2]) !== MIGRATED_AGENTS_DIRTY_TRANSITION.deletions) return { gitBlob: blob, isClean };
        const worktreeBlob = safeSpawn(spawn, "git", ["hash-object", "--", "AGENTS.md"], { cwd: rootDir }).stdout.trim();
        return { gitBlob: blob, isClean, worktreeBlob, additions: Number(diff[1]), deletions: Number(diff[2]) };
      })();
  return classifyAgentsAdapter({
    exists: true,
    isFile: true,
    byteLength,
    gitBlob: gitState?.gitBlob,
    isClean: gitState?.isClean === true,
    worktreeBlob: gitState?.worktreeBlob,
    additions: gitState?.additions,
    deletions: gitState?.deletions,
  });
}

/** Validates the three authorities named by the migrated pointer before any target write. */
export function validateAgentsAdapterMigrationAuthority({ runtimeManifestText, pipelineStartAuthority, operatingModelPresent, rootDir = ROOT_DIR } = {}) {
  if (typeof runtimeManifestText !== "string") return { ok: false, reason: "runtime-manifest-unreadable" };
  if (validateCompiledPipelineYaml(runtimeManifestText, rootDir).status !== "ok") return { ok: false, reason: "runtime-manifest-invalid" };
  if (!pipelineStartAuthority || pipelineStartAuthority.reference !== PIPELINE_START_AUTHORITY.reference) return { ok: false, reason: "pipeline-start-reference-mismatch" };
  if (pipelineStartAuthority.byteLength !== PIPELINE_START_AUTHORITY.byteLength || pipelineStartAuthority.sha256 !== PIPELINE_START_AUTHORITY.sha256) return { ok: false, reason: "pipeline-start-authority-mismatch" };
  if (operatingModelPresent !== true) return { ok: false, reason: "operating-model-unavailable" };
  return { ok: true };
}

/**
 * Explicit migration only. Normal setup never calls this function, never creates AGENTS.md,
 * and never examines its presence. A rejected authority or adapter state returns before write.
 */
export function migrateAgentsAdapter(rootDir = ROOT_DIR, deps = {}) {
  let runtimeManifestText;
  try {
    runtimeManifestText = deps.runtimeManifestText ?? readFileSync(join(rootDir, ".claude", "pipeline.yaml"), "utf8");
  } catch {
    return { ok: false, status: "authority-failed", reason: "runtime-manifest-unreadable", writes: 0 };
  }
  const present = (path) => {
    try { return (deps.lstatSync ?? lstatSync)(path).isFile(); } catch { return false; }
  };
  const pipelineStartPath = join(rootDir, "plugins", "pipeline-core", "skills", "pipeline-start", "SKILL.md");
  let pipelineStartAuthority = deps.pipelineStartAuthority;
  if (pipelineStartAuthority === undefined) {
    try {
      const stat = (deps.lstatSync ?? lstatSync)(pipelineStartPath);
      const sha256 = safeSpawn(deps.spawn ?? spawnSync, "sha256sum", [pipelineStartPath], { cwd: rootDir }).stdout.trim().split(/\s+/)[0];
      pipelineStartAuthority = { reference: PIPELINE_START_AUTHORITY.reference, byteLength: stat.isFile() ? stat.size : null, sha256 };
    } catch {
      pipelineStartAuthority = null;
    }
  }
  const authority = validateAgentsAdapterMigrationAuthority({
    runtimeManifestText,
    pipelineStartAuthority,
    operatingModelPresent: deps.operatingModelPresent ?? present(join(rootDir, "docs", "operating-model.md")),
    rootDir,
  });
  if (!authority.ok) return { ok: false, status: "authority-failed", reason: authority.reason, writes: 0 };

  const adapter = deps.agentsAdapterState ?? inspectAgentsAdapter(rootDir, deps);
  if (adapter.status === "known-legacy") {
    (deps.writeAgentsAdapter ?? writeFileSync)(join(rootDir, "AGENTS.md"), MIGRATED_AGENTS_ADAPTER);
    return { ok: true, status: "migrated", writes: 1 };
  }
  if (adapter.status === "absent" || adapter.status === "migrated") return { ok: true, status: adapter.status, writes: 0 };
  return { ok: false, status: "manual-po-gate", writes: 0 };
}

// ---- legacy-v0 migration / autonomy helpers (pure) ----------------------------------------------
/**
 * Legacy-v0 migration compatibility only. Interactive setup never calls this
 * function and never asks a subscription question.
 */
export function applyAboPreset(tier) {
  return projectPreset(tier === "pro" ? "pro" : "max", "claude");
}

/** @param {string} preset - "autonom"/"autonomous" or anything else ("conservative") */
export function applyAutonomyPreset(preset) {
  const p = String(preset ?? "").toLowerCase();
  if (p.startsWith("autonom")) return { push_policy: "standing-approved", branch_model: "direct-main", wip_limit: 1 };
  return { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 };
}

/**
 * Legacy-v0 test/migration compatibility for the former subscription preset
 * flow. New configuration and interactive setup use only v1 direct routes.
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
  return HUMAN_FACING_LANGUAGES.includes(value) ? value : null;
}

/**
 * The source profile is the only authority for a runtime PO-facing language.
 * A missing, empty, or unsupported source value must never be repaired by a
 * default: that would emit an unreliable compiled authority.
 */
export function validateHumanFacingLanguage(value) {
  return HUMAN_FACING_LANGUAGES.includes(value)
    ? { ok: true, value }
    : { ok: false, reason: "language.human_facing must be an explicit supported value (de or en)" };
}

function renderDirectRoute(lines, indent, route) {
  lines.push(`${indent}runner: ${route.runner}`);
  lines.push(`${indent}selector:`);
  lines.push(`${indent}  kind: ${route.selector.kind}`);
  lines.push(`${indent}  value: ${route.selector.value}`);
  lines.push(`${indent}effort: ${route.effort}`);
  lines.push(`${indent}unavailability: ${route.unavailability}`);
  lines.push(`${indent}evidenceRequirement: ${route.evidenceRequirement}`);
}

/** Render the single editable v1 routing authority. */
export function renderDirectRoutingYaml(routing) {
  const checked = validateDirectRouting(routing);
  if (!checked.ok) throw new Error(`invalid direct routing: ${checked.errors.join(", ")}`);
  const lines = ["routing:", "  worktypes:"];
  for (const [profile, worktype] of Object.entries(routing.worktypes)) {
    lines.push(`    ${profile}:`);
    for (const phase of ["design_phase", "execution_phase", "advisor"]) {
      const route = worktype[phase];
      if (route === "off") lines.push(`      ${phase}: "off"`);
      else {
        lines.push(`      ${phase}:`);
        renderDirectRoute(lines, "        ", route);
      }
    }
  }
  lines.push("  duties:");
  for (const [duty, route] of Object.entries(routing.duties)) {
    lines.push(`    ${duty}:`);
    renderDirectRoute(lines, "      ", route);
  }
  return lines.join("\n");
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
# \`setup-check.mjs\` recognizes this unconfigured state. Personal coordinates and
# credentials belong only in ignored machine-local mapping, never in Public Core.

schema: ${a.schema}

setup:
  intent: ${a.setup.intent}                  # unconfigured | consumer | maintainer

language:
  human_facing: ${a.language.human_facing}                  # what the Pipeline PRODUCES: commits, reviews, new docs (de|en)
  agent_facing: ${a.language.agent_facing}                  # roles/guardrails/skills (recommended: en)
  # Note: the SHIPPED documentation is de (human) / en (agent).

agent_runtime: ${a.agent_runtime}          # claude-code (full enforcement) | other (methodology only → docs/runtime-boundary.md)

# Direct v1 route source. Every enabled duty/worktype names its runner surface,
# selector, effort, unavailability policy and required dispatch evidence. The
# generated Claude modelRouting and provider-neutral runnerRoutes are projections,
# never second editable authorities. Codex Terra aliases remain unresolved until
# a host/CLI route receipt observes a concrete model ID.
${renderDirectRoutingYaml(a.routing)}

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
  // v0 had separate editable worktypes/models. Convert it once in memory to
  // the v1 sole source; setup validates the complete rendered v1 before any
  // source/runtime write. A v1 document remains structurally intact here so a
  // malformed source cannot be silently repaired by defaults.
  const routing = parsed.schema === "pipeline.user.v1" && parsed.routing && typeof parsed.routing === "object"
    ? parsed.routing
    : migrateLegacyRouting(parsed.worktypes, parsed.models);
  let legacyProjection;
  try {
    legacyProjection = projectClaudeRouteInputs(routing);
  } catch {
    legacyProjection = { worktypes: d.worktypes, models: d.models };
  }
  return {
    schema: "pipeline.user.v1",
    setup: { ...d.setup, ...(parsed.setup && typeof parsed.setup === "object" ? parsed.setup : {}) },
    language: { ...d.language, ...(parsed.language && typeof parsed.language === "object" ? parsed.language : {}) },
    agent_runtime: g(parsed, "agent_runtime", d.agent_runtime),
    routing,
    ...legacyProjection,
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
          extraKnownMarketplaces: {
            "agent-pipeline": {
              source: { source: "github", repo: "agent-pipe-shared/agent-pipeline" },
            },
          },
          enabledPlugins: { "pipeline-core@agent-pipeline": true },
        };
  // The generic public marketplace binding is part of the staleness contract. It has no
  // owner-specific or private coordinates; unrelated caller entries remain untouched.
  const marketplaces =
    base.extraKnownMarketplaces && typeof base.extraKnownMarketplaces === "object"
      ? { ...base.extraKnownMarketplaces }
      : {};
  marketplaces["agent-pipeline"] = {
    source: { source: "github", repo: "agent-pipe-shared/agent-pipeline" },
  };
  base.extraKnownMarketplaces = marketplaces;
  base.$generated = generatedMarker(sourceHash);
  return base;
}

/** @param {object|null} existing - previously-parsed pipeline.json, or null if absent/corrupt */
export function compilePipelineJson(existing, answers, sourceHash) {
  const base =
    existing && typeof existing === "object"
      ? { ...existing }
      : {
          project: "pipeline-project",
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

export function renderModelRoutingYaml(worktypes, models) {
  const routing = projectManifestRouting(worktypes, models);
  const lines = [
    "modelRouting:",
    `  # Generated projection: ${routingProvenance("claude")} source=pipeline.user.yaml.`,
    "  # Do not edit this block as an independent routing authority.",
  ];
  for (const [role, assignment] of Object.entries(routing)) {
    lines.push(`  ${role}:`);
    lines.push(`    model: ${assignment.model}`);
    lines.push(`    effort: ${assignment.effort}`);
  }
  return lines.join("\n");
}

/** Render both runtime projections from the one v1 direct-routing source. */
export function renderDirectRoutingProjectionsYaml(routing) {
  const claudeRouting = projectClaudeManifestRouting(routing);
  const runnerRoutes = projectRunnerRoutes(routing);
  const lines = [
    "modelRouting:",
    `  # Generated Claude compatibility projection: ${routingProvenance("claude")} source=pipeline.user.yaml routing.v1.`,
    "  # Do not edit this block as an independent routing authority.",
  ];
  for (const [role, assignment] of Object.entries(claudeRouting)) {
    lines.push(`  ${role}:`);
    lines.push(`    model: ${assignment.model}`);
    lines.push(`    effort: ${assignment.effort}`);
  }
  lines.push("", "runnerRoutes:");
  lines.push(`  # Generated provider-neutral projection: ${routingProvenance("codex")} source=pipeline.user.yaml routing.v1.`);
  lines.push("  # Alias resolution is not provider/model attestation; only a valid route receipt can attest it.");
  for (const [name, route] of Object.entries(runnerRoutes)) {
    lines.push(`  ${name}:`);
    lines.push(`    runner: ${route.runner}`);
    lines.push("    selector:");
    lines.push(`      kind: ${route.selector.kind}`);
    lines.push(`      value: ${route.selector.value}`);
    lines.push(`    effort: ${route.effort}`);
    lines.push(`    unavailability: ${route.unavailability}`);
    lines.push(`    evidenceRequirement: ${route.evidenceRequirement}`);
    lines.push(`    resolutionStatus: ${route.resolutionStatus}`);
    if (typeof route.resolutionEvidence === "string") lines.push(`    resolutionEvidence: ${route.resolutionEvidence}`);
  }
  return lines.join("\n");
}

export function renderPipelineYaml(answers, sourceHash) {
  const pushApproval = answers.autonomy.push_policy === "standing-approved" ? "standing-approved" : "required";
  const base = `# pipeline.yaml -- declarative pipeline manifest (.claude/pipeline.yaml, schema pipeline.manifest.v0).
# ${generatedMarker(sourceHash)}
# ADDITIVE to .claude/pipeline.json (project calibration) -- disjoint field sets.
# Validate with: node harness/scripts/validate-manifest.mjs

schema: pipeline.manifest.v0

language:
  human_facing: ${answers.language.human_facing}

session:
  keep_awake: ${answers.session?.keep_awake === true ? "true" : "false"}

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

${renderDirectRoutingProjectionsYaml(answers.routing)}

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
  const result = validateManifest(manifest, { rootDir });
  if (result.status !== "ok") return result;
  const language = resolveHumanFacingLanguage(manifest);
  if (language.ok) return result;
  return {
    ...result,
    status: "invalid",
    errors: [{ path: "language.human_facing", expected: "an explicit compiled PO-facing language", got: "missing or unsupported", reason: language.reason }],
  };
}

/**
 * Check the source/runtime projection before PO-facing authoring. Consumers
 * still derive language only from the compiled runtime value; this guard merely
 * rejects a stale or hand-edited runtime projection rather than repairing it.
 */
export function validatePoFacingLanguageProjection(userYamlText, runtimeYamlText, rootDir = ROOT_DIR) {
  let source;
  let runtime;
  try {
    source = parseYaml(userYamlText);
    runtime = parseYaml(runtimeYamlText);
  } catch (error) {
    return { ok: false, reason: `unreadable PO-language projection: ${error.message}` };
  }
  if (source.schema === "pipeline.user.v3") {
    const v3 = validateV3SourceAndRuntime(source, rootDir);
    if (!v3.ok) return { ok: false, reason: "pipeline.user.v3 or its declared runtime projection is invalid; run the explicit V3 migration/apply workflow before PO-facing authoring" };
  } else if (source.schema === "pipeline.user.v2") {
    const v2 = validateV2SourceAndRuntime(source, rootDir);
    if (!v2.ok) return { ok: false, reason: "pipeline.user.v2 or its declared runtime projection is invalid; run the explicit v2 migration/apply workflow before PO-facing authoring" };
  } else {
    const schema = JSON.parse(readFileSync(USER_SCHEMA_PATH, "utf8"));
    const sourceShape = validateAgainstSchema(source, schema);
    if (!sourceShape.valid) return { ok: false, reason: "pipeline.user.yaml is invalid; correct it before PO-facing authoring" };
    if (!validateDirectRouting(source.routing).ok) {
      return { ok: false, reason: "pipeline.user.yaml direct routing is invalid; correct it before PO-facing authoring" };
    }
  }
  const sourceLanguage = validateHumanFacingLanguage(source.language?.human_facing);
  if (!sourceLanguage.ok) return sourceLanguage;
  const runtimeValidation = validateCompiledPipelineYaml(runtimeYamlText, rootDir);
  if (runtimeValidation.status !== "ok") return { ok: false, reason: "compiled runtime language is invalid; re-run setup" };
  const runtimeLanguage = resolveHumanFacingLanguage(runtime);
  if (!runtimeLanguage.ok) return runtimeLanguage;
  if (sourceLanguage.value !== runtimeLanguage.value) {
    return { ok: false, reason: "compiled runtime language disagrees with validated pipeline.user.yaml; re-run setup before PO-facing authoring" };
  }
  return { ok: true, value: runtimeLanguage.value };
}

function ensurePhysicalPrivateDirectory(commonDir, relativeDirectory) {
  let cursor = realpathSync(commonDir);
  for (const component of relativeDirectory.split(/[\\/]/u).filter(Boolean)) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(cursor) !== cursor) {
      throw new Error("unsafe local receipt directory");
    }
  }
  return cursor;
}

function fsyncDirectory(path) {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } catch (error) {
    // Windows has no directory-handle fsync semantics: opening a directory read-only and
    // syncing it fails closed with EPERM/EINVAL/etc even though the prior file rename/fsync
    // already durably committed the data. Treat directory sync as best-effort on win32 only;
    // regular-file fsync elsewhere in this module remains hard on every platform.
    if (process.platform !== "win32" || !["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error.code)) {
      throw error;
    }
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Publish the repository-local profile authority after source/runtime validation.
 * The operation never copies a profile into another worktree and never returns an
 * absolute machine path as evidence.
 */
export function publishPoGateProfileReceipt({
  rootDir,
  userYamlText,
  runtimeYamlText,
  updatedAt = new Date().toISOString(),
}, deps = {}) {
  const projection = validatePoGateLanguageProjection(userYamlText, runtimeYamlText);
  if (!projection.ok) return { ok: false, code: "PO-PROFILE-PROJECTION-INVALID", reason: projection.reason };

  let topology;
  try {
    topology = deps.topology ?? resolvePoGateRepositoryTopology(rootDir, deps);
  } catch {
    return { ok: false, code: "PO-PROFILE-TOPOLOGY-INVALID", reason: "repository topology is unavailable" };
  }
  if (realpathSync(rootDir) !== topology.primaryRoot || topology.repoRoot !== topology.primaryRoot) {
    return { ok: false, code: "PO-PROFILE-NOT-PRIMARY", reason: "sanctioned setup must run from the canonical primary checkout" };
  }

  let temporary = null;
  let published = false;
  try {
    const receipt = createPoGateProfileReceipt({
      repositoryFingerprint: derivePoGateRepositoryFingerprint({
        gitCommonDir: topology.gitCommonDir,
        primaryRoot: topology.primaryRoot,
      }),
      primaryRoot: topology.primaryRoot,
      sourceBytes: userYamlText,
      runtimeBytes: runtimeYamlText,
      updatedAt,
    });
    const target = poGateProfileReceiptPath(topology.gitCommonDir);
    const relativeParent = dirname(PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(sep).join("/");
    const parent = ensurePhysicalPrivateDirectory(topology.gitCommonDir, relativeParent);
    if (relative(topology.gitCommonDir, parent).startsWith("..")) throw new Error("receipt parent escaped Git common directory");
    if (existsSync(target)) {
      const current = lstatSync(target);
      if (!current.isFile() || current.isSymbolicLink() || realpathSync(target) !== target) throw new Error("unsafe receipt target");
    }
    temporary = join(parent, `.profile-receipt.${process.pid}.${randomUUID()}.tmp`);
    const serializedReceipt = serializePoGateProfileReceipt(receipt);
    const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      writeFileSync(descriptor, serializedReceipt);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    temporary = null;
    published = true;
    fsyncDirectory(parent);
    return {
      ok: true,
      code: "PO-PROFILE-RECEIPT-PUBLISHED",
      humanFacing: receipt.humanFacing,
      receiptSha256: createHash("sha256").update(serializedReceipt).digest("hex"),
    };
  } catch {
    if (temporary !== null && existsSync(temporary)) {
      try { unlinkSync(temporary); } catch { /* best-effort cleanup of an unpublished temp */ }
    }
    if (published) {
      return { ok: false, code: "PO-PROFILE-RECEIPT-DURABILITY-UNKNOWN", reason: "the atomic receipt rename succeeded but directory durability could not be confirmed" };
    }
    return { ok: false, code: "PO-PROFILE-RECEIPT-WRITE-FAILED", reason: "the common profile receipt could not be published atomically" };
  }
}

// ---- private overlay lock preflight -------------------------------------------------------------
// The ignored overlay intentionally contains only an anonymous immutable Public-Core SHA.
// Account/path mapping and credentials remain machine-local and are neither parsed nor
// projected here; the generic public marketplace binding is compiled separately.
export function validateSharedLock(lockSha, checkedOutSha) {
  if (typeof lockSha !== "string" || !/^[0-9a-f]{40}$/i.test(lockSha)) {
    return { ok: false, reason: "missing-or-malformed-shared-sha" };
  }
  if (typeof checkedOutSha !== "string" || !/^[0-9a-f]{40}$/i.test(checkedOutSha)) {
    return { ok: false, reason: "unavailable-checked-out-sha" };
  }
  if (lockSha.toLowerCase() !== checkedOutSha.toLowerCase()) {
    return { ok: false, reason: "shared-sha-mismatch" };
  }
  return { ok: true };
}

/**
 * Setup owns no resolver or source trust runtime.  It nevertheless refuses to mutate
 * a governed checkout when its fixed managed lock is not statically resolved: this is
 * the same pre-mutation boundary the deploy guard receives through manifest validation.
 */
export function validatePolicyLockPreflight(rootDir, deps = {}) {
  const result = deps.policyLockResult ?? loadPolicyLock(rootDir);
  if (result.status === "unbound" || result.status === "resolved") return { ok: true };
  if (result.lock?.mode === "advisory") return { ok: true, warning: `managed policy lock status: ${result.status}` };
  return { ok: false, reason: `managed-policy-lock-${result.status}` };
}

export function readPrivateOverlayLock(rootDir, deps = {}) {
  if (deps.lockSha !== undefined || deps.checkedOutSha !== undefined) {
    return validateSharedLock(deps.lockSha, deps.checkedOutSha);
  }
  const overlayPath = join(rootDir, ".pipeline", "private-overlay.yaml");
  let lockSha;
  try {
    const parsed = parseYaml(readFileSync(overlayPath, "utf8"));
    lockSha = parsed?.shared?.sha;
  } catch {
    return { ok: false, reason: "missing-or-malformed-shared-sha" };
  }
  const head = safeSpawn(deps.spawn ?? spawnSync, "git", ["rev-parse", "HEAD"], { cwd: rootDir });
  return validateSharedLock(lockSha, head.ok ? head.stdout.trim() : null);
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

async function promptDirectRouting(rl, previous) {
  const edit = (await rl.question("Edit direct role/worktype routes now? [y/N] ")).trim().toLowerCase();
  const routing = structuredClone(previous);
  if (!['y', 'yes', 'j', 'ja'].includes(edit)) return routing;
  const routes = [];
  for (const [profile, worktype] of Object.entries(routing.worktypes)) {
    for (const phase of ["design_phase", "execution_phase", "advisor"]) {
      if (worktype[phase] !== "off") routes.push([`worktype ${profile}/${phase}`, worktype, phase]);
    }
  }
  for (const [duty, route] of Object.entries(routing.duties)) routes.push([`duty ${duty}`, routing.duties, duty]);
  for (const [label, parent, key] of routes) {
    const route = parent[key];
    const kind = (await rl.question(`${label} selector kind [alias/model-id] (${route.selector.kind}): `)).trim();
    const value = (await rl.question(`${label} selector value (${route.selector.value}): `)).trim();
    const effort = (await rl.question(`${label} effort [low/medium/high/xhigh/max] (${route.effort}): `)).trim();
    const unavailability = (await rl.question(`${label} when unavailable [defer/mapped-fallback] (${route.unavailability}): `)).trim();
    parent[key] = {
      ...route,
      selector: { kind: kind || route.selector.kind, value: value || route.selector.value },
      effort: effort || route.effort,
      unavailability: unavailability || route.unavailability,
    };
  }
  return routing;
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

  const intentIn = (await rl.question(`Setup intent [consumer/maintainer] (${previous.setup.intent === "unconfigured" ? "consumer" : previous.setup.intent}): `)).trim();
  const intent = intentIn === "maintainer" ? "maintainer" : intentIn === "consumer" ? "consumer" : previous.setup.intent === "unconfigured" ? "consumer" : previous.setup.intent;

  const humanIn = (await rl.question(`Language -- human-facing (commits/reviews/new docs) [de/en] (${previous.language.human_facing}): `)).trim();
  const agentIn = (await rl.question(`Language -- agent-facing (roles/guardrails/skills) [de/en] (${previous.language.agent_facing}): `)).trim();

  const autonomyIn = (
    await rl.question(
      `Autonomy preset -- press Enter to KEEP your current autonomy setting, or type conservative/autonomous to re-pick a preset (overwrites it): `,
    )
  ).trim().toLowerCase();
  const routing = await promptDirectRouting(rl, previous.routing);
  const { worktypes, models } = projectClaudeRouteInputs(routing);
  const autonomy = autonomyIn === "" ? previous.autonomy : applyAutonomyPreset(autonomyIn);

  return {
    schema: "pipeline.user.v1",
    setup: { intent },
    language: { human_facing: humanIn ? normalizeLang(humanIn) : previous.language.human_facing, agent_facing: agentIn ? normalizeLang(agentIn) : previous.language.agent_facing },
    agent_runtime,
    routing,
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

function printNextSteps() {
  console.log(`
Setup complete.

Next steps:
  1. The generic public marketplace binding was compiled into .claude/settings.json.
     Install pipeline-core at project scope.
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
    migrateAgentsAdapter: argv.includes("--migrate-agents-adapter"),
    publishPoProfile: argv.includes("--publish-po-profile"),
    configureAdvisorExport: argv.includes("--configure-advisor-export"),
  };
}

export async function run(argv = process.argv.slice(2), deps = {}) {
  const rootDir = deps.rootDir ?? ROOT_DIR;
  const userYamlPath = join(rootDir, "pipeline.user.yaml");
  const opts = parseArgv(argv);
  if (opts.help) {
    console.log(
      `Usage: node setup.mjs [--defaults] [--configure-advisor-export] [--publish-po-profile] [--migrate-agents-adapter] [--help]
  (no flags)     verify the current pipeline.user.v3 and V3-owned projections
  --defaults     same read-only V3 verification for CI/automation
  --configure-advisor-export
                 show the repository export disclosure, ask with default decline,
                 and atomically record approved/declined in pipeline.user.yaml
  --publish-po-profile  publish only the canonical primary PO-language receipt;
                 no runner/profile migration or runtime rewrite
  --migrate-agents-adapter  explicit, optional migration of the one recognized public legacy adapter
  --help         this text

Legacy v0/v1/v2 sources are never compiled. Review and activate their one-way V3 migration with:
  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} inspect --root "$PWD"
  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} plan --root "$PWD"
  ${RUNNER_PROFILE_V3_MIGRATION_COMMAND} apply --root "$PWD" --activate`,
    );
    return 0;
  }
  if (opts.migrateAgentsAdapter) {
    if (opts.defaults || opts.force || opts.publishPoProfile || opts.configureAdvisorExport || argv.length !== 1) {
      console.error("setup.mjs: --migrate-agents-adapter is a standalone explicit command; no files were written.");
      return 1;
    }
    const result = migrateAgentsAdapter(rootDir, deps);
    console.log(`AGENTS adapter migration: ${result.status}.`);
    return result.ok ? 0 : 2;
  }
  if (opts.publishPoProfile) {
    if (opts.defaults || opts.force || opts.configureAdvisorExport || argv.length !== 1) {
      console.error("setup.mjs: --publish-po-profile is a standalone explicit command; no profile or route was written.");
      return 1;
    }
    let userYamlText;
    let runtimeYamlText;
    try {
      userYamlText = readFileSync(userYamlPath, "utf8");
      runtimeYamlText = readFileSync(join(rootDir, ".claude", "pipeline.yaml"), "utf8");
    } catch {
      console.error("setup.mjs: canonical primary PO-language source/runtime is unreadable; no receipt was written.");
      return 2;
    }
    const publish = (deps.publishPoGateProfileReceipt ?? publishPoGateProfileReceipt)({
      rootDir,
      userYamlText,
      runtimeYamlText,
      updatedAt: (deps.now ?? (() => new Date().toISOString()))(),
    }, deps);
    if (!publish.ok) {
      console.error(`setup.mjs: ${publish.code} (${publish.reason}); no profile, route or PRD was copied or rewritten.`);
      return 2;
    }
    console.log(`Repository-scoped PO profile receipt published for language ${publish.humanFacing}.`);
    return 0;
  }
  if (opts.force) {
    console.error("setup.mjs: --force/--yes cannot authorize a V3 authority write; use the explicit V3 apply --activate workflow.");
    return 2;
  }

  const { raw: existingUserYamlRaw, parsed: existingUserYamlParsed } = loadUserYamlSafe(userYamlPath);
  const hasV3Source = existingUserYamlRaw !== null && existingUserYamlParsed?.schema === "pipeline.user.v3";
  const needsV1Migration = existingUserYamlRaw !== null && existingUserYamlParsed?.schema !== "pipeline.user.v1";
  if (!hasV3Source) {
    console.error(v3MigrationRequiredMessage(existingUserYamlParsed?.schema));
    return 2;
  }
  if (opts.configureAdvisorExport) {
    if (opts.defaults || opts.force || argv.length !== 1) {
      console.error("setup.mjs: --configure-advisor-export is a standalone explicit command; no files were written.");
      return 1;
    }
    const validateV3 = deps.validateV3SourceAndRuntime ?? validateV3SourceAndRuntime;
    const v3 = validateV3(existingUserYamlParsed, rootDir);
    if (!v3.ok) {
      console.error(`setup.mjs: pipeline.user.v3 is not ready (${v3.reason}); advisor export consent was not changed.`);
      return 1;
    }
    console.log(ADVISOR_EXPORT_DISCLOSURE);
    let answer = deps.advisorExportConsentAnswer;
    if (answer === undefined) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { answer = await rl.question("Disable advisor export for this repository? [y/N] "); }
      finally { rl.close(); }
    }
    const normalized = String(answer ?? "").trim().toLowerCase();
    const consent = ["y", "yes", "j", "ja", "declined"].includes(normalized) ? "declined" : "approved";
    try {
      const updated = renderAdvisorExportConsent(existingUserYamlRaw, consent);
      (deps.writeAdvisorExportConsentAtomic ?? writeAdvisorExportConsentAtomic)(userYamlPath, updated);
    } catch (error) {
      console.error(`setup.mjs: advisor export consent was not recorded (${error.message}).`);
      return 1;
    }
    console.log(`Advisor export consent recorded as ${consent}.`);
    return 0;
  }
  if (existingUserYamlRaw !== null) {
    const sourceLanguage = validateHumanFacingLanguage(existingUserYamlParsed?.language?.human_facing);
    if (!sourceLanguage.ok) {
      console.error(`setup.mjs: ${sourceLanguage.reason}; correct pipeline.user.yaml before compiling.`);
      return 1;
    }
    const validateV3 = deps.validateV3SourceAndRuntime ?? validateV3SourceAndRuntime;
    const v3 = validateV3(existingUserYamlParsed, rootDir);
    if (!v3.ok) {
      console.error(`setup.mjs: pipeline.user.v3 is not ready (${v3.reason}); no files were written.`);
      for (const diagnostic of v3.diagnostics) console.error(`  ${diagnostic.path}: ${diagnostic.message}`);
      return 1;
    }
    console.log("pipeline.user.v3 and its runner-neutral advisory runtime projections are current; setup performed no writes.");
    const advisorExport = validatePipelineUserV3(existingUserYamlParsed, { source: "pipeline.user.yaml" }).advisoryExport;
    if (!advisorExport.enabled) {
      console.log(renderAdvisorExportStatus(advisorExport));
      console.log(`To review the disclosure and configure consent, run:\n  ${ADVISOR_EXPORT_CONFIGURATION_COMMAND}`);
    } else {
      console.log(renderAdvisorExportStatus(advisorExport));
    }
    let toolchain;
    try {
      toolchain = (deps.runToolchainPreflight ?? runToolchainPreflight)({ rootDir });
    } catch (error) {
      console.error(`setup.mjs: toolchain preflight failed (${error.message}); no tool was installed.`);
      return 2;
    }
    for (const line of renderToolchainSetupReport(toolchain)) console.log(line);
    return toolchain.exitCode;
    if (existingUserYamlParsed?.schema === "pipeline.user.v1") {
      const sourceSchema = JSON.parse(readFileSync(USER_SCHEMA_PATH, "utf8"));
      const sourceShape = validateAgainstSchema(existingUserYamlParsed, sourceSchema);
      const sourceRouting = validateDirectRouting(existingUserYamlParsed.routing);
      if (!sourceShape.valid || !sourceRouting.ok) {
        console.error("setup.mjs: pipeline.user.v1 is invalid; correct it before compiling. No files were written.");
        return 1;
      }
    }
  }
  const previous = answersFromParsed(existingUserYamlParsed, defaults);

  let rl = null;
  let answers;
  if (opts.defaults) {
    // Non-interactive setup has no environment-derived inputs: it writes deterministic public
    // defaults only. Account and machine mapping is intentionally out of scope.
    const routing = needsV1Migration ? previous.routing : defaults.routing;
    answers = {
      ...defaults,
      routing,
      ...projectClaudeRouteInputs(routing),
      setup: defaults.setup,
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
  const compiledLanguage = validateHumanFacingLanguage(answers.language?.human_facing);
  if (!compiledLanguage.ok) {
    if (rl) rl.close();
    console.error(`setup.mjs: ${compiledLanguage.reason}; no files were written.`);
    return 1;
  }
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
  const directRouting = validateDirectRouting(answers.routing);
  if (!valid || !directRouting.ok) {
    if (rl) rl.close();
    console.error("setup.mjs: internal error -- generated pipeline.user.yaml failed schema validation:");
    for (const e of errors) console.error(`  ${e}`);
    for (const e of directRouting.errors ?? []) console.error(`  routing: ${e}`);
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

  const policyLockPreflight = validatePolicyLockPreflight(rootDir, deps);
  if (!policyLockPreflight.ok) {
    if (rl) rl.close();
    console.error(`setup.mjs: managed policy lock failed (${policyLockPreflight.reason}); no files were written.`);
    return 1;
  }
  if (policyLockPreflight.warning) console.warn(`setup.mjs: WARNING ${policyLockPreflight.warning}.`);

  const lockPreflight = readPrivateOverlayLock(rootDir, deps);
  if (!lockPreflight.ok) {
    if (rl) rl.close();
    console.error(`setup.mjs: private-overlay Shared-SHA lock failed (${lockPreflight.reason}); no files were written.`);
    return 1;
  }

  if (existingUserYamlRaw !== userYamlText) {
    if (needsV1Migration) console.log("Migration preview: pipeline.user.v0 -> pipeline.user.v1 direct routes (Claude projection preserved; Codex aliases remain receipt-bound).");
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
  printNextSteps();
  return 0;
}

// Only auto-run when executed directly (`node setup.mjs`), never on import (setup.test.mjs
// imports the exported functions above without triggering the real CLI/exit) -- same
// Windows-safe pathToFileURL comparison used throughout this plugin (e.g.
// post-compact-reground.mjs, staleness-check.mjs).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
