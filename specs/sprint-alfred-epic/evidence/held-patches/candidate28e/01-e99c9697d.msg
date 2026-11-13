fix(sbom): remove the false blocks and passes of the JVM, .NET and private-registry readers

- Maven: a test-scope dependency is not required (the cyclonedx-maven-plugin
  leaves the test scope out by default); profile dependencies are not direct;
  project.parent.* properties resolve; an unresolved name part matches any
  value in that part; the help names makeAggregateBom/makeBom and outputDirectory
- Gradle and NuGet lockfiles cover only their own project directory
- a bom.json that is not JSON is invalid instead of silently skipped
- a UTF-8 byte-order mark is removed before reading; the digest binds raw bytes
- pnpm 5/6 keys with a registry host and yarn v1 entries from registries without
  a /-/ tarball path (GitHub Packages) are registry packages; an npm: alias to a
  scoped package resolves; an owner/repo shorthand stays partial

AI-Assisted: true
Dispatch: stage-0 (elephant)
