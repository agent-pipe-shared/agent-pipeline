// SPDX-License-Identifier: SUL-1.0
/**
 * R4-T0 RED pins, cases 1-5: the typed per-runner, per-role route preflight
 * (AC-29 / R4-1, R4-2, R4-12). The module under test does not exist yet; every
 * case imports it dynamically so the file loads and each case reports red on
 * its own. Fixtures only: no real registry, home directory or machine plane.
 *
 * PO decision BD: R4-12 is REPORT-ONLY in 0.7.0. A role with no host
 * measurement is reported as typed `unavailable`; it is never an error and
 * never a refusal (the overall result stays `ok: true`).
 *
 * Contract spelled by the design note: closed schema
 * `pipeline.role-route-preflight.v1`; states `native | fallback-self-dispatch
 * | unavailable`; codes `RRP-*`; source failures pass through as the existing
 * `MODEL-ROLE-*` codes and the preflight fails closed.
 *
 * ASSUMPTIONS the design note leaves open (the first slice that makes these
 * green may rename them, but must then change this header and the pins
 * together; they are NOT dictated by the note):
 *  - module `./role-route-preflight.mjs`, export `evaluateRoleRoutePreflight`
 *    taking `{ source, runner, hostObservations }`; `source` is the OUTPUT
 *    shape of `registeredFunctionalTaskRoutes` (taskRoutes / unavailableTaskRoutes
 *    / configuredRoutes), routes are matched by `taskRoute`, never by `role`.
 *  - result: `{ schema, ok, runner, roles }`; each role entry is exactly
 *    `{ state, reasonCode, evidence }`; `evidence` is the supplied host
 *    observation digest, and the empty string when nothing was observed.
 *  - role names: advisor, critic, goldfish.implement, goldfish.mechanic,
 *    goldfish.deep, readiness, plan-verifier. Registry mapping: advisor ->
 *    duty.advisory (+ claude duty.advisory.fallback), critic ->
 *    duty.critic_normal, goldfish.* -> duty.implement/mechanic/deep,
 *    readiness -> duty.readiness; plan-verifier has no registry duty.
 *  - host observation per role: `{ kind: "native" | "fallback-self-dispatch",
 *    evidenceSha256, hookRecordedStart, hookRecordedTerminal }`.
 *  - fallback-self-dispatch is pinned for the Claude advisor only (the one
 *    runner with an explicit fallback task route in the registry).
 *  - source failures: `{ schema, ok: false, code }` with no `roles` member.
 */
import assert from "node:assert/strict";
import { chdir, cwd } from "node:process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const RUNNERS = ["claude", "codex", "antigravity"];
const ROLES = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];
const REGISTRY_ROLES = ROLES.filter((role) => role !== "plan-verifier");
const DUTY = { advisor: "duty.advisory", critic: "duty.critic_normal", "goldfish.implement": "duty.implement",
  "goldfish.mechanic": "duty.mechanic", "goldfish.deep": "duty.deep", readiness: "duty.readiness" };
const STATES = ["native", "fallback-self-dispatch", "unavailable"];
const digest = (char) => char.repeat(64);

async function preflight(input) {
  const mod = await import("./role-route-preflight.mjs");
  assert.equal(typeof mod.evaluateRoleRoutePreflight, "function", "role-route-preflight.mjs must export evaluateRoleRoutePreflight");
  return mod.evaluateRoleRoutePreflight(input);
}

function makeSource({ unavailable = [] } = {}) {
  const selector = { kind: "alias", value: "fixture-model" };
  const taskRoutes = [];
  for (const runner of RUNNERS) {
    for (const [role, taskRoute] of Object.entries(DUTY)) {
      const down = unavailable.some(([r, name]) => r === runner && name === role);
      taskRoutes.push({ taskRoute, runner, role: "worker", effort: "high", state: down ? "unavailable" : "default", selector });
    }
  }
  taskRoutes.push({ taskRoute: "duty.advisory.fallback", runner: "claude", role: "frontier", effort: "max", state: "default", selector });
  return {
    ok: true, code: "MODEL-ROLE-ROUTE-SOURCE-REGISTERED", taskRoutes,
    unavailableTaskRoutes: taskRoutes.filter((route) => route.state === "unavailable")
      .map(({ taskRoute, runner, role, effort }) => ({ taskRoute, runner, role, effort })),
    configuredRoutes: taskRoutes.filter((route) => route.state !== "unavailable")
      .map(({ runner, role, effort, selector: s }) => ({ runner, role, effort, selector: s })),
  };
}

