// SPDX-License-Identifier: SUL-1.0
/**
 * design-approval-route.e2e.test.mjs -- current canonical DAB fixture successor (test-only).
 * Original a4d6 route/retirement history remains immutable in the source proposal.
 * Current feature approval retains the original v8 projection in a physical
 * accepted envelope and publishes the closed v9 State reference. This test
 * supplies genuine owner capabilities; platform support is never fabricated.
 * Native Windows execution requires the Source-owned requester/Registry/domain
 * backend and the coherent selected State writer. The only admitted skip is the typed
 * HOST-LIMITATION for SDC-AUTHORITY-UNAVAILABLE with reason WIN-AUTH-ANCESTOR-OWNER/-ACL/-MUTATION
 * on win32: a human-controlled ancestor, intentionally outside the agent-facing threat model
 * (PO decision 2026-10-17, specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md). Every
 * other error fails; on a host whose ancestors pass, every assertion including AC-155 runs.
 *
 * Run: node --test plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs
 *
 * Spec: specs/sprint-alfred-epic/design/adr-0085-removal-2026-10-08.md (C3, C4, C6-C8, section 17, row 2),
 * Ruling 77 in specs/sprint-alfred-epic/plans/0.7-execution-order.md, API contract
 * specs/sprint-alfred-epic/plans/adr-0085-u1-u3-api-contract.md (sections 4-5).
 *
 * Historical a4d6 expectations below are retained as provenance, not current verdicts:
 *   route 1  present-plan has no --review-receipt flag (accepts only --by and --design-workflow-package).
 *   route 2  same first failure; everything after it is unreachable until present-plan works.
 *   route 3  same; the boundary is additionally gated on planApproval.schema === v8 so it cannot pass vacuously.
 *   route 4  same; zero continuity-cas is asserted together with a SUCCESSFUL approve (not vacuous).
 *   V        approve-plan refuses the in-flight v2 presentation today, but without a typed code that names
 *            present-plan --review-receipt: RED on the hint.
 *   retired  present-plan --design-workflow-package, approve-plan --design-workflow-approval-request and the
 *            course / advisor / readiness scripts do not return the retirement codes yet; the lib table
 *            lib/retired-design-codes.mjs does not exist (dynamic import fails).
 *
 * Assumptions about names the note does not fix (all named here, none silent):
 *   A1  Decision V asserts a typed code PATTERN plus the "present-plan --review-receipt" hint, not a pinned name
 *       (the note, section 3 / section 17, says only "a typed code").
 *   A2  The old approve-plan flag --design-workflow-approval-request maps to DWP-APPROVAL-REQUEST-RETIRED. The
 *       mapping comes from adr-0085-implementation-plan.md line 21 (the four codes), not from the note.
 *   A3  Retired scripts, invoked with no arguments, exit non-zero and print their code and the hint
 *       "present-plan --review-receipt" on stdout or stderr: design-advisory-coordinator.mjs and
 *       design-advisory-admission.mjs -> DESIGN-ADVISORY-COURSE-RETIRED (C6); design-course-session.mjs,
 *       design-course-coordinator.mjs and runner-design-readiness-bootstrap.mjs -> DESIGN-COURSE-RETIRED (C7, C8).
 *   A4  lib/retired-design-codes.mjs exports the four codes; the export SHAPE is not pinned: each code must
 *       appear among the module's exported keys or string values (any depth).
 *   A5  present-plan prints exactly ONE line containing "sign-intent", with absolute --repo-root and --request
 *       paths (C3, T25). The --directory (key directory) text is NOT pinned: a fixture HOME has no machine plane.
 *   A6  The request file is named in that command; the proof is written next to it, with "request" replaced by
 *       "proof" in the file name (parity with designWorkflowApprovalProofPath, pipeline-state.mjs:8894).
 *   A7  approve-plan receives the repo-relative, forward-slash form of the request path (parity with v7).
 *   A8  The record is pipeline.plan-approval.v8 (Ruling 77a): schema, approvedBy, approvedAt, submissionSha256,
 *       profileSha256, poGateAuthority, [priorInvalidationSha256], designApprovalBinding, designApproval; none of
 *       designAdvisorAdmissionSha256, designWorkflowPackagePath, designWorkflowPackageSha256, designWorkflowApproval.
 *       designApproval = pipeline.design-approval.v1 with mode "signature" in the default configuration, and
 *       bindingSha256 === sha256(canonical(designApprovalBinding)) (canonical from lib/po-approval-proof.mjs).
 *   A9  Boundary = designAdvisoryAdmission(state, projectDir, planPath, specPath) from lib/guard-devplan-policy.mjs
 *       returning { ok: true } for the v8 record (hook-level cases belong to ADR0085-T0c).
 *   A10 Key route (measured, not assumed): approve-plan never reads HOME or the key directory. The v7 signature
 *       observer (pipeline-state.mjs:8900-8928) reads the proof from scratch/ and the trust anchor from
 *       project/critical-human-proof.json (readCriticalHumanProofPolicy, trustAnchors, schema v3). This file seeds
 *       that policy (committed) with the fixture key and assumes the v8 route reuses the same reader (C2 table:
 *       "the same trust policy"). GAP: sign-intent itself (openssl, key directory, passphrase seams in flux under
 *       TR-S1) is not driven; the proof is produced with node:crypto in the pipeline.po-approval-proof.v1 shape
 *       (signature over the intent digest), the same way lib/architecture-design-test-fixture.mjs signs.
 *   A11 State file: .claude/pipeline-state.json (measured by the first native capture; the root key "continuity"
 *       holds queueHead). The in-flight v2 presentation is seeded by direct state write.
 *   A12 "Zero continuity-cas" is asserted through queueHead.dispatch staying null across a SUCCESSFUL approve, plus
 *       the verb ledger of this file; the file never calls continuity-cas.
 *
 * Fixture: synthetic only. Temp git repo, temp HOME and USERPROFILE (no real home), no network. Missing or
 * not-yet-existing modules are imported dynamically per case; the file never crashes as a whole.
 * Never import harness/scripts/pipeline-state.test.mjs (it runs the whole suite on import; TP-5).
 */
import assert from "node:assert/strict";
import { after } from "node:test";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
// Original14 Source callbacks; synthetic METHOD fixtures, no native/Human grant.
const originalDesignCases = [
  {
    "id": "DABC001",
    "name": "compatibility: the genuine retained v8 envelope projection stays valid without replacing current v9 State"
  },
  {
    "id": "DABR001",
    "name": "route 1: present-plan --review-receipt accepts finished sources and hands over ONE ready sign command"
  },
  {
    "id": "DABR002",
    "name": "route 2: one design proof, approve-plan, and the closed v9 accepted-contract record"
  },
  {
    "id": "DABR003",
    "name": "route 3: the boundary library admits the current approved v9 accepted-contract record"
  },
  {
    "id": "DABR004",
    "name": "route 4: zero continuity-cas -- queueHead.dispatch stays unregistered across a successful present and approve"
  },
  {
    "id": "DABV001",
    "name": "decision V: an in-flight v2 presentation is refused with a typed code naming present-plan --review-receipt"
  },
  {
    "id": "DABX001",
    "name": "retired: present-plan --design-workflow-package returns DWP-PRESENT-RETIRED"
  },
  {
    "id": "DABX002",
    "name": "retired: approve-plan --design-workflow-approval-request returns DWP-APPROVAL-REQUEST-RETIRED (A2: mapping from the plan)"
  },
  {
    "id": "DABX003",
    "name": "retired: scripts/design-advisory-coordinator.mjs returns DESIGN-ADVISORY-COURSE-RETIRED and names the new route (A3)"
  },
  {
    "id": "DABX004",
    "name": "retired: scripts/design-advisory-admission.mjs returns DESIGN-ADVISORY-COURSE-RETIRED and names the new route (A3)"
  },
  {
    "id": "DABX005",
    "name": "retired: scripts/design-course-session.mjs returns DESIGN-COURSE-RETIRED and names the new route (A3)"
  },
  {
    "id": "DABX006",
    "name": "retired: scripts/design-course-coordinator.mjs returns DESIGN-COURSE-RETIRED and names the new route (A3)"
  },
  {
    "id": "DABX007",
    "name": "retired: scripts/runner-design-readiness-bootstrap.mjs returns DESIGN-COURSE-RETIRED and names the new route (A3)"
  },
  {
    "id": "DABX008",
    "name": "retired: lib/retired-design-codes.mjs holds the four retirement codes (A4)"
  },
  {
    "id": "DABX009",
    "name": "rebind 1: present-plan after a byte-identical feature-folder move builds a pathRebind binding and needs no new review round"
  },
  {
    "id": "DABX010",
    "name": "rebind 2: the same move plus one changed PRD byte still refuses with the existing typed review-chain code"
  },
  {
    "id": "DABX011",
    "name": "rebind 3: a request signed before the move is refused after the move with DAB-BINDING-DRIFT, so a fresh signature is needed"
  },
  {
    "id": "DABX012",
    "name": "rebind 4: a request created after the move is signed and approved by the real route"
  },
  {
    "id": "DABX013",
    "name": "C28e (Codex test run): present-plan names a trust policy that is not in the commit the request would bind, and writes no request"
  },
  {
    "id": "DABX014",
    "name": "C28e (Glossover G7): present-plan refuses a PRD and Spec the feature package cannot carry, before any request exists"
  },
  {
    "id": "DABX015",
    "name": "L3 (Claude run 3): present-plan refuses a review chain whose last round leaves findings open, names them and the delta route, and writes no request"
  },
  {
    "id": "DABX016",
    "name": "D247: present-plan refuses a Claude review round without a host observation of its reviewer, names the round and the route, and writes no request"
  },
  {
    "id": "DABX017",
    "name": "D247: the named route completes: hook observation, export-report and create stamp the observed model, and present-plan hands over the signing step"
  },
  {
    "id": "DABX018",
    "name": "D247: a Codex review round is presented with its visible unobserved label, and the signed binding is unchanged"
  }
];
const designCompletionCases = [];
function test(name, run) {
  const declared = originalDesignCases.find(row => row.name === name);
  assert.ok(declared, "original design case must be declared");
  designCompletionCases.push({ ...declared, run });
}

