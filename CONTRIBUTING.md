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

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/)
instead of a Contributor License Agreement (CLA). Every commit must be
signed off, certifying that you wrote the change or otherwise have the right
to submit it under the project's license.

Sign off your commits with:

```
git commit -s
```

This appends a `Signed-off-by: Your Name <your.email@example.com>` line to
your commit message. Pull requests with unsigned commits will not be merged.

## Licensing of contributions

By submitting a contribution, you agree that:

- Code contributions are licensed under **Apache License 2.0** (see
  [`LICENSE`](LICENSE)).
- Documentation and prose contributions are licensed under **Creative
  Commons Attribution 4.0 International (CC-BY-4.0)** (see
  [`LICENSE-DOCS`](LICENSE-DOCS)).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold this code.

## Questions

If anything here is unclear, open an issue and ask — we're happy to help.
