// SPDX-License-Identifier: SUL-1.0
/**
 * CLI entry test for gitleaks-repair-ignore.mjs: invoked as a process (including on native
 * Windows), the entry check must run main() instead of exiting 0 silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "gitleaks-repair-ignore.mjs");

test("CLI with no arguments runs main and reports the missing flags", () => {
  const cwd = mkdtempSync(join(tmpdir(), "glcli-"));
  try {
    const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
    assert.equal(result.status, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /missing required flag\(s\)/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
