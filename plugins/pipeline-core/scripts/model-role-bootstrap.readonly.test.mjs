// SPDX-License-Identifier: SUL-1.0
/**
 * HOOKREFRESH-T6-20261009 (Ruling 84, finding F2) -- RED pins for a ZERO-WRITE model-role readback.
 *
 * The defect: the preflight's readback calls `runModelRoleBootstrap` with `confirm = null`. Where no human
 * acknowledgement is required (a later session whose mapping is unchanged) the function reaches
 * `admitModelRoleHostBootstrap`, which calls `store.persist` -- so a read-only readback WRITES an admission under the
 * git common dir (Ruling 70 R3: stop on a write).
 *
 * Ruling 84 F2: `runModelRoleBootstrap({ ..., readOnly: true })` returns before any admission as
 * `{ ok: false, status: "admission-pending", code: "MODEL-ROLE-BOOTSTRAP-ADMISSION-PENDING" }` wherever it would
 * otherwise admit; `makeStore` is still called (inspect/read are reads); REUSED (`present`) stays `ready`; the
 * preflight passes `readOnly: true`.
 *
 * ASSUMED NAME (the ruling names the option, not the status field spelling beyond the quoted shape): the option is
 * `readOnly` of the single options bag, exactly as written in Ruling 84.
 *
 * Reading guide: RED cases fail today on the stated reason (in the assertion message); GREEN cases pass today and
 * bound the fix (REUSED stays ready, a pending human confirmation stays `confirmation-required`).
 *
 * The preflight half is pinned in two places, because the process entry and the in-process seam are different call
 * sites: the seam (`runModelRoleBootstrapFn`) argument bag in pipeline-start-preflight-enforcement.test.mjs, and here
 * the PROCESS-ENTRY call site (`observeModelRoleBootstrapReadback`, which is not exported and so not reachable by a
 * behavioural spy without a production seam) by a source-level pin. That the entry call site really passes the option
 * at run time is therefore "not verifiable" without exporting a seam -- a production change this test slice must not make.
 *
 * HOOKREFRESH-T8-20261009 (Ruling 113 HR-D1) adds the zero-bytes pins against a REAL temporary repository and the REAL
 * model-role host store; see the block comment before the "T8" cases at the end of this file.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { createModelFamilyInvocationEntry } from "../lib/model-family-invocation.mjs";
import { createModelFamilyRuntimeHost } from "../lib/model-family-runtime-host.mjs";
import { registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { runModelRoleBootstrap } from "./model-role-bootstrap.mjs";

const routeSource = registeredFunctionalTaskRoutes();
const selected = (route) => `model-${route.runner}-${route.role}-${route.effort}`;
const approvedPolicies = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort,
  policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner,
    role: route.role, approved: [{ modelId: selected(route), rank: 1,
      efforts: [route.effort], compatibilityEvidenceSha256: "a".repeat(64) }] },
}));
const observations = routeSource.configuredRoutes.map((route) => ({
  runner: route.runner, role: route.role, effort: route.effort,
  ok: true, assurance: route.runner === "claude"
    ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
  availableModelIds: [selected(route)],
}));

/** The disposable fixture of model-role-bootstrap.test.mjs, with a spy on the store's only write. */
function fixture(overrides = {}) {
  const rows = new Map();
  let persistCalls = 0;
  let makeStoreCalls = 0;
  const store = {
    inspect: (id) => ({ ok: true, status: rows.has(id) ? "present" : "absent" }),
    read: (id) => ({ ok: rows.has(id), ...rows.get(id) }),
    latest: (exclude) => {
      const entry = [...rows.entries()].filter(([id]) => id !== exclude).at(-1);
      return { ok: true, sessionId: entry?.[0] ?? null, receipts: entry?.[1].receipts ?? [] };
    },
    persist: (value) => { persistCalls += 1; rows.set(value.sessionId, value); return { ok: true }; },
  };
  const input = {
    rootDir: "/repo", runner: "codex",
    env: { CODEX_SESSION_ID: "session-1", CODEX_THREAD_ID: "session-1" },
    familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "inactive" }) },
    routeSource, readGitState: () => ({ candidateCommit: "b".repeat(40), commonDir: "/repo/.git" }),
    readApprovedPolicy: () => ({ ok: true, approvedPolicies }),
    collectObservations: async ({ routeSource: scoped }) => ({
      ok: true,
      observations: observations.filter((entry) => scoped.configuredRoutes.some((route) => route.runner === entry.runner
        && route.role === entry.role && route.effort === entry.effort)),
    }),
    makeStore: () => { makeStoreCalls += 1; return store; },
    now: () => "2026-09-26T12:00:00.000Z",
    ...overrides,
  };
  return { input, rows, get persistCalls() { return persistCalls; }, get makeStoreCalls() { return makeStoreCalls; } };
}

