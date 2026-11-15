// SPDX-License-Identifier: SUL-1.0
/**
 * C28e (PO tiles 2026-11-12): the ONE machine-readable list of every program the Pipeline needs on a machine, and of the optional ones it can use.
 *
 * It feeds three readers and has no second copy anywhere:
 *   - the user document docs/toolchain.md (rendered by lib/toolchain-doc.mjs, written by the source repository's generator script, drift-checked
 *     by lib/toolchain-registry.test.mjs),
 *   - the toolchain preflight (scripts/toolchain-preflight.mjs): the major-version floors it checks and the document pointer it prints,
 *   - the environment readiness findings the start preflight carries (each scanner finding names its class and its section of the document).
 *
 * Classes: `required` (every machine that runs the Pipeline: the close needs it), `required-with-infrastructure` (C29e, ADR-0103: needed only
 * where the project's tracked files hold a Dockerfile/Containerfile, a Terraform file or a Kubernetes manifest), `required-to-sign` (the machine of the person who signs approvals,
 * the default push gate), `optional` (a feature that works without it, or has a fallback), `project-setting` (a switch in the project's own build,
 * not a program; named so the SBOM help and this list agree).
 *
 * The install routes are what a PERSON runs in their own terminal (in a Claude session with the `!` prefix), never the preflight: the preflight
 * installs nothing and prints no command (capability contract W7-2), so these texts reach only the document. A route names the vendor's official
 * source; the result must land in a directory the trusted resolver accepts (lib/trusted-tool-resolution.mjs). Commands and paths are written as
 * Markdown code spans.
 */

export const TOOLCHAIN_REGISTRY_SCHEMA = "pipeline.toolchain-registry.v1";
export const TOOL_CLASSES = Object.freeze(["required", "required-with-infrastructure", "required-to-sign", "optional", "project-setting"]);
export const TOOL_PLATFORMS = Object.freeze(["linux", "darwin", "win32"]);

const tool = (entry) => Object.freeze({ ...entry, floor: Object.freeze({ ...entry.floor }), install: Object.freeze({ ...entry.install }), usedBy: Object.freeze([...entry.usedBy]) });
const SAME_AS_LINUX = "as on Linux";

