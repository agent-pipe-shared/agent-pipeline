// SPDX-License-Identifier: SUL-1.0
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
 * criticExport/profiles/governance/flags -- declarative pipeline-shape concerns): disjoint sets,
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
 *
 * RELEASE/PROMOTION PHASE (ADR-0033/0034, additive): `checkSemantics` now also returns a
 * `warnings` array alongside `errors`, and gains `rootDir`/`now` parameters so its new
 * `checkReleaseIntegrity`/`checkDeployPrecedence` checks can load a central
 * `deploy-policy.yaml` (`loadDeployPolicy`) and a `docs/risks.md` deviation record
 * (`readDeviations`) deterministically. The whole deploy-precedence path runs ONLY when the
 * manifest declares a `release` section (anti-bloat) -- see each function's own doc comment.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDocumentHooksPolicy, validateDocumentHooksRuntimeReadback } from "./document-hooks.mjs";
import { parseYaml, YamlLiteError } from "./yaml-lite.mjs";
import { validateAgainstSchema } from "./schema-lite.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Co-located schema file (plugins/pipeline-core/scripts/pipeline-manifest.schema.json). */
export const DEFAULT_SCHEMA_PATH = join(SCRIPT_DIR, "..", "scripts", "pipeline-manifest.schema.json");

/** Co-located central deploy-policy schema (plugins/pipeline-core/scripts/deploy-policy.schema.json). */
export const DEFAULT_DEPLOY_POLICY_SCHEMA_PATH = join(SCRIPT_DIR, "..", "scripts", "deploy-policy.schema.json");

/** Where a project's manifest lives, relative to its repo root. */
export const DEFAULT_MANIFEST_RELPATH = join(".claude", "pipeline.yaml");

/** Fixed filename the central deploy policy is discovered under (no new manifest field for the filename itself). */
const DEPLOY_POLICY_FILENAME = "deploy-policy.yaml";

/** Fixed, repository-relative managed-policy binding.  Unlike governance.policies_path,
 * this location is not selectable by the project manifest. */
export const DEFAULT_POLICY_LOCK_RELPATH = join(".claude", "policy-lock.yaml");

/** Co-located schema for the public, credential-free policy-lock contract. */
export const DEFAULT_POLICY_LOCK_SCHEMA_PATH = join(SCRIPT_DIR, "..", "scripts", "policy-lock.schema.json");

/** Where the deviation-record document lives, relative to a project's repo root. */
const RISKS_MD_RELPATH = join("docs", "risks.md");

// ---------------------------------------------------------------------------------------------
// Condition grammar: always | never | <flag> | !<flag>. <flag> is a bare identifier
// (letters/digits/underscore, must not start with a digit) -- matches the flag KEYS this
// manifest itself can declare under `flags:` (plain YAML mapping keys).
// ---------------------------------------------------------------------------------------------
const FLAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HUMAN_FACING_LANGUAGES = new Set(["de", "en"]);

/**
 * Return the compiled PO-facing language or a deterministic fail-closed reason.
 * Consumers deliberately receive no default: a missing runtime projection is a
 * setup repair, not an invitation to infer a human language from surrounding prose.
 */
export function resolveHumanFacingLanguage(manifest) {
  const value = manifest?.language?.human_facing;
  return HUMAN_FACING_LANGUAGES.has(value)
    ? { ok: true, value }
    : { ok: false, reason: "compiled language.human_facing is missing or unsupported; re-run setup from a valid pipeline.user.yaml" };
}

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

// ---------------------------------------------------------------------------------------------
// Release/Promotion phase (ADR-0033/0034): release-section integrity checks, the central
// deploy-policy loader, the docs/risks.md deviation reader, and the pure precedence engine.
// All four are new in this slice; NONE of them add a schema-lite keyword or a new
// error-translation regex (the two schemas reuse only type/required/properties/items/
// enum/additionalProperties, already understood by schema-lite -- see the file-header note).
// ---------------------------------------------------------------------------------------------

