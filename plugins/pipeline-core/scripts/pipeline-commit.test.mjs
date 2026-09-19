import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "./pipeline-commit.mjs";
test("CLI parser requires a canonical dispatch record and refuses caller-supplied attribution", () => {
  assert.equal(parse(["--type", "fix", "--scope", "x", "--message", "m", "--dispatch-record", "evidence/dispatch-record-T.json"]).dispatchRecord, "evidence/dispatch-record-T.json");
  assert.throws(() => parse(["--type", "fix", "--scope", "x", "--message", "m", "--dispatch-task", "T", "--dispatch-role", "goldfish"]), /usage/u);
  assert.throws(() => parse(["--type", "fix", "--scope", "x", "--message", "m"]), /usage/u);
});
