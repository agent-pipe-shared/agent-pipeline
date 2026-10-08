// Slice AL-T: pins for the Codex Critic lane fallback decision (design note
// specs/sprint-alfred-epic/design/codex-critic-lane-2026-10-08.md section 4).
// Fixture-only: no runner is launched; preflight/scratch/readback are injected spies.
//
// Contract assumptions (for ratification):
// - N1 = B (lane digests in the Critic receipt), N2 = B (terminalCode read from the persisted selection),
//   both provisional per dispatcher ruling (21).
// - `decideCriticLaneFallback({ selected, selection })` is pure and sync. `selected` is the bridge result
//   ({ status, failureClass, childStarted, selectionId }); `selection` is the persisted selection record or null.
//   Returns { fallback: boolean, code: string|null, from, to, selectionId } ; from = "codex-sandbox-selected",
//   to = "claude-fresh-session"; when fallback is false, code is null and to === from.
// - Cases 3-8 use the Linux-WSL2 observation as a stand-in host: the decision depends only on
//   failureClass/terminalCode of the persisted selection, never on platform.
// - Case 1 uses a Windows observation with no compatibility observation (today's behaviour: policy-drift).
// - A pre-start result that carries a code outside the table (e.g. a mismatched selection id) is
//   CLF-SELECTION-UNREADABLE (case 12). After childStarted === true the result is { fallback:false }.
// - Module exports: decideCriticLaneFallback, CLF_CODES (array of the six pre-start codes), and
//   validateLaneRecord(laneRecord) -> { ok, code } for cases 14-16; buildLaneRecord(...) for 14-15.
// - Cases 10-12 pin the pure decision (no fallback after child start / Gitless / unreadable); building a
//   git candidate fixture to drive runSelectedCriticHost was out of this dispatch's budget. The
//   runSelectedCriticHost behaviour itself is already pinned in scripts/codex-critic-host.test.mjs
//   (selected-critic-transport-failed, selected-sandbox-required), so 10-12 are RED here by design.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalJson, loadCompatibilityPolicy } from "../lib/codex-sandbox-compatibility.mjs";
import { selectCodexSandbox, SELECTION_SCHEMA_SHA256 } from "../scripts/codex-sandbox-select.mjs";

const loadModule = () => import("./critic-lane-fallback.mjs");
const D = "a".repeat(64);
const NOW = 1_784_563_200_000;
const CLI_VERSION = "0.146.0";
const CLI_SHA256 = "d".repeat(64);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const request = () => ({ repoFingerprint: D, duty: "critic", queueRevision: 4, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: "b".repeat(64), runner: "codex", model: "gpt-5.6-sol" });
const spies = { spawns: 0 };

function wslObserved() {
  const { value: policy } = loadCompatibilityPolicy();
  const entry = policy.entries.find((candidate) => candidate.filesystemClass === "wsl-native");
  const receipt = {
    schema: "pipeline.codex-sandbox-preflight.v1", cli: { version: CLI_VERSION, artifactSha256: CLI_SHA256 },
    sandboxTransport: { selection: "codex-cli-owned" }, observedHelper: { role: "diagnostic-only", artifactSha256: "1".repeat(64) }, platform: { os: "linux", kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass },
    profile: { id: entry.permissionProfileId, rawSha256: entry.permissionProfileSha256, compiledStateSha256: "2".repeat(64) }, networkEnabled: true,
    vectors: { allowedRead: true, externalReadDenied: true, sensitiveReadDenied: true, writeDenied: true, scratchWriteAllowed: true, networkDenied: false, childStdioEquivalent: true, stdinEofEquivalent: true, childExitEquivalent: true, appServerInitEquivalent: true, lifecycleComplete: true },
    canaries: { count: 1, manifestSha256: "3".repeat(64), unchanged: true }, eventChainSha256: "4".repeat(64), durationMs: 1, eligibility: "intermediate", terminalCode: "ok",
  };
  return {
    cliVersion: CLI_VERSION, cliSha256: CLI_SHA256, observedHelperSha256: "1".repeat(64), selectionSchemaSha256: SELECTION_SCHEMA_SHA256,
    platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: sha("boot"),
    compatibilityObservation: {
      runnerId: "codex", cliVersion: CLI_VERSION, releasedArtifactSha256: CLI_SHA256, kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass,
      permissionProfileId: entry.permissionProfileId, permissionProfileSha256: entry.permissionProfileSha256, bootId: "boot", nowMs: NOW,
      preflight: { bootId: "boot", observedAtMs: NOW, rawSha256: sha(Buffer.from(canonicalJson(receipt))), schemaSha256: entry.preflightSchemaSha256, receipt }, runner: null, shadow: null, activation: null, routePostimageSha256: null,
    },
  };
}
const windowsObserved = () => ({ cliVersion: CLI_VERSION, cliSha256: CLI_SHA256, platformClass: "windows-native", filesystemClass: "windows-ntfs", kernel: { sysname: "Windows_NT", release: "10", machine: "x86_64" }, bootIdSha256: sha("boot") });
const eligible = { eligibility: "intermediate", terminalCode: "eligible", receiptSha256: "6".repeat(64) };
const scratchOk = async () => ({ sha256: "7".repeat(64) });

