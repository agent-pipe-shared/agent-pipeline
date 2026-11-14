// SPDX-License-Identifier: SUL-1.0
// Candidate 29d pre-export run: ADR-0100 grew scripts/pipeline-state.mjs to 1,050,379 bytes, past the session authority's source-entry
// bound (SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes, 1 MiB). Reading it as an installed participant source then refused with
// WIN-AUTH-SIZE (session-authority-registry-fewer-checks C19I-W238-1/2/5 red). The route moved to lib/verify-replacement.mjs. This pin
// makes the next overrun show at the edit, with a margin, instead of in a late suite run.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SESSION_AUTHORITY_LIMITS } from "../session-authority-registry.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MARGIN_BYTES = 4096;

function shippedModules(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...shippedModules(path));
    else if (entry.isFile() && /\.(?:mjs|cjs|js)$/u.test(entry.name) && !/\.test\.(?:mjs|cjs|js)$/u.test(entry.name)) out.push(path);
  }
  return out;
}

test("the guarded bound is the 1 MiB source-entry bound, and the walk reaches the largest module", () => {
  assert.equal(SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes, 1048576, "the bound this pin guards changed; re-check the margin and the native Windows reader's own clamp");
  assert.ok(shippedModules(PLUGIN_ROOT).some((path) => path.endsWith(join("scripts", "pipeline-state.mjs"))), "the largest module is part of the walk");
});

test("every shipped plugin module stays at least 4 KiB below the session authority's source-entry bound", () => {
  const bound = SESSION_AUTHORITY_LIMITS.maxSourceEntryBytes;
  const modules = shippedModules(PLUGIN_ROOT);
  const over = modules.map((path) => ({ path: relative(PLUGIN_ROOT, path), size: statSync(path).size })).filter(({ size }) => size > bound - MARGIN_BYTES);
  assert.deepEqual(over, [], `modules within ${MARGIN_BYTES} bytes of the ${bound}-byte bound: move code out (as ADR-0100's replace route moved to lib/verify-replacement.mjs) instead of raising the bound`);
});
