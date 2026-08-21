#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Translate provider-neutral stop suggestions into Antigravity Stop decisions. */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STOP_SUGGEST = fileURLToPath(new URL("./stop-suggest.mjs", import.meta.url));

let rawInput = "";
try {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  await new Promise((resolveEnd) => process.stdin.on("end", resolveEnd));
  rawInput = Buffer.concat(chunks).toString("utf8");
} catch {
  // Fail-open: empty input is allowed
}

let input = {};
try {
  if (rawInput.trim() !== "") input = JSON.parse(rawInput);
} catch {
  // Fail-open on non-JSON
}

let projectRoot;
try {
  const rawCwd = (Array.isArray(input?.workspacePaths) && input.workspacePaths.length > 0)
    ? input.workspacePaths[0]
    : (typeof input?.cwd === "string" && input.cwd.trim() !== "" ? input.cwd : process.cwd());
  projectRoot = realpathSync(resolve(rawCwd));
} catch {
  projectRoot = process.cwd();
}

try {
  const result = spawnSync(process.execPath, [STOP_SUGGEST], {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: "utf8",
    input: rawInput,
    timeout: 8_000,
  });

  const output = String(result.stdout ?? "").trim();
  if (output !== "") {
    process.stderr.write(`[pipeline-stop-suggest]\n${output}\n`);
  }
} catch {
  // Fail-open
}

// In Antigravity, Stop hook outputs {} to allow regular termination
process.stdout.write(JSON.stringify({}) + "\n");
process.exit(0);
