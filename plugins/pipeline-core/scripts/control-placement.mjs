// SPDX-License-Identifier: SUL-1.0
/**
 * A2 control-placement table validation. The table is deliberately a declaration
 * plus observed per-runner state, not a substitute for an A1 measurement. A
 * runner-hook declaration cannot qualify unless a current A1 record for the
 * selected runner establishes that the runner hook actually fired.
 */
import { readFileSync } from "node:fs";

import { ENFORCEMENT_LAYERS, validateRecord } from "./enforcement-conformance.mjs";

export const CONTROL_PLACEMENT_SCHEMA = "pipeline.control-placement.v1";
export const SUPPORTED_RUNNERS = Object.freeze(["claude", "codex", "antigravity"]);
export const RUNNER_STATUSES = Object.freeze(["enforced", "unavailable", "contradicted", "not-applicable"]);

// Only controls whose implementation is present on the Alfred implementation
// base belong here. Planned-but-unshipped A3/C1 controls are intentionally not
// listed: this is an inventory of shipped controls, not a roadmap.
export const ALFRED_SHIPPED_CONTROL_IDS = Object.freeze([
  "alfred:a1-enforcement-conformance",
  "alfred:a2-control-placement",
  "alfred:a4-plan-authority-sealing",
  "alfred:a5-closed-evidence-integrity",
  "alfred:a5-closed-evidence-repair",
  "alfred:b1-rigor-derivation",
  "alfred:b2-verify-suite-registration",
  "alfred:c2-dispatch-closing-allowance",
  "alfred:d1-architecture-decision-summary",
  "alfred:d2-module-inventory",
  "alfred:d3-architecture-fitness",
  "alfred:d4-architecture-adoption",
]);

const TABLE_KEYS = Object.freeze(["schema", "revision", "controls"]);
const ROW_KEYS = Object.freeze(["controlId", "protects", "enforcedBy", "perRunnerStatus", "residualGaps"]);
const STATUS_KEYS = Object.freeze(["runner", "status", "detail"]);
const CONTROL_ID = /^(?:hook|alfred):[a-z0-9][a-z0-9:-]*$/u;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has non-canonical keys`);
  }
}

function strings(value, label, { nonEmpty = false, unique = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be string[]`);
  }
  if (nonEmpty && value.length === 0) throw new TypeError(`${label} must not be empty`);
  if (unique && new Set(value).size !== value.length) throw new TypeError(`${label} must be unique`);
}

