#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * One bounded, fresh initial-design Advisor consultation.
 *
 * The runner argument identifies the runner that is invoking this adapter; it
 * is not a model, role, receipt-path, or route override.  The coordinator
 * derives all of those from the governed package and the registered route.
 * Claude's existing host bridge uses its native route first and the ordinary
 * consult route only as its registered fallback; the other runners use their
 * registered ordinary consult route.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { coordinateDesignAdvisory } from "../lib/design-advisory-coordinator.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { runAdvisoryHostBridge } from "./advisory-host-bridge.mjs";

const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const USAGE = "usage: design-advisory-coordinator.mjs --repo-root <path> --runner <claude|codex|antigravity> --feature <id> --plan <repo-path> --spec <repo-path> --decision <accept|decline> --rationale-file <repo-path>";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || Object.hasOwn(values, key)) fail("DAC-CLI-USAGE", USAGE);
    values[key] = value;
  }
  const required = ["--repo-root", "--runner", "--feature", "--plan", "--spec", "--decision", "--rationale-file"];
  if (required.some((key) => !Object.hasOwn(values, key)) || Object.keys(values).some((key) => !required.includes(key))) fail("DAC-CLI-USAGE", USAGE);
  if (!["claude", "codex", "antigravity"].includes(values["--runner"]) || !["accept", "decline"].includes(values["--decision"]) || !PATH.test(values["--rationale-file"])) fail("DAC-CLI-USAGE", USAGE);
  return values;
}
function rationale(root, path) {
  const target = resolve(root, path);
  if (!target.startsWith(`${root}/`)) fail("DAC-CLI-RATIONALE", "rationale path escapes repository root");
  const value = readFileSync(target, "utf8");
  if (value.trim().length === 0 || value.length > 16 * 1024) fail("DAC-CLI-RATIONALE", "rationale is empty or oversized");
  return value;
}

export async function runDesignAdvisoryCoordinator(argv = process.argv.slice(2), dependencies = {}) {
  const values = parse(argv);
  const root = resolve(values["--repo-root"]);
  return coordinateDesignAdvisory({
    repoRoot: root,
    runtime: { runner: values["--runner"], profile: "feature" },
    featureId: values["--feature"],
    planPath: values["--plan"],
    specPath: values["--spec"],
    disposition: { decision: values["--decision"], rationale: rationale(root, values["--rationale-file"]) },
    invokeBridge: dependencies.invokeBridge ?? (({ inputPath, receiptPath }) => runAdvisoryHostBridge(
      ["--input", inputPath, "--receipt", receiptPath],
      { ...(dependencies.bridgeDependencies ?? {}), repoRoot: root },
    )),
  });
}

if (isDirectInvocation(import.meta.url)) {
  runDesignAdvisoryCoordinator().then(
    (result) => { process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status !== "admitted") process.exitCode = 2; },
    (error) => { process.stderr.write(`DESIGN-ADVISORY-COORDINATOR-FAILED: ${error.code ?? "error"}: ${error.message}\n`); process.exitCode = 2; },
  );
}
