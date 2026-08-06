#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Fail closed when pipeline.user.yaml and compiled PO-language runtime diverge. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAuthorityArtifactPath } from "../../plugins/pipeline-core/lib/project-authority.mjs";
import { validatePoFacingLanguageProjection } from "../../setup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  // The compiled runtime to validate is the one the project's authority tier
  // actually resolves to (ADR-0054) — validating a stale lower tier is the very
  // drift this gate exists to catch.
  const result = validatePoFacingLanguageProjection(
    readFileSync(join(root, "pipeline.user.yaml"), "utf8"),
    readFileSync(resolveAuthorityArtifactPath("manifest", { rootDir: root }).path, "utf8"),
    root,
  );
  if (!result.ok) {
    console.error(`PO-language projection invalid: ${result.reason}`);
    process.exit(2);
  }
  console.log(`PO-language projection valid: ${result.value}`);
} catch {
  console.error("PO-language projection invalid: source or compiled runtime is unreadable; re-run setup");
  process.exit(2);
}
