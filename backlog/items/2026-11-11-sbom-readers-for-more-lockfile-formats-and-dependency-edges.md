---
schema: pipeline.backlog-item.v1
id: pipeline.sbom-readers-for-more-lockfile-formats-and-dependency-edges
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: Candidate 28c design; ADR-0091 decisions 2 and 4
sprint: alfred
done_when: manual
---

# SBOM readers for more lockfile formats, and dependency edges

## Description

The close reads npm, Python (poetry, Pipfile, pinned requirements), Go and Rust lockfiles. `yarn.lock`, `pnpm-lock.yaml`, `uv.lock`, Maven, Gradle, Gemfile, Composer, NuGet and similar files are named as `unsupported` and stop the close until a human overrides it. The component list is flat: dependency edges are not recorded (`edges: "not-recorded"`). Paths under fixture, vendor and example directories are not observed, which a monorepo may need to configure.

## Done when

Rows for the most used further formats are added to `SBOM_READERS` with tests, and a decision is taken on recording edges and on a configurable set of observed paths.
