// SPDX-License-Identifier: SUL-1.0
/**
 * C20 G20-30 (AC-108): after the PO runs the one signing command, the agent waits for the named proof file itself (a bounded poll,
 * the same shape as session-authority-repair.mjs `wait`) and then runs the existing import step; the PO is never asked to report back.
 * The wait only observes that a well-formed proof file exists. It never verifies a signature (the import step does), never prints the
 * file, and reads only the one path the signing step named.
 *
 * A proof reference is exactly one of: `scratch/<name>.json` below the project root (sign-intent --request writes its sibling proof
 * there), or an absolute path whose file name is `proof-<64 hex>.json` (the guard-override signature writes it into the key directory).
 *
 * C20e G20-76: authorize-critical mirrors request, proof, authority and signer into scratch/ under ONE fixed name per repository and
 * kind, so an older signature's mirror can already sit at the proof path. A caller that knows the subject it prepared passes
 * `subjectSha256`; the wait then counts a scratch proof as present only when its sibling request (the `proof-` -> `request-` name)
 * carries exactly that subject (the comparison pipeline-state approve-push makes) AND the proof signs that request's own intent.
 * Still no signature is verified and no key is read: the wait compares two strings the files already carry.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA } from "./critical-action-approval-request.mjs";

export const PROOF_WAIT_SCHEMA = "pipeline.signed-proof-wait.v1";
// Greenfields 2026-11-08: 120 s ended every wait before a human had signed (8 and 39 minutes measured). Below the 600 s cap of a foreground shell call.
export const PROOF_WAIT_DEFAULT_SECONDS = 570;
export const PROOF_WAIT_MAX_SECONDS = 600;
/** C29 (C9): the label every wait result carries; the time waited for a human signature is PO wait, never active agent time. */
export const PROOF_WAIT_CLASS = "po-wait";
export const PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
export const PROOF_WAIT_SCRIPT = fileURLToPath(new URL("../scripts/proof-wait.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url));
const SCRATCH_PROOF = /^scratch\/[A-Za-z0-9._-]*proof[A-Za-z0-9._-]*\.json$/u;
const KEY_DIRECTORY_PROOF = /^proof-([a-f0-9]{64})\.json$/u;

/** `"scratch"` or `"key-directory"` for a well-formed reference, otherwise null. No dot segment and no backslash is ever admitted. */
export function proofReferenceKind(reference) {
  if (typeof reference !== "string" || reference === "" || reference.length > 400 || /[\u0000-\u001f\u007f\\]/u.test(reference)) return null;
  if (reference.split("/").some((part) => part === "." || part === "..")) return null;
  if (isAbsolute(reference)) return KEY_DIRECTORY_PROOF.test(basename(reference)) ? "key-directory" : null;
  return SCRATCH_PROOF.test(reference) ? "scratch" : null;
}

export const isProofSubjectSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

/** The mirrored request that sits beside a scratch proof (the `proof-` -> `request-` mapping sign-intent itself writes under), or null. */
function siblingRequestName(reference) {
  const name = basename(reference);
  return name.includes("proof-") ? name.replace("proof-", "request-") : null;
}

/** True only when the sibling request is a critical-action request for exactly `subjectSha256` and `proof` signs that request's intent. */
function proofBelongsToSubject(root, reference, proof, subjectSha256) {
  const requestName = siblingRequestName(reference);
  if (requestName === null) return false;
  const target = join(root, "scratch", requestName);
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1024 * 1024) return false;
    const request = JSON.parse(readFileSync(target, "utf8"));
    const intentSha256 = request?.approvalIntent?.sha256;
    return request?.schema === CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA && request?.action?.subjectSha256 === subjectSha256
      && isProofSubjectSha256(intentSha256) && proof.intentSha256 === intentSha256;
  } catch { return false; }
}

/**
 * `present` (a regular, well-formed proof file), `absent`, or `invalid` (something else sits at the path). With a subject (scratch
 * proofs only) a well-formed proof that does not belong to it is `stale`: an older signature's file, not signed yet for this subject.
 */
export function observeProofFile(root, reference, subjectSha256 = null) {
  const kind = proofReferenceKind(reference);
  if (kind === null) return { state: "invalid", reason: "not a proof reference" };
  const target = kind === "scratch" ? resolve(root, reference) : reference;
  let stat;
  try { stat = lstatSync(target); } catch (error) { return error?.code === "ENOENT" ? { state: "absent" } : { state: "invalid", reason: "unreadable" }; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1024 * 1024) return { state: "invalid", reason: "not a plain proof file" };
  if (kind === "scratch") {
    try { if (dirname(realpathSync(target)) !== realpathSync(join(root, "scratch"))) return { state: "invalid", reason: "outside scratch/" }; } catch { return { state: "invalid", reason: "unreadable" }; }
  }
  let proof;
  try { proof = JSON.parse(readFileSync(target, "utf8")); } catch { return { state: "invalid", reason: "not JSON" }; }
  if (proof?.schema !== PROOF_SCHEMA) return { state: "invalid", reason: "not a po-approval proof" };
  if (subjectSha256 === null || subjectSha256 === undefined || kind !== "scratch") return { state: "present" };
  return proofBelongsToSubject(root, reference, proof, subjectSha256) ? { state: "present" } : { state: "stale", reason: "its request does not carry the expected subject" };
}

