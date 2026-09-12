#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEntryPointReachability, discoverEntryPoints, discoverSurfaces, targetAnchorExists, validateInventory } from "./check-product-capability-inventory.mjs";
import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventoryPath = join(repoRoot, "docs", "product-capability-inventory.json");
const cases = [];
const injectedFailure = process.env.PIPELINE_PCI_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_PCI_TEST_SELF_PROBE_CHILD === "1";

function check(name, fn) {
  const id = `PCI${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({
    id,
    name,
    run() {
      if (injectedFailure === id) assert.fail("intentional product inventory case-completion failure");
      return fn();
    },
  });
}

const FIXTURE_RECEIPT_SHA256 = "a".repeat(64);
const PENDING_REVIEW = {
  status: "required-before-publication",
  receiptSha256: null,
  reason: "Fixture-only pending review; no Critic receipt is attested.",
};

function inventory({ review = "attested", targets = "pending" } = {}) {
  const document = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (review === "attested") {
    // Fixture-only digest: it is never written to the production inventory.
    document.criticReview = { status: "attested", receiptSha256: FIXTURE_RECEIPT_SHA256, reason: null };
  } else if (review === "pending") {
    document.criticReview = structuredClone(PENDING_REVIEW);
  } else {
    throw new Error(`Unknown review fixture state: ${review}`);
  }
  const targetStatus = targets === "active" ? "active" : targets === "pending" ? "pending" : null;
  if (targetStatus === null) {
    throw new Error(`Unknown target fixture state: ${targets}`);
  }
  for (const capability of document.capabilities) {
    for (const target of capability.targets) target.status = targetStatus;
  }
  return document;
}

function validated(document, phase = "inventory", testGitOperations = undefined) {
  return validateInventory({ root: repoRoot, phase, document, _testGitOperations: testGitOperations });
}

function gitText(args, options = {}, spawn = spawnSync) {
  const result = spawn("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  const successfulEperm = result?.error?.code === "EPERM"
    && result.status === 0
    && result.signal === null
    && typeof result.stdout === "string"
    && result.stdout.length > 0;
  if (result?.error && !successfulEperm) throw result.error;
  if (result?.status !== 0 || result.signal !== null || typeof result.stdout !== "string" || result.stdout.length === 0) {
    const stderr = typeof result?.stderr === "string" && result.stderr.trim().length > 0
      ? `; stderr=${JSON.stringify(result.stderr.trim())}`
      : "";
    throw new Error(
      `Git fixture observation failed: git ${args.join(" ")}; status=${String(result?.status)}; `
      + `signal=${String(result?.signal)}; stdout=${typeof result?.stdout}${stderr}`,
    );
  }
  return result.stdout.trim();
}

function revision(ref) {
  return {
    commit: gitText(["rev-parse", "--verify", `${ref}^{commit}`]),
    tree: gitText(["rev-parse", "--verify", `${ref}^{tree}`]),
  };
}

function run(root, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function withBaselineClone(fn) {
  const parent = mkdtempSync(join(tmpdir(), "haw-baseline-cli-"));
  const root = join(parent, "repo");
  try {
    const clone = run(parent, "git", ["clone", "--quiet", "--no-local", repoRoot, root]);
    assert.equal(clone.status, 0, clone.stderr);
    fn(root);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function cliInventory(root) {
  return run(root, process.execPath, [
    join(repoRoot, "harness", "scripts", "check-product-capability-inventory.mjs"),
    "--root", root,
    "--phase", "inventory",
  ]);
}

function writeInventoryFixture(root, mutate = () => {}) {
  const document = JSON.parse(readFileSync(join(root, "docs", "product-capability-inventory.json"), "utf8"));
  document.criticReview = { status: "attested", receiptSha256: FIXTURE_RECEIPT_SHA256, reason: null };
  for (const capability of document.capabilities) {
    for (const target of capability.targets) target.status = "pending";
  }
  mutate(document);
  writeFileSync(join(root, "docs", "product-capability-inventory.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function nonAncestorBaseline() {
  // Object writes are forbidden in the sandbox, so model a real resolvable
  // foreign commit through the validator's closed test-only Git adapter. The
  // production checker always uses the real Git implementation.
  const commit = "a".repeat(40);
  const tree = "b".repeat(40);
  return {
    baseline: { commit, tree },
    gitOperations: {
      revision(_root, argument) {
        if (argument === `${commit}^{commit}`) return commit;
        if (argument === `${commit}^{tree}`) return tree;
        return null;
      },
      isAncestor(_root, candidate, descendant) {
        assert.equal(candidate, commit);
        assert.equal(descendant, "HEAD");
        return false;
      },
    },
  };
}

check("HAW-A00 accepts only a status-zero Git EPERM false positive with observed output", () => {
  const accepted = () => ({
    status: 0,
    signal: null,
    error: Object.assign(new Error("sandbox false positive"), { code: "EPERM" }),
    stdout: "observed\n",
    stderr: "",
  });
  assert.equal(gitText(["rev-parse", "HEAD"], {}, accepted), "observed");

  const rejected = () => ({
    status: null,
    signal: null,
    error: Object.assign(new Error("sandbox denied"), { code: "EPERM" }),
    stdout: "",
    stderr: "",
  });
  assert.throws(() => gitText(["rev-parse", "HEAD"], {}, rejected), /sandbox denied/);

  const failed = () => ({
    status: 128,
    signal: null,
    stdout: "",
    stderr: "fatal: bad revision",
  });
  assert.throws(
    () => gitText(["rev-parse", "missing"], {}, failed),
    /git rev-parse missing; status=128; signal=null; stdout=string; stderr="fatal: bad revision"/,
  );
});

check("HAW-A01 discovers the complete current direct product surface", () => {
  const discovered = discoverSurfaces(repoRoot);
  const ids = discovered.map((surface) => surface.surfaceId);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(discovered, [...discovered].sort((left, right) => Buffer.compare(Buffer.from(left.surfaceId), Buffer.from(right.surfaceId))));
});

check("HAW-A02 accepts an attested receipt and an honest inventory-phase pending gate", () => {
  assert.equal(validated(inventory()).ok, true);
  const pendingReview = inventory({ review: "pending" });
  assert.equal(validated(pendingReview).ok, true);
  const finalResult = validated(pendingReview, "final");
  assert.equal(finalResult.ok, false);
  assert.match(finalResult.findings.join("\n"), /final inventory requires an attested Critic receipt/);

  pendingReview.criticReview.receiptSha256 = "b".repeat(64);
  const fabricated = validated(pendingReview);
  assert.equal(fabricated.ok, false);
  assert.match(fabricated.findings.join("\n"), /must not contain a fabricated receipt digest/);
});

for (const [name, mutate, pattern] of [
  // v3 (NVA-INVDERIVE-1): "the inventory omitted a discovered surface" is no longer
  // expressible -- the surface set IS the discovered set. The equivalent failure, and
  // the one this whole change exists to make legible, is a discovered surface that no
  // capability categorizes: exactly the state registering a new verify suite produces.
  ["a discovered surface no capability categorizes", (document) => {
    const capability = document.capabilities.find((candidate) => candidate.surfaceIds.length > 1);
    capability.surfaceIds = capability.surfaceIds.slice(1);
  }, /absent from every capability/],
  ["a re-declared surfaces array", (document) => { document.surfaces = []; }, /inventory root must have exactly/],
  ["duplicate capability ID", (document) => { document.capabilities.push(structuredClone(document.capabilities[0])); }, /duplicate capability id/],
  ["unmapped surface", (document) => { document.capabilities[0].surfaceIds = []; }, /surfaceIds must be nonempty|absent from every capability/],
  ["available capability without test evidence", (document) => { document.capabilities[0].testEvidence = []; }, /has no testEvidence/],
  ["unsorted support matrix", (document) => { document.capabilities.find((capability) => capability.runners.length > 1).runners.reverse(); }, /sorted, duplicate-free/],
  ["missing Codex disposition", (document) => { delete document.capabilities[0].runnerDispositions.codex; }, /runnerDispositions.*unexpected shape/],
  ["unexplained Codex unavailability", (document) => { document.capabilities[0].runnerDispositions.codex = { status: "unavailable", reasonCode: null }; }, /Codex unavailable.*reasonCode/],
  ["Codex runner falsely marked unavailable", (document) => {
    const capability = document.capabilities.find((candidate) => candidate.runners.includes("codex"));
    capability.runnerDispositions.codex = { status: "unavailable", reasonCode: "host-contract-missing" };
  }, /Codex support matrix conflicts/],
]) {
  check(`HAW-A03 rejects ${name}`, () => {
    const document = inventory();
    mutate(document);
    const result = validated(document);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), pattern);
  });
}

check("HAW-A04 final phase rejects pending front-door claims before documentation authorship", () => {
  const result = validated(inventory({ targets: "pending" }), "final");
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /must be active during final phase/);
});

check("HAW-A04a accepts active public-target fixtures against actual documentation anchors", () => {
  const result = validated(inventory({ targets: "active" }), "final");
  assert.equal(result.ok, true);
});

check("HAW-A05 accepts an ancestor baseline and still requires every discovered surface to be categorized", () => {
  const document = inventory();
  document.sourceBaseline = revision("HEAD^");
  assert.equal(validated(document).ok, true);

  // An older exact baseline does not relax the surface contract: every surface
  // derived from that committed tree still needs a categorization.
  const capability = document.capabilities.find((candidate) => candidate.surfaceIds.length > 1);
  capability.surfaceIds = capability.surfaceIds.slice(1);
  const result = validated(document);
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /discovered surface is absent from every capability/);
});

check("HAW-A05a CLI discovery is bound to the committed baseline and rejects a later uncommitted assignment", () => {
  withBaselineClone((root) => {
    const laterSurfacePath = "plugins/baseline-regression/skills/later-surface/SKILL.md";
    const laterSurfaceId = `skill:${laterSurfacePath}:later-surface`;
    mkdirSync(dirname(join(root, laterSurfacePath)), { recursive: true });
    writeFileSync(join(root, laterSurfacePath), "# Later surface\n", "utf8");

    // This path is directly discoverable from the dirty checkout but absent from
    // the exact committed sourceBaseline. It must not change the baseline set.
    writeInventoryFixture(root);
    const unchanged = cliInventory(root);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.match(unchanged.stdout, /PASS: product capability inventory \(inventory\)/);

    writeInventoryFixture(root, (document) => {
      const capability = document.capabilities[0];
      capability.surfaceIds = [...capability.surfaceIds, laterSurfaceId]
        .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
    });
    const assigned = cliInventory(root);
    assert.notEqual(assigned.status, 0);
    assert.match(assigned.stderr, /capabilities\[0\] references missing surface skill:plugins\/baseline-regression\/skills\/later-surface\/SKILL\.md:later-surface/);
  });
});

check("HAW-A05b accepts only rendered target anchors, never comments or code examples", () => {
  const target = { document: "README", anchorId: "capability-example" };
  withFixtureRoot({
    "README.md": [
      "<!-- <a id=\"capability-example\"></a> -->",
      "`<a id=\"capability-example\"></a>`",
      "    <a id=\"capability-example\"></a>",
      "<a data-id=\"capability-example\"></a>",
      "<a id=\"CAPABILITY-EXAMPLE\"></a>",
      "<a id=\"wrong-id\" id=\"capability-example\"></a>",
      "```md",
      "<a id=\"capability-example\"></a>",
      "```not-a-closing-fence",
      "<a id=\"capability-example\"></a>",
      "```",
      "## Capability Example {#capability-example}",
    ].join("\n"),
  }, (root) => assert.equal(targetAnchorExists(root, target), false));
  withFixtureRoot({ "README.md": "<a id=\"capability-example\"></a>\n" }, (root) => {
    assert.equal(targetAnchorExists(root, target), true);
  });
  withFixtureRoot({ "README.md": "## Capability Example\n" }, (root) => {
    assert.equal(targetAnchorExists(root, target), true);
  });
});