import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializeArchitectureDesignFixture } from "../lib/architecture-design-test-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const CLI = join(HERE, "pipeline-state.mjs");
const FIXED_AT = "2026-07-07T21:00:00.000Z";
const FEATURE_ID = "e2e";
const PLAN_PATH = "specs/e2e/prd_e2e.md";
const SPEC_PATH = "specs/e2e/spec.md";
const COMPANION_PATHS = ["specs/e2e/design.md", "specs/e2e/traceability.md"];
const REPORT_PATH = "specs/e2e/review/design-review-1.md";
const RECEIPT_PATH = "specs/e2e/review/design-review-receipt-1.json";
const TYPED_CODE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/u;
const NEW_ROUTE_HINT = "present-plan --review-receipt";
const V7_FIELDS = ["designAdvisorAdmissionSha256", "designWorkflowPackagePath", "designWorkflowPackageSha256", "designWorkflowApproval"];
const V8_KEYS = ["schema", "approvedBy", "approvedAt", "submissionSha256", "profileSha256", "poGateAuthority",
  "priorInvalidationSha256", "designApprovalBinding", "designApproval"];
const V8_REQUIRED = V8_KEYS.filter((key) => key !== "priorInvalidationSha256");
const V9_KEYS = [...V8_KEYS, "acceptedContract"];
const V9_REQUIRED = [...V8_REQUIRED, "acceptedContract"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const loadLib = (name) => import(pathToFileURL(join(PLUGIN_ROOT, "lib", name)).href);
async function tryLoadLib(name) {
  try { return { ok: true, mod: await loadLib(name) }; } catch (error) { return { ok: false, error }; }
}

const DIRS = [];
const FIXTURE_GIT_ENVIRONMENTS = new Map();
function tmp(prefix) {
  // Source-owned test storage: never place authority below a writable /tmp
  // ancestor or depend on the Verify runner's repository working directory.
  const base = userInfo().homedir;
  assert.equal(realpathSync(base), base, "fixture home must be canonical");
  const home = lstatSync(base);
  assert.ok(home.isDirectory() && !home.isSymbolicLink());
  if (process.platform !== "win32") assert.equal(home.uid, process.getuid());
  let cursor = base;
  while (true) {
    const entry = lstatSync(cursor);
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink());
    assert.equal(realpathSync(cursor), cursor);
    if (process.platform !== "win32") assert.equal(entry.mode & 0o022, 0);
    assert.equal(existsSync(join(cursor, ".git")), false, "fixture must be outside Git discovery");
    const next = dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  const dir = mkdtempSync(join(base, `design-route-${prefix}-`));
  const created = lstatSync(dir);
  assert.ok(created.isDirectory() && !created.isSymbolicLink());
  if (process.platform !== "win32") {
    assert.equal(created.uid, process.getuid());
    assert.equal(created.mode & 0o077, 0);
  }
  // buildSubmittedFeature retains the genuine Windows DACL hardening before
  // writing any fixture inputs or initializing Git or producer authority.
  DIRS.push(dir);
  return dir;
}
after(() => {
  for (const dir of DIRS) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: FIXTURE_GIT_ENVIRONMENTS.get(dir), timeout: 120_000 });
  if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}
