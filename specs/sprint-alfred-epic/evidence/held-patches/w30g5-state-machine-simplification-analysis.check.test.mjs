// Check for the held patch w30g5 (slice C30G-SM1): the state-machine simplification analysis.
//
// The patch is a delta on the integrated candidate 30h plus 30i tree (see the notes for the apply
// order), so this check does NOT run `git apply` against the repository: it proves that the patch
// exists, is non-empty, and touches exactly the one briefed document and nothing else.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH = join(HERE, "w30g5-state-machine-simplification-analysis.patch");
const ALLOWED = Object.freeze(["specs/sprint-alfred-epic/plans/state-machine-simplification-analysis-2026-11-17.md"]);
const LIMIT = { timeout: 60_000 };

function touchedPaths(text) {
  const paths = new Set();
  for (const line of text.split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (header) { paths.add(header[1]); paths.add(header[2]); }
  }
  return [...paths].sort();
}

test("w30g5: the held patch exists and is non-empty", LIMIT, () => {
  const stat = statSync(PATCH);
  assert.equal(stat.isFile(), true, "the patch is a regular file");
  assert.ok(stat.size > 0, "the patch is non-empty");
  assert.match(readFileSync(PATCH, "utf8"), /^diff --git /mu, "the patch carries at least one file header");
});

test("w30g5: the held patch touches only the one analysis document", LIMIT, () => {
  const text = readFileSync(PATCH, "utf8");
  assert.deepEqual(touchedPaths(text), [...ALLOWED]);
  // The document is new: the patch adds it and deletes or renames nothing.
  assert.match(text, /^new file mode /mu, "the document is added as a new file");
  assert.doesNotMatch(text, /^(deleted file mode|rename from|rename to) /mu, "nothing is deleted or renamed");
});
