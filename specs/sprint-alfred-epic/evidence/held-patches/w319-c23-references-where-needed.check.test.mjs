// AC-108 closest criterion: the held patch for C23-REFERENCES-WHERE-NEEDED exists, touches only the plugin, and carries each briefed addition.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patchPath = join(dirname(fileURLToPath(import.meta.url)), "w319-c23-references-where-needed.patch");
const patch = () => readFileSync(patchPath, "utf8");

test("the held patch exists and is non-empty", () => {
  assert.ok(existsSync(patchPath), "patch file exists");
  assert.ok(statSync(patchPath).size > 0, "patch file is non-empty");
});

test("every touched file is under plugins/pipeline-core/", () => {
  const files = [...patch().matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)].flatMap((m) => [m[1], m[2]]);
  assert.ok(files.length > 0, "the patch touches files");
  for (const file of files) assert.ok(file.startsWith("plugins/pipeline-core/"), `${file} is outside plugins/pipeline-core/`);
});

test("the patch carries each briefed addition", () => {
  const text = patch();
  for (const needle of ["Journeys:", "DRC-OBSERVATION-UNATTESTED", "DBG-REF-CARRIER", "narrow continuation",
    "rotate-handover-sections.mjs", "repair-map.mjs", "check-backlog-done-predicate.mjs"]) {
    assert.ok(text.includes(needle), `patch mentions ${needle}`);
  }
});
