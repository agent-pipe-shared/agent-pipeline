// SPDX-License-Identifier: SUL-1.0
/**
 * repository-path-identity.mjs -- the ONE definition of how two spellings of one
 * physical repository path are folded into a single identity.
 *
 * WHY THIS MODULE EXISTS
 * (backlog/items/2026-08-27-three-independent-copies-of-the-wsl-windows-path-normalization.md).
 * The same ~10 lines existed three times, under three names, in three modules that
 * are all `NEVER_LIFTABLE_KERNEL_PATHS` entries:
 *
 *   - `fingerprintIdentity` / `windowsDriveLetterFingerprintIdentity`
 *     (codex-onboarding-runtime.mjs, NVA-FINGERPRINT-1 / 1858a21b)
 *   - `canonicalRepositoryPathIdentity` / `windowsDriveLetterIdentity`
 *     (po-gate-authority.mjs)
 *   - `repoPathIdentity` / `windowsDriveLetterRepoIdentity`
 *     (guard-maintenance-window.mjs, NVA-GMWFINGERPRINT-1 / d96e14c5)
 *
 * Each copy was a defensible local call; three copies of a predicate whose entire
 * purpose is deciding that two things are EQUAL is not, because the failure mode
 * when they disagree is silent -- a fingerprint matches in one guard and not in
 * another, and the session sees an unexplained drift refusal. The class had been
 * fixed three times in three places before it was extracted here.
 *
 * WHAT IS FOLDED, AND WHAT DELIBERATELY IS NOT
 * Exactly two notations of one physical path are folded: the WSL2 default-automount
 * `/mnt/<drive>/...` spelling and the native Windows `<DRIVE>:\...` spelling. A UNC
 * spelling (`\\wsl.localhost\...`) is NOT handled -- no caller has ever handled it,
 * and adding it here would silently change every existing fingerprint. A path
 * outside that world (the common case: a plain POSIX checkout) is never touched and
 * never case-folded: NTFS/DrvFs are case-insensitive so folding case is safe ONLY
 * once a path is recognized as belonging to that world, while a same-string
 * different-case plain POSIX pair can be two genuinely different directories on a
 * case-sensitive filesystem and must never be merged.
 *
 * WHY THE SPLIT IS "CANDIDATE" + "IDENTITY" RATHER THAN ONE FUNCTION
 * The three callers do NOT agree on what to do when a path is recognized as
 * Windows-notation but does not canonicalize to itself (a trailing separator, an
 * embedded `..`). Two of them fall back to the string they were about to fold; the
 * third returns `null` and lets its caller fail. Collapsing that into one function
 * with one fallback would have changed at least one caller's fingerprints -- which
 * is the exact class of silent divergence this module exists to end. So the shared
 * part is the two decisions that were genuinely identical (is this Windows notation,
 * and what is its canonical identity), and each caller keeps its own documented
 * fallback in one visible line.
 *
 * Callers pass strings. No type guard is performed here on purpose: the caller that
 * needs one (po-gate-authority.mjs) already applies it before calling, and adding a
 * second one here would change the behaviour of the two callers that do not.
 */
import { win32 as win32Path } from "node:path";

/**
 * The canonical identity of a Windows drive-letter path, or `null` when the input
 * is not an absolute win32 path or does not canonicalize to itself.
 *
 * `null` means "this cannot be folded", never "this is not Windows notation" --
 * `windowsNotationCandidate()` answers that question separately.
 */
export function windowsDriveLetterIdentity(candidate) {
  const normalized = candidate.replaceAll("/", "\\");
  if (!win32Path.isAbsolute(normalized)) return null;
  const resolved = win32Path.resolve(normalized);
  return resolved === normalized ? resolved.toLocaleLowerCase("en-US") : null;
}

/**
 * The drive-letter spelling of `path` when `path` is in the WSL-mount/Windows
 * drive-letter world, else `null`.
 *
 * A `/mnt/<drive>/...` input is rewritten to `<DRIVE>:/...`; a path that is already
 * drive-lettered is returned unchanged (so a caller falling back to "the candidate"
 * falls back to the original string in that branch, and to the REWRITTEN string in
 * the mount branch -- which is precisely what the two mirrored copies did, and is
 * preserved rather than tidied).
 */
export function windowsNotationCandidate(path) {
  const wslMount = /^\/mnt\/([A-Za-z])(\/.*)?$/u.exec(path);
  if (wslMount !== null) return `${wslMount[1].toUpperCase()}:${wslMount[2] ?? "/"}`;
  if (/^[A-Za-z]:[\\/]/u.test(path)) return path;
  return null;
}

/**
 * The fold used by the two callers that treat an unfoldable path as itself:
 * `fingerprintIdentity` (codex-onboarding-runtime.mjs) and `repoPathIdentity`
 * (guard-maintenance-window.mjs). Both are total -- they always return a string.
 */
export function repositoryPathIdentityOrSelf(path) {
  const candidate = windowsNotationCandidate(path);
  if (candidate === null) return path;
  return windowsDriveLetterIdentity(candidate) ?? candidate;
}