export const TOOLCHAIN_REGISTRY = Object.freeze([
  tool({
    id: "node", class: "required", purpose: "runs every Pipeline script, hook and guard",
    usedBy: ["every Pipeline command"], probe: "node --version",
    floor: { text: "major version 24 or later", majorMin: 24 },
    install: {
      linux: "Node.js 24 or later from your distribution's package source or the official binary archive of nodejs.org",
      darwin: "`brew install node`",
      win32: "`winget install OpenJS.NodeJS.LTS`",
    },
  }),
  tool({
    id: "git", class: "required", purpose: "reads and writes the repository, the hooks and every evidence binding",
    usedBy: ["every Pipeline command", "the git hooks"], probe: "git --version",
    floor: { text: "a release that supports `rev-parse --show-object-format` and diff path filters; not Git for Windows 2.56.0.windows.1" },
    install: {
      linux: "`sudo apt-get install git` (Debian, Ubuntu) or your distribution's git package",
      darwin: "`xcode-select --install`, or `brew install git`",
      win32: "`winget install Git.Git`",
    },
  }),
  tool({
    id: "gitleaks", class: "required", purpose: "secret scan of every feature close",
    usedBy: ["the security gate of the feature close"], probe: "gitleaks version",
    floor: { text: "a release with `--source`, `--report-format`, `--report-path`, `--no-banner` and `--exit-code` (8.x)" },
    install: {
      linux: "download `gitleaks_<version>_linux_x64.tar.gz` from github.com/gitleaks/gitleaks/releases, check it against the release's checksums file, and put `gitleaks` into `~/.local/bin`",
      darwin: "`brew install gitleaks`",
      win32: "download `gitleaks_<version>_windows_x64.zip` from github.com/gitleaks/gitleaks/releases, check it against the release's checksums file, and put `gitleaks.exe` into `%USERPROFILE%\\.local\\bin` or `C:\\Program Files\\Gitleaks`",
    },
  }),
  tool({
    id: "osv-scanner", class: "required", purpose: "known-vulnerability scan of the project's dependencies at every feature close",
    usedBy: ["the security gate of the feature close"], probe: "osv-scanner --version",
    floor: { text: "a 2.x release", majorMin: 2, majorBelow: 3 },
    install: {
      linux: "download `osv-scanner_linux_amd64` (2.x) from github.com/google/osv-scanner/releases, check it against the release's checksums file, and put it into `~/.local/bin` as `osv-scanner`",
      darwin: "`brew install osv-scanner`",
      win32: "download `osv-scanner_windows_amd64.exe` (2.x) from github.com/google/osv-scanner/releases, check it against the release's checksums file, and put it into `%USERPROFILE%\\.local\\bin` or `C:\\Program Files\\OSV-Scanner` as `osv-scanner.exe`",
    },
  }),
  tool({
    id: "semgrep", class: "required", purpose: "static code analysis (the Pipeline's rule pack) at every feature close",
    usedBy: ["the security gate of the feature close"], probe: "semgrep --version",
    floor: { text: "a release with `--json` and `--config`" },
    install: {
      linux: "`pipx install semgrep` (installs into `~/.local/bin`)",
      darwin: "`brew install semgrep`",
      win32: "not verified on native Windows: the trusted resolver accepts only a direct `semgrep.exe` (in `C:\\Program Files\\Semgrep`, `%USERPROFILE%\\.local\\bin` or a root named in the trusted-roots file), and a pip launcher is not one; run the Pipeline from WSL, or defer and accept the block at the close",
    },
  }),
  tool({
    id: "trivy", class: "required-with-infrastructure", purpose: "misconfiguration scan of the project's Dockerfiles, Terraform files and Kubernetes manifests at every feature close, offline with its built-in rules",
    usedBy: ["the security gate of the feature close, in a project with infrastructure or container files"], probe: "trivy --version",
    floor: { text: "a release whose `trivy config` has `--format`, `--skip-check-update`, `--cache-dir`, `--ignorefile`, `--disable-telemetry` and `--skip-version-check`" },
    install: {
      linux: "download `trivy_<version>_Linux-64bit.tar.gz` from github.com/aquasecurity/trivy/releases, check it against the release's checksums file, and put `trivy` into `~/.local/bin` (no sudo)",
      darwin: "`brew install trivy`",
      win32: "download `trivy_<version>_windows-64bit.zip` from github.com/aquasecurity/trivy/releases, check it against the release's checksums file, and put `trivy.exe` into `%USERPROFILE%\\.local\\bin`",
    },
  }),
  tool({
    id: "openssl", class: "required-to-sign", purpose: "signs and checks the PO's Ed25519 approvals (push approval, overrides, acceptance by signature)",
    usedBy: ["po-human-approval.mjs"], probe: "openssl version",
    floor: { text: "a build that signs and verifies Ed25519 with `pkeyutl -rawin` (OpenSSL 3)" },
    install: {
      linux: "your distribution's openssl package (OpenSSL 3)",
      darwin: "`brew install openssl@3`, when the system openssl fails the signing-toolchain readiness check",
      win32: "comes with Git for Windows (`C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe`)",
    },
  }),
  tool({
    id: "gh", class: "optional", purpose: "GitHub issue operations and public observation capture",
    usedBy: ["the github-issue-operations and capture-observation skills"], probe: "gh --version",
    floor: { text: "any current release, signed in with `gh auth login`" },
    install: { linux: "your distribution's gh package or the official repository of cli.github.com", darwin: "`brew install gh`", win32: "`winget install GitHub.cli`" },
  }),
  tool({
    id: "rg", class: "optional", purpose: "fast searches; the agent's read grammar prefers it, and the passive-read check has a bounded fallback without it",
    usedBy: ["the agent's read commands", "passive-read-policy.mjs"], probe: "rg --version",
    floor: { text: "any current release" },
    install: { linux: "`sudo apt-get install ripgrep` or your distribution's ripgrep package", darwin: "`brew install ripgrep`", win32: "`winget install BurntSushi.ripgrep.MSVC`" },
  }),
  tool({
    id: "ssh", class: "optional", purpose: "pushes over an SSH key, when the push transport recorded for a remote is `ssh-key`",
    usedBy: ["publication-executor.mjs"], probe: "ssh -V",
    floor: { text: "any OpenSSH release" },
    install: { linux: "your distribution's openssh-client package", darwin: "comes with macOS", win32: "comes with Git for Windows and with Windows (the OpenSSH client feature)" },
  }),
  tool({
    id: "cyclonedx-maven-plugin", class: "project-setting", purpose: "writes the CycloneDX file that lets a Maven project's SBOM pass the close (a pom alone stays partial)",
    usedBy: ["the SBOM of the feature close (ADR-0091)"], probe: "a committed `bom.json` next to `pom.xml` or above it",
    floor: { text: "goal `makeAggregateBom` or `makeBom` with `outputDirectory` set to `${project.basedir}`" },
    install: { linux: "add the plugin to the build in `pom.xml` and commit the file it writes", darwin: SAME_AS_LINUX, win32: SAME_AS_LINUX },
  }),
  tool({
    id: "gradle-dependency-locking", class: "project-setting", purpose: "writes the `gradle.lockfile` of every Gradle project, which the SBOM reads",
    usedBy: ["the SBOM of the feature close (ADR-0091)"], probe: "a committed `gradle.lockfile` next to every build file that declares dependencies",
    floor: { text: "`dependencyLocking { lockAllConfigurations() }` for every project, locks written per project" },
    install: { linux: "enable it in the build and commit each project's `gradle.lockfile`", darwin: SAME_AS_LINUX, win32: SAME_AS_LINUX },
  }),
  tool({
    id: "nuget-lockfile", class: "project-setting", purpose: "writes the `packages.lock.json` of every .NET project that uses PackageReference, which the SBOM reads",
    usedBy: ["the SBOM of the feature close (ADR-0091)"], probe: "a committed `packages.lock.json` next to every project file with a PackageReference",
    floor: { text: "`<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>`" },
    install: { linux: "set the property (for example in `Directory.Build.props`), restore once and commit each `packages.lock.json`", darwin: SAME_AS_LINUX, win32: SAME_AS_LINUX },
  }),
]);