const observed = (kind = "native", extra = {}) => ({ kind, evidenceSha256: digest("a"), hookRecordedStart: true, hookRecordedTerminal: true, ...extra });
const observeAll = () => Object.fromEntries(ROLES.map((role) => [role, observed()]));

function assertClosedResult(result, runner) {
  assert.deepEqual(Object.keys(result).sort(), ["ok", "roles", "runner", "schema"]);
  assert.equal(result.schema, "pipeline.role-route-preflight.v1");
  assert.equal(result.ok, true);
  assert.equal(result.runner, runner);
  assert.deepEqual(Object.keys(result.roles).sort(), [...ROLES].sort());
  for (const role of ROLES) {
    const entry = result.roles[role];
    assert.deepEqual(Object.keys(entry).sort(), ["evidence", "reasonCode", "state"], `${role} entry is closed`);
    assert.ok(STATES.includes(entry.state), `${role} state ${entry.state} is one of the closed set`);
    assert.match(entry.reasonCode, /^RRP-[A-Z][A-Z-]*$/u, `${role} reasonCode`);
    assert.equal(typeof entry.evidence, "string");
  }
}

for (const runner of RUNNERS) {
  test(`R4-T0-1 ${runner}: every role with a host observation is native under the closed schema`, async () => {
    const result = await preflight({ source: makeSource(), runner, hostObservations: observeAll() });
    assertClosedResult(result, runner);
    for (const role of ROLES) {
      assert.deepEqual(result.roles[role], { state: "native", reasonCode: "RRP-NATIVE-OBSERVED", evidence: digest("a") }, role);
    }
  });

  test(`R4-T0-1 ${runner}: no host observation reports every registered role unavailable (typed, not an error)`, async () => {
    const result = await preflight({ source: makeSource(), runner, hostObservations: {} });
    assertClosedResult(result, runner);
    for (const role of REGISTRY_ROLES) {
      assert.deepEqual(result.roles[role], { state: "unavailable", reasonCode: "RRP-NO-HOST-OBSERVATION", evidence: "" }, role);
    }
  });
}

