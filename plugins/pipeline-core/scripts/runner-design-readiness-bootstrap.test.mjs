#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  invokeRunnerReadinessChild,
  parseAntigravityReadinessStream,
  runRunnerDesignReadinessBootstrap,
} from "./runner-design-readiness-bootstrap.mjs";
import { verifyDesignReadinessHostExecution } from "../lib/design-readiness-host-evidence.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
const MODEL = "gpt-6-luna";

function report({ runner, dispatchId, candidate, sources }) {
  return {
    schema: "pipeline.design-readiness-receipt.v1",
    dispatchId,
    runner,
    candidate,
    sources,
    outcome: "ready-for-po-review",
    findings: [],
    unresolvedChoices: [],
    summary: "The five committed design sources are ready for PO review.",
  };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function makeRepository(t, { consent = "approved" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "runner-design-readiness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Readiness Fixture");
  git(root, "config", "user.email", "readiness@example.invalid");
  mkdirSync(join(root, "specs", "feature"), { recursive: true });
  mkdirSync(join(root, "evidence", "design"), { recursive: true });
  const config = readFileSync(new URL("../../../pipeline.user.yaml", import.meta.url), "utf8")
    .replace('consent: "approved"', `consent: "${consent}"`);
  writeFileSync(join(root, "pipeline.user.yaml"), config);
  const sources = Object.fromEntries(NAMES.map((name) => {
    const path = `specs/feature/${name}.md`;
    const bytes = Buffer.from(`# ${name}\nCommitted fixture source.\n`, "utf8");
    writeFileSync(join(root, path), bytes);
    return [name, { path, bytes }];
  }));
  git(root, "add", "pipeline.user.yaml", "specs/feature");
  git(root, "-c", "user.name=Readiness Fixture", "-c", "user.email=readiness@example.invalid", "commit", "-qm", "fixture");
  return { root, sources, receiptPath: "evidence/design/readiness.json" };
}

function bootstrapArgs(fx, runner = "claude") {
  return ["--runner", runner, "--repo-root", fx.root, "--dispatch-id", `readiness-${runner}-1`,
    "--queue-revision", "7", "--receipt", fx.receiptPath,
    ...NAMES.flatMap((name) => ["--source", name, fx.sources[name].path])];
}

function dependencies(fx, runner = "claude", { invoke, mutateSource } = {}) {
  const repoFingerprint = "a".repeat(64);
  const routeModel = runner === "claude" ? "opus" : "gemini-3.8-flash-high";
  const route = ({ candidateCommit }) => ({ dutyId: "readiness", runner, state: "default", model: routeModel,
    effort: "high", sourceSha256: "b".repeat(64), candidateCommit });
  return {
    requireProjectOnboardingReadyFn: () => {},
    resolveExecutableFn: () => process.execPath,
    resolveTopologyFn: () => ({ gitCommonDir: join(fx.root, ".git"), primaryRoot: fx.root }),
    deriveRepositoryFingerprintFn: () => repoFingerprint,
    resolveRouteFn: route,
    invokeRunnerFn(input) {
      if (mutateSource) mutateSource();
      const value = report({ runner, dispatchId: "readiness-" + runner + "-1", candidate: input.expected.candidate, sources: input.expected.sources });
      return invoke ? invoke({ input, value }) : { ok: true, report: value, stdout: "fixture-runner-output", childStarted: true,
        childClosed: true, writeToolsObserved: false };
    },
  };
}

test("Claude and Antigravity invocations keep source content out of stdin and disable or bound tool access", () => {
  for (const runner of ["claude", "antigravity"]) {
    const prompt = "private source prompt";
    const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
    const sources = Object.fromEntries(NAMES.map((name) => [name, { path: `spec/${name}.md`, sha256: "e".repeat(64) }]));
    const value = report({ runner, dispatchId: "dispatch-1", candidate, sources });
    let observed;
    const child = runner === "claude"
      ? { status: 0, signal: null, stdout: JSON.stringify({ type: "result", is_error: false, structured_output: value }), stderr: "" }
      : { status: 0, signal: null, stdout: [
          { event: "init", conversation_id: "conversation-1", init: { model: "gemini-3.8-flash-high" } },
          { event: "step_update", step_update: { text_delta: "reviewing supplied text" } },
          { event: "result", result: { conversation_id: "conversation-1", status: "SUCCESS", response: JSON.stringify(value) } },
        ].map((event) => JSON.stringify(event)).join("\n"), stderr: "" };
    const result = invokeRunnerReadinessChild({ runner, executable: "/fixture/runner", model: runner === "claude" ? "opus" : "gemini-3.8-flash-high",
      effort: "high", prompt, schema: { type: "object" }, cwd: "/tmp/readiness-empty", expected: { runner, dispatchId: "dispatch-1", candidate, sources },
      spawnFn(executable, argv, options) { observed = { executable, argv, options }; return child; } });
    assert.equal(result.ok, true, runner);
    assert.equal(result.writeToolsObserved, false, runner);
    assert.equal(observed.options.shell, false);
    assert.equal(observed.options.cwd, "/tmp/readiness-empty");
    assert.equal(observed.options.input, prompt, "the complete prompt is sent once through the bounded stdin pipe");
    if (runner === "claude") {
      assert.ok(!observed.argv.includes(prompt), "private source text is not exposed in process arguments");
      assert.ok(observed.argv.includes("--input-format") && observed.argv[observed.argv.indexOf("--input-format") + 1] === "text");
      assert.ok(observed.argv.includes("--restricted"));
      assert.ok(observed.argv.includes("--strict-mcp-config"));
      assert.ok(observed.argv.includes("--permission-mode") && observed.argv.includes("plan"));
      assert.ok(observed.argv.includes("--tools") && observed.argv[observed.argv.indexOf("--tools") + 1] === "");
    } else {
      assert.ok(observed.argv.includes("--sandbox"));
      assert.ok(observed.argv.includes("--mode") && observed.argv[observed.argv.indexOf("--mode") + 1] === "plan");
      assert.ok(observed.argv.at(-1) === "--print");
      assert.ok(observed.argv.includes("--input-format") && observed.argv[observed.argv.indexOf("--input-format") + 1] === "text");
      assert.ok(!observed.argv.some((argument) => argument.includes(prompt)), "private source text is not exposed in process arguments");
      assert.ok(!observed.argv.includes("--add-dir"));
    }
  }
});

test("Antigravity stream rejects tool-bearing and incomplete executions", () => {
  const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const sources = Object.fromEntries(NAMES.map((name) => [name, { path: `spec/${name}.md`, sha256: "e".repeat(64) }]));
  const expected = { model: "gemini-3.8-flash-high", dispatchId: "dispatch-1", candidate, sources };
  const make = (steps = []) => [
    { event: "init", conversation_id: "conversation-1", init: { model: expected.model } },
    ...steps,
    { event: "result", result: { conversation_id: "conversation-1", status: "SUCCESS",
      response: JSON.stringify(report({ runner: "antigravity", dispatchId: expected.dispatchId, candidate, sources })) } },
  ].map((event) => JSON.stringify(event)).join("\n");
  assert.throws(() => parseAntigravityReadinessStream(make([{ event: "step_update", step_update: { command: "cat /etc/passwd" } }]), expected), /tool operation/u);
  assert.throws(() => parseAntigravityReadinessStream(make().split("\n").slice(0, 1).join("\n"), expected), /incomplete/u);
  assert.throws(() => parseAntigravityReadinessStream(make(), { ...expected, model: "unapproved-model" }), /requested model/u);
});

test("Claude and Antigravity bootstraps publish host-observed receipts bound to committed sources", async (t) => {
  for (const runner of ["claude", "antigravity"]) {
    const fx = makeRepository(t);
    const deps = dependencies(fx, runner);
    const result = await runRunnerDesignReadinessBootstrap(bootstrapArgs(fx, runner), deps);
    assert.equal(result.ok, true, runner);
    const receipt = JSON.parse(readFileSync(join(fx.root, fx.receiptPath), "utf8"));
    assert.equal(receipt.runner, runner);
    assert.equal(receipt.hostExecution.route.candidateCommit, receipt.candidate.commit);
    assert.deepEqual(Object.keys(receipt.hostExecution.route).sort(), ["candidateCommit", "effort", "model", "sourceSha256"]);
    const sourceBytes = Object.fromEntries(NAMES.map((name) => [name, { path: fx.sources[name].path, bytes: fx.sources[name].bytes }]));
    const verification = verifyDesignReadinessHostExecution({ repoRoot: fx.root, hostExecution: receipt.hostExecution,
      readinessReceipt: receipt, candidate: receipt.candidate, sources: receipt.sources, sourceBytes,
      resolveTopology: () => ({ gitCommonDir: join(fx.root, ".git"), primaryRoot: fx.root }),
      deriveRepositoryFingerprint: () => "a".repeat(64),
      resolveRoute: ({ candidateCommit }) => ({ ...deps.resolveRouteFn({ candidateCommit }), state: "default" }),
    });
    assert.equal(verification.ok, true, runner);
    assert.equal(verification.assurance, "host-observed-local", runner);
  }
});

test("declined export stops before route, executable resolution, or runner launch", async (t) => {
  const fx = makeRepository(t, { consent: "declined" });
  let touched = false;
  const deps = {
    resolveRouteFn() { touched = true; throw new Error("route must not be resolved after declined export"); },
    resolveExecutableFn() { touched = true; throw new Error("runner must not be resolved after declined export"); },
    invokeRunnerFn() { touched = true; throw new Error("runner must not be invoked after declined export"); },
  };
  await assert.rejects(() => runRunnerDesignReadinessBootstrap(bootstrapArgs(fx), deps), /provider export is not enabled/u);
  assert.equal(touched, false);
  assert.equal(existsSync(join(fx.root, fx.receiptPath)), false, "no public receipt was created");
});

test("source drift during the child run prevents publishing a readiness receipt", async (t) => {
  const fx = makeRepository(t);
  const deps = dependencies(fx, "claude", { mutateSource() {
    writeFileSync(join(fx.root, fx.sources.design.path), "# altered after dispatch\n");
  } });
  await assert.rejects(() => runRunnerDesignReadinessBootstrap(bootstrapArgs(fx), deps), /differs from the selected Git candidate/u);
  assert.throws(() => readFileSync(join(fx.root, fx.receiptPath)), { code: "ENOENT" });
});
