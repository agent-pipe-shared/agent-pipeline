// SPDX-License-Identifier: SUL-1.0
/**
 * security-completeness-gate.test.mjs -- unit tests for the extracted, standalone
 * `checkSecurityCompleteness` function (CYB-2I-0), one layer below the CLI-subprocess
 * regression suites `guard-push.test.mjs`/`guard-push-v2.test.mjs` (protected, unmodified;
 * see this module's own header comment for the full extraction rationale/provenance).
 *
 * Mirrors the INTENT of `guard-push-v2.test.mjs`'s PGV2-01/02/03/04/08/09 at the unit level
 * (calling the extracted function directly, no subprocess, no manifest/CLI plumbing), plus a
 * couple of extraction-specific cases (custom `envelopePath`/`verdictPath` parameterization,
 * envelope schema-shape validation) that only make sense to test now that the function takes
 * these as explicit parameters instead of closing over guard-push.mjs's module scope.
 *
 * Run:   node plugins/pipeline-core/lib/security-completeness-gate.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkSecurityCompleteness } from "./security-completeness-gate.mjs";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);

function freshProjectDir() {
  return mkdtempSync(join(tmpdir(), "security-completeness-gate-"));
}

function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

/** Schema-shaped v2 envelope fixture; mirrors guard-push-v2.test.mjs's `exactV2Envelope`. */
function exactV2Envelope({ commit = HEAD, tree = TREE, schema = "pipeline.security-evidence.v2", capabilities }) {
  return {
    schema,
    policy: { configurationSha256: "e".repeat(64) },
    input: { commit, tree, inputSha256: "f".repeat(64) },
    environment: { platform: process.platform, nodeVersion: process.version },
    capabilities: capabilities.map(
      ({ capabilityId, tool = "gitleaks", status = "PASS", classification = "clean", reason = null }) => ({
        capabilityId,
        tool: { name: tool, version: null },
        rulePack: { ref: `${tool}-default`, digest: null },
        status,
        classification,
        findings: [],
        coverage: {
          subject: "candidate-tree",
          exclusions: [],
          ignored: [],
          unsupportedScope: [],
          truncation: { truncated: false, scannedFileCount: null, totalEligibleFileCount: null },
          dataAge: { ageSeconds: 0, snapshotAt: null },
        },
        reason,
      }),
    ),
  };
}

/** Schema-shaped v2 verdict fixture; mirrors guard-push-v2.test.mjs's `exactV2Verdict`. */
function exactV2Verdict({ required, optional = [], capabilityOutcomes, blocking, offendingCapabilities }) {
  return {
    schema: "pipeline.security-verdict.v2",
    producedFrom: "pipeline.security-evidence.v2",
    exitAuthority: "v1-blocking-logic",
    note: "fixture",
    v1ExitCode: 0,
    plan: { required, optional, planDigest: "g".repeat(64), source: "fixture", resolvedPolicyDigest: "h".repeat(64) },
    capabilityOutcomes,
    verdict: { blocking, offendingCapabilities },
    controls: [],
  };
}

/** Writes a FRESH, BOUND, self-consistent v2 pair for one required capability at the given paths. */
function writePair(
  dir,
  {
    envelopePath = "evidence/security-latest.v2.json",
    verdictPath = "evidence/security-latest.v2.verdict.json",
    commit = HEAD,
    tree = TREE,
    capabilityId = "cap.secrets",
    tool = "gitleaks",
    status = "PASS",
    classification = "clean",
    outcome = "pass",
    blocking = false,
    offendingCapabilities = [],
  },
) {
  writeEvidence(dir, envelopePath, exactV2Envelope({ commit, tree, capabilities: [{ capabilityId, tool, status, classification }] }));
  writeEvidence(
    dir,
    verdictPath,
    exactV2Verdict({ required: [capabilityId], capabilityOutcomes: { [capabilityId]: outcome }, blocking, offendingCapabilities }),
  );
}

const dirsToClean = [];
function withProjectDir(fn) {
  const dir = freshProjectDir();
  dirsToClean.push(dir);
  return fn(dir);
}

test("fresh+bound+non-blocking pair is a pass (empty failure array)", () => {
  withProjectDir((dir) => {
    writePair(dir, {}); // default: cap.secrets PASS -> outcome pass -> blocking:false
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, []);
  });
});

test("fresh+bound+blocking verdict produces one failure line per offending capability", () => {
  withProjectDir((dir) => {
    writePair(dir, {
      status: "SKIPPED",
      classification: "binary_missing",
      outcome: "required-capability-missing",
      blocking: true,
      offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "required-capability-missing" }],
    });
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, [
      "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=required-capability-missing)",
    ]);
  });
});

test("missing envelope AND verdict is fail-closed with both reasons reported", () => {
  withProjectDir((dir) => {
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, [
      "evidence/security-latest.v2.json missing",
      "evidence/security-latest.v2.verdict.json missing",
    ]);
  });
});

