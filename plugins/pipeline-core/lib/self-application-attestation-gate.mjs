// SPDX-License-Identifier: SUL-1.0

/**
 * The bootstrap origin/content attestation gate: whether the attestation runs
 * at all, and whether its result counts as failed. Consumed by
 * `observePipelineStartPreflight` in `../scripts/pipeline-start-preflight.mjs`,
 * whose `status` ternary folds the returned `failed` into
 * `plugin-refresh-required`.
 *
 * WHY THIS IS A MODULE OF ITS OWN. The gate-strength guard family matches
 * whole file paths, never lines or symbols: `gateStrengthRuleFor()` in
 * `../hooks/guard-gate-strength.mjs` normalizes a repo-relative path and
 * compares it to `rule.path`, and the shell lane in
 * `../hooks/guard-lifecycle-ready.mjs` derives its needles as
 * `basename(rule.path)`. A file is therefore the only available unit of
 * protection. This module is that unit: it holds the `.git`-presence
 * predicate, the per-runner observer default, the allowlist comparison and the
 * `normalizeRulesetSource` pass -- and no calling code -- so the
 * `GATE_STRENGTH_PATHS` entry GS-9 can cover the gate's whole composition
 * (which terms are computed, whether the observer is consulted at all, how the
 * two disjuncts combine) without freezing the unrelated maintenance surface of
 * `pipeline-start-preflight.mjs`. Same reasoning as GS-8 one level down, whose
 * module (`./public-core-origin-allowlist.mjs`) this one compares against. See
 * design
 * `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
 * §I.1.2-§I.1.3.
 *
 * WHAT GS-9 DOES NOT COVER (QG-05 -- a gate states its blind spots next to the
 * gate; §I.1.3's residual block is the authoritative statement and this is its
 * summary, not a stronger claim):
 *
 *   1. The wiring stays outside. The import, the call site and the
 *      `|| attestationFailed` disjunct of the caller's `status` ternary live in
 *      `pipeline-start-preflight.mjs`, which is not gate-strength-protected and
 *      (per §I.1.2) cannot be short of protecting the whole file. The
 *      compensating control for the wiring is behavioural test coverage, not a
 *      guard.
 *   2. The gate's INPUTS are not covered. Of the three modules imported below
 *      only `./public-core-origin-allowlist.mjs` is protected (GS-8).
 *      `./public-core-observation.mjs` is not, and it supplies BOTH operands of
 *      `originAllowlisted`; `./ruleset-source.mjs` is not, and it decides the
 *      weaker second disjunct.
 *   3. For the installed copy that is actually enforcing, the rule that fires
 *      is GS-6 (the live-plugin rule), not GS-9 -- and GS-6 is the one
 *      window-liftable gate-strength rule. This module is deliberately not in
 *      `NEVER_LIFTABLE_KERNEL_PATHS`; GS-8's module is not either, and whether
 *      the kernel list should grow is one ADR-0058 decision about both.
 *   4. Each lane refuses only in a checkout it recognises as governed, and the
 *      two lanes do not mean the same thing by that: the write lane
 *      (`Edit`/`Write`/`NotebookEdit`) tests five inline governance markers,
 *      the shell lane tests its own, longer `GOVERNANCE_MARKERS` list, and the
 *      two diverge in both directions.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "./public-core-observation.mjs";
import { PUBLIC_SELF_APPLICATION_ORIGINS } from "./public-core-origin-allowlist.mjs";
import { normalizeRulesetSource, RULESET_SOURCE_SCHEMA } from "./ruleset-source.mjs";

/**
 * Whether `pluginRoot` sits inside the self-application/local-development git
 * checkout layout the origin/content attestation is built for (design
 * bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A -- PO-confirmed F2
 * fix direction, 2026-08-07): a `.git` entry at the repository root two
 * directories above `pluginRoot` (`<clone>/plugins/pipeline-core` ->
 * `<clone>`).
 *
 * **Corrected per Critic finding F-D (MINOR, delta re-review `7aa84f0`):**
 * this is a cheap presence check, not a re-implementation of the layout
 * `resolveSourceLayout()` in `public-core-observation.mjs` requires --
 * the two do not verify the same thing. `resolveSourceLayout()` checks three
 * different, unrelated conditions and never inspects `.git` at all: that
 * `pluginRoot`'s basename is exactly `"pipeline-core"`, its parent's basename
 * is exactly `"plugins"`, and each of `pluginRoot`/its parent/its
 * grandparent is a real, canonical (`realpathSync`-stable), non-symlink
 * directory. A missing repository at that layout only surfaces later,
 * indirectly, when `observeGit()`'s `git` subprocess calls against that
 * directory fail (`SNT-A2-GIT-UNAVAILABLE`) -- `resolveSourceLayout()` itself
 * has no dedicated `.git`-presence check for this function to mirror. This
 * function, conversely, never checks the `pipeline-core`/`plugins` basename
 * naming `resolveSourceLayout()` requires; it only tests for a `.git` entry
 * two directories up from whatever path it is given. A real
 * marketplace-installed plugin copy (e.g.
 * `~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`) has no
 * `.git` at all, at this path or any other -- this is a cheap, read-only
 * filesystem check, never a `git` subprocess, and never throws for a
 * missing/unreadable path (`existsSync` fails closed to `false`).
 */
