// SPDX-License-Identifier: SUL-1.0
/**
 * R4-T0 RED pins, cases 10-12: the close-side readers for Critic route
 * evidence (AC-29 / R4-2, R4-12). Per the S0 findings the close path accepts a
 * Critic through `readBoundConsumedCriticReceipt` and `readCriticVerifyLifecycle`
 * in `./critic-verify-lifecycle.mjs`; the close verb already calls them, so
 * no new close module is guessed here.
 *
 * PO decision BD: R4-12 is REPORT-ONLY in 0.7.0. When no host measurement
 * exists the close output carries a typed `unavailable` verdict and the reader
 * does NOT refuse for that reason alone (case 12). Refusal is reserved for a
 * host observation that is SUPPLIED as acceptance evidence and fails to prove
 * a native Critic (case 11), and for fallback evidence.
 *
 * ASSUMPTIONS the design note and S0 findings leave open (renaming them later
 * is allowed, but this header and the pins must change together):
 *  - new dependency seam `deps.readCriticHostObservationFn({ gitCommonDir,
 *    criticPacketId })` returning an observation or `null`; it flows through
 *    both readers because `readCriticVerifyLifecycle` already forwards `deps`.
 *  - observation shape: `{ schema: "pipeline.critic-host-observation.v1", kind,
 *    runner, packetId, start: { hookRecorded, subagentId }, readOnly: {
 *    perCallEnforced, writeToolCalls }, terminal: { hookRecorded, packetDigest,
 *    receiptSha256 } }`; `kind` is `native` or `fallback-self-dispatch`.
 *  - suffixes of the codes S0 left open: a supplied observation that does not
 *    prove a native Critic (start not hook-recorded, per-call read-only
 *    enforcement absent, a recorded write-tool call, terminal binding missing
 *    or naming another packet or receipt digest) -> `CVL-ROUTE-UNAVAILABLE`;
 *    a `fallback-self-dispatch` observation -> `CVL-FALLBACK-EVIDENCE`.
 *  - `readBoundConsumedCriticReceipt` gains a member `roleRoute` ({ state,
 *    reasonCode, evidence }, the same closed entry the preflight uses);
 *    `readCriticVerifyLifecycle` gains `roleRoutes` for exactly `critic`,
 *    `plan-verifier` and `readiness`. plan-verifier has no lifecycle slot, so
 *    its entry is `unavailable` / `RRP-ROLE-NOT-REGISTERED`; without a host
 *    measurement the others are `unavailable` / `RRP-NO-HOST-OBSERVATION` with
 *    an empty `evidence` string. The verdict is never folded into the private
 *    receipt bytes (its `receiptSha256` stays as recorded).
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readBoundConsumedCriticReceipt, readCriticVerifyLifecycle, recordCriticVerifyLifecycle } from "./critic-verify-lifecycle.mjs";
import { canonicalJson, sha256 } from "../scripts/critic-packet-preflight.mjs";

const oid = (char) => char.repeat(40);
const sha = (char) => char.repeat(64);
const candidate = { commit: oid("a"), tree: oid("b") };
const evidence = { schema: "pipeline.verify-evidence.v0", exitCode: 0, candidate: { ...candidate }, verifyRun: { terminalSha256: sha("c") } };

function critic(overrides = {}) {
  return {
    schema: "pipeline.session-critic-receipt.v1", packetId: "d".repeat(32), packetDigest: sha("e"),
    session: { id: "review-1", freshContext: true, historyInherited: false, mayDelegate: false },
    candidate: { base: oid("f"), ...candidate }, reviewRange: { base: oid("f"), commit: candidate.commit, diffSha256: sha("1") },
    rulesetSha: oid("2"), assurance: "functional-equivalent-read-only; OS isolation not asserted", verdictSha256: sha("3"), findingCount: 0, reviewPass: true,
    ...overrides,
  };
}

function consumed(receipt) {
  const packet = {
    packetId: receipt.packetId, candidate: { ...receipt.candidate },
    diff: { base: receipt.reviewRange.base, commit: receipt.reviewRange.commit, sha256: receipt.reviewRange.diffSha256 },
  };
  receipt.packetDigest = sha256(canonicalJson(packet));
  return { packet, receipt };
}

function workspace(t) {
  const common = mkdtempSync(join(tmpdir(), "critic-verify-lifecycle-route-"));
  t.after(() => rmSync(common, { recursive: true, force: true }));
  const source = critic();
  consumed(source);
  const baseDeps = { readConsumedCandidateReceiptFn: () => consumed(source) };
  const receiptSha256 = readBoundConsumedCriticReceipt({ gitCommonDir: common, criticPacketId: source.packetId, candidate }, baseDeps).criticReceiptSha256;
  return { common, source, baseDeps, receiptSha256 };
}

function observation(ws, overrides = {}) {
  return {
    schema: "pipeline.critic-host-observation.v1", kind: "native", runner: "claude", packetId: ws.source.packetId,
    start: { hookRecorded: true, subagentId: "critic-subagent-1" },
    readOnly: { perCallEnforced: true, writeToolCalls: [] },
    terminal: { hookRecorded: true, packetDigest: ws.source.packetDigest, receiptSha256: ws.receiptSha256 },
    ...overrides,
  };
}

const depsWith = (ws, observed) => ({ ...ws.baseDeps, readCriticHostObservationFn: () => observed });
const readBound = (ws, deps) => readBoundConsumedCriticReceipt({ gitCommonDir: ws.common, criticPacketId: ws.source.packetId, candidate }, deps);

test("R4-T0-10 regression: the fallback Advisor agent definition grants no write-capable tool", () => {
  const text = readFileSync(new URL("../agents/consult-advisor.md", import.meta.url), "utf8");
  const match = /^tools:\s*(.+)$/mu.exec(text);
  assert.ok(match, "consult-advisor.md must declare a tools allowlist");
  const tools = match[1].split(",").map((tool) => tool.trim()).filter(Boolean);
  assert.deepEqual(tools.filter((tool) => !["Read", "Grep", "Glob"].includes(tool)), [], "only read-only tools may be granted");
});

test("R4-T0-10 a runtime refusal of a fallback Advisor write call",
  { skip: "no runtime guard path that refuses a consult-advisor write call was located, and none can be exercised by a unit test on this host: the only refusal surface found is the agent-definition tool allowlist (pinned above, enforced by the host), and hooks mention the agent only for dispatch budgeting" },
  () => {});

test("R4-T0-11 a complete Claude host observation (start, per-call read-only enforcement, terminal binding) makes the Critic route native", (t) => {
  const ws = workspace(t);
  const bound = readBound(ws, depsWith(ws, observation(ws)));
  assert.equal(bound.criticReceiptSha256, ws.receiptSha256, "the existing binding result is preserved");
  assert.deepEqual(Object.keys(bound.roleRoute).sort(), ["evidence", "reasonCode", "state"]);
  assert.equal(bound.roleRoute.state, "native");
  assert.equal(bound.roleRoute.reasonCode, "RRP-NATIVE-OBSERVED");
  assert.match(bound.roleRoute.evidence, /^[a-f0-9]{64}$/u);
});

for (const [name, overrides] of [
  ["its start was not hook-recorded", { start: { hookRecorded: false, subagentId: "critic-subagent-1" } }],
  ["its start is missing", { start: null }],
  ["per-call read-only enforcement is absent", { readOnly: { perCallEnforced: false, writeToolCalls: [] } }],
  ["a write-tool call was recorded", { readOnly: { perCallEnforced: true, writeToolCalls: [{ tool: "Write" }] } }],
  ["its terminal binding is missing", { terminal: null }],
  ["its terminal binding names another packet digest", { terminal: { hookRecorded: true, packetDigest: sha("9"), receiptSha256: sha("8") } }],
]) {
  test(`R4-T0-11 a supplied host observation is refused with CVL-ROUTE-UNAVAILABLE when ${name}`, (t) => {
    const ws = workspace(t);
    const supplied = observation(ws, overrides);
    if (overrides.terminal && overrides.terminal.packetDigest === sha("9")) {
      supplied.terminal.receiptSha256 = ws.receiptSha256;
    }
    assert.throws(() => readBound(ws, depsWith(ws, supplied)), (error) => error.code === "CVL-ROUTE-UNAVAILABLE");
  });
}

test("R4-T0-11 a supplied observation whose terminal binding names another receipt digest is refused with CVL-ROUTE-UNAVAILABLE", (t) => {
  const ws = workspace(t);
  const supplied = observation(ws, { terminal: { hookRecorded: true, packetDigest: ws.source.packetDigest, receiptSha256: sha("8") } });
  assert.throws(() => readBound(ws, depsWith(ws, supplied)), (error) => error.code === "CVL-ROUTE-UNAVAILABLE");
});

test("R4-T0-11 a fallback-self-dispatch observation is refused with CVL-FALLBACK-EVIDENCE", (t) => {
  const ws = workspace(t);
  assert.throws(() => readBound(ws, depsWith(ws, observation(ws, { kind: "fallback-self-dispatch" }))),
    (error) => error.code === "CVL-FALLBACK-EVIDENCE");
});

test("R4-T0-12 without host evidence the close reader REPORTS unavailable and does not refuse (PO decision BD)", (t) => {
  const ws = workspace(t);
  const input = { gitCommonDir: ws.common, criticPacketId: ws.source.packetId, candidate, evidencePath: "evidence/verify.json", evidence };
  const recorded = recordCriticVerifyLifecycle(input, ws.baseDeps);
  const read = readCriticVerifyLifecycle({ gitCommonDir: ws.common, id: recorded.receipt.id, candidate, evidencePath: input.evidencePath, evidence }, ws.baseDeps);
  assert.equal(read.receiptSha256, recorded.receiptSha256, "the verdict is not folded into the private receipt");
  assert.deepEqual(Object.keys(read.roleRoutes).sort(), ["critic", "plan-verifier", "readiness"]);
  assert.deepEqual(read.roleRoutes.critic, { state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" });
  assert.deepEqual(read.roleRoutes["plan-verifier"], { state: "unavailable", reasonCode: "RRP-ROLE-NOT-REGISTERED", evidence: "" });
  assert.deepEqual(read.roleRoutes.readiness, { state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" });
});

test("R4-T0-12 with a complete Critic observation only the Critic route turns native; plan-verifier and readiness stay unavailable", (t) => {
  const ws = workspace(t);
  const input = { gitCommonDir: ws.common, criticPacketId: ws.source.packetId, candidate, evidencePath: "evidence/verify.json", evidence };
  const recorded = recordCriticVerifyLifecycle(input, ws.baseDeps);
  const read = readCriticVerifyLifecycle({ gitCommonDir: ws.common, id: recorded.receipt.id, candidate, evidencePath: input.evidencePath, evidence },
    depsWith(ws, observation(ws)));
  assert.equal(read.roleRoutes.critic.state, "native");
  assert.equal(read.roleRoutes["plan-verifier"].state, "unavailable");
  assert.equal(read.roleRoutes.readiness.state, "unavailable");
});

test("R4-T0-12 regression: an unrelated refusal still refuses, an unavailable route is not the only gate", (t) => {
  const ws = workspace(t);
  const failed = critic({ reviewPass: false, findingCount: 1 });
  assert.throws(() => readBoundConsumedCriticReceipt({ gitCommonDir: ws.common, criticPacketId: failed.packetId, candidate },
    { readConsumedCandidateReceiptFn: () => consumed(failed) }), (error) => error.code === "CVL-CRITIC-FAILED");
});
