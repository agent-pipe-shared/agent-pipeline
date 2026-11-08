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
import { parseYaml } from "./yaml-lite.mjs";

export const PLAN_APPROVAL_DEVICE_REBIND_SCHEMA = "pipeline.plan-approval-device-rebind.v1";
export const DEVICE_LOCAL_AUTHORITY_FIELDS = Object.freeze(["receiptSha256", "repositoryFingerprint"]);
// G20-58: the PO profile source digest may be rebound too, but only by rebind-approval after it verified that the
// approved and the current source bytes differ in nothing but the model routing. A receipt carries either exactly the
// device-local fields or exactly these three; every reader accepts nothing else.
export const PROFILE_SOURCE_REBIND_FIELD = "sourceSha256";
export const PROFILE_SOURCE_REBIND_FIELDS = Object.freeze([...DEVICE_LOCAL_AUTHORITY_FIELDS, PROFILE_SOURCE_REBIND_FIELD]);
const REBIND_FIELD_SETS = [DEVICE_LOCAL_AUTHORITY_FIELDS, PROFILE_SOURCE_REBIND_FIELDS];
const RECEIPT_DIRECTORY = ["agent-pipeline", "rebind-approval"];
const SHA256 = /^[a-f0-9]{64}$/u;
const RECEIPT_KEYS = ["schema", "approvalSha256", "origin", "device", "envelopeSha256", "verifiedAt"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value, keys) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const deviceValues = (value, fields = DEVICE_LOCAL_AUTHORITY_FIELDS) => Object.fromEntries(fields.map((key) => [key, value?.[key]]));
const validDeviceValues = (value, fields = DEVICE_LOCAL_AUTHORITY_FIELDS) => sameKeys(value, fields)
  && fields.every((key) => SHA256.test(value[key] ?? ""));

// G20-58: the only PO profile source keys a plan approval may outlive. Model routing (and the registry digest that is
// regenerated with it) chooses which model runs a role; it decides no gate, approval, autonomy, export or release value.
export const REBINDABLE_PROFILE_SOURCE_KEYS = Object.freeze(["core_registry_sha256", "routing"]);

/**
 * G20-58/G20-64: the top-level keys of the PO profile source (pipeline.user.yaml text) that differ between the approved and
 * the current text, ignoring only the model routing. Unparseable text or a non-mapping root is a change of everything.
 */
export function profileSourceChangedKeys(approvedText, currentText) {
  let approved;
  let current;
  try {
    approved = parseYaml(String(approvedText));
    current = parseYaml(String(currentText));
  } catch { return ["<unparseable>"]; }
  if (!isObject(approved) || !isObject(current)) return ["<root>"];
  const keys = [...new Set([...Object.keys(approved), ...Object.keys(current)])].sort();
  return keys.filter((key) => !REBINDABLE_PROFILE_SOURCE_KEYS.includes(key)
    && (Object.hasOwn(approved, key) !== Object.hasOwn(current, key)
      || sha256CanonicalJson(approved[key] ?? null) !== sha256CanonicalJson(current[key] ?? null)));
}

/** True only when both values carry the same keys and differ in nothing but the given rebindable fields. */
export function differsOnlyInDeviceFields(stored, current, fields = DEVICE_LOCAL_AUTHORITY_FIELDS) {
  if (!isObject(stored) || !isObject(current)) return false;
  const keys = Object.keys(stored).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(current).sort())) return false;
  if (!fields.every((key) => keys.includes(key))) return false;
  return keys.every((key) => fields.includes(key)
    || JSON.stringify(stored[key]) === JSON.stringify(current[key]));
}

/** The value with its device-local fields replaced by the receipt's origin values. */
export function withOriginDeviceValues(value, rebind) {
  return { ...value, ...rebind.origin };
}

export function planApprovalDeviceRebindPath(gitCommonDir, approvalSha256, deviceFingerprint) {
  return join(gitCommonDir, ...RECEIPT_DIRECTORY, `plan-approval-${approvalSha256}-${deviceFingerprint}.json`);
}

/**
 * Build the receipt for the caller's verified facts; the caller decides when they are verified.
 * `profileSourceRebound` is set only by rebind-approval after its routing-only check of the profile source.
 */
export function createPlanApprovalDeviceRebindReceipt({ planApproval, current, envelopeSha256, verifiedAt, profileSourceRebound = false }) {
  const stored = planApproval?.poGateAuthority;
  const fields = profileSourceRebound === true ? PROFILE_SOURCE_REBIND_FIELDS : DEVICE_LOCAL_AUTHORITY_FIELDS;
  if (!differsOnlyInDeviceFields(stored, current, fields) || !SHA256.test(envelopeSha256 ?? "")) return null;
  const origin = deviceValues(stored, fields), device = deviceValues(current, fields);
  if (!validDeviceValues(origin, fields) || !validDeviceValues(device, fields)) return null;
  if (fields.every((key) => origin[key] === device[key])) return null;
  if (profileSourceRebound === true && origin[PROFILE_SOURCE_REBIND_FIELD] === device[PROFILE_SOURCE_REBIND_FIELD]) return null;
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
    if (!differsOnlyInDeviceFields(stored, current, PROFILE_SOURCE_REBIND_FIELDS)) return null;
    const approvalSha256 = sha256CanonicalJson(planApproval);
    if (!SHA256.test(current?.repositoryFingerprint ?? "")) return null;
    const receipt = readPrivateJson(planApprovalDeviceRebindPath(gitCommonDir, approvalSha256, current.repositoryFingerprint),
      "plan approval device rebind receipt");
    if (!sameKeys(receipt, RECEIPT_KEYS) || receipt.schema !== PLAN_APPROVAL_DEVICE_REBIND_SCHEMA
      || receipt.approvalSha256 !== approvalSha256 || !SHA256.test(receipt.envelopeSha256 ?? "")) return null;
    const fields = REBIND_FIELD_SETS.find((set) => sameKeys(receipt.origin, set));
    if (!fields || !validDeviceValues(receipt.origin, fields) || !validDeviceValues(receipt.device, fields)) return null;
    // A device-local-only receipt never covers a changed profile source: the field set decides what may differ.
    if (!differsOnlyInDeviceFields(stored, current, fields)) return null;
    const origin = deviceValues(stored, fields), device = deviceValues(current, fields);
    if (fields.some((key) => receipt.origin[key] !== origin[key] || receipt.device[key] !== device[key])) return null;
    return { origin: receipt.origin, device: receipt.device, envelopeSha256: receipt.envelopeSha256 };
  } catch {
    return null;
  }
}
