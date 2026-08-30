#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-A98R6-1: the first increment of #98's R6 integrated fixture.
 *
 * `publication-executor.test.mjs` already proves the disposable-bare-repo-
 * remote pattern and already exercises execute+readback as one flow -- but it
 * starts from an authority that is ALREADY approved/authorized via the raw
 * `publication-authority.mjs` v1 helpers (`preparePublicationAuthority` /
 * `approvePublicationAuthority` / `authorizePublicationAuthority`), never from
 * a cold `prepare` through the productive v2 CLI operations.
 *
 * This file is the narrower, disposable-remote PUBLICATION LOOP increment of
 * R6 (specs/sprint-nova-epic/design/post-v0.4.7-delivery-loop.md SS R1/R2/R6):
 * it chains R1's capability preflight into R2's productive v2 operations,
 * `preflight` -> `prepare` -> `authorize-plan` -> `authorize-apply --activate`
 * -> `execute` -> `readback`, in that real sequence, against a disposable
 * local bare-repo remote -- proving the core publication machinery genuinely
 * works end-to-end as one continuous flow, not just as separately-tested
 * pieces. R0/R3/R4/R5 wiring into this same fixture is explicitly out of
 * scope here; see the dispatch report for the concrete follow-on roadmap.
 *
 * A CONFIRMED FINDING, not an assumption carried in from the briefing: the
 * productive v2 chain's `authorize-plan`/`authorize-apply` steps do not
 * verify any Ed25519 signature. `critical-action-authorization.mjs` verifies
 * one for the push/deploy critical-action routes, but its own docstring says
 * plainly that "Publication keeps its own external-verification route
 * through the fixed executor and is untouched here" -- and reading
 * `publication-executor.mjs`/`publication-authority.mjs` end to end confirms
 * that route is the two-phase plan/apply DIGEST binding (`planSha256`,
 * `authorityRawSha256` CAS, the approval time window), not a signature over
 * `approvalId`/`attribution`, which stay plain caller-supplied strings all
 * the way through `activatePublicationAuthorityV2`. The spec text itself
 * (SS R2 point 4) says authorize-apply "consumes explicit Human confirmation"
 * -- it does not say it verifies a signature either. This file's negative
 * case therefore exercises the digest-binding boundary that genuinely gates
 * this flow today, rather than fabricating a signature check the code does
 * not perform (exactly the self-attested-fabrication failure
 * `publication-gate-evidence.mjs`'s own docstring warns against). A real
 * Ed25519-signed PO consent route for this exact step is proposed, not yet
 * accepted (ADR-0064) -- see the dispatch report.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReleasePreflight } from "./release-preflight.mjs";
import { deriveGateEvidence } from "./publication-gate-evidence.mjs";
import { checkReleaseStateConsistency } from "./check-release-state-consistency.mjs";
import { createPublicReleaseState } from "../lib/public-release-state.mjs";
import { runVerifyJournal, sealVerifyCleanupRegistration } from "./verify-journal.mjs";
import {
  applyPublicationAuthorization,
  executePublication,
  planPublicationAuthorization,
  preflightPublication,
  preparePublicationTransaction,
  readbackPublication,
  validatePublicationExecutorResult,
} from "./publication-executor.mjs";

const roots = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const oid = (root, value) => git(root, "rev-parse", value).stdout.trim();
const h = (char) => char.repeat(64);

function gateEvidence(gate, candidateOid, candidateTree) {
  return {
    schema: "pipeline.publication-gate-evidence.v1", gate,
    candidate: { commit: candidateOid, tree: candidateTree }, status: "passed", exitCode: 0,
  };
}

/**
 * NVA-A98R6-2: the "verify" gate's evidence, unlike the identity/security/critic
 * placeholders above (out of scope here), is a REAL receipt: it runs a small,
 * fixture-local, throwaway example test list through this repository's own
 * general-purpose `runVerifyJournal`, then derives `pipeline.publication-gate-
 * evidence.v1` from that real result via `publication-gate-evidence.mjs`'s own
 * deriver -- never a hand-asserted "passed". `registerRun` follows the exact
 * convention `verify-journal.test.mjs` already established for testing
 * `runVerifyJournal` in isolation.
 */
