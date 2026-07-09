# AGENTS.md

Conventions for agent runtimes working in this repo, in the tool-agnostic
format several coding agents have converged on.

## What this repo is

The Agent-Pipeline is a versioned operating model for agentic software
development: four roles (Product Owner, Elephant, Goldfish, Critic), a small
SDLC, a two-stage review contract (deterministic gates first, then an
independent reviewer), and a set of provable guardrails. See
[`README.md`](README.md) for the one-minute version and
[`docs/overview.md`](docs/overview.md) for the model in one read.

If you are Claude Code, read [`CLAUDE.md`](CLAUDE.md) instead — it is the
fuller, authoritative version of what this file summarizes, wired to Claude
Code's own session-bootstrap and hook system.

## Where the rules live

- **Normative core:** [`docs/operating-model.md`](docs/operating-model.md) —
  roles, SDLC, review system, session lifecycle, handover, project
  calibration. This wins on conflict with anything else, including this file.
- **Role contracts:** [`roles/`](roles/) — `elephant.md`, `goldfish.md`,
  `critic.md`. Read the one matching the role you're seated in before you act.
- **Guardrails:** [`guardrails/`](guardrails/) — provable, checkable rules:
  `global.md`, `git.md`, `security.md`, `quality-gates.md`, `token-budget.md`.
- **Handover:** if a repo has adopted the pipeline for its own day-to-day
  work, `docs/state.md` is the single canonical "what's going on right now"
  file — read it first, every session, before anything else.

## Guards always on, ceremony scales with stakes

Two things hold at the same time, and neither is optional:

- **The guardrails don't scale down.** Never force-push, never rewrite
  shared history, never delete a protected branch, never skip a hook, no
  claim of "done" without a machine-written evidence artifact — these apply
  at every rigor level and every risk class, no exceptions for small changes.
  On Claude Code, part of this is hook-enforced; on any other runtime, you
  are the enforcement layer yourself. See
  [`docs/runtime-boundary.md`](docs/runtime-boundary.md) for the exact line
  between what a runtime enforces mechanically and what stays a discipline
  you keep by hand.
- **The ceremony scales with what a change risks.** How much spec, how much
  review, and how many gates a task earns is calibrated by a rigor level and
  a risk class, not applied uniformly — a one-line typo fix and a change to
  a guardrail hook do not deserve the same process. See
  [`docs/operating-model.md`](docs/operating-model.md) for how that
  calibration works.

## Getting started

See [`SETUP.md`](SETUP.md) for the full walkthrough: cloning, running
`node setup.mjs` to personalize `pipeline.user.yaml`, and (on Claude Code)
binding the plugin. On another runtime, the personalization step still
applies; the plugin-binding step is Claude-Code-specific and does not.
