// SPDX-License-Identifier: SUL-1.0
/**
 * path-spelling.mjs -- one shared answer to "do these two spellings name the same path?" (candidate 20, separator sweep).
 *
 * Measured in the three greenfield runs and the follow-up audit (specs/sprint-alfred-epic/evidence/held-patches/
 * w252-separator-sweep-audit.md): about thirty guard and script sites compared an agent-typed path or interpreter word with
 * a canonical spelling by string equality. On native Windows an agent naturally types `D:/Dev/x`, `d:\Dev\x`, `/d/Dev/x`
 * (MSYS) or `"C:/Program Files/nodejs/node.exe"`; each of those was refused although it names the same file. macOS has the
 * same class with other causes: a case-insensitive APFS volume, `/tmp` and `/var` being links into `/private`, and Unicode
 * file names arriving in either composed (NFC) or decomposed (NFD) form.
 *
 * Rules (closed, conservative):
 * - win32: `\` and `/` are equal, MSYS `/x/...` is `X:/...`, case is folded (NTFS default), a trailing separator is ignored.
 * - darwin: names are compared in NFC; case is folded only when the volume holding the path is measured case-insensitive.
 * - every platform: duplicate separators and a trailing separator are ignored; a path with a `.` or `..` segment is never
 *   treated as equal to anything but itself (no lexical traversal is resolved here).
 * Callers that need physical identity (links) realpath both sides first; this module never resolves links on its own except
 * for the Node interpreter rule, which needs the physical file.
 */
import { lstatSync, realpathSync } from "node:fs";
import { basename, posix, win32 } from "node:path";

const DOT_SEGMENT = /(^|[\\/])\.\.?([\\/]|$)/u;

function platformOf(options) { return options?.platform ?? process.platform; }

/** MSYS/Git-Bash drive form `/d/Dev/x` to `D:/Dev/x`; anything else unchanged. */
export function msysToWindows(value) {
  return typeof value === "string" ? value.replace(/^\/([A-Za-z])(?=\/|$)/u, (_m, drive) => `${drive.toUpperCase()}:`) : value;
}

/** The normalised spelling WITHOUT case folding (separators, MSYS, duplicate/trailing separators, NFC), or null. */
function unfoldedSpelling(value, platform) {
  if (typeof value !== "string" || value === "" || /[\x00-\x1f\x7f]/u.test(value) || DOT_SEGMENT.test(value)) return null;
  let text = value.normalize("NFC");
  if (platform === "win32") {
    text = msysToWindows(text).replace(/\\/gu, "/");
    const unc = text.startsWith("//");
    text = (unc ? "//" : "") + text.slice(unc ? 2 : 0).replace(/\/{2,}/gu, "/");
    if (text.length > 1 && !/^[A-Za-z]:\/$/u.test(text)) text = text.replace(/\/+$/u, "");
    return text;
  }
  text = text.replace(/\/{2,}/gu, "/");
  if (text.length > 1) text = text.replace(/\/+$/u, "");
  return text;
}

/** The comparison key of one spelling, or null for a non-string, empty, control-character or dot-segment value. */
export function pathSpellingKey(value, options = {}) {
  const platform = platformOf(options);
  const text = unfoldedSpelling(value, platform);
  if (text === null) return null;
  return platform === "win32" ? text.toLowerCase() : text;
}

/**
 * darwin only: is the volume that holds `path` case-insensitive? Measured, never assumed: the path (or its nearest existing
 * ancestor) is looked up again with its case swapped; the same inode answers yes. Any failure answers no (exact compare).
 */
