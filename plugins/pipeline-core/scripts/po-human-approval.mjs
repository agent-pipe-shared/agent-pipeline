#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * PO proof helper with a deliberately split responsibility boundary.
 *
 * `prepare` writes only public candidate-bound requests and is agent work.
 * `setup` and `approve` are intentionally for a terminal operated by the
 * approving human. The encrypted private key stays outside the checkout and
 * OpenSSL reads its passphrase from that terminal. No password, passphrase,
 * recovery code or private key is accepted as an argument, environment value,
 * stdin payload, repository file, or pipeline state. `verify` is public
 * readback and is agent work again.
 */
import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { approvalRequestFromExternalJson, observeCleanCandidate, run as runApprovalRequest } from "./po-approval-request.mjs";
import { readPublicRepositoryFile, verifyThreatModelApprovalRequest } from "../lib/threat-model-approval-request.mjs";
import { createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { GOVERNANCE_FORK_DISPOSITION_APPROVAL, governanceForkDispositionApprovalSubject, inspectForkedGovernanceStream } from "../lib/governance-event-store.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "Usage: po-human-approval.mjs setup --repo-root <repo> --directory <external-dir> [--key-reference <id>] | prepare --repo-root <repo> --directory <external-dir> [--feature-id <id> --plan <repo-path> --spec <repo-path> --model <repo-path>] | prepare-all --repo-root <repo> --directory <external-dir> | approve --repo-root <repo> --directory <external-dir> [--feature-id <id>] | approve-all --repo-root <repo> --directory <external-dir> | verify --repo-root <repo> --directory <external-dir> [--feature-id <id>] | verify-all --repo-root <repo> --directory <external-dir> | prepare-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication> --subject-sha256 <sha256> --expires-at <ISO-8601> | approve-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication> | verify-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication> | prepare-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> --expires-at <ISO-8601> | approve-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> | verify-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> | sign-intent --repo-root <repo> --directory <external-dir> --intent-sha256 <sha256>";
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
function externalDirectory(repository, directory, { create = false } = {}) {
  if (!outside(repository, directory)) fail("approval directory must be outside the repository");
  let canonicalRepository; let ancestor = directory; const missing = [];
  try { canonicalRepository = realpathSync(repository); }
  catch { fail("approval directory or repository is missing or unreadable"); }
  for (;;) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if (error?.code !== "ENOENT") fail("approval directory is unreadable");
      const parent = dirname(ancestor); if (parent === ancestor) fail("approval directory is missing or unreadable");
      missing.unshift(basename(ancestor)); ancestor = parent;
    }
  }
  let canonicalAncestor;
  try { canonicalAncestor = realpathSync(ancestor); }
  catch { fail("approval directory is missing or unreadable"); }
  if (!outside(canonicalRepository, canonicalAncestor)) fail("approval directory must be outside the repository");
  const target = missing.reduce((path, segment) => join(path, segment), canonicalAncestor);
  if (create) mkdirSync(target, { recursive: true, mode: 0o700 });
  let canonicalDirectory;
  try { canonicalDirectory = realpathSync(target); }
  catch { fail("approval directory is missing or unreadable"); }
  if (!outside(canonicalRepository, canonicalDirectory)) fail("approval directory must be outside the repository");
  if (!statSync(canonicalDirectory).isDirectory()) fail("approval directory must be a directory");
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

/**
 * The three fork-disposition commands (ADR-0063). They are a sibling of the
 * `-critical` trio, not a fourth `--kind` for it: a fork disposition's subject
 * is DERIVED from the fork that actually exists, so the parameters that locate
 * that fork replace the ones `prepare-critical` accepts verbatim.
 */
const FORK_DISPOSITION_COMMANDS = new Set(["prepare-fork-disposition", "approve-fork-disposition", "verify-fork-disposition"]);

/**
 * The `--kind` values `prepare-critical`/`approve-critical`/`verify-critical`
 * accept — deliberately the three ORIGINAL kinds, spelled out here rather than
 * taken from `CRITICAL_ACTION_KINDS`.
 *
 * That import is what admitted `governance-fork-disposition` the moment the
 * family grew a fourth member (ADR-0063), and every branch behind it is wrong
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
 */
