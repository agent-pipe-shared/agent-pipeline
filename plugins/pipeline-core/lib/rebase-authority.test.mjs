#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * rebase-authority suite.
 *
 * SCOPE BOUNDARY, stated rather than implied (QG-05): every case here drives the resolver
 * through INJECTED dependencies — no real git process runs and no real repository is
 * created. That proves the resolver's logic, its purity and its refusals; it does not prove
 * that the real `.git/rebase-merge` filenames match the ones the fake serves. That binding
 * belongs to the wiring package's integration coverage, not here.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import test from "node:test";

import {
  approveSubmittedPlan, derivePlanLifecycle, enterPlanImplementation, sha256CanonicalJson, submitPlan,
} from "./plan-spec-state-v2.mjs";
import { NEUTRAL_STATE } from "./project-authority.mjs";
import {
  CONFLICT_PATH_PLACEHOLDER,
  REBASE_AUTHORITY_AUTHORITY_KEYS,
  REBASE_AUTHORITY_PROHIBITED_SHAPES,
  REBASE_AUTHORITY_RESULT_KEYS,
  REBASE_AUTHORITY_RETRY_ACTIONS_SCHEMA,
  REBASE_AUTHORITY_SCHEMA,
  rebaseAuthorityPermitsCommand,
  rebaseAuthorityPermitsPath,
  rebaseAuthorityRetryActions,
  resolveRebaseAuthority,
} from "./rebase-authority.mjs";

const ROOT = resolve(sep, "fixture", "repo");
const GIT_DIR = join(ROOT, ".git");
const LINKED_GIT_DIR = join(ROOT, ".git", "worktrees", "linked");

const ORIG_HEAD = "d418ee953ecf5581abbeca7bb06d261b49c6ac35";
const ONTO = "dfd26254ffa040a50af28d3b3f46737245d4c5cd";
const HEAD_NAME = "refs/heads/feat/sprint-alfred";

const PLAN_PATH = "specs/feature/prd.md";
const SPEC_PATH = "specs/feature/spec.md";
const PLAN_BYTES = Buffer.from("# approved plan, as it stands at the original tip\n", "utf8");
const SPEC_BYTES = Buffer.from("# approved spec, as it stands at the original tip\n", "utf8");
// What the PARTIALLY REPLAYED tree shows: an earlier design state. Nothing may read it.
const REPLAY_PLAN_BYTES = Buffer.from("# earlier design-state plan, mid-replay\n", "utf8");

const TODO_BYTES = Buffer.from("pick 74d6607c96dd49768fe64a93dba63e47402f2224 replay step\n", "utf8");
const DONE_BYTES = Buffer.from("pick 1111111111111111111111111111111111111111 completed step\n", "utf8");

const CONFLICT_A = "backlog/items/conflicted.md";
const CONFLICT_B = "src/replayed.mjs";
const UNTOUCHED = "src/untouched.mjs";

const PROFILE = "3".repeat(64);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: "4".repeat(64),
  runtimeSha256: "5".repeat(64),
  receiptSha256: "6".repeat(64),
  repositoryFingerprint: "7".repeat(64),
  planPath: PLAN_PATH,
  planSha256: sha256(PLAN_BYTES),
  specPath: SPEC_PATH,
  specSha256: sha256(SPEC_BYTES),
};
const NOW = "2026-09-01T20:00:00.000Z";
const LATER = "2026-09-01T20:05:00.000Z";
const IMPLEMENTED = "2026-09-01T20:30:00.000Z";

function continuity() {
  return {
    schema: "pipeline.continuity.v0",
    featureId: "sprint-alfred-epic",
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: PLAN_PATH, sha256: "8".repeat(64) },
      spec: { path: SPEC_PATH, sha256: "9".repeat(64) },
      result: null,
    },
    queueHead: {
      packageId: "continuity-adoption",
      actionId: "review-active-feature",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

function draftState() {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "sprint-alfred-epic", planPath: PLAN_PATH, phase: "design" },
    planApproved: false,
    continuity: continuity(),
  };
}

