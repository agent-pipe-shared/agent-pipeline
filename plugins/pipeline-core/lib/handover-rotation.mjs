// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-HANDOVER-ROT-1 / ADR-0066. The size metric and hard-cap constant the
 * handover-rotation mechanism (rotation script, size-gate guard) is built
 * on, plus the project-calibration config-resolution helper both consume.
 *
 * Deliberately its OWN schema string and OWN constant, never a re-use of
 * `lib/bootstrap-payload-budget.mjs`'s `BOOTSTRAP_PAYLOAD_MAX_BYTES`
 * (ADR-0066 Decision 4): that constant budgets the ENTIRE bootstrap
 * payload, of which the handover file is meant to be a fraction, not the
 * whole -- reusing it would leave zero headroom for everything else a
 * bootstrap read carries. This module mirrors that sibling's metric STYLE
 * (`utf8-byte-upper-bound`, one UTF-8 byte as one conservative token-unit
 * upper bound, never a claim of exact model tokenization) without
 * importing anything from it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveAuthorityArtifactPath } from "./project-authority.mjs";

export const HANDOVER_MEASUREMENT_SCHEMA = "pipeline.handover-measurement.v1";

/**
 * ADR-0066 Decision 4: a new, independently-justified constant. 12,000
 * utf8-byte-upper-bound units leaves headroom for the rest of a bootstrap
 * read under the existing 18,000-unit `BOOTSTRAP_PAYLOAD_MAX_BYTES` ceiling
 * (`lib/bootstrap-payload-budget.mjs`) while staying generous enough that a
 * single realistic current block does not thrash against it constantly.
 * The Elephant's reasoned default per the ADR, not a PO-specified figure --
 * expected to be revisited once real rotation cadence is observed (ADR-0066
 * Follow-up). NEVER derived from, or asserted equal to, the bootstrap
 * constant; the two are allowed to diverge by construction.
 */
export const HANDOVER_MAX_BYTES = 12_000;

/** ADR-0066 Decision 5: the default handover path when a project has not configured one. */
export const HANDOVER_DEFAULT_PATH = "docs/state.md";

function serialize(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Measure a raw byte count already known to the caller (e.g. `statSync(...).size`
 * or `Buffer.byteLength(content, "utf8")`) against the handover cap. Mirrors
 * `measureBootstrapBytes()`'s shape exactly, with this module's own schema/cap.
 */
export function measureHandoverBytes(bytes, { maxBytes = HANDOVER_MAX_BYTES } = {}) {
  const upperBoundUnits = Number(bytes);
  return Object.freeze({
    schema: HANDOVER_MEASUREMENT_SCHEMA,
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    bytes: upperBoundUnits,
    upperBoundUnits,
    maxUpperBoundUnits: maxBytes,
    withinBudget: upperBoundUnits <= maxBytes,
  });
}

/**
 * Measure an in-memory value (string content, or a JSON-serializable payload)
 * against the handover cap. Mirrors `measureBootstrapPayload()`'s shape.
 */
export function measureHandoverContent(value, { maxBytes = HANDOVER_MAX_BYTES } = {}) {
  const serialized = serialize(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  return measureHandoverBytes(bytes, { maxBytes });
}

/**
 * ADR-0066 Decision 5: resolve `handover.path` / `handover.maxBytes` from
 * project calibration, defaulting to `docs/state.md` / `12,000` when a
 * project has configured neither.
 *
 * Reuses `resolveAuthorityArtifactPath("calibration", ...)`
 * (`lib/project-authority.mjs`) -- the SAME general-purpose calibration-file
 * locator the rest of this plugin already uses -- rather than re-deriving
 * the neutral/legacy `pipeline.json` precedence a second time. This module
 * only owns the `handover`-key extraction, never the file-location logic.
 *
 * Back-compat shape note: this codebase's OWN calibration convention
 * (`templates/pipeline.json.example`, close-block SKILL.md step 0) already
 * uses a top-level `"handover": "docs/state.md"` STRING for the file path --
 * predating this ADR, and still the live shape in this repository's own
 * `project/pipeline.json`. ADR-0066 Decision 5 asks for a
 * `handover.path` / `handover.maxBytes`-SHAPED key, which in a plain-string
 * value has no `.maxBytes` to read. Both shapes are therefore accepted here
 * deliberately (a disclosed extension beyond the ADR's literal wording, not
 * a contradiction of it): a plain string is read as the path only (maxBytes
 * stays default), and an object `{ path, maxBytes }` is read in full. This
 * keeps every project's existing calibration working unchanged while still
 * honoring the ADR's new `maxBytes` key when a project adds one.
 *
 * `pipeline.yaml` is NOT read here: in this codebase `pipeline.yaml` is the
 * separate MANIFEST format (phases/gates/security/model-routing/governance,
 * ADR-0046/ADR-0054), not a calibration format, and no precedent for a
 * YAML-shaped calibration `handover` key was found. Only `pipeline.json`
 * (neutral `project/pipeline.json`, legacy `.claude/pipeline.json`) is read.
 */
export function resolveHandoverConfig({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  let calibration = null;
  let calibrationPath = null;
  try {
    const artifact = resolveAuthorityArtifactPath("calibration", { rootDir: root });
    if (artifact.exists) {
      calibrationPath = artifact.path;
      calibration = JSON.parse(readFileSync(artifact.path, "utf8"));
    }
  } catch {
    // A missing or malformed calibration file falls back to defaults --
    // this helper never throws and never blocks on a broken config, matching
    // the fail-safe-toward-defaults posture the rest of this plugin's
    // config-driven guards already use.
    calibration = null;
    calibrationPath = null;
  }

  let path = HANDOVER_DEFAULT_PATH;
  let maxBytes = HANDOVER_MAX_BYTES;
  const handover = calibration && typeof calibration === "object" && !Array.isArray(calibration)
    ? calibration.handover
    : undefined;
  if (typeof handover === "string" && handover.trim() !== "") {
    path = handover;
  } else if (handover && typeof handover === "object" && !Array.isArray(handover)) {
    if (typeof handover.path === "string" && handover.path.trim() !== "") path = handover.path;
    if (typeof handover.maxBytes === "number" && Number.isFinite(handover.maxBytes) && handover.maxBytes > 0) {
      maxBytes = handover.maxBytes;
    }
  }

  return Object.freeze({
    path,
    maxBytes,
    source: calibration === null ? "default" : "calibration",
    calibrationPath,
  });
}
