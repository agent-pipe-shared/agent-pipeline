#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * PO proof helper with a deliberately split responsibility boundary.
 *
 * `prepare` writes only public candidate-bound requests and is agent work.
 * `setup` and `approve` are intentionally for a terminal operated by the
 * approving human. `authorize-critical` is the single human-terminal command
 * for a critical action: it prepares the request and signs that exact request
 * in one invocation, so a request left on disk by an earlier, possibly failed
 * preparation can never be the thing that gets signed. It changes nothing
 * about where key material lives or who is prompted for the passphrase.
 * The encrypted private key stays outside the checkout and
 * OpenSSL reads its passphrase from that terminal. No password, passphrase,
 * recovery code or private key is accepted as an argument, environment value,
 * stdin payload, repository file, or pipeline state. `verify` is public
 * readback and is agent work again.
 */
import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { approvalRequestFromExternalJson, observeCleanCandidate, run as runApprovalRequest } from "./po-approval-request.mjs";
import { readPublicRepositoryFile, verifyThreatModelApprovalRequest } from "../lib/threat-model-approval-request.mjs";
import { CRITICAL_ACTION_KINDS, createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { describeGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { MACHINE_PLANE_SCHEMA, readMachinePlane, writeMachinePlane } from "../lib/machine-plane.mjs";
import { boundedOpaqueCopyCommand, renderProjectOnboardingAction } from "../lib/project-onboarding-v3.mjs";

const USAGE = "Usage: po-human-approval.mjs setup --repo-root <repo> --directory <external-dir> [--key-reference <id>] | prepare --repo-root <repo> --directory <external-dir> [--feature-id <id> --plan <repo-path> --spec <repo-path> --model <repo-path>] | prepare-all --repo-root <repo> --directory <external-dir> | approve --repo-root <repo> --directory <external-dir> [--feature-id <id>] | approve-all --repo-root <repo> --directory <external-dir> | verify --repo-root <repo> --directory <external-dir> [--feature-id <id>] | verify-all --repo-root <repo> --directory <external-dir> | prepare-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication> --subject-sha256 <sha256> --expires-at <ISO-8601> | approve-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication> | verify-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication> | sign-intent --repo-root <repo> --directory <external-dir> --intent-sha256 <sha256> | authorize-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication> --subject-sha256 <sha256> --expires-at <ISO-8601>";
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
function persistExplicitDirectoryIntoMachinePlane(args, directory, dependencies) {
  if (args.directorySource !== "flag") return;
  const readPlane = dependencies.readMachinePlaneFn ?? readMachinePlane;
  const writePlane = dependencies.writeMachinePlaneFn ?? writeMachinePlane;
  const plane = readPlane(dependencies);
  if (plane.status === "invalid") return;
  const current = plane.status === "valid" ? plane.plane : null;
  if (current?.poKeyDirectory === directory) return;
  if (current && text(current.poKeyDirectory)) return;
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
  try { writePlane(next, dependencies); } catch { /* best-effort: never fails setup itself */ }
}
// Recorded as non-enumerable: pre-existing exact-shape assertions elsewhere
// (lib/threat-model-approval-request.test.mjs) compare the whole parseHumanArgs()/
// parseGateArgs() return value with assert.deepStrictEqual, which considers only own
// enumerable properties. A plain `values.directorySource = ...` would fail every one of
// those unrelated, pre-existing checks; this keeps the value fully readable by this
// file's own code (args.directorySource) without joining the object's public shape.
function setDirectorySource(values, source) { Object.defineProperty(values, "directorySource", { value: source, enumerable: false, configurable: true }); }
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const SHA = /^[a-f0-9]{64}$/u;
const text = (value) => typeof value === "string" && value.trim() !== "";

function outside(repoRoot, path) {
  const root = resolve(repoRoot); const target = resolve(path); const rel = relative(root, target);
  return rel === "" ? false : rel === ".." || rel.startsWith("../") || isAbsolute(rel);
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
function artifactPath(directory, name) {
  const path = join(directory, name);
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) fail("approval artifacts must be unlinked regular files outside the repository");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return path;
}

export function parseHumanArgs(argv, dependencies = {}) {
  const [command, ...tokens] = argv; const values = { command, keyReference: "local-po-key" }; const supplied = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index]; const value = tokens[index + 1];
    if (!key?.startsWith("--") || typeof value !== "string" || value.startsWith("--")) return { error: USAGE };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!new Set(["directory", "repoRoot", "keyReference", "humanName", "featureId", "plan", "spec", "model", "kind", "subjectSha256", "expiresAt", "intentSha256"]).has(normalized) || supplied.has(normalized)) return { error: USAGE };
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
  if (!new Set(["setup", "prepare", "prepare-all", "approve", "approve-all", "verify", "verify-all", "prepare-critical", "approve-critical", "verify-critical", "authorize-critical", "sign-intent"]).has(command)) return { error: USAGE };
  // SETUP-2b/AC-11: precedence, in this exact order. An explicit --directory always
  // wins and is used exactly as before, never even consulting the machine plane. Absent
  // that, the machine-scoped configuration plane's own poKeyDirectory (SS2/SS6a of
  // nova-setup-bootstrap.md); absent that in turn, the PIPELINE_PO_APPROVAL_DIRECTORY
  // environment variable, exactly as before this task. Whichever route resolves a
  // value, that value then runs through the identical isAbsolute check below and,
  // downstream, the identical externalDirectory() safety checks (AC-14) -- there is no
  // separate, weaker path for a plane- or environment-sourced value.
  if (supplied.has("directory")) {
    setDirectorySource(values, "flag");
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
  if (!text(values.directory) || !isAbsolute(values.directory)) {
    return { error: `${USAGE}\napproval directory is required and must be an absolute path: pass --directory <path>, configure poKeyDirectory in the machine-scoped configuration plane, or set $${PO_APPROVAL_DIRECTORY_ENV} to an absolute path as a fallback (an explicit --directory always overrides the plane, which overrides the environment variable).` };
  }
  if (!text(values.repoRoot) || !isAbsolute(values.repoRoot)) return { error: USAGE };
  // FIXTURE-2: --human-name is validated where the authority directory's state is known
  // (inside the "setup" branch of runHumanApproval), never here. The parser cannot see
  // whether an authority record already exists on disk, and a `setup` that recovers or
  // re-reads an existing record must not be forced to repeat a name it already has.
  if (command.endsWith("-all") && (values.featureId || values.plan || values.spec || values.model)) return { error: USAGE };
  if (command.endsWith("-critical") && !CRITICAL_ACTION_KINDS.includes(values.kind)) return { error: USAGE };
  if (command === "sign-intent" && !SHA.test(values.intentSha256 ?? "")) return { error: USAGE };
  return values;
}

function command(executable, args, dependencies) {
  const result = (dependencies.spawn ?? spawnSync)(executable, args, { stdio: "inherit", shell: false });
  if (result?.status !== 0) fail(`${executable} failed; the human terminal must complete the local prompt`);
}

const CONFIRMATION_TOKEN = "approve";

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
  return Buffer.from(bytes).toString("utf8").replace(/\r$/u, "").trim();
}

