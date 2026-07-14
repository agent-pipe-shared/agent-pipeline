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
const readerAid = "> _A German version follows below · Eine deutsche Fassung folgt weiter unten._";
const marker = "<!-- DE-REFERENCE-BELOW -->";
const frontDoors = ["README.md", "SETUP.md", "docs/overview.md", "docs/usage.md"];
const targets = new Map([
  ["README.md", "docs/deploy/README.md"],
  ["SETUP.md", "docs/design/README.md"],
  ["docs/overview.md", "../README.md"],
  ["docs/usage.md", "../SETUP.md"],
]);

function fixture({ mutate } = {}) {
  const root = mkdtempSync(join(tmpdir(), "language-canon-"));
  for (const path of frontDoors) {
    const file = join(root, path);
    const text = `# English front door\n\n${readerAid}\n\nEnglish body.\n\n${marker}\n\n# Deutsch\n\n[Reference](${targets.get(path)})\n`;
    const directory = dirname(file);
    if (directory !== root) mkdirSync(directory, { recursive: true });
    writeFileSync(file, mutate ? mutate(path, text) : text);
  }
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n");
  mkdirSync(join(root, "docs", "deploy"), { recursive: true });
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "deploy", "README.md"), "# Deploy\n");
  writeFileSync(join(root, "docs", "design", "README.md"), "# Design\n");
  return root;
}

test("P4 audit passes for the four ADR-0011 front doors and the docs index", () => {
  assert.deepEqual(auditLanguageCanon(repoRoot), []);
});

test("P4 audit rejects missing markers, wrong order, and invalid local reader-aid targets", () => {
  const root = fixture({
    mutate(path, text) {
      if (path === "README.md") return text.replace(marker, "");
      if (path === "SETUP.md") return text.replace(marker, "").replace(readerAid, `${marker}\n\n${readerAid}`);
      return text.replace(`[Reference](${targets.get(path)})`, "");
    },
  });
  try {
    const findings = auditLanguageCanon(root).join("\n");
    assert.match(findings, /README\.md: expected exactly one DE-REFERENCE-BELOW marker/);
    assert.match(findings, /SETUP\.md: expected reader aid before the post-English-body marker/);
    assert.match(findings, /docs\/overview\.md: German reader-aid reference lacks its fixed local link target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("P4 audit's deliberately fixed scope remains four front doors plus docs index", () => {
  const source = readFileSync(script, "utf8");
  const scope = source.match(/const frontDoors = \[([^\]]+)\];/);
  assert(scope);
  assert.deepEqual([...scope[1].matchAll(/"(?:README\.md|SETUP\.md|docs\/(?:overview|usage)\.md)"/g)].map((match) => match[0]), [
    '"README.md"',
    '"SETUP.md"',
    '"docs/overview.md"',
    '"docs/usage.md"',
  ]);
  assert.match(source, new RegExp(readerAid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /const docsReadme = "docs\/README\.md"/);
});