function writeFileIn(dir, rel, text) {
  mkdirSync(join(dir, ...rel.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(dir, ...rel.split("/")), text);
}
let stateModule;
function readState(dir) {
  return JSON.parse(readFileSync(stateModule.statePath(dir), "utf8"));
}
function cli(fx, args) {
  fx.ledger.push(args[0]);
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: fx.dir, encoding: "utf8", env: fx.env, timeout: 120_000 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}
// These handles are issued by the real Source owners. The fixture never
// promotes a serialized METHOD assurance, PID, session identity or approval.
const ROUTE_PARTICIPANTS = ["onboarding-continuity", "human-guard-override", "chat-gate",
  "state-push-challenge", "native-goldfish", "managed-codex", "agy-session-consent",
  "agy-family-dispatch", "model-family-host", "afk-ledger", "session-power", "local-worker-supervisor"];
function readRouteMember(fx) {
  const owner = fx.routeOwner;
  assert.ok(owner.memberPath.startsWith(".git/agent-pipeline/session-authority/members/onboarding-continuity/"));
  const path = join(owner.repository.commonDir, owner.memberPath.slice(5));
  const before = lstatSync(path);
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.nlink === 1);
  if (process.platform !== "win32") {
    assert.equal(before.uid, process.getuid());
    assert.equal(before.mode & 0o077, 0);
  } else {
    // The genuine Windows requester/domain backend remains a prerequisite;
    // this observation cannot mint or replace its private capabilities.
    assert.equal(owner.windows.assessWindowsPrivatePath(path).status, "secure");
  }
  const bytes = readFileSync(path), after = lstatSync(path);
  for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeMs", "ctimeMs"])
    assert.equal(after[key], before[key], `fixture member physical ${key} conserved`);
  assert.equal(bytes.length, before.size);
  const value = JSON.parse(bytes);
  assert.equal(value.producerId, "onboarding-continuity");
  assert.equal(value.phase, "armed");
  return { value, ref: { path: owner.memberPath, sha256: sha256(bytes), size: bytes.length } };
}
async function bindRouteOwner(fx) {
  const lifecycle = await loadLib("worktree-lifecycle.mjs");
  const bridge = await loadLib("session-requester-bridge.mjs");
  const observers = await loadLib("session-authority-observers.mjs");
  const registry = await loadLib("session-authority-registry.mjs");
  const continuity = await loadLib("onboarding-continuity.mjs");
  const windows = await loadLib("windows-private-state.mjs");
  const repository = lifecycle.inspectSignedDescriptorCustodyRepository(fx.dir);
  // No CallerJSON native-positive fallback. An unavailable native producer is a real
  // prerequisite failure, except the typed HOST-LIMITATION (WIN-AUTH-ANCESTOR-OWNER only, on
  // win32: a human-controlled ancestor owner, outside the threat model, PO decision 2026-10-17), handled by
  // runRoute() via hostLimitationOf(); every other error still propagates and fails.
  const runtime = bridge.createControlledMethodRuntimeFixture({ repository,
    fixtureRoot: join(repository.commonDir, "agent-pipeline/controlled-method-fixtures/design-approval-route"),
    sessionId: "design-approval-route-fixture" });
  const ports = observers.createSessionAuthorityParticipantPorts({ repository });
  assert.deepEqual(ports.map(row => row.producerId), ROUTE_PARTICIPANTS);
  assert.equal(registry.initializeSessionAuthorityRegistry({ repository }, ports).status, "initialized");
  const port = ports.find(row => row.producerId === "onboarding-continuity").port;
  assert.equal(typeof port.executeCompanionOperation, "function");
  const owner = { repository, runtime, port, windows };
  await runtime.run(async () => {
    const observed = continuity.observeSessionCleanupState(fx.dir);
    const prepared = port.prepareOperation({ requesterHandle: runtime.requesterHandle, entry: "bind",
      input: { expectedStateSha256: observed.stateSha256, expectedRevision: observed.revision } });
    assert.equal(prepared.status, "prepared");
    const operation = port.observeOperation(prepared.operationHandle);
    const reserved = registry.withSessionAuthorityBoundary({ repository }, boundary =>
      registry.reserveSessionAuthorityMember({ boundary, producerPort: port,
        association: operation.association, operationHandle: prepared.operationHandle }));
    const executed = await port.executeOperation({ operationHandle: prepared.operationHandle,
      memberHandle: reserved.memberHandle, expectedMemberRef: reserved.memberRef });
    assert.equal(executed.status, "executed");
    Object.assign(owner, { operationHandle: prepared.operationHandle,
      executionHandle: executed.executionHandle, memberPath: reserved.memberRef.path });
  });
  fx.routeOwner = owner;
  readRouteMember(fx);
}
async function ownedCli(fx, args) {
  assert.ok(["present-plan", "approve-plan"].includes(args[0]));
  fx.ledger.push(args[0]);
  const owner = fx.routeOwner, member = readRouteMember(fx);
  const request = { operationHandle: owner.operationHandle, executionHandle: owner.executionHandle,
    expectedMemberRef: member.ref, expectedStateSha256: sha256(readFileSync(stateModule.statePath(fx.dir))),
    entry: args[0], argv: [...args] };
  const stdout = [], stderr = [], saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...values) => stdout.push(values.map(String).join(" "));
  console.error = console.warn = (...values) => stderr.push(values.map(String).join(" "));
  let result;
  try { result = await owner.runtime.run(() => owner.port.executeCompanionOperation(request)); }
  finally { Object.assign(console, saved); }
  assert.equal(result.status, "completed", `actual owned command prerequisite: ${JSON.stringify(result)}`);
  assert.deepEqual(result.memberRef, readRouteMember(fx).ref);
  assert.equal(result.statePostimage.sha256, sha256(readFileSync(stateModule.statePath(fx.dir))));
  return { status: result.exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n"), error: undefined };
}
function physicalRouteArtifact(fx, path) {
  assert.ok(typeof path === "string" && !path.includes("\\") && !path.startsWith("/")
    && path.split("/").every(part => part && part !== "." && part !== ".."));
  let target = realpathSync(fx.dir);
  for (const part of path.split("/")) {
    target = join(target, part);
    assert.equal(lstatSync(target).isSymbolicLink(), false);
    assert.equal(realpathSync(target), target);
    if (process.platform === "win32")
      assert.equal(fx.routeOwner.windows.assessWindowsPrivatePath(target).status, "secure");
  }
  const before = lstatSync(target);
  assert.ok(before.isFile() && before.nlink === 1 && before.size <= 1048576);
  const bytes = readFileSync(target), after = lstatSync(target);
  const fact = info => ({ dev: String(info.dev), ino: String(info.ino), mode: info.mode,
    nlink: info.nlink, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
  assert.deepEqual(fact(after), fact(before));
  assert.equal(bytes.length, before.size);
  return { path, bytes, sha256: sha256(bytes), identity: fact(before) };
}
async function registerActualRouteAcceptedContract(out) {
  const { fx } = out, state = readState(fx.dir), ref = state.planApproval?.acceptedContract;
  assert.equal(state.planApproval?.schema, "pipeline.plan-approval.v9");
  assert.equal(state.planApproved, true);
  assert.deepEqual(Object.keys(ref).sort(), ["path", "schema", "sha256"]);
  assert.equal(ref.schema, "pipeline.accepted-delivery-contract-reference.v1");
  assert.match(ref.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(ref.path, `specs/e2e/evidence/accepted-delivery-contract-${ref.sha256}.json`);
  const beforeState = readFileSync(stateModule.statePath(fx.dir)), beforeMember = readRouteMember(fx);
  const beforeCandidate = git(fx.dir, "rev-parse", "HEAD", "HEAD^{tree}");
  const physical = physicalRouteArtifact(fx, ref.path), envelope = JSON.parse(physical.bytes);
  assert.equal(physical.sha256, ref.sha256);
  const { canonical } = await loadLib("po-approval-proof.mjs");
  assert.equal(physical.bytes.toString("utf8"), canonical(envelope));
  assert.deepEqual(Object.keys(envelope).sort(), ["approval", "featureId", "manifestPath", "policyBinding",
    "repositoryFingerprint", "request", "schema", "submission"]);
  assert.equal(envelope.schema, "pipeline.accepted-delivery-contract-evidence.v1");
  assert.equal(envelope.featureId, FEATURE_ID);
  assert.equal(envelope.manifestPath, "specs/e2e/lifecycle.json");
  assert.deepEqual(envelope.request, out.request);
  const projection = { ...state.planApproval, schema: "pipeline.plan-approval.v8" };
  delete projection.acceptedContract;
  assert.deepEqual(envelope.approval, projection);
  const sourcePaths = [PLAN_PATH, SPEC_PATH, "specs/e2e/acceptance.md", "specs/e2e/result.md"];
  const sources = sourcePaths.map(path => physicalRouteArtifact(fx, path));
  const request = physicalRouteArtifact(fx, relative(fx.dir, out.requestAbs).split(sep).join("/"));
  const artifact = (kind, source, authority, mutability, retention) =>
    ({ class: kind, path: source.path, sha256: source.sha256, authority, mutability, retention });
  const packageValue = { schema: "pipeline.feature-package.v1", feature: { id: FEATURE_ID, rigor: 2 }, state: "approved",
    artifacts: [artifact("prd", sources[0], true, "mutable", "active"), artifact("spec", sources[1], true, "mutable", "active"),
      artifact("acceptance", sources[2], true, "mutable", "active"), artifact("result", sources[3], true, "mutable", "active"),
      artifact("candidate-evidence", physical, false, "immutable", "retain")],
    candidate: structuredClone(out.request.approvalIntent.value.candidate), supersedes: null };
  const target = join(fx.dir, envelope.manifestPath), bytes = Buffer.from(`${JSON.stringify(packageValue, null, 2)}\n`);
  assert.equal(existsSync(target), false, "exclusive synthetic canonical registration input");
  const fd = openSync(target, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  assert.deepEqual(physicalRouteArtifact(fx, envelope.manifestPath).bytes, bytes);
  const topology = await loadLib("feature-package-topology.mjs");
  const validated = topology.validateFeaturePackage(fx.dir, envelope.manifestPath);
  assert.equal(validated.ok, true, JSON.stringify(validated.findings));
  const resolved = topology.resolveCanonicalArtifactIdentity(fx.dir, ref.path);
  assert.equal(resolved.status, "resolved");
  assert.deepEqual({ featureId: resolved.identity.featureId, manifest: resolved.identity.manifest,
    path: resolved.identity.path, sha256: resolved.identity.sha256, class: resolved.identity.class,
    authority: resolved.identity.authority, mutability: resolved.identity.mutability, retention: resolved.identity.retention },
    { featureId: FEATURE_ID, manifest: envelope.manifestPath, path: ref.path, sha256: ref.sha256,
      class: "candidate-evidence", authority: false, mutability: "immutable", retention: "retain" });
  assert.deepEqual(readFileSync(stateModule.statePath(fx.dir)), beforeState);
  assert.deepEqual(readRouteMember(fx), beforeMember);
  assert.equal(git(fx.dir, "rev-parse", "HEAD", "HEAD^{tree}"), beforeCandidate);
  for (const source of [physical, request, ...sources])
    assert.deepEqual(physicalRouteArtifact(fx, source.path), source);
  out.acceptedEnvelope = envelope;
  out.acceptedPhysical = physical;
  out.accepted = stateModule.readAcceptedDeliveryContract({ dir: fx.dir, envelopePath: ref.path });
  assert.equal(out.accepted.ok, true, JSON.stringify(out.accepted));
}
function collectStrings(value, out = new Set(), depth = 0) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === "string") { out.add(value); return out; }
  if (typeof value === "object" || typeof value === "function") {
    for (const key of Object.keys(value)) { out.add(key); collectStrings(value[key], out, depth + 1); }
  }
  return out;
}

function continuityRequest(authority) {
  return {
    schema: "pipeline.continuity.v0", featureId: FEATURE_ID, revision: 0,
    runtime: { humanFacingLanguage: authority.humanFacing, activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: authority.planPath, sha256: authority.planSha256 }, spec: { path: authority.specPath, sha256: authority.specSha256 }, result: null },
    queueHead: { packageId: "initial-planning", actionId: "review-plan", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null, decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

/** A git repo in the state "feature plan submitted, awaiting approval", with a finished source set and one passing review receipt. */
const MOVED_DIR = "specs/e2e-moved";
async function buildSubmittedFeature(prefix, { fallback, move = false, changeByte = false, proofUncommitted = false, openFindingIds = [], observed = true, hostRoute = false, reviewerRunner = "claude", chainRounds = 1 } = {}) {
  stateModule ??= await import(pathToFileURL(CLI).href);
  const governance = await loadLib("governance-scope.mjs");
  const poGate = await loadLib("po-gate-authority.mjs");
  const windows = await loadLib("windows-private-state.mjs");
  const receiptLib = await loadLib("design-review-receipt.mjs");
  const dir = tmp(prefix);
  const home = tmp(`${prefix}-home`);
  if (process.platform === "win32") {
    assert.equal(windows.hardenWindowsPrivateDirectory(dir).status, "secure");
    assert.equal(windows.hardenWindowsPrivateDirectory(home).status, "secure");
  }
  const globalConfig = join(home, "empty-gitconfig"), template = join(home, "empty-template");
  writeFileSync(globalConfig, "", { flag: "wx", mode: 0o600 });
  mkdirSync(template, { mode: 0o700 });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home,
    GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_TEMPLATE_DIR: template };
  FIXTURE_GIT_ENVIRONMENTS.set(dir, env);
  const fx = { dir, home, env, ledger: [] };

  git(dir, "init", "-q");
  git(dir, "config", "user.email", "goldfish@example.invalid");
  git(dir, "config", "user.name", "Goldfish");
  git(dir, "config", "core.autocrlf", "false");
  writeFileIn(dir, "README.md", "fixture\n");
  writeFileIn(dir, "project/pipeline.json", `${JSON.stringify({ schema: "pipeline.project.v1", verify: "echo ok" })}\n`);
  git(dir, "add", "--", "README.md");
  git(dir, "commit", "-q", "-m", "init");
  writeFileIn(dir, ".gitignore", "scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n");
  writeFileIn(dir, ".claude/pipeline.json", readFileSync(join(dir, "project/pipeline.json"), "utf8"));
  git(dir, "add", "--", ".gitignore", "project/pipeline.json", ".claude/pipeline.json");
  git(dir, "commit", "-q", "-m", "fixture: committed consumer configuration");
  const controller = governance.createGovernanceScopeController();
  const enrollment = controller.planDecision({ rootDir: dir, decision: "enroll", by: "Design route fixture" });
  assert.equal(controller.applyDecision(enrollment, { activate: true, planSha256: enrollment.planSha256 }).state, "active");

  // PO-gate authority, mirrored from seedSubprocessPoGateAuthority (harness/scripts/pipeline-state.test.mjs:874-914).
  writeFileIn(dir, "pipeline.user.yaml", "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n");
  git(dir, "add", "--", "pipeline.user.yaml");
  git(dir, "commit", "-q", "-m", "fixture: add pipeline policy source", "--", "pipeline.user.yaml");
  writeFileIn(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  // Initialize the actual neutral authority tier before State/owner capture.
  writeFileIn(dir, "project/pipeline.yaml", readFileSync(join(dir, ".claude/pipeline.yaml"), "utf8"));

  // AC-264 / D85: submit-plan also checks the delivery hand-off of a governed root, so the Spec carries one admitted criterion row.
  const specBytes = Buffer.from("# Test Spec\n\n## Acceptance criteria\n\n| # | Criterion |\n| --- | --- |\n| 1 | The e2e fixture feature works. |\n", "utf8");
  const specSha256 = sha256(specBytes);
  writeFileIn(dir, SPEC_PATH, specBytes.toString("utf8"));
  const prdText = `${poGate.PO_GATE_PRD_LANGUAGE_MARKER("de")}\n${poGate.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${specSha256} -->\n# Test PRD\nImplementation surface: \`src/index.mjs\`.\n`;
  writeFileIn(dir, PLAN_PATH, prdText);
  writeFileIn(dir, COMPANION_PATHS[0], "# Design\n");
  writeFileIn(dir, COMPANION_PATHS[1], "| ID | Evidence |\n| --- | --- |\n");
  // D247 `hostRoute`: the report is not written here; the hook's observation becomes the report through export-report below.
  if (!hostRoute) writeFileIn(dir, REPORT_PATH, "# Design review 1\nVerdict: pass.\n");
  else mkdirSync(join(dir, ...dirname(REPORT_PATH).split("/")), { recursive: true });
  writeFileIn(dir, "specs/e2e/acceptance.md", "# Controlled route acceptance\n");
  writeFileIn(dir, "specs/e2e/result.md", "# Controlled route result\n");

  const gitCommonDir = join(dir, ".git");
  const receipt = poGate.createPoGateProfileReceipt({
    repositoryFingerprint: poGate.derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: dir }),
    primaryRoot: dir,
    sourceBytes: readFileSync(join(dir, "pipeline.user.yaml")),
    runtimeBytes: readFileSync(join(dir, ".claude", "pipeline.yaml")),
    updatedAt: FIXED_AT,
  });
  const receiptFile = poGate.poGateProfileReceiptPath(gitCommonDir);
  mkdirSync(join(gitCommonDir, "agent-pipeline", "po-gate"), { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    let cursor = gitCommonDir;
    for (const part of dirname(poGate.PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH).split(/[\\/]/u).filter(Boolean)) {
      cursor = join(cursor, part);
      assert.equal(windows.hardenWindowsPrivateDirectory(cursor).status, "secure");
    }
  }
  writeFileSync(receiptFile, poGate.serializePoGateProfileReceipt(receipt));
  chmodSync(receiptFile, 0o600);

  // Review receipt over the finished sources (contract section 5 fixture F), tracked and clean.
  const sourceFor = (path) => ({ path, sha256: sha256(readFileSync(join(dir, ...path.split("/")))) });
  if (hostRoute) {
    // D247, the whole Claude route: the plugin hook records a background readiness-reviewer stop (its models from the child's own
    // transcript), export-report writes the returned text as the report, and create (the CLI, on the Claude runner signal) stamps the
    // observation into the receipt itself. Nothing here supplies a model.
    const sessionBase = mkdtempSync(join(dirname(dir), "design-route-transcript-"));
    DIRS.push(sessionBase); // C30-5: the transcript fixture left a home folder behind on every run
    mkdirSync(join(sessionBase, "session", "subagents"), { recursive: true });
    writeFileSync(join(sessionBase, "session.jsonl"), "");
    writeFileSync(join(sessionBase, "session", "subagents", "agent-a1.jsonl"),
      `${JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-4", content: [{ type: "text", text: "reading" }] } })}\n`);
    const observationLib = await loadLib("design-review-observation.mjs");
    const recorded = observationLib.recordDesignReviewObservation({ commonDir: gitCommonDir, runner: "claude", input: {
      hook_event_name: "SubagentStop", agent_type: "pipeline-core:readiness-reviewer", agent_id: "a1",
      transcript_path: join(sessionBase, "session.jsonl"), last_assistant_message: "# Design review 1\nVerdict: pass.\n" } });
    if (recorded.status !== "recorded") throw new Error(`fixture observation not recorded: ${JSON.stringify(recorded)}`);
    const receiptCli = await import(pathToFileURL(join(HERE, "design-review-receipt.mjs")).href);
    const out = [];
    const exported = receiptCli.main(["export-report", "--repo", dir, "--out", REPORT_PATH], {}, { writeFn: (text) => out.push(text), errorFn: () => {} });
    if (exported !== 0) throw new Error(`fixture export-report refused: ${out.join("")}`);
    const createdCli = receiptCli.main(["create", "--repo", dir, "--feature", FEATURE_ID, "--report", REPORT_PATH, "--prd", PLAN_PATH, "--spec", SPEC_PATH,
      ...COMPANION_PATHS.flatMap((path) => ["--companion", path]), "--out", RECEIPT_PATH], { CLAUDECODE: "1" },
      { writeFn: (text) => out.push(text), errorFn: () => {}, now: () => new Date("2026-10-09T09:00:00.000Z") });
    if (createdCli !== 0) throw new Error(`fixture create refused: ${out.join("")}`);
    fx.cliOutput = out.join("");
  }
  // C30-6: `chainRounds` > 1 builds the earlier rounds of a review chain (each over earlier source bytes, each with its own report), so the
  // last receipt is round N and a delta of the round before. `receiptPaths` is the whole chain, initial first, as present-plan takes it.
  fx.receiptPaths = [];
  let previousRound = null;
  const reportOf = (round) => (round === 1 ? REPORT_PATH : `specs/e2e/review/design-review-${round}.md`);
  const receiptOf = (round) => (round === 1 ? RECEIPT_PATH : `specs/e2e/review/design-review-receipt-${round}.json`);
  for (let round = 1; round < chainRounds; round += 1) {
    writeFileIn(dir, reportOf(round), `# Design review ${round}\nVerdict: not ready.\n`);
    const earlier = receiptLib.createDesignReviewReceipt({
      featureId: FEATURE_ID, previous: previousRound,
      sources: { prd: sourceFor(PLAN_PATH), spec: sourceFor(SPEC_PATH), companions: COMPANION_PATHS.map((path, index) => (index === 0 ? { path, sha256: sha256(`earlier-round-${round}`) } : sourceFor(path))) },
      reviewer: { runner: "claude", model: "claude-opus-4" }, report: sourceFor(reportOf(round)), openFindingIds: ["DESIGN-REVIEW-1"],
      reviewedAt: "2026-10-09T09:00:00.000Z",
      reviewerObservation: { assurance: "host-observed-child-transcript", modelsUsed: ["claude-opus-4"], resultSha256: sourceFor(reportOf(round)).sha256 },
    });
    if (!earlier.ok) throw new Error(`fixture earlier review receipt refused: ${earlier.code}`);
    writeFileIn(dir, receiptOf(round), Buffer.from(earlier.bytes).toString("utf8"));
    fx.receiptPaths.push(receiptOf(round));
    previousRound = { path: receiptOf(round), bytes: earlier.bytes };
  }
  if (chainRounds > 1) writeFileIn(dir, reportOf(chainRounds), "# Design review last\nVerdict: not ready.\n");
  const finalReportPath = reportOf(chainRounds);
  const finalReceiptPath = receiptOf(chainRounds);
  const created = hostRoute ? { ok: true, bytes: readFileSync(join(dir, ...RECEIPT_PATH.split("/"))) } : receiptLib.createDesignReviewReceipt({
    featureId: FEATURE_ID,
    previous: previousRound,
    sources: { prd: sourceFor(PLAN_PATH), spec: sourceFor(SPEC_PATH), companions: COMPANION_PATHS.map(sourceFor) },
    reviewer: { runner: reviewerRunner, model: reviewerRunner === "claude" ? "claude-opus-4" : "unknown" },
    report: sourceFor(finalReportPath),
    openFindingIds,
    reviewedAt: "2026-10-09T09:00:00.000Z",
    ...(fallback === undefined ? {} : { fallback }),
    // D247: a native Claude review round carries the host's observation of its reviewer (export-report + create); `observed: false` is a round without one.
    // A runner without an observation route (`reviewerRunner: "codex"`) carries the visible `unobserved` label, as create writes it.
    ...(fallback === undefined && reviewerRunner !== "claude" ? { reviewerObservation: { assurance: "unobserved", modelsUsed: [], resultSha256: null } } : {}),
    ...(fallback === undefined && reviewerRunner === "claude" && observed ? { reviewerObservation: { assurance: "host-observed-child-transcript", modelsUsed: ["claude-opus-4"], resultSha256: sourceFor(finalReportPath).sha256 } } : {}),
  });
  if (!created.ok) throw new Error(`fixture review receipt refused: ${created.code}`);
  if (!hostRoute) writeFileIn(dir, finalReceiptPath, Buffer.from(created.bytes).toString("utf8"));
  fx.receiptPath = finalReceiptPath;
  fx.receiptPaths.push(finalReceiptPath);

  // Trust anchor for approve-plan (A10): project/critical-human-proof.json, schema v3, committed.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  fx.signer = { privateKey, publicKeyPem, keyReference: "design-route-fixture-key" };
  writeFileIn(dir, "project/critical-human-proof.json", `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference: fx.signer.keyReference, publicKeySha256: sha256(publicKeyPem) }],
  }, null, 2)}\n`);

  // C28e (Codex test run): `proofUncommitted` leaves the trust policy in the working tree only, the state that cost a second signature.
  git(dir, "add", "--", PLAN_PATH, SPEC_PATH, ...COMPANION_PATHS, ...new Set([REPORT_PATH, RECEIPT_PATH, ...fx.receiptPaths, ...Array.from({ length: chainRounds }, (_, index) => reportOf(index + 1))]), ...(proofUncommitted ? [] : ["project/critical-human-proof.json"]), "specs/e2e/acceptance.md", "specs/e2e/result.md");
  git(dir, "commit", "-q", "-m", "fixture: finished design sources and review receipt");
  // Folder rebind (Phoenix Wanted 4, slice 3): the reviewed sources move to another registrar-valid feature folder; the review
  // receipt and report stay where they are (default pending PO). `changeByte` appends one byte to the PRD after the move.
  let planPath = PLAN_PATH, specPath = SPEC_PATH;
  if (move) {
    planPath = `${MOVED_DIR}/prd_e2e.md`; specPath = `${MOVED_DIR}/spec.md`;
    mkdirSync(join(dir, ...MOVED_DIR.split("/")), { recursive: true });
    git(dir, "mv", PLAN_PATH, planPath);
    git(dir, "mv", SPEC_PATH, specPath);
    for (const companion of COMPANION_PATHS) git(dir, "mv", companion, `${MOVED_DIR}/${basename(companion)}`);
    // The review report lives under the old feature directory, so a byte-identical rebind observes it under the new one.
    mkdirSync(join(dir, ...MOVED_DIR.split("/"), "review"), { recursive: true });
    git(dir, "mv", REPORT_PATH, `${MOVED_DIR}/review/${basename(REPORT_PATH)}`);
    if (changeByte) writeFileSync(join(dir, ...planPath.split("/")), `${readFileSync(join(dir, ...planPath.split("/")), "utf8")}x`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "fixture: the feature folder moved");
  }
  // The real submit-plan refuses a governed root whose architecture is not ready (D165-S4): materialize the sanctioned design package.
  materializeArchitectureDesignFixture({ rootDir: dir, planPath, sourcePath: "src/index.mjs", decisionRef: "TEST-DAR-ROUTE", by: "Design route fixture PO" });
  git(dir, "add", "-A");
  if (proofUncommitted) git(dir, "reset", "-q", "--", "project/critical-human-proof.json");
  git(dir, "commit", "-q", "-m", "fixture: architecture design package");

  const featureSet = cli(fx, ["set-feature", "--id", FEATURE_ID, "--plan-path", planPath]);
  if (featureSet.status !== 0) throw new Error(`fixture set-feature failed: ${featureSet.stderr}`);
  const requestRel = "continuity-init-request.json";
  writeFileIn(dir, requestRel, `${JSON.stringify(continuityRequest({
    humanFacing: "de", planPath, planSha256: sha256(readFileSync(join(dir, planPath))),
    specPath, specSha256: sha256(readFileSync(join(dir, specPath))),
  }), null, 2)}\n`);
  const initialized = cli(fx, ["continuity-init", "--expected-revision", "absent", "--request-file", requestRel, "--lock-token", randomBytes(24).toString("hex")]);
  if (initialized.status !== 0) throw new Error(`fixture continuity-init failed: ${initialized.stderr}`);
  const submitted = cli(fx, ["submit-plan", "--by", "coordinator", "--profile", "feature"]);
  if (submitted.status !== 0) throw new Error(`fixture submit-plan --profile feature failed: ${submitted.stderr}`);
  return fx;
}

/**
 * Typed host limitation (intended, not a product defect): on a Windows host whose repository ancestors carry
 * a human-controlled owner/ACL (e.g. the stock non-system-drive DACL on the drive root / parent directory),
 * the native owned-authority backend fails closed with WIN-AUTH-ANCESTOR-*. The product refusal is correct;
 * the route cannot run on that host. The Pipeline protects against the agent, never against the human, so a
 * human-controlled ancestor is outside the threat model (PO decision 2026-10-17, specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md,
 * "Decision tiles answered (PO, 2026-10-17 ...)"). Only those exact reasons on win32 qualify; every other
 * error still fails the case. Owner Coordinator; the AC-155 assertions run on any host whose ancestors pass.
 */
// Narrowed (QG-04/QG-06, Critic C6h H-F1): only the one reason the PO decision justified is admitted;
// WIN-AUTH-ANCESTOR-ACL, -MUTATION and any other WIN-AUTH-* code propagate and fail the case.
const HOST_LIMITATION_REASONS = new Set(["WIN-AUTH-ANCESTOR-OWNER"]);
function hostLimitationOf(error) {
  if (process.platform !== "win32" || error?.code !== "SDC-AUTHORITY-UNAVAILABLE"
    || !HOST_LIMITATION_REASONS.has(error?.reason)) return null;
  return { type: "host-limitation", reason: error.reason, owner: "Coordinator", due: "2026-10-31", runsOn: "WSL/Linux", host: "native Windows with a human-controlled drive-root ancestor owner (win32)" };
}
function skipForHostLimitation(t, run) {
  if (!run.hostLimitation) return false;
  const h = run.hostLimitation;
  t.skip(`HOST-LIMITATION ${h.reason}: owner ${h.owner}, due ${h.due}, skipped on ${h.host}; runs instead on ${h.runsOn}`);
  return true;
}

/** The whole route, run once and shared by route cases 1-4. Never throws: each step records its outcome. */
let routePromise;
function routeRun() { routePromise ??= runRoute(); return routePromise; }
// QG-04 restatement (candidate 20b, FV red): G20-16 renders the PO's signing step bounded for the PO's own terminal. The POSIX
// block is chunked (`CMD='...'`, `CMD=${CMD}'...'`, `eval "$CMD"`), so `sign-intent` and the `--request` path no longer sit on
// one line; inside WSL a second ALTERNATIVE block (option B, Windows PowerShell through wsl.exe, the same argv) follows under
// "Copy exactly ONE of the two blocks". "Exactly one signature command" is restated as exactly one reconstructed POSIX command
// naming sign-intent, plus at most that one PowerShell alternative, never a second POSIX command.
function posixSigningCommands(stdout) {
  const commands = [];
  let chunks = null;
  for (const line of stdout.split(/\r?\n/u)) {
    const chunk = /^\s*CMD=(\$\{CMD\})?'([^']*)'\s*$/u.exec(line);
    if (chunk !== null) {
      chunks = chunk[1] === undefined ? [chunk[2]] : [...(chunks ?? []), chunk[2]];
      continue;
    }
    if (/^\s*eval "\$CMD"\s*$/u.test(line) && chunks !== null) commands.push(chunks.join(""));
    chunks = null;
  }
  const posix = commands.filter((command) => /\ssign-intent\s/u.test(command));
  // On native Windows (renderPoTerminalCommand, win32) the ONE signing step is a PowerShell block only: `$CMD = '...'`,
  // `$CMD += '...'`, `Invoke-Expression $CMD`, every argv word single-quoted with '' escapes. It is decoded into the same
  // space-separated word form, so the request path and the count are examined on every host, never skipped.
  return posix.length > 0 || process.platform !== "win32" ? posix : powershellSigningCommands(stdout);
}
function powershellSigningCommands(stdout) {
  const commands = [];
  let chunks = null;
  for (const line of stdout.split(/\r?\n/u)) {
    const chunk = /^\s*\$CMD (\+?)= '((?:[^']|'')*)'\s*$/u.exec(line);
    if (chunk !== null) {
      chunks = chunk[1] === "" ? [chunk[2]] : [...(chunks ?? []), chunk[2]];
      continue;
    }
    if (/^\s*Invoke-Expression \$CMD\s*$/u.test(line) && chunks !== null) {
      const script = chunks.join("").replace(/''/gu, "'");
      const words = [...script.matchAll(/'((?:[^']|'')*)'/gu)].map((match) => match[1].replace(/''/gu, "'"));
      commands.push(words.map((word) => (/\s/u.test(word) ? `"${word}"` : word)).join(" "));
    }
    chunks = null;
  }
  return commands.filter((command) => / sign-intent /u.test(` ${command} `));
}
function signingAlternatives(stdout) {
  const powershell = stdout.split(/\r?\n/u).filter((line) => /^\s*Step: PO signs the design approval, option B: Windows PowerShell\s*$/u.test(line)).length;
  return { powershell, copyExactlyOne: /Copy exactly ONE of the two blocks below/u.test(stdout) };
}
function requestPathOf(command) {
  const match = /--request\s+(?:"([^"]+)"|'([^']+)'|(\S+))/u.exec(command ?? "");
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}
async function runRoute() {
  const out = { steps: [] };
  out.fx = await buildSubmittedFeature("route");
  const { fx } = out;
  try {
    await bindRouteOwner(fx);
  } catch (error) {
    const limitation = hostLimitationOf(error);
    if (limitation === null) throw error;
    out.hostLimitation = limitation;
    return out;
  }
  out.dispatchBefore = readState(fx.dir).continuity?.queueHead?.dispatch ?? null;
  out.present = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  if (out.present.status !== 0) return out;
  const signLines = posixSigningCommands(out.present.stdout);
  out.signLines = signLines;
  out.signAlternatives = signingAlternatives(out.present.stdout);
  out.requestAbs = requestPathOf(signLines[0]);
  if (out.requestAbs === null || !existsSync(out.requestAbs)) return out;
  out.request = JSON.parse(readFileSync(out.requestAbs, "utf8"));
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: out.request.approvalIntent?.sha256,
    keyReference: fx.signer.keyReference,
    publicKey: fx.signer.publicKeyPem,
    signatureBase64: sign(null, Buffer.from(String(out.request.approvalIntent?.sha256)), fx.signer.privateKey).toString("base64"),
  };
  out.proofAbs = join(dirname(out.requestAbs), basename(out.requestAbs).replace("request", "proof"));
  writeFileSync(out.proofAbs, `${JSON.stringify(proof, null, 2)}\n`);
  const requestRel = relative(realpathSync(fx.dir), realpathSync(out.requestAbs)).split(sep).join("/");
  out.approve = await ownedCli(fx, ["approve-plan", "--by", "po-test", "--design-approval-request", requestRel]);
  if (out.approve.status === 0) await registerActualRouteAcceptedContract(out);
  out.stateAfter = readState(fx.dir);
  return out;
}

