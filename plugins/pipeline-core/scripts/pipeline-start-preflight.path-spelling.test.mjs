// SPDX-License-Identifier: SUL-1.0

// FSLASH: one preflight script, several spellings of its absolute path.
//
// On native Windows `/` and `\` both separate path segments and the file system ignores letter
// case, so `node "D:/x/scripts/pipeline-start-preflight.mjs"` and `node "D:\x\scripts\...mjs"` run
// the SAME file. The bootstrap receipt is not written by the preflight script at all: it is written
// by guard-lifecycle-ready.mjs (recordBootstrapPreflightReceipt, keyed by agentId, never by path)
// when `isSanctionedStartPreflightInvocation()` recognises the Bash command. That recogniser, and
// the lifecycle admission `isSanctionedLifecycleCommand()` -> `sanctionedLifecycleScriptArgs()`,
// both compare the spelled script with strict string equality against
// `fileURLToPath(new URL(...))` -- the backslash, as-cased spelling only. Any other spelling of the
// same file is a "near miss", so no receipt is recorded and the first Write is refused with
// GUARD-BOOTSTRAP-RECEIPT-MISSING.
//
// The guard is a frozen, protected surface for this task, so the equivalence cases below are `todo`:
// they demonstrate the defect through the two exported functions without failing the suite. The
// proposed change is specs/sprint-alfred-epic/design/fslash-guard-fix.patch; once it is applied the
// `todo` marker on the equivalence cases is removed. The remaining cases pass today and must keep
// passing after the fix: they pin that the fix folds separators and (win32 only) case for
// comparison and never admits a different file, another drive, a dot-segment detour or extra argv.
//
// Hermetic: the command is only parsed -- no filesystem or Git state of any repository is touched,
// and no private state is written.

import assert from "node:assert/strict";
import { basename, dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isSanctionedLifecycleCommand, isSanctionedStartPreflightInvocation } from "../hooks/guard-lifecycle-ready.mjs";

const ON_WIN32 = process.platform === "win32";
const NOT_WIN32 = ON_WIN32 ? false : "win32-only: POSIX has exactly one spelling of a path";
const ROOT = resolve("/projects/current");
const SCRIPT = fileURLToPath(new URL("./pipeline-start-preflight.mjs", import.meta.url));
const TODO = "FSLASH: guard-lifecycle-ready.mjs compares the spelled script with strict string equality; "
  + "proposed change in specs/sprint-alfred-epic/design/fslash-guard-fix.patch (frozen guard, not edited here)";

const forward = (value) => value.replaceAll("\\", "/");
const swapCase = (value) => [...value].map((char) => (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase())).join("");
const flipDrive = (value) => value.replace(/^[A-Za-z]:/u, (drive) => (drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()));
const QUOTES = ["'", '"'];

// Both quote styles: the double-quoted form is what the guard's own refusal message prints.
function assertRecognised(spelling, expected, label) {
  for (const quote of QUOTES) {
    const command = `node ${quote}${spelling}${quote}`;
    assert.equal(isSanctionedStartPreflightInvocation(command, ROOT), expected, `${label}: receipt trigger, ${quote}-quoted`);
    assert.equal(isSanctionedLifecycleCommand(command, ROOT), expected, `${label}: lifecycle admission, ${quote}-quoted`);
  }
}

test("FSLASH: the canonical backslash spelling is recognised by the receipt trigger and the lifecycle admission", { skip: NOT_WIN32 }, () => {
  assertRecognised(SCRIPT, true, "backslash, as cased");
});

const EQUIVALENT_SPELLINGS = [
  ["forward-slash separators", () => forward(SCRIPT)],
  ["opposite-case drive letter, backslash separators", () => flipDrive(SCRIPT)],
  ["opposite-case drive letter, forward-slash separators", () => flipDrive(forward(SCRIPT))],
  ["case-swapped path, backslash separators", () => swapCase(SCRIPT)],
  ["case-swapped path, forward-slash separators", () => swapCase(forward(SCRIPT))],
];

for (const [label, spell] of EQUIVALENT_SPELLINGS) {
  test(`FSLASH: ${label} name the same file and are recognised`, { skip: NOT_WIN32, todo: TODO }, () => {
    assert.match(SCRIPT, /^[A-Za-z]:\\/u, "fixture precondition: a drive-letter script path");
    assertRecognised(spell(), true, label);
  });
}

const MUST_STAY_REFUSED = [
  ["a different file name in the same directory", () => `${forward(SCRIPT)}x`],
  ["the same file name in another directory", () => `${forward(dirname(dirname(SCRIPT)))}/other/${basename(SCRIPT)}`],
  ["the same path on another drive", () => forward(SCRIPT.replace(/^[A-Za-z]:/u, (drive) => (drive.toUpperCase() === "Q:" ? "R:" : "Q:")))],
  ["a dot-segment detour to the same file", () => `${forward(dirname(SCRIPT))}/../${basename(dirname(SCRIPT))}/${basename(SCRIPT)}`],
  ["a sibling script spelled with forward slashes", () => `${forward(dirname(SCRIPT))}/pre-push-hook-install.mjs`],
];

for (const [label, spell] of MUST_STAY_REFUSED) {
  test(`FSLASH: ${label} stays refused`, { skip: NOT_WIN32 }, () => {
    assertRecognised(spell(), false, label);
  });
}

test("FSLASH: the matching spelling plus any extra argument stays refused", { skip: NOT_WIN32 }, () => {
  for (const spelling of [SCRIPT, forward(SCRIPT)]) {
    for (const quote of QUOTES) {
      const command = `node ${quote}${spelling}${quote} --extra`;
      assert.equal(isSanctionedStartPreflightInvocation(command, ROOT), false, `extra argv, ${quote}-quoted: receipt trigger`);
      assert.equal(isSanctionedLifecycleCommand(command, ROOT), false, `extra argv, ${quote}-quoted: lifecycle admission`);
    }
  }
});

test("FSLASH: POSIX keeps one spelling -- the exact path is recognised, a case-variant is not", { skip: ON_WIN32 ? "native Windows is covered by the win32 cases" : false }, () => {
  assertRecognised(SCRIPT, true, "exact");
  assertRecognised(SCRIPT.toUpperCase(), false, "case-variant");
});
