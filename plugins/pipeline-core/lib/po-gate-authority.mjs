// SPDX-License-Identifier: SUL-1.0

/**
 * Repository-scoped PO-language and single-PRD authority.
 *
 * The module is deliberately read-only. Setup owns receipt publication and the
 * state writer owns approval mutation; this module only constructs/serializes a
 * closed local receipt and validates an observed filesystem snapshot.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix as posixPath,
  relative,
  resolve,
  sep,
} from "node:path";
import { TextDecoder } from "node:util";

import { parseYaml } from "./yaml-lite.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { windowsDriveLetterIdentity, windowsNotationCandidate } from "./repository-path-identity.mjs";
import {
  LEGACY_MANIFEST,
  LEGACY_STATE,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";

export const PO_GATE_PROFILE_RECEIPT_SCHEMA = "pipeline.po-gate-profile-receipt.v1";
export const PO_GATE_AUTHORITY_EVIDENCE_SCHEMA = "pipeline.po-gate-authority-evidence.v1";
export const PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA = "pipeline.po-gate-authority.v2";
export const PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH = join(
  "agent-pipeline",
  "po-gate",
  "profile-receipt.json",
);
export const PO_GATE_PRD_LANGUAGE_MARKER = (language) => `<!-- po-language: ${language} -->`;
// The literal (parameter-free) line the active PRD must carry, added by the PO
// -- never by an agent authoring or revising the PRD on the PO's behalf -- to
// record that they have personally read the PRD and judge it content-sound
// and consistent with the neighboring spec.md (backlog/items/2026-08-07-
// a-promoted-feature-can-never-pass-the-plan-gate.md, PO decision 2026-08-11:
// "A und PRD inhaltlich okay und passend zur Spec ist das gate"). This is
// additive to, never a replacement of, the mechanical prd_*.md/path check
// (PRD_NAME/PO-GATE-PRD-CARDINALITY/PO-GATE-PLAN-PATH-MISMATCH above) and the
// byte-exact technical-Spec-digest binding (TECHNICAL_SPEC_MARKER below): both
// stay load-bearing on their own causes, this marker only adds a third,
// independent, mandatory precondition. It deliberately carries no computed
// value (no digest, no timestamp) -- content-soundness is a judgment a
// machine cannot derive (ADR-0061 Decision 3), so there is nothing here for
// the gate to verify beyond the line's bare, exact presence; the actual
// review is the PO's own act, out of band, before this line is added.
export const PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER = "<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->";

const PO_GATE_PROFILE_SOURCE = "pipeline.user.yaml";
const SUPPORTED_LANGUAGES = new Set(["de", "en"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const PRD_NAME = /^prd_[^/\\]+\.md$/u;
// Exported so a promotion precondition check (onboarding-continuity.mjs) can
// refuse, at plan time, a PRD the gate below would refuse anyway -- from the
// same grammar, never a re-declared copy that could drift from this one.
export const PRD_LANGUAGE_MARKER = /^<!-- po-language: ([a-z]{2}) -->$/gmu;
export const TECHNICAL_SPEC_MARKER = /^<!-- technical-spec-sha256: ([0-9a-f]{64}) -->$/gmu;
// Same closed grammar as the two markers above: anchored, single-line, exact
// text, matched with matchAll so a caller can also detect an accidental
// duplicate rather than only its absence.
export const PRD_ACKNOWLEDGEMENT_MARKER = /^<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->$/gmu;
const RECEIPT_KEYS = [
  "schema",
  "repositoryFingerprint",
  "canonicalPrimaryRoot",
  "sourceSha256",
  "runtimeSha256",
  "humanFacing",
  "updatedAt",
];
// The first route exists only inside the Pipeline's own repository. A consumer
// project has the plugin but no setup.mjs, so naming only that route hands the
// PO guidance they cannot execute; the second sentence names the route they can
// run against their own project, including the operator-facing language ADR-0011
// leaves to them. Both act on the project's own primary checkout -- the receipt
// is shared through the Git common directory and is validated against the
// primary's bytes, so a linked worktree must not be able to publish it.
const PROFILE_REPAIR = "Run node setup.mjs --publish-po-profile from the canonical primary checkout, then retry."
  + " In a consumer project, run the pipeline-core script po-gate-profile-repair.mjs (plan, then apply --activate)"
  + " against that project's own primary checkout; add --human-facing <de|en> to set or correct the operator-facing language.";
const PRD_REPAIR = "Repair activeFeature.planPath and the active feature directory; do not create child PRDs.";
// PO-GATE-PRD-SPEC-MISMATCH is a document-binding defect: the PRD's technical
// Spec marker and the neighboring spec.md bytes disagree, or that spec.md is not
// readable as a physical regular file. activeFeature.planPath is correct in this
// state, so PRD_REPAIR's route repairs nothing here -- worse, it invites an edit
// to authority state in order to fix a document. Name the two documents, the
// exact marker grammar this module parses, and -- for the approved-plan case,
// where editing the PRD by hand would break the recorded approval -- the
// sanctioned rebind route pipeline-state.mjs itself provides, in the flag form
// its own usage line accepts. No absolute path appears in either sentence.
// The unqualified "bring those two documents back into agreement" used to be
// the whole remedy, and it is wrong in exactly one of the three lifecycle
// states this failure can occur in: once a kickoff promotion has bound this
// PRD's bytes but the plan is not yet approved, editing the PRD in place
// breaks that binding without making the gate pass, and there is no
// sanctioned in-place fix from this state -- so the remedy below is
// conditioned on which of the three states the reader is actually in, rather
// than naming an edit that only two of the three states can safely make.
const SPEC_REPAIR = "The active PRD must bind the neighboring spec.md of the same feature directory:"
  + " that spec.md must exist as a physical regular file, and the PRD must carry its digest exactly once,"
  + " as <!-- technical-spec-sha256: <sha256-of-spec.md> --> on its own line."
  + " Which remedy applies depends on this PRD's lifecycle state, and only one of the three below is correct for it:"
  + " if this PRD has not been bound by a kickoff promotion, edit the marker in the PRD to the neighboring spec.md's current digest;"
  + " if a kickoff promotion has already bound this PRD and the plan is not yet approved, do not edit either document in place --"
  + " the promotion already bound their exact bytes, so an in-place edit only breaks that binding and does not make this check pass;"
  + " if the plan is already approved and the Spec changed during implementation, use the sanctioned rebind rather than editing the marker by hand:"
  + " run the pipeline-core script pipeline-state.mjs po-authority-rebind-plan, then pipeline-state.mjs po-authority-rebind-apply"
  + " --plan-sha256 <sha256> --updated-at <ISO-8601> --activate with the digest and timestamp that plan reports."
  + " In every case, do not change activeFeature.planPath, which is not what is wrong here.";
// PO-GATE-PRD-SPEC-MARKER-MISSING is the "absent" half of what used to be a
// single PO-GATE-PRD-SPEC-MISMATCH: the PRD carries no technical Spec marker
// at all, or more than one, so there is no single recorded digest to compare
// against spec.md in the first place -- a different defect from "the recorded
// digest is wrong" (SPEC_REPAIR), and it needs its own remedy rather than
// reusing that one. If a kickoff promotion has already bound this PRD's
// bytes, adding the marker now would change those bytes and break the
// binding without making this check pass, and there is no sanctioned route
// back from that state today: the rebind family requires an existing
// approval, which a PRD that never carried this marker cannot have reached.
// This text therefore names the fix only for the still-freely-editable case,
// and for the bound case says plainly that an in-place edit is not a fix --
// it does not invent a route, and it does not name the rebind, because
// offering a route that is known to refuse in this state is the failure this
// module exists to stop repeating.
const SPEC_MARKER_MISSING_REPAIR = "The active PRD does not carry the technical Spec marker exactly once, as"
  + " <!-- technical-spec-sha256: <sha256-of-spec.md> --> on its own line, with the neighboring spec.md's own digest."
  + " If this PRD has not been bound by a kickoff promotion, add that single line to the PRD."
  + " If a kickoff promotion has already bound this PRD, do not add or edit that line in place: the promotion already"
  + " bound these exact bytes, and an in-place edit only breaks that binding without making this check pass;"
  + " there is no sanctioned way to add the marker to an already-bound PRD today;"
  + " do not change activeFeature.planPath, which is not what is wrong here.";
// PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING is additive to, never a substitute for,
// PO-GATE-PRD-SPEC-MARKER-MISSING/-MISMATCH above: those bind the PRD to the
// Spec's *bytes*; this one records that the PO has actually judged the result
// -- content-sound and consistent with that Spec -- which no digest can stand
// in for. Same caveat as the Spec marker: adding this line to an
// already-promotion-bound PRD changes its bytes and breaks that binding
// without making this check pass, and there is no sanctioned route back from
// that state today, so the remedy below names the fix only for the
// still-freely-editable case and is honest that the bound case has none.
const ACKNOWLEDGEMENT_REPAIR = "The active PRD does not carry the PO's plan acknowledgement marker exactly once, as"
  + ` ${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER} on its own line.`
  + " This line is the PO's own record -- after personally reading the PRD -- that its content is sound and it is"
  + " consistent with the neighboring spec.md; it is additive to the mechanical prd_*.md/path check and the technical"
  + " Spec digest binding above, not a replacement for either, and an agent must never add it on the PO's behalf"
  + " without that review having actually happened."
  + " If this PRD has not been bound by a kickoff promotion, the PO adds that single line to the PRD once satisfied."
  + " If a kickoff promotion has already bound this PRD, do not add that line by direct Edit/Write: the promotion"
  + " already bound these exact bytes, and an ungoverned edit only breaks that binding without making this check"
  + " pass; instead use the sanctioned acknowledge route, which adds the marker through the same atomic,"
  + " crash-safe transaction primitive already used for other bound-authority updates rather than a raw file write:"
  + " run the pipeline-core script pipeline-state.mjs po-authority-acknowledge-plan --by <name>, then"
  + " pipeline-state.mjs po-authority-acknowledge-apply --plan-sha256 <sha256> --updated-at <ISO-8601> --by <name>"
  + " --activate with the exact digest, timestamp and name that plan reports (2026-08-19: --by is required and"
  + " covered by the plan's own digest, so a mismatched name is refused as a stale plan, not silently accepted)."
  + " An agent must never run this route without that PO review having actually happened, and must never invent"
  + " a --by value -- the name must come from the PO's own instruction, not be guessed or defaulted."
  + " The apply step (2026-08-25, AGY-PRDGATE-1, docs/adr/0021-prd-po-gate.md addendum) is no longer merely a"
  + " moral prohibition on an agent running it unattended: it is wired through the same attended chat-gate"
  + " ceremony already used for push approval and kickoff (lib/chat-gate-ceremony.mjs), so an agent's own tool"
  + " call cannot complete it at all. The PO must run po-authority-acknowledge-apply themselves, directly in"
  + " their own attended terminal, and retype the --by value shown back to them when prompted."
  + " Do not change activeFeature.planPath, which is not what is wrong here.";
// A PRD whose bytes are not decodable UTF-8 never reaches any marker check. The
// defect is the encoding of one file; no path, directory or PRD count is
// involved, and no script in this repository re-encodes a document for the PO.
const ENCODING_REPAIR = "The active PRD is not canonical UTF-8 text; this is a file-encoding defect, not a plan-path defect."
  + " Re-save the PRD at its current location as UTF-8 text, then retry; do not change activeFeature.planPath.";
// The digest-staleness failures say the caller's snapshot is older than the
// documents it binds -- the path it names is still the right one. The remedy is
// to re-read the authority and re-submit with the digests it reports. Deliberately
// no script is named: the operation to repeat is whichever one the operator was
// running, and this repository's own checker does not exist in a consumer project.
const SNAPSHOT_REPAIR = "The authority snapshot is older than the documents it binds:"
  + " the active PRD or its Spec changed, or the active feature was cleared, after those digests were taken."
  + " Re-read the current PO gate authority and re-submit the operation with the digests it reports,"
  + " or restore the documents to the state the snapshot was taken from; if the active feature was cleared, re-establish it first."
  + " Do not change activeFeature.planPath.";
// A PRD language marker that disagrees with the configured language is not a
// plan-path defect, and PRD_REPAIR's route repairs nothing about it. The PO in
// this state has two legitimate resolutions: change the configured language to
// match the document, or change the marker to match the configuration. Name the
// first one first -- ADR-0011 leaves the operator-facing language to the PO, so
// guidance that led with "edit the marker" would read as an instruction to mark
// the document inaccurately. The invocation is the one po-gate-profile-repair.mjs
// itself parses and emits; it names the operator's own project root and no
// absolute path, which keeps this string inside the no-machine-path contract the
// rest of this module's failures hold to.
const LANGUAGE_REPAIR = (expected, documentLanguageSet) =>
  documentLanguageSet
    ? `The active PRD must declare its independently configured document language exactly once, as ${PO_GATE_PRD_LANGUAGE_MARKER(expected)} on its own line;`
      + ` this feature's documentLanguage is set to "${expected}".`
      + " There is no separate command to change this after the fact: correct the marker in the PRD to match the configured document language,"
      + " or, if the document language itself genuinely needs to change, go through the same reviewed process any other material PRD change already requires."
    : `The active PRD must declare the configured operator-facing language exactly once, as ${PO_GATE_PRD_LANGUAGE_MARKER(expected)} on its own line;`
      + ` this project is configured for "${expected}".`
      + " If the document is genuinely written in the other language, change the configuration rather than the document:"
      + " run the pipeline-core script po-gate-profile-repair.mjs plan --root <project-root> --human-facing <de|en>"
      + " against that project's own primary checkout, then po-gate-profile-repair.mjs apply --root <project-root>"
      + " --human-facing <de|en> --plan-sha256 <sha256> --activate with the digest that plan reports."
      + " Otherwise correct the marker in the PRD to match the configured language.";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value) {
  return UTF8.decode(Buffer.from(value));
}

function fail(code, reason, repair) {
  return { ok: false, code, reason, repair };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCanonicalIso(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function normalizeAbsolute(path) {
  if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0")) return null;
  const normalized = resolve(path);
  return normalized === path ? normalized : null;
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertPhysicalDirectory(path) {
  const absolute = normalizeAbsolute(path);
  if (absolute === null) throw new Error("unsafe directory");
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error("unsafe directory");
  }
  return absolute;
}

function physicalPath(root, relativePath, kind) {
  const rootReal = assertPhysicalDirectory(root);
  const normalized = normalizeRepositoryPath(relativePath);
  if (normalized === null) throw new Error("unsafe relative path");
  let cursor = rootReal;
  for (const component of normalized.split("/")) {
    cursor = join(cursor, component);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error("symlink is not allowed");
  }
  const real = realpathSync(cursor);
  if (!inside(rootReal, real) || real !== cursor) throw new Error("physical path escapes root");
  const info = lstatSync(cursor);
  if (kind === "file" && !info.isFile()) throw new Error("regular file required");
  if (kind === "directory" && !info.isDirectory()) throw new Error("directory required");
  return cursor;
}

function readPhysicalFile(root, relativePath) {
  const path = physicalPath(root, relativePath, "file");
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error("regular file required");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const lexicalAfter = lstatSync(path);
    if (
      lexicalAfter.isSymbolicLink()
      || !lexicalAfter.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || after.dev !== lexicalAfter.dev
      || after.ino !== lexicalAfter.ino
      || realpathSync(path) !== path
    ) throw new Error("file identity changed during read");
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function configuredLanguage(sourceBytes, runtimeBytes) {
  try {
    const source = parseYaml(decodeUtf8(sourceBytes));
    const runtime = parseYaml(decodeUtf8(runtimeBytes));
    const sourceLanguage = source?.language?.human_facing;
    const runtimeLanguage = runtime?.language?.human_facing;
    if (!SUPPORTED_LANGUAGES.has(sourceLanguage) || !SUPPORTED_LANGUAGES.has(runtimeLanguage)) return null;
    if (sourceLanguage !== runtimeLanguage) return null;
    return sourceLanguage;
  } catch {
    return null;
  }
}

/**
 * Validate only the PO-facing language pair. Runner schema, routing and profile
 * migration deliberately remain outside this narrow repository authority.
 */
