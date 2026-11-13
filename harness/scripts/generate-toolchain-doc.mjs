#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Purpose: write docs/toolchain.md from the one tool registry (plugins/pipeline-core/lib/toolchain-registry.mjs, candidate 28e).
 * Usage:   node harness/scripts/generate-toolchain-doc.mjs            (from the repository root; then regenerate the vendored canon)
 *          node harness/scripts/generate-toolchain-doc.mjs --check    (exit 1 when the committed file differs from the registry)
 * lib/toolchain-registry.test.mjs runs the same comparison in Verify.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToolchainDoc } from "../../plugins/pipeline-core/lib/toolchain-doc.mjs";

const target = resolve(fileURLToPath(new URL("../../docs/toolchain.md", import.meta.url)));
const text = renderToolchainDoc();
if (process.argv[2] === "--check") {
  let current = null;
  try { current = readFileSync(target, "utf8"); } catch { /* absent reads as drift */ }
  process.stdout.write(current === text ? "docs/toolchain.md matches the registry\n" : "docs/toolchain.md differs from the registry: run harness/scripts/generate-toolchain-doc.mjs\n");
  process.exitCode = current === text ? 0 : 1;
} else {
  writeFileSync(target, text, "utf8");
  process.stdout.write("wrote docs/toolchain.md\n");
}
