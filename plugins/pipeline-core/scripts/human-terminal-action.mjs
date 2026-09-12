#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  inspectHumanTerminalAction,
  prepareHumanTerminalAction,
  runHumanTerminalAction,
} from "../lib/human-terminal-action-instance.mjs";

function flags(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) return null;
    parsed[argv[index].slice(2)] = argv[index + 1];
  }
  return parsed;
}

export function main(argv = process.argv.slice(2), io = {}) {
  const write = io.write ?? process.stdout.write.bind(process.stdout);
  const writeError = io.writeError ?? process.stderr.write.bind(process.stderr);
  const [command, ...rest] = argv;
  const parsed = flags(rest);
  if (!parsed) {
    writeError("HTA-USAGE: malformed flags\n");
    return 2;
  }
  let result;
  if (command === "prepare") {
    if (!parsed.root || !parsed.template || !parsed.runner || !parsed.values || Object.keys(parsed).some((key) => !["root", "template", "runner", "values"].includes(key))) {
      writeError("HTA-USAGE: prepare --root <repo> --template <id> --runner <runner> --values <json>\n");
      return 2;
    }
    let values;
    try { values = JSON.parse(readFileSync(parsed.values, "utf8")); }
    catch (error) { writeError(`HTA-VALUES-UNREADABLE: ${error.message}\n`); return 2; }
    result = prepareHumanTerminalAction({ rootDir: parsed.root, templateId: parsed.template, runner: parsed.runner, platform: "posix", values });
  } else if (command === "inspect" || command === "run") {
    if (!parsed.request || !parsed["request-sha256"] || Object.keys(parsed).some((key) => !["request", "request-sha256"].includes(key))) {
      writeError(`HTA-USAGE: ${command} --request <request.json> --request-sha256 <sha256>\n`);
      return 2;
    }
    const input = { requestPath: parsed.request, requestSha256: parsed["request-sha256"] };
    result = command === "inspect" ? inspectHumanTerminalAction(input) : runHumanTerminalAction(input);
  } else {
    writeError("HTA-USAGE: expected prepare, inspect or run\n");
    return 2;
  }
  write(`${JSON.stringify(result, null, 2)}\n`);
  return ["prepared", "inspected", "completed"].includes(result.status) ? 0 : 2;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
