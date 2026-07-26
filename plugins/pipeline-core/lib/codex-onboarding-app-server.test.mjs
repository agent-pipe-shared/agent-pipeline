// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";

import {
  appServerNextAction,
  mapCodexAppServerObservation,
  observeOnboardingAppServer,
} from "./codex-onboarding-app-server.mjs";
import {
  CODEX_APP_SERVER_DOCTOR_SCHEMA,
  doctorCodexAppServer,
  run as runHealth,
} from "../scripts/codex-app-server-health.mjs";

const HEALTH_SCHEMA = "pipeline.codex-app-server-health.v1";
const HEALTH_SCRIPT = "/plugin/codex-app-server-health.mjs";
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const health = (code, detail = null, status = "unavailable") => ({
  schema: HEALTH_SCHEMA,
  status,
  code,
  phase: "observe",
  daemon: null,
  recovery: "not-attempted",
  operatorAction: null,
  detail,
});

check("onboarding does not call App Server and returns the exact closed component", () => {
  let calls = 0;
  const result = observeOnboardingAppServer({
    intent: "onboarding",
    observe() {
      calls += 1;
      throw new Error("must not be called");
    },
  });
  assert.deepEqual(result, { required: false, status: "not-requested", code: null });
  assert.equal(calls, 0);
});

for (const intent of ["bootstrap", "session", "dispatch"]) {
  check(`${intent} requires exactly one health observation and never launches a model/thread`, () => {
    const calls = [];
    const result = observeOnboardingAppServer({
      intent,
      observe(options) {
        calls.push(options);
        return health("CAS-READY", null, "ready");
      },
    });
    assert.deepEqual(result, { required: true, status: "running", code: "CAS-READY" });
    assert.deepEqual(calls, [{}]);
  });
}

for (const detail of ["EPERM", "EACCES", "EROFS"]) {
  check(`execution detail ${detail} maps to execution-denied`, () => {
    assert.deepEqual(mapCodexAppServerObservation(
      health("CAS-EXECUTION-UNAVAILABLE", detail),
      { required: true },
    ), {
      required: true,
      status: "execution-denied",
      code: "CAS-EXECUTION-UNAVAILABLE",
    });
  });
}

for (const detail of [null, "EIO", "ETIMEDOUT"]) {
  check(`execution detail ${detail ?? "null"} maps to unavailable`, () => {
    assert.deepEqual(mapCodexAppServerObservation(
      health("CAS-EXECUTION-UNAVAILABLE", detail),
      { required: true },
    ), {
      required: true,
      status: "unavailable",
      code: "CAS-EXECUTION-UNAVAILABLE",
    });
  });
}

for (const [code, expected] of [
  ["CAS-READY", "running"],
  ["CAS-DAEMON-UNREACHABLE", "not-running"],
  ["CAS-DAEMON-INVALID-OBSERVATION", "unavailable"],
  ["CAS-DAEMON-VERSION-DRIFT", "unavailable"],
  ["CAS-DAEMON-RECOVERY-FAILED", "unavailable"],
  ["CAS-CODEX-UNAVAILABLE", "unavailable"],
  ["CAS-FUTURE-UNKNOWN", "unavailable"],
]) {
  check(`${code} maps to ${expected}`, () => {
    assert.deepEqual(mapCodexAppServerObservation(
      health(code, null, code === "CAS-READY" ? "ready" : "unavailable"),
      { required: true },
    ), {
      required: true,
      status: expected,
      code,
    });
  });
}

check("malformed observation fails closed with a sanitized CAS code", () => {
  assert.deepEqual(mapCodexAppServerObservation({}, { required: true }), {
    required: true,
    status: "unavailable",
    code: "CAS-UNKNOWN",
  });
});

check("invalid intent is rejected before observation", () => {
  let called = false;
  assert.throws(() => observeOnboardingAppServer({
    intent: "generic",
    observe() {
      called = true;
    },
  }), (error) => error?.code === "COAS-INTENT");
  assert.equal(called, false);
});

check("daemon-unreachable exposes the exact bounded recover action", () => {
  assert.deepEqual(appServerNextAction({
    required: true,
    status: "not-running",
    code: "CAS-DAEMON-UNREACHABLE",
  }, { healthScript: HEALTH_SCRIPT }), {
    kind: "command",
    executable: "node",
    argv: [HEALTH_SCRIPT, "--recover"],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: HEALTH_SCHEMA,
      statuses: ["ready", "unavailable", "stale"],
    },
  });
});

for (const code of ["CAS-DAEMON-INVALID-OBSERVATION", "CAS-DAEMON-VERSION-DRIFT"]) {
  check(`${code} exposes recover`, () => {
    assert.deepEqual(appServerNextAction({
      required: true,
      status: "unavailable",
      code,
    }, { healthScript: HEALTH_SCRIPT }).argv, [HEALTH_SCRIPT, "--recover"]);
  });
}

