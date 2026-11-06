import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const evidence = fileURLToPath(new URL("./linux-pair-19j-f.md", import.meta.url));

test("linux pair probe f evidence file exists and holds the fixed line", () => {
  assert.ok(existsSync(evidence), "linux-pair-19j-f.md must exist");
  assert.ok(
    readFileSync(evidence, "utf8").split(/\r?\n/).includes("linux simultaneous pair probe f"),
  );
});
