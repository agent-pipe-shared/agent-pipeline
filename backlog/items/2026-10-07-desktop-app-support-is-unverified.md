---
schema: pipeline.backlog-item.v1
id: pipeline.desktop-app-support-is-unverified
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "PO question 2026-10-07 evening; documentation research (code.claude.com/docs desktop, desktop-wsl, hooks)"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# Pipeline support in the Claude Desktop app is unverified

## Description

The PO asked whether the pipeline runs cleanly when a repository is opened in the Claude Desktop app. Documentation says
Desktop and CLI share `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md and `.mcp.json`, settings-defined hooks and
skills apply to both, user-scope plugins are available in local and SSH sessions, and background subagents run. It is
silent on plugin-supplied hooks/agents firing in Desktop, on a custom statusLine, on the `!` prefix, and on a TTY for hook
or user scripts. Desktop does not load PowerShell profiles (only user/system environment variables or settings `env`).
**Plugins are not available in Desktop WSL sessions**, so the pipeline's guards do not run there at all.

## Triggering situation

PO question, 2026-10-07 evening.

## Affected artifact

Pipeline bootstrap (`pipeline-start`), statusLine-based main-session model identity, PO command hand-over (`!`), signing
ceremony terminal requirement, onboarding docs.

## Proposal

Candidate acceptance check on a real host: open this repository in the Desktop app (Windows path), confirm the bootstrap
confirmation line, a guard denial of a forbidden command, a background Goldfish dispatch, and record what the statusLine
identity reports; document that Desktop WSL sessions carry no pipeline protection and must not be used for governed
repositories, and that PO commands run in the integrated or an external terminal. Owner: pipeline; due before the 0.7.0
release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** a runner surface the PO uses must be verified, and an unprotected surface must be named, not discovered.
- **Assignment (if accepted):** final host verification of the 0.7.0 candidate; docs slice for the WSL warning.
- **Date:** 2026-10-07