test("route 1: present-plan --review-receipt accepts finished sources and hands over ONE ready sign command", async (t) => {
  const run = await routeRun();
  if (skipForHostLimitation(t, run)) return;
  t.diagnostic(`present-plan exit ${run.present.status}; stderr: ${run.present.stderr.trim()}`);
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0; stderr: ${run.present.stderr}`);
  // QG-04 restatement (candidate 20b): one reconstructed POSIX signing command; a PowerShell block is only its WSL alternative.
  assert.equal(run.signLines.length, 1, `exactly one POSIX command names sign-intent; stdout: ${run.present.stdout}`);
  assert.ok(run.signAlternatives.powershell <= 1, "at most one PowerShell alternative of the same signing step");
  assert.equal(run.signAlternatives.powershell === 1, run.signAlternatives.copyExactlyOne, "an alternative block is introduced as copy-exactly-one");
  assert.match(run.signLines[0], /--repo-root\s+\S+/u);
  assert.ok(run.requestAbs !== null && isAbsolute(run.requestAbs), "the sign command carries an absolute --request path");
  assert.ok(existsSync(run.requestAbs), "the printed request file exists");
  assert.equal(run.request.schema, "pipeline.design-approval-request.v1");
  assert.match(run.request.bindingSha256, /^[a-f0-9]{64}$/u);
  assert.match(run.request.approvalIntent.sha256, /^[a-f0-9]{64}$/u);
  assert.equal("packageSha256" in run.request, false, "no design-workflow package field in the new request");
  const presentation = readState(run.fx.dir).planPresentation;
  assert.ok(presentation, "a presentation is recorded");
  for (const key of ["designWorkflowPackagePath", "designWorkflowPackageSha256"]) {
    assert.equal(key in presentation, false, `presentation carries no ${key}`);
  }
  // K128 (PO decision 2026-10-23, batch 12, row 41): a native receipt presents no fallback line; a receipt produced on the typed
  // fallback-self-dispatch route is named in the presented plan and in the PO's signed binding. Added assertions only.
  assert.equal(/Review route:/u.test(run.present.stdout), false, "a native receipt presents no fallback line");
  assert.equal("fallback" in run.request.binding.reviewReceipts[0], false, "a native receipt's binding entry carries no fallback");
  const fallback = { route: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER", requestedRoute: "duty.critic_normal", observedIdentity: "unknown" };
  const fb = await buildSubmittedFeature("route-fallback", { fallback });
  await bindRouteOwner(fb);
  const presented = await ownedCli(fb, ["present-plan", "--by", "coordinator", "--review-receipt", fb.receiptPath]);
  assert.equal(presented.status, 0, `present-plan over a fallback receipt must exit 0; stderr: ${presented.stderr}`);
  assert.match(presented.stdout, /Review route: \S+ ran on the fallback-self-dispatch route \(RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER; requested duty\.critic_normal, observed unknown\) -- a single-review fallback, not an independent native review\./u);
  // QG-04 restatement (candidate 20b): the chunked signing block is reconstructed first (posixSigningCommands).
  const fallbackCommands = posixSigningCommands(presented.stdout);
  assert.equal(fallbackCommands.length, 1, "the fallback route hands over exactly one POSIX signing command");
  const requestPath = requestPathOf(fallbackCommands[0]);
  assert.ok(requestPath !== null && existsSync(requestPath), "the fallback route hands over the same ready sign command");
  assert.deepEqual(JSON.parse(readFileSync(requestPath, "utf8")).binding.reviewReceipts[0].fallback, fallback, "the PO's signed binding names the fallback");
});

// C28e (Codex test run): approve-plan read the trust policy from the signed commit, where it was missing; the refusal came only after
// the signature (CAC-SOURCE-UNAVAILABLE, no path) and cost a second one. present-plan now names the file before a request exists.
test("C28e (Codex test run): present-plan names a trust policy that is not in the commit the request would bind, and writes no request", async () => {
  const fx = await buildSubmittedFeature("route-proof-uncommitted", { proofUncommitted: true });
  await bindRouteOwner(fx);
  const refused = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  assert.equal(refused.status, 2, `present-plan must refuse; stdout: ${refused.stdout}; stderr: ${refused.stderr}`);
  assert.match(refused.stderr, /DAB-CANDIDATE-FILE-MISSING/u);
  assert.match(refused.stderr, /project\/critical-human-proof\.json/u);
  assert.match(refused.stderr, /git add -- project\/critical-human-proof\.json/u);
  assert.equal(posixSigningCommands(refused.stdout).length, 0, "no signing command is handed over");
  const requests = existsSync(join(fx.dir, "scratch")) ? readdirSync(join(fx.dir, "scratch")).filter((name) => name.startsWith("design-approval-request-")) : [];
  assert.deepEqual(requests, [], "no approval request is written");
  // The repaired state (the same fixture with the policy committed) is route 1/2: present-plan hands over one signing step there. A
  // commit inside this fixture would move the HEAD the route owner is bound to (SDC-ROOT repository-binding-changed), so it is not
  // repeated here.
});

// L3 (PO decision 2026-11-13): no signature over an open readiness review; the route is the next delta round until it passes.
// The binding itself still records an open set (an approval already signed over one keeps verifying), so this is the presentation gate.
test("L3 (Claude run 3): present-plan refuses a review chain whose last round leaves findings open, names them and the delta route, and writes no request", async () => {
  const fx = await buildSubmittedFeature("route-open-findings", { openFindingIds: ["DESIGN-REVIEW-1", "DESIGN-REVIEW-2"] });
  await bindRouteOwner(fx);
  const refused = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  assert.equal(refused.status, 2, `present-plan must refuse; stdout: ${refused.stdout}; stderr: ${refused.stderr}`);
  assert.match(refused.stderr, /PLAN-DESIGN-REVIEW-OPEN/u);
  assert.match(refused.stderr, /DESIGN-REVIEW-1, DESIGN-REVIEW-2/u);
  assert.match(refused.stderr, /design-review-receipt\.mjs create --previous/u);
  assert.equal(posixSigningCommands(refused.stdout).length, 0, "no signing command is handed over");
  const requests = existsSync(join(fx.dir, "scratch")) ? readdirSync(join(fx.dir, "scratch")).filter((name) => name.startsWith("design-approval-request-")) : [];
  assert.deepEqual(requests, [], "no approval request is written");
  assert.equal(readState(fx.dir).planPresentation ?? null, null, "no presentation is recorded");
  // C30-6 (PO 2026-11-16, restating this case): one full round and two delta rounds. Round 2 with findings open is still refused; after
  // round 3 nothing more can be reviewed, so present-plan hands the PO the signing step and the signing text names the open findings.
  const second = await buildSubmittedFeature("route-open-round-2", { openFindingIds: ["DESIGN-REVIEW-1"], chainRounds: 2 });
  await bindRouteOwner(second);
  const stillRefused = await ownedCli(second, ["present-plan", "--by", "coordinator", ...second.receiptPaths.flatMap((path) => ["--review-receipt", path])]);
  assert.equal(stillRefused.status, 2, `round 2 with open findings is refused; stdout: ${stillRefused.stdout}; stderr: ${stillRefused.stderr}`);
  assert.match(stillRefused.stderr, /PLAN-DESIGN-REVIEW-OPEN/u);
  const third = await buildSubmittedFeature("route-open-round-3", { openFindingIds: ["DESIGN-REVIEW-1"], chainRounds: 3 });
  await bindRouteOwner(third);
  const presented = await ownedCli(third, ["present-plan", "--by", "coordinator", ...third.receiptPaths.flatMap((path) => ["--review-receipt", path])]);
  assert.equal(presented.status, 0, `after round 3 an open review is presented, not refused; stdout: ${presented.stdout}; stderr: ${presented.stderr}`);
  assert.equal(posixSigningCommands(presented.stdout).length, 1, "exactly one signing command is handed over");
  const request = JSON.parse(readFileSync(requestPathOf(posixSigningCommands(presented.stdout)[0]), "utf8"));
  assert.equal(request.binding.verdict, "open-findings", "the signed binding carries the open verdict");
  assert.deepEqual(request.binding.openFindingIds, ["DESIGN-REVIEW-1"], "and the open ids");
  assert.equal(request.binding.reviewReceipts.length, 3, "three rounds, initial first");
});

// D247 (PO tiles 2026-11-13): on Claude the reviewer model is host-observed; a round without the observation (made by hand, in a
// session without the hooks, or before this amendment) is not presented. A fallback receipt is passed (route 1 covers it).
test("D247: present-plan refuses a Claude review round without a host observation of its reviewer, names the round and the route, and writes no request", async () => {
  const fx = await buildSubmittedFeature("route-unobserved", { observed: false });
  await bindRouteOwner(fx);
  const refused = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  assert.equal(refused.status, 2, `present-plan must refuse; stdout: ${refused.stdout}; stderr: ${refused.stderr}`);
  assert.match(refused.stderr, /PLAN-DESIGN-REVIEW-UNOBSERVED/u);
  assert.match(refused.stderr, /design-review-receipt-1\.json \(round 1, made before reviewer observation\)/u);
  assert.match(refused.stderr, /export-report/u);
  assert.match(refused.stderr, /restart the session/u);
  assert.equal(posixSigningCommands(refused.stdout).length, 0, "no signing command is handed over");
  const requests = existsSync(join(fx.dir, "scratch")) ? readdirSync(join(fx.dir, "scratch")).filter((name) => name.startsWith("design-approval-request-")) : [];
  assert.deepEqual(requests, [], "no approval request is written");
  assert.equal(readState(fx.dir).planPresentation ?? null, null, "no presentation is recorded");
});

test("D247: the named route completes: hook observation, export-report and create stamp the observed model, and present-plan hands over the signing step", async () => {
  const fx = await buildSubmittedFeature("route-host-observed", { hostRoute: true });
  const receipt = JSON.parse(readFileSync(join(fx.dir, ...fx.receiptPath.split("/")), "utf8"));
  assert.deepEqual(receipt.reviewerObservation, { assurance: "host-observed-child-transcript", modelsUsed: ["claude-opus-4"], resultSha256: receipt.report.sha256 });
  assert.equal(receipt.reviewer.model, "claude-opus-4", "the receipt's reviewer model is the observed one");
  assert.match(fx.cliOutput, /"status":"exported"/u);
  assert.equal(/"notice"/u.test(fx.cliOutput), false, "an observed Claude receipt carries no unobserved notice");
  await bindRouteOwner(fx);
  const presented = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  assert.equal(presented.status, 0, `present-plan over an observed receipt must exit 0; stderr: ${presented.stderr}`);
  assert.equal(posixSigningCommands(presented.stdout).length, 1, "exactly one signing command is handed over");
  assert.match(presented.stdout, /Reviewer model: \S+design-review-receipt-1\.json \(round 1, claude\): claude-opus-4, host-observed-child-transcript -- observed by the host, not attested by the provider\./u,
    "the PO sees how the reviewer model is known before signing");
  // The binding never carries the observation: approval bytes are those of a receipt without it.
  const requestPath = requestPathOf(posixSigningCommands(presented.stdout)[0]);
  assert.equal("reviewerObservation" in JSON.parse(readFileSync(requestPath, "utf8")).binding.reviewReceipts[0], false);
});

test("D247: a Codex review round is presented with its visible unobserved label, and the signed binding is unchanged", async () => {
  const fx = await buildSubmittedFeature("route-codex-unobserved", { reviewerRunner: "codex" });
  await bindRouteOwner(fx);
  const presented = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  assert.equal(presented.status, 0, `present-plan over a Codex receipt must exit 0; stderr: ${presented.stderr}`);
  assert.match(presented.stdout, /Reviewer model: \S+design-review-receipt-1\.json \(round 1, codex\): unobserved -- this runner has no host observation route; the receipt names unknown\./u);
  assert.equal(posixSigningCommands(presented.stdout).length, 1, "exactly one signing command is handed over");
  const requestPath = requestPathOf(posixSigningCommands(presented.stdout)[0]);
  assert.equal("reviewerObservation" in JSON.parse(readFileSync(requestPath, "utf8")).binding.reviewReceipts[0], false);
});

test("route 2: one design proof, approve-plan, and the closed v9 accepted-contract record", async (t) => {
  const run = await routeRun();
  if (skipForHostLimitation(t, run)) return;
  t.diagnostic(`present-plan exit ${run.present.status}; stderr: ${run.present.stderr.trim()}`);
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0 first; stderr: ${run.present.stderr}`);
  assert.ok(run.approve, "approve-plan was reached (request file named and found)");
  t.diagnostic(`approve-plan exit ${run.approve.status}; stderr: ${run.approve.stderr.trim()}`);
  assert.equal(run.approve.status, 0, `approve-plan --design-approval-request must exit 0; stderr: ${run.approve.stderr}`);
  const state = run.stateAfter;
  assert.equal(state.planApproved, true);
  const record = state.planApproval;
  assert.equal(record.schema, "pipeline.plan-approval.v9");
  for (const key of V9_REQUIRED) assert.ok(key in record, `v9 record has ${key}`);
  for (const key of Object.keys(record)) assert.ok(V9_KEYS.includes(key), `v9 record has no key outside the closed set: ${key}`);
  for (const key of V7_FIELDS) assert.equal(key in record, false, `v8 record drops ${key}`);
  assert.notEqual(record.designApprovalBinding, null);
  assert.equal(record.designApproval.schema, "pipeline.design-approval.v1");
  assert.equal(record.designApproval.mode, "signature");
  assert.ok(record.designApproval.proof && record.designApproval.proofSha256, "signature mode carries a proof and its digest");
  assert.equal(record.designApproval.intentSha256, run.request.approvalIntent.sha256);
  const { canonical } = await loadLib("po-approval-proof.mjs");
  assert.equal(record.designApproval.bindingSha256, sha256(canonical(record.designApprovalBinding)));
  assert.equal(record.designApproval.bindingSha256, run.request.bindingSha256);
  assert.equal(record.designApproval.proofSha256, sha256(canonical(record.designApproval.proof)));
  assert.deepEqual(Object.keys(record.acceptedContract).sort(), ["path", "schema", "sha256"]);
  assert.equal(record.acceptedContract.schema, "pipeline.accepted-delivery-contract-reference.v1");
  assert.equal(record.acceptedContract.sha256, run.acceptedPhysical.sha256);
  assert.equal(record.acceptedContract.path, run.acceptedPhysical.path);
  assert.equal(run.accepted.envelopeSha256, record.acceptedContract.sha256);
  assert.equal(run.accepted.authorityBasis, "signature");
  assert.equal(run.accepted.cryptographicallyAuthenticated, true);
  assert.equal(run.accepted.bindingSha256, run.request.bindingSha256);
  assert.equal(run.accepted.intentSha256, run.request.approvalIntent.sha256);
  assert.deepEqual(run.accepted.candidate, run.request.approvalIntent.value.candidate);
  assert.deepEqual(run.acceptedEnvelope.request, run.request);
  // AC-155: the real present-plan --review-receipt route needs ONE signature and runs no Advisor or readiness stage.
  // QG-04 restatement (candidate 20b): one signing step = one POSIX command plus at most its PowerShell alternative (route 1 above).
  assert.equal(run.signLines.length, 1, "exactly one signature command is handed over");
  assert.ok(run.signAlternatives.powershell <= 1, "at most one PowerShell alternative of that one signature command");
  const forbidden = /advisor|readiness|design-course/iu;
  assert.equal(forbidden.test(run.present.stdout), false, "present-plan stdout names no Advisor/readiness/course stage");
  assert.equal(forbidden.test(JSON.stringify(run.request)), false, "the signed request carries no Advisor/readiness/course content");
  assert.equal(forbidden.test(JSON.stringify(record.designApprovalBinding)), false, "the approved binding carries no Advisor/readiness/course content");
});

