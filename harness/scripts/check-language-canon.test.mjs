#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditLanguageCanon } from "./check-language-canon.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const script = join(scriptDir, "check-language-canon.mjs");
const marker = "<!-- DE-REFERENCE-BELOW | complete German reader copy -->";
const bilingual = ["README.md", "PIPELINE_FLOW.md", "docs/operating-model.md"];
const englishOnly = ["SETUP.md", "docs/README.md", "docs/overview.md", "docs/usage.md", "docs/migration.md"];

function fixture({ mutate } = {}) {
  const root = mkdtempSync(join(tmpdir(), "language-canon-"));
  for (const path of bilingual) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    const text = `# English authority\n\nEnglish body.\n\n${marker}\n\n# Deutsche Lesefassung\n\nDeutscher Text.\n`;
    writeFileSync(file, mutate ? mutate(path, text) : text);
  }
  for (const path of englishOnly) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "# English only\n");
  }
  return root;
}

test("Hawkeye audit passes for exactly the three bilingual user documents", () => {
  assert.deepEqual(auditLanguageCanon(repoRoot), []);
});

test("Hawkeye audit rejects missing, incomplete, and misplaced translation boundaries", () => {
  const root = fixture({
    mutate(path, text) {
      if (path === "README.md") return text.replace(marker, "");
      if (path === "PIPELINE_FLOW.md") return text.replace("# Deutsche Lesefassung", "Deutsche Lesefassung");
      return text;
    },
  });
  try {
    const findings = auditLanguageCanon(root).join("\n");
    assert.match(findings, /README\.md: expected exactly one DE-REFERENCE-BELOW marker/);
    assert.match(findings, /PIPELINE_FLOW\.md: complete German reader copy must begin after the marker/);
    writeFileSync(join(root, "SETUP.md"), `# English only\n\n${marker}\n`);
    assert.match(auditLanguageCanon(root).join("\n"), /SETUP\.md: English-only user document contains a German reference marker/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Hawkeye language scope is fixed to the three maintained bilingual docs", () => {
  const source = readFileSync(script, "utf8");
  assert.match(source, /const bilingualFrontDoors = \["README\.md", "PIPELINE_FLOW\.md", "docs\/operating-model\.md"\]/);
  assert.match(source, /const englishOnlyUserDocs = \["SETUP\.md", "docs\/README\.md", "docs\/overview\.md", "docs\/usage\.md", "docs\/migration\.md"\]/);
});