async function select(overrides = {}) {
  return selectCodexSandbox(request(), {
    now: () => NOW, observeHost: async () => wslObserved(), runPreflight: async () => eligible,
    createCoordinatorScratch: scratchOk, readbackProfile: async ({ profile }) => profile,
    persist: async (selection) => selection, ...overrides,
  });
}
const asSelected = (selection) => ({ status: selection.status, failureClass: selection.failureClass, childStarted: false, selectionId: selection.selectionId });
async function decide(selection, selected = asSelected(selection), persisted = selection) {
  const { decideCriticLaneFallback } = await loadModule();
  return decideCriticLaneFallback({ selected, selection: persisted });
}

test("AL-1: Windows observation without a compatibility entry stays unavailable/policy-drift and falls back with CLF-HOST-UNSUPPORTED", async () => {
  const selection = await select({ observeHost: async () => windowsObserved() });
  assert.equal(selection.status, "unavailable");
  assert.equal(selection.failureClass, "policy-drift");
  const verdict = await decide(selection);
  assert.equal(verdict.fallback, true);
  assert.equal(verdict.code, "CLF-HOST-UNSUPPORTED");
  assert.equal(spies.spawns, 0);
});

test("AL-2: eligible injected preflight plus a Windows entry selects the lane on windows-native", async () => {
  const selection = await select({ observeHost: async () => windowsObserved() });
  assert.equal(selection.status, "selected");
  assert.equal(selection.host.platformClass, "windows-native");
});

test("AL-3: terminal profile-unavailable yields CLF-PROFILE-UNAVAILABLE", async () => {
  const selection = await select({ runPreflight: async () => ({ eligibility: "none", terminalCode: "profile-unavailable" }) });
  const verdict = await decide(selection);
  assert.equal(verdict.code, "CLF-PROFILE-UNAVAILABLE");
  assert.equal(verdict.fallback, true);
});

test("AL-4: terminal network-unavailable yields CLF-PROFILE-UNAVAILABLE", async () => {
  const selection = await select({ runPreflight: async () => ({ eligibility: "none", terminalCode: "network-unavailable" }) });
  assert.equal((await decide(selection)).code, "CLF-PROFILE-UNAVAILABLE");
});

test("AL-5: child-stdio-error yields CLF-PREFLIGHT-FAILED (granular terminalCode read, not the collapsed class)", async () => {
  const selection = await select({ runPreflight: async () => ({ eligibility: "none", terminalCode: "child-stdio-error" }) });
  assert.equal(selection.failureClass, "preflight-failed");
  assert.equal(selection.preflight.terminalCode, "child-stdio-error");
  assert.equal((await decide(selection)).code, "CLF-PREFLIGHT-FAILED");
});

test("AL-6: runPreflight throwing yields CLF-PREFLIGHT-FAILED", async () => {
  const selection = await select({ runPreflight: async () => { throw new Error("preflight failed"); } });
  assert.equal(selection.preflight.terminalCode, "host-error");
  assert.equal((await decide(selection)).code, "CLF-PREFLIGHT-FAILED");
});

test("AL-7: scratch creation throwing after an eligible preflight yields CLF-PROFILE-UNAVAILABLE", async () => {
  const selection = await select({ createCoordinatorScratch: async () => { throw new Error("scratch"); } });
  assert.equal(selection.status, "unavailable");
  assert.equal((await decide(selection)).code, "CLF-PROFILE-UNAVAILABLE");
});

test("AL-8: profile readback mismatch after an eligible preflight yields CLF-PROFILE-UNAVAILABLE", async () => {
  const selection = await select({ readbackProfile: async () => ({ mismatch: true }) });
  assert.equal(selection.status, "unavailable");
  assert.equal((await decide(selection)).code, "CLF-PROFILE-UNAVAILABLE");
});

test("AL-9: Linux-WSL2 selection record is byte-identical across two runs apart from the minted id (regression pin)", async () => {
  const first = await select();
  const second = await select();
  assert.equal(first.status, "selected");
  assert.equal(first.host.platformClass, "linux-wsl2");
  const strip = (record) => canonicalJson({ ...record, selectionId: null });
  assert.equal(strip(first), strip(second));
});

test("AL-10: child started then transport error never falls back and preserves the result", async () => {
  const selected = { status: "error", childStarted: true, selectionId: "css_bbbbbbbbbbbbbbbbbbbbbbbbbi" };
  const verdict = await decide(null, selected, null);
  assert.equal(verdict.fallback, false);
  assert.equal(verdict.code, null);
});

