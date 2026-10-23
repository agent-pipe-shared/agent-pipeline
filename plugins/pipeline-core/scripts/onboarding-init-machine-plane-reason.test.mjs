// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, tiles row 1/2 part 2): TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE names the home directory.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyTrustAnchorBootstrap } from "./onboarding-init.mjs";

test("K98 row 1/2: the machine-plane refusal names the unusable home directory and the repair", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "oi-machine-plane-"));
  const result = applyTrustAnchorBootstrap({
    rootDir, mode: "new", directory: join(rootDir, "keys"), humanName: "Fixture",
    env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: "relative-home-not-absolute" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE");
  assert.match(result.reason, /relative-home-not-absolute/u);
  assert.match(result.reason, /absolute home directory/u);
});
