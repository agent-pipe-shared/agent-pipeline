#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * PO proof helper with a deliberately split responsibility boundary.
 *
 * `prepare` writes only public candidate-bound requests and is agent work.
 * `setup` and `approve` are intentionally for a terminal operated by the
 * approving human. `authorize-critical` is the single human-terminal command
 * for a critical action (push/deploy/publication/feature-package-reconcile/
 * release-preflight, ADR-0061 port PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL):
 * it prepares the request and signs that exact request in one invocation, so
 * a request left on disk by an earlier, possibly failed preparation can never
 * be the thing that gets signed. It changes nothing about where key material
 * lives or who is prompted for the passphrase; `prepare-critical`/
 * `approve-critical` stay available as the two-step form. The encrypted
 * private key stays outside the checkout and OpenSSL reads its passphrase
 * from that terminal. No password, passphrase, recovery code or private key
 * is accepted as an argument, environment value, stdin payload, repository
 * file, or pipeline state. `verify` is public readback and is agent work
 * again.
 */
import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix as posixPath, resolve, win32 as win32Path } from "node:path";
import { fileURLToPath } from "node:url";
import { isatty as nodeIsatty } from "node:tty";

import { approvalRequestFromExternalJson, observeCleanCandidate, run as runApprovalRequest } from "./po-approval-request.mjs";
import { decodeTypedLine } from "../lib/chat-gate-ceremony.mjs";
import { readPublicRepositoryFile, verifyThreatModelApprovalRequest } from "../lib/threat-model-approval-request.mjs";
import { criticalActionSubjectSha256, createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { describeGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { describeHumanGuardOverrideSelection } from "../lib/human-guard-override.mjs";
import { GOVERNANCE_FORK_DISPOSITION_APPROVAL, governanceForkDispositionApprovalSubject, inspectForkedGovernanceStream } from "../lib/governance-event-store.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { MACHINE_PLANE_SCHEMA, readMachinePlane, writeMachinePlane } from "../lib/machine-plane.mjs";
import { boundedCopySafeCommand } from "../lib/copy-safe-command.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";

// NVA-SIGENTRY-1: the same resolved-plugin-root derivation guard-human-override.mjs
// already uses (`resolve(dirname(fileURLToPath(import.meta.url)), "..")`) -- needed
// here only so `sign-intent` can call describeHumanGuardOverrideSelection(), which
// needs a `pluginRoot` to re-plan/re-prepare a candidate HGO request the same way the
// signature-mode ceremony itself does.
const SCRIPT = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(SCRIPT), "..");

const USAGE = "Usage: po-human-approval.mjs setup --repo-root <repo> --directory <external-dir> [--key-reference <id>] [--existing-key <path-to-an-already-existing-private-key-pem>] | prepare --repo-root <repo> --directory <external-dir> [--feature-id <id> --plan <repo-path> --spec <repo-path> --model <repo-path>] | prepare-all --repo-root <repo> --directory <external-dir> | approve --repo-root <repo> --directory <external-dir> [--feature-id <id>] | approve-all --repo-root <repo> --directory <external-dir> | verify --repo-root <repo> --directory <external-dir> [--feature-id <id>] | verify-all --repo-root <repo> --directory <external-dir> | prepare-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication|release-preflight|feature-package-reconcile> --subject-sha256 <sha256> [--subject <repo-path>] --expires-at <ISO-8601> | approve-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication|release-preflight|feature-package-reconcile> | verify-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication|release-preflight|feature-package-reconcile> | sign-intent --repo-root <repo> --directory <external-dir> (--intent-sha256 <sha256> | --request <repo-scratch-relative-path>) | authorize-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication|release-preflight|feature-package-reconcile> --subject-sha256 <sha256> [--subject <repo-path>] --expires-at <ISO-8601> | prepare-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> --expires-at <ISO-8601> | approve-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> | verify-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n>";
// This repo's own environment inputs are all named PIPELINE_<PURPOSE> (see
// PIPELINE_GUARD_OVERRIDE, PIPELINE_LIVE_CERTIFICATION_AUTHORITY,
// PIPELINE_SECURITY_REVIEWER_ID elsewhere in this plugin); PO_APPROVAL_DIRECTORY
// follows that convention rather than inventing a new one, and is read ONLY as a
// fallback when no explicit --directory is supplied on the command line.
const PO_APPROVAL_DIRECTORY_ENV = "PIPELINE_PO_APPROVAL_DIRECTORY";
// SETUP-2b/AC-13: a third source, ordered between --directory and the environment
// fallback (SETUP-2b/AC-11) -- the machine-scoped configuration plane's own
// poKeyDirectory field (specs/sprint-nova-epic/plans/nova-setup-bootstrap.md SS2/SS6a).
function directorySourceLabel(source) {
  if (source === "environment") return `the ${PO_APPROVAL_DIRECTORY_ENV} environment variable`;
  if (source === "machine-plane") return "the machine-scoped configuration plane (poKeyDirectory)";
  if (source === "repo-scope") return "this repository's own remembered PO key directory";
  return "--directory";
}
// GF-080 Gap A: the read side above (values.directory = plane.plane.poKeyDirectory) was
// wired in from day one, but nothing ever WROTE poKeyDirectory back into the plane -- so
// that fallback could never fire on a machine where nobody had hand-authored
// ~/.agent-pipeline/machine.json outside this tool entirely. `setup` is the one point a
// human/agent first establishes a directory on purpose; an explicit --directory there is
// persisted so a LATER command, on the same machine, in a DIFFERENT project, does not
// need to repeat it. This is best-effort and additive only: it never blocks or fails
// `setup` itself (a write failure here is swallowed, not surfaced), it does nothing for a
// plane- or environment-sourced directory (there is nothing new to persist in either
// case -- the value already came from a source that already has it), it never touches a
// plane that already fails its own validation (a corrupt plane is reported by AC-12 the
// next time something reads it, not silently repaired here), and it never overwrites a
// DIFFERENT already-valid poKeyDirectory a human previously chose without them knowing --
// only an absent/null value, or the identical one, is ever written.
// NVA-V1-KEYDIRPTR (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
// permanent-and-silent.md): the "already-valid poKeyDirectory" this function
// must never overwrite means a directory that still RESOLVES on disk, not
// merely a non-empty string. The predicate below narrows exactly that one
// branch (`poKeyDirectoryStillExists`); every other property documented
// above it -- best-effort, additive-only, never touches an invalid plane,
// never fires for a non-flag source -- is unchanged.
export function persistExplicitDirectoryIntoMachinePlane(args, directory, dependencies) {
  if (args.directorySource !== "flag") return;
  const readPlane = dependencies.readMachinePlaneFn ?? readMachinePlane;
  const writePlane = dependencies.writeMachinePlaneFn ?? writeMachinePlane;
  const plane = readPlane(dependencies);
  if (plane.status === "invalid") return;
  const current = plane.status === "valid" ? plane.plane : null;
  if (current?.poKeyDirectory === directory) return;
  if (current && text(current.poKeyDirectory) && poKeyDirectoryStillExists(current.poKeyDirectory, dependencies)) return;
  const next = current
    ? { ...current, poKeyDirectory: directory, updatedAt: new Date().toISOString() }
    : {
      schema: MACHINE_PLANE_SCHEMA,
      poKeyDirectory: directory,
      pushApprovalDefault: "signature",
      routing: null,
      language: null,
      session: null,
      usage: null,
      updatedAt: new Date().toISOString(),
    };
  try { writePlane(next, dependencies); } catch (error) {
    // best-effort: never fails setup itself -- but a silent swallow left an
    // operator with no way to notice a real writeMachinePlane() failure
    // short of independently inspecting the resulting state (backlog:
    // 2026-08-30-po-human-approval-setup-silently-swallows-writemachineplane-error.md).
    const writeStderr = dependencies.stderrWriteFn ?? ((text) => process.stderr.write(text));
    writeStderr(`PO-HUMAN-APPROVAL-WARN: failed to persist poKeyDirectory into the machine plane: ${error.message}\n`);
  }
}

/** Existence check only -- never opens or inspects anything INSIDE the
 * directory (mirrors machine-plane.mjs's own `validPoKeyDirectory`
 * discipline). A non-directory at the path, or any read error, is treated as
 * "does not resolve" -- the conservative direction for a predicate deciding
 * whether a recorded pointer is still worth protecting from replacement. */
function poKeyDirectoryStillExists(directory, dependencies) {
  const exists = dependencies.existsSyncFn ?? existsSync;
  try {
    if (!exists(directory)) return false;
    const stat = dependencies.statSyncFn ?? statSync;
    return stat(directory).isDirectory();
  } catch { return false; }
}

// PO-KEYDIR-01(A), 2026-08-11 PO decision (backlog/items/2026-08-10-po-key-directory-
// default-should-be-repo-scoped-not-machine-wide.md): `setup`'s own auto-persist call
// (runHumanApproval, below) now targets THIS repo-scoped store instead of the machine
// plane -- persistExplicitDirectoryIntoMachinePlane above is kept exactly as it was,
// simply no longer called from that one call site, purely so its own write primitive
// stays defined and its READ side (parseHumanArgs, below) keeps working as the
// third-tier fallback; nothing here removes or repurposes either. Same best-effort,
// additive-only, never-clobber-a-different-value discipline as its sibling above: a
// write failure here never fails `setup` itself, an already-identical value is a
// silent no-op, and a different already-valid stored value is never silently
// overwritten.
const REPO_KEY_DIRECTORY_SCHEMA = "pipeline.po-key-directory.v1";
function repoScopedKeyDirectoryPath(gitCommonDir) { return join(gitCommonDir, "agent-pipeline", "po-key-directory.json"); }

/**
 * Resolves this repository's Git common directory. Used both by the repo-scoped
 * store above (fix (A)) and by the filename fingerprint below (fix (B)) -- ONE
 * resolution primitive, not two competing ones. `dependencies.gitCommonDirFn
 * (repository)` is the injectable seam a test uses to supply a distinct fake
 * common dir per fixture repository; this is deliberately never routed through
 * `dependencies.spawn`, which existing tests already override to observe/refuse
 * the OpenSSL invocation inside signIntentIntoProof()/command() and must not
 * also start receiving `git` argv.
 *
 * lib/human-guard-override.mjs implements the equivalent `physicalRoot`/
 * `topology` pair, but it is a read-only reference for this script (never to be
 * modified) and exports neither in an importable form -- so this is an
 * intentional, narrow, local copy of the same pattern already duplicated a
 * second time in lib/guard-maintenance-window.mjs (see that file's own
 * "DUPLICATION NOTE"), not an oversight.
 *
 * Never throws; returns null whenever resolution is unavailable for any reason
 * (not a Git checkout, `git` missing, a hostile/symlinked control path). A null
 * result means different things to its two callers: fix (A)'s repo-scoped tier
 * simply does not resolve (falls through to the machine plane, exactly as if
 * this repository had never been set up); fix (B)'s fingerprint falls back to
 * the repository root itself, still a deterministic, repository-distinguishing
 * value on its own (see its call site in runHumanApproval).
 */
function resolveGitCommonDir(repository, dependencies) {
  if (typeof dependencies.gitCommonDirFn === "function") return dependencies.gitCommonDirFn(repository);
  let physical;
  try {
    physical = realpathSync(resolve(repository));
    const info = lstatSync(physical);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
  } catch { return null; }
  let result;
  try { result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: physical, encoding: "utf8", shell: false, timeout: 5000 }); }
  catch { return null; }
  if (result?.status !== 0 || result?.error) return null;
  const raw = String(result.stdout ?? "").trim();
  if (raw === "") return null;
  try {
    const common = realpathSync(isAbsolute(raw) ? raw : resolve(physical, raw));
    const info = lstatSync(common);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    return common;
  } catch { return null; }
}

/** Three-valued, never-throwing reader mirroring readMachinePlane()'s own
 * shape/discipline (status: "absent" | "invalid" | "valid"), scoped to exactly
 * one field instead of the machine plane's wider schema. */
