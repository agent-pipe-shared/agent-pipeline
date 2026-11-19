#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// C31-M7 (AC-112 binding, stage 1 of the browser smoke in Verify): unit cases of the dispatcher scripts/browser-smoke-check.mjs.
// Marker-file commands only: no real browser is started. The preflight probe is injected through the existing `spawnFn` seam of
// preflightBrowserEvidence. NOT YET REGISTERED in the Verify suite list (harness/verify-suites.json is protected): registration is a PO step.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BROWSER_SMOKE_ID, runConsumerVerifyCheck } from "./browser-smoke-check.mjs";

const MARKER_COMMAND = 'node -e "require(\'fs\').writeFileSync(\'smoke-ran\', \'yes\')"';
const probe = (state) => ({ spawnFn: () => ({ status: 0, stdout: JSON.stringify({ state }) }) });
const configuration = (command) => () => ({ baseline: [], areas: [{ id: "web", paths: ["web/**"], commands: command === null ? [] : [{ id: BROWSER_SMOKE_ID, command }] }] });

function harness(command, state) {
  const rootDir = mkdtempSync(join(tmpdir(), "browser-smoke-check-"));
  const out = [];
  const err = [];
  let probed = 0;
  const deps = {
    rootDir,
    readConfiguration: configuration(command),
    preflightDeps: { spawnFn: (...args) => { probed += 1; return probe(state).spawnFn(...args); } },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  };
  return { rootDir, deps, text: () => [...out, ...err].join("\n"), probed: () => probed, marker: () => existsSync(join(rootDir, "smoke-ran")), done: () => rmSync(rootDir, { recursive: true, force: true }) };
}

test("a project without the reserved entry gets 'not applicable', exit 0, no probe and no command", () => {
  const h = harness(null, "ready");
  try {
    assert.equal(runConsumerVerifyCheck("browser-smoke", h.deps), 0);
    assert.match(h.text(), /browser smoke: not applicable/u);
    assert.equal(h.probed(), 0, "no browser capability probe without a declared smoke");
    assert.equal(h.marker(), false);
  } finally { h.done(); }
});

test("probe ready and the command exits 0: the step passes and the command ran", () => {
  const h = harness(MARKER_COMMAND, "ready");
  try {
    assert.equal(runConsumerVerifyCheck("browser-smoke", h.deps), 0);
    assert.equal(h.probed(), 1);
    assert.equal(h.marker(), true, "the declared command ran after a ready preflight");
    assert.doesNotMatch(h.text(), /browser smoke failed|browser verification pending/u);
  } finally { h.done(); }
});

test("probe ready and the command exits non-zero: 'browser smoke failed', never the unavailable text", () => {
  const h = harness('node -e "process.exit(7)"', "ready");
  try {
    assert.equal(runConsumerVerifyCheck("browser-smoke", h.deps), 7, "the command's own exit code is the step result");
    assert.match(h.text(), /browser smoke failed/u);
    assert.doesNotMatch(h.text(), /no browser test ran|browser verification pending|BEP-/u, "a product failure is not read as a missing browser");
  } finally { h.done(); }
});

const UNAVAILABLE_STATES = [
  { state: "package-missing", code: "BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE", step: /Playwright dev dependency/u },
  { state: "browser-missing", code: "BEP-CHROMIUM-UNAVAILABLE", step: /npx playwright install chromium/u },
  { state: "host-dependency-missing", code: "BEP-BROWSER-HOST-DEPENDENCY-UNAVAILABLE", step: /npx playwright install-deps chromium/u },
  { state: "browser-launch-failed", code: "BEP-CHROMIUM-LAUNCH-UNAVAILABLE", step: /human operator/u },
  { state: "probe-error", code: "BEP-BROWSER-PROBE-FAILED", step: /browser-evidence-preflight\.mjs --root \./u },
];

for (const { state, code, step } of UNAVAILABLE_STATES) {
  test(`unavailable state ${state}: non-zero, command not run, typed code, the pending words and one named human step`, () => {
    const h = harness(MARKER_COMMAND, state);
    try {
      assert.equal(runConsumerVerifyCheck("browser-smoke", h.deps), 1);
      assert.equal(h.marker(), false, "the command must not run when no browser is available");
      const text = h.text();
      assert.ok(text.includes(code), text);
      assert.match(text, /no browser test ran; this is not a product failure/u);
      assert.match(text, /browser verification pending/u);
      assert.doesNotMatch(text, /browser smoke failed/u);
      const humanSteps = text.split("\n").filter((line) => /^human step: \S.{15,}/u.test(line));
      assert.equal(humanSteps.length, 1, "exactly one human step per unavailable state");
      assert.match(humanSteps[0], step);
    } finally { h.done(); }
  });
}

test("an unknown check name and a configuration that cannot be read are refused with a message, never a pass", () => {
  const h = harness(MARKER_COMMAND, "ready");
  try {
    assert.equal(runConsumerVerifyCheck("something-else", h.deps), 1);
    assert.match(h.text(), /unknown browser smoke Verify check: something-else/u);
    const broken = { ...h.deps, readConfiguration: () => { throw new Error("VEP-IMPACT-CONFIG: invalid root."); } };
    assert.equal(runConsumerVerifyCheck("browser-smoke", broken), 1);
    assert.equal(h.marker(), false);
    assert.match(h.text(), /VEP-IMPACT-CONFIG/u);
  } finally { h.done(); }
});
