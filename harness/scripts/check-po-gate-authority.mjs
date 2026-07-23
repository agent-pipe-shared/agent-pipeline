#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Read-only CLI for the repository-scoped PO gate authority. */
import {
  validatePoGateAuthorityForRepository,
} from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";

try {
  const result = validatePoGateAuthorityForRepository({ repoRoot: process.cwd() });
  if (!result.ok) {
    process.stderr.write(`${result.code}: ${result.reason} ${result.repair}\n`);
    process.exit(2);
  }
  const activeAuthority = result.value.planPath ?? "no active feature";
  process.stdout.write(`PO gate authority valid: ${result.value.humanFacing}; ${activeAuthority}\n`);
} catch {
  process.stderr.write("PO-GATE-AUTHORITY-UNAVAILABLE: Repository topology or authority inputs are unavailable; run sanctioned setup from the primary checkout.\n");
  process.exit(2);
}