for (const [name, fixture, pattern] of [
  ["a tree that does not belong to its commit", () => ({ baseline: { commit: revision("HEAD^").commit, tree: revision("HEAD").tree } }), /sourceBaseline tree does not match commit/],
  ["a resolvable commit outside current HEAD ancestry", nonAncestorBaseline, /sourceBaseline commit is not an ancestor of current HEAD/],
]) {
  check(`HAW-A06 rejects ${name}`, () => {
    const document = inventory();
    const { baseline, gitOperations } = fixture();
    document.sourceBaseline = baseline;
    const result = validated(document, "inventory", gitOperations);
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), pattern);
  });
}

check("HAW-A07 rejects an open-ended test Git adapter", () => {
  const result = validated(inventory(), "inventory", { revision() {} });
  assert.equal(result.ok, false);
  assert.match(result.findings.join("\n"), /test Git operations must have exactly revision and isAncestor functions/);
});

// ---------------------------------------------------------------------------
// NVA-W8-VERIFYREG2: entry-point reachability (named/admitted).

/**
 * A consumer-shaped root -- deliberately NOT this repo's own self-checkout, matching the
 * acceptance criterion the backlog item names ("a consumer-shaped fixture is used wherever
 * the entry point behaves differently there"): the security-gate instance this item cites
 * was invisible precisely because everything was measured inside this checkout. `files` is a
 * map of repo-relative path -> file contents; only the given files exist under the fixture.
 */
