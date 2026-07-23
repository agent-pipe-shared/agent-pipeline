# Contributing to Agent-Pipeline

Thanks for your interest in contributing. This project is a versioned operating
model (documentation, guardrails, and Node tooling) for agentic software
development. Contributions of any size — typo fixes, documentation
improvements, new guardrails, tooling changes — are welcome.

## About this repository (release & provenance model)

This public repository is a curated export of a private working repository,
where the operating model is developed under the pipeline's own process. A few
consequences are worth knowing up front:

- **Commit history.** Maintainer commits carry a neutral project identity and
  English messages by release convention. They intentionally omit the private
  repo's internal decision-trailers and working-language artifacts; the full
  decision lineage (specs, the decision register, dispatch records) lives in the
  private repo. The [ADRs](docs/adr/) capture the durable *why* that is relevant
  to users of the public edition.
- **The DCO below applies to contributor pull requests**, not retroactively to
  the maintainer export history.

## Before you start

- Check open issues and pull requests to avoid duplicate work.
- For larger changes (new roles, new guardrail categories, architectural
  changes to the harness), please open an issue first to discuss the approach
  before investing significant effort.

## Setting up a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits **small and atomic** — one concern per
   commit.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
   messages (e.g. `fix: ...`, `feat: ...`, `docs: ...`).
4. Run the verify gate locally before opening a PR:

   ```
   node harness/scripts/verify.mjs
   ```

   This script has no external dependencies (Node builtins only, no
   `npm install` required) and must pass (exit code 0) for your change to be
   mergeable. The same command runs in CI as the `verify` check.
5. Update relevant documentation if your change affects behavior, guardrails,
   or the operating model.
6. Open a pull request against `main` and fill out the PR template.

## Developer Certificate of Origin (DCO) and contributor agreement

This project uses both the [Developer Certificate of Origin](https://developercertificate.org/)
and the separate [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md).
The DCO certifies contribution provenance. It does not by itself grant the
relicensing rights required by this project's source-available and separate
commercial licensing model.

Every commit must be signed off, and every pull request must record the
contributor's explicit acceptance of the Contributor License Agreement through
the dedicated PR-template checkbox. Maintainers must not merge a contribution
without both records. Acceptance hidden in Code of Conduct participation or
inferred merely from submitting code is insufficient.

André Twachtmann is the legal rightsholder for Agent-Pipeline project-authored
content and the CLA contracting party. Third-party material remains under the
ownership and license recorded in `third-party-licenses.json`. On 2026-07-23,
André Twachtmann, acting as the named human rightsholder
reviewer, approved activation of the CLA process. External pull requests may
therefore use the CLA checkbox, but no contribution may be merged unless both
its DCO sign-off and the Contributor's personally checked, current-version CLA
acceptance are present. A maintainer, bot, or submission automation cannot
accept on the Contributor's behalf. No private address, email address, or
private-account link is required or recorded here.

The repository's server-side branch protection for `main` must require the
`contributor-gates / cla-and-dco` status check and must require the pull-request
branch to be up to date with `main` before merge. Without both settings and a
server-side read-back confirming them, this workflow is evidence but cannot by
itself claim that GitHub blocks merge. The check emits its machine-readable
receipt in the job log for the current run; the repository does not claim that
the log is an immutable long-term acceptance archive.

Sign off your commits with:

```
git commit -s
```

This appends a `Signed-off-by: Your Name <your.email@example.com>` line to
your commit message. Pull requests with unsigned commits will not be merged.

## Licensing and rights in contributions

By expressly accepting the Contributor License Agreement for the pull request,
you agree that:

- Code contributions are licensed under the **Sustainable Use License 1.0
  (SUL-1.0)** (see
  [`LICENSE`](LICENSE)).
- Documentation and prose contributions use the same **Sustainable Use License
  1.0 (SUL-1.0)** (see
  [`LICENSE-DOCS`](LICENSE-DOCS)).

This is source-available licensing, not OSI Open Source. Internal business use,
including internal commercial-company use and modification for one's own
purposes, is permitted subject to the license. Separate rightsholder
participation is required only when Agent-Pipeline or a substantial derivative
is itself monetized as described in `NOTICE` and `docs/licensing.md`.

The Contributor License Agreement grants the project the rights needed to
publish contributions under SUL-1.0 and, separately, under commercial terms.
It does not describe an assignment of authorship or copyright. Contributors
must have the rights needed to make that grant and must identify third-party
material. These documents are not legal advice and make no guarantee that a
particular acceptance process or grant is effective under every applicable
law. The recorded 2026-07-23 approval activates the CLA process but is not a
general legal-effectiveness guarantee or release approval.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold this code.

## Questions

If anything here is unclear, open an issue and ask — we're happy to help.