/** Admit session-1 for real (human confirmed), so a later session-2 with the same mapping needs no acknowledgement. */
async function admitFirstSession(f) {
  const admitted = await runModelRoleBootstrap({ ...f.input, confirm: async () => true });
  assert.equal(admitted.ok, true, "precondition: session-1 admitted");
  assert.equal(f.persistCalls, 1, "precondition: exactly one write so far");
}
const secondSession = (f) => ({ ...f.input, env: { CODEX_THREAD_ID: "session-2" }, now: () => "2026-09-26T12:01:00.000Z" });

test("GREEN precondition: WITHOUT readOnly, a later session with an unchanged mapping is admitted and persisted (this is the write the readback must not make)", async () => {
  const f = fixture();
  await admitFirstSession(f);
  const next = await runModelRoleBootstrap(secondSession(f));
  assert.equal(next.ok, true);
  assert.equal(next.readback.acknowledgementRequired, false);
  assert.equal(f.persistCalls, 2);
});

test("RED F2 (a): readOnly never calls store.persist, even where the session would otherwise be admitted", async () => {
  const f = fixture();
  await admitFirstSession(f);
  await runModelRoleBootstrap({ ...secondSession(f), readOnly: true });
  assert.equal(f.persistCalls, 1,
    "Ruling 84 F2: a read-only readback admitted session-2 and wrote it to the host store (Ruling 70 R3: stop on a write)");
  assert.equal(f.rows.size, 1, "no second admission row");
  assert.ok(f.makeStoreCalls >= 1, "the store is still opened -- inspect and read are reads");
});

test("RED F2 (b): readOnly where it would admit returns admission-pending with its own code", async () => {
  const f = fixture();
  await admitFirstSession(f);
  const pending = await runModelRoleBootstrap({ ...secondSession(f), readOnly: true });
  assert.equal(pending.ok, false, "Ruling 84 F2: the result of a read-only readback is not an admission");
  assert.equal(pending.status, "admission-pending");
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-ADMISSION-PENDING");
});

test("GREEN control F2 (c): readOnly leaves a REUSED (present) session ready and writes nothing", async () => {
  const f = fixture();
  await admitFirstSession(f);
  const reused = await runModelRoleBootstrap({ ...f.input, readOnly: true });
  assert.equal(reused.ok, true);
  assert.equal(reused.status, "ready");
  assert.equal(reused.code, "MODEL-ROLE-BOOTSTRAP-REUSED");
  assert.equal(f.persistCalls, 1);
});