test("R4-T0-1 claude: an observed consult fallback of the advisor is fallback-self-dispatch", async () => {
  const result = await preflight({ source: makeSource(), runner: "claude",
    hostObservations: { advisor: observed("fallback-self-dispatch", { evidenceSha256: digest("b") }) } });
  assertClosedResult(result, "claude");
  assert.deepEqual(result.roles.advisor,
    { state: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-ADVISOR-CONSULT", evidence: digest("b") });
});

for (const runner of RUNNERS) {
  test(`R4-T0-2 ${runner}: fallback-self-dispatch for any non-advisor role is unavailable with RRP-FALLBACK-ROLE-NOT-ALLOWED`, async () => {
    for (const role of ROLES.filter((name) => name !== "advisor")) {
      const result = await preflight({ source: makeSource(), runner,
        hostObservations: { [role]: observed("fallback-self-dispatch") } });
      assertClosedResult(result, runner);
      assert.equal(result.roles[role].state, "unavailable", role);
      assert.equal(result.roles[role].reasonCode, "RRP-FALLBACK-ROLE-NOT-ALLOWED", role);
    }
  });
}

test("R4-T0-3 a registry cell in state unavailable reports RRP-ROUTE-CELL-UNAVAILABLE even when a host observation exists", async () => {
  const source = makeSource({ unavailable: [["codex", "critic"], ["antigravity", "readiness"]] });
  const codex = await preflight({ source, runner: "codex", hostObservations: observeAll() });
  assertClosedResult(codex, "codex");
  assert.equal(codex.roles.critic.state, "unavailable");
  assert.equal(codex.roles.critic.reasonCode, "RRP-ROUTE-CELL-UNAVAILABLE");
  assert.equal(codex.roles.advisor.state, "native", "other roles of the same runner are unaffected");
  const agy = await preflight({ source, runner: "antigravity", hostObservations: observeAll() });
  assert.equal(agy.roles.readiness.reasonCode, "RRP-ROUTE-CELL-UNAVAILABLE");
});

test("R4-T0-3 a broken source passes its MODEL-ROLE-* code through and fails closed", async () => {
  const incomplete = { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE", missingTaskRoutes: ["duty.deep"] };
  const broken = await preflight({ source: incomplete, runner: "claude", hostObservations: observeAll() });
  assert.equal(broken.schema, "pipeline.role-route-preflight.v1");
  assert.equal(broken.ok, false);
  assert.equal(broken.code, "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE");
  assert.equal(Object.hasOwn(broken, "roles"), false, "a failed source must not carry a role verdict");
  const wrongRunner = await preflight({ source: makeSource(), runner: "not-a-runner", hostObservations: {} });
  assert.equal(wrongRunner.ok, false);
  assert.equal(wrongRunner.code, "MODEL-ROLE-RUNNER-SOURCE-INVALID");
  assert.equal(Object.hasOwn(wrongRunner, "roles"), false);
});

test("R4-T0-4 plan-verifier without a host measurement is unavailable with RRP-ROLE-NOT-REGISTERED (report-only, ok stays true)", async () => {
  for (const runner of RUNNERS) {
    const result = await preflight({ source: makeSource(), runner, hostObservations: {} });
    assertClosedResult(result, runner);
    assert.deepEqual(result.roles["plan-verifier"], { state: "unavailable", reasonCode: "RRP-ROLE-NOT-REGISTERED", evidence: "" });
  }
});

test("R4-T0-4 plan-verifier becomes native only from a host measurement", async () => {
  const result = await preflight({ source: makeSource(), runner: "claude",
    hostObservations: { "plan-verifier": observed("native", { evidenceSha256: digest("c") }) } });
  assert.deepEqual(result.roles["plan-verifier"], { state: "native", reasonCode: "RRP-NATIVE-OBSERVED", evidence: digest("c") });
});

for (const runner of ["claude", "antigravity"]) {
  test(`R4-T0-4 ${runner}: a Critic without BOTH a hook-recorded start and a hook-recorded terminal is unavailable (report-only)`, async () => {
    for (const flags of [
      { hookRecordedStart: false, hookRecordedTerminal: false },
      { hookRecordedStart: true, hookRecordedTerminal: false },
      { hookRecordedStart: false, hookRecordedTerminal: true },
    ]) {
      const result = await preflight({ source: makeSource(), runner, hostObservations: { critic: observed("native", flags) } });
      assertClosedResult(result, runner);
      assert.equal(result.ok, true, "report-only: unavailable is a verdict, not a failure");
      assert.equal(result.roles.critic.state, "unavailable", JSON.stringify(flags));
      assert.equal(result.roles.critic.reasonCode, "RRP-NO-HOST-OBSERVATION", JSON.stringify(flags));
    }
    const full = await preflight({ source: makeSource(), runner, hostObservations: { critic: observed() } });
    assert.equal(full.roles.critic.state, "native");
  });
}

function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) { out.push(`d ${path}`); walk(path); }
      else out.push(`f ${path} ${info.size} ${info.mtimeMs} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
    }
  };
  walk(root);
  return out;
}

test("R4-T0-5 the preflight is read-only: a temp repository tree and its .git bytes are identical before and after", async () => {
  const root = mkdtempSync(join(tmpdir(), "role-route-preflight-"));
  const origin = cwd();
  try {
    mkdirSync(join(root, ".git", "objects"), { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/fixture\n");
    writeFileSync(join(root, "tracked.txt"), "tracked\n");
    const before = snapshot(root);
    chdir(root);
    try {
      const result = await preflight({ source: makeSource(), runner: "claude", hostObservations: observeAll() });
      assertClosedResult(result, "claude");
    } finally { chdir(origin); }
    assert.deepEqual(snapshot(root), before, "no file created, changed or touched");
  } finally {
    chdir(origin);
    rmSync(root, { recursive: true, force: true });
  }
});

test("R4-T0-5 the preflight module imports no write or process-spawn primitive", () => {
  const text = readFileSync(new URL("./role-route-preflight.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(text,
    /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|truncate|truncateSync|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\b/u);
});