function approvedState() {
  const initial = draftState();
  const submission = submitPlan({
    state: initial,
    expectedStateSha256: sha256CanonicalJson(initial),
    poGateAuthority: AUTHORITY,
    profile: "epic",
    profileSha256: PROFILE,
    by: "Coordinator",
    at: NOW,
  });
  assert.equal(submission.ok, true, JSON.stringify(submission));
  const awaiting = submission.state;
  const approval = approveSubmittedPlan({
    state: awaiting,
    expectedStateSha256: sha256CanonicalJson(awaiting),
    expectedSubmissionSha256: derivePlanLifecycle(awaiting).submissionSha256,
    poGateAuthority: AUTHORITY,
    profileSha256: PROFILE,
    by: "PO",
    at: LATER,
  });
  assert.equal(approval.ok, true, JSON.stringify(approval));
  return approval.state;
}

function implementingState() {
  const accepted = approvedState();
  const implementation = enterPlanImplementation({
    state: accepted,
    expectedStateSha256: sha256CanonicalJson(accepted),
    at: IMPLEMENTED,
  });
  assert.equal(implementation.ok, true, JSON.stringify(implementation));
  return implementation.state;
}

const IMPLEMENTING = implementingState();

function json(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

/**
 * A fully injected repository. Nothing here touches a real filesystem or a real git.
 */
function fixture(overrides = {}) {
  const {
    stateAtOrigHead = IMPLEMENTING,
    conflicts = [CONFLICT_A, CONFLICT_B],
    gitDir = GIT_DIR,
    commonDir = GIT_DIR,
    headName = HEAD_NAME,
    origHead = ORIG_HEAD,
    onto = ONTO,
    todo = TODO_BYTES,
    done = DONE_BYTES,
    planBytesAtOrigHead = PLAN_BYTES,
    specBytesAtOrigHead = SPEC_BYTES,
    backend = "merge",
    omit = [],
    depsOverrides = {},
  } = overrides;

  const rebaseDir = join(gitDir, backend === "merge" ? "rebase-merge" : "rebase-apply");
  const dirs = new Set([ROOT, gitDir, commonDir, rebaseDir]);
  const files = new Map();
  const put = (name, bytes) => { if (!omit.includes(name)) files.set(join(rebaseDir, name), bytes); };
  put("head-name", Buffer.from(`${headName}\n`, "utf8"));
  put("orig-head", Buffer.from(`${origHead}\n`, "utf8"));
  put("onto", Buffer.from(`${onto}\n`, "utf8"));
  put("git-rebase-todo", todo);
  put("done", done);
  // The WORKING TREE's own state file shows the mid-replay draft. Reading it is the defect.
  files.set(join(ROOT, NEUTRAL_STATE), json(draftState()));

  const blobs = new Map([
    [`${origHead}:${NEUTRAL_STATE}`, json(stateAtOrigHead)],
    [`${origHead}:${PLAN_PATH}`, planBytesAtOrigHead],
    [`${origHead}:${SPEC_PATH}`, specBytesAtOrigHead],
    // What a partially replayed HEAD shows — present so a break that repoints the digest
    // source at the replay tree fails loudly instead of finding nothing.
    [`HEAD:${NEUTRAL_STATE}`, json(draftState())],
    [`HEAD:${PLAN_PATH}`, REPLAY_PLAN_BYTES],
    [`HEAD:${SPEC_PATH}`, SPEC_BYTES],
  ]);

  const gitCalls = [];
  const deps = {
    existsSync: (path) => dirs.has(String(path)) || files.has(String(path)),
    readFileSync: (path) => {
      const value = files.get(String(path));
      if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return value;
    },
    lstatSync: (path) => {
      const key = String(path);
      if (dirs.has(key)) return { isDirectory: () => true, isSymbolicLink: () => false };
      if (files.has(key)) return { isDirectory: () => false, isSymbolicLink: () => false };
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    realpathSync: (path) => String(path),
    gitRead: ({ argv }) => {
      gitCalls.push([...argv]);
      const empty = { ok: false, stdout: Buffer.alloc(0) };
      if (argv[0] === "rev-parse" && argv[1] === "--absolute-git-dir") return { ok: true, stdout: Buffer.from(gitDir, "utf8") };
      if (argv[0] === "rev-parse" && argv[1] === "--git-common-dir") return { ok: true, stdout: Buffer.from(commonDir, "utf8") };
      if (argv[0] === "cat-file" && argv[1] === "-t") {
        return argv[2] === origHead ? { ok: true, stdout: Buffer.from("commit\n", "utf8") } : empty;
      }
      if (argv[0] === "cat-file" && argv[1] === "blob") {
        const bytes = blobs.get(argv[2]);
        return bytes === undefined ? empty : { ok: true, stdout: bytes };
      }
      if (argv[0] === "diff") return { ok: true, stdout: Buffer.from(conflicts.join("\0"), "utf8") };
      return empty;
    },
    ...depsOverrides,
  };
  return { deps, gitCalls, blobs, files };
}

function resolved(overrides = {}) {
  const { deps, gitCalls } = fixture(overrides);
  return { result: resolveRebaseAuthority({ rootDir: ROOT, deps }), gitCalls };
}

test("an authorized result has a closed key set and is deeply frozen", () => {
  const { result } = resolved();
  assert.equal(result.status, "authorized", JSON.stringify(result));
  assert.equal(result.schema, REBASE_AUTHORITY_SCHEMA);
  assert.deepEqual(Object.keys(result).sort(), [...REBASE_AUTHORITY_RESULT_KEYS].sort());
  assert.deepEqual(Object.keys(result.authority).sort(), [...REBASE_AUTHORITY_AUTHORITY_KEYS].sort());
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.authority));
  // A mutable conflict set would let a consuming guard widen the surface by pushing to it.
  assert.throws(() => { result.authority.conflictPaths.push(UNTOUCHED); }, TypeError);
  assert.throws(() => { result.authority.permittedContinuations.push("git push"); }, TypeError);
  assert.equal(rebaseAuthorityPermitsPath(result, UNTOUCHED), false);
});