const registerFixtureVerifyRun = (request) => sealVerifyCleanupRegistration({
  status: "registered", runId: request.runId, runPath: request.runPath,
  sessionId: "a98r6-fixture-session", descriptorSha256: "d".repeat(64),
  resourceId: `verify-${request.runId}`, registeredAt: "2026-08-01T00:00:00.000Z",
});

function writeCheckScript(root, name, body) {
  const dir = join(root, "checks");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.mjs`);
  writeFileSync(file, body);
  return file;
}

/** Runs ONE real, trivial example test (never this repository's own several-hundred-item
 * list) through the real `runVerifyJournal` plumbing, genuinely passing or genuinely
 * failing depending on `exitOk`. */
async function realVerifyRun(value, { exitOk }) {
  const body = exitOk
    ? "process.stdout.write('a98r6 example check ok\\n');\n"
    : "process.stderr.write('a98r6 example check failing on purpose\\n');\nprocess.exitCode = 1;\n";
  const file = writeCheckScript(value.root, "example-check", body);
  return runVerifyJournal({
    gitCommonDir: join(value.root, ".git"),
    repoRoot: value.root,
    candidate: { commit: value.candidate, tree: value.tree },
    suites: [{ name: "example-check", file }],
    policyInputs: { fixture: "a98r6-productive-flow" },
    registerRun: registerFixtureVerifyRun,
    runId: `a98r6-verify-${value.candidate.slice(0, 8)}`,
  });
}

/** The `pipeline.verify-evidence.v0` shape `deriveGateEvidence` reads, built from the
 * REAL runVerifyJournal result's own steps/exit codes -- never hand-asserted. */
function verifyEvidenceFromRealRun(value, result) {
  return {
    schema: "pipeline.verify-evidence.v0",
    candidate: { commit: value.candidate, tree: value.tree },
    steps: result.steps.map((step) => ({ name: step.name, exitCode: step.exitCode })),
    exitCode: result.steps.some((step) => step.exitCode !== 0) ? 1 : 0,
  };
}

function releasePreflightFixture({ candidateOid, candidateTree, baseOid, baseTree, capabilityRecordSha256 }) {
  const documentation = {
    prd: { path: "specs/nova/prd.md", sha256: h("1") },
    spec: { path: "specs/nova/spec.md", sha256: h("2") },
    acceptance: { path: "specs/nova/acceptance.md", sha256: h("3") },
    result: { path: "specs/nova/result.md", sha256: h("4") },
  };
  return createReleasePreflight({
    preflightId: "a98r6-fixture",
    candidate: { commit: candidateOid, tree: candidateTree },
    base: { commit: baseOid, tree: baseTree },
    version: { decisionId: h("5"), decisionSha256: h("6"), targetVersion: "0.5.6", candidateVersion: "0.5.6" },
    repository: { headCommit: candidateOid, headTree: candidateTree, clean: true },
    documentation,
    lifecycle: { featureId: "nva-a98r6", manifestPath: "specs/nova/lifecycle.json", manifestSha256: h("7"), status: "prepared" },
    retention: {
      policySha256: h("8"),
      records: Object.values(documentation)
        .map((document) => ({ path: document.path, classification: "public", retentionClass: "active", archiveDigest: null, archiveProvenanceSha256: null }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    },
    consent: { decisionId: h("9"), status: "approved", authoritySha256: h("a"), evaluatedAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z" },
    humanApproval: null,
    gates: {
      gg03: { required: false, binding: null },
      inventory: [
        { id: "verify", kind: "local-final", status: "pending" }, { id: "security", kind: "local-final", status: "pending" }, { id: "critic", kind: "local-final", status: "pending" },
        { id: "remote", kind: "external", status: "pending" }, { id: "human", kind: "external", status: "pending" },
      ],
    },
    extensions: {
      schema: "pipeline.release-preflight-extension-input.v1", status: "registered", registrySha256: h("b"),
      requirements: [{ id: "publication-capability-preflight", sha256: capabilityRecordSha256, status: "accepted" }],
    },
  });
}

function fixture(name) {
  const parent = mkdtempSync(join(tmpdir(), `publication-productive-${name}-`));
  roots.push(parent);
  const remote = join(parent, "remote.git");
  const root = join(parent, "work");
  mkdirSync(root);
  mkdirSync(join(root, "evidence"));
  assert.equal(git(parent, "init", "--bare", "--quiet", remote).status, 0);
  assert.equal(git(root, "init", "--quiet", "-b", "main").status, 0);
  git(root, "config", "user.email", "publication@example.invalid");
  git(root, "config", "user.name", "Publication Fixture");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "--quiet", "-m", "base");
  const base = oid(root, "HEAD");
  const baseTree = oid(root, "HEAD^{tree}");
  git(root, "remote", "add", "origin", remote);
  assert.equal(git(root, "push", "--quiet", "origin", `${base}:refs/heads/main`).status, 0);
  writeFileSync(join(root, "candidate.txt"), "candidate\n");
  git(root, "add", "candidate.txt");
  git(root, "commit", "--quiet", "-m", "candidate");
  const candidate = oid(root, "HEAD");
  const tree = oid(root, "HEAD^{tree}");
  return { parent, remote, root: realpathSync(root), base, baseTree, candidate, tree };
}

function writeEvidence(root, relPath, record) {
  const bytes = `${JSON.stringify(record)}\n`;
  writeFileSync(join(root, relPath), bytes);
  return relPath;
}

/**
 * Steps 1-3: preflight, gate/release-preflight evidence, prepare. Real R1 + the R2 prepare
 * leg. `verifyOk = false` runs a genuinely FAILING example test through the same real
 * `runVerifyJournal` plumbing, confirms `deriveGateEvidence` refuses to launder that real
 * failure into passing evidence, then confirms the honestly-recorded failure is itself
 * consulted -- and rejected -- by the real `preparePublicationTransaction` prepare step.
 */
async function prepareTransaction(value, { verifyOk = true } = {}) {
  const preflight = preflightPublication({
    rootDir: value.root, preflightId: "a98r6-fixture", candidateOid: value.candidate,
    remoteName: "origin", destinationRef: "refs/heads/main",
  });
  assert.equal(preflight.status, "ready");
  const preflightPath = writeEvidence(value.root, "evidence/capability-preflight.json", preflight);
  const identityPath = writeEvidence(value.root, "evidence/identity.json", gateEvidence("identity", value.candidate, value.tree));

  const verifyRun = await realVerifyRun(value, { exitOk: verifyOk });
  assert.equal(verifyRun.terminal.status, verifyOk ? "passed" : "failed");
  const verifySourcePath = writeEvidence(value.root, "evidence/verify-run-source.json", verifyEvidenceFromRealRun(value, verifyRun));
  let verifyPath;
  if (verifyOk) {
    const derivedVerify = deriveGateEvidence({ rootDir: value.root, gate: "verify", sourcePath: verifySourcePath });
    verifyPath = writeEvidence(value.root, "evidence/verify.json", derivedVerify.evidence);
  } else {
    assert.equal(verifyRun.steps[0].exitCode, 1, "the real spawned example check genuinely exited non-zero");
    assert.throws(
      () => deriveGateEvidence({ rootDir: value.root, gate: "verify", sourcePath: verifySourcePath }),
      /verify did not pass/u,
      "a real failing verify run must never be laundered into passing gate evidence",
    );
    // No passing evidence can honestly be derived from a real failure; record that failure
    // directly (never a fabricated pass) so the real prepare step below has something to
    // consult and reject.
    verifyPath = writeEvidence(value.root, "evidence/verify.json", { schema: "pipeline.publication-gate-evidence.v1", gate: "verify", candidate: { commit: value.candidate, tree: value.tree }, status: "failed", exitCode: 1 });
  }

  const securityPath = writeEvidence(value.root, "evidence/security.json", gateEvidence("security", value.candidate, value.tree));
  const criticPath = writeEvidence(value.root, "evidence/critic.json", gateEvidence("critic", value.candidate, value.tree));
  const releasePreflightRecord = releasePreflightFixture({
    candidateOid: value.candidate, candidateTree: value.tree, baseOid: value.base, baseTree: value.baseTree,
    capabilityRecordSha256: preflight.recordSha256,
  });
  assert.equal(releasePreflightRecord.status, "ready");
  const releasePreflightPath = writeEvidence(value.root, "evidence/release-preflight.json", releasePreflightRecord);
  const transactionId = `tx-${value.candidate.slice(0, 8)}`;
  if (!verifyOk) {
    assert.throws(
      () => preparePublicationTransaction({
        rootDir: value.root, transactionId, channel: "private",
        preflightPath, identityPath, verifyPath, securityPath, criticPath, releasePreflightPath,
      }),
      /verify evidence did not pass/u,
      "prepare must consult the real (failing) verify result, not merely carry it unused",
    );
    assert.equal(oid(value.remote, "refs/heads/main"), value.base, "a rejected prepare must never reach the remote");
    return { preflight, transactionId };
  }
  const prepared = preparePublicationTransaction({
    rootDir: value.root, transactionId, channel: "private",
    preflightPath, identityPath, verifyPath, securityPath, criticPath, releasePreflightPath,
  });
  assert.equal(prepared.record.publication.phase, "prepared");
  return { preflight, prepared, transactionId };
}

/** Step 4: authorize-plan, a read-only digest-bound preview of the apply action. */
function planTransaction(value, prepared, transactionId, { approvalId, attribution, approvedAt, expiresAt }) {
  const plan = planPublicationAuthorization({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: prepared.rawDigest, approvalId, attribution, approvedAt, expiresAt,
  });
  assert.equal(plan.status, "ready");
  return plan;
}

let tests = 0;
async function check(name, fn) {
  await fn();
  tests += 1;
  console.log(`PASS  ${name}`);
}

await check("disposable-remote publication loop: preflight -> prepare -> authorize-plan -> authorize-apply -> execute -> readback converge on real remote state", async () => {
  const value = fixture("loop");
  const now = 1_000_000;
  const approvalId = `po-${value.candidate.slice(0, 8)}`;
  const attribution = "PO Fixture";
  const approvedAt = now - 10;
  const expiresAt = now + 500_000;

  const { prepared, transactionId } = await prepareTransaction(value);
  const plan = planTransaction(value, prepared, transactionId, { approvalId, attribution, approvedAt, expiresAt });

  // Step 5: authorize-apply --activate, the digest-bound apply action the plan named.
  const applied = applyPublicationAuthorization({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: prepared.rawDigest, approvalId, attribution, approvedAt, expiresAt,
    planSha256: plan.planSha256, activate: true,
  }, { now: () => now });
  assert.equal(applied.phase, "push-authorized");
  assert.equal(oid(value.remote, "refs/heads/main"), value.base, "authorize-apply must not itself mutate the remote");

  // Step 6: execute -- the one real mutation attempt.
  let pushes = 0;
  const runGit = (args, options) => {
    if (args[0] === "push") pushes += 1;
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const executed = executePublication({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: applied.projectionRawSha256,
  }, { now: () => now + 1, runGit });
  assert.equal(validatePublicationExecutorResult(executed), true);
  assert.equal(executed.status, "closed");
  assert.equal(executed.pushAttempted, true);
  assert.equal(pushes, 1);
  assert.equal(executed.candidateOid, value.candidate);
  assert.equal(executed.readback.oid, value.candidate);
  assert.equal(executed.readback.tree, value.tree);
  assert.equal(oid(value.remote, "refs/heads/main"), value.candidate, "the disposable remote's main ref genuinely advances to the candidate");

  // Step 7: readback -- independent fresh reconfirmation against the actual disposable remote,
  // not the same in-process observation execute already made.
  const read = readbackPublication({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: executed.authorityRawSha256,
  }, { now: () => now + 2 });
  assert.equal(validatePublicationExecutorResult(read), true);
  assert.equal(read.status, "closed");
  assert.equal(read.pushAttempted, false, "readback never pushes again");
  assert.equal(read.readback.oid, value.candidate);
  assert.equal(read.readback.tree, value.tree);
  assert.equal(read.publicationReceiptDigest, executed.publicationReceiptDigest, "readback converges on the exact same receipt execute produced");

  /*
   * NVA-A98R6-3: one more real-world property beyond "the loop converges" -- does a
   * machine-readable "what got published" projection agree with what the disposable
   * remote ACTUALLY now holds? A real lightweight tag is created and pushed to the
   * disposable remote (never faked), then an INDEPENDENT fresh clone of that remote
   * (not the working copy that did the push) is used as the checker's rootDir, so
   * `checkReleaseStateConsistency`'s own `nativeObserve` resolves the tag purely from
   * what the remote actually contains. The projection is built from Step 7's own
   * observed commit/tree (`read.readback`), through the real `createPublicReleaseState`
   * constructor -- never a hand-asserted record -- and checked with the real,
   * unmodified `checkReleaseStateConsistency` (default `docs/` paths, no
   * `observeTag` dependency override, matching check-release-state-consistency.test.mjs's
   * own positive-case convention).
   */
  const releaseVersion = "0.5.6"; // matches releasePreflightFixture's targetVersion/candidateVersion above
  const releaseTag = `v${releaseVersion}`;
  assert.equal(git(value.root, "tag", releaseTag, value.candidate).status, 0);
  assert.equal(git(value.root, "push", "--quiet", "origin", releaseTag).status, 0);

  const releaseStateRoot = join(value.parent, "release-state-clone");
  assert.equal(git(value.parent, "clone", "--quiet", value.remote, releaseStateRoot).status, 0);
  mkdirSync(join(releaseStateRoot, "docs"));
  const writeReleaseState = (record, statedStatus = record.publicationStatus) => {
    writeFileSync(join(releaseStateRoot, "docs/release-state.json"), `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(
      join(releaseStateRoot, "docs/state.md"),
      `**Release state:** version \`${record.version}\` · tag \`${record.tag}\` · commit \`${record.commit}\` · tree \`${record.tree}\` · status \`${statedStatus}\`\n`,
    );
  };

  const honestProjection = createPublicReleaseState({
    version: releaseVersion, tag: releaseTag, commit: read.readback.oid, tree: read.readback.tree,
    publicationStatus: "published", releaseUrlClass: "public-release", observedAt: "2026-08-01T00:00:00.000Z",
  });
  writeReleaseState(honestProjection);
  const honestCheck = checkReleaseStateConsistency({ rootDir: releaseStateRoot });
  assert.deepEqual(honestCheck.reasons, [], `an honestly-consistent projection must be accepted: ${JSON.stringify(honestCheck.reasons)}`);
  assert.equal(honestCheck.status, "consistent");

  // Negative: a projection claiming a commit the disposable remote's real tag never
  // pointed at (the fixture's own tracked base, not the candidate it actually converged
  // to) must be rejected by the REAL checker -- proving the check is real, not decorative.
  const tamperedProjection = createPublicReleaseState({
    version: releaseVersion, tag: releaseTag, commit: value.base, tree: value.baseTree,
    publicationStatus: "published", releaseUrlClass: "public-release", observedAt: "2026-08-01T00:00:00.000Z",
  });
  writeReleaseState(tamperedProjection);
  const tamperedCheck = checkReleaseStateConsistency({ rootDir: releaseStateRoot });
  assert.equal(tamperedCheck.status, "blocked");
  assert.ok(
    tamperedCheck.reasons.includes("published-identity-mismatch"),
    `expected published-identity-mismatch, got ${JSON.stringify(tamperedCheck.reasons)}`,
  );
});

