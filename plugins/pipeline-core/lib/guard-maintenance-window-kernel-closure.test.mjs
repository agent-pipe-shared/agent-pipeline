#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-maintenance-window-kernel-closure.test.mjs -- static invariant proving
 * `NEVER_LIFTABLE_KERNEL_PATHS` (lib/guard-maintenance-window.mjs) is transitively
 * CLOSED under first-party relative imports: for every kernel path, every module it
 * imports (recursively) via a relative specifier is ALSO a kernel path.
 *
 * WHY THIS TEST EXISTS (NVA-A7FIX-2, fixing Critic F-2 against NVA-A7FIX-1): a hand-
 * maintained enumeration keeps reproducing this exact bug shape -- a fix closes the
 * specific hole a reviewer happened to find (F-2: `critical-human-proof-policy.mjs`
 * itself imports `yaml-lite.mjs`/`runner-profiles-v3.mjs`/
 * `critical-action-approval-request.mjs`, none of which were listed) and leaves the
 * NEXT import hop open. This test makes the closure self-enforcing: it fails on ANY
 * future edit that adds an import to a kernel file without also adding the imported
 * module to the kernel list, closing the class of bug rather than one instance of it.
 *
 * SCANNER: a plain regex over `import ... from "(...)"` / `export ... from "(...)"`
 * clauses -- no AST dependency, matching this codebase's existing comfort with pure
 * string/regex logic (see git-cmd.mjs's own header). The character class between the
 * keyword and `from` is restricted to what a real import/export clause can contain
 * (identifiers, `,`, `{`, `}`, `*`, whitespace), so a non-greedy match can never skip
 * over unrelated code to a distant, unconnected `from "..."` elsewhere in the file.
 * This also makes the regex NOT anchored to one line, so a multi-line
 * `import {\n  a,\n  b,\n} from "./x.mjs";` is matched exactly like its single-line
 * form. Side-effect-only `import "./x.mjs";` (no binding, no `from`) is matched
 * separately. `node:*` builtins and bare/package specifiers are ignored (never
 * first-party, never resolvable to a repo-relative path). Only `.mjs`/`.js` kernel
 * entries are parsed for imports -- `hooks.json` and `project/critical-human-proof.json`
 * have none.
 *
 * FAILS CLOSED on a shape it cannot classify: a dynamic `import(` call anywhere in a
 * kernel file's source aborts this check with a named-file diagnostic instead of
 * silently proceeding -- a silently-skipped file would defeat the entire point of this
 * test (a missed dynamic import is exactly the kind of hole a hand-maintained
 * enumeration already produced once).
 *
 * Run: node plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { NEVER_LIFTABLE_KERNEL_PATHS, isNeverLiftableKernelPath } from "./guard-maintenance-window.mjs";

// plugins/pipeline-core/lib/ -> plugins/pipeline-core/ -> plugins/ -> <repo root>
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const IMPORT_FROM_RE = /\b(?:import|export)\s+[A-Za-z0-9_$,{}*\s]*?\bfrom\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/gm;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;

/** Every first-party (relative-specifier) import ONE kernel file's source declares. */
function relativeImportSpecifiers(absPath, repoRelativePath) {
  const source = readFileSync(absPath, "utf8");
  if (DYNAMIC_IMPORT_RE.test(source)) {
    throw new Error(
      `${repoRelativePath} contains a dynamic import() the static scanner cannot classify -- ` +
      "this shape must be resolved by hand (name the target module and add it to " +
      "NEVER_LIFTABLE_KERNEL_PATHS if first-party), not silently skipped.",
    );
  }
  const specs = new Set();
  let match;
  IMPORT_FROM_RE.lastIndex = 0;
  while ((match = IMPORT_FROM_RE.exec(source)) !== null) specs.add(match[1]);
  SIDE_EFFECT_IMPORT_RE.lastIndex = 0;
  while ((match = SIDE_EFFECT_IMPORT_RE.exec(source)) !== null) specs.add(match[1]);
  const relativeSpecs = [];
  for (const spec of specs) {
    if (spec.startsWith("./") || spec.startsWith("../")) relativeSpecs.push(spec);
  }
  return relativeSpecs;
}

/** Resolve a relative import specifier against the importing file's OWN repo-relative path. */
function resolveRepoRelative(fromRepoRelativePath, specifier) {
  const dir = dirname(fromRepoRelativePath);
  return normalize(join(dir, specifier)).split(sep).join("/");
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
    failed += 1;
  }
}