export function validatePoGateLanguageProjection(sourceBytes, runtimeBytes) {
  const humanFacing = configuredLanguage(sourceBytes, runtimeBytes);
  return humanFacing === null
    ? fail(
      "PO-PROFILE-PROJECTION-INVALID",
      "The canonical primary source/runtime PO-language projection is missing, unsupported or inconsistent.",
      PROFILE_REPAIR,
    )
    : { ok: true, code: "PO-PROFILE-PROJECTION-VALID", humanFacing };
}

/** Reject absolute, platform-specific, aliasing and traversal forms. */
export function normalizeRepositoryPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\\")
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
  ) return null;
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return parts.join("/");
}

/**
 * Fold the WSL2 default-automount `/mnt/<drive>/...` spelling and the native
 * Windows `<DRIVE>:\...` spelling of the SAME physical NTFS directory into
 * one canonical, lower-cased identity string before it is ever hashed. A
 * bare separator/case rewrite is not enough on its own -- WSL's mount prefix
 * has no Windows-side counterpart to rewrite against unless it is
 * recognized specifically (confirmed empirically, NVA-FINGERPRINT-1:
 * neither spelling is literally the other with only `/` swapped for `\`).
 * NTFS and the WSL DrvFs bridge over it are both case-insensitive, so
 * lower-casing is safe -- but ONLY once a path is recognized as belonging to
 * that drive-letter world: a plain POSIX path outside it (`/home/user/repo`)
 * can be a genuinely different physical directory from a same-string
 * different-case sibling on a real case-sensitive filesystem, so it is left
 * byte-for-byte, never folded. `path.win32`/`path.posix` are used
 * explicitly rather than the platform-bound default `node:path` import this
 * file otherwise uses: the two spellings of one physical path must
 * canonicalize to the SAME key no matter which OS the deriving process
 * happens to be running on -- a WSL-mode process and a native-Windows-mode
 * process must each recognize BOTH spellings, not only their own host's
 * native one, or nothing here would ever collapse.
 */