await check("authorize-apply rejects a tampered plan digest before any effect, even after a genuine authorize-plan preview", async () => {
  const value = fixture("tampered-plan");
  const now = 1_000_000;
  const approvalId = `po-${value.candidate.slice(0, 8)}`;
  const attribution = "PO Fixture";
  const approvedAt = now - 10;
  const expiresAt = now + 500_000;

  const { prepared, transactionId } = await prepareTransaction(value);
  planTransaction(value, prepared, transactionId, { approvalId, attribution, approvedAt, expiresAt });

  assert.throws(() => applyPublicationAuthorization({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: prepared.rawDigest, approvalId, attribution, approvedAt, expiresAt,
    planSha256: "0".repeat(64), activate: true,
  }, { now: () => now }), /plan drift/u);
  assert.equal(oid(value.remote, "refs/heads/main"), value.base, "a rejected apply must never reach the remote");

  assert.throws(() => executePublication({
    rootDir: value.root, transactionId, channel: "private", expectedAuthorityRawSha256: prepared.rawDigest,
  }, { now: () => now + 1 }), /push-authorized|authority/u, "execute has nothing to consume: the authority never advanced past prepared");
});

await check("authorize-apply rejects a genuinely-planned apply replayed after its own expiry window", async () => {
  const value = fixture("expired-window");
  const now = 1_000_000;
  const approvalId = `po-${value.candidate.slice(0, 8)}`;
  const attribution = "PO Fixture";
  const approvedAt = now - 10;
  const expiresAt = now + 100;

  const { prepared, transactionId } = await prepareTransaction(value);
  const plan = planTransaction(value, prepared, transactionId, { approvalId, attribution, approvedAt, expiresAt });

  assert.throws(() => applyPublicationAuthorization({
    rootDir: value.root, transactionId, channel: "private",
    expectedAuthorityRawSha256: prepared.rawDigest, approvalId, attribution, approvedAt, expiresAt,
    planSha256: plan.planSha256, activate: true,
  }, { now: () => expiresAt + 1 }), /not active at apply time/u);
  assert.equal(oid(value.remote, "refs/heads/main"), value.base, "an expired apply must never reach the remote");
});

