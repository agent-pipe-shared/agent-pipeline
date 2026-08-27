// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-user-drift.mjs -- read-only detection of a pipeline.user.yaml whose
 * shape predates the pipeline.user.schema.json this ruleset now expects
 * (NVA-AGYDRIFT-1; scratch/stripped-agy-drift.md records the originating gap).
 *
 * DETECT AND REPORT ONLY, NEVER SILENT MIGRATION: pipeline.user.yaml governs
 * security behavior up to and including the push-approval mode, so a drifted
 * file must be surfaced with a named repair command an operator runs
 * deliberately -- this module never writes, moves, or rewrites
 * pipeline.user.yaml or any compiled artifact.
 *
 * Structural check only, via the SAME hand-rolled validator every other
 * schema-lite consumer in this plugin uses (./schema-lite.mjs) against
 * pipeline.user.schema.json -- see that schema's own header for exactly what
 * keywords it understands (type/required/properties/items/enum/
 * additionalProperties, no $ref).
 *
 * Precedent: follows the inspect-function result-object convention
 * established by inspectRunnerProfileMigrationV3 (./runner-profile-migration-
 * v3.mjs) -- a plain, JSON-serializable result object, never a thrown error
 * for a data problem.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/): only node:fs/node:path
 * built-ins plus the two existing dependency-free siblings imported below --
 * no new runtime dependency, no schema library, no YAML library.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateAgainstSchema } from "./schema-lite.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const SOURCE_FILE = "pipeline.user.yaml";
const SCHEMA_FILE = "pipeline.user.schema.json";
const INSPECT_SCHEMA = "pipeline.pipeline-user-drift-inspect.v1";
// The already-existing, already-documented re-derive/validate entry point
// (setup.mjs's own header: "owns the compile step (pipeline.user.yaml ->
// .claude/settings.json + pipeline.json + pipeline.yaml)"). Naming it here is
// the deliverable; this module never runs it (see the file header above).
const REPAIR_COMMAND = "node setup.mjs";

function diagnostic(path, code, message) {
  return { path, code, message, repair: REPAIR_COMMAND };
}

/** Split "path: rest" on the FIRST ": " -- schema-lite error messages always start this way. */
function splitMessage(message) {
  const at = message.indexOf(": ");
  return at === -1 ? [message, ""] : [message.slice(0, at), message.slice(at + 2)];
}

/**
 * Turn one schema-lite error string into a drift diagnostic naming the EXACT
 * drifted key path (not merely its parent object's path) plus a stable
 * machine-readable code.
 */
function diagnosticFromSchemaError(message) {
  const [objectPath, rest] = splitMessage(message);
  const missing = rest.match(/^missing required property "([^"]+)"$/u);
  if (missing) return diagnostic(`${objectPath}.${missing[1]}`, "missing_required_property", message);
  const extra = rest.match(/^unexpected additional property "([^"]+)"$/u);
  if (extra) return diagnostic(`${objectPath}.${extra[1]}`, "unexpected_additional_property", message);
  if (rest.startsWith("expected type ")) return diagnostic(objectPath, "type_mismatch", message);
  if (rest.includes("is not one of")) return diagnostic(objectPath, "invalid_enum_value", message);
  return diagnostic(objectPath, "schema_violation", message);
}

/**
 * Read-only inspection: resolves `<rootDir>/pipeline.user.yaml`, validates its
 * structural shape against `pipeline.user.schema.json` via schema-lite.mjs,
 * and reports drift. Never writes, moves, or rewrites `pipeline.user.yaml` or
 * any compiled artifact under any input. Never throws: an absent source,
 * an unreadable source, or unparseable/malformed YAML all resolve to a typed
 * result instead of an exception.
 *
 * @param {object} [options]
 * @param {string} [options.rootDir] - repository root to resolve pipeline.user.yaml against
 *   (defaults to the current working directory).
 * @param {string} [options.schemaPath] - override for pipeline.user.schema.json's location
 *   (defaults to `<rootDir>/pipeline.user.schema.json`, the shipped per-repository location
 *   this schema documents itself as governing).
 * @returns {{schema: string, status: string, root: string, source: string, drifted: boolean, diagnostics: Array}}
 */
export function inspectPipelineUserDrift({ rootDir = process.cwd(), schemaPath = undefined } = {}) {
  const sourcePath = join(rootDir, SOURCE_FILE);
  if (!existsSync(sourcePath)) {
    return {
      schema: INSPECT_SCHEMA, status: "source-absent", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "source_absent", `${SOURCE_FILE} does not exist at the repository root`)],
    };
  }
  let bytes;
  try {
    bytes = readFileSync(sourcePath, "utf8");
  } catch (error) {
    return {
      schema: INSPECT_SCHEMA, status: "source-unreadable", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "source_unreadable", error.message)],
    };
  }
  let parsed;
  try {
    parsed = parseYaml(bytes);
  } catch (error) {
    return {
      schema: INSPECT_SCHEMA, status: "source-unparseable", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "yaml_parse", `${SOURCE_FILE} is not valid yaml-lite input: ${error.message}`)],
    };
  }
  const resolvedSchemaPath = schemaPath ?? join(rootDir, SCHEMA_FILE);
  let schema;
  try {
    schema = JSON.parse(readFileSync(resolvedSchemaPath, "utf8"));
  } catch (error) {
    return {
      schema: INSPECT_SCHEMA, status: "schema-unreadable", root: rootDir, source: SOURCE_FILE, drifted: false,
      diagnostics: [diagnostic("$", "schema_unreadable", error.message)],
    };
  }
  const { valid, errors } = validateAgainstSchema(parsed, schema);
  if (valid) {
    return { schema: INSPECT_SCHEMA, status: "conforming", root: rootDir, source: SOURCE_FILE, drifted: false, diagnostics: [] };
  }
  return {
    schema: INSPECT_SCHEMA, status: "drifted", root: rootDir, source: SOURCE_FILE, drifted: true,
    diagnostics: errors.map(diagnosticFromSchemaError),
  };
}
