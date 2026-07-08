#!/usr/bin/env node
/**
 * validate-manifest.mjs -- thin CLI over plugins/pipeline-core/lib/manifest.mjs.
 * All the actual reading/parsing/validating logic lives in the
 * (distribution-ready) library; this script is just argv handling + German rendering
 * of the {path, expected, got, line?} error shape loadManifest() returns.
 *
 * NOT WIRED into harness/scripts/verify.mjs by this delivery (TP-3 -- verify.mjs is
 * TP-protected; a later bundled wiring wave adds the step). Standalone-invocable
 * only for now.
 *
 * USAGE:
 *   node harness/scripts/validate-manifest.mjs [path]
 *   default path: <repo-root>/.claude/pipeline.yaml
 *
 * EXIT CODES:
 *   0 -- manifest absent (opt-in feature, nothing to validate) OR present and valid.
 *   2 -- present but invalid: one German error line per finding, then exit 2.
 */
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifest, DEFAULT_MANIFEST_RELPATH } from "../../plugins/pipeline-core/lib/manifest.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");

/** Renders one structured error entry into the required German message template. */
export function formatError(err) {
  if (err.line !== undefined && err.line !== null) {
    return `YAML-Fehler Zeile ${err.line}: ${err.reason}`;
  }
  return `Feld "${err.path}": erwartet ${err.expected}, erhalten ${err.got}`;
}

/** One-line human summary of a valid manifest -- printed on the exit-0 "present+valid" path. */
export function formatSummary(manifest) {
  const phaseCount = Array.isArray(manifest.phases) ? manifest.phases.length : 0;
  const gateCount = manifest.gates && typeof manifest.gates === "object" ? Object.keys(manifest.gates).length : 0;
  const activeProfile =
    manifest.profiles && typeof manifest.profiles === "object" && typeof manifest.profiles.active === "string"
      ? manifest.profiles.active
      : "(kein Profil)";
  return `Manifest gültig (${manifest.schema}): ${phaseCount} Phase(n), ${gateCount} Gate(s), aktives Profil "${activeProfile}".`;
}

/**
 * Resolves the CLI arg (or the default) into { rootDir, manifestRelPath } for
 * loadManifest(). `arg` may be absolute or relative to cwd; absent defaults to
 * `<repo-root>/.claude/pipeline.yaml`.
 */
export function resolveTarget(arg, { repoRoot = REPO_ROOT, cwd = process.cwd() } = {}) {
  const targetPath = arg ? (isAbsolute(arg) ? arg : resolve(cwd, arg)) : join(repoRoot, DEFAULT_MANIFEST_RELPATH);
  return { rootDir: dirname(targetPath), manifestRelPath: basename(targetPath) };
}

/** Runs the CLI logic against an argv array; returns the process exit code (never calls process.exit itself -- testable). */
export function run(argv = process.argv.slice(2)) {
  const { rootDir, manifestRelPath } = resolveTarget(argv[0]);
  const result = loadManifest(rootDir, { manifestRelPath });

  if (result.status === "absent") {
    console.log("Manifest nicht aktiv (optional)");
    return 0;
  }
  if (result.status === "ok") {
    console.log(formatSummary(result.manifest));
    return 0;
  }
  for (const err of result.errors) {
    console.error(formatError(err));
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
