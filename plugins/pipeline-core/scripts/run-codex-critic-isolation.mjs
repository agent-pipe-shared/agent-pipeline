#!/usr/bin/env node
/** Local host entry point for the approved Codex Critic isolation acceptance run. */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildExactFixture, runCodexCritic } from "./codex-critic-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DEFAULT_ARTIFACTS = Object.freeze([
  "plugins/pipeline-core/scripts/codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/codex-critic-isolation.test.mjs",
  "plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs",
  "plugins/pipeline-core/scripts/critic-verdict.schema.json",
  "harness/scripts/verify.mjs",
]);

function usage(stream = process.stdout) {
  stream.write("Usage: node plugins/pipeline-core/scripts/run-codex-critic-isolation.mjs --commit <40-hex-sha>\n");
}

export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--commit" || !/^[0-9a-f]{40}$/u.test(argv[1])) {
    throw new Error("--commit requires an exact 40-hex SHA");
  }
  return { help: false, commit: argv[1] };
}

export async function run({ commit, repoRoot = root } = {}) {
  const fixture = await buildExactFixture({ repoRoot, candidateCommit: commit, artifactPaths: DEFAULT_ARTIFACTS });
  try {
    const result = await runCodexCritic({ fixture });
    return Object.freeze({ ok: result.ok, envelope: result.envelope, reason: result.reason });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) usage();
    else {
      const result = await run({ commit: args.commit });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.ok ? 0 : 2;
    }
  } catch (error) {
    process.stderr.write(`codex-critic-isolation: ${error.message}\n`);
    usage(process.stderr);
    process.exitCode = 1;
  }
}
