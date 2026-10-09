// SPDX-License-Identifier: SUL-1.0

/**
 * Creates repository-private state directories segment by segment.
 *
 * A plain recursive mkdir leaves every directory it introduces with whatever
 * the parent hands down, which on native Windows is a foreign-ACE inherited
 * DACL. This helper never recurses: each missing segment is created, proven
 * to be a physical directory, and (on win32) hardened before the next one is
 * created beneath it. A segment that already exists is only assessed - it is
 * refused when it is not secure, never silently re-hardened, because an
 * existing directory is not proof that this process owns it.
 *
 * A segment this call created whose hardening does not end secure is removed
 * again (only while still empty) before the refusal is thrown. Left behind it
 * would be an existing insecure directory on the next run, which is refused
 * for good: the failed attempt would poison its own retry.
 *
 * The one deliberate exception to "an existing segment is only assessed" is
 * `ensureAgentPipelineRoot` (Ruling 141, decision D0): the repository-private
 * root `<git-common-dir>/agent-pipeline` has many first creators, several of
 * which never hardened it, so existing checkouts already carry an insecure
 * root. That entry point repairs such a root in place, but only when its owner
 * is the current user and only under the posture switch documented there.
 */
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, rmdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { PrivateBoundaryError, assureWindowsPrivateDirectories } from "./private-boundary.mjs";
import {
  assessWindowsPrivatePath,
  evaluateWindowsPrivateState,
  hardenWindowsPrivateDirectory,
  observeWindowsPrivatePath,
} from "./windows-private-state.mjs";

const OWNER_REMEDY = "Remedy: an existing insecure private directory must be removed or re-secured by its owner before the installer is re-run.";
const UNAVAILABLE_REMEDY = "Remedy: the Windows assurance could not be performed; the installer can be re-run once that is resolved.";
const INSECURE_REMEDY = "Remedy: the new directory did not end private; the installer can be re-run after checking the inherited permissions of its parent.";

/**
 * The remedy follows the observed status first: an unavailable assurance was never a verdict on the
 * directory, so nothing about removing it is offered, whether this call created it or not. A segment
 * this call created but could not remove, or a pre-existing insecure one, still needs its owner.
 */
function remedyFor(created, removed, status) {
  if (created && !removed) return OWNER_REMEDY;
  if (status === "insecure") return created ? INSECURE_REMEDY : OWNER_REMEDY;
  return UNAVAILABLE_REMEDY;
}

function fail(code, message) {
  throw new PrivateBoundaryError(code, message);
}