function readRepoKeyDirectory(gitCommonDir, dependencies) {
  const path = repoScopedKeyDirectoryPath(gitCommonDir);
  const exists = dependencies.existsSyncFn ?? existsSync;
  if (!exists(path)) return { status: "absent", directory: null };
  const read = dependencies.readFileSyncFn ?? readFileSync;
  let raw;
  try { raw = read(path, "utf8"); } catch { return { status: "invalid", directory: null, code: "RKD-UNREADABLE" }; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { status: "invalid", directory: null, code: "RKD-MALFORMED" }; }
  if (!own(parsed, ["schema", "poKeyDirectory", "updatedAt"]) || parsed.schema !== REPO_KEY_DIRECTORY_SCHEMA
    || !text(parsed.poKeyDirectory) || !isAbsolute(parsed.poKeyDirectory) || !text(parsed.updatedAt)) {
    return { status: "invalid", directory: null, code: "RKD-SHAPE" };
  }
  return { status: "valid", directory: parsed.poKeyDirectory };
}

/** The directory is created owner-private (0700, mirroring lib/human-guard-
 * override.mjs's secureDirectory() convention this script cannot import -- see
 * resolveGitCommonDir's own doc comment) and the file itself owner-private
 * (0600), matching every other artifact this script writes. */
function writeRepoKeyDirectory(gitCommonDir, value, dependencies) {
  const dir = join(gitCommonDir, "agent-pipeline");
  const mkdir = dependencies.mkdirSyncFn ?? mkdirSync;
  mkdir(dir, { recursive: true, mode: 0o700 });
  const chmod = dependencies.chmodSyncFn ?? chmodSync;
  try { chmod(dir, 0o700); } catch { /* best-effort hardening only */ }
  const write = dependencies.writeFileSyncFn ?? writeFileSync;
  write(repoScopedKeyDirectoryPath(gitCommonDir), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function resolveRepoScopedDirectory(repoRoot, dependencies) {
  const gitCommonDir = resolveGitCommonDir(resolve(repoRoot), dependencies);
  if (gitCommonDir === null) return { status: "absent", directory: null };
  return (dependencies.readRepoKeyDirectoryFn ?? readRepoKeyDirectory)(gitCommonDir, dependencies);
}

function persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies) {
  if (args.directorySource !== "flag") return;
  if (gitCommonDir === null) return; // best-effort: no git-common-dir resolved, nothing to persist into
  const read = dependencies.readRepoKeyDirectoryFn ?? readRepoKeyDirectory;
  const write = dependencies.writeRepoKeyDirectoryFn ?? writeRepoKeyDirectory;
  const current = read(gitCommonDir, dependencies);
  if (current.status === "invalid") return; // never silently repair a corrupt store here (mirrors AC-12's discipline)
  if (current.status === "valid" && current.directory === directory) return;
  if (current.status === "valid" && text(current.directory)) return; // never overwrite a different already-valid value
  try {
    write(gitCommonDir, { schema: REPO_KEY_DIRECTORY_SCHEMA, poKeyDirectory: directory, updatedAt: new Date().toISOString() }, dependencies);
  } catch { /* best-effort: never fails setup itself */ }
}
// Recorded as non-enumerable: pre-existing exact-shape assertions elsewhere
// (lib/threat-model-approval-request.test.mjs) compare the whole parseHumanArgs()/
// parseGateArgs() return value with assert.deepStrictEqual, which considers only own
// enumerable properties. A plain `values.directorySource = ...` would fail every one of
// those unrelated, pre-existing checks; this keeps the value fully readable by this
// file's own code (args.directorySource) without joining the object's public shape.
function setDirectorySource(values, source) { Object.defineProperty(values, "directorySource", { value: source, enumerable: false, configurable: true }); }
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
/**
 * `trustPolicy`/`authority` specifically may also carry `humanName` — the
 * SETUP-1 human-readable label some operators' external `trust-policy.json`
 * already carries (mirrors `po-approval-proof.mjs`'s `ownTrustPolicy`). It is
 * never part of what is cryptographically checked here, so its presence must
 * not fail-close a genuinely valid trust policy; any OTHER unrecognised extra
 * key still must.
 */
const ownTrustPolicy = (value) => own(value, ["keyReference", "publicKeySha256"]) || own(value, ["keyReference", "publicKeySha256", "humanName"]);
const SHA = /^[a-f0-9]{64}$/u;
const text = (value) => typeof value === "string" && value.trim() !== "";

// NVA-WINPATH-1 (backlog/items/2026-08-17-po-human-approval-outside-check-uses-a-posix-only-
// separator-on-windows.md): mirrors guard-human-override.mjs's own externalJson() fix for the
// exact same defect class. node:path's default (host-platform) export makes relative() return
// backslash-separated paths on win32, so a POSIX-only `rel.startsWith("../")` check never
// matches a genuinely external same-drive path there, silently misclassifying it as "inside".
// `platform` is injected (default process.platform) so the win32 answer is provable from
// either host, exactly like the sibling fix's own test seam.
export function outside(repoRoot, path, platform = process.platform) {
  const api = platform === "win32" ? win32Path : posixPath;
  const root = api.resolve(repoRoot); const target = api.resolve(path);
  const raw = api.relative(root, target);
  // NVA-WINPATH-2 (Critic round-1 F1): the backslash-to-forward-slash normalization
  // below is a win32-only concern (path.relative() on win32 returns backslash-
  // separated output). On POSIX a backslash is an ORDINARY filename character, never
  // a path separator -- normalizing it unconditionally rewrote a legal POSIX name
  // like `..\keys` into `../keys`, which then misclassified a directory that is
  // actually INSIDE the repository as "outside": a fail-open regression in the exact
  // check that keeps private Ed25519 signing-key material out of the repository
  // working tree. Scoping the normalization to win32 keeps the same-drive fix intact
  // there while leaving POSIX relative-path strings untouched.
  const rel = platform === "win32" ? raw.split("\\").join("/") : raw;
  return rel === "" ? false : rel === ".." || rel.startsWith("../") || api.isAbsolute(rel);
}

/**
 * NVA-SWEEP-F2: `sign-intent --request` is deliberately scoped to this repository's
 * OWN `scratch/` tree, not "anywhere inside the repository" -- the one hand-off
 * location an agent session may write to directly (templates/prompts/agent-
 * obligations.md SS3: guard-devplan's exempt prefixes) and the PO's own unguarded
 * shell already reaches alongside the external `--directory`, with no guard-boundary
 * change. Returns the repo-relative path (posix-separated, always starting
 * `scratch/` or exactly `scratch`) on success, `null` on anything else -- outside the
 * repository, equal to the repository root itself, or inside the repository but
 * outside `scratch/`. Mirrors outside()'s own win32/posix relative-path handling
 * (same drive-letter/backslash care) rather than a second, naive comparison.
 */
function repoScratchRelativePath(repoRoot, path, platform = process.platform) {
  const api = platform === "win32" ? win32Path : posixPath;
  const root = api.resolve(repoRoot); const target = api.resolve(path);
  const raw = api.relative(root, target);
  const rel = platform === "win32" ? raw.split("\\").join("/") : raw;
  if (rel === "" || rel === ".." || rel.startsWith("../") || api.isAbsolute(rel)) return null;
  return rel === "scratch" || rel.startsWith("scratch/") ? rel : null;
}

/**
 * NVA-SWEEP-F2: derives the sibling proof/signer path next to a `--request` file by
 * substituting the FIRST occurrence of "request" in its basename (never its
 * directory, so a `scratch/reconcile-request/` directory segment is left alone) --
 * `scratch/reconcile-request-42.json` yields `scratch/reconcile-proof-42.json` for
 * `replacement === "proof"`. Returns `null` when the basename carries no such
 * literal (nothing to substitute), so the caller fails closed instead of silently
 * writing back to the request's own path.
 */
function scratchSiblingPath(requestPath, replacement) {
  const dir = dirname(requestPath); const base = basename(requestPath);
  if (!base.includes("request")) return null;
  return join(dir, base.replace("request", replacement));
}
function fail(message) { throw new Error(message); }
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function publicKeyPolicy(publicKey, keyReference) {
  createPublicKey(publicKey);
  return { keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
}
// SETUP-1: the human types their name ONCE, at key creation, rather than on every
// approval -- approvals happen every push/deploy while a key is created rarely, so
// re-prompting for a name that never changes would be repeated friction for no benefit.
// It becomes a field of the key's OWN local authority record (never the proof itself,
// whose exact 5-key shape is a contract shared by every verifier -- see signIntentIntoProof).
function localAuthority(publicKey, keyReference, humanName) {
  return { ...publicKeyPolicy(publicKey, keyReference), humanName };
}
// FIXTURE-2: shared by every branch of `setup` that is about to WRITE a brand-new
// authority record (no record exists yet, so there is nothing to read a name from) --
// the fresh-generation branch and the branch that recovers an authority for keys that
// already exist on disk without one. A branch that already has an authority record on
// disk reads its stored name instead; see runHumanApproval's "setup" handling.
const SETUP_NEW_AUTHORITY_NEEDS_NAME = 'setup requires --human-name "<the human this key\'s approvals will be attributed to>": no PO authority record exists yet to read a name from.';
function externalDirectory(repository, directory, { create = false, source = "--directory" } = {}) {
  // `source` names where this directory came from (--directory or the environment-variable
  // fallback) so a failure message can say which one was used. It is a fixed label, never the
  // resolved path itself: nothing here prints an absolute path into any string that could end up
  // in a committed artifact.
  if (!outside(repository, directory)) fail(`approval directory (from ${source}) must be outside the repository`);
  let canonicalRepository; let ancestor = directory; const missing = [];
  try { canonicalRepository = realpathSync(repository); }
  catch { fail("approval directory or repository is missing or unreadable"); }
  for (;;) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if (error?.code !== "ENOENT") fail(`approval directory (from ${source}) is unreadable`);
      const parent = dirname(ancestor); if (parent === ancestor) fail(`approval directory (from ${source}) is missing or unreadable`);
      missing.unshift(basename(ancestor)); ancestor = parent;
    }
  }
  let canonicalAncestor;
  try { canonicalAncestor = realpathSync(ancestor); }
  catch { fail(`approval directory (from ${source}) is missing or unreadable`); }
  if (!outside(canonicalRepository, canonicalAncestor)) fail(`approval directory (from ${source}) must be outside the repository`);
  const target = missing.reduce((path, segment) => join(path, segment), canonicalAncestor);
  if (create) mkdirSync(target, { recursive: true, mode: 0o700 });
  let canonicalDirectory;
  try { canonicalDirectory = realpathSync(target); }
  catch { fail(`approval directory (from ${source}) is missing or unreadable`); }
  if (!outside(canonicalRepository, canonicalDirectory)) fail(`approval directory (from ${source}) must be outside the repository`);
  if (!statSync(canonicalDirectory).isDirectory()) fail(`approval directory (from ${source}) must be a directory`);
  if (create) chmodSync(canonicalDirectory, 0o700);
  return canonicalDirectory;
}
// NVA-SWEEP-F2f-REWORK (Critic finding 1): the symlink/hardlink/non-regular-file guard
// every artifactPath() write target already got, factored out so the sign-intent
// scratch/ mirror targets (below) can apply the identical check immediately before each
// write rather than drifting from it. A path that does not exist yet is fine -- there is
// nothing there to reject; anything already present that is not an unlinked regular file
// fails closed via fail(message).
function assertUnlinkedRegularFileOrAbsent(path, message) {
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) fail(message);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
function artifactPath(directory, name) {
  const path = join(directory, name);
  assertUnlinkedRegularFileOrAbsent(path, "approval artifacts must be unlinked regular files outside the repository");
  return path;
}

/**
 * The three fork-disposition commands (ADR-0072). They are a sibling of the
 * `-critical` trio, not a fourth `--kind` for it: a fork disposition's subject
 * is DERIVED from the fork that actually exists, so the parameters that locate
 * that fork replace the ones `prepare-critical` accepts verbatim.
 */
const FORK_DISPOSITION_COMMANDS = new Set(["prepare-fork-disposition", "approve-fork-disposition", "verify-fork-disposition"]);

