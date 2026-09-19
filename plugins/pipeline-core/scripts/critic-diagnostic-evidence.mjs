#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { diagnosticPath, newDiagnosticPath, produceCriticDiagnostic } from "../lib/critic-diagnostic-evidence.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export function runCriticDiagnosticCli(argv) {
  const split = argv.indexOf("--");
  if (split < 0) throw new Error("Usage: critic-diagnostic-evidence --root ROOT --spec PATH --log evidence/LOG --out evidence/JSON [--candidate REF] [--guardrail PATH] [--full-verify PATH] [--pending ID] -- COMMAND ARGS");
  const options = { guardrailPaths: [], pending: [], command: argv.slice(split + 1) };
  let out;
  for (let i = 0; i < split; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (value === undefined || i + 1 === split) throw new Error("Missing argument value");
    if (flag === "--guardrail") options.guardrailPaths.push(value);
    else if (flag === "--pending") options.pending.push(value);
    else if (flag === "--out") out = value;
    else {
      const key = { "--root": "root", "--spec": "specPath", "--log": "logPath", "--candidate": "candidate", "--full-verify": "fullVerifyPath", "--label": "label" }[flag];
      if (!key || Object.hasOwn(options, key)) throw new Error("Unknown or duplicate argument");
      options[key] = value;
    }
  }
  diagnosticPath(out);
  if (!out.startsWith("evidence/") || out === options.logPath) throw new Error("Diagnostic output must be a separate evidence path");
  const target = newDiagnosticPath(options.root, out);
  const evidence = produceCriticDiagnostic(options);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  return { schema: "pipeline.critic-diagnostic-production.v1", path: out, fullVerify: evidence.fullVerify.status, targeted: evidence.targeted.status, releaseQualified: false };
}
if (isDirectInvocation(import.meta.url)) {
  try { console.log(JSON.stringify(runCriticDiagnosticCli(process.argv.slice(2)))); }
  catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
}