/**
 * Semantic integrity checks over an already schema-shaped `release` section: adapter
 * references must resolve, `executor: local` adapters must be trigger-free and command-ful,
 * and a WIP `executor: ci` adapter feeding a human-gated env (no `trigger.refs` yet) is a
 * WARNING, never an error (pushed to the third `warnings` sink, never to `errors`). Skipped
 * entirely when there is no `release` section (defensive, same idiom as
 * checkProfiles/checkPhases): a manifest that failed schema validation on `release`'s shape
 * is already covered by that schema-lite error, this check silently no-ops on anything it
 * cannot safely read.
 */
function checkReleaseIntegrity(manifest, errors, warnings) {
  const release = manifest.release;
  if (!release || typeof release !== "object" || Array.isArray(release)) return;

  const environments =
    release.environments && typeof release.environments === "object" && !Array.isArray(release.environments)
      ? release.environments
      : {};
  const adapters =
    release.adapters && typeof release.adapters === "object" && !Array.isArray(release.adapters) ? release.adapters : {};

  const humanGatedAdapterNames = new Set();

  for (const [envName, env] of Object.entries(environments)) {
    if (!env || typeof env !== "object") continue;
    const adapterName = env.adapter;
    if (typeof adapterName !== "string") continue;
    if (!Object.prototype.hasOwnProperty.call(adapters, adapterName)) {
      errors.push({
        path: `release.environments.${envName}.adapter`,
        expected: "a declared adapter",
        got: `'${adapterName}' (not declared)`,
      });
    } else if (env.promotion === "human-gate") {
      humanGatedAdapterNames.add(adapterName);
    }
  }

  for (const [adapterName, adapter] of Object.entries(adapters)) {
    if (!adapter || typeof adapter !== "object") continue;

    if (adapter.executor === "local") {
      if (adapter.trigger !== undefined) {
        errors.push({
          path: `release.adapters.${adapterName}.trigger`,
          expected: "no trigger (executor: local)",
          got: "present",
        });
      }
      if (typeof adapter.command !== "string" || adapter.command === "") {
        errors.push({
          path: `release.adapters.${adapterName}.command`,
          expected: "present (executor: local)",
          got: "missing",
        });
      }
    }

    if (adapter.executor === "ci" && humanGatedAdapterNames.has(adapterName)) {
      const refs = adapter.trigger && typeof adapter.trigger === "object" ? adapter.trigger.refs : undefined;
      if (!Array.isArray(refs) || refs.length === 0) {
        warnings.push(
          `Adapter '${adapterName}' (executor: ci) for a human-gated environment has no trigger.refs -- not deploy-triggerable`,
        );
      }
    }
  }
}

/**
 * Discovers and loads the central deploy policy via `manifest.governance?.policies_path`
 * (absent section/field ⇒ `{status:"absent"}`), looking for the FIXED filename
 * `deploy-policy.yaml` there. The ENTIRE body runs inside ONE try/catch: a not-found file ⇒
 * `{status:"absent"}`; ANY other outcome (permission error, a directory at that path, YAML
 * syntax error, schema violation) ⇒ `{status:"malformed", detail}`; a clean valid parse ⇒
 * `{status:"ok", policy}`. NEVER throws -- this totality is what lets the "malformed ⇒
 * warning, never blocks verify" guarantee (D1) hold inside `loadManifest`, which must itself
 * stay total.
 */
export function loadDeployPolicy(rootDir, manifest) {
  try {
    const policiesPath = manifest && typeof manifest === "object" ? manifest.governance?.policies_path : undefined;
    if (typeof policiesPath !== "string" || policiesPath === "") return { status: "absent" };

    const policyPath = join(rootDir, policiesPath, DEPLOY_POLICY_FILENAME);
    if (!existsSync(policyPath)) return { status: "absent" };

    const text = readFileSync(policyPath, "utf8");
    const policy = parseYaml(text);
    const schema = loadSchema(DEFAULT_DEPLOY_POLICY_SCHEMA_PATH);
    const { valid, errors: schemaErrors } = validateAgainstSchema(policy, schema);
    if (!valid) return { status: "malformed", detail: schemaErrors.join("; ") };

    return { status: "ok", policy };
  } catch (err) {
    return { status: "malformed", detail: err instanceof Error ? err.message : String(err) };
  }
}

