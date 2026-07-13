#!/usr/bin/env node
/**
 * validate-manifest.mjs -- thin CLI over plugins/pipeline-core/lib/manifest.mjs.
 * All the actual reading/parsing/validating logic lives in the
 * (distribution-ready) library; this script is just argv handling + English rendering
 * of the {path, expected, got, line?} error shape loadManifest() returns.
 *
 * Wired into harness/scripts/verify.mjs whenever a project manifest is present; it also
 * remains standalone-invocable for setup and diagnostics.
 *
 * USAGE:
 *   node harness/scripts/validate-manifest.mjs [path]
 *   default path: <repo-root>/.claude/pipeline.yaml
 *
 * EXIT CODES:
 *   0 -- manifest absent (opt-in feature, nothing to validate) OR present and valid.
 *   2 -- present but invalid: one English error line per finding, then exit 2.
 */
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifest, DEFAULT_MANIFEST_RELPATH } from "../../plugins/pipeline-core/lib/manifest.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");

/** Renders one structured error entry into the required English message template. */
export function formatError(err) {
  // A deploy-precedence violation object `{rule, subject, message}` carries a complete,
  // self-describing message -- printed VERBATIM, no Field/expected/got wrapping. This branch
  // must come FIRST: the existing {line,...} and {path,expected,got} shapes below never carry
  // a `.message`, so they are unreachable here and stay byte-identical.
  if (typeof err.message === "string") return err.message;
  if (err.line !== undefined && err.line !== null) {
    return `YAML error line ${err.line}: ${err.reason}`;
  }
  return `Field "${err.path}": expected ${err.expected}, got ${err.got}`;
}

/**
 * Renders one warning entry. A plain string (the D1 malformed-central-policy warning, or the
 * checkReleaseIntegrity WIP ci-adapter warning) renders as `Warning: <string>`; an
 * advisory-mode deploy-precedence violation object `{rule,subject,message}` renders as
 * `Warning: <message>` -- the single `typeof w === "string"` branch covers both.
 */
export function formatWarning(w) {
  if (typeof w === "string") return `Warning: ${w}`;
  return `Warning: ${w.message}`;
}

/** One-line human summary of a valid manifest -- printed on the exit-0 "present+valid" path. */
export function formatSummary(manifest) {
  const phaseCount = Array.isArray(manifest.phases) ? manifest.phases.length : 0;
  const gateCount = manifest.gates && typeof manifest.gates === "object" ? Object.keys(manifest.gates).length : 0;
  const activeProfile =
    manifest.profiles && typeof manifest.profiles === "object" && typeof manifest.profiles.active === "string"
      ? manifest.profiles.active
      : "(no profile)";
  return `Manifest valid (${manifest.schema}): ${phaseCount} phase(s), ${gateCount} gate(s), active profile "${activeProfile}".`;
}

/**
 * Resolves the CLI arg (or the default) into { rootDir, manifestRelPath } for
 * loadManifest(). `arg` may be absolute or relative to cwd; absent defaults to
 * `<repo-root>/.claude/pipeline.yaml`.
 *
 * `rootDir` MUST be the PROJECT ROOT, uniform with every hook call site (which invoke
 * `loadManifest(projectRoot)`/`loadManifestSafe(projectRoot)` directly). For the CANONICAL
 * `<root>/.claude/pipeline.yaml` layout, naively taking `dirname(manifestPath)` yields
 * `<root>/.claude` -- one directory too deep -- which makes `governance.policies_path`/
 * `docs/risks.md` (both project-root-relative) resolve at `<root>/.claude/governance/...` and
 * never be found: a central deploy-policy silently goes `absent` through the CLI while the
 * hook callers, given the true project root, keep enforcing it (round-2 Critic finding -- a
 * split-brain between CLI and hook enforcement). FIX: detect the `.claude`-nested layout by
 * its parent directory's basename and hoist `rootDir` one level up in that case; every other
 * (flat) layout keeps the original `rootDir = dirname(manifestPath)` behavior unchanged.
 */
export function resolveTarget(arg, { repoRoot = REPO_ROOT, cwd = process.cwd() } = {}) {
  const targetPath = arg ? (isAbsolute(arg) ? arg : resolve(cwd, arg)) : join(repoRoot, DEFAULT_MANIFEST_RELPATH);
  const parentDir = dirname(targetPath);
  if (basename(parentDir) === ".claude") {
    return { rootDir: dirname(parentDir), manifestRelPath: join(".claude", basename(targetPath)) };
  }
  return { rootDir: parentDir, manifestRelPath: basename(targetPath) };
}

/** Runs the CLI logic against an argv array; returns the process exit code (never calls process.exit itself -- testable). */
export function run(argv = process.argv.slice(2)) {
  const { rootDir, manifestRelPath } = resolveTarget(argv[0]);
  const result = loadManifest(rootDir, { manifestRelPath });

  if (result.status === "absent") {
    console.log("Manifest not active (optional)");
    return 0;
  }
  if (result.status === "ok") {
    console.log(formatSummary(result.manifest));
    for (const warning of result.warnings ?? []) {
      console.error(formatWarning(warning));
    }
    return 0;
  }
  for (const err of result.errors) {
    console.error(formatError(err));
  }
  for (const warning of result.warnings ?? []) {
    console.error(formatWarning(warning));
  }
  return 2;
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  process.exit(run());
}
