# Changelog

Alle nennenswerten Änderungen an der Agent-Pipeline werden hier festgehalten.

Format nach [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versionierung gemäß [ADR-0002](docs/adr/0002-versionierung-sha-dann-semver.md): SHA-basiert in der frühen Phase — der jeweils aktuelle Commit auf `main` ist der gültige, verteilte Stand; SemVer + Tags kommen ab der Stabilitätsphase.

## [Unreleased]

## [0.1.0] — Initial public snapshot

Erster weitergabefähiger Snapshot des Operating Models: Rollenmodell (PO/Elephant/Goldfish/Critic), zweistufiges Review-System (deterministische Gates + Critic-Trigger-Matrix), Session-Lifecycle, Handover-Kanonisierung, Projekt-Kalibrierungsschicht, Guardrails (`guardrails/`), Modell-/Tooling-Policies (`policies/`) und das `pipeline-core`-Plugin (git-guard-Union-Hook, Skills, Agents). Details: [`docs/operating-model.md`](docs/operating-model.md).