// NVA-CLI-FEEDBACK-1 (backlog/items/2026-08-09-critical-push-signing-
// ceremony-gives-no-path-feedback.md): the fixed set of recognised
// subcommands, named once and reused both for validation (below) and for the
// "did you mean" suggestion on an unrecognised one -- a single list, never
// two that could drift apart. Includes the fork-disposition trio (ADR-0072)
// so an unrecognised fork-disposition subcommand also gets a suggestion.
const KNOWN_COMMANDS = ["setup", "prepare", "prepare-all", "approve", "approve-all", "verify", "verify-all", "prepare-critical", "approve-critical", "verify-critical", "authorize-critical", "sign-intent", ...FORK_DISPOSITION_COMMANDS];

// NVA-CLI-FEEDBACK-1: standard O(len(a)*len(b)) Levenshtein edit distance
// (insert/delete/substitute, each cost 1) between two subcommand strings.
// Used only to power the unknown-subcommand suggestion below -- it never
// gates or widens what counts as a valid subcommand.
function levenshteinDistance(a, b) {
  const rows = a.length + 1; const cols = b.length + 1;
  const distances = Array.from({ length: rows }, (_, row) => {
    const line = new Array(cols).fill(0);
    line[0] = row;
    return line;
  });
  for (let col = 1; col < cols; col += 1) distances[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      distances[row][col] = Math.min(
        distances[row - 1][col] + 1,
        distances[row][col - 1] + 1,
        distances[row - 1][col - 1] + cost,
      );
    }
  }
  return distances[rows - 1][cols - 1];
}

// NVA-CLI-FEEDBACK-1: names the single closest known subcommand to an
// unrecognised one typed by an agent or human, so a plausible-but-wrong guess
// (e.g. "aprove-critical") gets a concrete "did you mean" hint instead of
// only the generic usage dump -- closing the gap the backlog item above
// documents ("a single guess costs the entire CLI-driven path rather than
// one retry"). Returns `null` for an empty/non-string input, or when even the
// closest candidate is farther than SUBCOMMAND_SUGGESTION_MAX_DISTANCE --
// a wild guess must never manufacture a misleading suggestion.
const SUBCOMMAND_SUGGESTION_MAX_DISTANCE = 4;
function suggestSubcommand(input, candidates) {
  if (typeof input !== "string" || input.length === 0) return null;
  let best = null; let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best !== null && bestDistance <= SUBCOMMAND_SUGGESTION_MAX_DISTANCE ? best : null;
}

/**
 * The `--kind` values `prepare-critical`/`approve-critical`/`verify-critical`
 * accept — deliberately a fixed literal list, spelled out here rather than
 * taken from `CRITICAL_ACTION_KINDS`.
 *
 * That import is what admitted `governance-fork-disposition` the moment the
 * family grew a fourth member (ADR-0072), and every branch behind it is wrong
 * for that kind: `prepare-critical` binds the git candidate and real repository
 * plan/spec bytes, none of which the disposition's verifier accepts, and it
 * writes the request to `request-critical-governance-fork-disposition.json` --
 * the very file `prepare-fork-disposition` owns, so the broken request silently
 * replaced a valid one. Refusing the kind at the parser closes that route, the
 * artifact-name collision and the direct `approve-critical` signing bypass with
 * a single check, at the exact point every other invalid `--kind` is refused.
 *
 * A literal, not a filter over the shared family: a fifth kind must be an
 * explicit decision here too, not an automatic membership.
 *
 * `"feature-package-reconcile"` was added 2026-08-18 (PHX-WP-POHUMAN-SIGNING-ERGO):
 * it is a first-class `CRITICAL_ACTION_KINDS` member with no security concern
 * analogous to `governance-fork-disposition`'s — it binds a real git candidate
 * and repository plan/spec bytes exactly like `push`/`deploy`/`publication` do,
 * so admitting it here closes the manual-copy workaround without reopening the
 * hole this comment describes.
 *
 * `"release-preflight"` (GF-105/ADR-0064 Decision 4) is the same: it binds a
 * real git candidate and repository plan/spec bytes, with its own additional
 * `--subject`-derived digest (see `resolveSubjectPreimage`) and its own
 * disclosure lines (see `releasePreflightConfirmationLines`) -- no
 * governance-fork-disposition-style verification bypass concern either.
 */
const CRITICAL_COMMAND_KINDS = Object.freeze(["push", "deploy", "publication", "feature-package-reconcile", "release-preflight"]);
const SEQUENCE = /^[1-9][0-9]{0,14}$/u;
const isoTimestamp = (value) => text(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseHumanArgs(argv, dependencies = {}) {
  const [command, ...tokens] = argv; const values = { command, keyReference: "local-po-key" }; const supplied = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index]; const value = tokens[index + 1];
    if (!key?.startsWith("--") || typeof value !== "string" || value.startsWith("--")) return { error: USAGE };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!new Set(["directory", "repoRoot", "keyReference", "humanName", "featureId", "plan", "spec", "model", "kind", "subject", "subjectSha256", "expiresAt", "intentSha256", "request", "repositoryFingerprint", "streamId", "sequence", "existingKey"]).has(normalized) || supplied.has(normalized)) return { error: USAGE };
    supplied.add(normalized); values[normalized] = value; index += 1;
  }
  // GF-104: keyReference always carries a default ("local-po-key") even when the
  // caller never passed --key-reference, so `setup`'s own mismatch check (below,
  // in po-human-approval.mjs) cannot tell "explicitly asked for this key-reference"
  // from "never mentioned it" by reading values.keyReference alone. Recorded
  // non-enumerable for the same reason as directorySource (FIXTURE-2 note above
  // setDirectorySource): pre-existing deepStrictEqual shape assertions elsewhere
  // must not see a new own-enumerable field on this object.
  Object.defineProperty(values, "keyReferenceSupplied", { value: supplied.has("keyReference"), enumerable: false, configurable: true });
  if (!new Set(KNOWN_COMMANDS).has(command)) {
    const suggestion = suggestSubcommand(command, KNOWN_COMMANDS);
    return { error: suggestion ? `${USAGE}\nUnknown subcommand "${command}". Did you mean "${suggestion}"?` : USAGE };
  }
  // PO-KEYDIR-01(A)/SETUP-2b/AC-11: precedence, in this exact order. An explicit
  // --directory always wins and is used exactly as before, never even consulting
  // any of the tiers below. Absent that, this repository's OWN remembered directory
  // (the repo-scoped store, below) -- absent that, the machine-scoped configuration
  // plane's own poKeyDirectory (SS2/SS6a of nova-setup-bootstrap.md); absent that in
  // turn, the PIPELINE_PO_APPROVAL_DIRECTORY environment variable, exactly as before
  // this task. Whichever route resolves a value, that value then runs through the
  // identical isAbsolute check below and, downstream, the identical
  // externalDirectory() safety checks (AC-14) -- there is no separate, weaker path
  // for a repo-scope-, plane- or environment-sourced value.
  if (supplied.has("directory")) {
    setDirectorySource(values, "flag");
  } else {
    // The repo-scoped tier needs values.repoRoot to compute a git-common-dir, but the
    // authoritative repoRoot validation stays exactly where it always was (below,
    // unchanged) -- this inline check only ever SKIPS the tier when repoRoot is not
    // yet a usable absolute path; it never duplicates or preempts that check's own
    // error text or shape.
    const repoScope = (text(values.repoRoot) && isAbsolute(values.repoRoot))
      ? resolveRepoScopedDirectory(values.repoRoot, dependencies)
      : { status: "absent", directory: null };
    // Mirrors AC-12's discipline one tier up: an invalid repo-scoped store is a
    // reported failure, never silently treated as absent -- it must NOT fall
    // through to the machine plane or environment as though nothing were there.
    if (repoScope.status === "invalid") {
      return { error: `this repository's own remembered PO key-directory store is invalid (${repoScope.code}): fix or remove it, or pass --directory explicitly.` };
    }
    if (repoScope.status === "valid" && text(repoScope.directory)) {
      values.directory = repoScope.directory;
      setDirectorySource(values, "repo-scope");
    } else {
      const plane = (dependencies.readMachinePlaneFn ?? readMachinePlane)(dependencies);
      // AC-12: an invalid or unreadable plane is a reported failure, never silently
      // treated as absent -- it must NOT fall through to the environment variable as
      // though nothing were there. An ABSENT plane (the ordinary case: a machine that
      // has not been set up yet) falls through normally and silently, exactly as before.
      if (plane.status === "invalid") {
        return { error: `machine-scoped configuration plane is invalid (${plane.code}): fix or remove ~/.agent-pipeline/machine.json, or pass --directory explicitly.` };
      }
      if (plane.status === "valid" && text(plane.plane?.poKeyDirectory)) {
        values.directory = plane.plane.poKeyDirectory;
        setDirectorySource(values, "machine-plane");
      } else {
        const fromEnv = process.env[PO_APPROVAL_DIRECTORY_ENV];
        if (text(fromEnv)) { values.directory = fromEnv; setDirectorySource(values, "environment"); }
      }
    }
  }
  if (!text(values.directory) || !isAbsolute(values.directory)) {
    return { error: `${USAGE}\napproval directory is required and must be an absolute path: pass --directory <path>, let this repository remember one (persisted automatically by 'setup --directory'), configure poKeyDirectory in the machine-scoped configuration plane, or set $${PO_APPROVAL_DIRECTORY_ENV} to an absolute path as a fallback (an explicit --directory always overrides this repository's own remembered value, which overrides the machine-scoped plane, which overrides the environment variable).` };
  }
  if (!text(values.repoRoot) || !isAbsolute(values.repoRoot)) {
    return { error: `${USAGE}\nrepository root is required and must be an absolute path: pass --repo-root <path> naming the repository this ceremony operates on (a relative path such as "." is not accepted).` };
  }
  // The fork-locating parameters exist only for the new commands; every
  // pre-existing command rejects them exactly as it rejected any unknown flag
  // before, so widening the accepted-key set above changes nothing for them.
  if (!FORK_DISPOSITION_COMMANDS.has(command) && (values.repositoryFingerprint || values.streamId || values.sequence)) return { error: USAGE };
  if (FORK_DISPOSITION_COMMANDS.has(command)) {
    // No `--subject-sha256` here, ever: accepting a bare digest is precisely
    // the self-minting route ADR-0072 closes. Nor plan/spec/feature paths --
    // GOVERNANCE_FORK_DISPOSITION_APPROVAL fixes all three.
    if (values.kind || values.subjectSha256 || values.featureId || values.plan || values.spec || values.model) return { error: USAGE };
    if (!SHA.test(values.repositoryFingerprint ?? "") || !text(values.streamId) || !SEQUENCE.test(values.sequence ?? "")) return { error: USAGE };
    if (command === "prepare-fork-disposition" ? !isoTimestamp(values.expiresAt) : values.expiresAt !== undefined) return { error: USAGE };
  }
  // FIXTURE-2: --human-name is validated where the authority directory's state is known
  // (inside the "setup" branch of runHumanApproval), never here. The parser cannot see
  // whether an authority record already exists on disk, and a `setup` that recovers or
  // re-reads an existing record must not be forced to repeat a name it already has.
  if (command.endsWith("-all") && (values.featureId || values.plan || values.spec || values.model)) return { error: USAGE };
  if (command.endsWith("-critical") && !CRITICAL_COMMAND_KINDS.includes(values.kind)) return { error: USAGE };
  // NVA-SWEEP-F2 (backlog/items/2026-08-16-gmw-reconcile-still-needs-a-manual-copy-after-
  // the-po-signs.md, Triage confirmation 2026-08-18, direction b): `--request` is an
  // ALTERNATIVE source for the digest, never a second one accepted alongside
  // `--intent-sha256` -- exactly one of the two must be supplied.
  // NVA-SWEEP-F2f-REWORK (Critic finding 3): mutual exclusion is decided on PRESENCE of
  // `--intent-sha256` (`hasIntentSha = text(...)`), never on whether it happens to be a
  // well-formed digest -- a malformed digest supplied TOGETHER with `--request` must be
  // rejected here as "both flags together", not silently treated as absent because
  // `SHA.test()` made it look that way. The pre-existing standalone-malformed-digest
  // rejection (no `--request` supplied) is preserved by the explicit format check right
  // below, which only runs once the presence-based mutual-exclusion check has already
  // passed (i.e. exactly one of the two was supplied).
  if (command === "sign-intent") {
    const hasIntentSha = text(values.intentSha256);
    const hasRequest = text(values.request);
    if (hasIntentSha === hasRequest) return { error: USAGE };
    if (hasIntentSha && !SHA.test(values.intentSha256)) return { error: USAGE };
  }
  return values;
}

