#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks.windows-suppression.test.mjs -- regression test for backlog item
 * `pipeline.gitleaks-content-suppression-does-not-match-on-windows` (dispatch GLWIN-t).
 *
 * Contract pinned here: a `.gitleaksignore` content-v1 entry (repo-relative, forward-slash path)
 * suppresses its finding no matter (a) which line ending the ignore file uses (LF / CRLF), (b) how
 * deep the file sits in the tree, and (c) which path shape the scanner reported (absolute with the
 * platform separator, absolute with forward slashes -- what the real binary emits on Windows --
 * or relative). Diagnosis and measurements: specs/sprint-alfred-epic/evidence/night-2026-10-05/
 * gitleaks-windows-suppression.md.
 *
 * Expected state on native Windows BEFORE the production fix (GLWIN-t is test-only):
 *   - RED   : every nested (depth 1 and 2) absolute-path combination -- `normalizeCandidateFindingPath`
 *             builds a native-separator relative path and its own validator then rejects it, so the
 *             finding keeps its absolute path and never matches. Also the defensive
 *             `relative-backslash` shape at depth >= 1 (never observed from the real binary).
 *   - GREEN : depth 0 (a file at the repository root has no separator), the `relative-forward-slash`
 *             shape, and the over-fix guard tests at the bottom (they must stay green after the fix).
 * On POSIX every cell is green by construction (the platform separator already is `/`); the Windows-only
 * shape is skipped there with a stated reason.
 *
 * Hermetic: a spy `spawnFn` stands in for the binary (no real gitleaks, no repository history, no
 * network). Fixtures are synthetic; none of the values below is a credential.
 *
 * Run:  node --test plugins/pipeline-core/scripts/security-adapters/gitleaks.windows-suppression.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gitleaksContentAuthorityLine, normalizeCandidateFindingPath, run } from "./gitleaks.mjs";

const IS_WINDOWS = process.platform === "win32";
const RULE = "fixture-rule";
const SECRET = "fixture-secret-value";
const OTHER_SECRET = "fixture-other-secret-value";

const EOLS = [
  { label: "LF", eol: "\n" },
  { label: "CRLF", eol: "\r\n" },
];

// Repo-relative, forward-slash paths of the synthetic files: depth 0 (no separator) is the control
// that already works on Windows; depth 1 and 2 are where the defect shows.
const DEPTHS = [
  { label: "depth0 (root file)", rel: "top.txt" },
  { label: "depth1", rel: "backlog/one.txt" },
  { label: "depth2", rel: "a/b/c.txt" },
];

const SHAPES = [
  {
    id: "absolute-native-separator",
    absolute: true,
    build: (root, rel) => join(root, ...rel.split("/")),
  },
  {
    id: "absolute-forward-slash (the real gitleaks shape on Windows)",
    absolute: true,
    build: (root, rel) => `${root.split("\\").join("/")}/${rel}`,
  },
  {
    id: "relative-forward-slash",
    absolute: false,
    build: (_root, rel) => rel,
  },
  {
    id: "relative-backslash (defensive; never observed from the real binary)",
    absolute: false,
    winOnly: true,
    build: (_root, rel) => rel.split("/").join("\\"),
  },
];

function makeRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const { rel } of DEPTHS) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "synthetic fixture content\n");
  }
  return root;
}

// Messages must never carry the host-specific temp location.
function scrubber(...roots) {
  return (text) => {
    let out = String(text);
    for (const root of roots) out = out.split(root).join("<root>").split(root.split("\\").join("/")).join("<root>");
    return out;
  };
}

function reportedFinding(file, overrides = {}) {
  return { File: file, RuleID: RULE, StartLine: 7, StartColumn: 3, Secret: SECRET, Description: "synthetic fixture finding", ...overrides };
}

// Canonical authority entry exactly as the repair tooling writes it: repo-relative `/` path.
function authorityEntry(rel, overrides = {}) {
  return gitleaksContentAuthorityLine(reportedFinding(rel, overrides));
}

async function runAdapter(root, reportFindings, ignoreText) {
  if (ignoreText !== null) writeFileSync(join(root, ".gitleaksignore"), ignoreText);
  const spy = (_cmd, args) => {
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(reportFindings));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return run({ rootDir: root, config: { binaryPath: "unused-fake-gitleaks" }, spawnFn: spy, timeoutMs: 5000 });
}

// ===============================================================================================
// Matrix 1 -- run(): ignore-file EOL x finding path shape x depth. Every cell must suppress.
// ===============================================================================================

