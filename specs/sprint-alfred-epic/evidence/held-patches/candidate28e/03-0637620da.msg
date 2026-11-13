feat(sbom): read the packages.config of .NET Framework projects at the close

- every package with its one exact version, the transitive ones included;
  developmentDependency="true" is a dev component
- a version range or an entry without id and version makes the file invalid
- packages.config leaves the unsupported names; ADR-0091 amended (PO tile
  2026-11-12)

AI-Assisted: true
Dispatch: stage-0 (elephant)