const CRITICAL_COMMAND_KINDS = Object.freeze(["push", "deploy", "publication"]);
const SEQUENCE = /^[1-9][0-9]{0,14}$/u;
const isoTimestamp = (value) => text(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseHumanArgs(argv) {
  const [command, ...tokens] = argv; const values = { command, keyReference: "local-po-key" }; const supplied = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index]; const value = tokens[index + 1];
    if (!key?.startsWith("--") || typeof value !== "string" || value.startsWith("--")) return { error: USAGE };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!new Set(["directory", "repoRoot", "keyReference", "featureId", "plan", "spec", "model", "kind", "subjectSha256", "expiresAt", "intentSha256", "repositoryFingerprint", "streamId", "sequence"]).has(normalized) || supplied.has(normalized)) return { error: USAGE };
    supplied.add(normalized); values[normalized] = value; index += 1;
  }
  if (!new Set(["setup", "prepare", "prepare-all", "approve", "approve-all", "verify", "verify-all", "prepare-critical", "approve-critical", "verify-critical", "sign-intent", ...FORK_DISPOSITION_COMMANDS]).has(command) || !text(values.directory) || !isAbsolute(values.directory)
    || !text(values.repoRoot) || !isAbsolute(values.repoRoot)) return { error: USAGE };
  // The fork-locating parameters exist only for the new commands; every
  // pre-existing command rejects them exactly as it rejected any unknown flag
  // before, so widening the accepted-key set above changes nothing for them.
  if (!FORK_DISPOSITION_COMMANDS.has(command) && (values.repositoryFingerprint || values.streamId || values.sequence)) return { error: USAGE };
  if (FORK_DISPOSITION_COMMANDS.has(command)) {
    // No `--subject-sha256` here, ever: accepting a bare digest is precisely
    // the self-minting route ADR-0063 closes. Nor plan/spec/feature paths --
    // GOVERNANCE_FORK_DISPOSITION_APPROVAL fixes all three.
    if (values.kind || values.subjectSha256 || values.featureId || values.plan || values.spec || values.model) return { error: USAGE };
    if (!SHA.test(values.repositoryFingerprint ?? "") || !text(values.streamId) || !SEQUENCE.test(values.sequence ?? "")) return { error: USAGE };
    if (command === "prepare-fork-disposition" ? !isoTimestamp(values.expiresAt) : values.expiresAt !== undefined) return { error: USAGE };
  }
  if (command.endsWith("-all") && (values.featureId || values.plan || values.spec || values.model)) return { error: USAGE };
  if (command.endsWith("-critical") && !CRITICAL_COMMAND_KINDS.includes(values.kind)) return { error: USAGE };
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

