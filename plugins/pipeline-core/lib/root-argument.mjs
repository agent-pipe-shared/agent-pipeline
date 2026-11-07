// SPDX-License-Identifier: SUL-1.0
/**
 * Shared normalisation of a `--root` / `--repo` command-line value (candidate 17, runner-neutral paths).
 *
 * Several script entries compare the raw argument with `resolve(root)` and `realpathSync(root)` and refuse any
 * difference ("must be the exact physical path"). On win32 both functions return backslash paths, so a root typed
 * with forward slashes (`C:/work/repo`, which every runner host and most shells accept) was refused although it names
 * the same directory. The strictness is meant to reject `..`, symlinks and relative paths, not the separator.
 *
 * `normalizeRootArgument`:
 * - C20 separator sweep (S5): a value that names the CURRENT WORKING DIRECTORY in an equivalent native spelling
 *   (lib/path-spelling.mjs: win32 separator / drive-letter case / MSYS `/d/...` / trailing separator; darwin NFC and a
 *   measured case-insensitive volume) becomes that directory's own spelling. The agent's shell runs the script from the
 *   project root, so this is exactly the spelling every strict check below expects.
 * - otherwise, on win32 only, the separator spelling (and an MSYS drive prefix) is normalised to backslashes;
 * - on every other platform any other value is returned byte for byte. It never resolves `..` or links: those stay
 *   refusals of the strict checks that follow.
 */
import { msysToWindows, typedRootSpelling } from "./path-spelling.mjs";

/**
 * @param {unknown} value the raw argument
 * @param {string} [platform] injectable for tests; defaults to the running platform
 * @param {{cwd?: string, lstatFn?: Function}} [options] injectable working directory / volume probe for tests
 * @returns {unknown} the same value, the current directory's own spelling, or the win32 spelling with backslashes
 */
export function normalizeRootArgument(value, platform = process.platform, options = {}) {
  if (typeof value !== "string") return value;
  const cwdSpelling = typedRootSpelling(value, { platform, cwd: options.cwd, lstatFn: options.lstatFn });
  if (cwdSpelling !== value) return cwdSpelling;
  if (platform !== "win32") return value;
  return msysToWindows(value).replaceAll("/", "\\");
}
