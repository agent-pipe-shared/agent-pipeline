#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Pure same-packet comparator. A shadow result can only gate activation. */

import { createHash } from "node:crypto";

export const SHADOW_SCHEMA = "pipeline.codex-critic-shadow-receipt.v1";
export const DIVERGENCES = Object.freeze(["equivalent", "expected-wording", "finding-severity", "finding-set", "invalid-result"]);
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export class ShadowError extends Error { constructor(code, message) { super(message); this.name = "ShadowError"; this.code = code; } }
function fail(code, message) { throw new ShadowError(code, message); }
export function canonicalJson(value) {
  const normalize = (entry) => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object"
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) : entry;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("F5-SCHEMA", `${label} is not closed`);
}
function digest(value, label) { if (!SHA256.test(value)) fail("F5-DIGEST", `${label} is not SHA-256`); }

function validateVerdict(value) {
  exactKeys(value, ["valid", "pass", "findings", "semanticSha256", "rawSha256"], "shadow verdict");
  digest(value.rawSha256, "verdict raw digest");
  if (typeof value.valid !== "boolean" || value.pass !== null && typeof value.pass !== "boolean" || !Array.isArray(value.findings)) fail("F5-VERDICT", "shadow verdict is invalid");
  if (!value.valid) {
    if (value.pass !== null || value.findings.length !== 0 || value.semanticSha256 !== null) fail("F5-VERDICT", "invalid result must not carry semantic claims");
    return value;
  }
  digest(value.semanticSha256, "verdict semantic digest");
  const ids = new Set();
  for (const finding of value.findings) {
    exactKeys(finding, ["id", "severity"], "shadow finding");
    if (!SAFE_ID.test(finding.id) || !new Set(["minor", "major", "critical"]).has(finding.severity) || ids.has(finding.id)) fail("F5-VERDICT", "finding vocabulary is invalid");
    ids.add(finding.id);
  }
  if (value.pass !== (value.findings.length === 0)) fail("F5-VERDICT", "pass conflicts with findings");
  return value;
}

export function classifyDivergence(current, sandbox) {
  validateVerdict(current); validateVerdict(sandbox);
  if (!current.valid || !sandbox.valid) return "invalid-result";
  const currentSet = new Map(current.findings.map(({ id, severity }) => [id, severity]));
  const sandboxSet = new Map(sandbox.findings.map(({ id, severity }) => [id, severity]));
  if (current.pass !== sandbox.pass || JSON.stringify([...currentSet.keys()].sort()) !== JSON.stringify([...sandboxSet.keys()].sort())) return "finding-set";
  if ([...currentSet].some(([id, severity]) => sandboxSet.get(id) !== severity)) return "finding-severity";
  return current.rawSha256 === sandbox.rawSha256 ? "equivalent" : "expected-wording";
}

