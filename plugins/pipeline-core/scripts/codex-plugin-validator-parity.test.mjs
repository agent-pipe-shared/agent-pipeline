// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classifyCodexPluginValidatorParity } from "./codex-plugin-validator-parity.mjs";

const SCRIPT = fileURLToPath(new URL("./codex-plugin-validator-parity.mjs", import.meta.url));
const SHA = "a".repeat(64);
const available = (status, version = "test-v1") => ({ status, version, evidenceSha256: SHA });
const unavailable = { status: "unavailable", version: null, evidenceSha256: null };
const observation = (generic, native) => ({
  schema: "pipeline.codex-plugin-validator-observation.v1",
  fixtureSha256: SHA,
  generic,
  native,
});

assert.deepEqual(classifyCodexPluginValidatorParity(observation(available("accepted"), available("accepted"))), {
  schema: "pipeline.codex-plugin-validator-parity.v1", status: "aligned", code: "VALIDATOR-PARITY-ALIGNED", mutation: "none",
});
assert.equal(classifyCodexPluginValidatorParity(observation(available("accepted"), available("rejected"))).code, "VALIDATOR-PARITY-MISMATCH");
assert.equal(classifyCodexPluginValidatorParity(observation(unavailable, available("accepted"))).code, "GENERIC-VALIDATOR-UNAVAILABLE");
assert.equal(classifyCodexPluginValidatorParity(observation(available("accepted"), unavailable)).code, "NATIVE-VALIDATOR-UNAVAILABLE");
assert.equal(classifyCodexPluginValidatorParity({}).code, "VALIDATOR-OBSERVATION-INVALID");

const cli = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(observation(unavailable, available("accepted"))), encoding: "utf8" });
assert.equal(cli.status, 1);
assert.deepEqual(JSON.parse(cli.stdout), classifyCodexPluginValidatorParity(observation(unavailable, available("accepted"))));
process.stdout.write("codex-plugin-validator-parity: 6 checks passed\n");
