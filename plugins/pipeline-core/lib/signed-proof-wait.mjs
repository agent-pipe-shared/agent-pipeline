// SPDX-License-Identifier: SUL-1.0
/**
 * C20 G20-30 (AC-108): after the PO runs the one signing command, the agent waits for the named proof file itself (a bounded poll,
 * the same shape as session-authority-repair.mjs `wait`) and then runs the existing import step; the PO is never asked to report back.
 * The wait only observes that a well-formed proof file exists. It never verifies a signature (the import step does), never prints the
 * file, and reads only the one path the signing step named.
 *
 * A proof reference is exactly one of: `scratch/<name>.json` below the project root (sign-intent --request writes its sibling proof
 * there), or an absolute path whose file name is `proof-<64 hex>.json` (the guard-override signature writes it into the key directory).
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROOF_WAIT_SCHEMA = "pipeline.signed-proof-wait.v1";
export const PROOF_WAIT_DEFAULT_SECONDS = 120;
export const PROOF_WAIT_MAX_SECONDS = 600;
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

/** `present` (a regular, well-formed proof file), `absent`, or `invalid` (something else sits at the path). */
export function observeProofFile(root, reference) {
  const kind = proofReferenceKind(reference);
  if (kind === null) return { state: "invalid", reason: "not a proof reference" };
  const target = kind === "scratch" ? resolve(root, reference) : reference;
  let stat;
  try { stat = lstatSync(target); } catch (error) { return error?.code === "ENOENT" ? { state: "absent" } : { state: "invalid", reason: "unreadable" }; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1024 * 1024) return { state: "invalid", reason: "not a plain proof file" };
  if (kind === "scratch") {
    try { if (dirname(realpathSync(target)) !== realpathSync(join(root, "scratch"))) return { state: "invalid", reason: "outside scratch/" }; } catch { return { state: "invalid", reason: "unreadable" }; }
  }
  try {
    const proof = JSON.parse(readFileSync(target, "utf8"));
    return proof?.schema === PROOF_SCHEMA ? { state: "present" } : { state: "invalid", reason: "not a po-approval proof" };
  } catch { return { state: "invalid", reason: "not JSON" }; }
}

const quote = (part) => (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(part) ? part : JSON.stringify(part));
export const commandText = ({ executable, argv }) => [executable, ...argv].map(quote).join(" ");
const text = commandText;

/** The exact bounded wait for a proof reference. */
export function proofWaitCommand(root, proof, seconds = PROOF_WAIT_DEFAULT_SECONDS) {
  return { executable: process.execPath, argv: [PROOF_WAIT_SCRIPT, "--root", root, "--proof", proof, "--timeout", String(seconds)] };
}

/** The PO's one signing command for a proof reference, derived by the naming convention sign-intent itself writes under. */
export function signCommandForProof(root, proof) {
  const kind = proofReferenceKind(proof);
  if (kind === "scratch") {
    const name = basename(proof);
    if (!name.includes("proof-")) return null;
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
export function awaitSignatureFields({ root, proofPath, seconds = PROOF_WAIT_DEFAULT_SECONDS }) {
  const wait = proofWaitCommand(root, proofPath, seconds);
  return {
    proofPath,
    reportBackRequired: false,
    waitAction: {
      kind: "command", ...wait, mutation: false, requiresConfirmation: false,
      expected: { schema: PROOF_WAIT_SCHEMA, statuses: ["proof-present"] },
    },
    afterSigning: `Do not ask the PO to report back. After handing over the one signing command, run waitAction (it returns as soon as ${proofPath} exists, or after ${seconds}s with one recovery), then read the next step from the same inspect readback.`,
  };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** A bounded poll. Result: `{ status: "proof-present" }` or a typed `refused` whose single `repair` is the recovery. */
export function waitForSignedProof({ root, proof, timeoutSeconds = PROOF_WAIT_DEFAULT_SECONDS, now = Date.now, pause = sleep, observe = observeProofFile }) {
  if (proofReferenceKind(proof) === null) {
    return { status: "refused", code: "PROOF-WAIT-ARGS", reason: "--proof must be scratch/<name>.json below the project, or an absolute proof-<64 hex>.json written by sign-intent", repair: "pass the proofPath the signing step printed, unchanged" };
  }
  const deadline = now() + timeoutSeconds * 1000;
  let last;
  for (;;) {
    last = observe(root, proof);
    if (last.state === "present") return { status: "proof-present", proofPath: proof };
    if (now() >= deadline) break;
    pause(Math.min(500, Math.max(1, deadline - now())));
  }
  const sign = signCommandForProof(root, proof);
  const again = text(proofWaitCommand(root, proof, timeoutSeconds));
  return last.state === "invalid"
    ? { status: "refused", code: "PROOF-WAIT-INVALID", proofPath: proof, reason: `a file sits at ${proof} but it is not a signed proof (${last.reason})`,
      repair: `${sign === null ? "sign again" : `have the PO run the one signing command again: ${text(sign)}`}; then run ${again}` }
    : { status: "refused", code: "PROOF-WAIT-TIMEOUT", proofPath: proof, reason: `no signed proof appeared at ${proof} within ${timeoutSeconds}s`,
      repair: `${sign === null ? "the signing step has not been run" : `ask the PO once to run exactly this signing command: ${text(sign)}`}; then run ${again}` };
}
