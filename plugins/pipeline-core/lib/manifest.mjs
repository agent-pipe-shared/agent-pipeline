/**
 * manifest.mjs -- pipeline.yaml manifest reader/validator.
 *
 * DEPENDENCY-FREE LIBRARY (plugins/pipeline-core/lib/) with the same file-I/O pattern as
 * yaml-lite.mjs's parseYamlFile() and scripts/critic-bare.mjs's loadSchema(): node:fs to
 * read the manifest file and the co-located schema file, node:path/node:url only to locate
 * that schema file relative to this module.
 *
 * NEW FILE: a dedup grep across the repo for "pipeline.yaml", "manifest",
 * "validate-manifest" found ONLY forward-looking planning prose -- no prior manifest
 * reader/validator code anywhere to extend instead. Confirmed zero field overlap
 * with .claude/pipeline.json (project/verify/handover/autonomy/branchModel/verification/
 * wipLimit/worktree/claudeMdMaxLines/stakes/constraints/ritualExtensions -- calibration
 * concerns) vs. this manifest's fields (schema/phases/gates/security/modelRouting/
 * profiles/governance/flags -- declarative pipeline-shape concerns): disjoint sets,
 * pipeline.json is untouched by this delivery.
 *
 * THREE-STAGE VALIDATION PIPELINE
 *   1. YAML parse (yaml-lite.mjs)                 -- syntax errors surface with a source line.
 *   2. Structure validation (schema-lite.mjs against pipeline-manifest.schema.json,
 *      schema id "pipeline.manifest.v0")          -- type/required/enum/additionalProperties.
 *   3. Semantic checks (this file, checkSemantics) -- everything schema-lite's keyword
 *      subset (type, required, properties, items, enum, additionalProperties) cannot
 *      express:
 *        - profiles.active must name a profile actually declared under `profiles`.
 *        - profiles.<name>.phases[] entries must each name a phase actually declared
 *          under the top-level `phases[]` list.
 *        - phases[].condition must match the grammar `always|never|<flag>|!<flag>`, and
 *          a <flag> reference must name a key actually declared under `flags`.
 *        - phases[].name must be unique across the whole `phases[]` list -- yaml-lite
 *          only rejects a duplicate KEY within one mapping (guardrails/... N/A here); two
 *          different LIST ITEMS each having their own `name: foo` are structurally
 *          unrelated to it and never trip that check.
 *
 * FAIL-OPEN CONTRACT
 *   loadManifest() itself never throws: every YAML syntax error, schema violation, or
 *   semantic violation becomes a structured entry in the returned `errors` array (status
 *   "invalid") instead. loadManifestSafe() is the even-more-defensive wrapper meant for
 *   future gate-hook call sites: ANY unexpected internal exception (there should never be
 *   one against the contract above, but a hook must never abort a git operation over a
 *   manifest-reading bug) also collapses to `null` -- exactly like an absent manifest.
 *
 * ERROR SHAPE: `{ path, expected, got, line? }`. `line` is present only for a YAML syntax
 * error (path/expected/got are `null` in that case; the human-readable reason lives in
 * the extra `reason` field) -- see validate-manifest.mjs for how the two shapes render
 * into the two required English message templates.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml, YamlLiteError } from "./yaml-lite.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Co-located schema file (plugins/pipeline-core/scripts/pipeline-manifest.schema.json). */
export const DEFAULT_SCHEMA_PATH = join(SCRIPT_DIR, "..", "scripts", "pipeline-manifest.schema.json");

/** Where a project's manifest lives, relative to its repo root. */
export const DEFAULT_MANIFEST_RELPATH = join(".claude", "pipeline.yaml");

// ---------------------------------------------------------------------------------------------
// Condition grammar: always | never | <flag> | !<flag>. <flag> is a bare identifier
// (letters/digits/underscore, must not start with a digit) -- matches the flag KEYS this
// manifest itself can declare under `flags:` (plain YAML mapping keys).
// ---------------------------------------------------------------------------------------------
const FLAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses a condition string into { kind: "always"|"never"|"flag", flag?, negated? }, or null if it doesn't match the grammar at all. */
function parseCondition(condition) {
  if (condition === "always") return { kind: "always" };
  if (condition === "never") return { kind: "never" };
  const negated = condition.startsWith("!");
  const flagPart = negated ? condition.slice(1) : condition;
  if (!FLAG_NAME_RE.test(flagPart)) return null;
  return { kind: "flag", flag: flagPart, negated };
}

// ---------------------------------------------------------------------------------------------
// Schema loading (file I/O) -- same shape as scripts/critic-bare.mjs's loadSchema().
// ---------------------------------------------------------------------------------------------

/** Loads and JSON.parses the manifest schema file (default: the co-located schema.json). */
export function loadSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