await check("a genuinely failing example test blocks the real prepare step -- the real result is consulted downstream, not merely present", async () => {
  const value = fixture("failing-verify");
  const { transactionId } = await prepareTransaction(value, { verifyOk: false });
  assert.match(transactionId, /^tx-/u);
});

/**
 * NVA-A98R6-4: the R0 ("exact baseline adoption") piece the roadmap in this file's own
 * top-of-file comment and NVA-A98R6-1/2/3's dispatch reports named as the last remaining
 * non-PO-gated wiring increment. Per spec SS R0, a real baseline-adoption record binds
 * previous head/tree, released-base commit/tree, resulting rebased head/tree, the ordered
 * replayed commits, per-conflict semantic disposition and changed-path impact closure.
 *
 * The scoping decision this dispatch was given explicitly: do NOT hand-assert a "receipt"
 * that just claims these fields are true -- that would be decorative (nothing would verify
 * the resulting head genuinely descends from replaying the declared commits onto the
 * declared base). Instead `baselineAdoptionFixture` performs a REAL `git rebase` inside a
 * fresh disposable local repository (no remote involved -- R0 is explicitly a no-push
 * step), `buildBaselineAdoptionReceipt` derives every receipt field from what git actually
 * produced (`git rev-parse`, `git rev-list --reverse`, `git diff --name-status` -- never
 * invented), and `validateBaselineAdoptionReceipt` independently RE-DERIVES the
 * base/resultingHead relationship from git plumbing rather than trusting the numbers the
 * builder already collected: it recomputes each claimed tree from its claimed commit,
 * confirms `git merge-base(base, resultingHead) === base` (proving resultingHead
 * genuinely descends from base), and recomputes `git rev-list --reverse base..resultingHead`
 * to confirm it matches the claimed ordered replayed-commit list exactly.
 *
 * This fixture's rebase is conflict-free by construction (the "previous Nova head" branch
 * and the "released base" branch touch disjoint files), so the receipt's `conflicts` field
 * is honestly `[]` here -- real per-conflict semantic-disposition capture over an actually
 * conflicting rebase is a further increment, not simulated by this dispatch. Scope note
 * repeated in the dispatch report: this proves a REAL rebase-receipt validator works
 * against REAL git history in disposable fixture resources; it does not reproduce, and
 * does not claim to reproduce, this repository's actual historical v0.4.7 rebase.
 */
