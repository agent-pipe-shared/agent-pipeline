// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeDesignAdvisoryTransaction } from "../lib/design-advisory-transaction.mjs";
import { runDesignAdvisoryAdmission } from "./design-advisory-admission.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const planPath = "specs/feature-1/prd.md";
const specPath = "specs/feature-1/spec.md";
function fixture(t, status) {
  const root = mkdtempSync(join(tmpdir(), "advisor-admission-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q"]);
  mkdirSync(join(root, "project"));
  mkdirSync(join(root, "specs", "feature-1"), { recursive: true });
  mkdirSync(join(root, ".git", "agent-pipeline", "design-advisory-receipts"), { recursive: true });
  writeFileSync(join(root, planPath), "# Plan\n");
  writeFileSync(join(root, specPath), "# Spec\n");
  const receipt = {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-1",
    dispatch: { dispatchId: "design-1", queueRevision: 0,
      candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40) },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "high" },
    adapter: "consult",
    observed: status === "answered"
      ? { status, identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "high" } }
      : { status, identity: null },
    questionSha256: digest("# Plan\n"), answerSha256: status === "answered" ? "b".repeat(64) : null,
    fallback: status === "answered" ? { reason: "none", redactedErrorClass: null }
      : { reason: "consult-unavailable", redactedErrorClass: "unavailable" },
    emittedAtMs: 1,
  };
  writeFileSync(join(root, ".git", "agent-pipeline", "design-advisory-receipts", "advisor-1.json"), `${JSON.stringify(receipt)}\n`);
  const written = writeDesignAdvisoryTransaction({ repoRoot: root, gitCommonDir: join(root, ".git"),
    featureId: "feature-1", planPath, specPath, receiptId: "advisor-1", nativeAvailable: false,
    disposition: status === "answered" ? { decision: "accept", rationale: "The plan is bounded." } : null,
    finalApprovalValid: status !== "answered", expectedPublicSha256: null });
  const argv = ["inspect", "--repo-root", root, "--feature", "feature-1", "--plan", planPath, "--spec", specPath];
  return { root, argv, written };
}

test("answered Advisor inspect rechecks its actual private transaction", t => {
  const { argv, written } = fixture(t, "answered");
  const result = runDesignAdvisoryAdmission(argv);
  assert.equal(result.status, "valid");
  assert.equal(result.id, written.id);
});

test("unavailable Advisor inspect never reuses the write-time final approval claim", t => {
  const { argv } = fixture(t, "unavailable");
  assert.throws(() => runDesignAdvisoryAdmission(argv), error => error.code === "DAA-PUBLIC-INVALID");
});
