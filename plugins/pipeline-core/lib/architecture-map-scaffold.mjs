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
    bytes: "# Agent-Pipeline project entry\n\nThis file is a pointer, not a second ruleset. At a real session start or runtime re-entry, invoke `pipeline-core:pipeline-start`.\n\nRead the [architecture map](architecture/map/index.md) before planning or changing owned implementation. Preserve this project-owned file when updating the plugin.\n",
  };
}
