// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { checkRunnerManifestParity } from "./check-runner-manifest-parity.mjs";
import { resolve } from "node:path";

test("checkRunnerManifestParity", () => {
  const root = resolve(".");
  const res = checkRunnerManifestParity(resolve(root, "plugins/pipeline-core"));
  assert.ok(res.ok, res.error);
});
