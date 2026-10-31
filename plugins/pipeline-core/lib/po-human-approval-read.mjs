// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of scripts/po-human-approval.mjs (D216 option A, D219): the PO key-directory resolution, with no filesystem-write API,
 * so a read-only caller can reach it without importing the signing CLI. The script imports and re-exports these symbols.
 *
 * The machine-plane reader below is a read-only COPY of readMachinePlane and its validators from lib/machine-plane.mjs: that module
 * also carries the machine-plane writer and is outside the write scope of the slice that introduced this file, so it could not be
 * split there. Follow-up: give lib/machine-plane.mjs its own read half and import it here instead of the copy.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { resolveRepoScopedDirectory } from "./po-key-directory.mjs";

export const MACHINE_PLANE_SCHEMA = "pipeline.machine-plane.v1";
const MACHINE_PLANE_KEYS = Object.freeze([
  "schema", "poKeyDirectory", "pushApprovalDefault", "routing", "language", "session", "usage", "updatedAt",
]);
const PUSH_APPROVAL_DEFAULTS = Object.freeze(["signature", "chat"]);

/**
 * `<homedir>/.agent-pipeline/machine.json` -- derived through one injectable
 * dependency (`dependencies.homedirFn`, defaulting to `os.homedir()`) and from nothing
 * else: never `tool_input`, never `process.env` read directly, never repository
 * configuration. Fails closed whenever the home directory is absent, empty, relative,
 * or cannot itself be realpathed -- it never requires `.agent-pipeline/` or
 * `machine.json` itself to already exist, since the first write is what creates both.
 * Moved here verbatim from guard-lifecycle-ready.mjs (MACHPATH-1/AC-9): this is now
 * the only derivation of this path in the plugin, and the guard re-exports it rather
 * than keeping a second copy.
 */
export function machinePlaneFilePath(dependencies = {}) {
  const homedirFn = dependencies.homedirFn ?? homedir;
  let home;
  try {
    home = homedirFn();
  } catch {
    return null;
  }
  if (typeof home !== "string" || home.trim() === "" || home.includes("\0") || !isAbsolute(home)) return null;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  try {
    return join(realpath(home), ".agent-pipeline", "machine.json");
  } catch {
    return null;
  }
}

export function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Exact key-set check that names the SPECIFIC offending key, not just "shape mismatch"
 * (AC-2, AC-5, AC-6 all need the diagnostic to name a key). */
function keySetIssue(value) {
  if (!object(value)) return { code: "MP-NOT-OBJECT" };
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!MACHINE_PLANE_KEYS.includes(key)) return { code: "MP-UNKNOWN-KEY", detail: key };
  }
  for (const key of MACHINE_PLANE_KEYS) {
    if (!keys.includes(key)) return { code: "MP-MISSING-KEY", detail: key };
  }
  return null;
}

/** AC-4: absolute path, or null (not yet configured). Never reads, opens, copies or
 * logs anything INSIDE the directory -- only its own existence and type are checked,
 * which is what "exists and is not a directory" requires. */
function validPoKeyDirectory(value) {
  if (value === null) return true;
  if (typeof value !== "string" || value === "" || value.includes("\0") || !isAbsolute(value)) return false;
  try {
    if (existsSync(value) && !statSync(value).isDirectory()) return false;
  } catch {
    return false;
  }
  return true;
}

/** AC-3: exactly one of the two literal spellings, verbatim. No null, no other casing. */
function validPushApprovalDefault(value) { return PUSH_APPROVAL_DEFAULTS.includes(value); }

/** SS3/SS4's operator-property field. Not deeply specified here (Nightwing's task);
 * accepted as null or a short, safe, single-line string. */
function validLanguage(value) {
  return value === null || (typeof value === "string" && value.trim() === value
    && value.length > 0 && value.length <= 64 && !/[\r\n\0]/u.test(value));
}

/** `routing`/`session`/`usage`: null (not yet configured), or an opaque plain object.
 * Their internal taxonomy is out of this task's scope (SS6) and is not invented here. */
function nullOrPlainObject(value) { return value === null || object(value); }