test("every Requirement 1 field is derived from the observed state, not defaulted", () => {
  const { result } = resolved();
  const authority = result.authority;

  assert.deepEqual(authority.repository, {
    root: ROOT,
    gitDir: GIT_DIR,
    commonDir: GIT_DIR,
    linkedWorktree: false,
    fingerprint: sha256(Buffer.from(`${ROOT}\n${GIT_DIR}\n${GIT_DIR}`, "utf8")),
  });
  assert.equal(authority.backend, "merge");
  assert.equal(authority.headName, HEAD_NAME);
  assert.equal(authority.origHead, ORIG_HEAD);
  assert.equal(authority.onto, ONTO);
  // Full lowercase OIDs, never abbreviated.
  for (const oid of [authority.origHead, authority.onto]) assert.match(oid, /^[0-9a-f]{40}$/u);
  // Digests computed here from the literal fixture bytes, never from anything the module
  // produced: a self-consistent wrong encoding would otherwise pass.
  assert.equal(authority.todoSha256, sha256(TODO_BYTES));
  assert.equal(authority.doneSha256, sha256(DONE_BYTES));
  assert.equal(authority.plan.path, PLAN_PATH);
  assert.equal(authority.plan.sha256, sha256(PLAN_BYTES));
  assert.equal(authority.spec.path, SPEC_PATH);
  assert.equal(authority.spec.sha256, sha256(SPEC_BYTES));
  // ...and specifically NOT the partially replayed tree's bytes.
  assert.notEqual(authority.plan.sha256, sha256(REPLAY_PLAN_BYTES));
  assert.equal(authority.statePath, NEUTRAL_STATE);
  assert.deepEqual(authority.originalFeature, { id: "sprint-alfred-epic", phase: "implementation" });
  assert.deepEqual(authority.lifecycle, { ok: true, status: "implementing", code: "PLAN-LIFECYCLE-CURRENT" });
  assert.deepEqual(authority.conflictPaths, [CONFLICT_A, CONFLICT_B].sort());
  // Stated, not omitted.
  assert.equal(authority.remoteAuthority, false);
  assert.equal(authority.pushAuthority, false);
  assert.equal(authority.sessionWide, false);
  assert.equal(authority.scope, "single-active-rebase-conflict-surface");

  // Each field actually tracks its input: vary the observation, the field moves.
  const other = resolved({
    todo: Buffer.from("pick abcdef0 a different todo\n", "utf8"),
    done: Buffer.from("", "utf8"),
    onto: "0".repeat(40),
    headName: "refs/heads/other",
    commonDir: LINKED_GIT_DIR,
    conflicts: [CONFLICT_A],
  }).result.authority;
  assert.notEqual(other.todoSha256, authority.todoSha256);
  assert.notEqual(other.doneSha256, authority.doneSha256);
  assert.equal(other.onto, "0".repeat(40));
  assert.equal(other.headName, "refs/heads/other");
  assert.equal(other.repository.linkedWorktree, true);
  assert.notEqual(other.repository.fingerprint, authority.repository.fingerprint);
  assert.deepEqual(other.conflictPaths, [CONFLICT_A]);
});