check("GMWKC01 NEVER_LIFTABLE_KERNEL_PATHS is transitively closed under first-party relative imports", () => {
  const kernelSet = new Set(NEVER_LIFTABLE_KERNEL_PATHS);
  const missing = [];
  const visited = new Set();
  const queue = [...NEVER_LIFTABLE_KERNEL_PATHS];
  while (queue.length > 0) {
    const relPath = queue.shift();
    if (visited.has(relPath)) continue;
    visited.add(relPath);
    // hooks.json / project/critical-human-proof.json: not JS, no imports to walk.
    if (!relPath.endsWith(".mjs") && !relPath.endsWith(".js")) continue;
    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) {
      throw new Error(`${relPath} is listed in NEVER_LIFTABLE_KERNEL_PATHS but does not exist on disk.`);
    }
    for (const spec of relativeImportSpecifiers(absPath, relPath)) {
      const resolved = resolveRepoRelative(relPath, spec);
      if (!kernelSet.has(resolved)) {
        missing.push(`${relPath} imports "${spec}" -> ${resolved}, which is NOT in NEVER_LIFTABLE_KERNEL_PATHS`);
      }
      // Recurse regardless of membership: a missing transitive dependency of a missing
      // transitive dependency must ALSO surface as its own failure line, not just the
      // first hop -- otherwise fixing hop 1 could still leave hop 2 undiscovered.
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  assert.equal(
    missing.length,
    0,
    `NEVER_LIFTABLE_KERNEL_PATHS is not transitively closed (${missing.length} missing edge(s)):\n${missing.join("\n")}`,
  );
});

check("GMWKC02 PLUGIN_KERNEL_SUFFIXES/PROJECT_KERNEL_PATHS derive correctly from the extended array (both anchors)", () => {
  // Project-root anchor: this real, self-hosted checkout (ADR-0015 self-application) --
  // `plugins/pipeline-core/lib/entrypoint.mjs` is one of the paths this dispatch adds.
  assert.equal(
    isNeverLiftableKernelPath(join(REPO_ROOT, "plugins", "pipeline-core", "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT }),
    true,
    "a newly added plugins/pipeline-core/... entry must be reachable via the project-root anchor (PROJECT_KERNEL_PATHS/PLUGIN_KERNEL_SUFFIXES re-derived from the extended array)",
  );
  assert.equal(
    isNeverLiftableKernelPath(join(REPO_ROOT, "plugins", "pipeline-core", "lib", "guard-git.mjs"), { rootDir: REPO_ROOT }),
    false,
    "an ordinary, non-kernel plugin file must still not be claimed as kernel",
  );
  // Plugin-root anchor: a globally-installed copy whose live plugin root is NOT inside
  // rootDir at all -- only reachable via the livePluginRoot parameter's grandparent
  // (mirrors guard-maintenance-window.test.mjs's own GMW08 pattern).
  const globalRoot = mkdtempSync(join(tmpdir(), "gmwkc-global-"));
  const globalPluginRoot = join(globalRoot, "marketplace", "plugins", "pipeline-core");
  mkdirSync(join(globalPluginRoot, "lib"), { recursive: true });
  assert.equal(
    isNeverLiftableKernelPath(join(globalPluginRoot, "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT }),
    false,
    "unreachable via rootDir alone",
  );
  assert.equal(
    isNeverLiftableKernelPath(join(globalPluginRoot, "lib", "entrypoint.mjs"), { rootDir: REPO_ROOT, livePluginRoot: globalPluginRoot }),
    true,
    "must be caught via the livePluginRoot anchor once entrypoint.mjs is a kernel path",
  );
});

console.log(`\nguard-maintenance-window-kernel-closure: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
