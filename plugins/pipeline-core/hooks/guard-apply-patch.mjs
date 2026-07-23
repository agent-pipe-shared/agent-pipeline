#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Extract apply_patch paths and run the existing write-path guards per path. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GUARDS = [
  fileURLToPath(new URL("./guard-testpath.mjs", import.meta.url)),
  fileURLToPath(new URL("./guard-devplan.mjs", import.meta.url)),
];
function block(reason) {
  process.stderr.write(`BLOCKED (guard-apply-patch, plugin pipeline-core): ${reason}\n`);
  process.exit(2);
}
let input;
try { input = JSON.parse(readFileSync(0, "utf8")); }
catch { block("apply_patch input is not valid JSON."); }
const toolName = String(input?.tool_name ?? "");
const command = typeof input?.tool_input?.command === "string" ? input.tool_input.command : "";
if (toolName !== "apply_patch") process.exit(0);
if (command === "") block("apply_patch command is missing or malformed.");

const lines = command.replace(/\r\n/g, "\n").split("\n");
const first = lines.findIndex((line) => line !== "");
let last = lines.length - 1;
while (last >= 0 && lines[last] === "") last--;
if (first < 0 || lines[first] !== "*** Begin Patch" || lines[last] !== "*** End Patch") block("apply_patch envelope is missing or ambiguous.");

const paths = [];
let operation = null;
let beginCount = 0;
let endCount = 0;
for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  if (line === "*** Begin Patch") { beginCount++; if (index !== first || beginCount > 1) block(`ambiguous Begin Patch header at line ${index + 1}.`); continue; }
  if (line === "*** End Patch") { endCount++; if (index !== last || endCount > 1) block(`ambiguous End Patch header at line ${index + 1}.`); continue; }
  const header = line.match(/^\*\*\* (Add File|Update File|Delete File|Move to):(.*)$/);
  if (header) {
    const kind = header[1];
    const suffix = header[2];
    if (!suffix.startsWith(" ") || suffix.startsWith("  ")) block(`ambiguous ${kind} path at line ${index + 1}.`);
    const filePath = suffix.slice(1);
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    if (filePath === "" || filePath !== filePath.trim() || filePath.includes("\0") || normalized.endsWith("/") || normalized.includes("//") || segments.some((segment) => [".", ".."].includes(segment))) block(`empty, traversal, or ambiguous ${kind} path at line ${index + 1}.`);
    if (kind === "Move to" && operation !== "Update File") block(`Move to header without a preceding Update File at line ${index + 1}.`);
    operation = kind;
    paths.push(filePath);
    continue;
  }
  if (line.startsWith("*** ")) block(`unknown or ambiguous patch header at line ${index + 1}: ${line}`);
  if (index > first && index < last && operation === null) {
    block(`patch content appears before the first file operation at line ${index + 1}.`);
  }
}
if (beginCount !== 1 || endCount !== 1 || paths.length === 0) block("non-empty apply_patch payload contains no unambiguous file paths.");

let exitCode = 0;
const stderr = [];
for (const filePath of paths) {
  for (const guard of GUARDS) {
    const result = spawnSync(process.execPath, [guard], {
      cwd: process.cwd(), env: process.env, encoding: "utf8",
      input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath } }),
    });
    if (result.stderr) stderr.push(result.stderr.trimEnd());
    if (result.status === 2) exitCode = 2;
    else if (result.status === 1 && exitCode === 0) exitCode = 1;
    else if (![0, 1, 2].includes(result.status)) { exitCode = 2; stderr.push(`[guard-apply-patch] Guard failed for ${filePath}.`); }
  }
}
if (stderr.length > 0) process.stderr.write(`${stderr.filter(Boolean).join("\n")}\n`);
process.exit(exitCode);