function command(executable, args, dependencies) {
  const result = (dependencies.spawn ?? spawnSync)(executable, args, { stdio: "inherit", shell: false });
  if (result?.status !== 0) fail(`${executable} failed; the human terminal must complete the local prompt`);
}

/**
 * NVA-BL-74 (backlog/items/2026-08-07-human-authorization-prompts-ignore-the-
 * configured-language-profile.md): the token a human types is deliberately NOT
 * translated. It stays this one stable English constant in every language --
 * greppable, documentable (docs/po-human-approval.md), and impossible to drift
 * between prompt and documentation. A localised token would be a SECOND accepted
 * input on a signing gate for no security benefit; the localised prompt text
 * below therefore quotes this exact word verbatim rather than translating it.
 */
const CONFIRMATION_TOKEN = "approve";

/**
 * The FRAME of the confirmation prompt -- header, consequence sentence and typed-
 * token instruction -- per human-facing language. Only these three lines are
 * translated: the summary lines between them are caller-supplied DATA (digests,
 * candidate identifiers, and, for `sign-intent`, lines read verbatim out of a
 * recorded request by describeGuardMaintenanceWindowRequest), never prose this
 * function owns.
 *
 * This table's OWN keys are the recognised-language set. That is the point: a
 * value that is absent, unreadable, or simply has no entry here resolves to
 * `DEFAULT_HUMAN_FACING_LANGUAGE` through one branch, so a locale lookup can
 * never fail open into "no prompt at all". `de`/`en` are exactly the values the
 * continuity contract admits (lib/continuity-state.mjs HUMAN_FACING_LANGUAGES,
 * scripts/continuity-state.schema.json's runtime.humanFacingLanguage enum);
 * adding a language here is the only change a further translation needs.
 */
const DEFAULT_HUMAN_FACING_LANGUAGE = "en";
const CONFIRMATION_PROMPT_FRAME = Object.freeze({
  en: Object.freeze({
    header: "PO APPROVAL CONFIRMATION -- read before you enter your passphrase:",
    consequence: "This authorizes OpenSSL to sign the digest above with your private key; it cannot be undone once signed.",
    instruction: `Type exactly "${CONFIRMATION_TOKEN}" to continue; anything else cancels: `,
  }),
  de: Object.freeze({
    header: "PO-FREIGABE BESTÄTIGEN -- bitte lesen, bevor Sie Ihre Passphrase eingeben:",
    consequence: "Damit signiert OpenSSL den oben genannten Digest mit Ihrem privaten Schlüssel; einmal signiert, lässt sich das nicht mehr rückgängig machen.",
    instruction: `Tippen Sie exakt "${CONFIRMATION_TOKEN}" (genau dieses englische Wort) zum Fortfahren; jede andere Eingabe bricht ab: `,
  }),
});

/**
 * Resolve the human-facing language for the prompt above from the same value the
 * rest of the session uses: `continuity.runtime.humanFacingLanguage` in this
 * repository's project-state artifact, located through the shared authority
 * resolver (lib/project-authority.mjs) rather than a fourth hardcoded state path.
 *
 * Never throws and never returns a language the table above has no entry for: a
 * missing checkout, an absent/malformed/unreadable state file, a state file with
 * no continuity block, and an unrecognised value all yield English. The gate must
 * degrade to a fully-formed English prompt, never to a missing one.
 *
 * `dependencies.resolveHumanFacingLanguageFn` is the injectable seam. It is
 * deliberately its own named seam rather than a reuse of `dependencies.readFile`/
 * `readFileSyncFn`: those are already overridden by existing tests to serve PEM
 * and key-directory fixtures, and routing this read through them would silently
 * feed the resolver the wrong payload -- which, because every failure here falls
 * back to English, would look exactly like a passing test.
 */
function resolveHumanFacingLanguage(repository, dependencies = {}) {
  const known = (value) => (typeof value === "string" && Object.hasOwn(CONFIRMATION_PROMPT_FRAME, value) ? value : DEFAULT_HUMAN_FACING_LANGUAGE);
  if (typeof dependencies.resolveHumanFacingLanguageFn === "function") {
    try { return known(dependencies.resolveHumanFacingLanguageFn(repository)); }
    catch { return DEFAULT_HUMAN_FACING_LANGUAGE; }
  }
  try {
    const artifact = resolveAuthorityArtifactPath("state", { rootDir: repository });
    if (!artifact.exists) return DEFAULT_HUMAN_FACING_LANGUAGE;
    const state = JSON.parse(readFileSync(artifact.path, "utf8"));
    return known(state?.continuity?.runtime?.humanFacingLanguage);
  } catch { return DEFAULT_HUMAN_FACING_LANGUAGE; }
}

/**
 * Reads one line of plain-text confirmation from the real controlling
 * terminal. Synchronous by design: this file already blocks on `spawnSync`
 * for the OpenSSL passphrase prompt, and a human confirmation gate that must
 * complete before that prompt has to block the same way, not hand control to
 * an async callback the rest of this CLI does not have.
 */
function defaultReadConfirmation(prompt) {
  process.stdout.write(prompt);
  const buffer = Buffer.alloc(1); const bytes = [];
  for (;;) {
    let read;
    try { read = readSync(0, buffer, 0, 1, null); }
    catch (error) { if (error?.code === "EAGAIN") continue; if (error?.code === "EOF") break; throw error; }
    if (read === 0 || buffer[0] === 10) break;
    bytes.push(buffer[0]);
  }
  // Shared with `lib/chat-gate-ceremony.mjs`'s `readAttendedLine()`, imported
  // rather than repeated: the comment there records why a legacy Windows
  // console's non-UTF-8 bytes must still decode to what the human typed, and
  // two copies of that reasoning would drift.
  return decodeTypedLine(bytes);
}

/**
 * The deliberate, plain-language gate the PO requires before any passphrase
 * prompt: a human must read what is being authorized and its consequence,
 * then type the exact confirmation token. Anything else cancels, and the
 * caller must never reach the OpenSSL sign step or write any artifact.
 *
 * NVA-BL-74: `language` selects the prompt FRAME only (see
 * CONFIRMATION_PROMPT_FRAME). The acceptance test itself is untouched and stays
 * language-independent -- one comparison against one English constant, so no
 * language variant can widen, weaken or reorder what counts as consent. An
 * unknown or omitted `language` renders the English frame.
 */
/**
 * The disclosure half of the frame above (header, the caller-supplied summary
 * lines, the consequence sentence) shared by `requireExplicitConfirmation` and
 * `printDisclosureOnly` below -- factored out so the two can never drift apart:
 * both must show the human the identical "what is being signed" content, and
 * only the confirming variant appends the typed-token instruction on top.
 */
function composeDisclosureLines(summaryLines, language = DEFAULT_HUMAN_FACING_LANGUAGE) {
  const frame = CONFIRMATION_PROMPT_FRAME[language] ?? CONFIRMATION_PROMPT_FRAME[DEFAULT_HUMAN_FACING_LANGUAGE];
  return [frame.header, ...summaryLines.map((line) => `  ${line}`), frame.consequence];
}

function requireExplicitConfirmation(summaryLines, dependencies, language = DEFAULT_HUMAN_FACING_LANGUAGE) {
  const frame = CONFIRMATION_PROMPT_FRAME[language] ?? CONFIRMATION_PROMPT_FRAME[DEFAULT_HUMAN_FACING_LANGUAGE];
  const prompt = [...composeDisclosureLines(summaryLines, language), frame.instruction].join("\n");
  const read = dependencies.readConfirmation ?? defaultReadConfirmation;
  if (read(prompt) !== CONFIRMATION_TOKEN) fail("approval cancelled: explicit confirmation was not given");
}

/**
 * NVA-SIGNONCE-1: the disclosure alone, printed with no token read from stdin --
 * used only when the private key about to sign is passphrase-protected (see the
 * call site in the `sign-intent` branch), where entering that passphrase next at
 * the OpenSSL prompt is already the deliberate human act; a second typed token
 * first would only train the human to type past it without reading. Same frame,
 * same disclosure content as `requireExplicitConfirmation` (header, the
 * caller-supplied summary lines, the consequence sentence) via the shared
 * `composeDisclosureLines`; the one thing this omits is the instruction line
 * asking for a typed token, because nothing here is being typed.
 */
function printDisclosureOnly(summaryLines, language = DEFAULT_HUMAN_FACING_LANGUAGE) {
  process.stdout.write(`${composeDisclosureLines(summaryLines, language).join("\n")}\n`);
}

/**
 * NVA-SIGNONCE-1: whether the private key at `pemPath` needs a passphrase,
 * decided by reading the key's own PEM armor -- never a flag, a config value, an
 * environment variable, or a question to the human. `setup`'s only key-generation
 * path (`openssl genpkey -algorithm ED25519 -aes-256-cbc`, this file's `setup`
 * branch) always emits PKCS#8 "ENCRYPTED PRIVATE KEY" armor for a
 * passphrase-protected key and plain "PRIVATE KEY" armor otherwise; no other PEM
 * shape reaches this command. A key that cannot be read returns `false`, which
 * routes the caller to the stricter, confirmation-required path -- unreadable
 * key material never widens what gets skipped.
 */
function isPrivateKeyPassphraseProtected(pemPath, dependencies) {
  const read = dependencies.readFile ?? readFileSync;
  let pem;
  try { pem = read(pemPath, "utf8"); } catch { return false; }
  return pem.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----");
}

/**
 * Names the flag that made a critical request unacceptable instead of only
 * stating that it is, and normalizes `--expires-at` rather than rejecting a
 * perfectly valid timestamp that just is not already in one exact byte shape
 * (GF-080 Gap B). The action object this builds is validated downstream by
 * `actionValid()`/`iso()` in critical-action-approval-request.mjs, which
 * requires the exact `Date#toISOString()` round trip before it will compute
 * a digest at all -- so *some* canonical string is genuinely required before
 * the digest is bound, but the human should never need to know or produce
 * that exact shape by hand. A real operator round trip was lost to exactly
 * this: an `--expires-at` of `2026-08-07T12:00:00Z` parses fine, is obviously
 * an ISO-8601 timestamp, and was still rejected outright because it was not
 * already the exact round-trip form. The fix normalizes any timestamp
 * `Date.parse` accepts into that canonical form and rewrites `args.expiresAt`
 * in place *before* it is used anywhere downstream (the request written to
 * disk, and the digest computed from it) -- so a caller reading
 * `args.expiresAt` after this function returns `null` always sees the
 * canonical value, never the human's original spelling.
 */