// NVA-PATHIDENT-1: the two shared decisions (is this Windows notation, and what is
// its canonical identity) now live in lib/repository-path-identity.mjs, which is the
// single definition across this module, codex-onboarding-runtime.mjs and
// guard-maintenance-window.mjs. What stays here is exactly what was never shared:
// this caller's stricter contract -- it validates its input and returns `null` on any
// path it cannot canonicalize, where the other two fall back to the string itself.
// Merging those fallbacks into one function would have changed one caller's
// fingerprints, which is the silent divergence the extraction exists to end.
export function canonicalRepositoryPathIdentity(path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return null;
  const candidate = windowsNotationCandidate(path);
  if (candidate !== null) return windowsDriveLetterIdentity(candidate);
  if (!posixPath.isAbsolute(path)) return null;
  const resolved = posixPath.resolve(path);
  return resolved === path ? resolved : null;
}

/**
 * Local fingerprint. Its path inputs are hashed and never returned as
 * evidence. The hash tag is deliberately kept at `v1`: for a path outside
 * the WSL-mount/Windows-drive-letter world (the common case -- a plain
 * Linux or macOS checkout), `canonicalRepositoryPathIdentity` returns
 * byte-for-byte what `normalizeAbsolute` already produced, so this fix
 * requires no migration at all for that majority case -- confirmed by test
 * ("a plain POSIX path is unaffected"). Only a path recognized as one of
 * the two folded notations changes value versus before, by construction,
 * since collapsing that boundary is the entire point.
 */