function baselineAdoptionFixture() {
  const parent = mkdtempSync(join(tmpdir(), "baseline-adoption-"));
  roots.push(parent);
  const root = join(parent, "work");
  mkdirSync(root);
  assert.equal(git(root, "init", "--quiet", "-b", "main").status, 0);
  git(root, "config", "user.email", "publication@example.invalid");
  git(root, "config", "user.name", "Publication Fixture");

  writeFileSync(join(root, "shared.txt"), "shared\n");
  git(root, "add", "shared.txt");
  git(root, "commit", "--quiet", "-m", "common ancestor");
  const common = oid(root, "HEAD");

  assert.equal(git(root, "checkout", "--quiet", "-b", "released-base").status, 0);
  writeFileSync(join(root, "base-only.txt"), "base change\n");
  git(root, "add", "base-only.txt");
  git(root, "commit", "--quiet", "-m", "released base commit");
  const base = { commit: oid(root, "HEAD"), tree: oid(root, "HEAD^{tree}") };

  assert.equal(git(root, "checkout", "--quiet", "-b", "nova-previous", common).status, 0);
  writeFileSync(join(root, "nova-1.txt"), "nova change one\n");
  git(root, "add", "nova-1.txt");
  git(root, "commit", "--quiet", "-m", "nova commit one");
  writeFileSync(join(root, "nova-2.txt"), "nova change two\n");
  git(root, "add", "nova-2.txt");
  git(root, "commit", "--quiet", "-m", "nova commit two");
  const previousHead = { commit: oid(root, "HEAD"), tree: oid(root, "HEAD^{tree}") };

  return { parent, root: realpathSync(root), common, base, previousHead };
}

