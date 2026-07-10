# Changelog

All notable changes to the Agent Pipeline are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning per [ADR-0002](docs/adr/0002-versionierung-sha-dann-semver.md): SHA-based in the early phase — the current commit on `main` is the valid, distributed state; SemVer + tags arrive once the stability phase begins.

## [Unreleased]

## [0.1.0] — Initial public snapshot

First shareable snapshot of the Operating Model: role model (PO/Elephant/Goldfish/Critic), two-tier review system (deterministic gates + Critic trigger matrix), session lifecycle, handover canonicalization, project calibration layer, guardrails (`guardrails/`), model/tooling policies (`policies/`), and the `pipeline-core` plugin (git-guard union hook, skills, agents). Details: [`docs/operating-model.md`](docs/operating-model.md).

Honest maturity note: v0.1.0, about a week of build time, a solo project, one dogfooding round so far — feedback welcome.
