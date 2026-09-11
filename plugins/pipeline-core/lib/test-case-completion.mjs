// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { writeSync } from "node:fs";
import test from "node:test";

export const TEST_CASE_COMPLETION_SCHEMA = "pipeline.test-case-completion.v1";

const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;
const DISPOSITIONS = new Set(["pass", "fail", "skip", "todo"]);
const CONFIG_KEYS = Object.freeze(["caseIds", "fd", "maxBytes"]);
const REGISTRATION_KEYS = Object.freeze(["cases", "fd", "maxBytes"]);
const CASE_KEYS = new Set(["id", "mode", "name", "run"]);
const MODES = new Set(["run", "skip", "todo"]);
const MAX_CASES = 2_048;
const MAX_OUTPUT_BYTES = 1_048_576;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function validateChannel({ caseIds, fd, maxBytes }) {
  if (!Number.isSafeInteger(fd) || fd < 3 || fd > 1_024) fail("TCC-FD", "completion fd must be an explicitly inherited descriptor from 3 through 1024");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 512 || maxBytes > MAX_OUTPUT_BYTES) fail("TCC-MAX-BYTES", "completion maxBytes is outside the closed bound");
  if (!Array.isArray(caseIds) || caseIds.length < 1 || caseIds.length > MAX_CASES) fail("TCC-CASE-COUNT", "completion case set is empty or too large");
  for (const id of caseIds) if (typeof id !== "string" || !ID.test(id)) fail("TCC-CASE-ID", "completion case id is invalid");
  if (new Set(caseIds).size !== caseIds.length) fail("TCC-CASE-DUPLICATE", "completion case ids must be unique");
  for (let index = 1; index < caseIds.length; index += 1) {
    if (caseIds[index - 1] >= caseIds[index]) fail("TCC-CASE-ORDER", "completion case ids must be in stable ascending order");
  }
}

function line(record) {
  return `${JSON.stringify(record)}\n`;
}

export function writeTestCaseCompletionBytes(fd, bytes, writer = writeSync) {
  if (!Buffer.isBuffer(bytes) || typeof writer !== "function") fail("TCC-WRITE-CONTRACT", "completion writer contract is invalid");
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const written = writer(fd, bytes, offset, bytes.length - offset);
      if (!Number.isSafeInteger(written) || written < 1 || written > bytes.length - offset) {
        fail("TCC-FD-SHORT-WRITE", "completion descriptor made no valid forward progress");
      }
      offset += written;
    }
  } catch (error) {
    if (error?.code === "TCC-FD-SHORT-WRITE") throw error;
    const wrapped = new Error("completion descriptor is missing or unwritable", { cause: error });
    wrapped.code = "TCC-FD-WRITE";
    throw wrapped;
  }
  return offset;
}

function maximumTerminal(caseIds, caseSetSha256) {
  const countDigits = String(caseIds.length).length;
  const maximumCount = Number("9".repeat(countDigits));
  return {
    schema: TEST_CASE_COMPLETION_SCHEMA,
    event: "TERMINAL",
    declaredCount: caseIds.length,
    disposedCount: caseIds.length,
    caseIds,
    caseSetSha256,
    dispositionsSha256: "f".repeat(64),
    counts: { pass: maximumCount, fail: maximumCount, skip: maximumCount, todo: maximumCount },
  };
}