test("GREEN control F2 (d): readOnly on a fresh session that needs a human confirmation stays `confirmation-required` and writes nothing", async () => {
  const f = fixture();
  const pending = await runModelRoleBootstrap({ ...f.input, readOnly: true });
  assert.equal(pending.ok, false);
  assert.equal(pending.status, "confirmation-required");
  assert.equal(pending.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.equal(f.persistCalls, 0);
  assert.equal(f.rows.size, 0);
});

test("RED F2 (e): the preflight's PROCESS-ENTRY readback call site passes readOnly: true (source-level pin; see header)", () => {
  const source = readFileSync(new URL("./pipeline-start-preflight.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function observeModelRoleBootstrapReadback");
  assert.ok(start >= 0, "precondition: the readback function exists");
  const end = source.indexOf("isDirectInvocation(import.meta.url)", start);
  const body = source.slice(start, end > start ? end : undefined);
  assert.match(body, /runModelRoleBootstrap\(/, "precondition: the readback calls the real bootstrap");
  assert.match(body, /readOnly:\s*true/,
    "Ruling 84 F2: the entry readback calls runModelRoleBootstrap without readOnly: true, so a preflight run can write a model-role admission");
});

/*
 * HOOKREFRESH-T8-20261009 (Ruling 113 HR-D1; Ruling 84 F2, last bullet: "a test proves zero bytes under the store
 * directory after a preflight run") -- the zero-bytes pins against a REAL temporary repository and the REAL store.
 *
 * What is real: the temp root is a real git repository (git init plus one commit made with plumbing, so no hook and no
 * identity config is involved); `readGitState` (git rev-parse), `makeStore` (createModelRoleHostStore, the private
 * session store under the git common dir) and the model-family `familyInvocationEntry` / runtime host are the production
 * defaults. What is faked: ONLY the host-facing ports -- `routeSource` is the registered one, `readApprovedPolicy`
 * reports no signed policy (the V3-baseline authority, the only one a temp root without trust anchors can verify) and
 * `collectObservations` makes no CLI or network probe. The call is the preflight's `observeModelRoleBootstrapReadback`
 * shape, `{ rootDir, runner, env, readOnly: true }`; that wrapper itself is not exported and stays pinned by the
 * source-level case (e) above, unchanged.
 *
 * Label mapping against the briefing: (a) is T8 (a); (b) is T8 (b1) -- a synthetic `active` activation over the real
 * host -- plus T8 (b2) -- a real activation marker over the real host; (c) is T8 (c) against a POPULATED store, because
 * with no prior state (a) is already the confirmation-required state. Extra, not briefed: T8 (d) an unchanged mapping
 * reads `admission-pending` (the very path `readOnly` intercepts), T8 (e) a recorded session reads REUSED, and a control
 * that proves the snapshot detects a write when `readOnly` is absent.
 *
 * Every case asserts the result's status/code as well as the bytes: natively on Windows the real store answers
 * MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE before touching disk (it accepts only a POSIX '/'-rooted common dir), so a
 * bytes-only assertion would pass for the wrong reason. The store cases are therefore skipped on win32 and their
 * evidence comes from WSL/POSIX.
 *
 * ASSUMED NAMES: none beyond Ruling 84's `readOnly` / `admission-pending`, already assumed above. The snapshot covers
 * the whole temp root, `.git` included: path, size and sha256 per file, path per directory.
 */
const POSIX_ONLY_SKIP = process.platform === "win32"
  ? "the real model-role host store accepts only a POSIX '/'-rooted git common dir (model-role-host-store.mjs parent()); natively it answers MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE before touching disk, so a zero-bytes pin would pass for the wrong reason"
  : false;
const T8_SESSION_1 = { CODEX_SESSION_ID: "t8-session-1", CODEX_THREAD_ID: "t8-session-1" };
const T8_SESSION_2 = { CODEX_SESSION_ID: "t8-session-2", CODEX_THREAD_ID: "t8-session-2" };

function t8GitEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("GIT_")) env[key] = value;
  return { ...env, GIT_AUTHOR_NAME: "t8", GIT_AUTHOR_EMAIL: "t8@example.invalid",
    GIT_COMMITTER_NAME: "t8", GIT_COMMITTER_EMAIL: "t8@example.invalid" };
}
const t8Git = (cwd, args, input = undefined) => execFileSync("git", args,
  { cwd, encoding: "utf8", env: t8GitEnv(), input, stdio: ["pipe", "pipe", "pipe"] }).trim();

/** A real git repository under the real temp dir (absolute, realpath'd); one commit made by plumbing. */
function realRepo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mrb-readonly-t8-")));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  t8Git(root, ["init", "-q"]);
  t8Git(root, ["update-ref", "HEAD", t8Git(root, ["commit-tree", t8Git(root, ["mktree"], ""), "-m", "t8 fixture"])]);
  const commonDir = realpathSync(resolve(root, t8Git(root, ["rev-parse", "--git-common-dir"])));
  return { root, commonDir, storeDir: join(commonDir, "agent-pipeline", "run", "model-role-sessions") };
}

/** Every file and directory under `dir`: its path, and size + sha256 for a file. */
function snapshotTree(dir) {
  const entries = [];
  let bytes = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((l, r) => (l.name < r.name ? -1 : 1))) {
      const path = join(current, entry.name);
      const rel = relative(dir, path).split("\\").join("/");
      if (entry.isDirectory()) { entries.push(`${rel}/`); walk(path); continue; }
      const content = readFileSync(path);
      bytes += content.length;
      entries.push(`${rel} ${content.length}B sha256:${createHash("sha256").update(content).digest("hex")}`);
    }
  };
  walk(dir);
  return { entries, files: entries.filter((entry) => !entry.endsWith("/")).length, bytes };
}
const observeRepo = (repo) => ({ root: snapshotTree(repo.root),
  store: existsSync(repo.storeDir) ? snapshotTree(repo.storeDir) : null });

