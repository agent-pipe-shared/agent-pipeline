#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { TICKET_SCHEMA, canonicalJson, issueLaunchTicket } from "../lib/codex-onboarding-runtime.mjs";

function parse(argv) {
  if (argv.length !== 5 || argv[0] !== "--root" || argv[2] !== "--barrier-sha256" || argv[4] !== "--activate"
    || !/^[a-f0-9]{64}$/u.test(argv[3])) throw new Error("Usage: codex-onboarding-launch.mjs --root <project-root> --barrier-sha256 <sha256> --activate");
  return { rootDir: argv[1], barrierSha256: argv[3] };
}
export function main(argv = process.argv.slice(2), { spawn = spawnSync, write = process.stdout.write.bind(process.stdout) } = {}) {
  try {
    const options = parse(argv);
    const issued = issueLaunchTicket(options);
    const result = spawn(issued.executable, ["-C", options.rootDir, "pipeline-core:pipeline-start"], {
      cwd: options.rootDir, shell: false, stdio: "inherit",
      env: {
        ...process.env,
        PIPELINE_CODEX_ONBOARDING_TICKET_ID: issued.ticketId,
        PIPELINE_CODEX_ONBOARDING_TOKEN: issued.token.toString("hex"),
      },
    });
    // The token is never included in output, state, diagnostics, or a child
    // argument. A load failure leaves the issued ticket unconsumed.
    write(`${canonicalJson({ schema: TICKET_SCHEMA, status: result?.status === 0 ? "launched" : "launch-unavailable", ticketId: issued.ticketId })}\n`);
    return result?.status === 0 ? 0 : 2;
  } catch {
    write(`${canonicalJson({ schema: TICKET_SCHEMA, status: "launch-unavailable" })}\n`);
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
