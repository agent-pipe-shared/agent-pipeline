#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { preflightRoleDispatch } from "../lib/role-dispatch-preflight.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import {
  NativeCriticDispatchPreflightError,
  nativeCriticRoleDispatchPacket,
  preflightNativeCriticCoordinatorEvidence,
  runPreflightedFixedChild,
} from "./codex-native-critic-host.mjs";

const cases = [
  { id: "NCH01", name: "native packet binds role prompt paths candidate and return destination", run: validBinding },
  { id: "NCH02", name: "invalid native role reaches no fixed child", run: () => rejectsWithoutChild((packet) => { packet.role = "pipeline-core:unknown"; }) },
  { id: "NCH03", name: "empty native prompt reaches no fixed child", run: () => rejectsWithoutChild((packet) => { packet.prompt = ""; }) },
  { id: "NCH04", name: "invalid native required path reaches no fixed child", run: () => rejectsWithoutChild((packet) => { packet.requiredPaths = ["missing.txt"]; packet.requiredPathSha256 = { "missing.txt": "a".repeat(64) }; }) },
  { id: "NCH05", name: "invalid native candidate reaches no fixed child", run: () => rejectsWithoutChild((packet) => { packet.candidate.commit = "f".repeat(40); }) },
  { id: "NCH06", name: "invalid native return destination reaches no fixed child", run: () => rejectsWithoutChild((packet) => { packet.resultDestination = { kind: "return", path: "result.json" }; }) },
  { id: "NCH07", name: "late required-path drift is rechecked before the fixed child", run: lateDrift },
  { id: "NCH08", name: "late coordinator-evidence drift is rechecked before the fixed child", run: lateEvidenceDrift },
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "native-critic-dispatch-"));
  writeFileSync(join(root, "input.txt"), "candidate input\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["add", "input.txt"]);
  git(root, ["commit", "-qm", "candidate"]);
  const commit = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const sha256 = createHash("sha256").update(readFileSync(join(root, "input.txt"))).digest("hex");
  const packet = nativeCriticRoleDispatchPacket({
    selection: {
      selectionId: "native-critic-dispatch-01",
      dispatch: { candidateCommit: commit, candidateTree: tree },
      route: { model: "gpt-6-astra", effort: "max" },
    },
    referenceRecords: [{ path: "input.txt", blobOid: git(root, ["rev-parse", "HEAD:input.txt"]), sha256 }],
    boundRuleset: { provenance: { identity: "b".repeat(64) } },
  });
  return { root, packet, commit, tree };
}

async function withFixture(run) {
  const value = fixture();
  try { await run(value); }
  finally { rmSync(value.root, { recursive: true, force: true }); }
}

async function validBinding() {
  await withFixture(async ({ root, packet }) => {
    let preflights = 0;
    let children = 0;
    const child = { ok: true };
    const result = await runPreflightedFixedChild({ root, packet, request: { bounded: true } }, {
      preflightRoleDispatch(input) { preflights += 1; return preflightRoleDispatch(input); },
      async runChild(request) { children += 1; assert.deepEqual(request, { bounded: true }); return child; },
    });
    assert.equal(preflights, 2);
    assert.equal(children, 1);
    assert.strictEqual(result, child);
    assert.equal(packet.role, "pipeline-core:critic");
    assert.match(packet.prompt, /Ruleset-SHA: b{64}; Model: gpt-6-astra; effort max/u);
    assert.deepEqual(packet.requiredPaths, ["input.txt"]);
    assert.deepEqual(packet.candidate, { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) });
    assert.deepEqual(packet.resultDestination, { kind: "return" });
  });
}

async function rejectsWithoutChild(mutate) {
  await withFixture(async ({ root, packet }) => {
    mutate(packet);
    let children = 0;
    await assert.rejects(
      runPreflightedFixedChild({ root, packet, request: {} }, { runChild: async () => { children += 1; } }),
      NativeCriticDispatchPreflightError,
    );
    assert.equal(children, 0);
  });
}

async function lateDrift() {
  await withFixture(async ({ root, packet }) => {
    let preflights = 0;
    let children = 0;
    await assert.rejects(runPreflightedFixedChild({ root, packet, request: {} }, {
      preflightRoleDispatch(input) {
        preflights += 1;
        const result = preflightRoleDispatch(input);
        if (preflights === 1) writeFileSync(join(root, "input.txt"), "drift after prepare\n");
        return result;
      },
      runChild: async () => { children += 1; },
    }), NativeCriticDispatchPreflightError);
    assert.equal(preflights, 2);
    assert.equal(children, 0);
  });
}

async function lateEvidenceDrift() {
  await withFixture(async ({ root, packet, commit, tree }) => {
    const evidencePath = join(root, "evidence.json");
    writeFileSync(evidencePath, `${JSON.stringify({ candidate: { commit, tree } })}\n`);
    const evidenceRecords = [{
      path: "evidence.json",
      sha256: createHash("sha256").update(readFileSync(evidencePath)).digest("hex"),
      candidate: { commit, tree },
    }];
    let evidencePreflights = 0;
    let children = 0;
    await assert.rejects(runPreflightedFixedChild({ root, packet, evidenceRecords, request: {} }, {
      preflightCoordinatorEvidence(input) {
        evidencePreflights += 1;
        const result = preflightNativeCriticCoordinatorEvidence(input);
        if (evidencePreflights === 1) writeFileSync(evidencePath, "{}\n");
        return result;
      },
      runChild: async () => { children += 1; },
    }), NativeCriticDispatchPreflightError);
    assert.equal(evidencePreflights, 2);
    assert.equal(children, 0);
  });
}

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
