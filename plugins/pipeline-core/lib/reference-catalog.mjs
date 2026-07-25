// SPDX-License-Identifier: SUL-1.0
//
// Thin loader for the reference catalog content
// (governance/security-controls/catalog.json, CYB-1e). Reads the file and
// JSON.parses it -- nothing else. It does NOT validate (that is CYB-1a's
// control-catalog-schema.mjs job) and does NOT resolve applicability (that
// is CYB-1b's security-policy-resolver.mjs job); this module exists only so
// the catalog's on-disk location/parsing is a single reusable call instead
// of duplicated path logic across every consumer (this test file today,
// CYB-1h's verify wiring and CYB-1f's view generation later).
//
// Returns the parsed catalog document as-is:
//   { controls: [...raw CYB-1a-schema control records...],
//     moduleAttribution: [{ controlId, module, minAssuranceLevel }, ...] }
// See catalog.json's own "_readme" field for why moduleAttribution is a
// sibling array rather than a field on the control records themselves.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// plugins/pipeline-core/lib -> repo root -> governance/security-controls/catalog.json
const DEFAULT_CATALOG_PATH = join(__dirname, "..", "..", "..", "governance", "security-controls", "catalog.json");

export function loadReferenceCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const text = readFileSync(catalogPath, "utf8");
  return JSON.parse(text);
}
