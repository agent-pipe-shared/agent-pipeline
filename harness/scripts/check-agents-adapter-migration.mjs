#!/usr/bin/env node
/** Narrow contract check for the one optional, public AGENTS adapter migration. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MIGRATED_AGENTS_ADAPTER } from "../../setup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DECLARED_ADAPTER_PATH = "AGENTS.md";
const REQUIRED = ["pipeline-core:pipeline-start", ".claude/pipeline.yaml", "docs/operating-model.md", "Codex", "other non-Claude", "methodology-only"];
const FORBIDDEN = [/^#{2,}\s/m, /(?:private|credential|account|session)\s*[:=]/i];

export function checkAgentsAdapterMigration(text) {
  if (typeof text !== "string") return { ok: false, errors: ["adapter is unreadable"] };
  const errors = [];
  if (text !== MIGRATED_AGENTS_ADAPTER) errors.push("adapter is not the exact migrated pointer");
  for (const token of REQUIRED) if (!text.includes(token)) errors.push("adapter misses a required authority or runtime boundary");
  for (const pattern of FORBIDDEN) if (pattern.test(text)) errors.push("adapter contains a forbidden second-rule or private-runtime claim");
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let text = null;
  try { text = readFileSync(join(root, DECLARED_ADAPTER_PATH), "utf8"); } catch { /* checker returns a category only */ }
  const result = checkAgentsAdapterMigration(text);
  if (!result.ok) {
    for (const error of result.errors) console.error(`agents-adapter-migration: ${error}`);
    process.exit(2);
  }
  console.log("AGENTS adapter migration contract valid.");
}