/** Derives every receipt field from what the real rebase actually produced -- never
 * invented. `replayedCommits` is the real, ordered (oldest-first) set of commits reachable
 * from `resultingHead` but not from `base`; `changedPathImpact` is the real changed-path
 * closure between `base` and `resultingHead`. */
function buildBaselineAdoptionReceipt(root, { previousHead, base, resultingHead }) {
  const replayedCommits = git(root, "rev-list", "--reverse", `${base.commit}..${resultingHead.commit}`)
    .stdout.trim().split("\n").filter(Boolean);
  const changedPathImpact = git(root, "diff", "--name-status", base.commit, resultingHead.commit)
    .stdout.trim().split("\n").filter(Boolean)
    .map((line) => {
      const [status, path] = line.split(/\s+/u);
      return { status, path };
    });
  return {
    schema: "pipeline.baseline-adoption-receipt.v1",
    previousHead, base, resultingHead,
    replayedCommits,
    conflicts: [],
    changedPathImpact,
  };
}

/** Real validator: independently RE-DERIVES the claimed base/resultingHead relationship
 * from git plumbing rather than trusting the receipt's own numbers. Returns
 * `{ status: "verified" | "rejected", reasons: string[] }`; never throws on a bad receipt
 * so both the positive and negative case can assert on the same shape. */
