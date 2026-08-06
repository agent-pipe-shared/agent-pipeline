#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Decide whether a module is being executed as the process entrypoint.
 *
 * WHY. Every `.mjs` in this plugin that is both executable and importable ends with some
 * form of "run main() only when I am the entrypoint", so that a test may import it without
 * executing it. Three spellings had grown side by side:
 *
 *   resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
 *   fileURLToPath(import.meta.url)          === resolve(process.argv[1])
 *   import.meta.url                         === pathToFileURL(process.argv[1]).href
 *
 * All three are wrong the same way, and the way is silent. Node resolves symlinks when it
 * resolves a module, so `import.meta.url` is the REAL path; `process.argv[1]` is whatever
 * the caller typed, symlinks and all. Install the plugin through a marketplace root whose
 * `plugins/pipeline-core` is a symlink into a checkout -- the documented local-development
 * arrangement -- and the two sides stop matching. `main()` never runs. The process exits 0
 * with no output.
 *
 * For a CLI that is merely broken. For a PreToolUse guard, exit 0 IS "allow": the gate is
 * disarmed and nothing says so. Measured on 2026-08-06: invoked through the symlinked
 * marketplace root, `guard-lifecycle-ready.mjs --runner bogus` -- an input that must fail
 * closed -- exited 0 and printed nothing, while the same file invoked through its real path
 * exited 2. Six hooks and the mandatory bootstrap preflight were dead in that layout, and
 * the session that discovered it had been running unguarded from its first tool call.
 *
 * SHAPE. One implementation, compared on real paths. This is deliberately never STRICTER
 * than the checks it replaces: a literal path match short-circuits first, so a caller whose
 * `argv[1]` already equals the module path behaves exactly as before, and the realpath
 * comparison only ever admits invocations the old checks wrongly rejected.
 *
 * A module that cannot be resolved on disk answers `false`, matching the previous
 * behaviour. That direction is safe: it means "do not auto-run", never "allow the tool
 * call". A guard's fail-open risk lives in the caller's exit code, not here.
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when `moduleUrl` names the file Node was asked to execute.
 *
 * @param {string} moduleUrl  the module's own `import.meta.url`
 * @param {string} [argv1]    the entrypoint path, defaulting to `process.argv[1]`
 * @returns {boolean}
 */
export function isDirectInvocation(moduleUrl, argv1 = process.argv[1]) {
  if (typeof moduleUrl !== "string" || moduleUrl === "") return false;
  if (typeof argv1 !== "string" || argv1 === "") return false;

  let self;
  try {
    self = fileURLToPath(moduleUrl);
  } catch {
    return false; // not a file: URL -- nothing on disk can be the same file
  }

  const target = resolve(argv1);
  if (target === resolve(self)) return true;

  // The symlink case: `import.meta.url` is already resolved, `argv[1]` is not.
  try {
    return realpathSync(target) === realpathSync(self);
  } catch {
    return false; // an argv[1] that does not exist on disk is not this module
  }
}