test("route 3: the boundary library admits the current approved v9 accepted-contract record", async (t) => {
  const run = await routeRun();
  if (skipForHostLimitation(t, run)) return;
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0 first; stderr: ${run.present.stderr}`);
  assert.equal(run.approve?.status, 0, `approve-plan must exit 0 first; stderr: ${run.approve?.stderr}`);
  const state = run.stateAfter;
  assert.equal(state.planApproval?.schema, "pipeline.plan-approval.v9", "an unapproved state must not read ok:true here");
  const accepted = stateModule.readAcceptedDeliveryContract({ dir: run.fx.dir, envelopePath: state.planApproval.acceptedContract.path });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  assert.equal(accepted.envelopeSha256, state.planApproval.acceptedContract.sha256);
  const loaded = await tryLoadLib("guard-devplan-policy.mjs");
  assert.ok(loaded.ok, `guard-devplan-policy.mjs imports: ${loaded.error?.message}`);
  assert.equal(typeof loaded.mod.designAdvisoryAdmission, "function");
  const authority = state.planApproval.poGateAuthority;
  const admitted = await loaded.mod.designAdvisoryAdmission(state, run.fx.dir, authority.planPath, authority.specPath);
  t.diagnostic(`designAdvisoryAdmission: ${JSON.stringify(admitted)}`);
  assert.equal(admitted?.ok, true, `the boundary must admit the v8 record: ${JSON.stringify(admitted)}`);
});

test("route 4: zero continuity-cas -- queueHead.dispatch stays unregistered across a successful present and approve", async (t) => {
  const run = await routeRun();
  if (skipForHostLimitation(t, run)) return;
  assert.equal(run.present.status, 0, `present-plan --review-receipt must exit 0; stderr: ${run.present.stderr}`);
  assert.equal(run.approve?.status, 0, `approve-plan must exit 0 (else the check below would pass vacuously); stderr: ${run.approve?.stderr}`);
  assert.equal(run.dispatchBefore, null, "no dispatch is registered after submit-plan");
  assert.equal(run.stateAfter.continuity?.queueHead?.dispatch ?? null, null, "no dispatch is registered after approve-plan");
  assert.equal(run.fx.ledger.includes("continuity-cas"), false, "the route never needs the continuity-cas verb");
});

test("compatibility: the genuine retained v8 envelope projection stays valid without replacing current v9 State", async (t) => {
  const run = await routeRun();
  if (skipForHostLimitation(t, run)) return;
  assert.equal(run.approve?.status, 0);
  const { validCurrentPlanApproval } = await loadLib("plan-spec-state-v2.mjs");
  const { createAcceptedDeliveryContractEnvelope } = await loadLib("critic-accepted-contract.mjs");
  const original = run.acceptedEnvelope.approval;
  assert.equal(original.schema, "pipeline.plan-approval.v8");
  assert.equal(validCurrentPlanApproval(original), true, "retained v8 structural API compatibility only");
  for (const key of V8_REQUIRED) assert.ok(key in original);
  for (const key of Object.keys(original)) assert.ok(V8_KEYS.includes(key));
  const made = createAcceptedDeliveryContractEnvelope(Object.fromEntries(Object.entries(run.acceptedEnvelope).filter(([key]) => key !== "schema")));
  assert.equal(made.ok, true);
  assert.equal(made.sha256, run.stateAfter.planApproval.acceptedContract.sha256);
  assert.equal(readState(run.fx.dir).planApproval.schema, "pipeline.plan-approval.v9");
  assert.equal("acceptedContract" in original, false, "no current-State or authority adoption from the v8 projection");
});

test("decision V: an in-flight v2 presentation is refused with a typed code naming present-plan --review-receipt", async (t) => {
  const fx = await buildSubmittedFeature("decision-v");
  const { sha256CanonicalJson } = await loadLib("plan-spec-state-v2.mjs");
  const statePath = stateModule.statePath(fx.dir);
  const state = readState(fx.dir);
  const packageSha256 = "d".repeat(64);
  state.planPresentation = {
    schema: "pipeline.plan-presentation.v2",
    submissionSha256: sha256CanonicalJson(state.planSubmission),
    presentedBy: "coordinator",
    presentedAt: "2026-10-09T10:00:00.000Z",
    designWorkflowPackagePath: "specs/e2e/design-workflow-package.json",
    designWorkflowPackageSha256: packageSha256,
    designWorkflowApprovalRequestPath: `scratch/design-workflow-approval-request-${packageSha256}.json`,
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const refused = cli(fx, ["approve-plan", "--by", "po-test"]);
  t.diagnostic(`approve-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0, "approve-plan refuses the in-flight v2 presentation");
  assert.match(refused.stderr, TYPED_CODE, "the refusal carries a typed code (pattern, not a pinned name: A1)");
  assert.ok(refused.stderr.includes(NEW_ROUTE_HINT), `the refusal names ${NEW_ROUTE_HINT}; stderr: ${refused.stderr}`);
  const after = readState(fx.dir);
  assert.equal(after.planApproved === true, false, "no approval was written");
  assert.equal(after.planApproval === undefined || after.planApproval === null, true);
});

