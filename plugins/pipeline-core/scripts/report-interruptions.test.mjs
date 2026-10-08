#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseReportInterruptionsArgs,
  formatDeterministicTextReport,
  generateInterruptionReport,
  REPORT_RESULT_SCHEMA,
  LOCAL_REPORT_SCHEMA,
} from "./report-interruptions.mjs";

const here = new URL(".", import.meta.url);
const reportScript = fileURLToPath(new URL("report-interruptions.mjs", here));
const observedScript = fileURLToPath(new URL("observe-critic-preflight.mjs", here));
const workspace = process.cwd();

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function fixture() {
  // C1's production store intentionally requires the Linux ext backend; /tmp
  // is tmpfs in the host verifier. Keep disposable fixtures out of the shared
  // repository scratch tree while preserving that real backend precondition.
  const root = mkdtempSync(join("/var/tmp", "report-interruptions-test-"));
  for (const path of ["project", "specs/sprint-alfred-epic", ".claude", "governance/guidelines", "governance/policies", "evidence"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const path of [
    "project/pipeline.yaml",
    "project/pipeline-state.json",
    "project/pipeline.json",
    "project/guard-config.json",
    "project/guard-override.log.jsonl",
    "specs/sprint-alfred-epic/spec.md",
  ]) {
    cpSync(join(workspace, path), join(root, path));
  }
  // The checked-in runtime state can legitimately lag a revised working spec.
  // This fixture owns a coherent detached authority snapshot instead of
  // inheriting that operational drift from the repository under test.
  const statePath = join(root, "project/pipeline-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.activeFeature.id = "sprint-alfred-epic";
  state.continuity.featureId = "sprint-alfred-epic";
  state.continuity.authority.spec.path = "specs/sprint-alfred-epic/spec.md";
  state.continuity.authority.spec.sha256 = createHash("sha256")
    .update(readFileSync(join(root, "specs/sprint-alfred-epic/spec.md")))
    .digest("hex");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync(join(root, ".claude/pipeline.yaml"), "governance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance/guidelines/review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance/policies/checklist.md"), "- verify\n");
  writeFileSync(join(root, "work.txt"), "base\n");
  git(root, ["init", "-q"]);
  const base = commit(root, "base");
  writeFileSync(join(root, "work.txt"), "candidate\n");
  const candidate = commit(root, "candidate");
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  writeFileSync(join(root, "evidence/verify.json"), `${JSON.stringify({ candidate: { commit: candidate, tree } })}\n`);
  return { root, base, candidate };
}

test("parseReportInterruptionsArgs parses flags and validates arguments", () => {
  assert.equal(parseReportInterruptionsArgs(["--help"]).help, true);
  assert.equal(parseReportInterruptionsArgs(["-h"]).help, true);

  const missingRoot = parseReportInterruptionsArgs([]);
  assert.equal(missingRoot.ok, false);
  assert.equal(missingRoot.code, "C1S-SHAPE");

  const unknownArg = parseReportInterruptionsArgs(["--root", "/tmp", "--unknown"]);
  assert.equal(unknownArg.ok, false);
  assert.equal(unknownArg.code, "C1S-SHAPE");

  const invalidFormat = parseReportInterruptionsArgs(["--root", "/tmp", "--format", "yaml"]);
  assert.equal(invalidFormat.ok, false);
  assert.equal(invalidFormat.code, "C1S-SHAPE");

  const invalidFrom = parseReportInterruptionsArgs(["--root", "/tmp", "--from", "not-a-date"]);
  assert.equal(invalidFrom.ok, false);
  assert.equal(invalidFrom.code, "C1S-SHAPE");

  const invalidThrough = parseReportInterruptionsArgs(["--root", "/tmp", "--through", "not-a-date"]);
  assert.equal(invalidThrough.ok, false);
  assert.equal(invalidThrough.code, "C1S-SHAPE");

  const invertedRange = parseReportInterruptionsArgs([
    "--root", "/tmp",
    "--from", "2026-09-10T00:00:00.000Z",
    "--through", "2026-09-01T00:00:00.000Z",
  ]);
  assert.equal(invertedRange.ok, false);
  assert.equal(invertedRange.code, "C1S-SHAPE");

  const invalidFeature = parseReportInterruptionsArgs(["--root", "/tmp", "--feature", "bad feature!"]);
  assert.equal(invalidFeature.ok, false);
  assert.equal(invalidFeature.code, "C1S-SHAPE");

  const valid = parseReportInterruptionsArgs([
    "--root", "/my/root",
    "--from", "2026-09-01T00:00:00.000Z",
    "--through", "2026-09-10T00:00:00.000Z",
    "--feature", "feat-1",
    "--package", "pkg-1",
    "--dispatch", "disp-1",
    "--format", "text",
  ]);
  assert.equal(valid.ok, true);
  assert.equal(valid.options.root, "/my/root");
  assert.equal(valid.options.from, "2026-09-01T00:00:00.000Z");
  assert.equal(valid.options.through, "2026-09-10T00:00:00.000Z");
  assert.equal(valid.options.feature, "feat-1");
  assert.equal(valid.options.packageId, "pkg-1");
  assert.equal(valid.options.dispatchId, "disp-1");
  assert.equal(valid.options.format, "text");
});

test("CLI invocation with --help prints usage and exits 0 with empty stderr", () => {
  const result = run(reportScript, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: report-interruptions\.mjs/);
  assert.equal(result.stderr, "");

  const shortResult = run(reportScript, ["-h"]);
  assert.equal(shortResult.status, 0);
  assert.match(shortResult.stdout, /Usage: report-interruptions\.mjs/);
  assert.equal(shortResult.stderr, "");
});

test("AC6: --write-baseline writes an aggregate-only telemetry/interruption-baseline.json", () => {
  const fx = fixture();
  try {
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const written = run(reportScript, ["--root", fx.root, "--write-baseline"]);
    assert.equal(written.status, 0, `${written.stdout}${written.stderr}`);
    const baseline = JSON.parse(readFileSync(join(fx.root, "telemetry/interruption-baseline.json"), "utf8"));
    for (const key of ["window", "coverage", "registrySha256", "limitations", "generatedAt"]) assert.ok(key in baseline, `baseline lacks ${key}`);
    assert.ok(Array.isArray(baseline.limitations));
    for (const key of ["receipts", "snapshot", "sourceEntries", "episodes"]) assert.ok(!(key in baseline), `baseline must carry no receipt content: ${key}`);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// AC6-T2 (ruling 23). Fixture is /var/tmp-based: on win32 these fail at the fixture (host-only).
for (const flag of [["--feature", "x"], ["--package", "x"], ["--dispatch", "x"]]) {
  test(`AC6-T2: --write-baseline with ${flag[0]} is refused with RI-BASELINE-SCOPED and writes no baseline`, () => {
    const fx = fixture();
    try {
      const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
      assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
      const result = run(reportScript, ["--root", fx.root, "--write-baseline", ...flag]);
      assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
      assert.equal(JSON.parse(result.stderr).code, "RI-BASELINE-SCOPED");
      assert.equal(existsSync(join(fx.root, "telemetry/interruption-baseline.json")), false);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  });
}

test("AC6-T2: fallback-collection baseline records fallback limitations and a scope", () => {
  const fx = fixture();
  try {
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const written = run(reportScript, ["--root", fx.root, "--write-baseline"]);
    assert.equal(written.status, 0, `${written.stdout}${written.stderr}`);
    const baseline = JSON.parse(readFileSync(join(fx.root, "telemetry/interruption-baseline.json"), "utf8"));
    assert.ok(Array.isArray(baseline.limitations) && baseline.limitations.length > 0, "limitations must be non-empty for a fallback collection");
    assert.ok(baseline.limitations.some((l) => /fallback|unestablished/i.test(JSON.stringify(l))), "a limitation must name the fallback qualification");
    assert.ok("scope" in baseline, "baseline must record its scope");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("CLI rejects invalid arguments with exit 2 and C1S-SHAPE error JSON on stderr", () => {
  const cases = [
    [],
    ["--root"],
    ["--root", "/tmp", "--bogus"],
    ["--root", "/tmp", "--format", "csv"],
    ["--root", "/tmp", "--from", "invalid-date"],
    ["--root", "/tmp", "--through", "invalid-date"],
    ["--root", "/tmp", "--from", "2026-09-02T00:00:00.000Z", "--through", "2026-09-01T00:00:00.000Z"],
    ["--root", "/tmp", "--feature", "spaces in id"],
  ];

  for (const args of cases) {
    const result = run(reportScript, args);
    assert.equal(result.status, 2, `expected exit 2 for args: ${JSON.stringify(args)}`);
    assert.equal(result.stdout, "", "stdout must be clean/empty on failure");
    const err = JSON.parse(result.stderr);
    assert.equal(err.schema, REPORT_RESULT_SCHEMA);
    assert.equal(err.status, "rejected");
    assert.equal(err.code, "C1S-SHAPE");
  }
});

test("CLI on absent store emits C1S-NOT-FOUND on stderr and exits 2", () => {
  const emptyDir = mkdtempSync("scratch/report-absent-");
  try {
    const result = run(reportScript, ["--root", emptyDir]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    const err = JSON.parse(result.stderr);
    assert.equal(err.schema, REPORT_RESULT_SCHEMA);
    assert.equal(err.status, "rejected");
    assert.equal(err.code, "C1S-NOT-FOUND");
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

test("CLI on initialized store with 0 receipts produces valid json and text reports", () => {
  const fx = fixture();
  try {
    // Initialize store via createOperation
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);

    // Run report default format (json)
    const jsonReport = run(reportScript, ["--root", fx.root]);
    assert.equal(jsonReport.status, 0, `${jsonReport.stdout}${jsonReport.stderr}`);
    assert.equal(jsonReport.stderr, "");
    const parsed = JSON.parse(jsonReport.stdout);
    assert.equal(parsed.schema, LOCAL_REPORT_SCHEMA);
    assert.ok(parsed.snapshot);
    assert.ok(parsed.aggregate);
    assert.equal(parsed.snapshot.receipts.length, 0);
    assert.equal(parsed.aggregate.totals.eventCount.value, 0);
    assert.equal(parsed.aggregate.totals.eventCount.status, "measured");
    assert.equal(parsed.aggregate.categoryRanking.length, 0);

    // Run report text format
    const textReport = run(reportScript, ["--root", fx.root, "--format", "text"]);
    assert.equal(textReport.status, 0, `${textReport.stdout}${textReport.stderr}`);
    assert.equal(textReport.stderr, "");
    assert.match(textReport.stdout, /=== Interruption Report \(local\) ===/);
    assert.match(textReport.stdout, /Events: 0 \(measured\)/);
    assert.match(textReport.stdout, /Categories:\s+\(none\)/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("CLI reports real receipts and supports filtering by --from, --through, --feature, --package, --dispatch", () => {
  const fx = fixture();
  try {
    // Initialize store and record 2 preflight rejections
    const create = run(observedScript, ["create", "--root", fx.root, "--spec", "specs/sprint-alfred-epic/spec.md"]);
    assert.equal(create.status, 0, `${create.stdout}${create.stderr}`);
    const operationId = JSON.parse(create.stdout).handle.operationId;

    const producerArgs = ["--base", fx.base, "--candidate", fx.candidate, "--spec", "specs/sprint-alfred-epic/spec.md"];
    const run1 = run(observedScript, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(run1.status, 1);

    const run2 = run(observedScript, ["run", "--root", fx.root, "--operation", operationId, "--", ...producerArgs]);
    assert.equal(run2.status, 1);

    // 1. Full report (json)
    const reportJson = run(reportScript, ["--root", fx.root, "--format", "json"]);
    assert.equal(reportJson.status, 0, `${reportJson.stdout}${reportJson.stderr}`);
    assert.equal(reportJson.stderr, "");
    const parsed = JSON.parse(reportJson.stdout);
    assert.equal(parsed.schema, LOCAL_REPORT_SCHEMA);
    assert.equal(parsed.snapshot.receipts.length, 2);
    assert.equal(parsed.aggregate.totals.eventCount.value, 2);
    assert.equal(parsed.aggregate.totals.episodeCount.value, 1);
    assert.ok(parsed.aggregate.categoryRanking.length > 0);

    // 2. Full report (text)
    const reportText = run(reportScript, ["--root", fx.root, "--format", "text"]);
    assert.equal(reportText.status, 0, `${reportText.stdout}${reportText.stderr}`);
    assert.equal(reportText.stderr, "");
    assert.match(reportText.stdout, /Events: 2 \(measured\)/);
    assert.match(reportText.stdout, /Episodes: 1 \(measured\)/);

    // 3. Filter by --feature matching
    const matchFeature = run(reportScript, ["--root", fx.root, "--feature", "sprint-alfred-epic"]);
    assert.equal(matchFeature.status, 0);
    assert.equal(JSON.parse(matchFeature.stdout).snapshot.receipts.length, 2);

    // 4. Filter by --feature non-matching
    const noMatchFeature = run(reportScript, ["--root", fx.root, "--feature", "non-existent-feature"]);
    assert.equal(noMatchFeature.status, 0);
    assert.equal(JSON.parse(noMatchFeature.stdout).snapshot.receipts.length, 0);

    // 5. Filter by --package
    const matchPackage = run(reportScript, ["--root", fx.root, "--package", "pkg-other"]);
    assert.equal(matchPackage.status, 0);
    assert.equal(JSON.parse(matchPackage.stdout).snapshot.receipts.length, 0);

    // 6. Filter by --dispatch
    const matchDispatch = run(reportScript, ["--root", fx.root, "--dispatch", "disp-other"]);
    assert.equal(matchDispatch.status, 0);
    assert.equal(JSON.parse(matchDispatch.stdout).snapshot.receipts.length, 0);

    // 7. Filter by --from and --through
    const now = new Date();
    const pastIso = new Date(now.getTime() - 3600000).toISOString();
    const futureIso = new Date(now.getTime() + 3600000).toISOString();
    const distantPast = new Date(now.getTime() - 7200000).toISOString();

    // Window containing receipts
    const inWindow = run(reportScript, ["--root", fx.root, "--from", pastIso, "--through", futureIso]);
    assert.equal(inWindow.status, 0);
    assert.equal(JSON.parse(inWindow.stdout).snapshot.receipts.length, 2);

    // Window before receipts (distant past)
    const beforeWindow = run(reportScript, ["--root", fx.root, "--through", distantPast]);
    assert.equal(beforeWindow.status, 0);
    assert.equal(JSON.parse(beforeWindow.stdout).snapshot.receipts.length, 0);

    // Window after receipts (distant future)
    const afterWindow = run(reportScript, ["--root", fx.root, "--from", futureIso]);
    assert.equal(afterWindow.status, 0);
    assert.equal(JSON.parse(afterWindow.stdout).snapshot.receipts.length, 0);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// AC6-T3 (ruling 45; Critic AC6-D1/AC6-D2). The baseline separates `requestedWindow` (the --from/--through
// values, status "requested", or null) from `window`, the observed collection window: the earliest and latest
// receipt timestamps actually read, each "measured", or { value: null, status: "unknown" } when nothing was
// observed or receipts coverage is not "measured". These cases also pin both limitation branches and the
// all-null scope VALUE. Seam: main(argv, ports) takes --root and an injected storeFactory, so the cases build
// a store stub and a temp root from os.tmpdir() instead of the Linux-only /var/tmp store; they reach their
// assertions on win32 (the T2 writer cases above do not).
const { tmpdir: ac6t3Tmpdir } = await import("node:os");
const ac6t3Reporter = await import("./report-interruptions.mjs");
const ac6t3Lib = await import("../lib/interruption-receipts.mjs");
const ac6t3Registry = JSON.parse(readFileSync(new URL("../../../policies/interruption-registry.v1.json", import.meta.url), "utf8"));
const AC6T3_FROM = "2026-08-01T00:00:00.000Z";
const AC6T3_THROUGH = "2026-08-01T01:00:00.000Z";
const ac6t3At = (seconds) => `2026-08-01T00:00:${String(seconds).padStart(2, "0")}.000Z`;

// Single-instant receipts (firstObservedAt === observedThroughAt) make "the earliest/latest receipt timestamp"
// unambiguous whichever timestamp field an implementation reads. eventId order (event-1, event-2, event-3) is
// deliberately NOT chronological (40s, 10s, 25s), so first/last-in-array shortcuts cannot satisfy the pin.
function ac6t3Receipt(n, seconds) {
  const stamp = () => ({ value: ac6t3At(seconds), status: "measured" });
  const absent = () => ({ value: null, status: "unknown" });
  const sha256 = String(n).repeat(64);
  const built = ac6t3Lib.buildInterruptionReceipt({
    eventId: `event-${n}`,
    lineageId: `episode-${n}`,
    scope: { featureId: "alfred", packageId: "C1", dispatchId: "dispatch-1", phase: "implementation" },
    actor: { runner: "test-runner", role: "worker" },
    typedCode: "SOURCE-REQUIRED",
    observations: [{ sourceKind: "lifecycle-boundary", facts: ["expected-boundary"], artifact: { id: `observation-${n}`, sha256 } }],
    state: "unresolved",
    firstObservedAt: stamp(),
    observedThroughAt: stamp(),
    resolvedAt: absent(),
    terminalAt: absent(),
    attemptCoverage: "measured",
    recoveryCoverage: "measured",
    joins: { invocations: [], reviews: [], usages: [], recoveries: [] },
    resolution: null,
    binding: { candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, artifacts: [{ id: `observation-${n}`, sha256 }] },
  }, ac6t3Registry);
  assert.equal(built.ok, true, `AC6-T3 fixture receipt ${n} rejected: ${built.code}`);
  return built.receipt;
}
const ac6t3Receipts = () => [ac6t3Receipt(1, 40), ac6t3Receipt(2, 10), ac6t3Receipt(3, 25)];

// A store stub that serves a snapshot (store path); coverage and unsupported kinds are the knobs under test.
function ac6t3StoreStub({ coverage, unsupportedSourceKinds = [] }) {
  return {
    readSnapshot: () => ({
      ok: true,
      snapshot: {
        schema: "pipeline.interruption-store-snapshot.v1",
        storeId: "ac6t3-store",
        receipts: ac6t3Receipts(),
        coverage,
        collection: {
          qualification: "established",
          supportedSources: ["critic-dispatch-preflight"],
          unsupportedSourceKinds,
          diagnostics: [],
          entrySetSha256: "0".repeat(64),
        },
        sourceEntries: [],
      },
    }),
  };
}
const ac6t3MeasuredStore = (extra = {}) => ac6t3StoreStub({ coverage: { receipts: "measured", followup: "measured" }, ...extra });
// A store stub that cannot produce a snapshot: the CLI falls back to reading the on-disk entries and receipts.
const ac6t3FallbackStore = () => ({ readSnapshot: () => ({ ok: false, code: null }) });

function ac6t3FallbackFiles(root) {
  const storeDir = join(root, "evidence/interruption-collection/store");
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(join(storeDir, "commit.json"), "{}\n");
  writeFileSync(join(storeDir, "metadata.json"), `${JSON.stringify({ schema: "pipeline.interruption-store.v1", storeId: "ac6t3-store" })}\n`);
  for (const receipt of ac6t3Receipts()) {
    const dir = join(root, "evidence/interruption-receipts", receipt.eventId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "commit.json"), "{}\n");
    writeFileSync(join(dir, "receipt.json"), `${JSON.stringify(receipt)}\n`);
  }
}

function ac6t3WithRoot(body) {
  const root = mkdtempSync(join(ac6t3Tmpdir(), "report-interruptions-ac6t3-"));
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// In-process main() with captured output; the process exit code is restored so a deliberate exit 2 cannot leak.
function ac6t3Main(argv, ports) {
  const out = [];
  const err = [];
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  const exitCode = process.exitCode;
  process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { err.push(String(chunk)); return true; };
  let status;
  try {
    status = ac6t3Reporter.main(argv, ports);
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    process.exitCode = exitCode;
  }
  return { status, stdout: out.join(""), stderr: err.join("") };
}

// Runs `--write-baseline` against the injected store and returns the written baseline plus the printed report.
function ac6t3Run(root, store, args) {
  const ports = { ...ac6t3Reporter.productionPorts, storeFactory: () => store };
  const result = ac6t3Main(["--root", root, "--write-baseline", ...args], ports);
  assert.equal(result.status, 0, `AC6-T3 run exited ${result.status}: ${result.stdout}${result.stderr}`);
  return {
    baseline: JSON.parse(readFileSync(join(root, "telemetry/interruption-baseline.json"), "utf8")),
    report: JSON.parse(result.stdout),
  };
}
const ac6t3Window = ["--from", AC6T3_FROM, "--through", AC6T3_THROUGH];
const ac6t3Requested = {
  start: { value: AC6T3_FROM, status: "requested" },
  end: { value: AC6T3_THROUGH, status: "requested" },
};
const ac6t3Unknown = { start: { value: null, status: "unknown" }, end: { value: null, status: "unknown" } };

test("AC6-T3: store path with --from/--through records requestedWindow with status requested", () => {
  ac6t3WithRoot((root) => {
    const { baseline, report } = ac6t3Run(root, ac6t3MeasuredStore(), ac6t3Window);
    assert.equal(report.snapshot.receipts.length, 3, "precondition: the store path served all three receipts");
    assert.ok(Object.hasOwn(baseline, "requestedWindow"), "baseline must carry a requestedWindow key");
    assert.deepEqual(baseline.requestedWindow, ac6t3Requested);
  });
});

test("AC6-T3: store path records window as the earliest and latest receipt timestamps, each measured", () => {
  ac6t3WithRoot((root) => {
    const { baseline, report } = ac6t3Run(root, ac6t3MeasuredStore(), ac6t3Window);
    assert.deepEqual(report.aggregate.coverage, { receipts: "measured", followup: "measured" }, "precondition: receipts coverage is measured");
    assert.deepEqual(baseline.window, {
      start: { value: ac6t3At(10), status: "measured" },
      end: { value: ac6t3At(40), status: "measured" },
    });
    assert.notEqual(baseline.window.start.value, AC6T3_FROM, "the observed start must not be the requested --from");
    assert.notEqual(baseline.window.end.value, AC6T3_THROUGH, "the observed end must not be the requested --through");
  });
});

test("AC6-T3: fallback collection with a requested window records window start/end as unknown", () => {
  ac6t3WithRoot((root) => {
    ac6t3FallbackFiles(root);
    const { baseline, report } = ac6t3Run(root, ac6t3FallbackStore(), ac6t3Window);
    assert.equal(report.snapshot.receipts.length, 3, "precondition: the fallback read all three receipts");
    assert.equal(report.snapshot.collection.qualification, "unestablished", "precondition: this is the fallback collection");
    assert.deepEqual(baseline.window, ac6t3Unknown);
  });
});

test("AC6-T3: fallback collection with a requested window still records requestedWindow with status requested", () => {
  ac6t3WithRoot((root) => {
    ac6t3FallbackFiles(root);
    const { baseline } = ac6t3Run(root, ac6t3FallbackStore(), ac6t3Window);
    assert.ok(Object.hasOwn(baseline, "requestedWindow"), "baseline must carry a requestedWindow key");
    assert.deepEqual(baseline.requestedWindow, ac6t3Requested);
  });
});

test("AC6-T3: fallback collection with a requested window carries the 'requested window was not observed' limitation", () => {
  ac6t3WithRoot((root) => {
    ac6t3FallbackFiles(root);
    const { baseline } = ac6t3Run(root, ac6t3FallbackStore(), ac6t3Window);
    assert.ok(baseline.limitations.includes("requested window was not observed"), `limitations: ${JSON.stringify(baseline.limitations)}`);
  });
});

test("AC6-T3: a run with no window records requestedWindow null", () => {
  ac6t3WithRoot((root) => {
    const store = ac6t3StoreStub({ coverage: { receipts: "unknown", followup: "unknown" } });
    const { baseline } = ac6t3Run(root, store, []);
    assert.ok(Object.hasOwn(baseline, "requestedWindow"), "baseline must carry a requestedWindow key even when no window was requested");
    assert.equal(baseline.requestedWindow, null);
  });
});

test("AC6-T3: a run with no window records window unknown and no 'requested window was not observed' limitation", () => {
  ac6t3WithRoot((root) => {
    const store = ac6t3StoreStub({ coverage: { receipts: "unknown", followup: "unknown" } });
    const { baseline } = ac6t3Run(root, store, []);
    assert.deepEqual(baseline.window, ac6t3Unknown);
    assert.ok(!baseline.limitations.includes("requested window was not observed"), `limitations: ${JSON.stringify(baseline.limitations)}`);
  });
});

test("AC6-T3: unsupported source kinds from the collection become one limitation, and none when the list is empty", () => {
  ac6t3WithRoot((root) => {
    const store = ac6t3MeasuredStore({ unsupportedSourceKinds: ["alpha-kind", "beta-kind"] });
    const { baseline } = ac6t3Run(root, store, ac6t3Window);
    assert.ok(baseline.limitations.includes("unsupported source kinds: alpha-kind, beta-kind"), `limitations: ${JSON.stringify(baseline.limitations)}`);
  });
  ac6t3WithRoot((root) => {
    const { baseline } = ac6t3Run(root, ac6t3MeasuredStore(), ac6t3Window);
    assert.ok(!baseline.limitations.some((limitation) => /unsupported source kinds/u.test(limitation)), `limitations: ${JSON.stringify(baseline.limitations)}`);
  });
});

test("AC6-T3: the baseline scope is the all-null scope value", () => {
  ac6t3WithRoot((root) => {
    ac6t3FallbackFiles(root);
    const { baseline } = ac6t3Run(root, ac6t3FallbackStore(), []);
    assert.deepEqual(baseline.scope, { featureId: null, packageId: null, dispatchId: null });
  });
});