function projectCanaries(canaries) {
  if (!Array.isArray(canaries) || canaries.length < 1) fail("F5-CANARY", "shadow comparison requires canaries");
  const normalized = canaries.map((entry) => {
    exactKeys(entry, ["id", "beforeSha256", "afterSha256"], "shadow canary");
    if (!SAFE_ID.test(entry.id)) fail("F5-CANARY", "canary ID is invalid");
    digest(entry.beforeSha256, "canary before"); digest(entry.afterSha256, "canary after");
    return entry;
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { manifestSha256: sha256(Buffer.from(canonicalJson(normalized))), unchanged: normalized.every(({ beforeSha256, afterSha256 }) => beforeSha256 === afterSha256) };
}

export function compareShadowRuns(input) {
  exactKeys(input, ["shadowId", "cases", "canaries", "emittedAtMs"], "shadow input");
  if (!SAFE_ID.test(input.shadowId) || !Number.isSafeInteger(input.emittedAtMs)) fail("F5-SHADOW", "shadow identity/time is invalid");
  if (!Array.isArray(input.cases) || input.cases.length !== 2 || new Set(input.cases.map(({ kind }) => kind)).size !== 2
    || !input.cases.some(({ kind }) => kind === "positive") || !input.cases.some(({ kind }) => kind === "seeded-negative")) fail("F5-SHADOW", "shadow requires exactly positive and seeded-negative cases");
  const cases = input.cases.map((entry) => {
    exactKeys(entry, ["kind", "packetSha256", "current", "sandbox"], "shadow case");
    digest(entry.packetSha256, "packet digest");
    if (entry.current.packetSha256 !== entry.packetSha256 || entry.sandbox.packetSha256 !== entry.packetSha256) fail("F5-PACKET", "both lanes must consume the identical canonical packet for their case");
    exactKeys(entry.current, ["packetSha256", "receiptSha256", "verdict"], "current lane");
    exactKeys(entry.sandbox, ["packetSha256", "receiptSha256", "verdict"], "sandbox lane");
    digest(entry.current.receiptSha256, "current receipt"); digest(entry.sandbox.receiptSha256, "sandbox receipt");
    const divergence = classifyDivergence(entry.current.verdict, entry.sandbox.verdict);
    return { kind: entry.kind, packetSha256: entry.packetSha256, currentReceiptSha256: entry.current.receiptSha256, sandboxReceiptSha256: entry.sandbox.receiptSha256, divergence, currentPass: entry.current.verdict.pass, sandboxPass: entry.sandbox.verdict.pass };
  }).sort((a, b) => a.kind.localeCompare(b.kind));
  const canaries = projectCanaries(input.canaries);
  const acceptable = new Set(["equivalent", "expected-wording"]);
  const positive = cases.find(({ kind }) => kind === "positive");
  const negative = cases.find(({ kind }) => kind === "seeded-negative");
  const gateEligible = canaries.unchanged && cases.every(({ divergence }) => acceptable.has(divergence))
    && positive.currentPass === true && positive.sandboxPass === true && negative.currentPass === false && negative.sandboxPass === false;
  const packetSetSha256 = sha256(Buffer.from(canonicalJson(cases.map(({ kind, packetSha256 }) => ({ kind, packetSha256 })))));
  return validateShadowReceipt({ schema: SHADOW_SCHEMA, shadowId: input.shadowId, packetSetSha256, cases, canaries, gateEligible, productionCriticGateSatisfied: false, emittedAtMs: input.emittedAtMs });
}

export function validateShadowReceipt(receipt) {
  exactKeys(receipt, ["schema", "shadowId", "packetSetSha256", "cases", "canaries", "gateEligible", "productionCriticGateSatisfied", "emittedAtMs"], "shadow receipt");
  exactKeys(receipt.canaries, ["manifestSha256", "unchanged"], "shadow receipt canaries");
  if (receipt.schema !== SHADOW_SCHEMA || !SAFE_ID.test(receipt.shadowId) || !Number.isSafeInteger(receipt.emittedAtMs)
    || typeof receipt.gateEligible !== "boolean" || receipt.productionCriticGateSatisfied !== false || typeof receipt.canaries.unchanged !== "boolean") fail("F5-SHADOW", "shadow receipt header is invalid");
  digest(receipt.packetSetSha256, "packet set"); digest(receipt.canaries.manifestSha256, "canary manifest");
  if (!Array.isArray(receipt.cases) || receipt.cases.length !== 2) fail("F5-SHADOW", "shadow receipt case count is invalid");
  for (const entry of receipt.cases) {
    exactKeys(entry, ["kind", "packetSha256", "currentReceiptSha256", "sandboxReceiptSha256", "divergence", "currentPass", "sandboxPass"], "shadow receipt case");
    digest(entry.packetSha256, "packet"); digest(entry.currentReceiptSha256, "current receipt"); digest(entry.sandboxReceiptSha256, "sandbox receipt");
    if (!DIVERGENCES.includes(entry.divergence)) fail("F5-SHADOW", "unknown divergence");
  }
  if (receipt.gateEligible && (!receipt.canaries.unchanged || receipt.cases.some(({ divergence }) => !new Set(["equivalent", "expected-wording"]).has(divergence)))) fail("F5-SHADOW", "eligible receipt contains undispositioned divergence");
  const expectedPacketSet = sha256(Buffer.from(canonicalJson(receipt.cases.map(({ kind, packetSha256 }) => ({ kind, packetSha256 })))));
  if (receipt.packetSetSha256 !== expectedPacketSet) fail("F5-PACKET", "packet set digest does not bind both shadow cases");
  return receipt;
}
