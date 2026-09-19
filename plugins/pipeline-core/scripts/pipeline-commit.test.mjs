import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "./pipeline-commit.mjs";
test("CLI parser requires explicit dispatch identity", () => { assert.equal(parse(["--type", "fix", "--scope", "x", "--message", "m", "--dispatch-task", "T", "--dispatch-role", "goldfish"]).dispatchTask, "T"); assert.throws(() => parse(["--type", "fix", "--scope", "x", "--message", "m"]), /usage/u); });
