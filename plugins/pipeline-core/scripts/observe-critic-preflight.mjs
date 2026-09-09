#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Explicit local collection controller for the Critic dispatch preflight.
 *
 * The sibling preflight CLI deliberately remains read-only.  This command is
 * the only route which installs its synchronous observation callback.
 */
import { randomUUID } from "node:crypto";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { createInterruptionStore } from "../lib/interruption-receipt-store.mjs";
import {
  captureCriticPreflightSource,
  qualifyCriticPreflightObservation,
  resolveCriticPreflightContext,
} from "../lib/critic-preflight-observer.mjs";
import {
  CRITIC_DISPATCH_PREFLIGHT_SCHEMA,
  CriticDispatchPreflightError,
  parseCriticDispatchPreflightArgs,
  preflightCriticDispatch,
} from "./critic-dispatch-preflight.mjs";

const CONTROLLER_SCHEMA = "pipeline.observed-critic-preflight-result.v1";
const WRITE_SCHEMA = "pipeline.interruption-store-write-result.v1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;

export const productionPorts = Object.freeze({
  parse: parseCriticDispatchPreflightArgs,
  producer: preflightCriticDispatch,
  capture: captureCriticPreflightSource,
  qualify: qualifyCriticPreflightObservation,
  resolveContext: resolveCriticPreflightContext,
  storeFactory: createInterruptionStore,
  clock: () => ({ value: new Date().toISOString(), status: "measured" }),
  randomId: () => randomUUID(),
});

function collectionFailure(code = "C1S-INCOMPLETE") {
  return { schema: WRITE_SCHEMA, status: "unavailable", code, coreCode: null, eventId: null, lineageId: null, entrySha256: null };
}
function controllerFailure(code = "C1S-SHAPE") {
  return { schema: CONTROLLER_SCHEMA, status: "rejected", code };
}
function producerError(error) {
  const code = error instanceof CriticDispatchPreflightError ? error.code : "CDP-UNEXPECTED";
  return `${JSON.stringify({ schema: CRITIC_DISPATCH_PREFLIGHT_SCHEMA, status: "rejected", code })}\n`;
}
function measuredTime(ports) {
  try { return ports.clock(); } catch { return undefined; }
}
function usableRunInput(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  let fields;
  try {
    fields = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(fields).length !== 3 || !["root", "operationId", "argv"].every((key) => Object.hasOwn(fields, key)
      && Object.hasOwn(fields[key], "value") && fields[key].enumerable)) return null;
  } catch { return null; }
  const { root, operationId, argv } = Object.fromEntries(Object.entries(fields).map(([key, descriptor]) => [key, descriptor.value]));
  return typeof root === "string" && root.length > 0 && typeof operationId === "string" && ID.test(operationId)
    && Array.isArray(argv) && argv.every((part) => typeof part === "string") && !argv.includes("--root") ? { root, operationId, argv } : null;
}
function sameOperation(observation, operation) {
  return observation.scope.featureId === operation.scope.featureId
    && observation.ownerBinding.specSha256 === operation.specSha256;
}

/**
 * Run the existing producer once and return its exact direct-CLI protocol
 * bytes. Collection state is deliberately out-of-band from that protocol.
 */