function criticalRequestFieldError(args) {
  if (!text(args.plan)) return "critical approval request is invalid: --plan is required and must be a repository-relative path";
  if (!text(args.spec)) return "critical approval request is invalid: --spec is required and must be a repository-relative path";
  // ADR-0064 Decision 4: with --subject supplied, resolveSubjectPreimage() (below) has
  // already derived args.subjectSha256 from it before this runs, so the general shape
  // check is unconditional here -- only WHERE the digest came from differs by caller.
  if (!SHA.test(args.subjectSha256 ?? "")) return "critical approval request is invalid: --subject-sha256 must be exactly 64 lowercase hexadecimal characters, or supply --subject <repo-relative-path> to derive it";
  if (!text(args.expiresAt)) return "critical approval request is invalid: --expires-at is required";
  const expiresAtMs = Date.parse(args.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return `critical approval request is invalid: --expires-at is not a parsable timestamp: ${JSON.stringify(args.expiresAt)}`;
  args.expiresAt = new Date(expiresAtMs).toISOString();
  return null;
}

/**
 * ADR-0064 Decision 4: the one additive, kind-agnostic input. When --subject is
 * supplied, its bytes -- read through the same `readPublicRepositoryFile` primitive
 * --plan/--spec already use -- are the JSON preimage `criticalActionSubjectSha256` is
 * computed over. The digest is REBUILT from that preimage and the observed candidate,
 * never trusted from a caller-supplied --subject-sha256: a --subject-sha256 supplied
 * alongside --subject must agree with the rebuilt digest or the request is refused.
 * Kind-agnostic because `criticalActionSubjectSha256` itself is: this never inspects
 * the preimage's own shape, so it works unchanged for `push`/`deploy`/`publication`
 * subjects too, not only for `release-preflight`.
 *
 * Mutates `args.subjectSha256` in place, mirroring `criticalRequestFieldError`'s own
 * existing `--expires-at` normalization -- so every downstream reader of `args` sees
 * the one derived value, never the caller's omitted one.
 */
function resolveSubjectPreimage({ args, repository, candidate }) {
  if (!text(args.subject)) return null;
  let bytes;
  try { bytes = readPublicRepositoryFile(repository, args.subject); }
  catch { fail("critical approval request is invalid: --subject could not be read as a repository-relative file"); }
  let preimage;
  try { preimage = JSON.parse(bytes.toString("utf8")); }
  catch { fail("critical approval request is invalid: --subject must be valid JSON"); }
  let computed;
  try { computed = criticalActionSubjectSha256({ kind: args.kind, candidate, subject: preimage }); }
  catch { fail("critical approval request is invalid: --subject could not be hashed for this --kind"); }
  if (text(args.subjectSha256) && args.subjectSha256 !== computed) {
    fail(`critical approval request is invalid: --subject-sha256 does not match the digest computed from --subject (expected ${computed})`);
  }
  args.subjectSha256 = computed;
  return preimage;
}

/**
 * The one construction of a critical request, shared by the agent-facing
 * `prepare-critical` and the human-facing `authorize-critical`. Deliberately a
 * single call site of `createCriticalActionApprovalRequest`: a second way of
 * building the intent digest would be a second definition of the binding, and
 * it would agree right up until the moment it did not.
 *
 * Returns `subjectPreimage` alongside `request` (null unless --subject was supplied)
 * so a caller that wants to *show* the human what they are approving -- only
 * `authorize-critical` does -- has it, without re-reading or re-parsing the file.
 */
function criticalApprovalRequest({ args, repository, featureId, dependencies }) {
  const candidate = (dependencies.observeCandidate ?? observeCleanCandidate)(repository);
  const subjectPreimage = resolveSubjectPreimage({ args, repository, candidate });
  const invalid = criticalRequestFieldError(args);
  if (invalid) fail(invalid);
  const request = createCriticalActionApprovalRequest({
    candidate,
    featureId,
    planBytes: readPublicRepositoryFile(repository, args.plan),
    specBytes: readPublicRepositoryFile(repository, args.spec),
    action: { kind: args.kind, subjectSha256: args.subjectSha256, expiresAt: args.expiresAt },
  });
  return { request, subjectPreimage };
}

/**
 * ADR-0061 Decision 4 requires the command's own output to state what is being
 * approved; a bare digest is adequate for `push` only because
 * `docs/push-release-flow.md:103-110` documents that shape out of band (ADR-0064
 * Decision 4). For `release-preflight` it is not, so this decodes the subject
 * preimage (when --subject supplied one) and always states the kind-specific scope
 * -- true of the KIND itself, not of any one preimage, so it is shown even when no
 * preimage was supplied (a bare --subject-sha256 invocation still needs to hear it).
 */
function releasePreflightConfirmationLines(kind, subjectPreimage) {
  if (kind !== "release-preflight") return [];
  const decoded = subjectPreimage !== null && typeof subjectPreimage === "object" && !Array.isArray(subjectPreimage)
    ? [
      `release version: ${subjectPreimage.version}`,
      `base commit: ${subjectPreimage.base?.commit}`,
      `lifecycle feature id: ${subjectPreimage.lifecycle?.featureId}`,
      `lifecycle manifest path: ${subjectPreimage.lifecycle?.manifestPath}`,
      `lifecycle manifest sha256: ${subjectPreimage.lifecycle?.manifestSha256}`,
      `retention policy sha256: ${subjectPreimage.retentionPolicySha256}`,
    ]
    : [];
  return [
    ...decoded,
    "this consents that a release attempt for the candidate above may be prepared and taken to the independently operated final gates; it is not a release, not a publication authorization, and not a pass of any of those gates.",
  ];
}

/**
 * GF-105: the human's one `authorize-critical` command for a push
 * (`references/push-approval.md`, "The human's one command (current shape)")
 * had NO code-level construction at all before this -- that reference stated
 * plainly "The agent constructs the command ... and hands it over", meaning
 * every occurrence of this command was hand-formatted prose. That is exactly
 * the class of bug GF-094 already found and fixed for the unrelated
 * host-boundary retry route in codex-pretool-guard.mjs (Codex's own
 * re-quoting and line-wrapping of a multi-word, non-ASCII value corrupting a
 * human's real terminal) -- and it is if anything MORE consequential here: a
 * signing ceremony, not a kickoff retry.
 *
 * This is a caller of `boundedCopySafeCommand()` (lib/copy-safe-command.mjs,
 * NVA-W12-COPYSAFE), never a re-implementation of it: that shared renderer
 * already turns an `{ executable, argv }` pair into the exact, correctly-quoted
 * shell line (the same `shellWord()` quoting used for every other onboarding
 * action this plugin renders, already proven to single-quote a value
 * containing spaces or non-ASCII characters correctly) AND the bounded,
 * multi-platform (posix/powershell/cmd) copy rendering, in one call -- the
 * bounded-chunking algorithm keeps its one definition in
 * project-onboarding-v3.mjs; this function never duplicates it.
 *
 * `--kind` is always `"push"`: this helper is specific to the push-approval
 * ceremony (`references/push-approval.md`'s worked example), not a general
 * `authorize-critical` renderer for `deploy`/`publication`.
 *
 * `launcher` defaults to this script's OWN resolved absolute path
 * (`fileURLToPath(import.meta.url)`) so a caller can never relay a wrong or
 * stale script location -- the one part of this command a hand-formatting
 * caller could get wrong that has nothing to do with the ceremony's actual
 * parameters. Every other value is relayed exactly as given: this function
 * renders, it does not re-validate (`criticalRequestFieldError` and the
 * `featureId`/`kind` checks in `runHumanApproval` above already own that).
 */
export function authorizeCriticalPushCommand({
  repoRoot, directory, featureId, plan, spec, subjectSha256, expiresAt,
  launcher = fileURLToPath(import.meta.url),
} = {}) {
  for (const [name, value] of Object.entries({ launcher, repoRoot, directory, featureId, plan, spec, subjectSha256, expiresAt })) {
    if (typeof value !== "string" || value.length === 0) throw new TypeError(`authorizeCriticalPushCommand requires a non-empty ${name}`);
  }
  const argv = [
    launcher, "authorize-critical",
    "--repo-root", repoRoot,
    "--directory", directory,
    "--feature-id", featureId,
    "--plan", plan,
    "--spec", spec,
    "--kind", "push",
    "--subject-sha256", subjectSha256,
    "--expires-at", expiresAt,
  ];
  return boundedCopySafeCommand({ executable: "node", argv });
}

/**
 * NVA-W5-TTYSIGN (backlog/items/2026-08-29-signing-fails-without-a-tty-and-the-
 * error-reads-as-a-wrong-passphrase.md): OpenSSL needs a controlling terminal to
 * run its own interactive prompt during signing. Without one it fails with noise
 * that a human reads as a rejected key rather than as "no terminal was attached" --
 * a real ceremony failure observed live.
 *
 * NVA-CF-MINORPUSH-RETRY: `process.stdin.isTTY` answers a DIFFERENT question --
 * whether THIS process's stdin descriptor is a terminal -- and is `false` for a
 * redirected/piped stdin even while a real controlling terminal is attached and
 * usable. OpenSSL's own interactive prompt does not read this process's stdin at
 * all; it opens the controlling terminal directly (`/dev/tty` on POSIX), so that
 * is the condition this function has to probe. `dependencies.isTTY` remains the
 * injectable seam for tests (a boolean or a zero-arg function) and, when supplied,
 * is honoured exactly as before -- unchanged for every existing caller. With
 * neither supplied, this opens the controlling terminal itself
 * (`dependencies.openControllingTty`, default: `openSync("/dev/tty", "r+")` on
 * POSIX, `openSync("\\\\.\\CONIN$", "r+")` on native Windows -- backlog:
 * 2026-08-30-signing-ceremony-tty-check-has-no-windows-fallback.md;
 * `dependencies.platform` overrides `process.platform` for tests) and asks
 * `dependencies.isatty` (default: `node:tty`'s `isatty`) whether the
 * resulting descriptor is a real terminal, closing it again immediately either
 * way. Failing to open it (ENXIO/ENOENT/ENODEV -- no controlling terminal at
 * all, e.g. a daemon, CI runner, or fully detached session) means false, not a
 * thrown error.
 */
function controllingTtyPath(dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  return platform === "win32" ? "\\\\.\\CONIN$" : "/dev/tty";
}
function isAttendedTerminal(dependencies = {}) {
  if (typeof dependencies.isTTY === "function") return Boolean(dependencies.isTTY());
  if (typeof dependencies.isTTY === "boolean") return dependencies.isTTY;
  const openControllingTty = dependencies.openControllingTty ?? (() => openSync(controllingTtyPath(dependencies), "r+"));
  const checkIsatty = dependencies.isatty ?? nodeIsatty;
  let fd = null;
  try {
    fd = openControllingTty();
    return Boolean(checkIsatty(fd));
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already gone; nothing left to release */ }
    }
  }
}

/**
 * The single signing step: hand the digest to the external OpenSSL prompt and
 * record the resulting detached proof. No signer of this program's own, no key
 * material read into this process, and the temporary intent/signature files are
 * removed on every path.
 */
function signIntentIntoProof({ intentSha256, keys, artifacts, io, dependencies }) {
  // pipeline.signing-requires-attended-terminal: fail closed BEFORE ever writing the
  // intent file or spawning OpenSSL when the key about to sign will make OpenSSL run
  // its own interactive prompt (NVA-SIGNONCE-1: exactly the passphrase-protected
  // case) and this process has no controlling terminal to run that prompt on. An
  // unprotected key never prompts, so it never needed a terminal and this check
  // stays byte-for-byte inert for it -- unaffected, not merely unlikely to fire.
  // Deliberately silent on what OpenSSL would have prompted for -- the point of this
  // check is that the human never sees OpenSSL's own noise, which is what reads as a
  // rejected key on a correct entry.
  if (isPrivateKeyPassphraseProtected(keys.privateKey, dependencies) && !isAttendedTerminal(dependencies)) {
    fail(
      "sign-intent needs an attended terminal to complete: this process could not open a controlling " +
      `terminal (${controllingTtyPath(dependencies)}) for OpenSSL's own interactive prompt to run on ` +
      "(pipeline.signing-requires-attended-terminal). Run the identical command in a terminal window " +
      "you can type into directly.",
    );
  }
  io.write(artifacts.intent, intentSha256, { mode: 0o600 });
  try { command("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", keys.privateKey, "-in", artifacts.intent, "-out", artifacts.signature], dependencies); }
  finally { rmSync(artifacts.intent, { force: true }); }
  try {
    const authority = json(keys.authority); const publicKey = io.read(keys.publicKey, "utf8");
    // NVA-SIGDISCLOSE-1 Finding 3/4: two different questions, two different messages
    // (mirrors the FIXTURE-2 split runHumanApproval's own "setup" branch already
    // performs, below) -- is this the right key (identity: accept BOTH the pre-humanName
    // legacy shape and the named shape, so a merely-missing humanName can never masquerade
    // as a key mismatch), and separately, does this record simply predate --human-name
    // (fixable by `setup --human-name`, not a key problem at all -- see GF-112).
    const legacyShape = own(authority, ["keyReference", "publicKeySha256"]);
    const namedShape = own(authority, ["keyReference", "publicKeySha256", "humanName"]);
    if ((!legacyShape && !namedShape) || !text(authority.keyReference)
      || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) {
      fail("external trust policy does not match the local public key");
    }
    if (!namedShape || !text(authority.humanName)) {
      fail('local PO authority record predates --human-name and has no name recorded; run setup again with --human-name "<the human this key\'s approvals will be attributed to>" to add one.');
    }
    const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: authority.keyReference, publicKey, signatureBase64: Buffer.from(io.read(artifacts.signature)).toString("base64") };
    io.write(artifacts.proof, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    // SETUP-1: recorded on EVERY approval, independent of whether the project's trust
    // policy restricts which key may sign -- "not restricted" must never become "not
    // recorded". This is public data, same as `proof`, and shares its artifact lifecycle.
    const signer = {
      schema: "pipeline.po-approval-signer.v1", intentSha256,
      keyReference: authority.keyReference, publicKeySha256: authority.publicKeySha256, humanName: authority.humanName,
    };
    io.write(artifacts.signer, `${JSON.stringify(signer, null, 2)}\n`, { mode: 0o600 });
    return { proof, signer };
  } finally { rmSync(artifacts.signature, { force: true }); }
}