function hookControlId(event, command) {
  const match = /\/hooks\/([a-z0-9][a-z0-9-]*)(?:\.mjs)?(?:["'\s]|$)/iu.exec(command);
  if (!match) throw new TypeError(`hooks.json command has no canonical hook script: ${command}`);
  return `hook:${event.toLowerCase()}:${match[1].toLowerCase()}`;
}

/** Return unique control IDs derived from every command control in hooks/hooks.json. */
export function hookControlIds(hooksDocument) {
  if (!hooksDocument || typeof hooksDocument !== "object" || !hooksDocument.hooks || typeof hooksDocument.hooks !== "object") {
    throw new TypeError("hooks document is unavailable or invalid");
  }
  const result = new Set();
  for (const [event, registrations] of Object.entries(hooksDocument.hooks)) {
    if (!Array.isArray(registrations)) throw new TypeError(`hooks.${event} must be an array`);
    for (const registration of registrations) {
      if (!registration || typeof registration !== "object" || !Array.isArray(registration.hooks)) {
        throw new TypeError(`hooks.${event} registration has no hooks array`);
      }
      for (const hook of registration.hooks) {
        if (!hook || typeof hook.command !== "string" || hook.command.length === 0) {
          throw new TypeError(`hooks.${event} command control is invalid`);
        }
        result.add(hookControlId(event, hook.command));
      }
    }
  }
  return [...result].sort();
}

export function expectedControlIds(hooksDocument) {
  return [...new Set([...hookControlIds(hooksDocument), ...ALFRED_SHIPPED_CONTROL_IDS])].sort();
}

export function validateControlPlacement(table) {
  exactKeys(table, TABLE_KEYS, "control placement table");
  if (table.schema !== CONTROL_PLACEMENT_SCHEMA) throw new TypeError("control placement schema mismatch");
  if (!Number.isInteger(table.revision) || table.revision !== 1) throw new TypeError("control placement revision must be 1");
  if (!Array.isArray(table.controls) || table.controls.length === 0) throw new TypeError("control placement controls must be a non-empty array");
  const seenControls = new Set();
  for (const [index, row] of table.controls.entries()) {
    exactKeys(row, ROW_KEYS, `controls[${index}]`);
    if (typeof row.controlId !== "string" || !CONTROL_ID.test(row.controlId)) throw new TypeError(`controls[${index}].controlId is invalid`);
    if (seenControls.has(row.controlId)) throw new TypeError(`controls[${index}].controlId is duplicated`);
    seenControls.add(row.controlId);
    strings(row.protects, `controls[${index}].protects`, { nonEmpty: true, unique: true });
    strings(row.enforcedBy, `controls[${index}].enforcedBy`, { nonEmpty: true, unique: true });
    for (const layer of row.enforcedBy) {
      if (!ENFORCEMENT_LAYERS.includes(layer)) throw new TypeError(`controls[${index}].enforcedBy has an unknown layer`);
    }
    if (!Array.isArray(row.perRunnerStatus) || row.perRunnerStatus.length === 0) throw new TypeError(`controls[${index}].perRunnerStatus must be non-empty`);
    const seenRunners = new Set();
    for (const [statusIndex, status] of row.perRunnerStatus.entries()) {
      exactKeys(status, STATUS_KEYS, `controls[${index}].perRunnerStatus[${statusIndex}]`);
      if (!SUPPORTED_RUNNERS.includes(status.runner) || seenRunners.has(status.runner)) throw new TypeError(`controls[${index}].perRunnerStatus has an invalid or duplicated runner`);
      seenRunners.add(status.runner);
      if (!RUNNER_STATUSES.includes(status.status)) throw new TypeError(`controls[${index}].perRunnerStatus has an invalid status`);
      if (typeof status.detail !== "string" || status.detail.length === 0) throw new TypeError(`controls[${index}].perRunnerStatus detail is required`);
    }
    strings(row.residualGaps, `controls[${index}].residualGaps`, { unique: true });
    if (row.enforcedBy.includes("prose") && !row.residualGaps.some((gap) => gap.startsWith("compensating-detection:"))) {
      throw new TypeError(`controls[${index}] prose declaration lacks compensating detection`);
    }
  }
  return true;
}

function a1SupportsRunnerHooks(record, runner) {
  return record.runner.name === runner && record.layer === "runner-hook" &&
    record.staleness.status === "current" && record.evaluator.outcome === "pass" &&
    record.observations.length > 0 && record.observations.every((observation) =>
      observation.hookObservation === "fires" && ["deterministic-execution", "human-acceptance"].includes(observation.evidenceKind));
}

/**
 * Validate placement completeness and honesty for one active runner. It returns
 * diagnostics rather than throwing for evidence findings so the CLI can expose
 * all missing/contradicted rows in one deterministic readback. Source record
 * absence or invalidity is intentionally a hard, fail-closed finding.
 */
export function checkControlPlacement({ table, hooksDocument, a1Record, activeRunner }) {
  if (!SUPPORTED_RUNNERS.includes(activeRunner)) throw new TypeError("active runner is unsupported");
  validateControlPlacement(table);
  const expected = expectedControlIds(hooksDocument);
  const actual = table.controls.map((row) => row.controlId);
  const actualSet = new Set(actual);
  const findings = [];
  for (const id of expected) if (!actualSet.has(id)) findings.push(`A2-CONTROL-ROW-MISSING:${id}`);
  for (const id of actual) if (!expected.includes(id)) findings.push(`A2-UNKNOWN-CONTROL-ROW:${id}`);

  let a1Available = true;
  try { validateRecord(a1Record); } catch { a1Available = false; }
  if (!a1Available) {
    findings.push("A2-A1-RECORD-REQUIRED");
  } else if (a1Record.runner.name !== activeRunner || a1Record.layer !== "runner-hook" || a1Record.staleness.status !== "current") {
    findings.push("A2-A1-RECORD-NOT-CURRENT-FOR-ACTIVE-RUNNER");
  }
  const runnerHooksSupported = a1Available && a1SupportsRunnerHooks(a1Record, activeRunner);
  for (const row of table.controls) {
    const activeStatus = row.perRunnerStatus.find((status) => status.runner === activeRunner);
    if (!activeStatus) findings.push(`A2-ACTIVE-RUNNER-STATUS-MISSING:${row.controlId}`);
    if (row.enforcedBy.includes("runner-hook") && !runnerHooksSupported) {
      findings.push(`A2-RUNNER-HOOK-CONTRADICTED:${row.controlId}`);
    }
    if (row.enforcedBy.includes("runner-hook") && activeStatus?.status === "enforced" && !runnerHooksSupported) {
      findings.push(`A2-RUNNER-HOOK-STATUS-DISHONEST:${row.controlId}`);
    }
  }
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings.sort()), expectedControlIds: Object.freeze(expected) });
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
