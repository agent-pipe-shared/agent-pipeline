import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("./linux-pair-19i-d.md", import.meta.url));

test("probe d evidence file exists and contains the fixed line", () => {
  assert.ok(existsSync(target), "linux-pair-19i-d.md exists");
  assert.ok(
    readFileSync(target, "utf8").split(/\r?\n/).includes("linux simultaneous pair probe d"),
    "contains the fixed line",
  );
});