export function derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot }) {
  const common = canonicalRepositoryPathIdentity(gitCommonDir);
  const primary = canonicalRepositoryPathIdentity(primaryRoot);
  if (common === null || primary === null) throw new TypeError("canonical absolute roots are required");
  return sha256(`pipeline.po-gate.repository.v1\0${common}\0${primary}`);
}

/**
 * The pre-NVA-FINGERPRINT-1 formula, kept verbatim (raw `normalizeAbsolute`
 * output, no cross-notation folding) so a receipt a previous pipeline
 * version already published under it can still be recognized -- read-only
 * lookback, never a write. `poGateReceiptFingerprintMatches` is the only
 * intended caller.
 */
export function derivePoGateRepositoryFingerprintLegacy({ gitCommonDir, primaryRoot }) {
  const common = normalizeAbsolute(gitCommonDir);
  const primary = normalizeAbsolute(primaryRoot);
  if (common === null || primary === null) throw new TypeError("canonical absolute roots are required");
  return sha256(`pipeline.po-gate.repository.v1\0${common}\0${primary}`);
}

/**
 * True when a stored `receiptFingerprint` binds `{ gitCommonDir, primaryRoot
 * }` under the current formula OR the pre-fix one -- a receipt published by
 * older code (same or a differently-notated access path) is still found,
 * never silently orphaned. The next fresh receipt publish naturally moves a
 * repository onto the current formula; this function never writes.
 */
export function poGateReceiptFingerprintMatches({ receiptFingerprint, gitCommonDir, primaryRoot }) {
  if (typeof receiptFingerprint !== "string") return false;
  let current = null;
  let legacy = null;
  try { current = derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot }); } catch { /* handled below */ }
  try { legacy = derivePoGateRepositoryFingerprintLegacy({ gitCommonDir, primaryRoot }); } catch { /* handled below */ }
  return receiptFingerprint === current || receiptFingerprint === legacy;
}

export function poGateProfileReceiptPath(gitCommonDir) {
  const common = normalizeAbsolute(gitCommonDir);
  if (common === null) throw new TypeError("canonical Git common directory is required");
  return join(common, PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH);
}

export function validatePoGateProfileReceipt(receipt) {
  if (!hasExactKeys(receipt, RECEIPT_KEYS)) return false;
  return receipt.schema === PO_GATE_PROFILE_RECEIPT_SCHEMA
    && SHA256.test(receipt.repositoryFingerprint)
    && normalizeAbsolute(receipt.canonicalPrimaryRoot) !== null
    && SHA256.test(receipt.sourceSha256)
    && SHA256.test(receipt.runtimeSha256)
    && SUPPORTED_LANGUAGES.has(receipt.humanFacing)
    && isCanonicalIso(receipt.updatedAt);
}