test("resolution is pure: every write-capable dependency may throw and only read verbs run", () => {
  const thrower = (name) => () => { throw new Error(`the resolver called ${name}`); };
  const { result, gitCalls } = resolved({
    depsOverrides: {
      appendFileSync: thrower("appendFileSync"),
      mkdirSync: thrower("mkdirSync"),
      renameSync: thrower("renameSync"),
      rmSync: thrower("rmSync"),
      spawnSync: thrower("spawnSync"),
      unlinkSync: thrower("unlinkSync"),
      writeFileSync: thrower("writeFileSync"),
    },
  });
  assert.equal(result.status, "authorized", JSON.stringify(result));
  assert.deepEqual(result, resolved().result);
  assert.ok(gitCalls.length > 0);
  for (const argv of gitCalls) {
    assert.ok(["rev-parse", "cat-file", "diff"].includes(argv[0]), `non-read git verb: ${argv.join(" ")}`);
  }
  // No injected runner can widen the module into a mutator: the verb allowlist is on the
  // module's own side of the dependency boundary.
  const permissive = fixture({ depsOverrides: { gitRead: () => ({ ok: true, stdout: Buffer.from("x", "utf8") }) } });
  const loose = resolveRebaseAuthority({ rootDir: ROOT, deps: permissive.deps });
  assert.equal(loose.status, "refused");
});

test("decisive property (a): an approved orig-head carries a rebase whose replayed tree looks like a draft", () => {
  const { result, gitCalls } = resolved();
  assert.equal(result.status, "authorized", JSON.stringify(result));
  assert.equal(result.authority.lifecycle.status, "implementing");
  assert.equal(result.authority.plan.sha256, sha256(PLAN_BYTES));
  // The authority was read from orig-head, never from HEAD and never from the working tree.
  for (const argv of gitCalls) {
    if (argv[0] === "cat-file" && argv[1] === "blob") assert.ok(argv[2].startsWith(`${ORIG_HEAD}:`), argv[2]);
  }
  assert.equal(rebaseAuthorityPermitsCommand(result, "git -c core.editor=true rebase --continue"), true);
});

