// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { coordinateDesignAdvisory } from "./design-advisory-coordinator.mjs";
import { DESIGN_ADVISORY_RECORD_PATH } from "./design-advisory-enforcement.mjs";
import { runAdvisoryHostBridge } from "../scripts/advisory-host-bridge.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function root() {
  const value = mkdtempSync(join(tmpdir(), "design-advisor-coordinator-"));
  execFileSync("git", ["init", "-q"], { cwd: value });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: value });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: value });
  mkdirSync(join(value, "project"), { recursive: true });
  mkdirSync(join(value, "specs", "feature-1"), { recursive: true });
  writeFileSync(join(value, "specs", "feature-1", "prd.md"), "# Initial plan\n\nKeep the boundary closed.\n");
  writeFileSync(join(value, "specs", "feature-1", "spec.md"), "# Specification\n\nAdd an independent check.\n");
  execFileSync("git", ["add", "."], { cwd: value });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: value });
  return value;
}
function fixtureReceipt(input, { status = "answered", forge = null } = {}) {
  const route = { runner: input.runner, selector: { kind: "model-id", value: input.runner === "claude" ? "claude-sonnet" : input.runner === "antigravity" ? "gemini-3-flash" : "gpt-5.6-sol" }, effort: "high" };
  const identity = status === "answered" ? { provider: input.runner === "claude" ? "anthropic" : input.runner === "antigravity" ? "google" : "openai", modelId: route.selector.value, effort: "high" } : null;
  const result = {
    schema: "pipeline.advisory-receipt.v1",
    receiptId: input.receiptId,
    dispatch: structuredClone(input.dispatch),
    duty: "advisory",
    profile: input.profile,
    configuredRoute: route,
    adapter: "consult",
    observed: { status, identity },
    questionSha256: sha(input.question),
    answerSha256: status === "answered" ? sha("Use a bounded review.") : null,
    fallback: status === "answered" ? { reason: "none", redactedErrorClass: null } : { reason: "consult-unavailable", redactedErrorClass: "unavailable" },
    emittedAtMs: 1,
  };
  return forge ? forge(result) : result;
}
function bridge(options = {}) {
  return async ({ receiptPath, input }) => {
    writeFileSync(receiptPath, `${JSON.stringify(fixtureReceipt(input, options))}\n`, { mode: 0o600 });
    if (typeof options.afterWrite === "function") options.afterWrite(input);
    return options.status === "answered" || options.status === undefined ? 0 : 2;
  };
}
function args(value, extra = {}) {
  return {
    repoRoot: value,
    runtime: { runner: "codex", profile: "feature" },
    featureId: "feature-1",
    planPath: "specs/feature-1/prd.md",
    specPath: "specs/feature-1/spec.md",
    disposition: { decision: "accept", rationale: "The independent suggestion is bounded and appropriate." },
    invokeBridge: bridge(),
    ...extra,
  };
}