const POLICY_LOCK_STATUSES = new Set(["resolved", "missing", "stale", "digest-mismatch", "policy-invalid", "source-unverified"]);
const OPAQUE_PACK_ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const PRIVATE_PACK_ID_MARKER_RE = /(?:^|-)private(?:-|$)/;
const SHA256_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const IMMUTABLE_VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Loads the fixed public policy-lock.  This package deliberately does not resolve a
 * source, fetch a pack, inspect a cache, or use credentials: verifier state is an
 * externally-produced, public-safe status assertion.  Consequently callers only get
 * a status code and never a source coordinate, path, account, or pack name.
 */
export function loadPolicyLock(rootDir) {
  try {
    const lockPath = join(rootDir, DEFAULT_POLICY_LOCK_RELPATH);
    if (!existsSync(lockPath)) return { status: "unbound" };
    const lock = parseYaml(readFileSync(lockPath, "utf8"));
    const schema = loadSchema(DEFAULT_POLICY_LOCK_SCHEMA_PATH);
    const { valid, errors } = validateAgainstSchema(lock, schema);
    // Retain only a schema-shaped mode for advisory fail direction; no identity or
    // policy material is ever emitted from an invalid lock.
    const modeOnly = lock && typeof lock === "object" && ["advisory", "mandate", "strict"].includes(lock.mode) ? { mode: lock.mode } : undefined;
    if (!valid) return { status: "policy-invalid", lock: modeOnly };
    if (
      !OPAQUE_PACK_ID_RE.test(lock.pack_id) ||
      PRIVATE_PACK_ID_MARKER_RE.test(lock.pack_id) ||
      !IMMUTABLE_VERSION_RE.test(lock.version) ||
      !SHA256_DIGEST_RE.test(lock.digest) ||
      (lock.verifier.observed_digest !== undefined && !SHA256_DIGEST_RE.test(lock.verifier.observed_digest))
    ) {
      return { status: "policy-invalid", lock: modeOnly };
    }
    if (!POLICY_LOCK_STATUSES.has(lock.verifier.status)) return { status: "policy-invalid", lock: modeOnly };
    if (lock.verifier.observed_digest && lock.verifier.observed_digest !== lock.digest) return { status: "digest-mismatch", lock };
    return { status: lock.verifier.status, lock };
  } catch {
    return { status: "policy-invalid" };
  }
}

/** Returns only the log-safe public status code, never lock identity or location. */
export function policyLockStatus(rootDir) {
  return loadPolicyLock(rootDir).status;
}

function policyLockFinding(lockResult) {
  const status = lockResult.status;
  if (status === "unbound" || status === "resolved") return null;
  const mode = lockResult.lock?.mode;
  const message = `managed policy lock status: ${status}`;
  return mode === "advisory" ? { warning: message } : { error: { rule: "policy-lock", subject: "binding", message } };
}

function policyResultFromLock(lockResult) {
  if (lockResult.status !== "resolved" || !lockResult.lock) return null;
  const lock = lockResult.lock;
  return { status: "ok", policy: { ...(lock.policy ?? {}), mode: lock.mode } };
}

const DEVIATION_REQUIRED_FIELDS = ["id", "policy-rule", "deviation", "justification", "owner", "expires", "approved-by"];

/**
 * Reads `docs/risks.md` inside a try/catch (absent OR unreadable ⇒ `[]`, never throws). Scans
 * for fenced ` ```yaml ` blocks and parses each with yaml-lite; prose between fences is never
 * parsed, and a malformed fenced block (yaml-lite throws on it) is skipped, not fatal. A record
 * needs ALL of `id, policy-rule, deviation, justification, owner, expires, approved-by`; missing
 * any field OR an `expires` before the injected `now` ⇒ the record is treated as ABSENT --
 * simply left out of the returned list.
 */