function withFixtureRoot(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "haw-entrypoint-fixture-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, "utf8");
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

check("HAW-B00 discovers this repository's real entry points, including the bootstrap driver", () => {
  const found = discoverEntryPoints(repoRoot);
  assert.ok(Array.isArray(found) && found.length > 0);
  assert.ok(found.some((entryPoint) => entryPoint.path === "plugins/pipeline-core/scripts/onboarding-init.mjs"));
});

check("HAW-B01 this repository's own entry points are reachable: never named-but-refused, never admitted-but-unnamed", () => {
  const result = checkEntryPointReachability({ root: repoRoot });
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

check("HAW-B02 a consumer-shaped root with no plugins/pipeline-core tree degrades to zero findings, never a crash", () => {
  withFixtureRoot({ "README.md": "consumer project, no plugin source tree\n" }, (root) => {
    const result = checkEntryPointReachability({ root });
    assert.deepEqual(result, { ok: true, findings: [] });
    assert.deepEqual(discoverEntryPoints(root), []);
  });
});

check("HAW-B03 a driver the bootstrap docs name but the readiness guard never admits fails as named-but-refused", () => {
  withFixtureRoot({
    "plugins/pipeline-core/scripts/example-driver.mjs": "#!/usr/bin/env node\n// Usage: node plugins/pipeline-core/scripts/example-driver.mjs --root <dir>\n",
    "plugins/pipeline-core/skills/pipeline-start/SKILL.md": "Run `example-driver.mjs` to walk the chain.\n",
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs": "// this guard has never heard of the driver above\n",
  }, (root) => {
    const result = checkEntryPointReachability({ root });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /named by the bootstrap docs but not admitted/);
  });
});

// The guard fixture text below deliberately mirrors the real admission idiom
// (const X_SCRIPT = fileURLToPath(new URL("../scripts/<name>.mjs", import.meta.url));
// ... script === X_SCRIPT ...), not a bare-stem comment -- see
// NVA-B-ENTRYSTEM-1: a bare-stem comment is exactly the shape that used to produce a
// phantom admission and must NOT be read as "admitted" any more.
const REALISTIC_ADMISSION_GUARD =
  "const EXAMPLE_DRIVER_SCRIPT = fileURLToPath(new URL(\"../scripts/example-driver.mjs\", import.meta.url));\n"
  + "if (script === EXAMPLE_DRIVER_SCRIPT) return sanctioned(args, root);\n";

check("HAW-B04 a script the readiness guard admits but no skill or guard names fails as admitted-but-unnamed", () => {
  withFixtureRoot({
    "plugins/pipeline-core/scripts/example-driver.mjs": "#!/usr/bin/env node\n// Usage: node plugins/pipeline-core/scripts/example-driver.mjs --root <dir>\n",
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs": REALISTIC_ADMISSION_GUARD,
  }, (root) => {
    const result = checkEntryPointReachability({ root });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /admitted by .*guard-lifecycle-ready\.mjs but named by no skill or guard/);
  });
});

check("HAW-B05 named in the bootstrap docs AND admitted by the guard passes -- removing either makes it fail (AC3)", () => {
  const files = {
    "plugins/pipeline-core/scripts/example-driver.mjs": "#!/usr/bin/env node\n// Usage: node plugins/pipeline-core/scripts/example-driver.mjs --root <dir>\n",
    "plugins/pipeline-core/skills/pipeline-start/SKILL.md": "Run `example-driver.mjs` to walk the chain.\n",
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs": REALISTIC_ADMISSION_GUARD,
  };
  withFixtureRoot(files, (root) => {
    assert.deepEqual(checkEntryPointReachability({ root }), { ok: true, findings: [] });
  });
  // Removing the driver's admission (the guard no longer mentions it) makes it fail.
  withFixtureRoot({ ...files, "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs": "// unrelated\n" }, (root) => {
    assert.equal(checkEntryPointReachability({ root }).ok, false);
  });
  // Removing the bootstrap pointer (the skill no longer names it) makes it fail too, since an
  // admitted-but-guard-known script with no skill naming it is still undiscoverable.
  withFixtureRoot({ ...files, "plugins/pipeline-core/skills/pipeline-start/SKILL.md": "unrelated skill body\n" }, (root) => {
    assert.equal(checkEntryPointReachability({ root }).ok, false);
  });
});

check("HAW-B06 a comment citing an evidence filename that merely contains a script's stem is not read as an admission (NVA-B-ENTRYSTEM-1)", () => {
  const files = {
    "plugins/pipeline-core/scripts/continuity-status.mjs": "#!/usr/bin/env node\n// Usage: node plugins/pipeline-core/scripts/continuity-status.mjs --root <dir>\n",
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs":
      "// see evidence/2026-09-02-nva-rebdead-f5-continuity-status.json for the RED capture\n",
  };
  withFixtureRoot(files, (root) => {
    // No admission rule exists for this script, so the false-positive "admitted-but-unnamed"
    // finding must not fire, and (nothing names it either) the check is clean.
    assert.deepEqual(checkEntryPointReachability({ root }), { ok: true, findings: [] });
  });
  // Paired positive: the SAME stem, but with the guard actually carrying the real admission
  // idiom instead of a comment that merely contains the stem, DOES produce the
  // admitted-but-unnamed finding -- proving the tightened match still detects a real admission
  // rather than having been disabled outright.
  withFixtureRoot({
    ...files,
    "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs": REALISTIC_ADMISSION_GUARD.replace(/example-driver/g, "continuity-status").replace(/EXAMPLE_DRIVER_SCRIPT/g, "CONTINUITY_STATUS_SCRIPT"),
  }, (root) => {
    const result = checkEntryPointReachability({ root });
    assert.equal(result.ok, false);
    assert.match(result.findings.join("\n"), /admitted by .*guard-lifecycle-ready\.mjs but named by no skill or guard/);
  });
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_PCI_TEST_INJECT_FAILURE: "PCI02",
      PIPELINE_PCI_TEST_SELF_PROBE_CHILD: "1",
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED");
  assert.equal(records[0].caseCount, 28);
  assert.equal(disposed.length, 28);
  assert.equal(disposed.find((record) => record.id === "PCI02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "PCI28")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 27, fail: 1, skip: 0, todo: 0 });
  assert.equal(records.at(-1).declaredCount, 28);
  assert.equal(records.at(-1).disposedCount, 28);
});

assert.equal(cases.length, 28, "the complete product capability inventory corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
