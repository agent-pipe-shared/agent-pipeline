fix(sbom): read private-registry lockfile entries as registry packages

A Berry resolution with a ::__archiveUrl suffix made the whole yarn.lock
invalid, and a pnpm package whose tarball URL sits next to its integrity
hash (GitLab, Artifactory) was partial. Both are registry packages served by
a private registry; their URLs are still never written.

- Fixtures for an Artifactory yarn v1 path, a Nexus Berry archive URL and a
  GitLab pnpm tarball; the whole result is checked for URLs and credentials.
- finish-feature and sbom-close tests that used yarn.lock or pom.xml as a
  format without a reader now use Podfile.lock and build.sbt.
- ADR-0091 amendment names the private-registry forms.

AI-Assisted: true
Dispatch: stage-0 (elephant)