export function runHumanApproval(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseHumanArgs(argv); if (args.error) fail(args.error);
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
  const directory = externalDirectory(repository, resolve(args.directory), { create: args.command === "setup" || args.command === "prepare" || args.command === "prepare-critical" });
  const critical = args.command.endsWith("-critical");
  if (critical && args.command === "prepare-critical" && !text(args.featureId)) fail("critical approval requires a feature id");
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
  };
  const write = dependencies.writeFile ?? writeFileSync; const read = dependencies.readFile ?? readFileSync; const exists = dependencies.exists ?? existsSync;
  if (args.command === "setup") {
    const present = { privateKey: exists(paths.privateKey), publicKey: exists(paths.publicKey), authority: exists(paths.authority) };
    if (present.privateKey && present.publicKey && !present.authority) {
      const authority = publicKeyPolicy(read(paths.publicKey, "utf8"), args.keyReference);
      write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 });
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: true };
    }
    if (present.privateKey && present.publicKey && present.authority) {
      const authority = json(paths.authority); const publicKey = read(paths.publicKey, "utf8");
      if (!own(authority, ["keyReference", "publicKeySha256"]) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("existing trust policy does not match the local public key");
      return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority, recovered: false };
    }
    if (present.privateKey || present.publicKey || present.authority) fail("partial PO authority exists; refusing to overwrite it");
    command("openssl", ["genpkey", "-algorithm", "ED25519", "-aes-256-cbc", "-out", paths.privateKey], dependencies);
    command("openssl", ["pkey", "-in", paths.privateKey, "-pubout", "-out", paths.publicKey], dependencies);
    const authority = publicKeyPolicy(read(paths.publicKey, "utf8"), args.keyReference); write(paths.authority, `${JSON.stringify(authority, null, 2)}\n`, { mode: 0o600 }); chmodSync(paths.privateKey, 0o600);
    // Privacy-hygiene nudge (H-AC-11 O-4): fires only on this fresh-key-creation
    // branch and only when the operator chose a non-default --key-reference; the
    // GMW/human-ledger design cannot fully decouple this key reference from the
    // portable record, so a value that uniquely identifies the operator as a
    // natural person is a real, proven privacy concern here. Advisory only; it
    // never blocks, fails, or alters the returned result object.
    if (args.keyReference !== "local-po-key") {
      process.stdout.write(`NOTE: --key-reference "${args.keyReference}" may uniquely identify you as a natural person; consider a less individually-attributable value (H-AC-11 O-4).\n`);
    }
    return { ok: true, code: "PO-HUMAN-AUTHORITY-READY", authority };
  }
  if (args.command === "prepare" || args.command === "prepare-critical") {
    if (critical) {
      if (!text(args.plan) || !text(args.spec) || !SHA.test(args.subjectSha256 ?? "")
        || !text(args.expiresAt) || !Number.isFinite(Date.parse(args.expiresAt)) || new Date(args.expiresAt).toISOString() !== args.expiresAt) {
        fail("critical approval request is invalid");
      }
      const request = createCriticalActionApprovalRequest({
        candidate: (dependencies.observeCandidate ?? observeCleanCandidate)(repository),
        featureId,
        planBytes: readPublicRepositoryFile(repository, args.plan),
        specBytes: readPublicRepositoryFile(repository, args.spec),
        action: { kind: args.kind, subjectSha256: args.subjectSha256, expiresAt: args.expiresAt },
      });
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
    requireExplicitConfirmation([
      `intent sha256: ${intentSha256}`,
      "this arms a one-time, audited guard-lift/guard-override authorization (HGO/GMW) for whatever action was already recorded against this exact digest; this command has no more specific description of that action available to it.",
    ], dependencies);
    const manual = {
      intent: artifactPath(directory, "intent-manual.txt"),
      signature: artifactPath(directory, "signature-manual.bin"),
      proof: artifactPath(directory, "proof-manual.json"),
    };
    write(manual.intent, intentSha256, { mode: 0o600 });
    try { command("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", paths.privateKey, "-in", manual.intent, "-out", manual.signature], dependencies); }
    finally { rmSync(manual.intent, { force: true }); }
    try {
      const authority = json(paths.authority); const publicKey = read(paths.publicKey, "utf8");
      if (!own(authority, ["keyReference", "publicKeySha256"]) || !text(authority.keyReference) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("external trust policy does not match the local public key");
      const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: authority.keyReference, publicKey, signatureBase64: Buffer.from(read(manual.signature)).toString("base64") };
      write(manual.proof, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    } finally { rmSync(manual.signature, { force: true }); }
    return { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256 };
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
    write(paths.intent, intentSha256, { mode: 0o600 });
    try { command("openssl", ["pkeyutl", "-sign", "-rawin", "-inkey", paths.privateKey, "-in", paths.intent, "-out", paths.signature], dependencies); }
    finally { rmSync(paths.intent, { force: true }); }
    try {
      const authority = json(paths.authority); const publicKey = read(paths.publicKey, "utf8");
      if (!own(authority, ["keyReference", "publicKeySha256"]) || !text(authority.keyReference) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("external trust policy does not match the local public key");
      const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256, keyReference: authority.keyReference, publicKey, signatureBase64: Buffer.from(read(paths.signature)).toString("base64") };
      write(paths.proof, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    } finally { rmSync(paths.signature, { force: true }); }
    return { ok: true, code: "PO-HUMAN-PROOF-READY", intentSha256 };
  }
  if (!exists(paths.proof)) fail("run approve before verify");
  const candidate = (dependencies.observeCandidate ?? observeCleanCandidate)(repository);
  if (request?.candidate?.commit !== candidate.commit || request?.candidate?.tree !== candidate.tree) fail("proof request is not bound to the current clean candidate");
  const verified = critical
    ? verifyCriticalActionApprovalRequest({ request, trustPolicy: json(paths.authority), proof: json(paths.proof), expectedCandidate: candidate, expectedAction: request.action })
    : verifyThreatModelApprovalRequest({ request, trustPolicy: json(paths.authority), proof: json(paths.proof) });
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
 * The fork-disposition half of the ceremony (ADR-0063), split from
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
  const args = parseHumanArgs(argv); if (args.error) fail(args.error);
  if (!FORK_DISPOSITION_COMMANDS.has(args.command)) fail(USAGE);
  const repository = resolve(args.repoRoot);
  const directory = externalDirectory(repository, resolve(args.directory), { create: args.command === "prepare-fork-disposition" });
  const suffix = `-critical-${GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind}`;
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
  if (!policy.ok || policy.trustAnchor === null) fail("project/critical-human-proof.json declares no usable trustAnchor, so the store can verify no external approval");
  const intent = request?.approvalIntent?.value;
  if (intent?.featureId !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId
    || intent?.planSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.planSha256
    || intent?.specSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.specSha256) {
    fail("the prepared request was not issued for the fork-disposition authority");
  }
  const proof = json(paths.proof);
  const verified = verifyCriticalActionApprovalRequest({ request, trustPolicy: policy.trustAnchor, proof, expectedCandidate: subject.candidate, expectedAction: request.action });
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
