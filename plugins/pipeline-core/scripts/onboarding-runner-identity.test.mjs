#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The consumer chain must never substitute a runner (ADR-0051, ADR-0057 R1).
 *
 * This walks the onboarding exactly as a consumer does: start from `inspect` with an
 * explicit runner, then execute each returned `nextAction.argv` VERBATIM, the way the
 * pipeline-start skill instructs ("execute the exact returned action"). The defect
 * this guards against was found by doing precisely that and watching a Claude session
 * end up with `runners.default: "codex"` and "required Codex runtime targets are
 * absent" — with every step exiting 0 and returning well-formed JSON.
 *
 * Asserting on a single call would not have caught it: `inspect` reported the right
 * runner all along. The identity was lost between steps.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "project-onboarding-v3.mjs");
const MAX_STEPS = 8;
const roots = [];

function repo() {
  const base = mkdtempSync(join(tmpdir(), "onboarding-runner-identity-"));
  roots.push(base);
  const git = (...args) => spawnSync("git", args, { cwd: base, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=fixture@example.invalid", "-c", "user.name=Fixture", "commit", "-q", "--allow-empty", "-m", "init");
  return base;
}

function run(argv, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...argv], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* reported by the caller */ }
  return { ...result, json: parsed };
}

/** Execute each returned action verbatim, collecting the runner each step reports. */
function walk(root, runner, intent = "bootstrap") {
  let argv = ["inspect", "--root", root, "--intent", intent, "--runner", runner];
  const steps = [];
  for (let index = 0; index < MAX_STEPS; index += 1) {
    const { json, stdout, stderr } = run(argv, { CLAUDECODE: "1" });
    assert.ok(json, `step ${index} (${argv[0]}) did not emit JSON: ${stdout}${stderr}`);
    steps.push({ command: argv[0], runner: json.runner, status: json.status });
    const next = json.nextAction;
    if (!next || !Array.isArray(next.argv) || !next.argv[0].endsWith("project-onboarding-v3.mjs")) break;
    argv = next.argv.slice(1);
  }
  return steps;
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

try {
  for (const runner of ["claude", "codex"]) {
    check(`ORI01 ${runner}: the identity survives every step of the consumer chain`, () => {
      const steps = walk(repo(), runner);
      assert.ok(steps.length >= 3, `chain ended after ${steps.length} step(s): ${JSON.stringify(steps)}`);
      for (const step of steps) {
        assert.equal(step.runner, runner, `${step.command} reported runner ${step.runner}: ${JSON.stringify(steps)}`);
      }
    });

    check(`ORI02 ${runner}: the seeded project declares the runner it was onboarded with`, () => {
      const root = repo();
      walk(root, runner);
      const source = join(root, "pipeline.user.yaml");
      assert.ok(existsSync(source), "the chain never seeded pipeline.user.yaml");
      const declared = readFileSync(source, "utf8")
        .split("\n").map((line) => line.trim())
        .find((line) => line.startsWith("default:"));
      assert.equal(declared, `default: "${runner}"`, `seeded ${declared}`);
    });

    check(`ORI03 ${runner}: every emitted next action carries the identity forward`, () => {
      const { json } = run(["inspect", "--root", repo(), "--intent", "bootstrap", "--runner", runner], { CLAUDECODE: "1" });
      const argv = json?.nextAction?.argv ?? [];
      assert.ok(argv.includes("--runner"), `nextAction argv has no --runner: ${JSON.stringify(argv)}`);
      assert.equal(argv[argv.indexOf("--runner") + 1], runner);
    });
  }

  check("ORI04 the runner flag is honoured, not merely accepted", () => {
    // The original defect: `plan` parsed --runner and discarded it, returning codex
    // for either value. Asserting both directions is what makes that visible.
    const root = repo();
    run(["inspect", "--root", root, "--intent", "bootstrap", "--runner", "claude"], { CLAUDECODE: "1" });
    const claude = run(["plan", "--root", root, "--runner", "claude", "--intent", "bootstrap"], { CLAUDECODE: "1" });
    const codex = run(["plan", "--root", root, "--runner", "codex", "--intent", "bootstrap"], { CLAUDECODE: "1" });
    assert.equal(claude.json?.runner, "claude");
    assert.equal(codex.json?.runner, "codex");
  });

  check("ORI05 an environment marker never overrides the explicit flag", () => {
    // CLAUDECODE=1 while asking for codex must still answer codex: the flag is the
    // authority, the environment is not (the F-A finding, same class).
    const { json } = run(["inspect", "--root", repo(), "--intent", "bootstrap", "--runner", "codex"], { CLAUDECODE: "1" });
    assert.equal(json?.runner, "codex");
  });

  console.log(`\nonboarding-runner-identity: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