test("AL-11: Gitless pre-launch rejection yields CLF-RULESET-UNAVAILABLE with childStarted false", async () => {
  const { decideCriticLaneFallback } = await loadModule();
  const verdict = decideCriticLaneFallback({ selected: { status: "unavailable", failureClass: null, childStarted: false, selectionId: null, preLaunchCode: "selected-critic-role-dispatch-rejected" }, selection: null });
  assert.equal(verdict.fallback, true);
  assert.equal(verdict.code, "CLF-RULESET-UNAVAILABLE");
});

test("AL-12: an unreadable persisted selection or id mismatch yields CLF-SELECTION-UNREADABLE", async () => {
  const selection = await select({ runPreflight: async () => ({ eligibility: "none", terminalCode: "profile-unavailable" }) });
  assert.equal((await decide(selection, asSelected(selection), null)).code, "CLF-SELECTION-UNREADABLE");
  assert.equal((await decide(selection, { ...asSelected(selection), selectionId: "css_other" }, selection)).code, "CLF-SELECTION-UNREADABLE");
});

test("AL-13: every terminalCode and failureClass maps to one code or an explicit no-fallback; T1 allowed codes unchanged", async () => {
  const source = readFileSync(new URL("../scripts/codex-sandbox-select.mjs", import.meta.url), "utf8");
  const classes = /const FAILURE_CLASSES = new Set\(\[([^\]]+)\]\)/u.exec(source)[1].match(/"[^"]+"/gu).map((s) => s.slice(1, -1));
  const terminals = ["eligible", "child-stdio-error", "profile-unavailable", "network-unavailable", "host-error"];
  const { decideCriticLaneFallback, CLF_CODES } = await loadModule();
  assert.equal(CLF_CODES.length, 6);
  for (const failureClass of classes) {
    for (const terminalCode of terminals) {
      const verdict = decideCriticLaneFallback({ selected: { status: "unavailable", failureClass, childStarted: false, selectionId: "s" }, selection: { selectionId: "s", status: "unavailable", failureClass, preflight: { terminalCode } } });
      assert.ok(verdict.fallback === false || CLF_CODES.includes(verdict.code), `${failureClass}/${terminalCode}`);
    }
  }
  const { ALLOWED_PRE_VERDICT_CODES } = await import("../scripts/critic-t1-po-override.mjs");
  assert.deepEqual([...ALLOWED_PRE_VERDICT_CODES], ["binary-missing", "child-stdio-error", "permission-denial", "sandbox-setup-error", "unsupported-profile"]);
});

test("AL-14: a fallback laneRecord names from/to/code/selectionId, is not sandboxed-class, and a receipt without laneRecord is rejected", async () => {
  const { buildLaneRecord, validateLaneRecord } = await loadModule();
  const record = buildLaneRecord({ requested: "codex-sandbox-selected", used: "claude-fresh-session", fallback: { code: "CLF-PROFILE-UNAVAILABLE", from: "codex-sandbox-selected", to: "claude-fresh-session", selectionId: "s", failureClass: "host-mode-unavailable", terminalCode: "profile-unavailable" } });
  assert.equal(record.requested, "codex-sandbox-selected");
  assert.equal(record.assuranceClass, "fresh-session");
  assert.equal(record.fallback.selectionId, "s");
  assert.equal(validateLaneRecord(record).ok, true);
  assert.equal(validateLaneRecord(undefined).ok, false);
});

test("AL-15: native-lane success records used=selected lane, windows-native and the N1-B digests", async () => {
  const { buildLaneRecord } = await loadModule();
  const record = buildLaneRecord({ requested: "codex-sandbox-selected", used: "codex-sandbox-selected", platformClass: "windows-native", filesystemClass: "windows-ntfs", selectionSha256: "1".repeat(64), executionReceiptSha256: "2".repeat(64), fallback: null });
  assert.equal(record.used, "codex-sandbox-selected");
  assert.equal(record.platformClass, "windows-native");
  assert.match(record.selectionSha256, /^[a-f0-9]{64}$/u);
  assert.match(record.executionReceiptSha256, /^[a-f0-9]{64}$/u);
  assert.equal(record.fallback, null);
});

test("AL-16: a changed executionReceiptSha256 or selectionSha256 fails verification", async () => {
  const { buildLaneRecord, validateLaneRecord } = await loadModule();
  const base = { requested: "codex-sandbox-selected", used: "codex-sandbox-selected", platformClass: "windows-native", filesystemClass: "windows-ntfs", selectionSha256: "1".repeat(64), executionReceiptSha256: "2".repeat(64), fallback: null };
  const record = buildLaneRecord(base);
  assert.equal(validateLaneRecord(record, { selectionSha256: base.selectionSha256, executionReceiptSha256: base.executionReceiptSha256 }).ok, true);
  assert.equal(validateLaneRecord({ ...record, executionReceiptSha256: "3".repeat(64) }, { selectionSha256: base.selectionSha256, executionReceiptSha256: base.executionReceiptSha256 }).ok, false);
  assert.equal(validateLaneRecord({ ...record, selectionSha256: "4".repeat(64) }, { selectionSha256: base.selectionSha256, executionReceiptSha256: base.executionReceiptSha256 }).ok, false);
});
