// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w261 (C20-G2030-NO-REASK): the patch exists, is non-empty, touches only plugins/pipeline-core/ and carries the
// answered-values readback with its typed re-ask refusal, the signed-proof wait with its guard admission, and the signing steps that use it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = readFileSync(join(here, "w261-c20-no-reask.patch"), "utf8");
const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);

test("w261 patch exists, is non-empty and touches only plugins/pipeline-core/", () => {
  assert.ok(patch.length > 0);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/"), `outside plugins/pipeline-core/: ${file}`);
  for (const needed of [
    "plugins/pipeline-core/lib/answered-intake-values.mjs",
    "plugins/pipeline-core/lib/signed-proof-wait.mjs",
    "plugins/pipeline-core/scripts/proof-wait.mjs",
    "plugins/pipeline-core/scripts/resume-hint.mjs",
    "plugins/pipeline-core/skills/pipeline-start/references/resume-hint.md",
    "plugins/pipeline-core/scripts/pipeline-state.mjs",
    "plugins/pipeline-core/lib/guard/command-catalogue.mjs",
    "plugins/pipeline-core/lib/guard/constants.mjs",
    "plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs",
  ]) assert.ok(files.includes(needed), needed);
});

test("w261 patch carries the typed re-ask refusal, the bounded proof wait and its guard admission", () => {
  for (const needle of [
    "INTAKE-REASK-REFUSED", "readAnsweredIntakeValues", "reaskViolations", "answeredValues",
    "PROOF-WAIT-TIMEOUT", "PROOF-WAIT-INVALID", "PROOF-WAIT-ARGS", "awaitSignatureFields", "reportBackRequired",
    "sanctionedProofWaitArgs", "PROOF_WAIT_SCRIPT",
  ]) assert.ok(patch.includes(needle), needle);
  // The wait is read-only: it must not import a signer or any writer.
  assert.doesNotMatch(patch, /^\+.*(writeFileSync|appendFileSync|unlinkSync|rmSync)/m);
});