function validateBaselineAdoptionReceipt(root, receipt) {
  const reasons = [];
  const baseTreeCheck = git(root, "rev-parse", `${receipt.base.commit}^{tree}`);
  if (baseTreeCheck.status !== 0 || baseTreeCheck.stdout.trim() !== receipt.base.tree) reasons.push("base-tree-mismatch");

  const headExists = git(root, "cat-file", "-e", receipt.resultingHead.commit);
  if (headExists.status !== 0) {
    reasons.push("resulting-head-unknown");
    return { status: "rejected", reasons };
  }
  const headTreeCheck = git(root, "rev-parse", `${receipt.resultingHead.commit}^{tree}`);
  if (headTreeCheck.status !== 0 || headTreeCheck.stdout.trim() !== receipt.resultingHead.tree) reasons.push("resulting-head-tree-mismatch");

  const mergeBase = git(root, "merge-base", receipt.base.commit, receipt.resultingHead.commit);
  if (mergeBase.status !== 0 || mergeBase.stdout.trim() !== receipt.base.commit) reasons.push("resulting-head-does-not-descend-from-base");

  const realReplay = git(root, "rev-list", "--reverse", `${receipt.base.commit}..${receipt.resultingHead.commit}`);
  const realReplayed = realReplay.status === 0 ? realReplay.stdout.trim().split("\n").filter(Boolean) : [];
  if (JSON.stringify(realReplayed) !== JSON.stringify(receipt.replayedCommits)) reasons.push("replayed-commits-mismatch");

  return { status: reasons.length === 0 ? "verified" : "rejected", reasons };
}

