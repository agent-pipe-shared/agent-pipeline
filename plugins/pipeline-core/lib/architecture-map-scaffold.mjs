// SPDX-License-Identifier: SUL-1.0
/** Pure portable seed: caller owns authenticated create-only publication. */
export function initialGreenfieldMapTargets(classification) {
  if (!["fresh", "fresh-host-managed"].includes(classification)) return [];
  return [
    { path: "architecture/map/index.md", bytes: "# Architecture Map\n\nStatus: design-pending. Coverage: unknown.\n\nThe project has no designed modules yet. Define bounded module responsibilities,\nowned paths and contracts in the initial design before implementation.\n\n[Machine inventory](inventory.json)\n\nThis scaffold is neither architecture adoption nor measured fitness evidence.\n" },
    { path: "architecture/map/inventory.json", bytes: `${JSON.stringify({ schema: "pipeline.architecture-map-scaffold.v1", origin: "greenfield-bootstrap", status: "design-pending", coverage: "unknown", modules: [], designSource: null }, null, 2)}\n` },
  ];
}