test("envelope bound to a different commit/tree than the caller-supplied source is NOT silently ignored", () => {
  withProjectDir((dir) => {
    const wrongCommit = "1".repeat(40);
    const wrongTree = "2".repeat(40);
    writeEvidence(dir, "evidence/security-latest.v2.json", exactV2Envelope({ commit: wrongCommit, tree: wrongTree, capabilities: [{ capabilityId: "cap.secrets", status: "PASS" }] }));
    writeEvidence(
      dir,
      "evidence/security-latest.v2.verdict.json",
      exactV2Verdict({ required: ["cap.secrets"], capabilityOutcomes: { "cap.secrets": "pass" }, blocking: false, offendingCapabilities: [] }),
    );
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, [
      "evidence/security-latest.v2.json: input commit does not match the pushed source",
      "evidence/security-latest.v2.json: input tree does not match the pushed source",
    ]);
  });
});

test("a falsy `tree` parameter always fails the tree-binding check (caller-resolution-failure case)", () => {
  withProjectDir((dir) => {
    writePair(dir, {});
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: null });
    assert.deepStrictEqual(failures, ["evidence/security-latest.v2.json: input tree does not match the pushed source"]);
  });
});

test('the {"invalid","execution-unavailable"} ERROR-status outcome pair is tolerated in the consistency check', () => {
  withProjectDir((dir) => {
    // Fresh envelope: ERROR status, no `raw` field in the persisted schema -> reconstruction
    // always recomputes "execution-unavailable". Persisted verdict says "invalid" (what the
    // ORIGINAL run, which saw a non-null `raw`, actually computed) -- must be tolerated, not
    // reported as a stale/mismatched pair, and the reported outcome label must be the PERSISTED
    // one ("invalid"), not the recomputed one.
    writePair(dir, {
      status: "ERROR",
      classification: "unspecified",
      outcome: "invalid",
      blocking: true,
      offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "invalid" }],
    });
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, [
      "evidence/security-latest.v2.verdict.json: required capability cap.secrets did not reach an accepted state (outcome=invalid)",
    ]);
  });
});

test("a genuine outcome mismatch OUTSIDE the invalid/execution-unavailable pair is caught as stale/mismatched, not tolerated", () => {
  withProjectDir((dir) => {
    // Persisted capabilityOutcomes LIES: claims "unsupported" for a required, SKIPPED,
    // non-special-classification capability whose fresh envelope actually recomputes to
    // "required-capability-missing". Neither outcome is in the tolerated pair.
    writePair(dir, {
      status: "SKIPPED",
      classification: "binary_missing",
      outcome: "unsupported",
      blocking: true,
      offendingCapabilities: [{ capabilityId: "cap.secrets", outcome: "unsupported" }],
    });
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(failures, [
      "evidence/security-latest.v2.verdict.json: verdict is not consistent with evidence/security-latest.v2.json's capability records (stale or mismatched pair)",
    ]);
  });
});

test("custom envelopePath/verdictPath parameters are honored, both for reading and for failure-message text", () => {
  withProjectDir((dir) => {
    const envelopePath = "evidence/candidate/security-latest.v2.json";
    const verdictPath = "evidence/candidate/security-latest.v2.verdict.json";
    writePair(dir, { envelopePath, verdictPath }); // default: pass, non-blocking
    const passFailures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE, envelopePath, verdictPath });
    assert.deepStrictEqual(passFailures, []);

    // Default-path read must NOT see the custom-path pair (proves paths are not hard-coded).
    const defaultPathFailures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.deepStrictEqual(defaultPathFailures, [
      "evidence/security-latest.v2.json missing",
      "evidence/security-latest.v2.verdict.json missing",
    ]);
  });
});

test("envelope schema-shape validation failure (e.g. wrong schema string) is reported and reuses the real validator", () => {
  withProjectDir((dir) => {
    writeEvidence(
      dir,
      "evidence/security-latest.v2.json",
      exactV2Envelope({ schema: "pipeline.security-evidence.v1", capabilities: [{ capabilityId: "cap.secrets", status: "PASS" }] }),
    );
    writeEvidence(
      dir,
      "evidence/security-latest.v2.verdict.json",
      exactV2Verdict({ required: ["cap.secrets"], capabilityOutcomes: { "cap.secrets": "pass" }, blocking: false, offendingCapabilities: [] }),
    );
    const failures = checkSecurityCompleteness({ projectDir: dir, commit: HEAD, tree: TREE });
    assert.ok(
      failures.some((f) => f.startsWith("evidence/security-latest.v2.json: envelope schema is invalid")),
      `expected an envelope-schema-invalid failure line, got: ${JSON.stringify(failures)}`,
    );
  });
});

after(() => {
  for (const dir of dirsToClean) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
});
