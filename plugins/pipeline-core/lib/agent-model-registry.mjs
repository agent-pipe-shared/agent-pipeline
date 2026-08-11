#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Resolve which model/effort a dispatched AGENT DEFINITION actually specifies, so a dispatch
 * record's `model`/`effort` fields can be DERIVED FROM (or checked against) the agent
 * frontmatter instead of trusted as hand-typed briefing text.
 *
 * WHY THIS EXISTS. `backlog/items/2026-08-08-a-briefings-model-field-can-contradict-the-agent-
 * it-dispatches.md`: three dispatches in one wave were briefed "claude-opus-5 at xhigh" and ran
 * on claude-sonnet-5, because `goldfish-deep.md` actually specifies `model: sonnet` /
 * `effort: xhigh`. The briefing field is decorative — nothing compared it to the definition
 * that actually decides. This module IS that comparison.
 *
 * THE KEY, NOT THE VALUE. A dispatcher can plausibly mistype a model identifier (observed three
 * times). It cannot plausibly mistype WHICH AGENT VARIANT it invoked — that's the literal
 * `subagent_type` string it passed to the dispatch tool. So the hand-authored half of a dispatch
 * record becomes `agentType` (e.g. "goldfish-deep"); `model`/`effort` are then DERIVED from the
 * matching agent definition file, not independently hand-typed.
 *
 * FAMILY, NOT EXACT STRING. Agent frontmatter states a TIER alias (`model: sonnet`); dispatch
 * records and briefings state a CONCRETE identifier (`claude-sonnet-5`, per
 * `templates/prompts/goldfish-task.md` field 6, "the CONCRETE model identifier ... not the tier
 * name"). Naive string equality between the two therefore always fails. `MODEL_FAMILY_ALIASES`
 * below is this script's own stated convention for bridging that gap (same shape as
 * `ELEPHANT_STAGE0_MAX_PATHS` in `dispatch-authorship-verify.mjs`: a documented convention, not a
 * value derived from `pipeline.user.yaml`, which this module deliberately does not parse). Effort
 * is compared EXACTLY (no aliasing needed — "xhigh" is "xhigh" everywhere) because effort, not
 * model family, was the half that DID match in the 2026-08-08 incident; model family was the
 * half that silently diverged.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DEFAULT_AGENTS_DIR = join(REPO_ROOT, "plugins", "pipeline-core", "agents");

/**
 * Model-family aliases: agent frontmatter tier name -> the set of concrete identifier prefixes
 * (lowercased) that count as that family. Mirrors the tiers named in `policies/model-policy.md`
 * and the concrete identifiers `pipeline.user.yaml` `models.*` resolves to; NOT parsed from that
 * file (out of this module's scope/budget) — kept here as a small, explicit, documented table so
 * a mismatch is a one-line diff away from being visible, same convention as `ELEPHANT_STAGE0_
 * MAX_PATHS`.
 */
export const MODEL_FAMILY_ALIASES = Object.freeze({
  sonnet: Object.freeze(["claude-sonnet", "sonnet"]),
  opus: Object.freeze(["claude-opus", "opus"]),
  haiku: Object.freeze(["claude-haiku", "haiku"]),
});

/** Parse the YAML-ish frontmatter block (`--- ... ---`) at the top of an agent definition file. */
export function parseAgentFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(String(text ?? ""));
  if (!match) return {};
  const fields = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const fieldMatch = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (!fieldMatch) continue;
    const [, key, rawValue] = fieldMatch;
    fields[key] = rawValue.trim().replace(/^["']|["']$/gu, "");
  }
  return fields;
}

/**
 * Read `plugins/pipeline-core/agents/<agentType>.md` and return its declared `{model, effort}`.
 * Returns null (never throws) when the agent type has no matching definition file — the caller
 * decides whether an unresolvable agentType is a fail or an unverifiable, this module only
 * reports what it found.
 */
export function resolveAgentModel(agentType, { agentsDir = DEFAULT_AGENTS_DIR } = {}) {
  if (typeof agentType !== "string" || agentType.trim() === "") return null;
  const safe = agentType.trim();
  if (!/^[A-Za-z0-9._-]+$/u.test(safe)) return null;
  let raw;
  try {
    raw = readFileSync(join(agentsDir, `${safe}.md`), "utf8");
  } catch {
    return null;
  }
  const frontmatter = parseAgentFrontmatter(raw);
  if (!frontmatter.model) return null;
  return { model: frontmatter.model, effort: frontmatter.effort ?? null };
}

