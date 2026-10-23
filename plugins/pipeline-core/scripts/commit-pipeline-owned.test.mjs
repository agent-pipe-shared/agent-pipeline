// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 7/7): a CPO-FOREIGN-CHANGES refusal for the push-approval record
// names the working form. Message-only: no new write right, the refusal code and shape stay.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commitPipelineOwned } from "./commit-pipeline-owned.mjs";

function refusedFor(statusOut) {
  const root = mkdtempSync(join(tmpdir(), "cpo-k98-"));
  const spawn = (_cmd, args) => (args.includes("status")
    ? { status: 0, stdout: statusOut, stderr: "" }
    : { status: 0, stdout: "", stderr: "" });
  return commitPipelineOwned(["--root", root, "--agent"], { spawn });
}

test("K98 row 7/7: the push-approval record refusal names the fold and the admitted trailer form", () => {
  const result = refusedFor(" M project/pipeline-state.json\n");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.others, ["project/pipeline-state.json"]);
  assert.match(result.reason, /push-prepare/u);
  assert.match(result.reason, /do not commit it by hand/u);
  assert.match(result.reason, /Dispatch: stage-0 \(elephant\)/u);
});

test("K98 row 7/7: a refusal for any other foreign file keeps the plain reason", () => {
  const result = refusedFor(" M other.txt\n");
  assert.equal(result.code, "CPO-FOREIGN-CHANGES");
  assert.doesNotMatch(result.reason, /push-prepare/u);
  assert.match(result.reason, /commits only the Pipeline's own state files/u);
});
