// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createDefinitionInventory } from "./ai-assisted-hardening.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const ROOTS = Object.freeze([
  Object.freeze({ kind: "skill", path: "plugins/pipeline-core/skills", include: (name) => name === "SKILL.md" }),
  Object.freeze({ kind: "role", path: "plugins/pipeline-core/agents", include: (name) => name.endsWith(".md") }),
  Object.freeze({ kind: "hook", path: "plugins/pipeline-core/hooks", include: (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs") }),
  Object.freeze({ kind: "adapter", path: "plugins/pipeline-core/scripts", include: (name) => /(?:host-bridge|sandbox-runtime|sandbox-select|advisory-host|critic-host)\.mjs$/u.test(name) }),
]);

function walk(root, directory, include) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  return entries.flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return walk(root, full, include);
    return entry.isFile() && include(entry.name) ? [relative(root, full).replaceAll("\\", "/")] : [];
  });
}

/** Deterministically inventory the actual runnable definition surfaces. */
export function buildAiDefinitionInventory(repoRoot) {
  const definitions = ROOTS.flatMap(({ kind, path, include }) => walk(repoRoot, join(repoRoot, path), include)
    .map((name) => ({ kind, name, id: name, precedence: 0, sha256: sha256(readFileSync(join(repoRoot, name))) })));
  return createDefinitionInventory(definitions);
}

export function definitionInventoryRecord(repoRoot) {
  const inventory = buildAiDefinitionInventory(repoRoot);
  return Object.freeze({
    schema: "pipeline.ai-definition-inventory.v1",
    inventorySha256: inventory.inventorySha256,
    definitionCount: inventory.definitions.length,
  });
}