/**
 * The deliberate, plain-language gate the PO requires before any passphrase
 * prompt: a human must read what is being authorized and its consequence,
 * then type the exact confirmation token. Anything else cancels, and the
 * caller must never reach the OpenSSL sign step or write any artifact.
 */
function requireExplicitConfirmation(summaryLines, dependencies) {
  const prompt = [
    "PO APPROVAL CONFIRMATION -- read before you enter your passphrase:",
    ...summaryLines.map((line) => `  ${line}`),
    "This authorizes OpenSSL to sign the digest above with your private key; it cannot be undone once signed.",
    `Type exactly "${CONFIRMATION_TOKEN}" to continue; anything else cancels: `,
  ].join("\n");
  const read = dependencies.readConfirmation ?? defaultReadConfirmation;
  if (read(prompt) !== CONFIRMATION_TOKEN) fail("approval cancelled: explicit confirmation was not given");
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
  if (!SHA.test(args.subjectSha256 ?? "")) return "critical approval request is invalid: --subject-sha256 must be exactly 64 lowercase hexadecimal characters";
  if (!text(args.expiresAt)) return "critical approval request is invalid: --expires-at is required";
  const expiresAtMs = Date.parse(args.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return `critical approval request is invalid: --expires-at is not a parsable timestamp: ${JSON.stringify(args.expiresAt)}`;
  args.expiresAt = new Date(expiresAtMs).toISOString();
  return null;
}

/**
 * The one construction of a critical request, shared by the agent-facing
 * `prepare-critical` and the human-facing `authorize-critical`. Deliberately a
 * single call site of `createCriticalActionApprovalRequest`: a second way of
 * building the intent digest would be a second definition of the binding, and
 * it would agree right up until the moment it did not.
 */
function criticalApprovalRequest({ args, repository, featureId, dependencies }) {
  const invalid = criticalRequestFieldError(args);
  if (invalid) fail(invalid);
  return createCriticalActionApprovalRequest({
    candidate: (dependencies.observeCandidate ?? observeCleanCandidate)(repository),
    featureId,
    planBytes: readPublicRepositoryFile(repository, args.plan),
    specBytes: readPublicRepositoryFile(repository, args.spec),
    action: { kind: args.kind, subjectSha256: args.subjectSha256, expiresAt: args.expiresAt },
  });
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
 * This is a caller of the two renderers that fix already exists as, never a
 * third re-implementation of either: `renderProjectOnboardingAction()`
 * already turns an `{ kind: "command", executable, argv }` action into one
 * exact, correctly-quoted shell line (the same `shellWord()` quoting used for
 * every other onboarding action this plugin renders, already proven to
 * single-quote a value containing spaces or non-ASCII characters correctly);
 * `boundedOpaqueCopyCommand()` already turns an assembled command STRING into
 * a bounded, multi-platform (posix/powershell/cmd), pre-quoted copy
 * rendering. Composing the two here means the bounded-chunking algorithm
 * keeps its one definition in project-onboarding-v3.mjs; this function never
 * duplicates it.
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
  const executable = "node";
  const command = renderProjectOnboardingAction({ kind: "command", executable, argv });
  return { executable, argv, command, copyCommand: boundedOpaqueCopyCommand(command) };
}

/**
 * The single signing step: hand the digest to the external OpenSSL prompt and
 * record the resulting detached proof. No signer of this program's own, no key
 * material read into this process, and the temporary intent/signature files are
 * removed on every path.
 */
function signIntentIntoProof({ intentSha256, keys, artifacts, io, dependencies }) {
  io.write(artifacts.intent, intentSha256, { mode: 0o600 });
  try { command("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", keys.privateKey, "-in", artifacts.intent, "-out", artifacts.signature], dependencies); }
  finally { rmSync(artifacts.intent, { force: true }); }
  try {
    const authority = json(keys.authority); const publicKey = io.read(keys.publicKey, "utf8");
    if (!own(authority, ["keyReference", "publicKeySha256", "humanName"]) || !text(authority.keyReference) || !text(authority.humanName)
      || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("external trust policy does not match the local public key");
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
  const directory = externalDirectory(repository, resolve(args.directory), {
    create: args.command === "setup" || args.command === "prepare" || args.command === "prepare-critical" || args.command === "authorize-critical",
    source: directorySourceLabel(args.directorySource),
  });
  const critical = args.command.endsWith("-critical");
  if (critical && (args.command === "prepare-critical" || args.command === "authorize-critical") && !text(args.featureId)) fail("critical approval requires a feature id");
  const featureId = args.featureId ?? "cyb-4";
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(featureId)) fail("feature id is invalid");
  const suffix = critical ? `-critical-${args.kind}` : (featureId === "cyb-4" ? "" : `-${featureId}`);
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
    if (present.privateKey && present.publicKey && !present.authority) {
      // No authority record exists yet -- there is nothing to read a name from, so this
      // is exactly the same requirement fresh generation has below (FIXTURE-2).
      if (!text(args.humanName)) fail(SETUP_NEW_AUTHORITY_NEEDS_NAME);
      const authority = localAuthority(read(paths.publicKey, "utf8"), args.keyReference, args.humanName);
      write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 });
      persistExplicitDirectoryIntoMachinePlane(args, directory, dependencies);
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: true };
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
        fail('existing PO authority record predates --human-name and has no name recorded; run setup again with --human-name "<the human this key\'s approvals will be attributed to>" to add one.');
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
      persistExplicitDirectoryIntoMachinePlane(args, directory, dependencies);
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: false };
    }
    if (present.privateKey || present.publicKey || present.authority) fail("partial PO authority exists; refusing to overwrite it");
    if (!text(args.humanName)) fail(SETUP_NEW_AUTHORITY_NEEDS_NAME);
    command("openssl", ["genpkey", "-algorithm", "ED25519", "-aes-256-cbc", "-out", paths.privateKey], dependencies);
    command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies);
    const authority = localAuthority(read(paths.publicKey, "utf8"), args.keyReference, args.humanName); write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 }); chmodSync(paths.privateKey, 0o600);
    persistExplicitDirectoryIntoMachinePlane(args, directory, dependencies);
    return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority };
  }
  if (args.command === "authorize-critical") {
    // Fail closed on missing key material before anything is written or observed:
    // there is no point preparing a request this terminal could not sign.
    if (!exists(paths.privateKey) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup before authorize-critical");
    const request = criticalApprovalRequest({ args, repository, featureId, dependencies });
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
      "this approval does NOT cover: any other commit or tree than the candidate above, any other subject digest, any action attempted after the expiry above, and any action of a different kind -- each of those needs its own approval.",
    ], dependencies);
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: { intent: paths.intent, signature: paths.signature, proof: paths.proof, signer: paths.signer }, io: { write, read }, dependencies });
    return { ok: true, code: "PO-HUMAN-CRITICAL-AUTHORIZATION-READY", candidate: request.candidate, action: request.action, intentSha256, signer: signed.signer };
  }
  if (args.command === "prepare" || args.command === "prepare-critical") {
    if (critical) {
      const request = criticalApprovalRequest({ args, repository, featureId, dependencies });
      write(paths.request, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
      return { ok: true, code: "PO-HUMAN-CRITICAL-REQUEST-READY", candidate: request.candidate, intentSha256: request.approvalIntent.sha256, action: request.action };
    }
    const result = runApprovalRequest(["prepare", "--repo-root", repository, "--feature-id", featureId, "--plan", args.plan ?? "specs/2026-07-24-sprint-cyborg-epic/prd_cyborg-epic.md", "--spec", args.spec ?? "specs/2026-07-24-sprint-cyborg-epic/spec.md", "--model", args.model ?? `specs/${featureId}/threat-model.json`]);
    write(paths.request, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    return { ok: true, code: "PO-HUMAN-REQUEST-READY", candidate: result.value.candidate, intentSha256: result.value.approvalIntent.sha256 };
  }
  if (args.command === "sign-intent") {
    if (!exists(paths.privateKey) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup before sign-intent");
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
    const describe = dependencies.describeIntentRecord ?? describeGuardMaintenanceWindowRequest;
    const record = describe({ rootDir: repository, intentSha256 });
    requireExplicitConfirmation([
      `intent sha256: ${intentSha256}`,
      ...(record.resolved ? record.lines : [
        `no recorded request resolves for this digest in this repository (${record.code}): this command has no description of that action and will not invent one.`,
        "it signs a one-time, audited guard-lift/guard-override (HGO/GMW) authorization for whatever was recorded against this exact digest elsewhere.",
      ]),
      "this approval covers exactly this digest: a different scope, expiry, reason or candidate is a different digest and needs its own approval.",
    ], dependencies);
    const manual = {
      intent: artifactPath(directory, "intent-manual.txt"),
      signature: artifactPath(directory, "signature-manual.bin"),
      proof: artifactPath(directory, "proof-manual.json"),
      signer: artifactPath(directory, "signer-manual.json"),
    };
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: manual, io: { write, read }, dependencies });
    return { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256, signer: signed.signer };
  }
  if (!exists(paths.request) || !exists(paths.publicKey) || !exists(paths.authority)) fail("run setup and prepare before approving");
  const request = approvalRequestFromExternalJson(json(paths.request));
  const intentSha256 = request?.approvalIntent?.sha256;
  if (!SHA.test(intentSha256 ?? "")) fail("request has no valid approval intent");
  if (args.command === "approve" || args.command === "approve-critical") {
    if (!exists(paths.privateKey)) fail("private key is unavailable");
    const kind = critical ? request?.action?.kind : request?.approvalIntent?.value?.kind;
    const summary = [`kind: ${kind}`, `candidate commit: ${request?.candidate?.commit}`];
    if (critical) {
      summary.push(`action subject sha256: ${request?.action?.subjectSha256}`);
      summary.push(`action expires at: ${request?.action?.expiresAt}`);
    }
    requireExplicitConfirmation(summary, dependencies);
    const signed = signIntentIntoProof({ intentSha256, keys: paths, artifacts: { intent: paths.intent, signature: paths.signature, proof: paths.proof, signer: paths.signer }, io: { write, read }, dependencies });
    return { ok: true, code: "PO-HUMAN-PROOF-READY", intentSha256, signer: signed.signer };
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

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runHumanApproval(), null, 2)}\n`); } catch (error) { process.stderr.write(`PO-HUMAN-APPROVAL-FAILED: ${error.message}\n`); process.exitCode = 2; }
}