export function runHumanApproval(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseHumanArgs(argv, dependencies); if (args.error) fail(args.error);
  // Fail closed rather than fall through: the fork-disposition commands need an
  // async fork inspection this synchronous entry point cannot perform, and they
  // were rejected here (as unknown commands) before they existed.
  if (FORK_DISPOSITION_COMMANDS.has(args.command)) fail("fork-disposition commands run through runForkDispositionApproval");
  return executeHumanApproval(args, dependencies);
}

/**
 * Everything the command above does once its argv is parsed and accepted.
 *
 * Split out, and deliberately NOT exported, for exactly one reason:
 * `runForkDispositionApproval` must still reach the single existing signing
 * branch, and it can no longer do so by synthesizing the argv `approve-critical
 * --kind governance-fork-disposition` — `parseHumanArgs` now refuses that, and
 * must keep refusing it for every argv an operator can type. The alternatives
 * were a second OpenSSL/confirmation path (two definitions of the ceremony) or
 * an exported opt-out on the parser (the escape route again, one argument
 * away). This split adds neither: every caller outside this module still enters
 * through `runHumanApproval` and its parser.
 */
function executeHumanApproval(args, dependencies = {}) {
  if (args.command.endsWith("-all")) {
    const action = args.command.slice(0, -4);
    const results = ["cyb-4", "cyb-5"].map((featureId) => runHumanApproval([
      action,
      "--repo-root", args.repoRoot,
      "--directory", args.directory,
      "--feature-id", featureId,
    ], dependencies));
    const candidates = results.map((result) => result.candidate ?? result.value?.candidate).filter(Boolean);
    if (candidates.some((candidate) => candidate.commit !== candidates[0]?.commit || candidate.tree !== candidates[0]?.tree)) {
      fail("all PO approval artifacts must bind the same candidate");
    }
    return {
      ok: true,
      code: `PO-HUMAN-${action.toUpperCase()}-ALL-READY`,
      candidate: candidates[0] ?? null,
      results,
    };
  }
  const repository = resolve(args.repoRoot);
  // NVA-BL-74: resolved once, before any branch, and passed to every
  // requireExplicitConfirmation() call below -- a read-only, never-throwing lookup
  // (English on any failure), so it cannot change which error a command reports or
  // in what order.
  const humanFacingLanguage = resolveHumanFacingLanguage(repository, dependencies);
  // PO-KEYDIR-01: resolved once and reused by both fixes below -- fix (A)'s setup
  // auto-persist target and fix (B)'s filename fingerprint segment.
  const gitCommonDir = resolveGitCommonDir(repository, dependencies);
  const directory = externalDirectory(repository, resolve(args.directory), {
    create: args.command === "setup" || args.command === "prepare" || args.command === "prepare-critical" || args.command === "authorize-critical",
    source: directorySourceLabel(args.directorySource),
  });
  const critical = args.command.endsWith("-critical");
  if (critical && (args.command === "prepare-critical" || args.command === "authorize-critical") && !text(args.featureId)) fail("critical approval requires a feature id");
  const featureId = args.featureId ?? "cyb-4";
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(featureId)) fail("feature id is invalid");
  const featureSuffix = critical ? `-critical-${args.kind}` : (featureId === "cyb-4" ? "" : `-${featureId}`);
  // PO-KEYDIR-01(B) (backlog/items/2026-08-11-shared-external-po-signing-directory-
  // lets-an-unrelated-project-overwrite-a-proof.md): every per-transaction artifact
  // filename below carries this repository-fingerprint segment as an ADDITION to the
  // suffix shape above, never a replacement of it -- two different repositories
  // sharing one external directory can no longer collide. Reuses
  // derivePoGateRepositoryFingerprint() exactly as it already exists
  // (lib/po-gate-authority.mjs), never a second fingerprint scheme; only its first 12
  // hex characters are used -- the full 64-char digest would make every filename
  // unwieldy for no added disambiguation value here.
  const repositoryFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: gitCommonDir ?? repository, primaryRoot: repository }).slice(0, 12);
  const suffix = `-${repositoryFingerprint}${featureSuffix}`;
  const paths = {
    request: artifactPath(directory, `request${suffix}.json`),
    privateKey: artifactPath(directory, "po-private.pem"),
    publicKey: artifactPath(directory, "po-public.pem"),
    authority: artifactPath(directory, "trust-policy.json"),
    proof: artifactPath(directory, `proof${suffix}.json`),
    signature: artifactPath(directory, `signature${suffix}.bin`),
    intent: artifactPath(directory, `intent${suffix}.txt`),
    // SETUP-1: a companion record of WHO signed -- kept separate from `proof` itself,
    // whose exact shape (PO_APPROVAL_PROOF_SCHEMA) is a contract shared by every verifier
    // (threat-model, HGO, GMW, critical-action); adding a field there would make every
    // proof this command produces unverifiable everywhere else.
    signer: artifactPath(directory, `signer${suffix}.json`),
  };
  const write = dependencies.writeFile ?? writeFileSync; const read = dependencies.readFile ?? readFileSync; const exists = dependencies.exists ?? existsSync;
  if (args.command === "setup") {
    const present = { privateKey: exists(paths.privateKey), publicKey: exists(paths.publicKey), authority: exists(paths.authority) };
    // NVA-CF-KEYBOOTSTRAP (backlog: pipeline.onboarding-has-no-happy-path-for-an-
    // existing-signing-key.md): a third setup route alongside "generate a brand-new
    // key" (below) and "reuse/recover key material already sitting at this exact
    // --directory" (present.privateKey/publicKey above) -- register an
    // ALREADY-EXISTING key file that lives somewhere else entirely (not yet known to
    // this machine's --directory at all) as this machine's trust anchor, in one call,
    // with no separate manual repair step. Checked FIRST, before any of the
    // present-material branches below, and refuses outright the moment ANY key
    // material already sits at this --directory: --existing-key imports into a
    // BRAND-NEW directory only, exactly like fresh generation just below it never
    // overwrites partial material either.
    if (text(args.existingKey)) {
      if (present.privateKey || present.publicKey || present.authority) {
        fail("--existing-key only registers a key into a directory that has none yet; this --directory already carries key material -- pass a fresh --directory, or omit --existing-key to reuse/recover what is already here.");
      }
      if (!exists(args.existingKey)) {
        fail(`--existing-key path does not exist: ${args.existingKey}`);
      }
      if (!text(args.humanName)) fail(SETUP_NEW_AUTHORITY_NEEDS_NAME);
      // Copy the private key bytes verbatim into the machine-plane directory (same
      // final location fresh generation writes to) rather than leaving the original
      // path as the source of truth -- every other command in this file (sign-intent,
      // authorize-critical, ...) reads the key from `paths.privateKey` unconditionally,
      // so a key that stayed only at its original path would silently stop working the
      // moment that path moved or was cleaned up.
      const importedKeyBytes = read(args.existingKey);
      write(paths.privateKey, importedKeyBytes, { mode: 0o600 });
      // Derive (and thereby VALIDATE -- an unparsable or corrupt key fails this
      // command() call, exactly like every other openssl step in this file) the public
      // key from the copy just written, mirroring the fresh-generation branch's own
      // genpkey+pkey pair below.
      command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies);
      const authority = localAuthority(read(paths.publicKey, "utf8"), args.keyReference, args.humanName);
      write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 });
      persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies);
      return {
        ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, imported: true,
        paths: { privateKey: paths.privateKey, publicKey: paths.publicKey, authority: paths.authority },
      };
    }
    if (present.privateKey && present.publicKey && !present.authority) {
      // No authority record exists yet -- there is nothing to read a name from, so this
      // is exactly the same requirement fresh generation has below (FIXTURE-2).
      if (!text(args.humanName)) fail(SETUP_NEW_AUTHORITY_NEEDS_NAME);
      const authority = localAuthority(read(paths.publicKey, "utf8"), args.keyReference, args.humanName);
      write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 });
      persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies);
      // NVA-CLI-FEEDBACK-1: state where the key material and authority record
      // actually live -- an operator/agent that needs to hand a generated file
      // to another process must not have to already know the fixed path
      // convention (backlog/items/2026-08-09-critical-push-signing-ceremony-
      // gives-no-path-feedback.md).
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: true, paths: { privateKey: paths.privateKey, publicKey: paths.publicKey, authority: paths.authority } };
    }
    if (present.privateKey && present.publicKey && present.authority) {
      const authority = json(paths.authority); const publicKey = read(paths.publicKey, "utf8");
      // Two different questions, two different messages (FIXTURE-2): is this the right
      // key (identity -- checked against BOTH the pre-humanName and the named shape), and
      // separately, does this record simply predate --human-name (fixable by re-running
      // setup, not a mismatch).
      const legacyShape = own(authority, ["keyReference", "publicKeySha256"]);
      const namedShape = own(authority, ["keyReference", "publicKeySha256", "humanName"]);
      if ((!legacyShape && !namedShape) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) {
        fail("existing trust policy does not match the local public key");
      }
      if (!namedShape || !text(authority.humanName)) {
        if (!text(args.humanName)) {
          fail('existing PO authority record predates --human-name and has no name recorded; run setup again with --human-name "<the human this key\'s approvals will be attributed to>" to add one.');
        }
        if (args.keyReferenceSupplied && args.keyReference !== authority.keyReference) {
          fail("a PO authority record already exists under a different name/key-reference than supplied; changing an established identity is not something setup does silently -- rerun without --human-name/--key-reference to keep the existing record, or remove the existing authority files first if a deliberate rebind is intended.");
        }
        const upgraded = localAuthority(publicKey, authority.keyReference, args.humanName);
        write(paths.authority, `${JSON.stringify(upgraded, null, 2)}\n`, { mode: 0o600 });
        persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies);
        // NVA-CLI-FEEDBACK-1: see the recovery branch above for rationale.
        return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority: upgraded, recovered: true, paths: { privateKey: paths.privateKey, publicKey: paths.publicKey, authority: paths.authority } };
      }
      // GF-104: a named record already exists. Explicit --human-name/--key-reference
      // values that differ from it are a deliberate identity change this command does
      // not make silently -- fail loudly instead of quietly keeping the old values and
      // reporting the unqualified success this used to return. Values the caller never
      // supplied (including keyReference's own default) are never compared: an
      // unqualified `setup` re-run against an existing record stays idempotent, exactly
      // as before.
      const humanNameMismatch = text(args.humanName) && args.humanName !== authority.humanName;
      const keyReferenceMismatch = args.keyReferenceSupplied && args.keyReference !== authority.keyReference;
      if (humanNameMismatch || keyReferenceMismatch) {
        fail("a PO authority record already exists under a different name/key-reference than supplied; changing an established identity is not something setup does silently -- rerun without --human-name/--key-reference to keep the existing record, or remove the existing authority files first if a deliberate rebind is intended.");
      }
      persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies);
      // NVA-CLI-FEEDBACK-1: idempotent re-run -- nothing new was written this call,
      // but the operator/agent still needs to know where the existing key material
      // and authority record live, so the paths are reported here too.
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: false, paths: { privateKey: paths.privateKey, publicKey: paths.publicKey, authority: paths.authority } };
    }
    if (present.privateKey || present.publicKey || present.authority) fail("partial PO authority exists; refusing to overwrite it");
    if (!text(args.humanName)) fail(SETUP_NEW_AUTHORITY_NEEDS_NAME);
    command("openssl", ["genpkey", "-algorithm", "ED25519", "-aes-256-cbc", "-out", paths.privateKey], dependencies);
    command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies);
    const authority = localAuthority(read(paths.publicKey, "utf8"), args.keyReference, args.humanName); write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 }); chmodSync(paths.privateKey, 0o600);
    // Privacy-hygiene nudge (H-AC-11 O-4): fires only on this fresh-key-creation
    // branch and only when the operator chose a non-default --key-reference; the
    // GMW/human-ledger design cannot fully decouple this key reference from the
    // portable record, so a value that uniquely identifies the operator as a
    // natural person is a real, proven privacy concern here. Advisory only; it
    // never blocks, fails, or alters the returned result object.
    if (args.keyReference !== "local-po-key") {
      process.stdout.write(`NOTE: --key-reference "${args.keyReference}" may uniquely identify you as a natural person; consider a less individually-attributable value (H-AC-11 O-4).\n`);
    }
    persistExplicitDirectoryIntoRepoScope(args, directory, gitCommonDir, dependencies);
    return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, paths: { privateKey: paths.privateKey, publicKey: paths.publicKey, authority: paths.authority } };
  }
  if (args.command === "authorize-critical") {
    // Fail closed on missing key material before anything is written or observed:
    // there is no point preparing a request this terminal could not sign.
    if (!exists(paths.privateKey) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup before authorize-critical");
    const { request, subjectPreimage } = criticalApprovalRequest({ args, repository, featureId, dependencies });
    // Written before the prompt, and only ever the request built above: any file
    // already sitting at this path is overwritten, never read, so a stale request
    // has no path to a signature.
    write(paths.request, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    const intentSha256 = request.approvalIntent.sha256;
    requireExplicitConfirmation([
      `action kind: ${request.action.kind}`,
      `candidate commit: ${request.candidate.commit}`,
      `candidate tree: ${request.candidate.tree}`,
      `action subject sha256: ${request.action.subjectSha256} (the exact destination/subject this approval is bound to)`,
      `action expires at: ${request.action.expiresAt}`,
      `feature id: ${featureId}`,
      `approval intent sha256: ${intentSha256}`,
      ...releasePreflightConfirmationLines(request.action.kind, subjectPreimage),
      "this approval does NOT cover: any other commit or tree than the candidate above, any other subject digest, any action attempted after the expiry above, and any action of a different kind -- each of those needs its own approval.",
    ], dependencies, humanFacingLanguage);
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: { intent: paths.intent, signature: paths.signature, proof: paths.proof, signer: paths.signer }, io: { write, read }, dependencies });
    // NVA-CLI-FEEDBACK-1: state the paths this call just wrote (request/proof/
    // signer survive; intent/signature are removed by signIntentIntoProof).
    return { ok: true, code: "PO-HUMAN-CRITICAL-AUTHORIZATION-READY", candidate: request.candidate, action: request.action, intentSha256, signer: signed.signer, paths: { request: paths.request, proof: paths.proof, signer: paths.signer } };
  }
  if (args.command === "prepare" || args.command === "prepare-critical") {
    if (critical) {
      const { request } = criticalApprovalRequest({ args, repository, featureId, dependencies });
      write(paths.request, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
      // NVA-CLI-FEEDBACK-1: state the path this call just wrote.
      return { ok: true, code: "PO-HUMAN-CRITICAL-REQUEST-READY", candidate: request.candidate, intentSha256: request.approvalIntent.sha256, action: request.action, paths: { request: paths.request } };
    }
    const result = runApprovalRequest(["prepare", "--repo-root", repository, "--feature-id", featureId, "--plan", args.plan ?? "specs/2026-07-24-sprint-cyborg-epic/prd_cyborg-epic.md", "--spec", args.spec ?? "specs/2026-07-24-sprint-cyborg-epic/spec.md", "--model", args.model ?? `specs/${featureId}/threat-model.json`]);
    write(paths.request, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    // NVA-CLI-FEEDBACK-1: state the path this call just wrote.
    return { ok: true, code: "PO-HUMAN-REQUEST-READY", candidate: result.value.candidate, intentSha256: result.value.approvalIntent.sha256, paths: { request: paths.request } };
  }
  if (args.command === "sign-intent") {
    if (!exists(paths.privateKey) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup before sign-intent");
    // NVA-SWEEP-F2 (backlog/items/2026-08-16-gmw-reconcile-still-needs-a-manual-copy-
    // after-the-po-signs.md, Triage confirmation 2026-08-18, direction b): `--request`
    // reads the digest directly out of a JSON file the PO already has local filesystem
    // access to -- this repository's own `scratch/` tree -- instead of requiring the
    // agent to relay a bare `--intent-sha256` string another way. `parseHumanArgs`
    // already guarantees exactly one of `--intent-sha256`/`--request` was supplied.
    // Everything below (disclosure, confirmation, signing) is unchanged and driven by
    // the SAME `intentSha256` local either way -- `--request` only changes where that
    // value comes from and, further below, adds a second write target for the result.
    let scratchProofPath = null; let scratchSignerPath = null;
    if (text(args.request)) {
      const requestPath = resolve(repository, args.request);
      // NVA-SWEEP-F2f-REWORK (Critic finding 1): canonicalize both the repository root
      // and the request path with realpathSync BEFORE computing repoScratchRelativePath,
      // mirroring externalDirectory()'s own pattern -- so a symlink planted AT the
      // --request path itself, pointing outside scratch/, is caught by the scratch-
      // membership check below instead of silently followed. A request path that does
      // not exist yet cannot be canonicalized; that is the ordinary "not written yet"
      // case, not a security failure, so it falls through to the pre-existing "--request
      // could not be read" message rather than a raw exception.
      let canonicalRepository; let canonicalRequestPath;
      try { canonicalRepository = realpathSync(repository); } catch { fail("--request could not be read"); }
      try { canonicalRequestPath = realpathSync(requestPath); } catch { fail("--request could not be read"); }
      const scratchRel = repoScratchRelativePath(canonicalRepository, canonicalRequestPath);
      if (scratchRel === null) fail("--request must be a path inside this repository's own scratch/ directory");
      let raw;
      try { raw = read(canonicalRequestPath, "utf8"); } catch { fail("--request could not be read"); }
      let record;
      try { record = JSON.parse(raw); } catch { fail("--request must contain valid JSON"); }
      if (!SHA.test(record?.intentSha256 ?? "")) fail("--request JSON must carry an intentSha256 field (64 lowercase hexadecimal characters)");
      args.intentSha256 = record.intentSha256;
      scratchProofPath = scratchSiblingPath(canonicalRequestPath, "proof");
      scratchSignerPath = scratchSiblingPath(canonicalRequestPath, "signer");
      if (scratchProofPath === null || scratchSignerPath === null) {
        fail('--request file name must contain "request" so sibling proof/signer paths can be derived (e.g. reconcile-request-<id>.json)');
      }
    }
    const intentSha256 = args.intentSha256;
    // The human is not asked to authorize a bare digest (ADR-0061 Decision 4): the
    // request recorded behind it is resolved and its own recorded reason, scope and
    // expiry are shown. Everything displayed is READ from that record and bounded by
    // it (see describeGuardMaintenanceWindowRequest); nothing here composes a guess
    // about what the action "probably" is. When no record resolves — a digest prepared
    // by another mechanism, in another repository, or a record that no longer
    // re-derives to this digest — the command says exactly that and shows nothing else.
    // The signature covers the digest either way; the summary is disclosure, never
    // authority.
    //
    // NVA-SIGENTRY-1: GMW is tried first -- the pre-existing, cheaper, common-case
    // resolver -- and an HGO signature-mode selection is tried only when GMW itself
    // does not resolve, closing the same blind-signature gap for the HGO ceremony
    // specifically (backlog/items/2026-08-08-the-signing-ceremony-is-designed-for-the-
    // verifier-not-the-signer.md finding 7). Both resolvers share the identical
    // never-fabricate contract, so trying a second one after the first fails closed
    // only WIDENS what can be disclosed, never what gets signed; when both fail closed
    // the honest fallback below is unchanged.
    const describeGmw = dependencies.describeIntentRecord ?? describeGuardMaintenanceWindowRequest;
    const describeHgo = dependencies.describeHgoIntentRecord ?? describeHumanGuardOverrideSelection;
    let record = describeGmw({ rootDir: repository, intentSha256 });
    if (!record.resolved) {
      record = describeHgo({ rootDir: repository, pluginRoot: PLUGIN_ROOT, intentSha256, scriptPath: SCRIPT });
    }
    const disclosureLines = [
      `intent sha256: ${intentSha256}`,
      ...(record.resolved ? record.lines : [
        `no recorded request resolves for this digest in this repository (${record.code}): this command has no description of that action and will not invent one.`,
        "it signs a one-time, audited guard-lift/guard-override (HGO/GMW) authorization for whatever was recorded against this exact digest elsewhere.",
      ]),
      "this approval covers exactly this digest: a different scope, expiry, reason or candidate is a different digest and needs its own approval.",
    ];
    // NVA-SIGNONCE-1: one human decision, not two. When the private key about to
    // sign is passphrase-protected, entering that passphrase at the OpenSSL
    // prompt below IS the deliberate human act, so the typed confirmation this
    // command otherwise requires is skipped -- but the disclosure itself (what is
    // being signed, and the recorded reason/scope/expiry when known) is composed
    // and printed either way, unconditionally, before OpenSSL ever runs. For a
    // key with no passphrase this stays byte-for-byte what it was before: the
    // confirmation remains the only human gate in that case, and removing it too
    // would leave none.
    if (isPrivateKeyPassphraseProtected(paths.privateKey, dependencies)) {
      printDisclosureOnly(disclosureLines, humanFacingLanguage);
    } else {
      requireExplicitConfirmation(disclosureLines, dependencies, humanFacingLanguage);
    }
    const manual = {
      intent: artifactPath(directory, "intent-manual.txt"),
      signature: artifactPath(directory, "signature-manual.bin"),
      proof: artifactPath(directory, "proof-manual.json"),
      signer: artifactPath(directory, "signer-manual.json"),
    };
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: manual, io: { write, read }, dependencies });
    // NVA-SWEEP-F2: this is the "write the proof" half -- the durable proof written to
    // the external `--directory` above is UNCHANGED (still the artifact every other
    // verifier reads), and this is an ADDITIONAL mirror into the same repo-root
    // scratch/ location `--request` was read from, so the requesting agent session
    // finds the proof waiting in its OWN root on its next turn with no PO-run `cp`
    // step in between.
    if (scratchProofPath !== null) {
      // NVA-SWEEP-F2f-REWORK (Critic finding 1): the same symlink/hardlink/regular-file
      // hardening artifactPath() applies to every OTHER write target of this command,
      // applied here immediately before each scratch/ mirror write -- refuses rather than
      // following a symlink or overwriting a hardlinked file planted at either derived path.
      assertUnlinkedRegularFileOrAbsent(scratchProofPath, "scratch mirror artifacts must be unlinked regular files inside this repository's own scratch/ directory");
      write(scratchProofPath, `${JSON.stringify(signed.proof, null, 2)}\n`, { mode: 0o600 });
      assertUnlinkedRegularFileOrAbsent(scratchSignerPath, "scratch mirror artifacts must be unlinked regular files inside this repository's own scratch/ directory");
      write(scratchSignerPath, `${JSON.stringify(signed.signer, null, 2)}\n`, { mode: 0o600 });
    }
    // NVA-CLI-FEEDBACK-1: state the paths this call just wrote -- the external
    // manual proof/signer (durable, read by every verifier) and, when --request
    // was used, the additional repo-scratch mirror. The pre-existing top-level
    // scratchProofPath/scratchSignerPath fields are kept unchanged for callers
    // that already read them; `paths` is purely additive.
    return {
      ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256, signer: signed.signer,
      paths: {
        proof: manual.proof,
        signer: manual.signer,
        ...(scratchProofPath !== null ? { scratchProofPath, scratchSignerPath } : {}),
      },
      ...(scratchProofPath !== null ? { scratchProofPath, scratchSignerPath } : {}),
    };
  }
  if (!exists(paths.request) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup and prepare before approving");
  const request = approvalRequestFromExternalJson(json(paths.request));
  const intentSha256 = request?.approvalIntent?.sha256;
  if (!SHA.test(intentSha256 ?? "")) fail("request has no valid approval intent");
  if (args.command === "approve" || args.command === "approve-critical") {
    if (!exists(paths.privateKey)) fail("private key is unavailable");
    const kind = critical ? request?.action?.kind : request?.approvalIntent?.value?.kind;
    const summary = [`kind: ${kind}`, `intent sha256: ${intentSha256}`, `candidate commit: ${request?.candidate?.commit}`];
    if (critical) {
      summary.push(`action subject sha256: ${request?.action?.subjectSha256}`);
      summary.push(`action expires at: ${request?.action?.expiresAt}`);
    }
    requireExplicitConfirmation(summary, dependencies, humanFacingLanguage);
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: { intent: paths.intent, signature: paths.signature, proof: paths.proof, signer: paths.signer }, io: { write, read }, dependencies });
    // NVA-CLI-FEEDBACK-1: state the paths this call just wrote (proof/signer
    // survive; intent/signature are removed by signIntentIntoProof).
    return { ok: true, code: "PO-HUMAN-PROOF-READY", intentSha256, signer: signed.signer, paths: { proof: paths.proof, signer: paths.signer } };
  }
  if (!exists(paths.proof)) fail("run approve before verify");
  const candidate = (dependencies.observeCandidate ?? observeCleanCandidate)(repository);
  if (request?.candidate?.commit !== candidate.commit || request?.candidate?.tree !== candidate.tree) fail("proof request is not bound to the current clean candidate");
  // The shared trustPolicy contract (verifyPoApprovalProof et al.) checks an EXACT
  // {keyReference, publicKeySha256} shape; the LOCAL authority record additionally
  // carries `humanName` (SETUP-1). Only the two key-identity fields travel into
  // verification -- the same split signIntentIntoProof already keeps between the local
  // authority record and the shared proof/trustPolicy contract.
  const localAuthorityRecord = json(paths.authority);
  const trustPolicy = { keyReference: localAuthorityRecord.keyReference, publicKeySha256: localAuthorityRecord.publicKeySha256 };
  const verified = critical
    ? verifyCriticalActionApprovalRequest({ request, trustPolicy, proof: json(paths.proof), expectedCandidate: candidate, expectedAction: request.action })
    : verifyThreatModelApprovalRequest({ request, trustPolicy, proof: json(paths.proof) });
  return { ok: true, value: verified };
}

