#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// proof-wait.mjs --root <project> --proof <scratch/<name>.json | /abs/proof-<64 hex>.json> [--timeout <1-600, default 120>] [--subject <64 hex>]
//
// C20e G20-76: with --subject the wait ends only for a scratch proof whose sibling request carries exactly that subject (an older
// signature's mirror at the same fixed name does not end it); a timeout where such a file existed is PROOF-WAIT-STALE.
//
// C20 G20-30 (AC-108): the agent's own bounded wait for the PO's signature. A signing step names the exact proof path; after the PO
// runs the one signing command the agent runs this, and it returns as soon as that file exists as a well-formed signed proof, so the
// PO is never asked to "tell me when you have signed". Read-only: it observes one file, never verifies a signature (the import step
// does that), never prints the file. Prints one JSON `pipeline.signed-proof-wait.v1`. Exit 0: proof-present. Exit 2: refused, with a
// typed code (PROOF-WAIT-ARGS | PROOF-WAIT-ROOT | PROOF-WAIT-TIMEOUT | PROOF-WAIT-INVALID | PROOF-WAIT-STALE) and the one recovery in `repair`.
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { isProofSubjectSha256, PROOF_WAIT_DEFAULT_SECONDS, PROOF_WAIT_MAX_SECONDS, PROOF_WAIT_SCHEMA, waitForSignedProof } from "../lib/signed-proof-wait.mjs";

function parse(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.startsWith("--") ? argv[index].slice(2) : null;
    const value = argv[index + 1];
    if (!["root", "proof", "timeout", "subject"].includes(name) || typeof value !== "string" || value === "" || value.startsWith("--") || Object.hasOwn(flags, name)) {
      return { error: `unexpected argument ${String(argv[index]).slice(0, 40)}` };
    }
    flags[name] = value;
  }
  if (!flags.root || !flags.proof) return { error: "--root and --proof are required" };
  const timeout = flags.timeout === undefined ? PROOF_WAIT_DEFAULT_SECONDS : Number(flags.timeout);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > PROOF_WAIT_MAX_SECONDS) return { error: `--timeout needs whole seconds from 1 to ${PROOF_WAIT_MAX_SECONDS}` };
  if (flags.subject !== undefined && !isProofSubjectSha256(flags.subject)) return { error: "--subject needs 64 lowercase hex characters" };
  return { flags: { ...flags, timeout } };
}

export function runProofWait(argv, out = (line) => process.stdout.write(line), deps = {}) {
  const emit = (value, code) => { out(`${JSON.stringify({ schema: PROOF_WAIT_SCHEMA, ...value })}\n`); return code; };
  const parsed = parse(argv);
  if (parsed.error) return emit({ status: "refused", code: "PROOF-WAIT-ARGS", reason: parsed.error, repair: "pass the proofPath the signing step printed as --proof, with the project as --root" }, 2);
  let root;
  try { root = realpathSync(resolve(parsed.flags.root)); if (!statSync(root).isDirectory()) throw new Error("not a directory"); }
  catch { return emit({ status: "refused", code: "PROOF-WAIT-ROOT", reason: "--root is not a directory", repair: "pass the project root the signing step printed" }, 2); }
  const result = waitForSignedProof({ root, proof: parsed.flags.proof, timeoutSeconds: parsed.flags.timeout, subjectSha256: parsed.flags.subject ?? null, ...deps });
  return emit(result, result.status === "proof-present" ? 0 : 2);
}

if (isDirectInvocation(import.meta.url)) process.exitCode = runProofWait(process.argv.slice(2));
