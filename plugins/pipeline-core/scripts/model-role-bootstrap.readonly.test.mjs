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
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
