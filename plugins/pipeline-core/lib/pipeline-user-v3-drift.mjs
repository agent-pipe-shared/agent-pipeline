// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-user-v3-drift.mjs -- read-only detection of a pipeline.user.yaml
 * that already declares `schema: pipeline.user.v3` but no longer satisfies
 * validatePipelineUserV3 (NVA-AGYDRIFT-2;
 * scratch/stripped-NVA-AGYDRIFT-2-item.md records the originating gap).
 *
 * An earlier attempt at this same gap (NVA-AGYDRIFT-1, commit 8316dbd8) was
 * withdrawn at 1d6dec55 for two independent defects: it validated against the
 * PRE-v3 `pipeline.user.schema.json` (wrong authority -- it would have
 * reported a correct, fully-onboarded v3 calibration as drifted, the exact
 * opposite of the intended behavior), and it named a Pipeline-source-only
 * compile entrypoint as the repair command -- a path that resolves only
 * inside the Pipeline's own source checkout and never inside an installed
 * consumer plugin (the repository's own consumer-safe-path gate, AC-11,
 * caught it). Both are fixed here: the schema authority is
 * validatePipelineUserV3 (./runner-profiles-v3.mjs), the SAME closed
 * validator runner-profile-migration-v3.mjs already uses to classify a v3
 * source, and the named repair command below resolves under the plugin's own
 * shipped `scripts/` directory.
 *
 * SCOPE. This module concerns only a source that already declares
 * `schema: pipeline.user.v3` and has fallen behind WITHIN v3. A source on an
 * older schema (v0/v1/v2, or no recognizable schema at all) is the EXISTING
 * one-way migration's job (./runner-profile-migration-v3.mjs) -- this module
 * deliberately does not rebuild, extend, or duplicate that migration, and
 * reports such a source as `not-v3` rather than guessing at v3 drift for it.
 *
 * DETECT AND REPORT ONLY, NEVER SILENT MIGRATION/REWRITE: pipeline.user.yaml
 * governs security behavior up to and including the push-approval mode, so a
 * drifted file is surfaced with a named, consumer-invokable repair command an
 * operator runs deliberately -- this module never writes, moves, or rewrites
 * pipeline.user.yaml or any compiled artifact under any input.
 *
 * REPAIR COMMAND. `node <plugin-root>/scripts/project-onboarding-v3.mjs
 * plan-source-recovery --root <project-dir> --runner <claude|codex>` is the
 * existing, shipped, consumer-invokable entry point
 * (planProjectOnboardingSourceRecoveryV4 in project-onboarding-v3.mjs) that
 * already triages a drifted V3 source: the two known compatibility deltas it
 * recognizes (routing-registry refresh, critic_export addition) resolve to a
 * bounded, explicit-activation repair action; any other drift -- including
 * the general within-v3 shape this module detects -- is reported
 * "unrepairable" with an explicit instruction to correct pipeline.user.yaml
 * through its owning workflow, rather than a false promise of full
 * automation. `<plugin-root>` is the absolute path the session bootstrap
 * prints as "plugin root" -- the same placeholder convention
 * templates/prompts/agent-obligations.md already uses for `repair-map.mjs`,
 * because the real command target (`ONBOARDING_SCRIPT` in
 * project-onboarding-v3.mjs) is resolved from `import.meta.url` at runtime,
 * never a repo-relative string a consumer checkout would not have.
 *
 * Precedent: follows the inspect-function result-object convention
 * established by inspectRunnerProfileMigrationV3 (./runner-profile-migration-
 * v3.mjs) -- a plain, JSON-serializable result object, never a thrown error
 * for a data problem.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/): only node:fs/node:path
 * built-ins plus the two existing dependency-free siblings imported below --
 * no new runtime dependency, no YAML library beyond yaml-lite.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const SOURCE_FILE = "pipeline.user.yaml";
const INSPECT_SCHEMA = "pipeline.pipeline-user-v3-drift-inspect.v1";
const REPAIR_COMMAND =
  "node <plugin-root>/scripts/project-onboarding-v3.mjs plan-source-recovery --root <project-dir> --runner <claude|codex>";

/**
 * `repair` carries a specific, human-readable hint for THIS diagnostic (either
 * one supplied by the caller -- typically the validator's own per-error hint,
 * e.g. "restore every registered entry" -- or one generated below for a
 * pre-validation failure). `repairCommand` is always the one generic,
 * consumer-invokable command (see the module header): the two are
 * deliberately separate fields so a specific hint the schema authority
 * already produced is never discarded in favor of the generic command.
 */
function diagnostic(path, code, message, repair) {
  return { path, code, message, repair, repairCommand: REPAIR_COMMAND };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read-only inspection: resolves `<rootDir>/pipeline.user.yaml` and, ONLY when
 * it already declares `schema: pipeline.user.v3`, validates its shape against
 * validatePipelineUserV3 and reports drift by exact key path. Never writes,
 * moves, or rewrites pipeline.user.yaml or any compiled artifact under any
 * input. Never throws: an absent source, an unreadable source, unparseable
 * YAML, or a non-v3/malformed-root source all resolve to a typed result
 * instead of an exception.
 *
 * @param {object} [options]
 * @param {string} [options.rootDir] - repository root to resolve pipeline.user.yaml
 *   against (defaults to the current working directory).
 * @returns {{schema: string, status: string, root: string, source: string, drifted: boolean, diagnostics: Array}}
 */
export function inspectPipelineUserV3Drift({ rootDir = process.cwd() } = {}) {
  const sourcePath = join(rootDir, SOURCE_FILE);
  if (!existsSync(sourcePath)) {
    return {
      schema: INSPECT_SCHEMA, status: "source-absent", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "source_absent", `${SOURCE_FILE} does not exist at the repository root`, "create pipeline.user.yaml at the repository root, or run onboarding")],
    };
  }
  let bytes;
  try {
    bytes = readFileSync(sourcePath, "utf8");
  } catch (error) {
    return {
      schema: INSPECT_SCHEMA, status: "source-unreadable", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "source_unreadable", error.message, "restore read access to pipeline.user.yaml")],
    };
  }
  let parsed;
  try {
    parsed = parseYaml(bytes);
  } catch (error) {
    return {
      schema: INSPECT_SCHEMA, status: "source-unparseable", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "yaml_parse", `${SOURCE_FILE} is not valid yaml-lite input: ${error.message}`, "repair the source YAML (see the reported syntax error)")],
    };
  }
  if (!isPlainObject(parsed) || parsed.schema !== "pipeline.user.v3") {
    // Out of this detector's scope by design (see the module header): a
    // source that is not already schema: pipeline.user.v3 is either the
    // existing v0/v1/v2 migration's job, or not a recognized authority at
    // all. Never claim v3-drift about a file this detector did not validate.
    return { schema: INSPECT_SCHEMA, status: "not-v3", root: rootDir, source: SOURCE_FILE, drifted: false, diagnostics: [] };
  }
  const validation = validatePipelineUserV3(parsed, { source: SOURCE_FILE });
  if (validation.ok) {
    return { schema: INSPECT_SCHEMA, status: "conforming", root: rootDir, source: SOURCE_FILE, drifted: false, diagnostics: [] };
  }
  return {
    schema: INSPECT_SCHEMA, status: "drifted", root: rootDir, source: SOURCE_FILE, drifted: true,
    diagnostics: validation.errors.map((error) => diagnostic(error.path, error.code, error.message, error.repair)),
  };
}
