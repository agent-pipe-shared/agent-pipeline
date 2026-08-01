#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureResumeHint, discardResumeHint, inspectResumeHint } from "../lib/resume-hint.mjs";

function value(args, flag) { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1] ?? null; }
function basis(args) {
  const featureId = value(args, "--feature-id"); const planSha256 = value(args, "--plan-sha256"); const specSha256 = value(args, "--spec-sha256");
  return [featureId, planSha256, specSha256].every((entry) => entry === null) ? null : { featureId, planSha256, specSha256 };
}
function main() {
  const [command, ...args] = process.argv.slice(2); const root = value(args, "--root");
  if (!root || !["inspect", "capture", "discard"].includes(command)) throw new Error("usage: resume-hint.mjs <inspect|capture|discard> --root <project> [--summary-file <file>] [--feature-id <id> --plan-sha256 <sha256> --spec-sha256 <sha256>");
  const rootDir = resolve(root); const observedBasis = basis(args);
  if (command === "inspect") return inspectResumeHint({ rootDir, basis: observedBasis });
  if (command === "discard") return discardResumeHint({ rootDir });
  const summaryFile = value(args, "--summary-file");
  if (!summaryFile) throw new Error("capture requires --summary-file");
  return captureResumeHint({ rootDir, summary: readFileSync(resolve(summaryFile), "utf8"), basis: observedBasis });
}
try { process.stdout.write(`${JSON.stringify(main())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