export function readDeviations(rootDir, now) {
  try {
    const risksPath = join(rootDir, RISKS_MD_RELPATH);
    if (!existsSync(risksPath)) return [];

    const text = readFileSync(risksPath, "utf8");
    const deviations = [];
    const fenceRe = /```yaml[^\n]*\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRe.exec(text)) !== null) {
      let record;
      try {
        record = parseYaml(m[1]);
      } catch {
        continue; // malformed fenced block -- skipped, not fatal.
      }
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;

      const hasAllFields = DEVIATION_REQUIRED_FIELDS.every(
        (f) => Object.prototype.hasOwnProperty.call(record, f) && record[f] !== null && record[f] !== undefined,
      );
      if (!hasAllFields) continue;

      const expiresAt = new Date(record.expires);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < now) continue;

      deviations.push(record);
    }
    return deviations;
  } catch {
    return [];
  }
}

/**
 * The machine-deterministic precedence diff (umbrella strictness partial order). PURE function
 * over already-parsed inputs -- never reads state, git, or the filesystem, and NEVER throws.
 * Returns `{errors:[], warnings:[]}`.
 *
 * No-release guard (anti-bloat): returns the empty result immediately when `projectRelease` is
 * falsy or has no `environments` (key absent OR a zero-key object both count) -- a direct unit
 * call on an empty release is a clean no-op regardless of how hard a central policy is.
 */
export function checkDeployPrecedence(projectRelease, policyResult, deviations, now) {
  const errors = [];
  const warnings = [];

  const environments =
    projectRelease &&
    typeof projectRelease === "object" &&
    !Array.isArray(projectRelease) &&
    projectRelease.environments &&
    typeof projectRelease.environments === "object" &&
    !Array.isArray(projectRelease.environments)
      ? projectRelease.environments
      : null;

  if (!environments || Object.keys(environments).length === 0) {
    return { errors, warnings };
  }

  if (!policyResult || policyResult.status === "absent") {
    return { errors, warnings }; // no central policy ⇒ the project decides.
  }

  if (policyResult.status === "malformed") {
    // D1: a declared-but-unreadable/invalid central policy is a WARNING, never blocks verify --
    // the push guard carries the fail-closed for deploy-triggering pushes.
    warnings.push(
      `central deploy-policy present but unreadable/invalid: ${policyResult.detail}; deploy-triggering pushes are fail-closed by the guard until fixed`,
    );
    return { errors, warnings };
  }

  const policy = policyResult.policy && typeof policyResult.policy === "object" ? policyResult.policy : {};
  const adapters =
    projectRelease.adapters && typeof projectRelease.adapters === "object" && !Array.isArray(projectRelease.adapters)
      ? projectRelease.adapters
      : {};
  const safeDeviations = Array.isArray(deviations) ? deviations : [];
  const violations = [];

  // D2 -- targets is a HARD allowlist over EVERY declared env (absence-is-not-compliance).
  if (Array.isArray(policy.targets)) {
    for (const [envName, env] of Object.entries(environments)) {
      if (!env || typeof env !== "object") continue;
      const target = env.target;
      if (typeof target !== "string" || target === "") {
        violations.push({
          rule: "targets",
          subject: envName,
          message: `Environment '${envName}' declares no target under a central targets allowlist`,
        });
      } else if (!policy.targets.includes(target)) {
        violations.push({
          rule: "targets",
          subject: envName,
          message: `Environment '${envName}' target '${target}' not in central targets allowlist`,
        });
      }
    }
  }

  // D3 -- gate-type floor, field-based "prod-intent" definition (no env-name heuristic).
  if (policy.gates && typeof policy.gates === "object" && policy.gates.promote_prod?.type_floor === "human") {
    if (Array.isArray(policy.targets)) {
      // Primary: prod-intent env = an env whose target ∈ policy.targets.
      for (const [envName, env] of Object.entries(environments)) {
        if (!env || typeof env !== "object") continue;
        const target = env.target;
        if (typeof target === "string" && policy.targets.includes(target) && env.promotion !== "human-gate") {
          violations.push({
            rule: "gate-type-floor",
            subject: envName,
            message: `Environment '${envName}' (deploys to central target '${target}') under central gate-type floor 'human'`,
          });
        }
      }
    } else {
      // Fallback: no central targets ⇒ the release config must contain ≥1 human-gated env.
      const hasHumanGate = Object.values(environments).some(
        (env) => env && typeof env === "object" && env.promotion === "human-gate",
      );
      if (!hasHumanGate) {
        violations.push({
          rule: "gate-type-floor",
          subject: "config",
          message: "release config declares no human-gated promote environment, central floor requires gate type 'human'",
        });
      }
    }
  }

  // adapters ⊆ -- every declared project adapter must be in the central allowlist, if any.
  if (Array.isArray(policy.adapters)) {
    for (const name of Object.keys(adapters)) {
      if (!policy.adapters.includes(name)) {
        violations.push({
          rule: "adapters",
          subject: name,
          message: `Adapter '${name}' not in central adapters allowlist`,
        });
      }
    }
  }

  // Mode application: advisory -> warnings; strict -> errors, deviations ignored; mandate ->
  // errors unless a valid, non-expired deviation covers the rule category or the exact instance.
  if (policy.mode === "advisory") {
    warnings.push(...violations);
  } else if (policy.mode === "strict") {
    errors.push(...violations);
  } else if (policy.mode === "mandate") {
    for (const v of violations) {
      const covered = safeDeviations.some((d) => {
        const rule = d && d["policy-rule"];
        return rule === v.rule || rule === `${v.rule}:${v.subject}`;
      });
      if (!covered) errors.push(v);
    }
  } else {
    // Defensive (round-2 Critic finding): a hand-built/future-schema policy carrying an
    // unrecognized `mode` (neither advisory/mandate/strict) must NEVER silently drop
    // violations -- that would be fail-AWAY-from-the-gate, the opposite of every other
    // fail-toward-the-gate posture this engine takes (D1/D2 absence-is-not-compliance).
    // Treat an unknown mode as the STRICTEST: every violation becomes an error, deviations
    // ignored, same as `strict`.
    errors.push(...violations);
  }

  return { errors, warnings };
}

/**
 * Runs all semantic checks against an already schema-shaped manifest object. Defensive against
 * a manifest that failed schema validation (missing/mistyped fields) -- never throws, silently
 * skips a check whose preconditions are not met (the schema-lite error already covers the shape
 * defect). `rootDir`/`now` let the deploy-precedence path load the central policy and the
 * deviation record deterministically; that whole path runs ONLY when `manifest.release` exists
 * (anti-bloat).
 */
function checkSemantics(manifest, rootDir, now) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { errors, warnings };
  checkProfiles(manifest, errors);
  checkPhases(manifest, errors);
  checkReleaseIntegrity(manifest, errors, warnings);

  const documentPolicy = loadDocumentHooksPolicy(rootDir, manifest);
  const hasDocumentRuntime = Object.hasOwn(manifest, "documentHooks");
  if (documentPolicy.status === "invalid") {
    errors.push({
      rule: "document-hooks-policy",
      subject: "governance.policies_path/document-hooks.yaml",
      message: `Document-hooks Policy is invalid (${documentPolicy.code}); no runtime projection is trusted.`,
    });
  } else if (documentPolicy.status === "absent" && hasDocumentRuntime) {
    errors.push({
      rule: "document-hooks-runtime",
      subject: "documentHooks",
      message: "Document-hooks runtime exists without the fixed repository Policy at governance.policies_path/document-hooks.yaml.",
    });
  } else if (documentPolicy.status === "ok" && !hasDocumentRuntime) {
    errors.push({
      rule: "document-hooks-runtime",
      subject: "documentHooks",
      message: "Document-hooks Policy is configured but its sanctioned runtime projection is absent.",
    });
  } else if (documentPolicy.status === "ok") {
    try {
      validateDocumentHooksRuntimeReadback(manifest.documentHooks, documentPolicy.runtime);
    } catch {
      errors.push({
        rule: "document-hooks-runtime",
        subject: "documentHooks",
        message: "Document-hooks runtime is invalid or differs from the exact repository Policy bytes.",
      });
    }
  }

  if (manifest.release) {
    const lockResult = loadPolicyLock(rootDir);
    const lockFinding = policyLockFinding(lockResult);
    if (lockFinding?.error) errors.push(lockFinding.error);
    if (lockFinding?.warning) warnings.push(lockFinding.warning);

    // A fixed bound lock is authoritative.  A project-controlled governance path is
    // consulted only while no lock is bound, so removing/repointing that manifest key
    // cannot mute a mandate/strict managed floor.
    const policyResult = policyResultFromLock(lockResult) ?? loadDeployPolicy(rootDir, manifest);
    const deviations = readDeviations(rootDir, now);
    const dp = checkDeployPrecedence(manifest.release, policyResult, deviations, now);
    errors.push(...dp.errors);
    warnings.push(...dp.warnings);

    const updateStatus = lockResult.lock?.verifier?.update_status;
    if (updateStatus === "available" && lockResult.lock?.update === "notify") {
      warnings.push("managed policy lock update available");
    }
    if (updateStatus === "required" && lockResult.lock?.update === "required") {
      errors.push({ rule: "policy-lock-update", subject: "binding", message: "managed policy lock requires an immutable update" });
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Validates an already-parsed manifest through the same schema and semantic authority used by
 * loadManifest(). Compiler call sites use this before writing a generated runtime projection,
 * so generated and file-loaded manifests cannot drift onto separate validation paths.
 */
export function validateManifest(
  manifest,
  { schemaPath = DEFAULT_SCHEMA_PATH, rootDir = process.cwd(), now = new Date() } = {},
) {
  try {
    const schema = loadSchema(schemaPath);
    const { errors: rawSchemaErrors } = validateAgainstSchema(manifest, schema);
    const errors = rawSchemaErrors.map(translateSchemaError);
    const { errors: semanticErrors, warnings } = checkSemantics(manifest, rootDir, now);
    errors.push(...semanticErrors);

    if (errors.length > 0) return { status: "invalid", manifest, errors, warnings };
    return { status: "ok", manifest, errors: [], warnings };
  } catch (err) {
    return {
      status: "invalid",
      manifest,
      errors: [{
        path: "manifest",
        expected: "readable manifest and validation schema",
        got: err instanceof Error ? err.message : String(err),
        reason: err instanceof Error ? err.message : String(err),
      }],
      warnings: [],
    };
  }
}

/**
 * Loads and validates the manifest at `<rootDir>/<manifestRelPath>` (default
 * `.claude/pipeline.yaml`). Returns `{ status: "absent"|"ok"|"invalid", manifest?, errors,
 * warnings }` -- `warnings` is present on EVERY status, including "absent" (the channel must
 * not be shaped differently just because there was nothing to load). Never throws -- every
 * failure mode becomes `status: "invalid"` plus structured `errors`.
 */
export function loadManifest(
  rootDir,
  { manifestRelPath = DEFAULT_MANIFEST_RELPATH, schemaPath = DEFAULT_SCHEMA_PATH, now = new Date() } = {},
) {
  try {
    const manifestPath = join(rootDir, manifestRelPath);
    let text;
    try {
      text = readFileSync(manifestPath, "utf8");
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return { status: "absent", errors: [], warnings: [] };
      }
      throw err;
    }
    let manifest;
    try {
      manifest = parseYaml(text);
    } catch (err) {
      if (err instanceof YamlLiteError) {
        return {
          status: "invalid",
          errors: [{ path: null, expected: null, got: null, line: err.line, reason: err.message.replace(/^line \d+: /, "") }],
          warnings: [],
        };
      }
      throw err;
    }

    return validateManifest(manifest, { schemaPath, rootDir, now });
  } catch (err) {
    return {
      status: "invalid",
      errors: [{
        path: "manifest",
        expected: "readable manifest and validation schema",
        got: err instanceof Error ? err.message : String(err),
        reason: err instanceof Error ? err.message : String(err),
      }],
      warnings: [],
    };
  }
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
