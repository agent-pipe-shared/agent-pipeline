#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Generate the vendored canon copies under `plugins/pipeline-core/` from their
 * repo-root originals — analogous to `generate-agent-obligations.mjs`, but this
 * generator copies files rather than rendering one document.
 *
 * WHY THIS EXISTS. Confirmed 2026-08-10 by inspecting a real installed plugin
 * cache: a hosted/consumer project that only has the plugin installed has no
 * `templates/`, `roles/`, or `guardrails/` directory reachable at all — every
 * canon reference `SKILL.md` files and hook comments name by a repo-root-relative
 * path is structurally unreachable there. An immediate fix hand-copied 37 files
 * into `plugins/pipeline-core/` (commits `4d0f8038..e2a3072f`/`14ef8767`, GF-107/
 * GF-108). This generator replaces that one-time copy with a build step, so the
 * repo-root originals stay the single source of truth and the vendored copies
 * cannot silently drift the moment either side is edited without the other —
 * tracked by
 * `backlog/items/2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`.
 *
 * CLASSIFICATION SCHEME (the PO's added scope, same backlog item): a hosted
 * project's plugin install must never receive Pipeline-self-only content —
 * decisions about how the Pipeline governs its OWN repo, as opposed to content
 * meant to apply to, or inform, any project the Pipeline governs. This
 * generator is deliberately an ALLOWLIST of explicitly classified UNIVERSAL
 * sources, never a blanket directory copy with exclusions bolted on:
 *
 *   - `guardrails/*.md`, `roles/*.md`, `templates/prompts/*.md` — auto-discovered
 *     (every file in these three directories is universal by construction: each
 *     one's own header states a dual/any-project audience — e.g.
 *     `guardrails/git.md`: "Audience: every agent performing git operations in
 *     any pipeline-bound project and in this repo (self-application)";
 *     `roles/goldfish.md`: "Paste it into a subagent system prompt ... [for]
 *     the fresh-context executor" of any dispatched task. A file landing in one
 *     of these three directories is universal BY the directory's own contract;
 *     nothing in them is written Pipeline-repo-only. Adding a new file to any of
 *     the three vendors it automatically on the next generation — this is the
 *     "no hand-copy again" property the backlog item asks for.
 *   - `docs/push-release-flow.md` — one standalone file, explicitly dual-purpose
 *     by its own text: it exists BECAUSE a third-party adopter found the flow
 *     unusable (`backlog/items/2026-08-07-push-release-flow-unusable-for-third-
 *     party-adopters.md`), and it describes both supported `gates.push_approval`
 *     modes, using this repo's own config as the worked example.
 *   - `docs/adr/*` — NOT auto-discovered (this repo carries 60+ ADRs, most of
 *     them decisions about the Pipeline's own internal build, e.g. the Nova
 *     sprint infrastructure). Only the ADRs the universal corpus above actually
 *     cites are vendored, as an explicit, hand-verified list (`UNIVERSAL_ADRS`).
 *     `docs/adr/0015-self-application.md` is the sharpest confirmation the split
 *     is real and already applied correctly once: it IS linked from vendored
 *     `docs/adr/0012-handover-canonicalization.md`, and was deliberately left
 *     OUT of the vendored set anyway (`check-doc-contracts.mjs`'s
 *     `VENDORED_LINK_EXCLUSIONS` treats that link as a known dead one) — 0015 is
 *     about the Pipeline's OWN relationship to its own ruleset ("there is no
 *     separate meta-ruleset for building the Pipeline vs. working under it"),
 *     which no hosted project needs to read. See `SELF_ONLY_EXCLUSIONS` below
 *     for this and the other confirmed self-only examples.
 *
 * WHAT THIS GENERATOR DELIBERATELY DOES NOT DO. It does not rewrite the
 * relative Markdown links a vendored ADR inherits from its repo-root directory
 * (e.g. `docs/adr/0005-quality-gates-dod.md`'s `../operating-model.md`, which
 * only resolves from `docs/adr/`, not from the vendored location). Rewriting
 * would break the byte-identity `check-doc-contracts.test.mjs` asserts
 * ("every shipped vendored link exclusion is justified by a byte-identical
 * origin") and fire `staleVendoredExclusionFindings` the moment the two diverge.
 * Byte-for-byte is the deliberate, narrower property this generator holds;
 * link-rewriting stays a separate, not-yet-scoped follow-up (see this file's
 * own module doc note in `check-doc-contracts.mjs`, "GF-110").
 *
 * WHAT IS DERIVED, AND WHAT IS NOT. The guardrails/roles/templates-prompts
 * membership is DERIVED (directory listing at generation time — add a file,
 * get it vendored, no generator edit needed). The ADR list and the
 * self-only-exclusion list are HAND-MAINTAINED (no component exports "which
 * ADR is cited by which universal doc" as data) — marked as such here, and
 * pinned by `generate-vendored-canon.test.mjs`'s completeness assertion: every
 * tracked file under the four vendored plugin subtrees must have a manifest
 * entry, and every manifest entry's origin and destination must both exist,
 * so an un-vendored addition or a stale entry turns the suite red rather than
 * silently drifting.
 *
 * Usage:
 *   node harness/scripts/generate-vendored-canon.mjs             # write the vendored copies
 *   node harness/scripts/generate-vendored-canon.mjs --check      # verify only, exit 2 on drift
 *   node harness/scripts/generate-vendored-canon.mjs --root <dir>  # derive from another checkout (used by tests)
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../../plugins/pipeline-core/lib/entrypoint.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENDOR_PREFIX = "plugins/pipeline-core/";

/**
 * Directories whose entire tracked content is universal by construction (see
 * the module doc above for the per-directory evidence). Auto-discovered at
 * generation time, sorted for determinism.
 */
export const UNIVERSAL_DIRECTORIES = Object.freeze([
  {
    dir: "guardrails",
    reason:
      "Every file states a dual/any-pipeline-bound-project audience in its own header " +
      "(e.g. guardrails/git.md: \"any pipeline-bound project and in this repo (self-application)\"); " +
      "these are the provable prescriptive/prohibitive rules the Pipeline hands to any project it governs.",
  },
  {
    dir: "roles",
    reason:
      "Standalone role contracts explicitly meant to be pasted into any subagent's system prompt or " +
      "dispatch briefing (roles/goldfish.md: \"Paste it into a subagent system prompt or reference it " +
      "from the dispatch briefing\") -- not Pipeline-repo-internal process notes.",
  },
  {
    dir: "templates/prompts",
    reason:
      "Copy-paste-ready dispatch prompts (Goldfish/Critic/Elephant briefings) used to run ANY project " +
      "under the Pipeline, including templates/prompts/agent-obligations.md, itself generated by " +
      "generate-agent-obligations.mjs -- this generator now produces its vendored copy too, subsuming " +
      "the prior hand-copy for that one file as well.",
  },
]);

/** Single standalone files outside the three universal directories above. */
export const UNIVERSAL_STANDALONE_FILES = Object.freeze([
  {
    path: "docs/push-release-flow.md",
    reason:
      "Explicitly dual-purpose by its own text: written because a third-party adopter found the flow " +
      "unusable (backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md), and " +
      "it documents both supported gates.push_approval modes, using this repo's own config as the worked " +
      "example rather than as the only audience.",
  },
  {
    path: "docs/operating-model.md",
    reason:
      "Cited as the normative source by every vendored roles/*.md and guardrails/*.md file (e.g. " +
      "roles/goldfish.md: \"Normative source: docs/operating-model.md\"). Re-verified 2026-08-29 " +
      "(backlog/items/2026-08-29-operating-model-not-shipped-with-the-plugin.md): the prior SELF_ONLY " +
      "classification's premise -- \"the vendored artifacts are self-sufficient\" -- does not hold, since " +
      "the vendored artifacts themselves cite this file as their own normative source. Vendored as a " +
      "single standalone doc rather than rewriting every citing role/guardrail file.",
  },
]);

/**
 * ADRs cited by the universal corpus above. HAND-MAINTAINED (see module doc):
 * docs/adr/ holds 60+ decisions, most of them about the Pipeline's own internal
 * build (Nova sprint infrastructure, release tooling); only the ones the
 * universal guardrails/roles/templates-prompts/push-release-flow docs actually
 * link to belong here. Cross-checked against the citation evidence already
 * recorded in check-consumer-safe-paths.mjs's ALLOWLIST comments and
 * check-doc-contracts.mjs's VENDORED_LINK_EXCLUSIONS.
 */
export const UNIVERSAL_ADRS = Object.freeze([
  { path: "docs/adr/0003-role-implementation-subagents.md", reason: "Cited by roles/*.md (Custom Subagent implementation)." },
  { path: "docs/adr/0005-quality-gates-dod.md", reason: "Cited by guardrails/quality-gates.md." },
  { path: "docs/adr/0008-permissions-worktree-policy.md", reason: "Cited by guardrails/git.md (GIT-05 worktree policy)." },
  { path: "docs/adr/0010-session-bootstrap.md", reason: "Cited by templates/prompts/session-bootstrap-check.md." },
  { path: "docs/adr/0011-language-policy.md", reason: "Cited by guardrails/git.md (GIT-01 English-canonical Public Core)." },
  { path: "docs/adr/0012-handover-canonicalization.md", reason: "Cited by guardrails/git.md (GIT-06 handover file)." },
  { path: "docs/adr/0013-git-guard-union.md", reason: "Cited by guardrails/git.md (deterministic enforcement precedence)." },
  { path: "docs/adr/0014-critic-contract.md", reason: "Cited by roles/critic.md." },
  { path: "docs/adr/0017-push-policy-standing-approval.md", reason: "Cited by guardrails/git.md (GIT-05 push gate)." },
  { path: "docs/adr/0027-gate-philosophy.md", reason: "Cited by guardrails/quality-gates.md and guardrails/security.md." },
  { path: "docs/adr/0028-manifest-approach.md", reason: "Cited by templates/prompts/kickoff-new-project.md." },
  { path: "docs/adr/0029-file-handoffs-status.md", reason: "Cited by guardrails/security.md." },
  { path: "docs/adr/0032-project-doc-structure.md", reason: "Cited by templates/prompts/kickoff-new-project.md." },
  { path: "docs/adr/0033-release-promotion-phase.md", reason: "Cited by guardrails/deploy.md." },
  { path: "docs/adr/0047-model-free-advisor-preflight-v2.md", reason: "Cited by roles/elephant.md (advisor preflight)." },
  { path: "docs/adr/0055-critical-human-proof-waiver.md", reason: "Cited by guardrails/security.md / roles/elephant.md (critical-action human proof)." },
  { path: "docs/adr/0056-push-approval-mode.md", reason: "Cited by guardrails/git.md (GIT-05, gates.push_approval) and docs/push-release-flow.md." },
  { path: "docs/adr/0061-uniform-human-approval-ceremony.md", reason: "Cited by guardrails/git.md (GG-03 second route) and docs/push-release-flow.md." },
  { path: "docs/adr/0064-release-preflight-consent-reuses-the-uniform-approval-ceremony.md", reason: "Cited by docs/push-release-flow.md ('A fourth kind: release-preflight')." },
  { path: "docs/adr/0074-port-authorize-critical-ceremony.md", reason: "Cited by docs/push-release-flow.md (the ported `authorize-critical` single-command ceremony)." },
]);

/**
 * Confirmed Pipeline-self-only examples, documented (not filtered by code --
 * this generator is an allowlist, so these simply never appear in it). Kept
 * here so the classification is visible as a table, not just an absence.
 */
export const SELF_ONLY_EXCLUSIONS = Object.freeze([
  {
    path: "docs/adr/0015-self-application.md",
    reason:
      "Linked from vendored docs/adr/0012-handover-canonicalization.md but deliberately excluded: governs " +
      "the Pipeline's OWN relationship to its own ruleset (\"no separate meta-ruleset for building the " +
      "Pipeline vs. working under it\", ADR-0015) -- a decision about this repo, not a rule any hosted " +
      "project follows. Confirmed as a known dead link by check-doc-contracts.mjs's VENDORED_LINK_EXCLUSIONS.",
  },
  {
    path: "docs/state.md",
    reason: "The Pipeline's own decision register / handover file -- Pipeline-repo session state, not portable canon.",
  },
  {
    path: "harness/",
    reason:
      "Self-application tooling that only exists in the Pipeline's own source checkout by design -- already " +
      "encoded as a SOURCE_ONLY_PREFIXES entry in check-consumer-safe-paths.mjs.",
  },
  {
    path: "specs/sprint-nova-epic/",
    reason:
      "Nova-sprint internal planning for building the Pipeline itself -- already encoded as a " +
      "SOURCE_ONLY_PREFIXES entry in check-consumer-safe-paths.mjs.",
  },
]);

/**
 * Explicitly out of THIS item's scope, and neither universal-vendored nor
 * self-only-excluded: project-artifact templates (templates/*.md outside
 * templates/prompts/, e.g. spec.md, adr.md, retro.md). These are meant to be
 * copied INTO a hosted project's own repo as ITS template, not read by a
 * dispatched agent as Pipeline canon -- the reachability defect this whole
 * item traces to (SKILL.md/hook comments naming an unreachable path) never
 * named them. Left unclassified rather than guessed; not a self-only call.
 */
export const OUT_OF_SCOPE_NOTE =
  "templates/*.md outside templates/prompts/ are project-artifact templates, out of this generator's " +
  "reachability-driven scope -- not vendored, not classified as self-only.";

function posixJoin(...parts) {
  return parts.join("/");
}

function listMarkdownFiles(rootDir, relDir) {
  const absDir = join(rootDir, ...relDir.split("/"));
  return readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => posixJoin(relDir, entry.name))
    .sort();
}

/**
 * The full manifest: one entry per vendored file, origin -> destination.
 * `directories`/`standaloneFiles`/`adrs` are overridable so a test can exercise
 * this against a minimal fixture root instead of every real vendored file.
 */
export function computeManifest({
  rootDir = REPO_ROOT,
  directories = UNIVERSAL_DIRECTORIES,
  standaloneFiles = UNIVERSAL_STANDALONE_FILES,
  adrs = UNIVERSAL_ADRS,
} = {}) {
  const entries = [];
  for (const { dir, reason } of directories) {
    for (const origin of listMarkdownFiles(rootDir, dir)) {
      entries.push({ origin, dest: `${VENDOR_PREFIX}${origin}`, classification: "universal", reason });
    }
  }
  for (const { path, reason } of standaloneFiles) {
    entries.push({ origin: path, dest: `${VENDOR_PREFIX}${path}`, classification: "universal", reason });
  }
  for (const { path, reason } of adrs) {
    entries.push({ origin: path, dest: `${VENDOR_PREFIX}${path}`, classification: "universal", reason });
  }
  entries.sort((a, b) => (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0));
  return entries;
}

/**
 * Compute the manifest and (by default) write every destination byte-for-byte
 * from its origin. `write: false` computes without touching disk (used by
 * `--check` and by the drift test, which asserts the computed content follows
 * a mutated source without ever writing it). `manifestOptions` forwards to
 * `computeManifest` (test-only fixture override).
 */
export function generateVendoredCanon({ rootDir = REPO_ROOT, write = true, manifestOptions = {} } = {}) {
  const manifest = computeManifest({ rootDir, ...manifestOptions });
  const results = [];
  for (const entry of manifest) {
    const originAbs = join(rootDir, ...entry.origin.split("/"));
    const destAbs = join(rootDir, ...entry.dest.split("/"));
    const content = readFileSync(originAbs);
    let changed = true;
    try {
      changed = !readFileSync(destAbs).equals(content);
    } catch {
      changed = true;
    }
    if (write && changed) {
      mkdirSync(dirname(destAbs), { recursive: true });
      writeFileSync(destAbs, content);
    }
    results.push({ ...entry, bytes: content.length, changed });
  }
  return { manifest, results };
}

function fileExists(absPath) {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/**
 * `--check` verification: every manifest entry's destination must exist and be
 * byte-identical to its origin, with no write. Returns the list of problems
 * (empty means clean).
 */
export function checkVendoredCanon({ rootDir = REPO_ROOT } = {}) {
  const { results } = generateVendoredCanon({ rootDir, write: false });
  const problems = [];
  for (const entry of results) {
    const destAbs = join(rootDir, ...entry.dest.split("/"));
    if (!fileExists(destAbs)) {
      problems.push(`${entry.dest}: missing -- run: node harness/scripts/generate-vendored-canon.mjs`);
      continue;
    }
    if (entry.changed) {
      problems.push(`${entry.dest}: stale (differs from ${entry.origin}) -- run: node harness/scripts/generate-vendored-canon.mjs`);
    }
  }
  return problems;
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rootDir = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : REPO_ROOT;
  if (argv.includes("--check")) {
    const problems = checkVendoredCanon({ rootDir });
    if (problems.length) {
      for (const problem of problems) process.stderr.write(`VENDORED-CANON-DRIFT ${problem}\n`);
      process.stderr.write(`Vendored-canon check failed: ${problems.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(`Vendored-canon check passed: all vendored files match their repo-root originals.\n`);
  } else {
    const { results } = generateVendoredCanon({ rootDir, write: true });
    const written = results.filter((entry) => entry.changed).length;
    process.stdout.write(`wrote ${written}/${results.length} vendored canon file(s) under ${VENDOR_PREFIX}\n`);
  }
}