test("retired: present-plan --design-workflow-package returns DWP-PRESENT-RETIRED", async (t) => {
  const fx = await buildSubmittedFeature("retired-present");
  const refused = cli(fx, ["present-plan", "--by", "coordinator", "--design-workflow-package", "specs/e2e/design-workflow-package.json"]);
  t.diagnostic(`present-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /DWP-PRESENT-RETIRED/u);
  assert.ok(`${refused.stdout}\n${refused.stderr}`.includes(NEW_ROUTE_HINT), "names the new route");
});

test("retired: approve-plan --design-workflow-approval-request returns DWP-APPROVAL-REQUEST-RETIRED (A2: mapping from the plan)", async (t) => {
  const fx = await buildSubmittedFeature("retired-approve");
  const request = `scratch/design-workflow-approval-request-${"e".repeat(64)}.json`;
  const refused = cli(fx, ["approve-plan", "--by", "po-test", "--design-workflow-approval-request", request]);
  t.diagnostic(`approve-plan exit ${refused.status}; stderr: ${refused.stderr.trim()}`);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /DWP-APPROVAL-REQUEST-RETIRED/u);
});

const RETIRED_SCRIPTS = [
  ["design-advisory-coordinator.mjs", "DESIGN-ADVISORY-COURSE-RETIRED"],
  ["design-advisory-admission.mjs", "DESIGN-ADVISORY-COURSE-RETIRED"],
  ["design-course-session.mjs", "DESIGN-COURSE-RETIRED"],
  ["design-course-coordinator.mjs", "DESIGN-COURSE-RETIRED"],
  ["runner-design-readiness-bootstrap.mjs", "DESIGN-COURSE-RETIRED"],
];
for (const [script, code] of RETIRED_SCRIPTS) {
  test(`retired: scripts/${script} returns ${code} and names the new route (A3)`, (t) => {
    const dir = tmp(`retired-${script}`);
    const result = spawnSync(process.execPath, [join(HERE, script)], {
      cwd: dir, encoding: "utf8", input: "", timeout: 30_000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: dir, USERPROFILE: dir },
    });
    const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    t.diagnostic(`${script} exit ${result.status}; output: ${text.trim().slice(0, 300)}`);
    assert.notEqual(result.status, 0, "a retired entry point exits non-zero");
    assert.ok(text.includes(code), `output names ${code}`);
    assert.ok(text.includes(NEW_ROUTE_HINT), `output names ${NEW_ROUTE_HINT}`);
  });
}

test("retired: lib/retired-design-codes.mjs holds the four retirement codes (A4)", async () => {
  const loaded = await tryLoadLib("retired-design-codes.mjs");
  assert.ok(loaded.ok, `lib/retired-design-codes.mjs imports: ${loaded.error?.message}`);
  const strings = collectStrings(loaded.mod);
  for (const code of ["DESIGN-COURSE-RETIRED", "DESIGN-ADVISORY-COURSE-RETIRED", "DWP-PRESENT-RETIRED", "DWP-APPROVAL-REQUEST-RETIRED"]) {
    assert.ok(strings.has(code), `the table holds ${code}`);
  }
});

// Phoenix Wanted 4, slice 3: the present-plan route after the reviewed feature folder moved byte-identically.
async function presentOwned(fx) {
  await bindRouteOwner(fx);
  const present = await ownedCli(fx, ["present-plan", "--by", "coordinator", "--review-receipt", fx.receiptPath]);
  // QG-04 restatement (candidate 20b): the chunked signing block is reconstructed first (posixSigningCommands above).
  const requestAbs = requestPathOf(posixSigningCommands(present.stdout)[0]);
  return { present, requestAbs, request: requestAbs !== null && existsSync(requestAbs) ? JSON.parse(readFileSync(requestAbs, "utf8")) : null };
}
function signRequest(fx, requestAbs, request) {
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: fx.signer.keyReference,
    publicKey: fx.signer.publicKeyPem, signatureBase64: sign(null, Buffer.from(String(request.approvalIntent.sha256)), fx.signer.privateKey).toString("base64"),
  };
  writeFileSync(join(dirname(requestAbs), basename(requestAbs).replace("request", "proof")), `${JSON.stringify(proof, null, 2)}\n`);
  return relative(realpathSync(fx.dir), realpathSync(requestAbs)).split(sep).join("/");
}

test("rebind 1: present-plan after a byte-identical feature-folder move builds a pathRebind binding and needs no new review round", async (t) => {
  const fx = await buildSubmittedFeature("rebind-move", { move: true });
  let out;
  try { out = await presentOwned(fx); } catch (error) { const limitation = hostLimitationOf(error); if (limitation === null) throw error; t.skip(`HOST-LIMITATION ${limitation.reason}`); return; }
  assert.equal(out.present.status, 0, `present-plan over the moved folder must exit 0 with the one existing receipt; stderr: ${out.present.stderr}`);
  assert.ok(out.request, "the sign command names an existing request");
  const binding = out.request.binding;
  assert.deepEqual(binding.pathRebind, { fromDir: "specs/e2e", toDir: MOVED_DIR });
  assert.equal(binding.reviewReceipts.length, 1, "no new review round: still exactly the one existing receipt");
  assert.equal(binding.reviewReceipts[0].path, RECEIPT_PATH, "the receipt file stays where it is");
  assert.equal(binding.sources.prd.path, `${MOVED_DIR}/prd_e2e.md`);
  assert.equal(binding.sources.spec.path, `${MOVED_DIR}/spec.md`);
  assert.equal("unreviewedSourceDelta" in binding, false, "a byte-identical move is not a source delta");
  assert.equal(readState(fx.dir).planPresentation.designApprovalBinding.pathRebind.toDir, MOVED_DIR);
});

test("rebind 2: the same move plus one changed PRD byte still refuses with the existing typed review-chain code", async (t) => {
  const fx = await buildSubmittedFeature("rebind-changed", { move: true, changeByte: true });
  let out;
  try { out = await presentOwned(fx); } catch (error) { const limitation = hostLimitationOf(error); if (limitation === null) throw error; t.skip(`HOST-LIMITATION ${limitation.reason}`); return; }
  assert.notEqual(out.present.status, 0, "a moved folder with a changed byte is refused");
  assert.match(out.present.stderr, /SDC-AUTHORITY-UNAVAILABLE.{0,20}companion-presentation-original-receipts|DCC-REVIEW-RECEIPT-BINDING|DAB-REVIEW-CHAIN/su, `a typed refusal naming the companion receipt check or the review-chain code; stderr: ${out.present.stderr}`);
  assert.doesNotMatch(out.present.stdout, /design-approval-request|sign/iu, "no success output is produced");
  assert.equal(out.request, null, "no request is produced");
  assert.equal(readState(fx.dir).planPresentation, undefined, "no presentation was recorded");
});

test("rebind 3: a request signed before the move is refused after the move with DAB-BINDING-DRIFT, so a fresh signature is needed", async (t) => {
  const before = await buildSubmittedFeature("rebind-pre");
  const fx = await buildSubmittedFeature("rebind-post", { move: true });
  let pre, post;
  try { pre = await presentOwned(before); post = await presentOwned(fx); } catch (error) { const limitation = hostLimitationOf(error); if (limitation === null) throw error; t.skip(`HOST-LIMITATION ${limitation.reason}`); return; }
  assert.equal(pre.present.status, 0, `pre-move present-plan; stderr: ${pre.present.stderr}`);
  assert.equal(post.present.status, 0, `post-move present-plan; stderr: ${post.present.stderr}`);
  // Substitute the pre-move request (already signed in the pre-move repository) for the post-move one and try to approve.
  writeFileSync(post.requestAbs, readFileSync(pre.requestAbs));
  const requestRel = signRequest(fx, post.requestAbs, pre.request);
  const approved = await ownedCli(fx, ["approve-plan", "--by", "po-test", "--design-approval-request", requestRel]);
  assert.notEqual(approved.status, 0, "the pre-move request does not approve the moved folder");
  assert.match(`${approved.stdout}\n${approved.stderr}`, /DAB-BINDING-DRIFT/u);
  assert.notEqual(readState(fx.dir).planApproved, true, "no approval was written");
});

test("rebind 4: a request created after the move is signed and approved by the real route", async (t) => {
  const fx = await buildSubmittedFeature("rebind-approve", { move: true });
  let out;
  try { out = await presentOwned(fx); } catch (error) { const limitation = hostLimitationOf(error); if (limitation === null) throw error; t.skip(`HOST-LIMITATION ${limitation.reason}`); return; }
  assert.equal(out.present.status, 0, `present-plan; stderr: ${out.present.stderr}`);
  const requestRel = signRequest(fx, out.requestAbs, out.request);
  const approved = await ownedCli(fx, ["approve-plan", "--by", "po-test", "--design-approval-request", requestRel]);
  assert.equal(approved.status, 0, `approve-plan over the post-move request; stderr: ${approved.stderr}`);
  const state = readState(fx.dir);
  assert.equal(state.planApproved, true);
  assert.deepEqual(state.planApproval.designApprovalBinding.pathRebind, { fromDir: "specs/e2e", toDir: MOVED_DIR });
  // C28e (Glossover G7): the approved PRD and Spec lie outside specs/<feature-id>/. The real registrar carries them at the approved
  // paths (it refused FTP-ARTIFACT-0/1 "path must be canonical within specs/e2e/" before), every other artifact stays in specs/e2e/,
  // and the accepted contract then resolves.
  const registered = spawnSync(process.execPath, [join(HERE, "register-feature-package.mjs"), "--root", fx.dir], { encoding: "utf8" });
  assert.equal(registered.status, 0, `register-feature-package; stdout: ${registered.stdout}; stderr: ${registered.stderr}`);
  const manifest = JSON.parse(readFileSync(join(fx.dir, "specs/e2e/lifecycle.json"), "utf8"));
  const pathOf = (kind) => manifest.artifacts.find((entry) => entry.class === kind)?.path;
  assert.deepEqual([pathOf("prd"), pathOf("spec")], [`${MOVED_DIR}/prd_e2e.md`, `${MOVED_DIR}/spec.md`], "the PRD and the Spec are carried at the approved paths");
  for (const entry of manifest.artifacts.filter((item) => item.class !== "prd" && item.class !== "spec")) assert.ok(entry.path.startsWith("specs/e2e/"), entry.path);
  const accepted = stateModule.readAcceptedDeliveryContract({ dir: fx.dir, envelopePath: state.planApproval.acceptedContract.path });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
});

// C28e (Glossover G7): a PRD and Spec the package could not carry (here: inside another feature's package) are named before the
// signature, so the state that blocked every dispatch after the approval can no longer be signed.
test("C28e (Glossover G7): present-plan refuses a PRD and Spec the feature package cannot carry, before any request exists", async (t) => {
  const fx = await buildSubmittedFeature("rebind-foreign-package", { move: true });
  writeFileIn(fx.dir, `${MOVED_DIR}/lifecycle.json`, "{}\n");
  git(fx.dir, "add", "--", `${MOVED_DIR}/lifecycle.json`);
  git(fx.dir, "commit", "-q", "-m", "fixture: the moved folder is another feature's package");
  let out;
  try { out = await presentOwned(fx); } catch (error) { const limitation = hostLimitationOf(error); if (limitation === null) throw error; t.skip(`HOST-LIMITATION ${limitation.reason}`); return; }
  assert.equal(out.present.status, 2, `present-plan must refuse; stdout: ${out.present.stdout}; stderr: ${out.present.stderr}`);
  assert.match(out.present.stderr, /DAB-PACKAGE-PATH/u);
  assert.match(out.present.stderr, new RegExp(`${MOVED_DIR}/prd_e2e\\.md`, "u"));
  assert.match(out.present.stderr, /Move it into specs\/e2e\/ \(git mv\)/u);
  assert.equal(out.request, null, "no approval request is written");
});

// Every original callback registers exactly once with the official FD3 protocol.
assert.equal(designCompletionCases.length, originalDesignCases.length);
const sortedDesignCases = designCompletionCases.sort((a, b) => a.id.localeCompare(b.id));
assert.deepEqual(sortedDesignCases.map(({id,name}) => ({id,name})), originalDesignCases);
registerTestCaseCompletion({ cases: sortedDesignCases, fd: 3, maxBytes: 16384 });
