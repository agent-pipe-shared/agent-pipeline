// SPDX-License-Identifier: SUL-1.0
/**
 * Shared normalisation of a `--root` / `--repo` command-line value (candidate 17, runner-neutral paths).
 *
 * Several script entries compare the raw argument with `resolve(root)` and `realpathSync(root)` and refuse any
 * difference ("must be the exact physical path"). On win32 both functions return backslash paths, so a root typed
 * with forward slashes (`C:/work/repo`, which every runner host and most shells accept) was refused although it names
 * the same directory. The strictness is meant to reject `..`, symlinks and relative paths, not the separator.
 *
 * `normalizeRootArgument` changes ONLY the separator spelling and ONLY on win32; on every other platform the value is
 * returned byte for byte, so the strict checks that follow keep their meaning. It never touches `..`, case, links
 * or trailing separators: those stay refusals.
 */

/**
 * @param {unknown} value the raw argument
 * @param {string} [platform] injectable for tests; defaults to the running platform
 * @returns {unknown} the same value, or the win32 spelling with backslashes
 */
export function normalizeRootArgument(value, platform = process.platform) {
  if (typeof value !== "string" || platform !== "win32") return value;
  return value.replaceAll("/", "\\");
}