function validUpdatedAt(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

/**
 * AC-1/AC-2..AC-6: `{ ok: true }` or `{ ok: false, code, detail? }`. A partially-valid
 * plane never validates -- every field is checked, and the first failure wins.
 */
export function validateMachinePlane(value) {
  const keyIssue = keySetIssue(value);
  if (keyIssue) return { ok: false, ...keyIssue };
  if (value.schema !== MACHINE_PLANE_SCHEMA) return { ok: false, code: "MP-SCHEMA-VALUE", detail: "schema" };
  if (!validPoKeyDirectory(value.poKeyDirectory)) return { ok: false, code: "MP-KEY-DIRECTORY", detail: "poKeyDirectory" };
  if (!validPushApprovalDefault(value.pushApprovalDefault)) return { ok: false, code: "MP-PUSH-APPROVAL-DEFAULT", detail: "pushApprovalDefault" };
  if (!nullOrPlainObject(value.routing)) return { ok: false, code: "MP-ROUTING", detail: "routing" };
  if (!validLanguage(value.language)) return { ok: false, code: "MP-LANGUAGE", detail: "language" };
  if (!nullOrPlainObject(value.session)) return { ok: false, code: "MP-SESSION", detail: "session" };
  if (!nullOrPlainObject(value.usage)) return { ok: false, code: "MP-USAGE", detail: "usage" };
  if (!validUpdatedAt(value.updatedAt)) return { ok: false, code: "MP-UPDATED-AT", detail: "updatedAt" };
  return { ok: true };
}

/**
 * AC-1: never throws, three-valued (`status` is one of `"absent"` | `"invalid"` |
 * `"valid"`). Each non-valid situation carries a distinct `code` (mirroring
 * resume-hint.mjs's status+code convention) so "absent" (ordinary -- a machine that has
 * not been set up), "unreadable" (`MP-UNREADABLE`), "malformed" (`MP-MALFORMED`) and
 * "fails validation" (one of the `MP-*` codes above) are each visible to a caller, but a
 * partially-valid plane is never returned as a value -- invalid means no value at all.
 */
export function readMachinePlane(dependencies = {}) {
  const path = machinePlaneFilePath(dependencies);
  if (path === null) return { status: "absent", plane: null };
  const exists = dependencies.existsSyncFn ?? existsSync;
  if (!exists(path)) return { status: "absent", plane: null };
  const readFile = dependencies.readFileSyncFn ?? readFileSync;
  let raw;
  try {
    raw = readFile(path, "utf8");
  } catch {
    return { status: "invalid", plane: null, code: "MP-UNREADABLE" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", plane: null, code: "MP-MALFORMED" };
  }
  const checked = validateMachinePlane(parsed);
  if (!checked.ok) return { status: "invalid", plane: null, code: checked.code, detail: checked.detail };
  return { status: "valid", plane: parsed };
}

// This repo's own environment inputs are all named PIPELINE_<PURPOSE> (see
// PIPELINE_GUARD_OVERRIDE, PIPELINE_LIVE_CERTIFICATION_AUTHORITY,
// PIPELINE_SECURITY_REVIEWER_ID elsewhere in this plugin); PO_APPROVAL_DIRECTORY
// follows that convention rather than inventing a new one, and is read ONLY as a
// fallback when no explicit --directory is supplied on the command line.
export const PO_APPROVAL_DIRECTORY_ENV = "PIPELINE_PO_APPROVAL_DIRECTORY";
export const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const text = (value) => typeof value === "string" && value.trim() !== "";

/**
 * R7-6-F3 (PO decision AC): the ONE key-directory resolver for every entry point (this module's
 * parseHumanArgs, toolchain-preflight.mjs, push-prepare.mjs). Tiers, in this exact order:
 *   1. `explicit`            -> source "flag"           (the --directory argument)
 *   2. PIPELINE_PO_APPROVAL_DIRECTORY -> source "environment" (per-terminal choice of a non-default key)
 *   3. machine-wide poKeyDirectory    -> source "machine-plane" (one default per OS user)
 *   4. legacy per-repository value    -> source "repo-scope", `legacy: true` (read-only)
 *   5. nothing               -> status "unset" (callers report SIGN-KEY-DIRECTORY-UNSET)
 * The result names the resolving tier. A store that is CONSULTED and invalid (the machine plane in
 * tier 3, the legacy store in tier 4) is `status: "invalid"`, never "unset" and never a fall-through
 * to a lower tier; but a higher tier that resolves is not blocked by an invalid lower store, because
 * the lower stores are not consulted at all once a higher tier has resolved. Resolving a directory
 * grants no trust: the committed anchor set decides whether the key found there may sign.
 */
export function resolvePoKeyDirectory({ explicit, repoRoot, dependencies = {} } = {}) {
  if (text(explicit)) return { status: "resolved", directory: explicit, source: "flag", legacy: false };
  const fromEnv = process.env[PO_APPROVAL_DIRECTORY_ENV];
  if (text(fromEnv)) return { status: "resolved", directory: fromEnv, source: "environment", legacy: false };
  const plane = (dependencies.readMachinePlaneFn ?? readMachinePlane)(dependencies);
  if (plane.status === "invalid") {
    return { status: "invalid", store: "machine-plane", code: plane.code, error: `machine-scoped configuration plane is invalid (${plane.code}): fix or remove ~/.agent-pipeline/machine.json, or pass --directory explicitly.` };
  }
  if (plane.status === "valid" && text(plane.plane?.poKeyDirectory)) {
    return { status: "resolved", directory: plane.plane.poKeyDirectory, source: "machine-plane", legacy: false };
  }
  // The legacy tier needs a git-common-dir computed from repoRoot; the authoritative repoRoot
  // validation stays with the caller -- this check only SKIPS the tier when repoRoot is not yet a
  // usable absolute path.
  const repoScope = (text(repoRoot) && isAbsolute(repoRoot))
    ? resolveRepoScopedDirectory(repoRoot, dependencies)
    : { status: "absent", directory: null };
  if (repoScope.status === "invalid") {
    return { status: "invalid", store: "repo-scope", code: repoScope.code, error: `this repository's own remembered PO key-directory store is invalid (${repoScope.code}): fix or remove it, or pass --directory explicitly.` };
  }
  if (repoScope.status === "valid" && text(repoScope.directory)) {
    return { status: "resolved", directory: repoScope.directory, source: "repo-scope", legacy: true };
  }
  return { status: "unset", directory: null, source: null, legacy: false };
}

/**
 * The operator's own machine-local signing-key identity, if one is registered on this
 * machine -- resolving the same two-hop path `project-onboarding-v3.mjs`'s
 * `observeLocalTrustAnchorPointer` already performs for onboarding guidance:
 * `readMachinePlane()`'s `poKeyDirectory` names a directory, and that directory's own
 * `trust-policy.json` names the key. This is the narrower, provenance-only reading a
 * caller that only wants "do I have one, and what is it" needs (NVA-CF-TOFUFIX,
 * `critical-action-authorization.mjs`'s trust-on-first-use gate) -- a caller that needs to
 * tell the individual fault states apart (no plane vs. a dead pointer vs. a malformed file,
 * for operator-facing guidance) still uses `readMachinePlane()`/`observeLocalTrustAnchorPointer`
 * directly; this collapses all of them to `null` on purpose.
 *
 * Never throws: an absent plane, an absent `poKeyDirectory`, a directory whose
 * `trust-policy.json` is missing, unreadable, unparseable, or shaped wrong all resolve to
 * `null` -- the same fail-closed posture `readMachinePlane` itself already has.
 */
export function resolveLocalOperatorKeyAnchor(dependencies = {}) {
  const exists = dependencies.existsSyncFn ?? existsSync;
  const readFile = dependencies.readFileSyncFn ?? readFileSync;
  const plane = readMachinePlane(dependencies);
  if (plane.status !== "valid") return null;
  const directory = plane.plane?.poKeyDirectory;
  if (typeof directory !== "string" || directory.length === 0) return null;
  const path = join(directory, "trust-policy.json");
  try {
    if (!exists(path)) return null;
    const parsed = JSON.parse(readFile(path, "utf8"));
    if (typeof parsed?.keyReference !== "string" || parsed.keyReference.length === 0) return null;
    if (typeof parsed?.publicKeySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(parsed.publicKeySha256)) return null;
    return { keyReference: parsed.keyReference, publicKeySha256: parsed.publicKeySha256 };
  } catch {
    return null;
  }
}

