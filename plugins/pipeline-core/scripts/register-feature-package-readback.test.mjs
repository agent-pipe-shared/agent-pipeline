// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PUSH_THREAT_MODEL_FILE } from "../lib/close-chain-guide.mjs";
import { pushThreatModelReadback } from "./register-feature-package.mjs";

const roots = [];
test.after(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });
const tempRoot = () => { const dir = mkdtempSync(join(tmpdir(), "rfp-")); roots.push(dir); return dir; };

test("RFPR1: a missing push threat model is reported with the command and where its output belongs", () => {
  const readback = pushThreatModelReadback(tempRoot());
  assert.equal(readback.path, "project/push-threat-model.md");
  assert.equal(readback.path, PUSH_THREAT_MODEL_FILE);
  assert.equal(readback.present, false);
  assert.equal(readback.materializeCommand, "node <plugin-root>/scripts/pipeline-state.mjs materialize-push-threat-model");
  assert.match(readback.commitWith, /same draft commit/u);
  assert.match(readback.commitWith, /before the item binding/u);
  assert.match(readback.why, /second round/u);
});

test("RFPR2: an existing push threat model is reported present and names no command", () => {
  const root = tempRoot();
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, PUSH_THREAT_MODEL_FILE), "# threat model\n");
  assert.deepEqual(pushThreatModelReadback(root), { path: "project/push-threat-model.md", present: true });
});

test("RFPR3: the readback is advice only and writes nothing", () => {
  const root = tempRoot();
  pushThreatModelReadback(root);
  pushThreatModelReadback(root);
  assert.throws(() => writeFileSync(join(root, "project", "x"), "x"), /ENOENT/u, "no project directory was created by the readback");
});