/** The registry entry of one tool id, or null. */
export function toolchainEntry(id) { return TOOLCHAIN_REGISTRY.find((entry) => entry.id === id) ?? null; }

/** Whether a parsed `[major, minor, patch]` version meets the entry's major-version floor (an entry without one accepts every parsed version). */
export function meetsVersionFloor(id, parsed) {
  const floor = toolchainEntry(id)?.floor;
  if (!Array.isArray(parsed) || floor === undefined) return false;
  if (Number.isInteger(floor.majorMin) && parsed[0] < floor.majorMin) return false;
  if (Number.isInteger(floor.majorBelow) && parsed[0] >= floor.majorBelow) return false;
  return true;
}

/** The section anchor of one tool in docs/toolchain.md (the document the generator writes; vendored into the plugin as docs/toolchain.md). */
export function toolchainDocAnchor(id) { return `docs/toolchain.md#${id}`; }

/**
 * The pointer a preflight result or a readiness finding carries: where the person finds the install route for their platform. It holds no command
 * and no version number, because the preflight's own text never does (W7-2; scripts/toolchain-preflight.test.mjs pins both).
 */
export function toolchainDocPointer(id) { return toolchainEntry(id) === null ? null : `Install routes per platform: ${toolchainDocAnchor(id)} (the Pipeline plugin ships the same file).`; }