await check("R0 baseline adoption: a real rebase's receipt is built from and re-verified against the disposable repo's actual post-rebase state", () => {
  const value = baselineAdoptionFixture();

  // The real rebase: replay nova-previous's two commits onto released-base. No conflicts by
  // construction (disjoint files), so this is a genuine, clean git rebase -- not simulated.
  assert.equal(git(value.root, "rebase", "--quiet", value.base.commit).status, 0);
  const resultingHead = { commit: oid(value.root, "HEAD"), tree: oid(value.root, "HEAD^{tree}") };
  assert.notEqual(resultingHead.commit, value.previousHead.commit, "a real rebase mints new commit OIDs (new parents), never reuses the pre-rebase ones");

  const receipt = buildBaselineAdoptionReceipt(value.root, { previousHead: value.previousHead, base: value.base, resultingHead });
  assert.equal(receipt.replayedCommits.length, 2, "both nova-previous commits were genuinely replayed");
  assert.ok(receipt.changedPathImpact.some((entry) => entry.path === "nova-1.txt"), "the real changed-path closure includes the first replayed commit's file");
  assert.ok(receipt.changedPathImpact.some((entry) => entry.path === "nova-2.txt"), "the real changed-path closure includes the second replayed commit's file");
  assert.ok(receipt.changedPathImpact.every((entry) => entry.path !== "base-only.txt"), "the base's own pre-existing file is not part of the closure between base and resultingHead");

  const honest = validateBaselineAdoptionReceipt(value.root, receipt);
  assert.deepEqual(honest.reasons, [], `an honest receipt built from the real rebase must be accepted: ${JSON.stringify(honest.reasons)}`);
  assert.equal(honest.status, "verified");

  // Negative: hand-edit the receipt to claim a resultingHead that does NOT actually
  // correspond to the real rebase outcome. `value.previousHead` is a real commit in this
  // same disposable repo (the genuine pre-rebase Nova head) -- an unrelated-but-real OID,
  // never a fabricated one -- so this exercises exactly the tampering the DoD names.
  const tampered = { ...receipt, resultingHead: { ...value.previousHead } };
  const rejected = validateBaselineAdoptionReceipt(value.root, tampered);
  assert.equal(rejected.status, "rejected");
  assert.ok(rejected.reasons.includes("resulting-head-does-not-descend-from-base"), `expected descent-check failure, got ${JSON.stringify(rejected.reasons)}`);
  assert.ok(rejected.reasons.includes("replayed-commits-mismatch"), `expected replayed-list mismatch, got ${JSON.stringify(rejected.reasons)}`);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`publication-executor-productive-flow: ${tests} tests passed`);
