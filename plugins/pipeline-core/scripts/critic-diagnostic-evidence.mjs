#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { diagnosticEvidenceLocation, diagnosticPath, newDiagnosticPath } from "../lib/critic-diagnostic-evidence.mjs";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export function runCriticDiagnosticCli(argv) {
  const split = argv.indexOf("--");
  if (split < 0) throw new Error("Usage: critic-diagnostic-evidence --root ROOT --spec PATH --log evidence/LOG --out evidence/JSON [--candidate REF] [--base REF] [--guardrail PATH] [--full-verify PATH] [--pending ID] -- COMMAND ARGS");
  const options = { guardrailPaths: [], pending: [], command: argv.slice(split + 1) };
  let out;
  for (let i = 0; i < split; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (value === undefined || i + 1 === split) throw new Error("Missing argument value");
    if (flag === "--guardrail") options.guardrailPaths.push(value);
    else if (flag === "--pending") options.pending.push(value);
    else if (flag === "--out") out = value;
    else {
      const key = { "--root": "root", "--spec": "specPath", "--log": "logPath", "--candidate": "candidate", "--base": "baseRef","--full-verify": "fullVerifyPath", "--label": "label" }[flag];
      if (!key || Object.hasOwn(options, key)) throw new Error("Unknown or duplicate argument");
      options[key] = value;
    }
  }
  diagnosticPath(out);
  if (diagnosticEvidenceLocation(out) === null || out === options.logPath) throw new Error("Diagnostic output must be a separate evidence path");
  const target = newDiagnosticPath(options.root, out);
  const evidence = produceCriticDiagnostic(options);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  return { schema: "pipeline.critic-diagnostic-production.v1", path: out, fullVerify: evidence.fullVerify.status, targeted: evidence.targeted.status, releaseQualified: false };
}
export const CRITIC_DIAGNOSTIC_EVIDENCE_HELP = [
  "critic-diagnostic-evidence.mjs --root ROOT --spec PATH --log evidence/LOG --out evidence/JSON [--candidate REF] [--guardrail PATH] [--full-verify PATH] [--pending ID] -- COMMAND ARGS",
  "",
  "Evidence route (run in this order):",
  "  1. Produce the diagnostic with scripts/critic-diagnostic-evidence.mjs (this script).",
  "  2. Register it WITHOUT committing first (registration reads the working tree): register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>",
  "  3. Commit the artifact, its log and the manifest the registration names in ONE evidence-only commit (the only form the admission accepts).",
  "  4. Rerun critic-dispatch-preflight.mjs with --registration-commit <that commit>.",
  "  5. If the range contains the handover file or a retained Critic result, first run critic-correction-input-bindings.mjs derive --root <root> --base <base> --head <candidate> --out <file under scratch/> and pass that file as --correction-input-bindings <file> (admit and finalize: review.correctionInputBindings, same value).",
  "",
].join("\n");
if (isDirectInvocation(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === "--help") { process.stdout.write(CRITIC_DIAGNOSTIC_EVIDENCE_HELP); process.exit(0); }
  try { console.log(JSON.stringify(runCriticDiagnosticCli(process.argv.slice(2)))); }
  catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
}
