#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Purpose: print the agentType a Codex Critic is spawned with on THIS machine (C22, AC-108): the role itself when the sandbox preflight receipt
// shows a usable sandbox, `default` (instruction-only protection) otherwise. Read-only; one JSON object on stdout; always exits 0.
// Usage: node codex-critic-launch-route.mjs --role critic|critic-high-risk [--receipt <absolute path of a codex-sandbox-preflight receipt>]
import { decideCodexCriticLaunchRoute } from "../lib/codex-critic-launch-route.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if ((flag !== "--role" && flag !== "--receipt") || index + 1 >= argv.length || Object.hasOwn(values, flag)) throw new Error("invalid arguments");
    values[flag] = argv[index + 1];
  }
  return { role: values["--role"], receiptPath: values["--receipt"] };
}

let route;
try { route = decideCodexCriticLaunchRoute(parseArgs(process.argv.slice(2))); }
catch { route = { agentType: "default", sandboxed: false, protection: "instruction-only", reason: "route-error" }; }
process.stdout.write(`${JSON.stringify(route)}\n`);