/**
 * The subject of a fork disposition, rebuilt from the fork that ACTUALLY
 * exists right now — never from anything the operator typed. The only caller
 * inputs are the three coordinates that locate the fork; the conflicting
 * entries' content digests, the derived candidate and the signed digest all
 * come from `inspectForkedGovernanceStream` and
 * `governanceForkDispositionApprovalSubject`, i.e. from the exact two exports
 * the store itself uses at verification time. Recomputing either here would be
 * a second definition of the binding, which is the duplication class this
 * neighbourhood has already paid for once.
 */
async function forkDispositionSubject(args, repository, sequence) {
  const inspection = await inspectForkedGovernanceStream({
    repositoryRoot: repository,
    repositoryFingerprint: args.repositoryFingerprint,
    streamId: args.streamId,
  });
  const fork = inspection.forks.find((entry) => entry.sequence === sequence);
  if (!fork) fail(`stream ${args.streamId} has no forked position at sequence ${sequence}`);
  const subject = governanceForkDispositionApprovalSubject({
    repositoryFingerprint: inspection.repositoryFingerprint,
    streamId: args.streamId,
    sequence,
    forkedEventDigests: fork.entries.map((entry) => entry.eventDigest),
  });
  return { ...subject, acknowledgedEventIds: fork.entries.map((entry) => entry.eventId) };
}