for (const code of ["CAS-CODEX-UNAVAILABLE", "CAS-DAEMON-RECOVERY-FAILED"]) {
  check(`${code} exposes the exact doctor action`, () => {
    assert.deepEqual(appServerNextAction({
      required: true,
      status: "unavailable",
      code,
    }, { healthScript: HEALTH_SCRIPT }), {
      kind: "command",
      executable: "node",
      argv: [HEALTH_SCRIPT, "--doctor"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.codex-app-server-doctor.v1",
        statuses: ["completed", "failed"],
      },
    });
  });
}

for (const component of [
  { required: false, status: "not-requested", code: null },
  { required: true, status: "running", code: "CAS-READY" },
  { required: true, status: "execution-denied", code: "CAS-EXECUTION-UNAVAILABLE" },
  { required: true, status: "unavailable", code: "CAS-EXECUTION-UNAVAILABLE" },
  { required: true, status: "unavailable", code: "CAS-FUTURE-UNKNOWN" },
]) {
  check(`${component.status}/${component.code ?? "null"} has no invented action`, () => {
    assert.equal(appServerNextAction(component, { healthScript: HEALTH_SCRIPT }), null);
  });
}

check("incoherent component cannot manufacture a recovery action", () => {
  assert.throws(() => appServerNextAction({
    required: true,
    status: "running",
    code: "CAS-DAEMON-UNREACHABLE",
  }, { healthScript: HEALTH_SCRIPT }), (error) => error?.code === "COAS-COMPONENT");
});

check("doctor returns a closed completed diagnostic and never readiness", () => {
  const calls = [];
  const result = doctorCodexAppServer({
    spawn(_bin, argv) {
      calls.push(argv);
      return { status: 0, stdout: "diagnostic text", stderr: "" };
    },
  });
  assert.deepEqual(calls, [["doctor"]]);
  assert.equal(result.schema, CODEX_APP_SERVER_DOCTOR_SCHEMA);
  assert.equal(result.status, "completed");
  assert.equal(result.code, "CAS-DOCTOR-COMPLETED");
  assert.equal(Object.hasOwn(result, "ready"), false);
  assert.equal(JSON.stringify(result).includes("diagnostic text"), false);
});

check("doctor failure is sanitized and never readiness", () => {
  const result = doctorCodexAppServer({
    spawn() {
      return { status: 2, stdout: "token", stderr: "private raw failure" };
    },
  });
  assert.deepEqual(result, {
    schema: "pipeline.codex-app-server-doctor.v1",
    status: "failed",
    code: "CAS-DOCTOR-FAILED",
    detail: "exit-2",
  });
});

check("health CLI exit mapping is exact for doctor, observe, and usage", () => {
  const outputs = [];
  const completed = runHealth(["--doctor"], {
    spawn: () => ({ status: 0, stdout: "", stderr: "" }),
    write: (text) => outputs.push(text),
    writeError: (text) => outputs.push(text),
  });
  assert.equal(completed, 0);
  assert.equal(JSON.parse(outputs.shift()).status, "completed");

  const failed = runHealth(["--doctor"], {
    spawn: () => ({ status: 3, stdout: "", stderr: "raw" }),
    write: (text) => outputs.push(text),
    writeError: (text) => outputs.push(text),
  });
  assert.equal(failed, 2);
  assert.equal(JSON.parse(outputs.shift()).status, "failed");

  const readyDaemon = {
    status: "running",
    backend: "pid",
    managedCodexPath: "/opt/codex",
    managedCodexVersion: "1",
    socketPath: "/tmp/codex.sock",
    cliVersion: "1",
    appServerVersion: "1",
  };
  assert.equal(runHealth([], {
    spawn: () => ({ status: 0, stdout: JSON.stringify(readyDaemon), stderr: "" }),
    write: (text) => outputs.push(text),
    writeError: (text) => outputs.push(text),
  }), 0);
  assert.equal(JSON.parse(outputs.shift()).code, "CAS-READY");

  assert.equal(runHealth([], {
    spawn: () => ({ status: 1, stdout: "", stderr: "socket absent" }),
    write: (text) => outputs.push(text),
    writeError: (text) => outputs.push(text),
  }), 2);
  assert.equal(JSON.parse(outputs.shift()).code, "CAS-DAEMON-UNREACHABLE");

  assert.equal(runHealth(["--unknown"], {
    write: (text) => outputs.push(text),
    writeError: (text) => outputs.push(text),
  }), 64);
  assert.match(outputs.shift(), /Usage/u);
});

