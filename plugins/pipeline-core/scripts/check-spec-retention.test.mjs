#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpecRetention, ARCHIVE_SCHEMA, INVENTORY_SCHEMA } from "./check-spec-retention.mjs";

const roots = [];
let passed = 0;
let failed = 0;
const authorityKeys = ["prd", "spec", "acceptance", "design", "recovery", "platformSupport", "windowsBlockers"];
function check(name, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function sha(root, path) { return createHash("sha256").update(readFileSync(join(root, path))).digest("hex"); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "spec-retention-"));
  roots.push(root);
  const sourcePaths = {
    prd: "specs/sentinel/prd.md",
    spec: "specs/sentinel/spec.md",
    acceptance: "specs/sentinel/acceptance.md",
    design: "specs/sentinel/design.md",
    recovery: "specs/sentinel/RECOVERY.md",
    platformSupport: "specs/sentinel/platform-support-contract.md",
    windowsBlockers: "specs/sentinel/windows-blockers-scope.md",
  };
  const archivePaths = Object.fromEntries(authorityKeys.map((key) => [key, `docs/spec-archive/sentinel/${key}.bin`]));
  for (const key of authorityKeys) {
    write(root, sourcePaths[key], `${key} authority\n`);
    write(root, archivePaths[key], `${key} authority\n`);
  }
  write(root, "docs/state.md", Object.values(sourcePaths).join("\n"));
  write(root, "docs/next-session.md", `${Object.values(sourcePaths).join("\n")}\n`);
  const manifest = {
    schema: ARCHIVE_SCHEMA,
    id: "sentinel",
    sourcePaths,
    archivePaths,
    sha256: Object.fromEntries(authorityKeys.map((key) => [key, sha(root, sourcePaths[key])])),
  };
  write(root, "docs/spec-archive/sentinel/manifest.json", JSON.stringify(manifest));
  write(root, "governance/spec-retention.json", JSON.stringify({
    schema: INVENTORY_SCHEMA,
    active: [{ id: "sentinel", sourcePaths, archiveManifest: "docs/spec-archive/sentinel/manifest.json", handoverPath: "docs/state.md", nextSessionPath: "docs/next-session.md" }],
  }));
  return { root, sourcePaths, archivePaths };
}

{
  const subject = fixture();
  const result = checkSpecRetention(subject.root);
  check("SR01 accepts complete active authority and byte-identical archive", result.ok, result.findings.join("; "));
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  const result = checkSpecRetention(subject.root);
  check("SR02 rejects omitted active Spec even when an archive copy remains", !result.ok && result.findings.some((finding) => finding.includes("sentinel.spec authority")), result.findings.join("; "));
}
{
  const subject = fixture();
  writeFileSync(join(subject.root, subject.archivePaths.design), "changed archive\n");
  const result = checkSpecRetention(subject.root);
  check("SR03 rejects archive byte drift", !result.ok && result.findings.some((finding) => finding.includes("archive bytes differ")), result.findings.join("; "));
}
{
  const subject = fixture();
  writeFileSync(join(subject.root, "docs/next-session.md"), `${subject.sourcePaths.prd}\n`);
  const result = checkSpecRetention(subject.root);
  check("SR04 requires the next-session entry point to link every active authority", !result.ok && result.findings.some((finding) => finding.includes("nextSessionPath must link")), result.findings.join("; "));
}
{
  const subject = fixture();
  writeFileSync(join(subject.root, "docs/spec-archive/sentinel/manifest.json"), "{}\n");
  const result = checkSpecRetention(subject.root);
  check("SR05 rejects an unbound archive manifest", !result.ok && result.findings.some((finding) => finding.includes("archive manifest shape")), result.findings.join("; "));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`1..${passed + failed}`);
console.log(`# pass ${passed}`);
if (failed) { console.log(`# fail ${failed}`); process.exitCode = 1; }