/**
 * The fork-disposition half of the ceremony (ADR-0072), split from
 * `runHumanApproval` because inspecting the fork is asynchronous and because
 * nothing about the `push`/`deploy`/`publication` branches may change to
 * accommodate it.
 *
 * `prepare-fork-disposition` is agent work and writes only public bytes;
 * `approve-fork-disposition` re-checks the prepared request against the fork
 * as it stands NOW and then hands the signing itself to the untouched
 * `approve-critical` branch, so there is exactly one OpenSSL/confirmation path
 * in this file; `verify-fork-disposition` is public readback that predicts the
 * store's own decision by rebuilding the subject the same way and verifying
 * against the SAME anchor the store will use — the repository's declared
 * `project/critical-human-proof.json` trustAnchor, never the external
 * directory's `trust-policy.json`, which is the signer's own claim about its
 * own key.
 */
export async function runForkDispositionApproval(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseHumanArgs(argv, dependencies); if (args.error) fail(args.error);
  if (!FORK_DISPOSITION_COMMANDS.has(args.command)) fail(USAGE);
  const repository = resolve(args.repoRoot);
  const directory = externalDirectory(repository, resolve(args.directory), { create: args.command === "prepare-fork-disposition" });
  // PO-KEYDIR-01(B): every per-transaction artifact filename this command writes must
  // carry the same repository-fingerprint segment executeHumanApproval() computes for
  // the SAME repoRoot/directory/kind -- approve-fork-disposition delegates signing into
  // that shared function (below), which independently derives this exact fingerprint
  // for the paths it looks up; a mismatch here means prepare/verify write and read one
  // filename while approve looks for another, silently reporting "run setup and prepare
  // before approving" even though prepare just ran.
  const gitCommonDir = resolveGitCommonDir(repository, dependencies);
  const repositoryFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: gitCommonDir ?? repository, primaryRoot: repository }).slice(0, 12);
  const suffix = `-${repositoryFingerprint}-critical-${GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind}`;
  const paths = {
    request: artifactPath(directory, `request${suffix}.json`),
    authority: artifactPath(directory, "trust-policy.json"),
    proof: artifactPath(directory, `proof${suffix}.json`),
  };
  const write = dependencies.writeFile ?? writeFileSync; const exists = dependencies.exists ?? existsSync;
  const sequence = Number(args.sequence);
  const subject = await forkDispositionSubject(args, repository, sequence);
  if (args.command === "prepare-fork-disposition") {
    const request = createCriticalActionApprovalRequest({
      candidate: subject.candidate,
      featureId: GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId,
      // The fixed LABEL bytes, never a repository file: a disposition is a
      // store-level governance act with no sprint plan/spec of its own, and the
      // signer must be able to rebuild these offline with no repository I/O.
      planBytes: Buffer.from(GOVERNANCE_FORK_DISPOSITION_APPROVAL.planLabel, "utf8"),
      specBytes: Buffer.from(GOVERNANCE_FORK_DISPOSITION_APPROVAL.specLabel, "utf8"),
      action: { kind: GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind, subjectSha256: subject.subjectSha256, expiresAt: args.expiresAt },
    });
    write(paths.request, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    return {
      ok: true,
      code: "PO-HUMAN-FORK-DISPOSITION-REQUEST-READY",
      candidate: request.candidate,
      subjectSha256: subject.subjectSha256,
      intentSha256: request.approvalIntent.sha256,
      action: request.action,
      forkedEventDigests: [...subject.subject.forkedEventDigests],
      acknowledgedEventIds: [...subject.acknowledgedEventIds],
    };
  }
  if (!exists(paths.request)) fail("run prepare-fork-disposition first");
  const request = json(paths.request);
  if (request?.action?.kind !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind || request?.action?.subjectSha256 !== subject.subjectSha256) {
    fail("the prepared request does not bind the conflicting entries that exist at this sequence now; prepare it again");
  }
  // F2 fix (Critic round 3): pin the same three authority fields
  // `verify-fork-disposition` checks further below, but HERE, before
  // `approve-fork-disposition` delegates into a real OpenSSL signing
  // operation. Without this, a prepared request with correct
  // `action.kind`/`action.subjectSha256` but a tampered `approvalIntent.value`
  // field would still reach signing -- wasting a real signature on a request
  // that the store's own write-time check (`authorizeForkDisposition`) would
  // later refuse to persist anyway, since it pins these same fields.
  {
    const pinnedIntent = request?.approvalIntent?.value;
    if (pinnedIntent?.featureId !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId
      || pinnedIntent?.planSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.planSha256
      || pinnedIntent?.specSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.specSha256) {
      fail("the prepared request was not issued for the fork-disposition authority");
    }
  }
  if (args.command === "approve-fork-disposition") {
    // Deliberately the EXISTING critical signing branch, unchanged: same
    // confirmation gate, same OpenSSL invocation, same artifact names, same
    // proof shape. Entered with the parsed form of the `approve-critical`
    // invocation this used to spell as argv, because that argv is now correctly
    // refused: `--kind governance-fork-disposition` on the `-critical` trio was
    // itself an escape route (an unverifiable request written over this
    // command's own artifact). The values below are the ones that argv produced.
    return executeHumanApproval({
      command: "approve-critical",
      keyReference: args.keyReference,
      repoRoot: args.repoRoot,
      directory: args.directory,
      kind: GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind,
    }, dependencies);
  }
  if (!exists(paths.authority) || !exists(paths.proof)) fail("run approve-fork-disposition before verifying");
  const policy = readCriticalHumanProofPolicy(repository);
  if (!policy.ok) fail("project/critical-human-proof.json declares no usable trustAnchor, so the store can verify no external approval");
  // RW1-TRUSTANCHOR: this used to read the legacy SINGULAR `policy.trustAnchor` field
  // only, which is permanently `null` once `critical-human-proof.json` carries the v3
  // `trustAnchors` SET (critical-human-proof-policy.mjs) -- every v3 policy made this
  // command fail closed regardless of what it actually declares. Mirrors the resolution
  // `guard-maintenance-window.mjs` (NVA-GMWFIX-1/2) established for this exact class of
  // ceremony: a NON-EMPTY v3 set wins; an absent OR EMPTY v3 set falls through to the
  // legacy singular field; and, unlike the general "any well-formed key may sign"
  // default posture `trustAnchorsFor`/push/deploy/release-preflight use for an absent
  // set, fork-disposition deliberately does NOT adopt that posture here -- "the
  // fork-disposition commands refuse every self-minting shortcut"
  // (po-human-approval.test.mjs) requires an undeclared key to stay unverifiable, since
  // this ceremony resolves conflicting governance-ledger content and must never become
  // self-serviceable by an agent holding no PO key at all. `governance-event-store.mjs`'s
  // `authorizeForkDisposition` -- the store's own write-time check this command predicts
  // (see this function's doc comment) -- carries the identical fix for the identical
  // reason.
  const anchors = Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0
    ? policy.trustAnchors
    : (policy.trustAnchor !== null ? [policy.trustAnchor] : []);
  if (anchors.length === 0) fail("project/critical-human-proof.json declares no usable trustAnchor, so the store can verify no external approval");
  const intent = request?.approvalIntent?.value;
  if (intent?.featureId !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId
    || intent?.planSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.planSha256
    || intent?.specSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.specSha256) {
    fail("the prepared request was not issued for the fork-disposition authority");
  }
  const proof = json(paths.proof);
  let verified;
  for (const trustPolicy of anchors) {
    verified = verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate: subject.candidate, expectedAction: request.action });
    if (verified.verified || verified.code !== "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED") break;
  }
  if (!verified.verified) fail(`the fork disposition approval does not verify (${verified.code}${verified.cause ? `; ${verified.cause}` : ""})`);
  return {
    ok: true,
    code: "PO-HUMAN-FORK-DISPOSITION-VERIFIED",
    value: verified,
    subjectSha256: subject.subjectSha256,
    acknowledgedEventIds: [...subject.acknowledgedEventIds],
    approval: { mode: "signature", request, proof },
  };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    const result = FORK_DISPOSITION_COMMANDS.has(argv[0]) ? await runForkDispositionApproval(argv) : runHumanApproval(argv);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`PO-HUMAN-APPROVAL-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