test("decisive property (b) / negative 7: no rebase state can manufacture an approval", () => {
  // The sharpest form of the spec's case: the plan/spec authority IS present at orig-head,
  // so nothing refuses earlier, and only the lifecycle gate stands between a rebase and a
  // manufactured approval.
  const approvedButRevoked = { ...implementingState(), planApproved: false };
  for (const [label, overrides, code] of [
    ["planApproved false at the true starting point", { stateAtOrigHead: approvedButRevoked }, "REBASE-AUTHORITY-ORIG-HEAD-NOT-IMPLEMENTING"],
    ["approved but not in implementation", { stateAtOrigHead: approvedState() }, "REBASE-AUTHORITY-ORIG-HEAD-NOT-IMPLEMENTING"],
    ["approved digests drifted from the orig-head bytes", { planBytesAtOrigHead: REPLAY_PLAN_BYTES }, "REBASE-AUTHORITY-ORIG-HEAD-NOT-IMPLEMENTING"],
    ["a plain draft, with no plan/spec authority at all", { stateAtOrigHead: draftState() }, "REBASE-AUTHORITY-PLAN-PATH-ABSENT-AT-ORIG-HEAD"],
  ]) {
    const { result } = resolved(overrides);
    assert.equal(result.status, "refused", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.code, code, label);
    assert.equal(result.authority, null, label);
    // A refusal grants nothing at all, on either lane.
    assert.equal(rebaseAuthorityPermitsPath(result, CONFLICT_A), false, label);
    assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --continue"), false, label);
    assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours -- ${CONFLICT_A}`), false, label);
  }
});

test("negative 1: only the current conflict set is editable, not every file under an active rebase", () => {
  const { result } = resolved();
  assert.equal(rebaseAuthorityPermitsPath(result, CONFLICT_A), true);
  assert.equal(rebaseAuthorityPermitsPath(result, join(ROOT, CONFLICT_A)), true);
  assert.equal(rebaseAuthorityPermitsPath(result, CONFLICT_A.replace(/\//gu, "\\")), true);
  assert.equal(rebaseAuthorityPermitsPath(result, `./${CONFLICT_A}`), true);
  assert.equal(rebaseAuthorityPermitsPath(result, UNTOUCHED), false);
  assert.equal(rebaseAuthorityPermitsPath(result, ""), false);
  assert.equal(rebaseAuthorityPermitsPath(result, "../outside/file.md"), false);
  assert.equal(rebaseAuthorityPermitsPath(result, `${CONFLICT_A}\0${UNTOUCHED}`), false);
  assert.equal(rebaseAuthorityPermitsPath(result, resolve(sep, "elsewhere", "file.md")), false);
});

test("negative 6: a conflict command whose real pathspec lies outside the surface is refused", () => {
  const { result } = resolved();
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours -- ${CONFLICT_A}`), true);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --theirs -- ${CONFLICT_B}`), true);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git restore --ours -- ${CONFLICT_A}`), true);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git add -- ${CONFLICT_A}`), true);

  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours -- ${UNTOUCHED}`), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours -- ${CONFLICT_A} ${UNTOUCHED}`), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git add -- ${UNTOUCHED}`), false);
  // No explicit `--`: git's own grammar is ambiguous here, so it is never admitted.
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours ${CONFLICT_A}`), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git checkout --ours --"), false);
  // A flag outside the verb's admitted set, and a verb outside the conflict set entirely.
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --force -- ${CONFLICT_A}`), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git reset -- ${CONFLICT_A}`), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, `rm ${CONFLICT_A}`), false);
});

test("only the exact continuations are admitted, and --abort keeps its own recovery lane", () => {
  const { result } = resolved();
  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --continue"), true);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git -c core.editor=true rebase --continue"), true);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --show-current-patch"), true);

  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --abort"), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --continue --autostash"), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase"), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git -c core.editor=true rebase --show-current-patch"), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, ""), false);
});

test("Requirement 4: no prohibited shape is ever reported as authorised", () => {
  const { result } = resolved();
  const ids = REBASE_AUTHORITY_PROHIBITED_SHAPES.map((shape) => shape.id);
  for (const required of ["edit-todo", "exec", "arbitrary-config", "push", "force-push", "automatic-skip", "shell-chaining"]) {
    assert.ok(ids.includes(required), `prohibited-shape table lost its ${required} case`);
  }
  for (const { id, command } of REBASE_AUTHORITY_PROHIBITED_SHAPES) {
    assert.equal(rebaseAuthorityPermitsCommand(result, command), false, `${id}: ${command}`);
  }
  // Structural: there is no field anywhere in the result in which any of these could be
  // reported as authorised in the first place.
  const keys = new Set();
  const walk = (value) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { keys.add(key.toLowerCase()); walk(child); }
  };
  walk(result);
  for (const forbidden of [
    "sessionoverride", "capability", "uses", "multiuse", "maintenancewindow", "window",
    "approvalmode", "push", "forcepush", "remote", "skip", "edittodo", "exec", "override",
  ]) {
    assert.equal(keys.has(forbidden), false, `result exposes a "${forbidden}" field`);
  }
});

test("Requirement 5: the surface is enumerable and its rendered advice cannot drift from the predicate", () => {
  const { result } = resolved();
  const authority = result.authority;

  // A caller can list the conflicted paths and state the next command without re-deriving
  // anything from git.
  assert.deepEqual(authority.conflictPaths, [CONFLICT_A, CONFLICT_B].sort());
  assert.ok(authority.permittedContinuations.length > 0);
  assert.equal(authority.nextCommand, authority.permittedContinuations[0]);
  assert.equal(authority.nextCommand, "git -c core.editor=true rebase --continue");
  for (const command of authority.permittedContinuations) {
    assert.equal(rebaseAuthorityPermitsCommand(result, command), true, command);
  }
  assert.ok(authority.resolutionShapes.length > 0);
  for (const shape of authority.resolutionShapes) {
    assert.ok(shape.includes(CONFLICT_PATH_PLACEHOLDER), shape);
    assert.equal(rebaseAuthorityPermitsCommand(result, shape.replace(CONFLICT_PATH_PLACEHOLDER, CONFLICT_A)), true, shape);
    assert.equal(rebaseAuthorityPermitsCommand(result, shape.replace(CONFLICT_PATH_PLACEHOLDER, UNTOUCHED)), false, shape);
  }

  const envelope = rebaseAuthorityRetryActions(result);
  assert.equal(envelope.schema, REBASE_AUTHORITY_RETRY_ACTIONS_SCHEMA);
  assert.ok(envelope.retryActions.length > 0, "an empty envelope during an active rebase is itself a defect");
  for (const action of envelope.retryActions) {
    assert.equal(action.executable, "git");
    assert.ok(Array.isArray(action.argv) && action.argv.length > 0);
    // Contractual, not decorative: the envelope's in-repo consumer drops anything else.
    assert.equal(action.mutation, false);
    assert.equal(action.requiresConfirmation, false);
    // The mutating continuation must never be smuggled in as a read-only action.
    assert.equal(action.argv.includes("--continue"), false, action.argv.join(" "));
    assert.equal(action.argv.includes("push"), false, action.argv.join(" "));
  }
  // Still non-empty when a rebase is active but the authority refuses.
  const refusedEnvelope = rebaseAuthorityRetryActions(resolved({ stateAtOrigHead: draftState() }).result);
  assert.ok(refusedEnvelope.retryActions.length > 0);
  assert.deepEqual(rebaseAuthorityRetryActions({ schema: "something.else" }).retryActions, []);
});

test("the authority is never opt-in and never widened by an unknown argument", () => {
  const { deps } = fixture();
  const plain = resolveRebaseAuthority({ rootDir: ROOT, deps });
  const withFlags = resolveRebaseAuthority({
    rootDir: ROOT, deps, force: true, enable: true, sessionOverride: true, sessionWide: true,
  });
  assert.deepEqual(withFlags, plain);

  // With no rebase in progress, no argument turns the authority on.
  const idle = fixture();
  idle.deps.existsSync = (path) => String(path) === ROOT;
  const off = resolveRebaseAuthority({ rootDir: ROOT, deps: idle.deps, force: true, enable: true });
  assert.equal(off.status, "refused");
  assert.equal(off.code, "REBASE-AUTHORITY-NO-ACTIVE-REBASE");
  assert.equal(rebaseAuthorityPermitsCommand(off, "git rebase --continue"), false);
});

test("a rebase that is not genuine, or not on the supported backend, refuses rather than resolves", () => {
  const cases = [
    [{ backend: "apply" }, "REBASE-AUTHORITY-BACKEND-UNSUPPORTED"],
    [{ origHead: "d418ee9" }, "REBASE-AUTHORITY-ORIG-HEAD-INVALID"],
    [{ origHead: ORIG_HEAD.toUpperCase() }, "REBASE-AUTHORITY-ORIG-HEAD-INVALID"],
    [{ onto: "not-an-oid" }, "REBASE-AUTHORITY-ONTO-INVALID"],
    [{ headName: "detached HEAD" }, "REBASE-AUTHORITY-HEAD-NAME-INVALID"],
    [{ omit: ["git-rebase-todo"] }, "REBASE-AUTHORITY-TODO-ABSENT"],
    [{ omit: ["head-name"] }, "REBASE-AUTHORITY-HEAD-NAME-INVALID"],
    [{ stateAtOrigHead: { schema: "pipeline.state.v0" } }, "REBASE-AUTHORITY-NO-ACTIVE-FEATURE-AT-ORIG-HEAD"],
  ];
  for (const [overrides, code] of cases) {
    const { result } = resolved(overrides);
    assert.equal(result.status, "refused", JSON.stringify(result));
    assert.equal(result.code, code, JSON.stringify(result));
    assert.equal(result.authority, null);
  }
  // A hand-forged look-alike is not an authority either.
  const forged = { schema: "pipeline.rebase-authority.v0", status: "authorized", authority: { conflictPaths: [CONFLICT_A], repository: { root: ROOT } } };
  assert.equal(rebaseAuthorityPermitsPath(forged, CONFLICT_A), false);
  assert.equal(rebaseAuthorityPermitsCommand(forged, "git rebase --continue"), false);
  assert.equal(rebaseAuthorityPermitsPath(null, CONFLICT_A), false);
});

test("an empty conflict set permits the continuation and no path at all", () => {
  const { result } = resolved({ conflicts: [] });
  assert.equal(result.status, "authorized", JSON.stringify(result));
  assert.deepEqual(result.authority.conflictPaths, []);
  assert.equal(rebaseAuthorityPermitsCommand(result, "git rebase --continue"), true);
  assert.equal(rebaseAuthorityPermitsPath(result, CONFLICT_A), false);
  assert.equal(rebaseAuthorityPermitsCommand(result, `git checkout --ours -- ${CONFLICT_A}`), false);
});