/** Non-recursive on purpose: a directory that is not empty is never deleted. */
function removeEmptyDirectory(directory, rmdir) {
  try {
    rmdir(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the Windows contract to one segment: harden it when this call created
 * it, assess it otherwise. A created segment that fails is taken back before the
 * refusal is thrown; a segment that already existed is never touched. The refusal
 * names the segment relative to the anchor (never a host path), the assurance
 * status and reason, and what its owner has to do.
 */
function assureSegment(anchorPath, directory, created, { harden, assess, rmdir }) {
  let observed = null;
  const record = (probe) => (path) => {
    observed = probe(path);
    return observed;
  };
  try {
    assureWindowsPrivateDirectories([{ directory, created }], { harden: record(harden), assess: record(assess) });
  } catch (error) {
    const removed = created && removeEmptyDirectory(directory, rmdir);
    if (!(error instanceof PrivateBoundaryError) || error.code !== "PB-WINDOWS-ASSURANCE") throw error;
    const status = typeof observed?.status === "string" ? observed.status : "unavailable";
    const reason = typeof observed?.reason === "string" && observed.reason.length > 0 ? observed.reason : "no reason reported";
    const name = relative(anchorPath, directory).split(sep).join("/");
    let disposition = "The directory already existed and was left untouched.";
    if (created) {
      disposition = removed
        ? "The directory was created by this call and has been removed again."
        : "The directory was created by this call but could not be removed again.";
    }
    fail("PB-WINDOWS-ASSURANCE", `private-state directory Windows assurance is ${status} for ${name}: ${reason}. ${disposition}\n${remedyFor(created, removed, status)}`);
  }
}

/**
 * Ensure `target` exists as a chain of private directories strictly below the
 * existing directory `anchor`, and return the resolved target.
 *
 * - `PB-ESCAPE`: the target does not resolve strictly inside the anchor.
 * - `PB-ANCHOR`: the anchor is not an existing directory.
 * - `PB-DIRECTORY`: a segment exists but is not a non-symlink directory.
 * - `PB-WINDOWS-ASSURANCE` (win32 only): a created segment could not be
 *   hardened to secure (it is removed again while empty), or a pre-existing
 *   segment is not already secure (it is left exactly as found).
 */
export function ensureHardenedPrivateDirectory(anchor, target, {
  platform = process.platform,
  harden = hardenWindowsPrivateDirectory,
  assess = assessWindowsPrivatePath,
  mkdir = mkdirSync,
  rmdir = rmdirSync,
} = {}) {
  if (typeof target !== "string" || target.length === 0) fail("PB-ESCAPE", "private directory target is unavailable");
  if (typeof anchor !== "string" || anchor.length === 0) fail("PB-ANCHOR", "private directory anchor is unavailable");
  const anchorPath = resolve(anchor);
  const targetPath = resolve(target);
  const below = relative(anchorPath, targetPath);
  if (below === "" || isAbsolute(below) || below === ".." || below.startsWith(`..${sep}`)) {
    fail("PB-ESCAPE", "private directory target must resolve strictly inside its anchor");
  }
  let anchorInfo = null;
  try {
    anchorInfo = statSync(anchorPath);
  } catch {
    anchorInfo = null;
  }
  if (anchorInfo === null || !anchorInfo.isDirectory()) fail("PB-ANCHOR", "private directory anchor must be an existing directory");

  let cursor = anchorPath;
  for (const segment of below.split(sep)) {
    cursor = join(cursor, segment);
    let created = false;
    try {
      mkdir(cursor, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("PB-DIRECTORY", "private-state directory segment must be a physical directory");
    }
    if (platform === "win32") assureSegment(anchorPath, cursor, created, { harden, assess, rmdir });
  }
  return targetPath;
}

const AGENT_PIPELINE_ROOT_SEGMENT = "agent-pipeline";
const AGENT_PIPELINE_ROOT_MODE = 0o700;

/**
 * D0 (Ruling 141): what a pre-existing insecure `agent-pipeline` root OWNED BY THE CURRENT USER
 * means to `ensureAgentPipelineRoot`.
 *
 * - "repair": harden it in place and report a typed advisory. This is the Elephant default, used
 *   until the PO rules otherwise: "refuse" would fail every existing checkout whose root an
 *   earlier unhardened creator left behind, until a repair verb exists.
 * - "refuse": leave it untouched and throw, exactly as `ensureHardenedPrivateDirectory` does.
 *
 * A root owned by anyone else, a reparse point and a non-directory are refused under EITHER
 * posture. This constant is the only place the default posture is decided, so a PO "refuse"
 * ruling is a one-line change here (the `posture` option overrides it per call). Any value other
 * than "repair" is read as "refuse": an unrecognised posture never widens what is repaired.
 */
export const AGENT_PIPELINE_ROOT_INSECURE_OWNED_POSTURE = "repair";

/** Typed advisory carried in the return value when a root was repaired in place. */
export const AGENT_PIPELINE_ROOT_REPAIRED_ADVISORY = "PB-ROOT-REPAIRED";

const isPrivateMode = (mode) => (mode & 0o077) === 0;
const modeText = (mode) => `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
const currentUid = () => (typeof process.getuid === "function" ? process.getuid() : null);

/**
 * POSIX repair step: chmod the directory through a descriptor opened without following a link, and
 * only when that descriptor is the very directory that was assessed (same device and inode). A
 * path swapped for a symlink between assessment and repair is refused instead of followed.
 */
function chmodPhysicalDirectory(path, mode, expected) {
  let fd = null;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  } catch {
    fail("PB-DIRECTORY", "private-state directory segment must be a physical directory");
  }
  try {
    const info = fstatSync(fd);
    if (!info.isDirectory() || info.dev !== expected.dev || info.ino !== expected.ino) {
      fail("PB-DIRECTORY", "private-state directory segment must be a physical directory");
    }
    fchmodSync(fd, mode);
  } finally {
    closeSync(fd);
  }
}

function ensureWindowsRoot({ anchorPath, root, existing, repairing, delegate, observe }) {
  if (existing !== null && repairing && existing.isDirectory() && !existing.isSymbolicLink()) {
    const seen = observe(root);
    const observation = seen?.status ? null : (seen?.observation ?? null);
    if (observation !== null) {
      const verdict = evaluateWindowsPrivateState(observation);
      // The same observation judged as if its DACL were clean: that is "secure" only when the
      // path is no reparse point and its owner is the concrete current principal. The ownership
      // test therefore comes from the one policy evaluator, and it runs BEFORE any hardening,
      // because the hardening script takes ownership for the current user.
      const ownedBySelf = evaluateWindowsPrivateState({ ...observation, principals: [observation.currentOwner] }).status === "secure";
      if (verdict.status === "insecure" && ownedBySelf) {
        delegate.harden(root);
        const after = delegate.assess(root);
        if (after?.status !== "secure") {
          const status = typeof after?.status === "string" ? after.status : "unavailable";
          const reason = typeof after?.reason === "string" && after.reason.length > 0 ? after.reason : "no reason reported";
          fail("PB-WINDOWS-ASSURANCE", `private-state directory Windows assurance is ${status} for ${AGENT_PIPELINE_ROOT_SEGMENT}: ${reason}. An in-place repair reset its DACL to the current principal, but it did not end secure.\n${remedyFor(false, false, status)}`);
        }
        return { path: root, created: false, repaired: true, advisory: AGENT_PIPELINE_ROOT_REPAIRED_ADVISORY, detail: verdict.reason };
      }
    }
  }
  // Absent, already secure, not owned by this user, unobservable, or refused by posture: the
  // existing machinery creates and hardens, or assesses and refuses.
  ensureHardenedPrivateDirectory(anchorPath, root, delegate);
  return { path: root, created: existing === null, repaired: false, advisory: null, detail: null };
}

function ensurePosixRoot({ anchorPath, root, existing, repairing, delegate, chmod, getuid }) {
  // Creates the segment with mode 0o700 when absent and proves it is a physical directory. It does
  // not assess the mode of an existing segment off win32, so that is done here.
  ensureHardenedPrivateDirectory(anchorPath, root, delegate);
  const info = lstatSync(root);
  if (isPrivateMode(info.mode)) return { path: root, created: existing === null, repaired: false, advisory: null, detail: null };
  const uid = getuid();
  const owned = Number.isInteger(uid) && info.uid === uid;
  if (!owned || !repairing) {
    const disposition = owned ? "It is owned by the current user and was left untouched (refuse posture)." : "It is not owned by the current user and was left untouched.";
    fail("PB-ROOT-INSECURE", `private-state directory ${AGENT_PIPELINE_ROOT_SEGMENT} is insecure (mode ${modeText(info.mode)}). ${disposition}\n${OWNER_REMEDY}`);
  }
  chmod(root, AGENT_PIPELINE_ROOT_MODE, info);
  const after = lstatSync(root);
  if (!after.isDirectory() || after.isSymbolicLink() || !isPrivateMode(after.mode)) {
    fail("PB-ROOT-INSECURE", `private-state directory ${AGENT_PIPELINE_ROOT_SEGMENT} did not end private after an in-place repair (mode ${modeText(after.mode)}).\n${OWNER_REMEDY}`);
  }
  return { path: root, created: false, repaired: true, advisory: AGENT_PIPELINE_ROOT_REPAIRED_ADVISORY, detail: `mode ${modeText(info.mode)} reset to ${modeText(after.mode)}` };
}

/**
 * Ensure `<common>/agent-pipeline`, the repository-private root, exists and is private, and return
 * `{ path, created, repaired, advisory, detail }`. Implemented on `ensureHardenedPrivateDirectory`.
 *
 * - Absent: created hardened (owner-only; win32 protected DACL, POSIX mode 0o700).
 * - Present and secure: returned as found.
 * - Present, insecure, owned by the current user: repaired in place under the D0 posture
 *   (`AGENT_PIPELINE_ROOT_INSECURE_OWNED_POSTURE`), re-assessed, and reported with
 *   `repaired: true`, `advisory: "PB-ROOT-REPAIRED"` and the pre-repair finding in `detail`. A repair
 *   that does not end secure is refused, never reported as repaired. On win32 the repair is the
 *   module's own owner-only protected DACL, which resets inherited and current-user entries; an
 *   explicit foreign entry on the directory itself survives it and the call then refuses.
 * - Present, insecure, owned by anyone else, a reparse point or not a physical directory: refused
 *   with the family's typed errors (`PB-WINDOWS-ASSURANCE` on win32, `PB-ROOT-INSECURE` elsewhere,
 *   `PB-DIRECTORY` for a non-directory or link) and left untouched.
 *
 * Plus the codes of `ensureHardenedPrivateDirectory` (`PB-ANCHOR` when `common` is not an existing
 * directory). Every option is an injection seam for tests; `chmod(path, mode, expectedStat)` and
 * `getuid()` are the POSIX seams, `observe` the win32 ownership probe.
 */
export function ensureAgentPipelineRoot(common, {
  platform = process.platform,
  posture = AGENT_PIPELINE_ROOT_INSECURE_OWNED_POSTURE,
  harden = hardenWindowsPrivateDirectory,
  assess = assessWindowsPrivatePath,
  observe = observeWindowsPrivatePath,
  mkdir = mkdirSync,
  rmdir = rmdirSync,
  chmod = chmodPhysicalDirectory,
  getuid = currentUid,
} = {}) {
  if (typeof common !== "string" || common.length === 0) fail("PB-ANCHOR", "private directory anchor is unavailable");
  const anchorPath = resolve(common);
  const root = join(anchorPath, AGENT_PIPELINE_ROOT_SEGMENT);
  let existing = null;
  try {
    existing = lstatSync(root);
  } catch (error) {
    // An absent root, or an anchor that is no directory at all, is judged by the delegate below.
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
  }
  const context = {
    anchorPath,
    root,
    existing,
    repairing: posture === "repair",
    delegate: { platform, harden, assess, mkdir, rmdir },
  };
  return platform === "win32"
    ? ensureWindowsRoot({ ...context, observe })
    : ensurePosixRoot({ ...context, chmod, getuid });
}
