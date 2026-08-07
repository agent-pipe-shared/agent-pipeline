#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-authority-tier-agreement.mjs — the two authority tiers must not disagree (ADR-0054).
 *
 * WHY THIS EXISTS. `project/pipeline.{yaml,json}` sat untouched from the day the
 * authority migration created it while `.claude/pipeline.{yaml,json}` kept being
 * updated — by the V3 compiler for its owned keys, by hand for everything else.
 * Because `resolveProjectAuthorityPaths()` prefers the neutral tier, every gate read
 * the frozen copy. The measured cost: `gates.push.approval` resolved to
 * `standing-approved` for two months after a commit deliberately hardened it to
 * `required`, so `guard-push.mjs` auto-passed the human push gate the whole time.
 * Nothing compared the tiers, so nothing noticed.
 *
 * THE RULE. For each artifact that exists at more than one tier:
 *   - a key the V3 compiler OWNS must be identical at every tier — the compiler
 *     writes exactly one of them, so a difference means the others are stale;
 *   - a key present at more than one tier must be identical there too — differing
 *     values are two answers to one question, and the resolver silently picks one;
 *   - a key present at only ONE tier is allowed and merely reported. That is a
 *     deliberate tier-local addition (this repo's `pipelineUpdateChannel: alpha`
 *     lives only in the neutral copy), not drift.
 *
 * The guard audit ledger is deliberately NOT compared: it is append-only evidence,
 * not policy, and two tiers legitimately hold different histories. Lifecycle State is
 * not compared either — `project-authority.mjs` already refuses to resolve at all
 * while State exists at two tiers (`PA-LEGACY-STATE-RETIREMENT-REQUIRED`).
 *
 * Exit 0: tiers agree (or only one tier exists — the ordinary consumer case).
 * Exit 2: at least one disagreement, listed with its artifact, key and both values.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTHORITY_ARTIFACTS } from "../../plugins/pipeline-core/lib/project-authority.mjs";
import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(HERE, "..", "..");
const OWNED_KEYS_PATH = join(
  "plugins", "pipeline-core", "config", "runtime-projection-v3-owned-keys.json",
);

/** Artifacts whose VALUES are policy and must therefore agree. */
const COMPARED = Object.freeze(["manifest", "calibration", "guardConfig"]);

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function parse(path) {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".yaml") || path.endsWith(".yml") ? parseYaml(text) : JSON.parse(text);
}

/** Read a dotted path; `{ found: false }` distinguishes absent from a literal undefined. */
function at(value, dotted) {
  let cursor = value;
  for (const part of dotted.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !(part in cursor)) return { found: false };
    cursor = cursor[part];
  }
  return { found: true, value: cursor };
}

/** Owned keys, indexed by the artifact's LEGACY relative path — the compiler's targets. */
function ownedKeysByTarget(root) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, OWNED_KEYS_PATH), "utf8"));
    const index = new Map();
    for (const target of manifest?.targets ?? []) {
      if (typeof target?.path === "string" && Array.isArray(target.ownedKeys)) {
        index.set(target.path, target.ownedKeys);
      }
    }
    return index;
  } catch {
    // A consumer project carries no V3 projection manifest. Every key is then simply
    // "not compiler-owned", and the present-at-both rule below still applies.
    return new Map();
  }
}

export function checkAuthorityTierAgreement(root = DEFAULT_ROOT) {
  const findings = [];
  const notes = [];
  const owned = ownedKeysByTarget(root);
  let comparedArtifacts = 0;

  for (const kind of COMPARED) {
    const tiers = AUTHORITY_ARTIFACTS[kind];
    const present = Object.entries(tiers)
      .filter(([, relPath]) => existsSync(join(root, relPath)))
      .map(([tier, relPath]) => ({ tier, relPath }));
    if (present.length < 2) continue;
    comparedArtifacts += 1;

    let parsed;
    try {
      parsed = present.map((entry) => ({ ...entry, value: parse(join(root, entry.relPath)) }));
    } catch (error) {
      findings.push(`${kind}: a tier could not be parsed (${error.message})`);
      continue;
    }

    const ownedKeys = owned.get(tiers.legacy) ?? [];
    // A top-level key whose difference is entirely explained by an owned sub-key is
    // reported once, as that owned key — not twice, as parent and child.
    const explained = (key) => ownedKeys.some((entry) => entry === key || entry.startsWith(`${key}.`));
    const union = [...new Set(parsed.flatMap((entry) => Object.keys(entry.value ?? {})))]
      .sort()
      .filter((key) => !explained(key));
    for (const key of [...ownedKeys, ...union]) {
      const readings = parsed.map((entry) => ({ tier: entry.relPath, ...at(entry.value, key) }));
      const found = readings.filter((reading) => reading.found);
      if (found.length === 0) continue;
      if (found.length < readings.length) {
        // Present at one tier only. Allowed, but never silent.
        if (ownedKeys.includes(key)) {
          findings.push(`${key}: compiler-owned, but present only at ${found.map((r) => r.tier).join(", ")}`);
          continue;
        }
        notes.push(`${key}: present only at ${found.map((r) => r.tier).join(", ")}`);
        continue;
      }
      const values = found.map((reading) => stable(reading.value));
      if (new Set(values).size === 1) continue;
      const shown = found.map((reading, index) => `${reading.tier}=${values[index]}`).join(" vs ");
      findings.push(`${key}: ${ownedKeys.includes(key) ? "compiler-owned key " : ""}tiers disagree — ${shown}`);
    }
  }

  return { ok: findings.length === 0, findings, notes, comparedArtifacts };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(process.argv[rootIndex + 1] ?? DEFAULT_ROOT);
  const result = checkAuthorityTierAgreement(root);
  for (const note of result.notes) console.log(`TIER-NOTE ${note}`);
  if (result.ok) {
    console.log(
      result.comparedArtifacts === 0
        ? "Authority tiers agree: no artifact exists at more than one tier."
        : `Authority tiers agree across ${result.comparedArtifacts} artifact(s) held at more than one tier.`,
    );
    process.exit(0);
  }
  for (const finding of result.findings) console.error(`TIER-DRIFT ${finding}`);
  console.error(
    `Authority tier agreement failed: ${result.findings.length} finding(s). ` +
    "The resolver serves ONE tier; a disagreeing tier means some gate is reading a value nobody intended.",
  );
  process.exit(2);
}