function assertNoWrites(before, after, label) {
  const changed = (left, right) => [...left.filter((entry) => !right.includes(entry)),
    ...right.filter((entry) => !left.includes(entry))];
  assert.deepEqual(changed(before.root.entries, after.root.entries), [],
    `${label}: the temp root changed (entries added, removed or rewritten)`);
  assert.equal(after.root.files, before.root.files, `${label}: the temp root gained files`);
  assert.equal(after.root.bytes, before.root.bytes, `${label}: the temp root gained bytes`);
  assert.equal(after.store === null, before.store === null, `${label}: the store directory appeared or vanished`);
  if (before.store !== null) {
    assert.deepEqual(after.store.entries, before.store.entries, `${label}: the store directory changed`);
    assert.equal(after.store.bytes, before.store.bytes, `${label}: the store directory gained bytes`);
  }
}

const t8NoSignedPolicy = () => ({ ok: false, code: "absent" });
const t8Observations = (extraModelIds = []) => async ({ routeSource: scoped }) => ({ ok: true,
  observations: scoped.configuredRoutes.map((route) => ({ runner: route.runner, role: route.role,
    effort: route.effort, ok: true, assurance: "installed-host-observed",
    availableModelIds: [route.selector.value, ...extraModelIds] })) });
const t8Ports = (extraModelIds = []) => ({ routeSource, readApprovedPolicy: t8NoSignedPolicy,
  collectObservations: t8Observations(extraModelIds) });

/** The preflight's readback call shape (`readOnly: true`); only the host-facing ports above are injected. */
const t8Readback = (repo, env, overrides = {}) => runModelRoleBootstrap(
  { rootDir: repo.root, runner: "codex", env, readOnly: true, ...t8Ports(), ...overrides });

/** Setup, NOT under test: a human-confirmed first session, written to the real store. */
async function t8AdmitSession1(repo) {
  const admitted = await runModelRoleBootstrap({ rootDir: repo.root, runner: "codex", env: T8_SESSION_1,
    ...t8Ports(), confirm: async () => true });
  assert.equal(admitted.code, "MODEL-ROLE-BOOTSTRAP-READY",
    `precondition: session-1 admitted into the real store (got ${admitted.status} / ${admitted.code})`);
  assert.deepEqual(readdirSync(repo.storeDir), ["t8-session-1.json"], "precondition: the store holds exactly session-1");
}

test("T8 (a): no prior state -- the readOnly readback leaves a real repository byte-identical and never creates the store", { skip: POSIX_ONLY_SKIP }, async (t) => {
  const repo = realRepo(t);
  assert.equal(existsSync(join(repo.commonDir, "agent-pipeline")), false, "precondition: no private state at all");
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_1);
  assert.equal(result.status, "confirmation-required",
    `precondition: the real path reached its mapping gate (got ${result.status} / ${result.code})`);
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assertNoWrites(before, observeRepo(repo), "T8 (a)");
  assert.equal(existsSync(join(repo.commonDir, "agent-pipeline")), false,
    "T8 (a): a readback must not even create the private state directory");
});

test("T8 (b1): the model-family ACTIVE branch (synthetic activation over the real runtime host) writes nothing", async (t) => {
  const repo = realRepo(t);
  const host = createModelFamilyRuntimeHost({ cwd: repo.root });
  const familyInvocationEntry = createModelFamilyInvocationEntry({ runtimeHost: { ...host,
    observeActivation: () => ({ ok: true, code: "MODEL-FAMILY-ACTIVE", status: "active", authoritySha256: "a".repeat(64) }) } });
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_1, { familyInvocationEntry });
  t.diagnostic(`T8 (b1) active-branch result: ok=${result.ok} status=${result.status} code=${result.code}`);
  assert.equal(result.ok, false, "precondition: unqualified native sources cannot complete a family projection");
  assert.equal(result.fallbackForbidden, true, "precondition: the family branch was taken");
  assert.match(String(result.code), /^MODEL-FAMILY-/, "precondition: refused by the family projection, not the legacy path");
  assertNoWrites(before, observeRepo(repo), "T8 (b1)");
});