const quote = (part) => (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(part) ? part : JSON.stringify(part));
/** PowerShell runs a quoted executable only behind its call operator (Claude greenfield 2026-11-08: the repair text could not be pasted). */
export const commandText = ({ executable, argv }, platform = process.platform) => {
  const rendered = [executable, ...argv].map(quote).join(" ");
  return platform === "win32" && rendered.startsWith('"') ? `& ${rendered}` : rendered;
};
const text = commandText;

/** The exact bounded wait for a proof reference; `--subject` (G20-76) follows `--timeout` and appears only when a subject is given. */
export function proofWaitCommand(root, proof, seconds = PROOF_WAIT_DEFAULT_SECONDS, subjectSha256 = null) {
  if (subjectSha256 !== null && !isProofSubjectSha256(subjectSha256)) throw new TypeError("the proof wait subject must be 64 lowercase hex characters");
  return { executable: process.execPath, argv: [PROOF_WAIT_SCRIPT, "--root", root, "--proof", proof, "--timeout", String(seconds), ...(subjectSha256 === null ? [] : ["--subject", subjectSha256])] };
}

/**
 * authorize-critical owns the `critical-*` mirror: its request appears only after that command ran and carries the digest under
 * approvalIntent, so sign-intent can never sign it. The wait has no plan, spec or expiry to rebuild that command from.
 */
const isCriticalMirrorProof = (proof) => basename(proof).startsWith("critical-");
const CRITICAL_SIGNING_STEP = "exactly the authorize-critical command the signing step printed (if it is gone, rerun the step that printed it)";

/** The PO's one signing command for a proof reference, derived by the naming convention sign-intent itself writes under; null when sign-intent cannot sign it. */
export function signCommandForProof(root, proof) {
  const kind = proofReferenceKind(proof);
  if (kind === "scratch") {
    const name = basename(proof);
    if (!name.includes("proof-") || isCriticalMirrorProof(proof)) return null;
    return { executable: process.execPath, argv: [PO_HUMAN_APPROVAL_SCRIPT, "sign-intent", "--repo-root", root, "--request", `scratch/${name.replace("proof-", "request-")}`] };
  }
  if (kind === "key-directory") {
    return { executable: process.execPath, argv: [PO_HUMAN_APPROVAL_SCRIPT, "sign-intent", "--repo-root", root, "--intent-sha256", KEY_DIRECTORY_PROOF.exec(basename(proof))[1]] };
  }
  return null;
}

/**
 * The fields every signing step carries beside its sign command (one builder for all of them): the exact proof path, the bounded
 * wait the agent runs itself, and the explicit statement that the PO reports nothing back.
 */
/** One pasteable line for a signing command in any shape a step carries: a copy-safe rendering, its `command` text, or executable plus argv. */
function signingLine(signCommand) {
  if (typeof signCommand === "string" && signCommand.trim() !== "") return signCommand;
  if (signCommand === null || typeof signCommand !== "object") return null;
  for (const field of ["copyCommand", "command"]) if (typeof signCommand[field] === "string" && signCommand[field].trim() !== "") return signCommand[field];
  return typeof signCommand.executable === "string" && Array.isArray(signCommand.argv) ? text(signCommand) : null;
}

/**
 * C29 P2-6 (Claude greenfield run 3: three waits ran out while the PO asked what was needed): the one fixed sentence the agent hands
 * the PO, verbatim and once, before it waits. It names the one command; without a known command it names the signing step instead
 * of inventing one.
 */
export function poNowSentence(signCommand, proofPath) {
  const line = signingLine(signCommand);
  return line === null
    ? `Now from you: run the one signing command shown above in your own terminal; nothing else is needed. I wait for ${proofPath} myself, so you do not need to report back.`
    : `Now from you: run this one command in your own terminal, nothing else is needed: ${line}  I wait for ${proofPath} myself, so you do not need to report back.`;
}