export function caseInsensitiveVolume(path, options = {}) {
  if (platformOf(options) !== "darwin" || typeof path !== "string" || !path.startsWith("/")) return false;
  const lstat = options.lstatFn ?? lstatSync;
  let probe = path;
  for (let depth = 0; depth < 64 && probe !== "/"; depth += 1) {
    const name = basename(probe);
    const swapped = name.replace(/[A-Za-z]/gu, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    if (swapped !== name) {
      try {
        const original = lstat(probe);
        const other = lstat(posix.join(posix.dirname(probe), swapped));
        return original.ino === other.ino && original.dev === other.dev;
      } catch { /* try the parent */ }
    }
    probe = posix.dirname(probe);
  }
  return false;
}

/** Do `a` and `b` name the same path under the rules above? */
export function samePathSpelling(a, b, options = {}) {
  if (a === b && typeof a === "string") return true;
  const left = pathSpellingKey(a, options);
  const right = pathSpellingKey(b, options);
  if (left === null || right === null) return false;
  if (left === right) return true;
  return platformOf(options) === "darwin" && left.toLowerCase() === right.toLowerCase()
    && caseInsensitiveVolume(left, options) && caseInsensitiveVolume(right, options);
}

/**
 * The guard-side comparison for an agent-typed path: byte equality everywhere, plus the spelling equivalence above only where
 * the host file system makes two spellings name one file (win32, darwin). On Linux a different spelling stays different, so
 * no admission widens there.
 */
export function sameNativePath(typed, canonical, options = {}) {
  if (typed === canonical && typeof typed === "string") return true;
  const platform = platformOf(options);
  return (platform === "win32" || platform === "darwin") && samePathSpelling(typed, canonical, options);
}

/**
 * S5 (the guard admits a canonical copy, but the shell runs the typed text): a script that requires its `--root` to be the
 * exact native real path maps an equivalent spelling of the current working directory -- where the agent's shell runs it --
 * to that directory's own spelling. Any other value is returned unchanged, so every later exactness check still applies.
 */
export function typedRootSpelling(typed, options = {}) {
  if (typeof typed !== "string") return typed;
  const cwd = options.cwd ?? process.cwd();
  return typed !== cwd && sameNativePath(typed, cwd, options) ? cwd : typed;
}

/**
 * The `/`-separated path of `value` relative to `root` when `value` is the root ("") or below it in any equivalent spelling;
 * otherwise null. A relative `value` is not resolved here (it is the caller's spelling of a relative path) and returns null.
 */
export function relativeUnderRoot(value, root, options = {}) {
  const platform = platformOf(options);
  const valueKey = pathSpellingKey(value, options);
  const rootKey = pathSpellingKey(root, options);
  if (valueKey === null || rootKey === null) return null;
  const absolute = platform === "win32" ? /^(?:[a-z]:\/|\/\/)/u.test(valueKey) : valueKey.startsWith("/");
  if (!absolute) return null;
  const fold = platform === "darwin" && valueKey.toLowerCase().startsWith(rootKey.toLowerCase()) && valueKey !== rootKey
    && !valueKey.startsWith(rootKey) && caseInsensitiveVolume(root, options);
  const v = fold ? valueKey.toLowerCase() : valueKey;
  const r = fold ? rootKey.toLowerCase() : rootKey;
  if (v === r) return "";
  const prefix = r.endsWith("/") ? r : `${r}/`;
  if (!v.startsWith(prefix)) return null;
  // Keep the caller's own case for the tail (only the comparison was folded); fall back to the key if lengths diverge.
  const unfolded = unfoldedSpelling(value, platform);
  const tailLength = v.length - prefix.length;
  return unfolded !== null && unfolded.length === v.length ? unfolded.slice(unfolded.length - tailLength) : v.slice(prefix.length);
}

/** `value` rewritten to the canonical native spelling below `root` when it names the root or a path under it; else unchanged. */
export function canonicalUnderRoot(value, root, options = {}) {
  const rel = relativeUnderRoot(value, root, options);
  if (rel === null) return value;
  if (rel === "") return root;
  return platformOf(options) === "win32" ? win32.join(root, ...rel.split("/")) : posix.join(root, rel);
}

/**
 * Is `word` an admissible Node interpreter for a command the guard admits by its script and argv? Admitted: bare `node`
 * (and `node.exe` on win32), any spelling of the trusted interpreter (`process.execPath` by default), or an absolute path
 * whose basename is node/node.exe that resolves to an executable regular file OUTSIDE the project root (a runner sandbox or
 * a version manager brings its own Node; an agent cannot plant its own "node" in the repository). Bare `node` from PATH is
 * already admitted, so this widens no authority: every script/argv rule of the caller still applies.
 */
export function isNodeInterpreterWord(word, options = {}) {
  if (typeof word !== "string" || word === "") return false;
  const platform = platformOf(options);
  if (word === "node" || (platform === "win32" && word.toLowerCase() === "node.exe")) return true;
  const trusted = options.trustedNode ?? process.execPath;
  if (samePathSpelling(word, trusted, options)) return true;
  const physical = platform === "win32" ? msysToWindows(word) : word;
  const absolute = platform === "win32" ? win32.isAbsolute(physical) : posix.isAbsolute(physical);
  if (!absolute || !["node", "node.exe"].includes(basename(physical.replace(/\\/gu, "/")).toLowerCase())) return false;
  const root = options.root;
  if (typeof root !== "string" || root === "") return false;
  try {
    const realpathFn = options.realpathFn ?? realpathSync;
    const real = realpathFn(physical);
    let realRoot;
    try { realRoot = realpathFn(root); } catch { realRoot = root; }
    if (relativeUnderRoot(real, realRoot, options) !== null) return false;
    const stat = (options.lstatFn ?? lstatSync)(real);
    return stat.isFile() && (platform === "win32" || (stat.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}
