// SPDX-License-Identifier: SUL-1.0
// K98 (PO decision 2026-10-23, row 13): both shipped gitleaks configs (repo root and the plugin mirror)
// carry a global path allowlist that excludes `scratch/clones` from the scan source, and nothing else.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CONFIGS = {
  "repo-root .gitleaks.toml": new URL("../../../../.gitleaks.toml", import.meta.url),
  "plugin mirror gitleaks-default.toml": new URL("../../config/security/gitleaks-default.toml", import.meta.url),
};

function globalAllowlistPaths(text) {
  const match = /^\[allowlist\]\n(?:.*\n)*?paths = \[\n((?:\s+'''.*''',\n)+)\]/mu.exec(text);
  if (!match) return null;
  return [...match[1].matchAll(/'''(.*)'''/gu)].map((entry) => new RegExp(entry[1], "u"));
}

for (const [label, url] of Object.entries(CONFIGS)) {
  test(`K98 row 13: ${label} excludes scratch/clones from the scan source and nothing else`, () => {
    const paths = globalAllowlistPaths(readFileSync(fileURLToPath(url), "utf8"));
    assert.ok(paths, "a global [allowlist] with a paths list exists");
    const excluded = (path) => paths.some((re) => re.test(path));
    assert.equal(excluded("/work/repo/scratch/clones/k98/plugins/a.mjs"), true);
    assert.equal(excluded("/work/repo/scratch/notes.md"), false, "scratch/ itself stays scanned");
    assert.equal(excluded("/work/repo/plugins/pipeline-core/scripts/a.mjs"), false);
    assert.equal(excluded("/work/repo/backlog/transitions.ndjson"), false);
  });
}