export function awaitSignatureFields({ root, proofPath, seconds = PROOF_WAIT_DEFAULT_SECONDS, subjectSha256 = null, signCommand = undefined }) {
  const wait = proofWaitCommand(root, proofPath, seconds, subjectSha256);
  return {
    proofPath,
    poNow: poNowSentence(signCommand === undefined ? signCommandForProof(root, proofPath) : signCommand, proofPath),
    reportBackRequired: false,
    waitAction: {
      kind: "command", ...wait, mutation: false, requiresConfirmation: false,
      expected: { schema: PROOF_WAIT_SCHEMA, statuses: ["proof-present"] },
    },
    afterSigning: `Hand the PO the poNow sentence once, verbatim, as the last thing before the wait. Do not ask the PO to report back. After handing over the one signing command once, run waitAction with a shell-tool timeout above ${seconds} seconds (it returns as soon as ${proofPath} exists, or after ${seconds}s with one recovery), then read the next step from the same inspect readback. Signing is a human step and can take many minutes: PROOF-WAIT-TIMEOUT only means the file is not there yet, so run waitAction again, silently: no status message and no repeated signing command between waits. The waited time (waitedSeconds, waitClass "${PROOF_WAIT_CLASS}") is PO wait, never active agent time. Tell the PO which command to run, never that it happens automatically.`
      + (subjectSha256 === null ? "" : ` The wait ends only for the expected subject ${subjectSha256}: an older signature's file at that path does not end it.`),
  };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The mirror files of one signing kind (request, proof, authority, signer share one fixed name per repository), derived from the proof's own name. */
function staleMirrorNames(proof) {
  const name = basename(proof);
  const at = name.indexOf("proof-");
  if (at < 0) return [proof];
  const roles = name.startsWith("critical-") ? ["request", "proof", "authority", "signer"] : ["request", "proof"];
  return roles.map((role) => `scratch/${name.slice(0, at)}${role}-${name.slice(at + "proof-".length)}`);
}

/** A bounded poll. Result: `{ status: "proof-present" }` or a typed `refused` whose single `repair` is the recovery. */
export function waitForSignedProof({ root, proof, timeoutSeconds = PROOF_WAIT_DEFAULT_SECONDS, subjectSha256 = null, now = Date.now, pause = sleep, observe = observeProofFile }) {
  if (proofReferenceKind(proof) === null) {
    return { status: "refused", code: "PROOF-WAIT-ARGS", reason: "--proof must be scratch/<name>.json below the project, or an absolute proof-<64 hex>.json written by sign-intent", repair: "pass the proofPath the signing step printed, unchanged" };
  }
  if (subjectSha256 !== null && !isProofSubjectSha256(subjectSha256)) {
    return { status: "refused", code: "PROOF-WAIT-ARGS", reason: "--subject must be 64 lowercase hex characters", repair: "pass the subject sha256 the signing step printed, unchanged, or leave --subject out" };
  }
  const started = now();
  const deadline = started + timeoutSeconds * 1000;
  // C29 (Codex run 3, C9; PO tile 2026-11-13 "bounded wait, silent"): every result labels the time it waited as PO wait, so a timeline or
  // report nets it out of agent time instead of counting it as active work.
  const waited = () => ({ waitedSeconds: Math.max(0, Math.round((now() - started) / 1000)), waitClass: PROOF_WAIT_CLASS });
  let last;
  for (;;) {
    last = observe(root, proof, subjectSha256);
    if (last.state === "present") return { status: "proof-present", proofPath: proof, ...waited() };
    if (now() >= deadline) break;
    pause(Math.min(500, Math.max(1, deadline - now())));
  }
  const sign = signCommandForProof(root, proof);
  const again = text(proofWaitCommand(root, proof, timeoutSeconds, subjectSha256));
  const critical = isCriticalMirrorProof(proof) ? `ask the PO once to run ${CRITICAL_SIGNING_STEP}` : null;
  if (last.state !== "stale" && last.state !== "invalid") {
    // C29 (C9): a timeout is not news. The signing command was handed over once before the wait; repeating it or posting a status
    // message on every timeout is the toil the run showed (570 s of active waiting with repeated messages).
    const handed = isCriticalMirrorProof(proof) ? CRITICAL_SIGNING_STEP : (sign === null ? "the signing step" : text(sign));
    return { status: "refused", code: "PROOF-WAIT-TIMEOUT", proofPath: proof, ...waited(), reason: `no signed proof appeared at ${proof} within ${timeoutSeconds}s; signing is a human step and the time waited is PO wait`,
      repair: `the PO already has the one signing command (${handed}); do not repeat it and post no status message; wait silently again: ${again}` };
  }
  if (last.state === "stale") {
    return { status: "refused", code: "PROOF-WAIT-STALE", proofPath: proof, ...waited(), reason: `a signed proof sits at ${proof} but it is an older signature's mirror, not one for the expected subject (${last.reason})`,
      repair: `rename (do not remove) the older mirror files ${staleMirrorNames(proof).join(", ")}; ${critical ?? (sign === null ? "sign again" : `then ask the PO once to run exactly this signing command: ${text(sign)}`)}; then run ${again}` };
  }
  return { status: "refused", code: "PROOF-WAIT-INVALID", proofPath: proof, ...waited(), reason: `a file sits at ${proof} but it is not a signed proof (${last.reason})`,
    repair: `${critical ?? (sign === null ? "sign again" : `have the PO run the one signing command again: ${text(sign)}`)}; then run ${again}` };
}