/** Build the closed machine-local receipt after setup has validated its inputs. */
export function createPoGateProfileReceipt({
  repositoryFingerprint,
  primaryRoot,
  sourceBytes,
  runtimeBytes,
  updatedAt,
}) {
  const canonicalPrimaryRoot = normalizeAbsolute(primaryRoot);
  const projection = validatePoGateLanguageProjection(sourceBytes, runtimeBytes);
  const humanFacing = projection.ok ? projection.humanFacing : null;
  if (!SHA256.test(repositoryFingerprint) || canonicalPrimaryRoot === null || humanFacing === null || !isCanonicalIso(updatedAt)) {
    throw new TypeError("invalid PO-gate profile receipt input");
  }
  return {
    schema: PO_GATE_PROFILE_RECEIPT_SCHEMA,
    repositoryFingerprint,
    canonicalPrimaryRoot,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    humanFacing,
    updatedAt,
  };
}

export function serializePoGateProfileReceipt(receipt) {
  if (!validatePoGateProfileReceipt(receipt)) throw new TypeError("invalid PO-gate profile receipt");
  const ordered = Object.fromEntries(RECEIPT_KEYS.map((key) => [key, receipt[key]]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Git (including Git for Windows) always emits worktree porcelain roots with
 * `/` separators, even on win32. Canonicalize only that fixed separator
 * convention before the strict absolute-path check; never relax the check
 * itself, and leave POSIX platforms byte-for-byte unchanged.
 */
function gitWorktreeRootCandidate(root) {
  return process.platform === "win32" ? root.replaceAll("/", sep) : root;
}

/**
 * Parse `git worktree list --porcelain -z` without exposing paths in errors.
 * A record may carry a `prunable <reason>` field when Git itself has already
 * determined the registration's working directory no longer exists (the
 * reason text is Git's own and is not a stable contract -- only the field's
 * presence is the signal). Surface that as `prunable: boolean` on the entry;
 * never drop the entry or fail the parse over it.
 */
export function parseGitWorktreeList(raw) {
  if (typeof raw !== "string" || !raw.endsWith("\0")) return null;
  const records = raw.split("\0\0").filter((record) => record.length > 0);
  const entries = [];
  for (const record of records) {
    const fields = record.split("\0").filter(Boolean);
    if (!fields[0]?.startsWith("worktree ")) return null;
    const root = fields[0].slice("worktree ".length);
    if (normalizeAbsolute(gitWorktreeRootCandidate(root)) === null) return null;
    const head = fields.find((field) => field.startsWith("HEAD "))?.slice(5);
    const branch = fields.find((field) => field.startsWith("branch "))?.slice(7) ?? null;
    const detached = fields.includes("detached");
    const prunable = fields.some((field) => field.startsWith("prunable "));
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(head ?? "") || (branch === null) === !detached) return null;
    entries.push({ root, head, branch, detached, prunable });
  }
  if (entries.length === 0 || new Set(entries.map(({ root }) => root)).size !== entries.length) return null;
  return entries;
}

export function selectPrimaryWorktree(entries) {
  return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
}

export function isSuccessfulGitEpermObservation(result) {
  return result?.status === 0
    && result?.error?.code === "EPERM"
    && typeof result.stdout === "string";
}

function gitObservation(root, args, spawn = spawnSync) {
  const result = spawn("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  if (result.status !== 0 || (result.error && !isSuccessfulGitEpermObservation(result)) || typeof result.stdout !== "string") {
    throw new Error("Git topology unavailable");
  }
  return result.stdout;
}

/** Resolve the current/common/primary topology without trusting launch-directory aliases. */
export function resolvePoGateRepositoryTopology(repoRoot, deps = {}) {
  const start = assertPhysicalDirectory(realpathSync(resolve(repoRoot)));
  const observedRoot = assertPhysicalDirectory(realpathSync(gitObservation(start, ["rev-parse", "--show-toplevel"], deps.spawn).trim()));
  // `start` is derived from the caller's (possibly mis-cased) current working
  // directory; plain `realpathSync` on Windows preserves whatever casing it is
  // given rather than normalizing to the filesystem's on-disk canonical
  // casing, while Git's own `--show-toplevel` output already resolves to that
  // disk-canonical casing regardless of the cwd casing it was invoked with.
  // Re-derive both sides through the native OS realpath immediately before
  // comparing (never before -- `start`/`observedRoot` themselves, and every
  // value returned below, must stay byte-identical to today) so a same-directory
  // case mismatch is corrected without ever treating two genuinely different
  // physical directories as equal: `realpathSync.native` only normalizes the
  // casing of a path that already resolves to one real directory, and is a
  // no-op on case-sensitive/POSIX filesystems.
  if (realpathSync.native(observedRoot) !== realpathSync.native(start)) throw new Error("repository root mismatch");
  const commonRaw = gitObservation(start, ["rev-parse", "--path-format=absolute", "--git-common-dir"], deps.spawn).trim();
  const gitCommonDir = assertPhysicalDirectory(realpathSync(isAbsolute(commonRaw) ? commonRaw : resolve(start, commonRaw)));
  const worktrees = parseGitWorktreeList(gitObservation(start, ["worktree", "list", "--porcelain", "-z"], deps.spawn));
  const primary = selectPrimaryWorktree(worktrees);
  if (worktrees === null || primary === null) throw new Error("Git worktree topology unavailable");
  // Exclude registrations Git itself has already marked `prunable` (their working
  // directory no longer physically exists) before the physical-directory assertion,
  // rather than letting a stale registration's ENOENT abort topology resolution
  // entirely. This is fail-CLOSED, not fail-open: `registeredWorktreeRoots` is only
  // ever consumed to check that the *current* root is a member of it, so removing
  // entries can only shrink that set and can only turn a would-be acceptance into a
  // rejection, never the reverse -- a stale registration can never legitimately be
  // the current root, because the current root demonstrably exists (it was just
  // realpath'd above). Non-prunable entries still go through the unrelaxed
  // assertPhysicalDirectory/realpathSync check below and still throw on failure.
  const registeredWorktreeRoots = worktrees
    .filter((entry) => !entry.prunable)
    .map(({ root }) => assertPhysicalDirectory(realpathSync(root)));
  return {
    repoRoot: observedRoot,
    gitCommonDir,
    primaryRoot: assertPhysicalDirectory(realpathSync(primary.root)),
    registeredWorktreeRoots,
    worktrees,
  };
}

/** Production entry used by pipeline-start, Verify and the approval writer. */
export function validatePoGateAuthorityForRepository({
  repoRoot,
  expectedPlanSha256 = undefined,
  expectedSpecSha256 = undefined,
}, deps = {}) {
  let topology;
  try {
    topology = deps.topology ?? resolvePoGateRepositoryTopology(repoRoot, deps);
  } catch {
    return fail("PO-GATE-AUTHORITY-UNAVAILABLE", "Repository topology or authority inputs are unavailable.", PROFILE_REPAIR);
  }
  return validatePoGateAuthority({ ...topology, expectedPlanSha256, expectedSpecSha256 });
}

/**
 * Validate only the machine-local PO profile receipt and its canonical primary
 * source/runtime projection. Feature state, PRDs and approval state are
 * deliberately outside this readback boundary.
 */
export function validatePoGateProfileForRepository({ repoRoot } = {}, deps = {}) {
  let topology;
  try {
    topology = deps.topology ?? resolvePoGateRepositoryTopology(repoRoot, deps);
  } catch {
    return fail("PO-PROFILE-AUTHORITY-UNAVAILABLE", "Repository topology or profile inputs are unavailable.", PROFILE_REPAIR);
  }
  let profile;
  try {
    profile = validatePoGateProfileSnapshot(topology);
  } catch {
    return fail("PO-PROFILE-AUTHORITY-UNAVAILABLE", "Repository topology or profile inputs are unavailable.", PROFILE_REPAIR);
  }
  return profile.ok
    ? { ok: true, code: "PO-PROFILE-AUTHORITY-VALID", value: profile.value }
    : profile;
}

function loadReceipt(gitCommonDir) {
  const common = assertPhysicalDirectory(gitCommonDir);
  const path = poGateProfileReceiptPath(common);
  const parentRelative = relative(common, dirname(path)).split(sep).join("/");
  physicalPath(common, parentRelative, "directory");
  const info = lstatSync(path);
  const posixModeViolation = process.platform !== "win32" && (info.mode & 0o777) !== 0o600;
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path || posixModeViolation) {
    throw new Error("unsafe receipt");
  }
  const receiptRelative = relative(common, path).split(sep).join("/");
  const raw = decodeUtf8(readPhysicalFile(common, receiptRelative));
  if (process.platform === "win32") {
    if (assessWindowsPrivatePath(path).status !== "secure" || assessWindowsPrivatePath(dirname(path)).status !== "secure") throw new Error("unsafe receipt Windows assurance");
  } else if ((lstatSync(path).mode & 0o777) !== 0o600) throw new Error("unsafe receipt mode");
  const receipt = JSON.parse(raw);
  if (!validatePoGateProfileReceipt(receipt) || raw !== serializePoGateProfileReceipt(receipt)) {
    throw new Error("invalid receipt");
  }
  return { receipt, raw };
}

/**
 * The exact pair of project-relative files the PO profile receipt binds.
 *
 * Every writer of that receipt MUST bind these two files, because this is what
 * the authority validator reads back. Resolving the runtime manifest a second
 * time somewhere else is how the receipt silently starts binding the other
 * authority tier: the two manifest tiers are only *seeded* equal, never
 * guaranteed equal, so a divergence turns a freshly published receipt into a
 * PO-PROFILE-RECEIPT-STALE rejection with no human-visible cause.
 */
export function poGateProfileProjectionPaths(rootDir) {
  const authority = resolveProjectAuthorityPaths({ rootDir });
  const manifest = authority.status === "ready"
    ? authority.manifest
    : (existsSync(join(rootDir, NEUTRAL_MANIFEST)) ? NEUTRAL_MANIFEST : LEGACY_MANIFEST);
  return { source: PO_GATE_PROFILE_SOURCE, manifest };
}

function readProjection(root) {
  const { source, manifest } = poGateProfileProjectionPaths(root);
  const sourceBytes = readPhysicalFile(root, source);
  const runtimeBytes = readPhysicalFile(root, manifest);
  return {
    sourceBytes,
    runtimeBytes,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    humanFacing: configuredLanguage(sourceBytes, runtimeBytes),
  };
}

function validatePoGateProfileSnapshot({ repoRoot, gitCommonDir, primaryRoot, registeredWorktreeRoots }) {
  let current;
  let common;
  let primary;
  try {
    current = assertPhysicalDirectory(repoRoot);
    common = assertPhysicalDirectory(gitCommonDir);
    primary = assertPhysicalDirectory(primaryRoot);
  } catch {
    return fail("PO-GATE-WORKTREE-INVALID", "The repository topology is not physical and canonical.", PROFILE_REPAIR);
  }
  if (
    !Array.isArray(registeredWorktreeRoots)
    || registeredWorktreeRoots.some((root) => normalizeAbsolute(root) === null)
    || !registeredWorktreeRoots.includes(current)
    || registeredWorktreeRoots[0] !== primary
  ) {
    return fail("PO-GATE-WORKTREE-UNREGISTERED", "The current or primary checkout is not the registered Git worktree authority.", PROFILE_REPAIR);
  }

  let loaded;
  try {
    loaded = loadReceipt(common);
  } catch {
    return fail("PO-PROFILE-RECEIPT-INVALID", "The common PO profile receipt is missing, unsafe, noncanonical or malformed.", PROFILE_REPAIR);
  }
  const { receipt, raw: receiptRaw } = loaded;
  let expectedFingerprint;
  try {
    expectedFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: primary });
  } catch {
    return fail("PO-PROFILE-RECEIPT-INVALID", "The repository fingerprint cannot be derived safely.", PROFILE_REPAIR);
  }
  // A receipt published by a pre-NVA-FINGERPRINT-1 pipeline version still
  // carries the old formula's value; accept it too rather than forcing an
  // unnecessary re-publish (poGateReceiptFingerprintMatches never writes).
  const fingerprintBinds = receipt.repositoryFingerprint === expectedFingerprint
    || poGateReceiptFingerprintMatches({ receiptFingerprint: receipt.repositoryFingerprint, gitCommonDir: common, primaryRoot: primary });
  if (!fingerprintBinds || receipt.canonicalPrimaryRoot !== primary) {
    return fail("PO-PROFILE-RECEIPT-STALE", "The common PO profile receipt does not bind the current primary checkout.", PROFILE_REPAIR);
  }

  let primaryProjection;
  try {
    primaryProjection = readProjection(primary);
  } catch {
    return fail("PO-PROFILE-RECEIPT-STALE", "The canonical primary profile cannot be read safely.", PROFILE_REPAIR);
  }
  if (
    primaryProjection.humanFacing === null
    || primaryProjection.humanFacing !== receipt.humanFacing
    || primaryProjection.sourceSha256 !== receipt.sourceSha256
    || primaryProjection.runtimeSha256 !== receipt.runtimeSha256
  ) {
    return fail("PO-PROFILE-RECEIPT-STALE", "The common PO profile receipt no longer matches the canonical primary profile.", PROFILE_REPAIR);
  }

  return {
    ok: true,
    current,
    value: {
      schema: PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
      humanFacing: receipt.humanFacing,
      sourceSha256: primaryProjection.sourceSha256,
      runtimeSha256: primaryProjection.runtimeSha256,
      receiptSha256: sha256(receiptRaw),
      repositoryFingerprint: receipt.repositoryFingerprint,
    },
  };
}

