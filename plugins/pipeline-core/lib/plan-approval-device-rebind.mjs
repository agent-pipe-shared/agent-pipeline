// SPDX-License-Identifier: SUL-1.0
//
// R7-5 (spec section 22.5) for an accepted-contract plan approval (pipeline.plan-approval.v9):
// a clone carries the committed approval and its retained contract, but the approval also binds
// two device-local values of the origin clone, the PO profile receipt digest and the repository
// fingerprint. Both are derived from the clone's own paths, so on another device every
// approval consumer refused with a stale-authority code although nothing the PO approved changed.
//
// This module holds only the device-local receipt that maps the origin values to this device's
// values. It never rewrites the approval, the retained contract or the State: consumers keep
// verifying every digest, the candidate and the signature exactly as before, and substitute the
// two origin values only when a receipt binds this exact approval, these exact origin values and
// this device's current values. No receipt means today's refusal, unchanged.

import { join } from "node:path";
import { sha256CanonicalJson } from "./plan-spec-state-v2.mjs";
import { readPrivateJson, writePrivateJsonAtomic } from "./private-boundary.mjs";

export const PLAN_APPROVAL_DEVICE_REBIND_SCHEMA = "pipeline.plan-approval-device-rebind.v1";
export const DEVICE_LOCAL_AUTHORITY_FIELDS = Object.freeze(["receiptSha256", "repositoryFingerprint"]);
const RECEIPT_DIRECTORY = ["agent-pipeline", "rebind-approval"];
const SHA256 = /^[a-f0-9]{64}$/u;
const RECEIPT_KEYS = ["schema", "approvalSha256", "origin", "device", "envelopeSha256", "verifiedAt"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value, keys) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const deviceValues = (value) => Object.fromEntries(DEVICE_LOCAL_AUTHORITY_FIELDS.map((key) => [key, value?.[key]]));
const validDeviceValues = (value) => sameKeys(value, DEVICE_LOCAL_AUTHORITY_FIELDS)
  && DEVICE_LOCAL_AUTHORITY_FIELDS.every((key) => SHA256.test(value[key] ?? ""));

/** True only when both values carry the same keys and differ in nothing but the device-local fields. */
export function differsOnlyInDeviceFields(stored, current) {
  if (!isObject(stored) || !isObject(current)) return false;
  const keys = Object.keys(stored).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(current).sort())) return false;
  if (!DEVICE_LOCAL_AUTHORITY_FIELDS.every((key) => keys.includes(key))) return false;
  return keys.every((key) => DEVICE_LOCAL_AUTHORITY_FIELDS.includes(key)
    || JSON.stringify(stored[key]) === JSON.stringify(current[key]));
}

/** The value with its device-local fields replaced by the receipt's origin values. */
export function withOriginDeviceValues(value, rebind) {
  return { ...value, ...rebind.origin };
}

export function planApprovalDeviceRebindPath(gitCommonDir, approvalSha256, deviceFingerprint) {
  return join(gitCommonDir, ...RECEIPT_DIRECTORY, `plan-approval-${approvalSha256}-${deviceFingerprint}.json`);
}

/** Build the receipt for the caller's verified facts; the caller decides when they are verified. */
export function createPlanApprovalDeviceRebindReceipt({ planApproval, current, envelopeSha256, verifiedAt }) {
  const stored = planApproval?.poGateAuthority;
  if (!differsOnlyInDeviceFields(stored, current) || !SHA256.test(envelopeSha256 ?? "")) return null;
  const origin = deviceValues(stored), device = deviceValues(current);
  if (!validDeviceValues(origin) || !validDeviceValues(device)) return null;
  if (DEVICE_LOCAL_AUTHORITY_FIELDS.every((key) => origin[key] === device[key])) return null;
  return { schema: PLAN_APPROVAL_DEVICE_REBIND_SCHEMA, approvalSha256: sha256CanonicalJson(planApproval),
    origin, device, envelopeSha256, verifiedAt: String(verifiedAt) };
}

export function writePlanApprovalDeviceRebindReceipt(gitCommonDir, receipt) {
  const path = planApprovalDeviceRebindPath(gitCommonDir, receipt.approvalSha256, receipt.device.repositoryFingerprint);
  writePrivateJsonAtomic(path, receipt);
  return path;
}

/**
 * The rebind that applies to this approval on this device, or null.
 * `current` is this device's freshly derived authority value. Every mismatch, a malformed or
 * unsafe receipt and an absent receipt all return null, so the caller keeps its own refusal.
 */
export function readPlanApprovalDeviceRebind({ gitCommonDir, planApproval, current }) {
  try {
    const stored = planApproval?.poGateAuthority;
    if (!differsOnlyInDeviceFields(stored, current)) return null;
    const approvalSha256 = sha256CanonicalJson(planApproval);
    const device = deviceValues(current);
    if (!validDeviceValues(device)) return null;
    const receipt = readPrivateJson(planApprovalDeviceRebindPath(gitCommonDir, approvalSha256, device.repositoryFingerprint),
      "plan approval device rebind receipt");
    if (!sameKeys(receipt, RECEIPT_KEYS) || receipt.schema !== PLAN_APPROVAL_DEVICE_REBIND_SCHEMA
      || receipt.approvalSha256 !== approvalSha256 || !SHA256.test(receipt.envelopeSha256 ?? "")
      || !validDeviceValues(receipt.origin) || !validDeviceValues(receipt.device)) return null;
    const origin = deviceValues(stored);
    if (DEVICE_LOCAL_AUTHORITY_FIELDS.some((key) => receipt.origin[key] !== origin[key] || receipt.device[key] !== device[key])) return null;
    return { origin: receipt.origin, device: receipt.device, envelopeSha256: receipt.envelopeSha256 };
  } catch {
    return null;
  }
}
