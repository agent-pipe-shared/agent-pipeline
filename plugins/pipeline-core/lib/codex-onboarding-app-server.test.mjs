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

console.log(`${passed} Codex onboarding App-Server checks passed.`);