function activeFeatureState(repoRoot) {
  const authority = resolveProjectAuthorityPaths({ rootDir: repoRoot });
  // Any non-"ready" status (mixed, missing, unsafe, migration-required, invalid, ...)
  // is an ambiguous or unsafe authority resolution. Fail closed here rather than
  // silently falling back to a default state path -- the caller turns this into
  // PO-GATE-STATE-AUTHORITY-UNAVAILABLE.
  if (authority.status !== "ready") return { status: "unavailable" };
  const raw = readPhysicalFile(
    repoRoot,
    authority.state ?? (authority.source === "legacy" ? LEGACY_STATE : NEUTRAL_STATE),
  );
  const state = JSON.parse(decodeUtf8(raw));
  if (!Object.prototype.hasOwnProperty.call(state, "activeFeature")) return { status: "absent" };
  const active = state?.activeFeature;
  if (!isPlainObject(active) || typeof active.id !== "string" || active.id.trim() === "") return { status: "invalid" };
  const planPath = normalizeRepositoryPath(active.planPath);
  if (planPath === null || !PRD_NAME.test(basename(planPath))) return { status: "invalid" };
  // Same already-parsed object, no new I/O. Absent whenever the promoted PRD's
  // own marker was {de, en} (the operator-facing axis drove humanFacingLanguage
  // instead, unchanged) or whenever no promotion has set it at all.
  const documentLanguage = state?.continuity?.runtime?.documentLanguage ?? null;
  return { status: "active", id: active.id, planPath, documentLanguage };
}

