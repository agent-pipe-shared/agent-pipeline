// SPDX-License-Identifier: SUL-1.0
/** Distinguish the Pipeline source checkout from a consuming project. */
import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";

export const OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA = "pipeline.observation-governance-bootstrap.v1";
const SOURCE_MANIFEST = "plugins/pipeline-core/.claude-plugin/plugin.json";
const CHECKER = "harness/scripts/check-observation-governance.mjs";
// vendor-sync (project-authority-migration.mjs) only ever provisions a
// byte-identical copy under `plugins/pipeline-core/` -- it never creates a
// `harness/` directory.  A vendor-synced consumer project therefore has
// SOURCE_MANIFEST but no `harness/` at all, which is the second signal that
// distinguishes it from the Pipeline's own real source checkout.
const SOURCE_HARNESS_DIR = "harness";

function regular(path, fs) { try { return fs.existsSync(path) && fs.lstatSync(path).isFile(); } catch { return false; } }
function directory(path, fs) { try { return fs.existsSync(path) && fs.lstatSync(path).isDirectory(); } catch { return false; } }

export function inspectObservationGovernanceBootstrap({ rootDir, fs = { existsSync, lstatSync } } = {}) {
  const sourceManifest = join(rootDir, SOURCE_MANIFEST);
  if (!regular(sourceManifest, fs)) return { schema: OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA, status: "not-applicable", sourceCheckout: false, checker: null };
  const harnessDir = join(rootDir, SOURCE_HARNESS_DIR);
  if (!directory(harnessDir, fs)) return { schema: OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA, status: "not-applicable", sourceCheckout: false, checker: null };
  const checker = join(rootDir, CHECKER);
  if (!regular(checker, fs)) return { schema: OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA, status: "failed", sourceCheckout: true, checker: CHECKER, code: "OGB-CHECKER-MISSING" };
  return { schema: OBSERVATION_GOVERNANCE_BOOTSTRAP_SCHEMA, status: "required", sourceCheckout: true, checker: CHECKER };
}
