import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const evidence = new URL("./linux-pair-19i-c.md", import.meta.url);

test("probe c evidence file exists and contains the fixed line", () => {
  const text = readFileSync(evidence, "utf8");
  assert.ok(text.includes("linux simultaneous pair probe c"));
});