// AC-3: a runner without any App-Server concept is not-applicable, never
// observed, and never blocking.
for (const intent of ["bootstrap", "session", "dispatch"]) {
  check(`claude ${intent} returns not-applicable without ever observing the daemon`, () => {
    let calls = 0;
    const result = observeOnboardingAppServer({
      intent,
      runner: "claude",
      observe() {
        calls += 1;
        throw new Error("a runner without an App Server must not observe it");
      },
    });
    assert.deepEqual(result, { required: false, status: "not-applicable", code: null });
    assert.equal(calls, 0);
  });
}

check("claude onboarding is not-applicable, not merely not-requested", () => {
  const result = observeOnboardingAppServer({
    intent: "onboarding",
    runner: "claude",
    observe() { throw new Error("must not be called"); },
  });
  assert.deepEqual(result, { required: false, status: "not-applicable", code: null });
});

check("an invalid intent is still rejected before the runner short-circuit", () => {
  assert.throws(() => observeOnboardingAppServer({
    intent: "generic",
    runner: "claude",
    observe() { throw new Error("must not be called"); },
  }), (error) => error?.code === "COAS-INTENT");
});

check("not-applicable is a valid component that manufactures no action", () => {
  assert.equal(appServerNextAction({
    required: false,
    status: "not-applicable",
    code: null,
  }, { healthScript: HEALTH_SCRIPT }), null);
});

check("a not-applicable component still cannot carry a CAS code", () => {
  assert.throws(() => appServerNextAction({
    required: false,
    status: "not-applicable",
    code: "CAS-READY",
  }, { healthScript: HEALTH_SCRIPT }), (error) => error?.code === "COAS-COMPONENT");
});

// AC-4: the Codex path is byte-identical to the pre-change behavior across
// every existing status branch, whether the runner is passed or defaulted.
const CODEX_BRANCHES = [
  [health("CAS-READY", null, "ready"), { required: true, status: "running", code: "CAS-READY" }],
  [health("CAS-EXECUTION-UNAVAILABLE", "EPERM"), { required: true, status: "execution-denied", code: "CAS-EXECUTION-UNAVAILABLE" }],
  [health("CAS-EXECUTION-UNAVAILABLE", "EIO"), { required: true, status: "unavailable", code: "CAS-EXECUTION-UNAVAILABLE" }],
  [health("CAS-DAEMON-UNREACHABLE"), { required: true, status: "not-running", code: "CAS-DAEMON-UNREACHABLE" }],
  [health("CAS-DAEMON-VERSION-DRIFT"), { required: true, status: "unavailable", code: "CAS-DAEMON-VERSION-DRIFT" }],
  [{}, { required: true, status: "unavailable", code: "CAS-UNKNOWN" }],
];
for (const intent of ["bootstrap", "session", "dispatch"]) {
  for (const [observation, expected] of CODEX_BRANCHES) {
    check(`codex ${intent} keeps ${expected.status}/${expected.code} with and without an explicit runner`, () => {
      const observedCalls = [];
      const explicit = observeOnboardingAppServer({
        intent,
        runner: "codex",
        observe(options) { observedCalls.push(options); return observation; },
      });
      const defaulted = observeOnboardingAppServer({
        intent,
        observe(options) { observedCalls.push(options); return observation; },
      });
      assert.deepEqual(explicit, expected);
      assert.deepEqual(defaulted, expected);
      assert.deepEqual(observedCalls, [{}, {}]);
    });
  }
  check(`codex ${intent} keeps failing closed when the observation throws`, () => {
    assert.deepEqual(observeOnboardingAppServer({
      intent,
      runner: "codex",
      observe() { throw new Error("unreachable"); },
    }), { required: true, status: "unavailable", code: "CAS-UNKNOWN" });
  });
}

// The lifecycle blocks on `appServer.required === true && status !== "running"`
// and then demands the component's recovery action. A not-applicable component
// satisfies neither half, so it can never produce an app-server-* status.
check("a not-applicable component cannot satisfy the lifecycle blocking guard", () => {
  for (const intent of ["bootstrap", "session", "dispatch"]) {
    const observed = observeOnboardingAppServer({
      intent,
      runner: "claude",
      observe() { throw new Error("must not be called"); },
    });
    assert.equal(observed.required === true && observed.status !== "running", false, intent);
    assert.equal(appServerNextAction(observed, { healthScript: HEALTH_SCRIPT }), null, intent);
  }
});

check("codex onboarding keeps the not-requested component, not not-applicable", () => {
  assert.deepEqual(observeOnboardingAppServer({
    intent: "onboarding",
    runner: "codex",
    observe() { throw new Error("must not be called"); },
  }), { required: false, status: "not-requested", code: null });
});

console.log(`${passed} Codex onboarding App-Server checks passed.`);
