#!/usr/bin/env node
/** Fail closed when pipeline.user.yaml and compiled PO-language runtime diverge. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePoFacingLanguageProjection } from "../../setup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  const result = validatePoFacingLanguageProjection(
    readFileSync(join(root, "pipeline.user.yaml"), "utf8"),
    readFileSync(join(root, ".claude", "pipeline.yaml"), "utf8"),
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