export function createTestCaseCompletionRecorder(configuration) {
  if (!exactKeys(configuration, CONFIG_KEYS)) fail("TCC-CONFIG", "completion recorder configuration is not closed");
  const { fd, maxBytes } = configuration;
  const caseIds = structuredClone(configuration.caseIds);
  validateChannel({ caseIds, fd, maxBytes });

  const caseSetSha256 = sha256(caseIds);
  const declared = {
    schema: TEST_CASE_COMPLETION_SCHEMA,
    event: "DECLARED",
    caseIds,
    caseCount: caseIds.length,
    caseSetSha256,
  };
  const maximumBytes = Buffer.byteLength(line(declared))
    + caseIds.reduce((sum, id, ordinal) => sum + Buffer.byteLength(line({
      schema: TEST_CASE_COMPLETION_SCHEMA,
      event: "DISPOSED",
      id,
      ordinal,
      disposition: "pass",
    })), 0)
    + Buffer.byteLength(line(maximumTerminal(caseIds, caseSetSha256)));
  if (maximumBytes > maxBytes) fail("TCC-OUTPUT-BOUND", "declared completion stream cannot fit within maxBytes");

  let emittedBytes = 0;
  const disposed = new Map();
  let terminal = false;
  function emit(record) {
    const output = Buffer.from(line(record), "utf8");
    if (emittedBytes + output.length > maxBytes) fail("TCC-OUTPUT-OVERFLOW", "completion stream exceeded its declared bound");
    emittedBytes += writeTestCaseCompletionBytes(fd, output);
  }
  emit(declared);

  function dispose(id, disposition) {
    const ordinal = caseIds.indexOf(id);
    if (ordinal === -1) fail("TCC-DISPOSE-UNKNOWN", "cannot dispose an undeclared completion case");
    if (disposed.has(id)) fail("TCC-DISPOSE-DUPLICATE", "completion case was disposed more than once");
    if (!DISPOSITIONS.has(disposition)) fail("TCC-DISPOSITION", "completion disposition is outside the closed enum");
    disposed.set(id, disposition);
    emit({ schema: TEST_CASE_COMPLETION_SCHEMA, event: "DISPOSED", id, ordinal, disposition });
    if (disposed.size !== caseIds.length) return;

    const ordered = caseIds.map((caseId) => ({ id: caseId, disposition: disposed.get(caseId) }));
    const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
    for (const entry of ordered) counts[entry.disposition] += 1;
    terminal = true;
    emit({
      schema: TEST_CASE_COMPLETION_SCHEMA,
      event: "TERMINAL",
      declaredCount: caseIds.length,
      disposedCount: disposed.size,
      caseIds,
      caseSetSha256,
      dispositionsSha256: sha256(ordered),
      counts,
    });
  }

  return Object.freeze({
    dispose,
    snapshot() {
      return Object.freeze({ declaredCount: caseIds.length, disposedCount: disposed.size, terminal, emittedBytes });
    },
  });
}

function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > MAX_CASES) fail("TCC-CASE-COUNT", "completion case set is empty or too large");
  for (const entry of cases) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some((key) => !CASE_KEYS.has(key))
      || !Object.hasOwn(entry, "id") || !Object.hasOwn(entry, "name") || !Object.hasOwn(entry, "run")) {
      fail("TCC-CASE-SHAPE", "completion case has an open or incomplete shape");
    }
    if (typeof entry.name !== "string" || entry.name.length < 1 || entry.name.length > 256 || typeof entry.run !== "function") fail("TCC-CASE-SHAPE", "completion case name or callback is invalid");
    if (entry.mode !== undefined && !MODES.has(entry.mode)) fail("TCC-CASE-MODE", "completion case mode is outside the closed enum");
  }
}

function observedContext(context, observe) {
  return new Proxy(context, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "skip" || property === "todo") {
        return (...args) => {
          observe(property, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function registerTestCaseCompletion(configuration) {
  if (!exactKeys(configuration, REGISTRATION_KEYS)) fail("TCC-CONFIG", "completion registration configuration is not closed");
  validateCases(configuration.cases);
  const caseIds = configuration.cases.map((entry) => entry.id);
  const recorder = createTestCaseCompletionRecorder({ fd: configuration.fd, maxBytes: configuration.maxBytes, caseIds });

  // Registration is deliberately synchronous. Callback execution may be async,
  // but every intended sibling is handed to node:test before this function returns.
  for (const entry of configuration.cases) {
    test(`${entry.id} ${entry.name}`, async (context) => {
      let disposition = entry.mode === "skip" ? "skip" : entry.mode === "todo" ? "todo" : "pass";
      let signalled = entry.mode === "todo" ? { kind: "todo", args: [] } : null;
      let conflictingSignal = false;
      const observe = (next, args) => {
        if (signalled !== null && signalled.kind !== next) {
          conflictingSignal = true;
          disposition = "fail";
          fail("TCC-CASE-SIGNAL", "case signalled both skip and todo");
        }
        signalled ??= { kind: next, args };
        disposition = next;
      };
      try {
        if (entry.mode === "skip") {
          context.skip();
          return;
        }
        await entry.run(observedContext(context, observe));
        if (signalled !== null) context[signalled.kind](...signalled.args);
      } catch (error) {
        if (entry.mode === "todo" && !conflictingSignal) {
          disposition = "todo";
          context.todo();
        } else {
          disposition = "fail";
        }
        throw error;
      } finally {
        recorder.dispose(entry.id, disposition);
      }
    });
  }
  return recorder;
}