function prdAuthority(repoRoot, active, expectedLanguage, requireAcknowledgement) {
  const featureDirectory = dirname(active.planPath).split(sep).join("/");
  let directory;
  try {
    directory = physicalPath(repoRoot, featureDirectory, "directory");
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active feature directory is not a physical repository directory.", PRD_REPAIR);
  }

  const listPrds = () => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .filter(({ name }) => PRD_NAME.test(name))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
      throw new Error("unsafe PRD entry");
    }
    return entries.map(({ name }) => name);
  };
  let prds;
  try {
    prds = listPrds();
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active feature directory cannot be inspected safely.", PRD_REPAIR);
  }

  if (prds.length !== 1) {
    return fail("PO-GATE-PRD-CARDINALITY", "The active feature directory must contain exactly one prd_*.md file.", PRD_REPAIR);
  }
  const onlyPlanPath = `${featureDirectory}/${prds[0]}`;
  if (onlyPlanPath !== active.planPath) {
    return fail("PO-GATE-PLAN-PATH-MISMATCH", "The sole active PRD does not equal activeFeature.planPath.", PRD_REPAIR);
  }

  let planBytes;
  try {
    planBytes = readPhysicalFile(repoRoot, active.planPath);
    if (JSON.stringify(listPrds()) !== JSON.stringify(prds)) {
      return fail("PO-GATE-PRD-CARDINALITY", "The active PRD set changed while authority was inspected.", PRD_REPAIR);
    }
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active PRD is not a physical regular repository file.", PRD_REPAIR);
  }
  let text;
  try {
    text = decodeUtf8(planBytes);
  } catch {
    return fail("PO-GATE-PRD-LANGUAGE-MISMATCH", "The active PRD is not canonical UTF-8 text.", ENCODING_REPAIR);
  }
  const markers = [...text.matchAll(PRD_LANGUAGE_MARKER)].map((match) => match[1]);
  if (markers.length !== 1 || markers[0] !== expectedLanguage) {
    return fail(
      "PO-GATE-PRD-LANGUAGE-MISMATCH",
      "The active PRD must declare the repository-scoped PO language exactly once.",
      LANGUAGE_REPAIR(expectedLanguage, active.documentLanguage != null),
    );
  }

  const specPath = `${featureDirectory}/spec.md`;
  let specBytes;
  try {
    specBytes = readPhysicalFile(repoRoot, specPath);
  } catch {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active PRD must bind the neighboring physical spec.md bytes exactly once.", SPEC_REPAIR);
  }
  const specSha256 = sha256(specBytes);
  const specMarkers = [...text.matchAll(TECHNICAL_SPEC_MARKER)].map((match) => match[1]);
  // Absent (zero) and duplicate (more than one) markers are the same defect
  // from the caller's point of view -- there is no single recorded digest to
  // compare -- and neither is a "the two documents disagree" defect, so both
  // get the missing-marker code and its own remedy rather than the mismatch
  // one below.
  if (specMarkers.length !== 1) {
    return fail("PO-GATE-PRD-SPEC-MARKER-MISSING", "The active PRD must carry the technical Spec marker exactly once.", SPEC_MARKER_MISSING_REPAIR);
  }
  if (specMarkers[0] !== specSha256) {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active PRD technical Spec marker must exactly match the neighboring spec.md bytes.", SPEC_REPAIR);
  }
  // Additive third precondition, checked only once the mechanical path/
  // cardinality check and the byte-exact Spec-digest binding above both
  // already hold: the PO's own explicit acknowledgement that this PRD's
  // content is sound and consistent with that same spec.md (backlog item
  // 2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md). Absent and
  // duplicate are the same defect for the same reason as the Spec marker
  // above -- there is no single acknowledgement to trust either way.
  // Enforcement is gated on requireAcknowledgement: this same function also
  // backs a purely read-only diagnostic path (check-po-gate-authority.mjs's
  // passive read, which never binds expectedPlanSha256/expectedSpecSha256)
  // that never carried this marker before and must not be forced to
  // retroactively. Only an ACTIVE approval/rebind validation -- the caller
  // passing at least one of those two expected digests -- requires it.
  if (requireAcknowledgement) {
    const acknowledgementMarkers = [...text.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)];
    if (acknowledgementMarkers.length !== 1) {
      return fail(
        "PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING",
        "The active PRD must carry the PO's plan acknowledgement marker exactly once.",
        ACKNOWLEDGEMENT_REPAIR,
      );
    }
  }
  return {
    ok: true,
    planSha256: sha256(planBytes),
    specPath,
    specSha256,
  };
}

