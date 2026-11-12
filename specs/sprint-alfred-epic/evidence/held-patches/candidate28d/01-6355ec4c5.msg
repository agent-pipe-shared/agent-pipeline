feat(sbom): read the common lockfiles of JavaScript, Python, JVM, .NET, Ruby, PHP, Dart, Swift, Elixir and C/C++ at the close

Adds lib/sbom-lockfile-readers.mjs: yarn.lock (v1 and Berry), pnpm-lock.yaml
(5.x, 6.x, 9.x), bun.lock, uv.lock, Gradle lockfiles, NuGet packages.lock.json,
Gemfile.lock, composer.lock, pubspec.lock, Package.resolved, mix.lock,
conan.lock and committed CycloneDX files. Maven pom.xml is read for its direct
dependencies and stays partial unless a CycloneDX file in its directory or
above lists every one of them.

- Registry packages are components; workspace, link and project members are
  left out; git, path and URL pins are partial and no URL is ever written.
- An unknown format version is unsupported; an unreadable entry is invalid.
- Manifests of the new ecosystems without their lockfile are partial, with
  help that names the switch to turn on (Gradle locking, NuGet lockfile).
- The module is a kernel path (GMWKC01); suite sbom-lockfile-readers-tests.

AI-Assisted: true
Dispatch: stage-0 (elephant)
