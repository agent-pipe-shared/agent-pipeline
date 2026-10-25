// SPDX-License-Identifier: SUL-1.0
// The aggregate entry runs only the G6 envelope matrix, never the broad adapter
// suite's unrelated native-dispatch and receipt fixtures.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { devNull } from "node:os";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ fd, maxBytes: 65536, cases: [{
  id: "G6AGG001",
  name: "native aggregate envelopes produce all 12 intended primary denials",
  run() {
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL("./antigravity-pretool-guard.test.mjs", import.meta.url)), "--g6-aggregate",
    ], { cwd: process.cwd(), encoding: "utf8", shell: false, timeout: 900000, maxBuffer: 1048576 });
    process.stdout.write(child.stdout ?? "");
    process.stderr.write(child.stderr ?? "");
    assert.ifError(child.error);
    assert.equal(child.signal, null, "aggregate child terminated by signal");
    assert.equal(child.status, 0, "aggregate child must finish successfully");
    const results = child.stdout.split("\n").filter(line => line.startsWith('{"schema":"pipeline.g6-aggregate-result.v1"'));
    assert.equal(results.length, 1, "aggregate child must report exactly one complete result");
    assert.deepEqual(JSON.parse(results[0]), {
      schema: "pipeline.g6-aggregate-result.v1", primaryDenials: 12, expectedDenials: 12,
    });
    assert.equal(child.stdout.split("\n").filter(line => /^G6 aggregate .+: intended denial$/u.test(line)).length, 12);
  },
}] });
