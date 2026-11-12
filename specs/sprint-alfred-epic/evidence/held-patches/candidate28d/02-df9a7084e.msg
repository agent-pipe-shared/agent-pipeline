docs(sbom): amend ADR-0091 with the readers for the common lockfiles

The amendment of 2026-11-12 (PO tiles) names the added readers, the rules
every reader follows (registry package, project member, git/path/URL pin,
unknown version, unreadable entry; no URL is written), the Maven rule (pom
plus a covering CycloneDX file) and the manifests that need their lockfile.

- ADR-0032, the operating model, the close-feature skill, the audit bundle
  README text and the state line name the wider reader set.
- The vendored canon copy is regenerated.

AI-Assisted: true
Dispatch: stage-0 (elephant)