for (const eol of EOLS) {
  for (const shape of SHAPES) {
    for (const depth of DEPTHS) {
      const skip = shape.winOnly && !IS_WINDOWS
        ? "a backslash-separated relative path is only a path separator on Windows; on POSIX it is a legal filename character"
        : undefined;
      test(`run() suppresses a content-v1 entry | ignore file ${eol.label} | finding path ${shape.id} | ${depth.label}`, { skip }, async () => {
        const root = makeRoot("glwin-run-");
        const scrub = scrubber(root);
        try {
          const reported = reportedFinding(shape.build(root, depth.rel));
          const ignoreText = `# synthetic header${eol.eol}${authorityEntry(depth.rel)}${eol.eol}`;
          const result = await runAdapter(root, [reported], ignoreText);
          const retained = (result.findings ?? []).map((f) => scrub(f.path)).join(", ");
          assert.equal(result.status, "PASS", `entry for "${depth.rel}" did not suppress; retained path(s): ${retained}`);
          assert.equal(result.findings.length, 0, `finding must not be retained; retained path(s): ${retained}`);
          assert.equal(result.ignored.findingCount, 1, "exactly one finding must be reported as suppressed");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  }
}

// ===============================================================================================
// Matrix 2 -- the smallest unit that holds the divergence: normalizeCandidateFindingPath() must map
// an absolute in-root finding path to the repo-relative forward-slash form a content-v1 entry carries.
// ===============================================================================================

for (const shape of SHAPES.filter((s) => s.absolute)) {
  for (const depth of DEPTHS) {
    test(`normalizeCandidateFindingPath() yields the repo-relative forward-slash path | finding path ${shape.id} | ${depth.label}`, () => {
      const root = makeRoot("glwin-norm-");
      const scrub = scrubber(root);
      try {
        const normalized = normalizeCandidateFindingPath(reportedFinding(shape.build(root, depth.rel)), root);
        assert.ok(normalized.File === depth.rel, `expected "${depth.rel}", got "${scrub(normalized.File)}"`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

// ===============================================================================================
// Over-fix guards -- green today, must STAY green after the production fix. Each pins a property a
// careless separator fix could break (suppress too much, or relax the entry validator).
// ===============================================================================================

test("guard: a finding in a different tree is NOT suppressed by an entry for the same repo-relative path", async () => {
  const root = makeRoot("glwin-guard-root-");
  const external = makeRoot("glwin-guard-external-");
  const scrub = scrubber(root, external);
  try {
    const reported = reportedFinding(join(external, "backlog", "one.txt"));
    const result = await runAdapter(root, [reported], `${authorityEntry("backlog/one.txt")}\n`);
    assert.equal(result.status, "FINDINGS", `an out-of-root path must never match; got ${scrub(JSON.stringify(result.findings))}`);
    assert.equal(result.ignored.findingCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("guard: a content-v1 entry that itself uses a backslash path stays a malformed authority (ERROR ignore_authority)", async () => {
  const root = makeRoot("glwin-guard-malformed-");
  try {
    const malformed = `content-v1:${"a".repeat(64)}:backlog\\one.txt:${RULE}:7:3`;
    const result = await runAdapter(root, [], `${malformed}\n`);
    assert.equal(result.status, "ERROR");
    assert.equal(result.classification, "ignore_authority");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guard: an entry for one secret does NOT suppress a different secret at the same nested path/rule/line/column", async () => {
  const root = makeRoot("glwin-guard-secret-");
  const scrub = scrubber(root);
  try {
    const reported = reportedFinding(join(root, "a", "b", "c.txt"), { Secret: OTHER_SECRET });
    const result = await runAdapter(root, [reported], `${authorityEntry("a/b/c.txt")}\n`);
    assert.equal(result.status, "FINDINGS", `digest binding must hold; got ${scrub(JSON.stringify(result.findings))}`);
    assert.equal(result.ignored.findingCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("guard: an entry recorded at a different line does NOT suppress a nested finding (line binding stays exact)", async () => {
  const root = makeRoot("glwin-guard-line-");
  const scrub = scrubber(root);
  try {
    const reported = reportedFinding(join(root, "a", "b", "c.txt"), { StartLine: 8 });
    const result = await runAdapter(root, [reported], `${authorityEntry("a/b/c.txt", { StartLine: 7 })}\n`);
    assert.equal(result.status, "FINDINGS", `line binding must hold; got ${scrub(JSON.stringify(result.findings))}`);
    assert.equal(result.ignored.findingCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