test("coordinates an immutable package-derived receipt through durable admission readback", async () => {
  const value = root();
  try {
    const result = await coordinateDesignAdvisory(args(value));
    assert.equal(result.status, "admitted");
    assert.match(result.binding.receiptId, /^design-advisor-[a-f0-9]{64}$/u);
    assert.equal(result.readback.mode, "consulted");
    const record = JSON.parse(readFileSync(join(value, DESIGN_ADVISORY_RECORD_PATH), "utf8"));
    assert.equal(record.admission.elephant.decision, "accept");
    assert.equal(record.admission.workflow.candidateCommit, git(value, ["rev-parse", "HEAD"]));
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("the production bridge accepts only the coordinator-derived receipt target", async () => {
  const value = root();
  try {
    const result = await coordinateDesignAdvisory(args(value, {
      runtime: { runner: "claude", profile: "feature" },
      invokeBridge: ({ inputPath, receiptPath }) => runAdvisoryHostBridge(
        ["--input", inputPath, "--receipt", receiptPath],
        {
          repoRoot: value,
          preflightRoleDispatch: () => ({ status: "prepared" }),
          makeHostAdapter: () => async (payload) => ({
            status: "answered",
            answer: "Check the binding independently.",
            identity: { provider: "anthropic", modelId: payload.selector.value, effort: payload.effort },
          }),
        },
      ),
    }));
    assert.equal(result.status, "admitted");
    assert.match(result.binding.receiptId, /^design-advisor-[a-f0-9]{64}$/u);
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("a native-capable Claude session retains its failed-native then answered-consult route", async () => {
  const value = root();
  try {
    let nativeCalls = 0;
    let consultCalls = 0;
    const result = await coordinateDesignAdvisory(args(value, {
      runtime: { runner: "claude", profile: "feature" },
      invokeBridge: ({ inputPath, receiptPath }) => runAdvisoryHostBridge(
        ["--input", inputPath, "--receipt", receiptPath],
        {
          repoRoot: value,
          preflightRoleDispatch: () => ({ status: "prepared" }),
          makeHostAdapter: () => async (payload) => {
            if (payload.role === "native-advisor") {
              nativeCalls += 1;
              return { status: "unavailable" };
            }
            consultCalls += 1;
            return { status: "answered", answer: "Use the bounded consult fallback.",
              identity: { provider: "anthropic", modelId: payload.selector.value, effort: payload.effort } };
          },
        },
      ),
    }));
    assert.equal(result.status, "admitted");
    assert.equal(nativeCalls, 2);
    assert.equal(consultCalls, 1);
    const record = JSON.parse(readFileSync(join(value, DESIGN_ADVISORY_RECORD_PATH), "utf8"));
    assert.equal(record.admission.nativeAvailable, true);
    assert.equal(record.admission.advisor.route, "generic-consult");
    assert.equal(record.admission.advisorReceipt.fallback.reason, "native-unavailable");
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("the production bridge rejects a substituted receipt identity before adapter launch", async () => {
  const value = root();
  try {
    let adapterCalls = 0;
    await assert.rejects(coordinateDesignAdvisory(args(value, {
      runtime: { runner: "claude", profile: "feature" },
      invokeBridge: ({ inputPath, receiptPath, input }) => {
        input.receiptId = `design-advisor-${"0".repeat(64)}`;
        writeFileSync(inputPath, JSON.stringify(input), { mode: 0o600 });
        return runAdvisoryHostBridge(
          ["--input", inputPath, "--receipt", receiptPath],
          {
            repoRoot: value,
            preflightRoleDispatch: () => ({ status: "prepared" }),
            makeHostAdapter: () => async () => { adapterCalls += 1; return { status: "answered" }; },
          },
        );
      },
    })), (error) => error.code === "ADVISORY-DESIGN-BINDING");
    assert.equal(adapterCalls, 0);
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("rejects a forged bridge receipt before public admission", async () => {
  const value = root();
  try {
    await assert.rejects(
      coordinateDesignAdvisory(args(value, { invokeBridge: bridge({ forge: (receipt) => ({ ...receipt, dispatch: { ...receipt.dispatch, candidateTree: "0".repeat(40) } }) }) })),
      (error) => error.code === "DAC-RECEIPT-BINDING",
    );
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("rejects package drift which occurs while the Advisor is running", async () => {
  const value = root();
  try {
    await assert.rejects(
      coordinateDesignAdvisory(args(value, { invokeBridge: bridge({ afterWrite: () => writeFileSync(join(value, "specs", "feature-1", "prd.md"), "# changed\n") }) })),
      (error) => error.code === "DAC-PACKAGE-DRIFT",
    );
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("does not admit an answered receipt without an Elephant disposition", async () => {
  const value = root();
  try {
    await assert.rejects(coordinateDesignAdvisory(args(value, { disposition: null })), (error) => error.code === "DAC-DISPOSITION");
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("a failing bridge without a physical route trail cannot propose an unavailable exception", async () => {
  const value = root();
  try {
    await assert.rejects(
      coordinateDesignAdvisory(args(value, { invokeBridge: bridge({ status: "unavailable" }) })),
      (error) => error.code === "DAC-ATTEMPT-TRAIL-MISSING",
    );
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("exhausted Claude routes produce a pending exception input, never a public admission", async () => {
  const value = root();
  try {
    let nativeCalls = 0;
    let consultCalls = 0;
    const result = await coordinateDesignAdvisory(args(value, {
      runtime: { runner: "claude", profile: "feature" },
      invokeBridge: ({ inputPath, receiptPath }) => runAdvisoryHostBridge(
        ["--input", inputPath, "--receipt", receiptPath],
        { repoRoot: value, preflightRoleDispatch: () => ({ status: "prepared" }),
          makeHostAdapter: () => async (payload) => {
            if (payload.role === "native-advisor") nativeCalls += 1;
            else consultCalls += 1;
            return { status: "unavailable" };
          } },
      ),
    }));
    assert.equal(result.status, "unavailable-pending-final-approval");
    assert.equal(nativeCalls, 2);
    assert.equal(consultCalls, 1);
    assert.equal(result.attemptTrail.attempts, 3);
    assert.match(result.attemptTrail.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.write, null);
    assert.equal(result.readback, null);
    assert.equal(existsSync(join(value, DESIGN_ADVISORY_RECORD_PATH)), false);
  } finally { rmSync(value, { recursive: true, force: true }); }
});
