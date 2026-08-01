#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { resolve } from "node:path";
import { discoverSbom, previewSbomMigration } from "../lib/sbom-discovery.mjs";

function usage() { return "usage: node plugins/pipeline-core/scripts/sbom-discovery.mjs --root <repository-root> [--feature <feature-id>] [--migration-preview]"; }
const args = process.argv.slice(2); let root = null; let featureId = null; let preview = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--root" && typeof args[index + 1] === "string") { root = args[++index]; continue; }
  if (args[index] === "--feature" && typeof args[index + 1] === "string") { featureId = args[++index]; continue; }
  if (args[index] === "--migration-preview") { preview = true; continue; }
  process.stderr.write(`${usage()}\n`); process.exitCode = 2; break;
}
if (process.exitCode !== 2 && root === null) { process.stderr.write(`${usage()}\n`); process.exitCode = 2; }
if (process.exitCode !== 2) { const result = preview ? previewSbomMigration(resolve(root)) : discoverSbom(resolve(root), { featureId }); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.ok === false ? 3 : 0; }