// ---------------------------------------------------------------------------------------------
// schema-lite error-string -> structured {path, expected, got} translation. schema-lite
// (plugins/pipeline-core/lib/schema-lite.mjs) produces exactly four English error-string
// shapes for the keyword subset this schema uses (type, enum, required, additionalProperties:
// false) -- see schema-lite.mjs validateNode() for the authoritative source of these four
// template strings. This function is the ONLY place that knows their exact wording; it is
// deliberately narrow (regex per known shape) rather than a generic string parser -- if
// schema-lite ever changes a message template, the corresponding regex here needs updating
// in lockstep (same "extend in lockstep" contract schema-lite.mjs's own header documents).
// ---------------------------------------------------------------------------------------------

const RE_TYPE_MISMATCH = /^(.+): expected type "(.+)", got "(.+)"$/;
const RE_ENUM_VIOLATION = /^(.+): value (.+) is not one of \[(.+)\]$/;
const RE_MISSING_REQUIRED = /^(.+): missing required property "(.+)"$/;
const RE_ADDITIONAL_PROPERTY = /^(.+): unexpected additional property "(.+)"$/;

/** Strips the schema-lite root marker ("$" or "$.foo.bar") down to a human path ("" or "foo.bar"). */
function normalizePath(schemaLitePath) {
  if (schemaLitePath === "$") return "";
  return schemaLitePath.startsWith("$.") ? schemaLitePath.slice(2) : schemaLitePath;
}

function joinPath(basePath, leaf) {
  return basePath === "" ? leaf : `${basePath}.${leaf}`;
}

/** Translates one schema-lite error string into {path, expected, got}. Falls back to a raw pass-through if the string matches none of the known shapes (defensive -- should not happen against the fixed keyword set above). */
function translateSchemaError(raw) {
  let m;
  if ((m = RE_TYPE_MISMATCH.exec(raw))) {
    return { path: normalizePath(m[1]), expected: `type "${m[2]}"`, got: `type "${m[3]}"` };
  }
  if ((m = RE_ENUM_VIOLATION.exec(raw))) {
    return { path: normalizePath(m[1]), expected: `one of the values [${m[3]}]`, got: m[2] };
  }
  if ((m = RE_MISSING_REQUIRED.exec(raw))) {
    return { path: joinPath(normalizePath(m[1]), m[2]), expected: "present (required field)", got: "missing" };
  }
  if ((m = RE_ADDITIONAL_PROPERTY.exec(raw))) {
    return { path: joinPath(normalizePath(m[1]), m[2]), expected: "a known manifest field", got: "unknown field" };
  }
  return { path: "", expected: raw, got: "(untranslatable schema-lite message)" };
}

// ---------------------------------------------------------------------------------------------
// Semantic checks (beyond schema-lite's keyword subset).
// ---------------------------------------------------------------------------------------------

function declaredPhaseNames(manifest) {
  const phases = Array.isArray(manifest.phases) ? manifest.phases : [];
  return new Set(phases.filter((p) => p && typeof p === "object" && typeof p.name === "string").map((p) => p.name));
}

function checkProfiles(manifest, errors) {
  const profiles = manifest.profiles;
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) return;

  const profileNames = Object.keys(profiles).filter((k) => k !== "active");
  const phaseNames = declaredPhaseNames(manifest);

  if (typeof profiles.active === "string" && !profileNames.includes(profiles.active)) {
    errors.push({
      path: "profiles.active",
      expected: profileNames.length > 0 ? `a declared profile (${profileNames.join(", ")})` : "a profile declared under profiles",
      got: `"${profiles.active}" (unknown)`,
    });
  }

  for (const profileName of profileNames) {
    const profile = profiles[profileName];
    const phaseList = profile && typeof profile === "object" && Array.isArray(profile.phases) ? profile.phases : [];
    phaseList.forEach((phaseName, i) => {
      if (typeof phaseName === "string" && !phaseNames.has(phaseName)) {
        errors.push({
          path: `profiles.${profileName}.phases[${i}]`,
          expected: "a phase name declared under phases[]",
          got: `"${phaseName}" (unknown)`,
        });
      }
    });
  }
}

function checkPhases(manifest, errors) {
  const phases = Array.isArray(manifest.phases) ? manifest.phases : [];
  const flags = manifest.flags && typeof manifest.flags === "object" && !Array.isArray(manifest.flags) ? manifest.flags : {};
  const seenNames = new Map(); // name -> first index

  phases.forEach((phase, i) => {
    if (!phase || typeof phase !== "object") return;

    if (typeof phase.name === "string") {
      if (seenNames.has(phase.name)) {
        errors.push({
          path: `phases[${i}].name`,
          expected: "a phase name unique within the manifest",
          got: `"${phase.name}" (duplicate of phases[${seenNames.get(phase.name)}])`,
        });
      } else {
        seenNames.set(phase.name, i);
      }
    }

    if (typeof phase.condition === "string") {
      const parsed = parseCondition(phase.condition);
      if (!parsed) {
        errors.push({
          path: `phases[${i}].condition`,
          expected: '"always", "never", "<flag>" or "!<flag>"',
          got: `"${phase.condition}"`,
        });
      } else if (parsed.kind === "flag" && !Object.prototype.hasOwnProperty.call(flags, parsed.flag)) {
        errors.push({
          path: `phases[${i}].condition`,
          expected:
            Object.keys(flags).length > 0
              ? `a flag declared under flags (${Object.keys(flags).join(", ")})`
              : "a flag declared under flags",
          got: `"${parsed.flag}" (unknown)`,
        });
      }
    }
  });
}

