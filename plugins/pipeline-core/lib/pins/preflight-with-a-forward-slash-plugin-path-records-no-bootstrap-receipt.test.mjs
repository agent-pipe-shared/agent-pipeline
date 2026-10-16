// SPDX-License-Identifier: SUL-1.0

// Pin for backlog item pipeline.preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt
// (AC-230). Acceptance points, each exercised through the real guard modules:
//   P1 the backslash spelling of the preflight script is recognised (receipt trigger + lifecycle admission);
//   P2 the forward-slash spelling of the SAME script is recognised by both, in both quote styles;
//   P3 a recognised spelling really records the bootstrap receipt and opens the first-Write gate,
//      while an unrecognised spelling records nothing and the gate refuses (GUARD-BOOTSTRAP-RECEIPT-MISSING);
//   P4 normalization never widens: other file, other dir, other drive, dot-segment, extra argv stay refused;
//   P5 case: PO #19 decided to admit case-variant spellings on win32 (separator AND case, per the Proposal);
//      the earlier pin asserted refusal and went RED against the case-folding source (true !== false).
// RED discriminator: a scratch mirror of the pre-fix strict-equality matcher rejects P2's spelling.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateBootstrapReceiptGate, recordBootstrapPreflightReceipt } from "../guard/bootstrap-receipt.mjs";
import { isSanctionedLifecycleCommand } from "../guard/command-catalogue.mjs";
import { START_PREFLIGHT_SCRIPT } from "../guard/constants.mjs";
import { isSanctionedStartPreflightInvocation } from "../guard/sanctioned-args-scripts.mjs";

const ON_WIN32 = process.platform === "win32";
const NOT_WIN32 = ON_WIN32 ? false : "win32-only: POSIX has exactly one spelling of a path";
const HOST_LIMITATION = "host-limitation: native Windows host cannot exercise the POSIX-exact case; "
  + "owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)";
const ROOT = resolve("/projects/current");
const SCRATCH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "scratch");

const forward = (value) => value.replaceAll("\\", "/");
const flipDrive = (value) => value.replace(/^[A-Za-z]:/u, (d) => (d === d.toLowerCase() ? d.toUpperCase() : d.toLowerCase()));
const QUOTES = ["'", '"'];

function assertRecognised(spelling, expected, label) {
  for (const quote of QUOTES) {
    const command = `node ${quote}${spelling}${quote}`;
    assert.equal(isSanctionedStartPreflightInvocation(command, ROOT), expected, `${label}: receipt trigger, ${quote}-quoted`);
    assert.equal(isSanctionedLifecycleCommand(command, ROOT), expected, `${label}: lifecycle admission, ${quote}-quoted`);
  }
}

// Mirrors the guard hook: a trigger match records the receipt, then the first write is gated.
function runScenario(spelling, agentId) {
  mkdirSync(SCRATCH, { recursive: true });
  const commonDir = mkdtempSync(join(SCRATCH, "fslash-receipt-"));
  try {
    const input = { agent_id: agentId, agent_type: "pipeline-core:goldfish-implementor" };
    const deps = { resolveGitCommonDirFn: () => commonDir };
    if (isSanctionedStartPreflightInvocation(`node "${spelling}"`, ROOT)) {
      recordBootstrapPreflightReceipt(input, ROOT, deps);
    }
    const receipt = join(commonDir, "agent-pipeline", "bootstrap-receipt", `${agentId}.json`);
    const gate = evaluateBootstrapReceiptGate(input, ROOT, "Write", deps);
    return { receiptRecorded: existsSync(receipt), gate };
  } finally {
    rmSync(commonDir, { recursive: true, force: true });
  }
}

test("P1: the canonical backslash spelling is recognised and records the receipt", { skip: NOT_WIN32 }, () => {
  assert.match(START_PREFLIGHT_SCRIPT, /^[A-Za-z]:\\/u, "fixture precondition: drive-letter script path");
  assertRecognised(START_PREFLIGHT_SCRIPT, true, "backslash");
  const r = runScenario(START_PREFLIGHT_SCRIPT, "fslash-bs-1");
  assert.equal(r.receiptRecorded, true);
  assert.equal(r.gate, null);
});

test("P2/P3: the forward-slash spelling is recognised, records the receipt and opens the first Write", { skip: NOT_WIN32 }, () => {
  assertRecognised(forward(START_PREFLIGHT_SCRIPT), true, "forward slash");
  const r = runScenario(forward(START_PREFLIGHT_SCRIPT), "fslash-fs-1");
  assert.equal(r.receiptRecorded, true, "receipt must exist after a forward-slash preflight");
  assert.equal(r.gate, null, "first Write must not be refused");
});

