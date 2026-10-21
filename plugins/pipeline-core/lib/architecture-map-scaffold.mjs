// SPDX-License-Identifier: SUL-1.0
/** Pure portable seed: caller owns authenticated create-only publication. */
export function initialGreenfieldMapTargets(classification) {
  if (!["fresh", "fresh-host-managed"].includes(classification)) return [];
  return [
    { path: "architecture/map/index.md", bytes: "# Architecture Map\n\nStatus: design-pending. Coverage: unknown.\n\nThe project has no designed modules yet. Define bounded module responsibilities,\nowned paths and contracts in the initial design before implementation.\n\n[Machine inventory](inventory.json)\n\nThis scaffold is neither architecture adoption nor measured fitness evidence.\n" },
    { path: "architecture/map/inventory.json", bytes: `${JSON.stringify({ schema: "pipeline.architecture-map-scaffold.v1", origin: "greenfield-bootstrap", status: "design-pending", coverage: "unknown", modules: [], designSource: null }, null, 2)}\n` },
  ];
}

/** Separate create-only root pointer: it is never part of the map's byte-bound
 * scaffold, so later project-owned AGENTS.md edits do not stale materialization. */
export function initialGreenfieldAgentEntryTarget(classification) {
  if (!["fresh", "fresh-host-managed"].includes(classification)) return null;
  return {
    path: "AGENTS.md",
    bytes: "# Agent-Pipeline project entry\n\nThis file is a pointer, not a second ruleset. At a real session start or runtime re-entry, invoke `pipeline-core:pipeline-start`.\n\nRead the [architecture map](architecture/map/index.md) before planning or changing owned implementation. Keep this project's architecture decisions in `docs/adr/` (see `docs/adr/README.txt`). Preserve this project-owned file when updating the plugin.\n",
  };
}

const DECISION_RECORD_HINT = `Architecture decisions of this project live in this directory.

The agent working on this project keeps them here actively: when a change makes a
choice that is costly to reverse, shapes a public contract, or sets a quality
attribute, record it as an ADR before implementing it. Do not leave such
decisions only in chat, commit messages or code comments.

How: use the skill \`pipeline-core:architecture-decision\`. It assesses whether a
decision is architecturally significant and drafts the record.
- Markdown record: docs/adr/XXXX-<slug>.md (four-digit number, next free one).
- Companion sidecar: docs/adr/XXXX-<slug>.json (the skill states the schema and
  the digest of the Markdown bytes).
- Start from docs/adr/templates/adr-template.md.

This hint and the template are not decision records: they are .txt and sit in a
subdirectory on purpose, so the decision reader ignores them. Do not add any other
.md or .json file directly in this directory without its pair.

The directory must exist and stay tracked: a missing docs/adr/ stops the move to
implementation (ARCH-DECISION-SOURCE-UNAVAILABLE).
`;

const DECISION_RECORD_TEMPLATE = `# XXXX: <Decision title>

Status: proposed
Date: YYYY-MM-DD

## Context

What forces the decision: requirements, constraints, the quality attribute at stake.

## Decision

The choice, in one or two sentences, stated as a commitment.

## Consequences

What becomes easier, what becomes harder, what must be kept true afterwards.

## Affected Contracts

Public interfaces, data formats or modules (by architecture map module id) bound by this decision.
`;

/** Separate create-only decision-record directory seed (D80). Like the agent entry
 * it is outside the map's byte-bound scaffold. The hint is .txt and the template sits
 * in a subdirectory so neither enters the ADR *.md/*.json namespace the reader scans. */
export function initialGreenfieldDecisionRecordTargets(classification) {
  if (!["fresh", "fresh-host-managed"].includes(classification)) return [];
  return [
    { path: "docs/adr/README.txt", bytes: DECISION_RECORD_HINT },
    { path: "docs/adr/templates/adr-template.md", bytes: DECISION_RECORD_TEMPLATE },
  ];
}