/**
 * Validate the repository-scoped authority from caller-resolved Git topology.
 * Returned failures and evidence intentionally contain no absolute path.
 */
export function validatePoGateAuthority({
  repoRoot,
  gitCommonDir,
  primaryRoot,
  registeredWorktreeRoots,
  expectedPlanSha256 = undefined,
  expectedSpecSha256 = undefined,
}) {
  const profile = validatePoGateProfileSnapshot({ repoRoot, gitCommonDir, primaryRoot, registeredWorktreeRoots });
  if (!profile.ok) return profile;
  const { current, value: profileEvidence } = profile;

  let active;
  try {
    active = activeFeatureState(current);
  } catch {
    active = { status: "invalid" };
  }
  if (active.status === "invalid") {
    return fail("PO-GATE-ACTIVE-FEATURE-INVALID", "The active feature and planPath are missing or unsafe.", PRD_REPAIR);
  }
  if (active.status === "unavailable") {
    return fail("PO-GATE-STATE-AUTHORITY-UNAVAILABLE", "The authoritative State projection is unavailable or mixed.", PRD_REPAIR);
  }
  if (active.status === "absent") {
    if (expectedPlanSha256 !== undefined || expectedSpecSha256 !== undefined) {
      return fail("PO-GATE-PLAN-DIGEST-STALE", "The active PRD authority no longer exists.", SNAPSHOT_REPAIR);
    }
    return { ok: true, code: "PO-GATE-AUTHORITY-VALID", value: profileEvidence };
  }
  // A hosted project's document language stands in for the operator-facing one
  // only when set; unset (the {de, en}-marker or pre-GF-070 case) falls back to
  // today's exact behavior.
  const expectedDocumentLanguage = active.documentLanguage ?? profileEvidence.humanFacing;
  // Passed (not undefined) => ACTIVE approval/rebind validation => the PO
  // acknowledgement marker must fire. Not passed => passive diagnostic read
  // (e.g. check-po-gate-authority.mjs) => it must not.
  const requireAcknowledgement = expectedPlanSha256 !== undefined || expectedSpecSha256 !== undefined;
  const prd = prdAuthority(current, active, expectedDocumentLanguage, requireAcknowledgement);
  if (!prd.ok) return prd;
  if (expectedPlanSha256 !== undefined && (!SHA256.test(expectedPlanSha256) || expectedPlanSha256 !== prd.planSha256)) {
    return fail("PO-GATE-PLAN-DIGEST-STALE", "The active PRD changed after the authority snapshot was taken.", SNAPSHOT_REPAIR);
  }
  if (expectedSpecSha256 !== undefined && (!SHA256.test(expectedSpecSha256) || expectedSpecSha256 !== prd.specSha256)) {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active Spec changed after the authority snapshot was taken.", SNAPSHOT_REPAIR);
  }

  const evidence = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
    humanFacing: profileEvidence.humanFacing,
    sourceSha256: profileEvidence.sourceSha256,
    runtimeSha256: profileEvidence.runtimeSha256,
    receiptSha256: profileEvidence.receiptSha256,
    repositoryFingerprint: profileEvidence.repositoryFingerprint,
    planPath: active.planPath,
    planSha256: prd.planSha256,
    specPath: prd.specPath,
    specSha256: prd.specSha256,
  };
  return { ok: true, code: "PO-GATE-AUTHORITY-VALID", value: evidence };
}
