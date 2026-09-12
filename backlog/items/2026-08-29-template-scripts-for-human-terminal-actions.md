---
schema: pipeline.backlog-item.v1
id: pipeline.template-scripts-for-human-terminal-actions
type: idea
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
tracking: "Nova B -- runner-neutral design reviewed; catalog, POSIX runner, and first producer adoption implemented; native Windows launcher hardening is deferred."
source: "PO inline observation (2026-08-29, 3-runner greenfield synthesis): Antigravity was the only runner to move quickly through the first 2 phases, in part because it built its OWN scripts to confirm the PRD faster. PO suggests: pre-built template scripts (that runners lightly rewrite, with clear placeholders) for fixed gates/installs/anything the human must run in a terminal, so what needs filling in is always clear."
done_when: manual
---

# Idea: template scripts for fixed human-terminal actions, pointing at drivers/hooks, that runners lightly rewrite instead of composing from scratch

## What the PO is asking for

Across all three greenfield runs, composing correct, copy-paste-safe terminal commands for
the human (gate satisfaction, key/install steps, signing ceremonies) was a repeated source of
friction (line-wrap breakage, quoting mismatches, wrong-runner defaults). Antigravity did
comparatively well partly because it built its own helper scripts on the fly. The PO's idea:
ship PRE-BUILT template scripts for these fixed, recurring human-terminal actions -- pointing
at the actual drivers/hooks -- that a runner lightly rewrites (filling in clearly-marked
placeholders) rather than composing a command string from scratch each time. Could also echo
what is being signed/executed for transparency.

## Why this is an idea, not a scoped item

No concrete design exists yet: which actions get templates, where they live, how a runner
discovers and fills them in, how this relates to the already-existing `copy-safe-command.mjs`
renderer and the various "universal command renderer" work already done. Needs a design pass
before it can be scoped into acceptance criteria.

## Related

- `2026-08-18-universal-human-command-renderer.md` (closed) -- the existing renderer this
  idea would either extend or wrap.
- Item 19 (`codex-pretool-guard.mjs` quoting) and the copy-paste line-wrap items -- adjacent
  friction this idea aims to reduce structurally rather than fix case by case.

## Triage

- **Decision:** deferred, Nova B, ELEVATED priority within Nova B
- **Rationale:** genuine design idea with real supporting evidence (Antigravity's comparative
  outperformance), but not yet scoped. PO explicitly confirmed 2026-08-29, live, that this
  direction should be pursued: "Folgen wir agys Weg und machen template skripte die überall
  benannt werden" -- and generalized the underlying principle to every item from this
  greenfield-analysis batch: designs must make the enforcement layer itself surface and steer
  toward the correct path, not merely document it or block the wrong one. Sequenced directly
  after the current dispatch wave (NVA-CF-KEYBOOTSTRAP/-VERIFYDEADLOCK/-FORCEDQUOTE) rather
  than folded into it, to avoid file-scope collision and because it needs its own design pass
  first (script format, storage location, discovery mechanism).
- **Date:** 2026-08-29

## Reviewed design — 2026-09-12

The idea is now sliced into an implementation-ready, runner-neutral design at
`backlog/evidence/NVA-B-HUMAN-TERMINAL-TEMPLATES-DESIGN-1.md`. It extends the
existing human-authorization inventory and checker rather than creating a
second authority. Existing producer boundary tuples remain authoritative; a
generic runner must refuse unsupported caller provenance before spawning any
child. The first executable slice is POSIX-only. Windows stays typed
`unsupported` until native owner/DACL/reparse checks and live Windows tests
exist.

Two Critic rounds were completed. Round 1 found three Majors in inventory
coverage, authority-boundary preservation, and Windows confidentiality. The
corrected design received `VERDICT: yes` with no remaining finding; see
`backlog/evidence/2026-09-12-human-terminal-templates-design-critic-round2.md`.
The item remains `open` for the four implementation slices; no new PO gate is
needed for them.

## Implementation progress — 2026-09-12

Slice 1 ships the authoritative action catalog and fail-closed inventory
coverage. Slice 2 ships POSIX `prepare`, `inspect`, and attended `run` action
instances with private request/receipt storage, candidate and builder binding,
shell-free argv, visible inherited terminal streams, and independent typed
readback. A successful child followed by absent, failed, or mismatched readback
is recorded as an outcome requiring manual reconciliation and is never marked
safe to retry. The correction is implemented in `e4d7539d`; its candidate-bound
evidence is `backlog/evidence/NVA-B-HUMAN-TERMINAL-TEMPLATES-SLICE2-1.md`.

The item remains open for Slice 3 producer adoption. The pipeline owns that
runner-neutral work and re-triages it on 2026-09-30. Slice 4 native Windows
owner/DACL/reparse hardening is owned by the pipeline team, deferred to the
dedicated native-Windows package, and re-triaged on 2026-10-31. It is not a
Nova-B acceptance blocker and no WSL result establishes native readiness.

Slice 3 registers PO-key setup and installed-plugin attestation setup through
their existing drivers, exact boundary tuples, and independent typed readback.
Both remain `requiresPoApproval: false`. Compatibility is additive: existing
CLI verbs and `setupAction` remain, the original v1 receipt schema is unchanged,
and reconciliation receipts use v2. Rollback may remove the new catalog metadata
and v2 consumer while the original commands continue to work; candidate/builder
binding makes older prepared instances refuse after drift.
