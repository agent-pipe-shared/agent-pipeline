// SPDX-License-Identifier: SUL-1.0
/**
 * The machine-scoped configuration plane (specs/sprint-nova-epic/plans/
 * nova-setup-bootstrap.md SS2, SS6a -- PO decision, 2026-08-08).
 *
 * This module is the SOLE owner of two things: the derived path of the one file this
 * plane lives in, and the shape that may be written there. Nothing else in this plugin
 * derives that path a second time -- `guard-lifecycle-ready.mjs` imports the resolver
 * from here rather than keeping its own copy (MACHPATH-1/AC-9).
 *
 * Shape and conventions mirror resume-hint.mjs deliberately: a three-valued, never-
 * throwing reader; an atomic, validating, temp-file-then-rename writer; no second
 * derivation of "where does this live" anywhere else in the file.
 *
 * SS2's zero-overlap rule, made enforceable rather than documented (AC-5/AC-6): the
 * permitted key set below is EXACT. A repository-plane key (`gates`, `autonomy`,
 * `critic_export`, `advisor_export`, `claude_md_max_lines`, `push_approval`) or a
 * persisted-runner key (`runner`, `runners`, `agent_runtime`) can never be a member of
 * that exact set, so either one is already rejected by the plain "unknown key" check --
 * the diagnostic below names the offending key either way, which is what AC-5/AC-6 ask
 * for. `routing`, `language`, `session` and `usage` carry no further internal schema
 * here on purpose: their taxonomy is SS3-SS5a's bootstrap-questions work, explicitly a
 * LATER task (this plan's SS6, "Everything Nightwing will do properly"). They are
 * accepted as `null` (not yet configured) or an opaque plain object; validating their
 * insides is out of this task's scope and is not invented here.
 */
import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, closeSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

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

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

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

/** Shape check only, NOT a proof: looks for a PEM block marker or the substring
 * "PRIVATE KEY" in any string value, recursively. It cannot detect key material that
 * does not look like key material; it exists to catch an accidental paste, not to
 * defend against a deliberate one (AC-8). */
function looksLikeKeyMaterial(value) {
  return typeof value === "string" && (value.includes("PRIVATE KEY") || /-----BEGIN [A-Z0-9 ]+-----/u.test(value));
}
function carriesKeyMaterial(value) {
  if (typeof value === "string") return looksLikeKeyMaterial(value);
  if (Array.isArray(value)) return value.some(carriesKeyMaterial);
  if (object(value)) return Object.values(value).some(carriesKeyMaterial);
  return false;
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

/**
 * AC-7/AC-8: refuses a plane that fails its own validation, refuses a plane carrying
 * anything that looks like key material, creates the containing directory when absent,
 * refuses outright when the target already exists as a symlink, and writes atomically
 * through a temporary file in the same directory followed by a rename (mirroring
 * resume-hint.mjs's captureResumeHint).
 */
export function writeMachinePlane(plane, dependencies = {}) {
  const checked = validateMachinePlane(plane);
  if (!checked.ok) throw new Error(`MP-WRITE-REFUSED: ${checked.code}`);
  if (carriesKeyMaterial(plane)) throw new Error("MP-WRITE-REFUSED: MP-KEY-MATERIAL-SHAPE");
  const path = machinePlaneFilePath(dependencies);
  if (path === null) throw new Error("MP-WRITE-REFUSED: MP-NO-HOME");
  const exists = dependencies.existsSyncFn ?? existsSync;
  const lstat = dependencies.lstatSyncFn ?? lstatSync;
  if (exists(path) && lstat(path).isSymbolicLink()) throw new Error("MP-WRITE-REFUSED: MP-SYMLINK-REFUSED");
  const mkdir = dependencies.mkdirSyncFn ?? mkdirSync;
  mkdir(dirname(path), { recursive: true });
  const open = dependencies.openSyncFn ?? openSync;
  const write = dependencies.writeFileSyncFn ?? writeFileSync;
  const close = dependencies.closeSyncFn ?? closeSync;
  const rename = dependencies.renameSyncFn ?? renameSync;
  const temporary = `${path}.tmp`;
  const fd = open(temporary, "wx", 0o600);
  try { write(fd, `${JSON.stringify(plane, null, 2)}\n`, "utf8"); }
  finally { close(fd); }
  rename(temporary, path);
  return plane;
}
