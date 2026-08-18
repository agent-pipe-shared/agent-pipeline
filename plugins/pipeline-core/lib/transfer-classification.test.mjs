#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyTransfer, DISPOSITION_SCHEMA } from "./transfer-classification.mjs";
import { ARCHIVE_SCHEMA, INVENTORY_SCHEMA } from "../scripts/check-spec-retention.mjs";

const roots = [];
let passed = 0;
let failed = 0;
const authorityKeys = ["prd", "spec", "acceptance"];
function check(name, condition, detail = "") {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "transfer-classification-"));
  roots.push(root);
  const sourcePaths = {
    prd: "specs/sentinel/prd.md",
    spec: "specs/sentinel/spec.md",
    acceptance: "specs/sentinel/acceptance.md",
  };
  const archivePaths = Object.fromEntries(authorityKeys.map((key) => [key, `docs/spec-archive/sentinel/${key}.bin`]));
  for (const key of authorityKeys) {
    write(root, sourcePaths[key], `${key} authority\n`);
    write(root, archivePaths[key], `${key} authority\n`);
  }
  const manifest = {
    schema: ARCHIVE_SCHEMA,
    id: "sentinel",
    sourcePaths,
    archivePaths,
    sha256: Object.fromEntries(authorityKeys.map((key) => [key, "irrelevant-for-this-check"])),
  };
  write(root, "docs/spec-archive/sentinel/manifest.json", JSON.stringify(manifest));
  write(root, "governance/spec-retention.json", JSON.stringify({
    schema: INVENTORY_SCHEMA,
    active: [{ id: "sentinel", sourcePaths, archiveManifest: "docs/spec-archive/sentinel/manifest.json", handoverPath: "docs/state.md", nextSessionPath: "docs/next-session.md" }],
  }));
  return { root, sourcePaths, archivePaths };
}
function disposition(root, entries) {
  write(root, "governance/transfer-dispositions.json", JSON.stringify({ schema: DISPOSITION_SCHEMA, dispositions: entries }));
}

{
  const subject = fixture();
  const result = classifyTransfer(subject.root);
  check("TC01 clears when every active authority is present", result.status === "clear", result.findings.join("; "));
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  const result = classifyTransfer(subject.root);
  check(
    "TC02 blocks an omitted active Spec with no archive and no PO disposition",
    result.status === "blocked" && result.findings.some((f) => f.includes("sentinel.spec") && f.includes("without both")),
    result.findings.join("; "),
  );
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  rmSync(join(subject.root, subject.archivePaths.spec));
  disposition(subject.root, [{ id: "sentinel", key: "spec", approvedBy: "po", approvedAt: "2026-08-18T00:00:00.000Z", reason: "recovered elsewhere" }]);
  const result = classifyTransfer(subject.root);
  check(
    "TC03 blocks an omission covered by a PO disposition but no durable archive",
    result.status === "blocked" && result.findings.some((f) => f.includes("sentinel.spec")),
    result.findings.join("; "),
  );
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  const result = classifyTransfer(subject.root);
  check(
    "TC04 blocks an omission covered by a durable archive but no recorded PO disposition",
    result.status === "blocked" && result.findings.some((f) => f.includes("sentinel.spec")),
    result.findings.join("; "),
  );
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  disposition(subject.root, [{ id: "sentinel", key: "spec", approvedBy: "po", approvedAt: "2026-08-18T00:00:00.000Z", reason: "recovered elsewhere, archived" }]);
  const result = classifyTransfer(subject.root);
  check(
    "TC05 clears an omission covered by BOTH a durable archive and a recorded PO disposition",
    result.status === "clear" && result.entries.some((e) => e.id === "sentinel" && e.key === "spec" && e.status === "omitted-covered"),
    result.findings.join("; "),
  );
}
{
  const subject = fixture();
  rmSync(join(subject.root, "governance/spec-retention.json"));
  const result = classifyTransfer(subject.root);
  check(
    "TC06 fails closed when the spec-retention inventory itself is missing",
    result.status === "blocked" && result.findings.some((f) => f.includes("inventory")),
    result.findings.join("; "),
  );
}
{
  const subject = fixture();
  rmSync(join(subject.root, subject.sourcePaths.spec));
  write(subject.root, "governance/transfer-dispositions.json", "{ not json");
  const result = classifyTransfer(subject.root);
  check(
    "TC07 treats a malformed dispositions file as zero recorded dispositions, still blocking the omission",
    result.status === "blocked" && result.findings.some((f) => f.includes("malformed")) && result.findings.some((f) => f.includes("sentinel.spec")),
    result.findings.join("; "),
  );
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`1..${passed + failed}`);
console.log(`# pass ${passed}`);
if (failed) { console.log(`# fail ${failed}`); process.exitCode = 1; }