export function pluginRootHasSelfApplicationGit(pluginRoot) {
  return existsSync(resolve(pluginRoot, "..", "..", ".git"));
}

/**
 * Origin/content attestation of the loaded plugin itself (design:
 * bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A.2-§A.5). Mirrors
 * the calling pattern already established in private-overlay-activation.mjs:
 * `observe` defaults per-runner, self-referentially, to the same reused
 * Public-Core observers already proven safe on the private-overlay path.
 * Skipped when the manifest itself is unreadable (`version` falsy) -- the
 * caller's sole `const status =` ternary, in `observePipelineStartPreflight`
 * (`../scripts/pipeline-start-preflight.mjs`), already hard-fails to
 * "plugin-identity-unavailable" in that case regardless of this result. A
 * negative result never invents a new hard-fail status; it only widens that
 * ternary's existing "plugin-refresh-required" branch. (Cited by construct,
 * not by line: the line range this comment originally carried was already
 * stale by the commit that extracted this module.)
 *
 * Gated on `.git` presence at the self-application layout's repository root
 * (Critic finding F2, WP2-WP3-partA-rework-1, PO-confirmed fix direction):
 * the observer's `resolveSourceLayout`/`observeGit` require a real git
 * checkout and reject unconditionally otherwise. A real marketplace-
 * installed plugin copy has no `.git` at all, so calling the observer there
 * made `attestationFailed` permanently true for every real install. When no
 * `.git` is present the attestation is skipped entirely -- not attempted,
 * not failed -- and that same `const status =` ternary in
 * `observePipelineStartPreflight` falls
 * through to exactly the version/installedIdentity/installedVersion decision
 * that predates this feature. A real integrity check for the installed
 * non-git case is explicitly out of scope; see the design doc's Part A §A.7
 * (the non-git-flat-copy exclusion entry added there for this exact case) and
 * §A.5 case 2.
 */
export function evaluateSelfApplicationAttestation({ pluginRoot, runner, version, observe }) {
  const resolvedObserve = observe
    ?? (runner === "codex" ? observeCodexPublicCoreIdentity : observePublicCoreIdentity);
  let attempted = false;
  let attestationFailed = false;
  if (version && pluginRootHasSelfApplicationGit(pluginRoot)) {
    attempted = true;
    const observation = resolvedObserve({ sourcePluginRoot: pluginRoot, installedPluginRoot: pluginRoot }, {});
    const originAllowlisted = observation?.status === "ready"
      && PUBLIC_SELF_APPLICATION_ORIGINS.has(observation.candidate?.repository);
    // sourcePluginRoot === installedPluginRoot by construction here, so
    // loadedIdentity/installedIdentity are necessarily equal -- normalizeRulesetSource
    // is exercised for its schema-closure value and as a genuine production
    // caller, not as an independent content-hash match (design §A.4, PO-resolved).
    const normalized = observation?.status === "ready"
      ? normalizeRulesetSource({
          schema: RULESET_SOURCE_SCHEMA,
          runner,
          selectedPlugin: { id: observation.plugin.name, version: observation.plugin.version },
          source: { class: "self-application" },
          loadedIdentity: { status: "available", algorithm: "content-sha256", value: observation.plugin.contentSha256 },
          installedIdentity: { status: "available", algorithm: "content-sha256", value: observation.plugin.contentSha256 },
        })
      : null;
    attestationFailed = !originAllowlisted || normalized?.status !== "ready";
  }
  return { attempted, failed: attestationFailed };
}
