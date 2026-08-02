// SPDX-License-Identifier: SUL-1.0
/**
 * Node preload for deterministic offline-conformance checks.
 *
 * It fails at the first attempted outbound primitive instead of trying to
 * emulate or silently filter network traffic.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

function blocked(api) {
  return () => {
    throw new Error(`NETWORK-LOCKDOWN: outbound network access via ${api} is forbidden during offline conformance`);
  };
}

function replace(target, property, api) {
  Object.defineProperty(target, property, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: blocked(api),
  });
}

replace(http, "request", "node:http.request");
replace(http, "get", "node:http.get");
replace(https, "request", "node:https.request");
replace(https, "get", "node:https.get");
replace(net, "connect", "node:net.connect");
replace(net, "createConnection", "node:net.createConnection");
replace(net.Socket.prototype, "connect", "node:net.Socket.prototype.connect");
replace(tls, "connect", "node:tls.connect");
replace(globalThis, "fetch", "globalThis.fetch");
