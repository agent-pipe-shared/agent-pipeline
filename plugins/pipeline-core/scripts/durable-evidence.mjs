#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Durable audit mirror (Candidate 20, G20-29). Two verbs, one closed shape each:
 *   durable-evidence.mjs sync  --root <absolute project root>   mirror completed dispatches, the work-verify result and the approval
 *                                                               proof references into tracked audit/ files plus audit/index.json
 *   durable-evidence.mjs check --root <absolute project root>   read-only: does this tree (a fresh clone included) reach every record
 * Both print one JSON object on stdout. A finding or a refusal exits 2 and prints `CODE: message; repair: <runnable command>` on stderr.
 * `sync` writes only under audit/ and never overwrites an existing entry; commit the result with the ordinary exact-path route.
 */
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { checkDurableEvidence, syncDurableEvidence } from "../lib/durable-evidence.mjs";

const USAGE = "usage: durable-evidence.mjs (sync|check) --root <absolute project root>";

export function parseArgs(argv) {
  if (argv.length !== 3 || !["sync", "check"].includes(argv[0]) || argv[1] !== "--root" || !argv[2]) {
    const error = new Error(USAGE); error.code = "usage"; throw error;
  }
  return { verb: argv[0], root: resolve(argv[2]) };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const { verb, root } = parseArgs(process.argv.slice(2));
    if (verb === "sync") {
      process.stdout.write(`${JSON.stringify(syncDurableEvidence({ root }))}\n`);
    } else {
      const result = checkDurableEvidence({ root });
      process.stdout.write(`${JSON.stringify({ ok: result.ok, findings: result.findings, entries: result.entries.length })}\n`);
      for (const finding of result.findings) process.stderr.write(`${finding.code}: ${finding.message}; repair: ${finding.repair}\n`);
      if (!result.ok) process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error.code === "usage" ? "" : `${error.code ?? "DURABLE-EVIDENCE-FAILED"}: `}${error.message}\n`);
    process.exitCode = 2;
  }
}