test("P3: an unrecognised spelling records no receipt and the first Write is refused", { skip: NOT_WIN32 }, () => {
  const other = forward(START_PREFLIGHT_SCRIPT).replace(/pipeline-start-preflight\.mjs$/u, "pre-push-hook-install.mjs");
  const r = runScenario(other, "fslash-other-1");
  assert.equal(r.receiptRecorded, false);
  assert.match(JSON.stringify(r.gate), /GUARD-BOOTSTRAP-RECEIPT-MISSING/u);
});

test("RED discriminator: a scratch mirror of the pre-fix strict-equality matcher rejects the forward-slash spelling", { skip: NOT_WIN32 }, () => {
  const preFixMatcher = (script) => script === START_PREFLIGHT_SCRIPT;
  assert.equal(preFixMatcher(START_PREFLIGHT_SCRIPT), true);
  assert.equal(preFixMatcher(forward(START_PREFLIGHT_SCRIPT)), false, "mirror shows the original defect");
  assert.equal(isSanctionedStartPreflightInvocation(`node "${forward(START_PREFLIGHT_SCRIPT)}"`, ROOT), true, "production no longer has it");
});

const MUST_STAY_REFUSED = [
  ["a different file name in the same directory", () => `${forward(START_PREFLIGHT_SCRIPT)}x`],
  ["the same file name in another directory", () => `${forward(dirname(dirname(START_PREFLIGHT_SCRIPT)))}/other/${basename(START_PREFLIGHT_SCRIPT)}`],
  ["the same path on another drive", () => forward(START_PREFLIGHT_SCRIPT.replace(/^[A-Za-z]:/u, (d) => (d.toUpperCase() === "Q:" ? "R:" : "Q:")))],
  ["a dot-segment detour to the same file", () => `${forward(dirname(START_PREFLIGHT_SCRIPT))}/../${basename(dirname(START_PREFLIGHT_SCRIPT))}/${basename(START_PREFLIGHT_SCRIPT)}`],
  ["a duplicate separator", () => forward(START_PREFLIGHT_SCRIPT).replace(/\/scripts\//u, "//scripts//")],
];
for (const [label, spell] of MUST_STAY_REFUSED) {
  test(`P4: ${label} stays refused`, { skip: NOT_WIN32 }, () => {
    assertRecognised(spell(), false, label);
  });
}

test("P4: either spelling plus any extra argument stays refused", { skip: NOT_WIN32 }, () => {
  for (const spelling of [START_PREFLIGHT_SCRIPT, forward(START_PREFLIGHT_SCRIPT)]) {
    for (const quote of QUOTES) {
      const command = `node ${quote}${spelling}${quote} --extra`;
      assert.equal(isSanctionedStartPreflightInvocation(command, ROOT), false);
      assert.equal(isSanctionedLifecycleCommand(command, ROOT), false);
    }
  }
});

test("P5: case-variant spellings are admitted on win32 (PO #19), in both separator spellings", { skip: NOT_WIN32 }, () => {
  assertRecognised(flipDrive(START_PREFLIGHT_SCRIPT), true, "opposite-case drive, backslash");
  assertRecognised(flipDrive(forward(START_PREFLIGHT_SCRIPT)), true, "opposite-case drive, forward slash");
  assertRecognised(START_PREFLIGHT_SCRIPT.toUpperCase(), true, "upper-cased path, backslash");
  assertRecognised(forward(START_PREFLIGHT_SCRIPT).toUpperCase(), true, "upper-cased path, forward slash");
  assertRecognised(START_PREFLIGHT_SCRIPT.toLowerCase(), true, "lower-cased path, backslash");
  const r = runScenario(flipDrive(forward(START_PREFLIGHT_SCRIPT)), "fslash-case-1");
  assert.equal(r.receiptRecorded, true, "a case-variant preflight records the receipt");
  assert.equal(r.gate, null, "first Write must not be refused");
});

test("POSIX: exact path recognised, case-variant refused", { skip: ON_WIN32 ? HOST_LIMITATION : false }, () => {
  assertRecognised(START_PREFLIGHT_SCRIPT, true, "exact");
  assertRecognised(START_PREFLIGHT_SCRIPT.toUpperCase(), false, "case-variant");
});
