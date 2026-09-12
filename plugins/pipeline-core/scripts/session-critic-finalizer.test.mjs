#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { consumeCandidatePacket } from "./critic-packet-preflight.mjs";

import {
  SESSION_CRITIC_ASSURANCE,
  SESSION_CRITIC_CLI_ERROR_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
  SESSION_CRITIC_RECEIPT_SCHEMA,
  SessionCriticFinalizerError,
  finalizeSessionCriticReview,
  runSessionCriticFinalizerCli,
  validateSessionCriticReceipt,
} from "./session-critic-finalizer.mjs";

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture({ rootCandidate = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-"));
  git(root, ["init", "-q"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
  let base;
  if (rootCandidate) {
    const candidate = commit(root, "root candidate");
    base = execFileSync("git", ["-C", root, "hash-object", "-t", "tree", "--stdin"], { input: "", encoding: "utf8" }).trim();
    const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
    writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
    return { root, base, candidate, tree };
  }
  base = commit(root, "base");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nCandidate.\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  // Deliberately untracked: the normal session preflight admits this local,
  // candidate-bound machine evidence without fabricating a candidate blob.
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  return { root, base, candidate, tree };
}
function verdict(overrides = {}) {
  return {
    findings: [],
    deliberately_not_flagged: ["scope"],
    trajectory_verdict: "consistent",
    trajectory_evidence: "candidate evidence inspected",
    briefing_violations: [],
    pass: true,
    ...overrides,
  };
}
function options(fx, overrides = {}) {
  return {
    preflightInput: {
      root: fx.root,
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [],
      evidencePaths: ["evidence/verify.json"],
      priorCriticEvidencePath: null,
    },
    taskId: "nova-b-lnd5",
    projectId: "pipeline",
    sessionId: "session-lnd5-1",
    packetId: "1".repeat(32),
    route: {
      routeId: "session-critic",
      runner: "codex",
      adapter: "session-functional-equivalent",
      provider: "openai",
      modelTier: "higher-capability",
      effortTier: "xhigh",
    },
    verdict: verdict(),
    ...overrides,
  };
}
function cleanup(fx) { rmSync(fx.root, { recursive: true, force: true }); }
function cliRequest(fx, overrides = {}) {
  return {
    schema: SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
    taskId: "nova-b-lnd5",
    projectId: "pipeline",
    sessionId: "session-cli-1",
    packetId: "6".repeat(32),
    trigger: "T1",
    route: options(fx).route,
    review: {
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [],
      evidencePaths: ["evidence/verify.json"],
      priorCriticEvidencePath: null,
    },
    verdictPath: "evidence/critic-verdict.json",
    event: { eventOutPath: "evidence/review-action.json", featureId: "nova-b" },
    ...overrides,
  };
}

test("normal fresh-session finalization automatically prepares, claims, records, consumes, reads back, and emits", () => {
  const fx = fixture();
  try {
    let consumeCalls = 0;
    const result = finalizeSessionCriticReview(options(fx, { eventOutPath: "evidence/review-action.json", featureId: "nova-b" }), {
      consumeCandidatePacketFn: (...args) => { consumeCalls += 1; return consumeCandidatePacket(...args); },
    });
    assert.equal(result.status, "completed");
    assert.equal(result.receipt.schema, SESSION_CRITIC_RECEIPT_SCHEMA);
    assert.equal(result.receipt.assurance, SESSION_CRITIC_ASSURANCE);
    assert.equal(result.receipt.reviewPass, true);
    assert.equal(result.event.reasonCode, "REVIEW_PASSED");
    assert.match(result.event.correlation.requestId, /^[a-f0-9]{64}$/u);
    assert.equal(consumeCalls, 2, "accepted means first durable consume plus identical replay readback");
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "1".repeat(32), "checkout")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(fx.root, "evidence", "review-action.json"), "utf8")), result.event);
    const serialized = JSON.stringify({ receipt: result.receipt, event: result.event });
    for (const forbidden of ["runner", "provider", "modelTier", "effortTier", "routeId"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  } finally { cleanup(fx); }
});

test("a schema-invalid or contradictory verdict fails before packet or event publication", () => {
  const fx = fixture();
  try {
    assert.throws(() => finalizeSessionCriticReview(options(fx, { verdict: { pass: true } })), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-VERDICT-SCHEMA");
    assert.throws(() => finalizeSessionCriticReview(options(fx, {
      packetId: "2".repeat(32),
      verdict: verdict({ findings: [{ gap: "gap", risk: "risk", severity: "major", evidence: "a:1", spec_ref: "AC-1" }] }),
    })), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-VERDICT-CONTRADICTION");
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets")), false);
  } finally { cleanup(fx); }
});

test("an event write failure reports source-complete and a closed identical-only retry", () => {
  const fx = fixture();
  try {
    const result = finalizeSessionCriticReview(options(fx, { packetId: "3".repeat(32), eventOutPath: "evidence/review-action.json" }), {
      writeGovernanceReviewActionFn: () => { throw Object.assign(new Error("disk"), { code: "GRA-OUTPUT-WRITE" }); },
    });
    assert.equal(result.status, "source-complete/event-unavailable");
    assert.equal(result.receipt.reviewPass, true);
    assert.equal(result.retry.event.reasonCode, "REVIEW_PASSED");
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
    const durable = JSON.parse(readFileSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "3".repeat(32), "receipt.json"), "utf8"));
    assert.deepEqual(durable.body, result.receipt);
  } finally { cleanup(fx); }
});

test("review action construction cannot occur before identical consume readback", () => {
  const fx = fixture();
  try {
    let consumes = 0;
    let builds = 0;
    assert.throws(() => finalizeSessionCriticReview(options(fx, {
      packetId: "7".repeat(32),
      eventOutPath: "evidence/review-action.json",
    }), {
      consumeCandidatePacketFn: (...args) => {
        consumes += 1;
        const result = consumeCandidatePacket(...args);
        return consumes === 2 ? { ...result, replay: false } : result;
      },
      buildGovernanceReviewActionFn: () => { builds += 1; throw new Error("must not run"); },
    }), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-RECEIPT-READBACK");
    assert.equal(consumes, 2);
    assert.equal(builds, 0);
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
  } finally { cleanup(fx); }
});

test("findings emit REVIEW_FINDINGS and a root candidate keeps its real empty-tree range", () => {
  const fx = fixture({ rootCandidate: true });
  try {
    const finding = { gap: "missing edge", risk: "failure", severity: "minor", evidence: "specs/spec.md:1", spec_ref: "AC-1" };
    const result = finalizeSessionCriticReview(options(fx, {
      packetId: "4".repeat(32),
      verdict: verdict({ findings: [finding], pass: false }),
      eventOutPath: "evidence/review-action.json",
    }));
    assert.equal(result.event.reasonCode, "REVIEW_FINDINGS");
    assert.equal(result.receipt.reviewRange.base, fx.base);
    assert.equal(result.receipt.candidate.commit, fx.candidate);
  } finally { cleanup(fx); }
});

test("receipt validation is closed and refuses provider metadata", () => {
  const fx = fixture();
  try {
    const receipt = finalizeSessionCriticReview(options(fx, { packetId: "5".repeat(32) })).receipt;
    assert.throws(() => validateSessionCriticReceipt({ ...receipt, provider: "openai" }), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-RECEIPT");
  } finally { cleanup(fx); }
});

test("closed CLI request produces the same versioned durable result without node-e imports", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    writeFileSync(join(fx.root, "evidence", "finalize-request.json"), `${JSON.stringify(cliRequest(fx))}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "evidence/finalize-request.json"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output.status, "completed");
    assert.equal(result.output.receipt.session.id, "session-cli-1");
  } finally { cleanup(fx); }
});

test("CLI closes argv/request vocabulary and reports typed exit-2 errors", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    writeFileSync(join(fx.root, "evidence", "bad-request.json"), `${JSON.stringify({ ...cliRequest(fx), command: "extra" })}\n`);
    for (const result of [
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root]),
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "evidence/bad-request.json"]),
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "../outside.json"]),
    ]) {
      assert.equal(result.exitCode, 2);
      assert.equal(result.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
      assert.equal(result.output.status, "rejected");
    }
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets")), false);
  } finally { cleanup(fx); }
});
