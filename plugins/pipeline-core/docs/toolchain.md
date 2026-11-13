# Tools the Pipeline needs

<!-- GENERATED from plugins/pipeline-core/lib/toolchain-registry.mjs by harness/scripts/generate-toolchain-doc.mjs; do not edit by hand. -->

Every program the Pipeline runs on a machine, and every optional one it can use. Install a tool yourself, in your own terminal (in a Claude session you can run the command with the `!` prefix); the Pipeline's own checks never install anything. The install routes below name the vendor's official source. Afterwards the tool must resolve from a directory the Pipeline trusts: the system directories, `~/.local/bin` and `~/go/bin`; on Windows the named `C:\Program Files` directories and `%USERPROFILE%\.local\bin`; or a root you list in `~/.config/agent-pipeline/trusted-tool-roots.json`.

Check the state of this machine with `node <plugin root>/scripts/toolchain-preflight.mjs --environment-readiness`. Record that you install a required tool later with `node <plugin root>/scripts/toolchain-defer.mjs --tool <id> --answer "<your answer>"`, and remove the record with `--clear <id>`.

## Required on every machine

The feature close runs these. Onboarding checks them and asks you to install a missing one together with your agent; you may defer one, and the deferral is recorded on this machine. A deferral does not lift any check: a project calibrated critical refuses a missing scanner at plan approval and at the close, and any other project gets a notice there.

### node

- **Purpose:** runs every Pipeline script, hook and guard.
- **Used by:** every Pipeline command.
- **Minimum:** major version 24 or later.
- **Check:** `node --version`.
- **Linux and WSL:** Node.js 24 or later from your distribution's package source or the official binary archive of nodejs.org.
- **macOS:** `brew install node`.
- **Windows:** `winget install OpenJS.NodeJS.LTS`.

### git

- **Purpose:** reads and writes the repository, the hooks and every evidence binding.
- **Used by:** every Pipeline command; the git hooks.
- **Minimum:** a release that supports `rev-parse --show-object-format` and diff path filters; not Git for Windows 2.56.0.windows.1.
- **Check:** `git --version`.
- **Linux and WSL:** `sudo apt-get install git` (Debian, Ubuntu) or your distribution's git package.
- **macOS:** `xcode-select --install`, or `brew install git`.
- **Windows:** `winget install Git.Git`.

### gitleaks

- **Purpose:** secret scan of every feature close.
- **Used by:** the security gate of the feature close.
- **Minimum:** a release with `--source`, `--report-format`, `--report-path`, `--no-banner` and `--exit-code` (8.x).
- **Check:** `gitleaks version`.
- **Linux and WSL:** download `gitleaks_<version>_linux_x64.tar.gz` from github.com/gitleaks/gitleaks/releases, check it against the release's checksums file, and put `gitleaks` into `~/.local/bin`.
- **macOS:** `brew install gitleaks`.
- **Windows:** download `gitleaks_<version>_windows_x64.zip` from github.com/gitleaks/gitleaks/releases, check it against the release's checksums file, and put `gitleaks.exe` into `%USERPROFILE%\.local\bin` or `C:\Program Files\Gitleaks`.

### osv-scanner

- **Purpose:** known-vulnerability scan of the project's dependencies at every feature close.
- **Used by:** the security gate of the feature close.
- **Minimum:** a 2.x release.
- **Check:** `osv-scanner --version`.
- **Linux and WSL:** download `osv-scanner_linux_amd64` (2.x) from github.com/google/osv-scanner/releases, check it against the release's checksums file, and put it into `~/.local/bin` as `osv-scanner`.
- **macOS:** `brew install osv-scanner`.
- **Windows:** download `osv-scanner_windows_amd64.exe` (2.x) from github.com/google/osv-scanner/releases, check it against the release's checksums file, and put it into `%USERPROFILE%\.local\bin` or `C:\Program Files\OSV-Scanner` as `osv-scanner.exe`.

### semgrep