test("T8 (b2): a real activation marker over the real runtime host -- activation read and controller construction write nothing", async (t) => {
  // With only a marker the real host does not report `active`: its readState answers uncertain, because no trusted
  // sources are wired (observed: MODEL-FAMILY-STATE-UNCERTAIN natively, MODEL-FAMILY-ACTIVATION-UNCERTAIN on WSL --
  // the host controller's own answer, not asserted here). (b1) pins the active projection (C1); this case pins the real
  // activation read plus the host controller's construction (C2) -- the part (b1) replaces with a synthetic answer.
  const repo = realRepo(t);
  const familyDir = join(repo.commonDir, "agent-pipeline", "model-family-host");
  mkdirSync(familyDir, { recursive: true });
  writeFileSync(join(familyDir, "activation.json"), JSON.stringify({ schema: "pipeline.model-family-host-activation.v1",
    activationId: "b".repeat(64), authoritySha256: "a".repeat(64), createdAt: "2026-10-09T00:00:00.000Z" }));
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_1);
  t.diagnostic(`T8 (b2) marker-backed result: ok=${result.ok} status=${result.status} code=${result.code}`);
  assert.equal(result.ok, false, "precondition: unqualified native sources cannot complete a family projection");
  assert.equal(result.fallbackForbidden, true, "precondition: the family branch was taken");
  assert.match(String(result.code), /^MODEL-FAMILY-/, "precondition: refused by the family side, not the legacy path");
  assertNoWrites(before, observeRepo(repo), "T8 (b2)");
});

test("T8 (c): a POPULATED store whose mapping changed -- confirmation-required, store byte-identical", { skip: POSIX_ONLY_SKIP }, async (t) => {
  const repo = realRepo(t);
  await t8AdmitSession1(repo);
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_2, t8Ports(["t8-extra-model"]));
  assert.equal(result.status, "confirmation-required",
    `precondition: a changed mapping needs a human (got ${result.status} / ${result.code})`);
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED");
  assert.equal(result.readback.acknowledgementRequired, true);
  assertNoWrites(before, observeRepo(repo), "T8 (c)");
});

test("T8 (d): an unchanged mapping reads admission-pending against the real store and writes nothing", { skip: POSIX_ONLY_SKIP }, async (t) => {
  const repo = realRepo(t);
  await t8AdmitSession1(repo);
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_2);
  assert.equal(result.status, "admission-pending", `got ${result.status} / ${result.code}: the real store was written or refused`);
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-ADMISSION-PENDING");
  assert.equal(result.ok, false);
  assertNoWrites(before, observeRepo(repo), "T8 (d)");
  assert.deepEqual(readdirSync(repo.storeDir), ["t8-session-1.json"], "T8 (d): no second admission file");
});

test("T8 (e): a recorded session reads REUSED against the real store and writes nothing", { skip: POSIX_ONLY_SKIP }, async (t) => {
  const repo = realRepo(t);
  await t8AdmitSession1(repo);
  const before = observeRepo(repo);
  const result = await t8Readback(repo, T8_SESSION_1);
  assert.equal(result.status, "ready", `got ${result.status} / ${result.code}`);
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-REUSED");
  assertNoWrites(before, observeRepo(repo), "T8 (e)");
});

test("T8 control: WITHOUT readOnly the same real path writes, so the snapshot would catch a write", { skip: POSIX_ONLY_SKIP }, async (t) => {
  const repo = realRepo(t);
  await t8AdmitSession1(repo);
  const before = observeRepo(repo);
  const admitted = await runModelRoleBootstrap({ rootDir: repo.root, runner: "codex", env: T8_SESSION_2, ...t8Ports() });
  assert.equal(admitted.code, "MODEL-ROLE-BOOTSTRAP-READY", `got ${admitted.status} / ${admitted.code}`);
  const after = observeRepo(repo);
  assert.equal(after.store.files, before.store.files + 1, "the admission is one new file in the store directory");
  assert.ok(after.store.bytes > before.store.bytes, "and it carries bytes");
  assert.throws(() => assertNoWrites(before, after, "control"), "the snapshot comparison must flag that write");
});