export function runObservedCriticPreflight(input = {}, ports = productionPorts) {
  const parsedInput = usableRunInput(input);
  if (!parsedInput) {
    return { exitCode: 2, stdout: "", stderr: "", collection: collectionFailure("C1S-SHAPE") };
  }
  const { root, operationId, argv } = parsedInput;
  let request;
  try { request = ports.parse(["--root", root, ...argv]); }
  catch (error) {
    return { exitCode: 1, stdout: "", stderr: producerError(error), collection: collectionFailure("C1S-INCOMPLETE") };
  }

  let store, operationResult;
  try {
    store = ports.storeFactory({ root });
    operationResult = store.readOperation({ operationId });
  } catch { operationResult = null; }

  let captured = null;
  const observer = (source) => {
    // The producer ignores this callback's return and catches any throw. Keep
    // this body synchronous and never expose a Promise to it.
    if (captured !== null) return;
    try { captured = ports.capture(source, measuredTime(ports)); }
    catch { captured = { ok: false, code: "C1O-SOURCE", source: null, observedAt: null }; }
  };
  let stdout = "", stderr = "", exitCode;
  try {
    const result = ports.producer(request, observer);
    stdout = `${JSON.stringify(result)}\n`;
    exitCode = 0;
  } catch (error) {
    stderr = producerError(error);
    exitCode = 1;
  }

  let collection = collectionFailure();
  if (operationResult?.ok === true && captured?.ok === true && captured.source !== null && captured.observedAt !== null) {
    let qualified;
    try { qualified = ports.qualify({ source: captured.source, observedAt: captured.observedAt, root, specPath: request.specPath }); }
    catch { qualified = { ok: false, observation: null }; }
    if (qualified?.ok === true && qualified.observation !== null && sameOperation(qualified.observation, operationResult.operation)) {
      if (captured.source.outcome === "rejected") {
        let eventId = null;
        try { eventId = ports.randomId(); } catch {}
        if (typeof eventId === "string" && ID.test(eventId)) {
          try { collection = store.recordPreflight({ handle: operationResult.operation.handle, eventId, observation: qualified.observation }); }
          catch { collection = collectionFailure("C1S-IO"); }
        }
      } else {
        // Completion is intentionally unavailable in this first store slice;
        // retain its closed result rather than claiming receipt or resolution.
        try { collection = store.recordCompletion({ handle: operationResult.operation.handle, controlId: "unavailable", source: captured.source, observedAt: captured.observedAt, context: qualified.observation }); }
        catch { collection = collectionFailure("C1S-IO"); }
      }
    }
  }
  return { exitCode, stdout, stderr, collection };
}

function parseCommand(argv) {
  const [command, ...rest] = argv;
  if (!["create", "run", "status"].includes(command)) return null;
  if (command === "run") {
    const separator = rest.indexOf("--");
    if (separator < 0 || rest.indexOf("--", separator + 1) >= 0) return null;
    const wrapper = rest.slice(0, separator), suffix = rest.slice(separator + 1);
    if (wrapper.length !== 4 || wrapper[0] !== "--root" || wrapper[2] !== "--operation" || !usableRunInput({ root: wrapper[1], operationId: wrapper[3], argv: suffix })) return null;
    return { command, root: wrapper[1], operationId: wrapper[3], argv: suffix };
  }
  if (rest.length !== 4 || rest[0] !== "--root") return null;
  const expected = command === "create" ? "--spec" : "--operation";
  if (rest[2] !== expected || typeof rest[1] !== "string" || rest[1].length === 0 || typeof rest[3] !== "string" || rest[3].length === 0) return null;
  return command === "create" ? { command, root: rest[1], specPath: rest[3] } : { command, root: rest[1], operationId: rest[3] };
}
function writeResult(value, exitCode) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}
function runCli(argv) {
  const command = parseCommand(argv);
  if (!command) {
    process.stderr.write(`${JSON.stringify(controllerFailure())}\n`);
    process.exitCode = 2;
    return;
  }
  if (command.command === "run") {
    const result = runObservedCriticPreflight({ root: command.root, operationId: command.operationId, argv: command.argv });
    process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.exitCode;
    return;
  }
  if (command.command === "create") {
    let context;
    try { context = productionPorts.resolveContext({ root: command.root, specPath: command.specPath }); } catch { context = { ok: false }; }
    const result = context?.ok ? productionPorts.storeFactory({ root: command.root }).createOperation({ context: context.context })
      : { schema: "pipeline.interruption-store-create-result.v1", ok: false, code: "C1S-BINDING", handle: null };
    writeResult(result, result.ok ? 0 : 2);
    return;
  }
  let result;
  try { result = productionPorts.storeFactory({ root: command.root }).readOperation({ operationId: command.operationId }); }
  catch { result = { schema: "pipeline.interruption-store-operation-result.v1", ok: false, code: "C1S-IO", operation: null }; }
  writeResult(result, result.ok ? 0 : 2);
}

if (isDirectInvocation(import.meta.url)) runCli(process.argv.slice(2));