- **Purpose:** static code analysis (the Pipeline's rule pack) at every feature close.
- **Used by:** the security gate of the feature close.
- **Minimum:** a release with `--json` and `--config`.
- **Check:** `semgrep --version`.
- **Linux and WSL:** `pipx install semgrep` (installs into `~/.local/bin`).
- **macOS:** `brew install semgrep`.
- **Windows:** not verified on native Windows: the trusted resolver accepts only a direct `semgrep.exe` (in `C:\Program Files\Semgrep`, `%USERPROFILE%\.local\bin` or a root named in the trusted-roots file), and a pip launcher is not one; run the Pipeline from WSL, or defer and accept the block at the close.

## Required on the machine of the person who signs

Signed approvals (the default push gate, signed overrides, acceptance by signature) need this on the machine where the PO signs. The readiness report checks it as `signing-toolchain`.

### openssl

- **Purpose:** signs and checks the PO's Ed25519 approvals (push approval, overrides, acceptance by signature).
- **Used by:** po-human-approval.mjs.
- **Minimum:** a build that signs and verifies Ed25519 with `pkeyutl -rawin` (OpenSSL 3).
- **Check:** `openssl version`.
- **Linux and WSL:** your distribution's openssl package (OpenSSL 3).
- **macOS:** `brew install openssl@3`, when the system openssl fails the signing-toolchain readiness check.
- **Windows:** comes with Git for Windows (`C:\Program Files\Git\mingw64\bin\openssl.exe`).

## Optional

A feature that works without these, or has a fallback. Install one when you use the feature it names.

### gh

- **Purpose:** GitHub issue operations and public observation capture.
- **Used by:** the github-issue-operations and capture-observation skills.
- **Minimum:** any current release, signed in with `gh auth login`.
- **Check:** `gh --version`.
- **Linux and WSL:** your distribution's gh package or the official repository of cli.github.com.
- **macOS:** `brew install gh`.
- **Windows:** `winget install GitHub.cli`.

### rg

- **Purpose:** fast searches; the agent's read grammar prefers it, and the passive-read check has a bounded fallback without it.
- **Used by:** the agent's read commands; passive-read-policy.mjs.
- **Minimum:** any current release.
- **Check:** `rg --version`.
- **Linux and WSL:** `sudo apt-get install ripgrep` or your distribution's ripgrep package.
- **macOS:** `brew install ripgrep`.
- **Windows:** `winget install BurntSushi.ripgrep.MSVC`.

### ssh

- **Purpose:** pushes over an SSH key, when the push transport recorded for a remote is `ssh-key`.
- **Used by:** publication-executor.mjs.
- **Minimum:** any OpenSSH release.
- **Check:** `ssh -V`.
- **Linux and WSL:** your distribution's openssh-client package.
- **macOS:** comes with macOS.
- **Windows:** comes with Git for Windows and with Windows (the OpenSSH client feature).

## Settings in the project's own build

Not programs: switches in the project's build that produce the files the SBOM of the close reads. The close names the one that is missing.

### cyclonedx-maven-plugin

- **Purpose:** writes the CycloneDX file that lets a Maven project's SBOM pass the close (a pom alone stays partial).
- **Used by:** the SBOM of the feature close (ADR-0091).
- **Minimum:** goal `makeAggregateBom` or `makeBom` with `outputDirectory` set to `${project.basedir}`.
- **Check:** a committed `bom.json` next to `pom.xml` or above it (what the close looks for).
- **Linux and WSL:** add the plugin to the build in `pom.xml` and commit the file it writes.
- **macOS:** as on Linux.
- **Windows:** as on Linux.

### gradle-dependency-locking

- **Purpose:** writes the `gradle.lockfile` of every Gradle project, which the SBOM reads.
- **Used by:** the SBOM of the feature close (ADR-0091).
- **Minimum:** `dependencyLocking { lockAllConfigurations() }` for every project, locks written per project.
- **Check:** a committed `gradle.lockfile` next to every build file that declares dependencies (what the close looks for).
- **Linux and WSL:** enable it in the build and commit each project's `gradle.lockfile`.
- **macOS:** as on Linux.
- **Windows:** as on Linux.

### nuget-lockfile

- **Purpose:** writes the `packages.lock.json` of every .NET project that uses PackageReference, which the SBOM reads.
- **Used by:** the SBOM of the feature close (ADR-0091).
- **Minimum:** `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>`.
- **Check:** a committed `packages.lock.json` next to every project file with a PackageReference (what the close looks for).
- **Linux and WSL:** set the property (for example in `Directory.Build.props`), restore once and commit each `packages.lock.json`.
- **macOS:** as on Linux.
- **Windows:** as on Linux.
