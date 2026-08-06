// SPDX-License-Identifier: SUL-1.0
/**
 * The reviewed registry of extension namespaces.
 *
 * Runner-specific detail is only ever retained under one of these keys. The
 * registry is a reviewed repository artifact, so an unregistered namespace is a
 * provider injection attempt rather than an unrecognised feature: consumers
 * reject the record instead of storing the unknown namespace.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const EXTENSION_NAMESPACE_KEY = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u;
const REGISTRY_SCHEMA = "pipeline.control-execution-extension-namespaces.v1";

function load() {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../config/control-execution-extension-namespaces.json", import.meta.url)), "utf8"));
  const keys = registry !== null && typeof registry === "object" && !Array.isArray(registry) ? Object.keys(registry) : [];
  if (keys.length !== 2 || !keys.includes("schema") || !keys.includes("namespaces") || registry.schema !== REGISTRY_SCHEMA
    || !Array.isArray(registry.namespaces) || registry.namespaces.length < 1
    || new Set(registry.namespaces).size !== registry.namespaces.length
    // Sorted storage keeps the registry diffable and its digest stable.
    || [...registry.namespaces].sort().join("\0") !== registry.namespaces.join("\0")
    || !registry.namespaces.every((namespace) => typeof namespace === "string" && EXTENSION_NAMESPACE_KEY.test(namespace))) throw new Error("EXTENSION-NAMESPACE-REGISTRY");
  return Object.freeze([...registry.namespaces]);
}

/** The registered namespaces, in the registry's canonical sorted order. */
export const EXTENSION_NAMESPACES = load();
const REGISTERED = new Set(EXTENSION_NAMESPACES);

export function isRegisteredExtensionNamespace(value) {
  return typeof value === "string" && EXTENSION_NAMESPACE_KEY.test(value) && REGISTERED.has(value);
}
