// SPDX-License-Identifier: SUL-1.0
// Runs the full po-approval-proof test suite and writes its own unedited
// stdout/stderr + exit code to verify-log.txt, next to this script.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const target = "plugins/pipeline-core/lib/po-approval-proof.test.mjs";
const command = `node --test ${target}`;

const result = spawnSync("node", ["--test", target], { cwd: repoRoot, encoding: "utf8" });

const log = [
  `command: ${command}`,
  `cwd: ${repoRoot}`,
  `exitCode: ${result.status}`,
  "--- stdout ---",
  result.stdout ?? "",
  "--- stderr ---",
  result.stderr ?? "",
].join("\n");

writeFileSync(join(here, "verify-log.txt"), log);
process.stdout.write(`wrote verify-log.txt; exitCode=${result.status}\n`);
process.exitCode = result.status ?? 1;