/** Runs all semantic checks against an already schema-shaped manifest object. Defensive against a manifest that failed schema validation (missing/mistyped fields) -- never throws, silently skips a check whose preconditions are not met (the schema-lite error already covers the shape defect). */
function checkSemantics(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return errors;
  checkProfiles(manifest, errors);
  checkPhases(manifest, errors);
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Loads and validates the manifest at `<rootDir>/<manifestRelPath>` (default
 * `.claude/pipeline.yaml`). Returns `{ status: "absent"|"ok"|"invalid", manifest?, errors }`.
 * Never throws -- every failure mode becomes `status: "invalid"` plus structured `errors`.
 */
export function loadManifest(rootDir, { manifestRelPath = DEFAULT_MANIFEST_RELPATH, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const manifestPath = join(rootDir, manifestRelPath);
  if (!existsSync(manifestPath)) {
    return { status: "absent", errors: [] };
  }

  const text = readFileSync(manifestPath, "utf8");
  let manifest;
  try {
    manifest = parseYaml(text);
  } catch (err) {
    if (err instanceof YamlLiteError) {
      return {
        status: "invalid",
        errors: [{ path: null, expected: null, got: null, line: err.line, reason: err.message.replace(/^line \d+: /, "") }],
      };
    }
    throw err;
  }

  const schema = loadSchema(schemaPath);
  const { valid, errors: rawSchemaErrors } = validateAgainstSchema(manifest, schema);
  const errors = rawSchemaErrors.map(translateSchemaError);
  errors.push(...checkSemantics(manifest));

  if (errors.length > 0) return { status: "invalid", manifest, errors };
  return { status: "ok", manifest, errors: [] };
}

/**
 * Fail-open convenience wrapper for hook call sites (per the briefing: "never throws" is the
 * whole point here). Returns the manifest object on `status: "ok"`, `null` for "absent",
 * "invalid", or any unexpected internal exception -- a hook can always treat `null` as
 * "no active manifest, fall back to today's non-manifest behavior".
 */
export function loadManifestSafe(rootDir, opts) {
  try {
    const result = loadManifest(rootDir, opts);
    return result.status === "ok" ? result.manifest : null;
  } catch {
    return null;
  }
}

/** Returns the config object for gate `name` (e.g. "push"), or `null` if absent/not configured. */
export function gateConfig(manifest, name) {
  if (!manifest || typeof manifest !== "object") return null;
  const gates = manifest.gates;
  if (!gates || typeof gates !== "object") return null;
  const config = gates[name];
  return config && typeof config === "object" ? config : null;
}

/**
 * Resolves the set of phase NAMES that are active right now: intersects the active profile's
 * phase subset (or ALL declared phases, if there is no `profiles` section at all) with
 * `enabled !== false` and a true `condition` (grammar always|never|<flag>|!<flag>, evaluated
 * against `flags`). Returns phase names in the order they are declared under `phases[]`.
 * Defensive against a malformed/absent manifest -- returns `[]` rather than throwing.
 */
export function activePhases(manifest) {
  if (!manifest || typeof manifest !== "object") return [];
  const phases = Array.isArray(manifest.phases) ? manifest.phases : [];
  const flags = manifest.flags && typeof manifest.flags === "object" && !Array.isArray(manifest.flags) ? manifest.flags : {};

  let profileSubset = null; // null = no restriction (no `profiles` section, or active profile has no `phases` list)
  const profiles = manifest.profiles;
  if (profiles && typeof profiles === "object" && typeof profiles.active === "string") {
    const activeProfile = profiles[profiles.active];
    if (activeProfile && typeof activeProfile === "object" && Array.isArray(activeProfile.phases)) {
      profileSubset = new Set(activeProfile.phases);
    }
  }

  const evaluateCondition = (condition) => {
    if (condition === undefined || condition === null) return true;
    const parsed = parseCondition(condition);
    if (!parsed) return false; // grammar violation -- treated as inactive, never as a crash
    if (parsed.kind === "always") return true;
    if (parsed.kind === "never") return false;
    const flagValue = Boolean(flags[parsed.flag]);
    return parsed.negated ? !flagValue : flagValue;
  };

  const result = [];
  for (const phase of phases) {
    if (!phase || typeof phase !== "object" || typeof phase.name !== "string") continue;
    if (profileSubset && !profileSubset.has(phase.name)) continue;
    if (phase.enabled === false) continue;
    if (!evaluateCondition(phase.condition)) continue;
    result.push(phase.name);
  }
  return result;
}
