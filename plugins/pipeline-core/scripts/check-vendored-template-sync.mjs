#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * check-vendored-template-sync.mjs -- a cheap, standalone guard against the vendored dispatch
 * templates drifting from their canonical counterparts.
 *
 * WHY. backlog/items/2026-08-18-vendored-dispatch-templates-drift-from-canon.md: the canonical
 * dispatch templates at `templates/prompts/goldfish-task.md` and
 * `templates/prompts/critic-review.md` are what CLAUDE.md's "Dispatch from the template, never
 * freehand" rule requires every dispatch to be built from. The plugin also vendors its own
 * copies at `plugins/pipeline-core/templates/prompts/{goldfish-task,critic-review}.md` for
 * installed-plugin use, and nothing previously enforced byte-equality between the two -- they
 * drifted silently, with the vendored copy missing safety/discipline content the canonical copy
 * already had. This guard is built as a STANDALONE diagnostic (deliberately NOT wired into the
 * Pipeline source repository's own test-registration file -- a future, TP-protected-ceremony
 * dispatch's job, per the `tmp-leak-guard.mjs` precedent) that compares each canonical/vendored
 * pair byte-for-byte and fails loud on any divergence.
 *
 * CLI: `node plugins/pipeline-core/scripts/check-vendored-template-sync.mjs [--out <path>]`
 *   --out   evidence file to write (default: none -- prints the receipt to stdout only).
 * Exit code: 0 when every pair matches byte-for-byte, 1 when any pair diverges or a file is
 * missing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export const TEMPLATE_PAIRS = [
  {
    name: "goldfish-task.md",
    canonical: "templates/prompts/goldfish-task.md",
    vendored: "plugins/pipeline-core/templates/prompts/goldfish-task.md",
  },
  {
    name: "critic-review.md",
    canonical: "templates/prompts/critic-review.md",
    vendored: "plugins/pipeline-core/templates/prompts/critic-review.md",
  },
];

/** Reads a file's raw bytes relative to `root`. Returns `{ ok, content, error }`; never throws. */
function readRelative(root, relPath) {
  try {
    return { ok: true, content: readFileSync(resolve(root, relPath)), error: null };
  } catch (err) {
    return { ok: false, content: null, error: String(err.message ?? err) };
  }
}

/**
 * Compares each configured canonical/vendored template pair byte-for-byte under `root`
 * (defaults to the repo root two levels above this script's `scripts/` directory).
 */
export function checkVendoredTemplateSync({ root = REPO_ROOT, pairs = TEMPLATE_PAIRS } = {}) {
  const results = pairs.map((pair) => {
    const canonical = readRelative(root, pair.canonical);
    const vendored = readRelative(root, pair.vendored);
    let inSync = false;
    let reason = null;
    if (!canonical.ok) {
      reason = `canonical file unreadable: ${canonical.error}`;
    } else if (!vendored.ok) {
      reason = `vendored file unreadable: ${vendored.error}`;
    } else {
      inSync = Buffer.compare(canonical.content, vendored.content) === 0;
      reason = inSync ? null : "byte content differs";
    }
    return { name: pair.name, canonical: pair.canonical, vendored: pair.vendored, inSync, reason };
  });

  const allInSync = results.every((r) => r.inSync);

  return {
    schema: "pipeline.check-vendored-template-sync.v1",
    allInSync,
    results,
    generatedAt: new Date().toISOString(),
  };
}

function parseArgs(argv) {
  const opts = { out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const receipt = checkVendoredTemplateSync({});

  if (opts.out) {
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`Evidence written: ${outPath}`);
  }

  for (const r of receipt.results) {
    if (r.inSync) {
      console.log(`OK   ${r.name}: ${r.canonical} == ${r.vendored}`);
    } else {
      console.log(`FAIL ${r.name}: ${r.canonical} != ${r.vendored} (${r.reason})`);
    }
  }

  if (receipt.allInSync) {
    console.log("all vendored dispatch templates match their canonical counterparts");
    process.exitCode = 0;
  } else {
    console.log("DRIFT DETECTED: at least one vendored dispatch template no longer matches its canonical counterpart");
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) {
  main();
}
