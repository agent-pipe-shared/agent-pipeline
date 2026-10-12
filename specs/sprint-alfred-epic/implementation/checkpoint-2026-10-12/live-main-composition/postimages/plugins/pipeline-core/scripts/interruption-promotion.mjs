#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Agent-side AC-6 subject, signed-record, and status commands. */
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  checkInterruptionPromotion,
  readInterruptionPromotionSubject,
  recordInterruptionPromotion,
} from "../lib/interruption-promotion.mjs";

const USAGE = "Usage: interruption-promotion.mjs subject --root ROOT | record --root ROOT --request REQUEST_JSON --proof PROOF_JSON | status --root ROOT";

function parse(argv) {
  const [command, ...rest] = argv;
  if (!["subject", "record", "status"].includes(command)) return null;
  const result = { command, root: null, requestPath: null, proofPath: null };
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!["--root", "--request", "--proof"].includes(key) || seen.has(key) || i + 1 >= rest.length || rest[i + 1].startsWith("--")) return null;
    seen.add(key);
    result[key.slice(2) === "request" ? "requestPath" : key.slice(2) === "proof" ? "proofPath" : "root"] = rest[++i];
  }
  if (typeof result.root !== "string" || !result.root.trim()) return null;
  if (command === "record" && (!result.requestPath || !result.proofPath)) return null;
  if (command !== "record" && (result.requestPath || result.proofPath)) return null;
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const args = parse(argv);
  if (!args) {
    process.stderr.write(`${JSON.stringify({ schema: "pipeline.interruption-promotion-cli-result.v1", status: "rejected", code: "APR-CLI-SHAPE" })}\n`);
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const result = args.command === "subject"
    ? readInterruptionPromotionSubject({ root: args.root })
    : args.command === "record"
      ? recordInterruptionPromotion({ root: args.root, requestPath: args.requestPath, proofPath: args.proofPath })
      : checkInterruptionPromotion({ root: args.root });
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.interruption-promotion-cli-result.v1", ...result })}\n`);
  if (args.command === "status") return 0;
  return result.ok === false ? 2 : 0;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main(process.argv.slice(2));