/** True if `concreteModel` (e.g. "claude-sonnet-5") belongs to the `tierAlias` family (e.g. "sonnet"). */
export function modelBelongsToFamily(concreteModel, tierAlias) {
  const normalizedModel = String(concreteModel ?? "").trim().toLowerCase();
  const normalizedTier = String(tierAlias ?? "").trim().toLowerCase();
  if (normalizedModel === "" || normalizedTier === "") return false;
  const prefixes = MODEL_FAMILY_ALIASES[normalizedTier] ?? [normalizedTier];
  return prefixes.some((prefix) => normalizedModel.includes(prefix));
}

/**
 * Compare a dispatch record's recorded `{model, effort}` against the resolved agent definition.
 * Returns a classification string plus a human reason — never throws.
 *
 *   "model-matches"           family + effort both agree with the agent definition.
 *   "model-mismatch"          family or effort disagrees, and no override was declared.
 *   "model-override-declared" the record carries a well-formed `modelOverride` (see below);
 *                              honoured rather than flagged, and reported AS an override so it
 *                              stays visibly distinct from an accidental mismatch.
 *   "model-override-malformed" a `modelOverride` is present but missing its `rationale` — the
 *                              override mechanism itself requires the stated MP-05/07 rationale,
 *                              so an unlabelled override is treated as a plain mismatch.
 *   "agent-definition-unresolved" `agentType` present but no matching agent file / no `model:`
 *                              frontmatter found — silent, not a fail (module cannot tell whether
 *                              the agentType is wrong or the file moved).
 *   "agent-type-absent"        the record carries no `agentType` at all — silent by design; see
 *                              the corpus-compatibility note below.
 *
 * CORPUS COMPATIBILITY: every dispatch record predating this mechanism has no `agentType` field.
 * Absence therefore resolves to "agent-type-absent" (silent), never a mismatch/fail — the same
 * precedent `declaredCommits()`/`declaredPaths()` already set in `dispatch-authorship-verify.mjs`
 * ("most existing records predate the convention").
 */
export function compareRecordedModel(record, { agentsDir = DEFAULT_AGENTS_DIR } = {}) {
  const agentType = record?.agentType;
  if (typeof agentType !== "string" || agentType.trim() === "") {
    return { classification: "agent-type-absent", reason: "record declares no `agentType`; nothing to derive against — predates the convention" };
  }
  const override = record?.modelOverride;
  if (override && typeof override === "object") {
    const hasRationale = typeof override.rationale === "string" && override.rationale.trim() !== "";
    if (!hasRationale) {
      return {
        classification: "model-override-malformed",
        reason: "`modelOverride` present but missing a non-empty `rationale` — MP-05/MP-07 requires a stated rationale for a deviating model; treated as an unlabelled mismatch, not an honoured override",
      };
    }
    return {
      classification: "model-override-declared",
      reason: `explicit override declared: model \`${override.model ?? "(absent)"}\`, effort \`${override.effort ?? "(absent)"}\`, rationale: ${override.rationale}`,
    };
  }
  const resolved = resolveAgentModel(agentType, { agentsDir });
  if (resolved === null) {
    return {
      classification: "agent-definition-unresolved",
      reason: `agentType \`${agentType}\` has no resolvable definition (\`${agentType}.md\` missing or has no \`model:\` frontmatter)`,
    };
  }
  const recordedModel = record?.model;
  const recordedEffort = record?.effort;
  const familyMatches = modelBelongsToFamily(recordedModel, resolved.model);
  const effortMatches =
    resolved.effort === null ||
    String(recordedEffort ?? "").trim().toLowerCase() === String(resolved.effort ?? "").trim().toLowerCase();
  if (familyMatches && effortMatches) {
    return {
      classification: "model-matches",
      reason: `recorded \`${recordedModel}\`/\`${recordedEffort}\` agrees with \`${agentType}\` definition (\`${resolved.model}\`/\`${resolved.effort}\`)`,
    };
  }
  return {
    classification: "model-mismatch",
    reason: `recorded \`${recordedModel}\`/\`${recordedEffort}\` disagrees with \`${agentType}\` definition (\`${resolved.model}\`/\`${resolved.effort}\`) and no override was declared`,
  };
}
