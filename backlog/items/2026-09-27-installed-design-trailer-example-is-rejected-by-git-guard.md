---
schema: pipeline.backlog-item.v1
id: pipeline.installed-design-trailer-example-is-rejected-by-git-guard
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Codex greenfield review B3 and independent 2026-09-27 self-application: installed obligations print `Dispatch: design (elephant)`, active Git guard rejects it."
sprint: alfred
done_when: manual
---

# Installed obligations teach a direct-design trailer that the Git guard rejects

## Description

The installed Agent Obligations and their generator recommend
`Dispatch: design (elephant)` for direct Elephant design documents. The active
Git guard and `guardrails/git.md` reject that form as
`GIT-03-DISPATCH-MALFORMED` and admit `Dispatch: stage-0 (elephant)` instead.
Stage-0's narrow implementation exception is not an accurate provenance
description for a broad design package. The earlier item
`2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits.md`
was closed on verifier/generator evidence, but the live commit boundary still
contradicts it.

## Triggering situation

The 2026-09-27 Codex greenfield run and two rejected local commit attempts
while preserving Alfred reader/AC evidence. A stage-0-marked commit was
admitted; that is a workaround, not proof the intended design form works.

## Affected artifact

`harness/scripts/generate-agent-obligations.mjs`, both generated Obligations
copies, `guardrails/git.md`, Git command and commit-msg guards, and
`dispatch-authorship-verify.mjs`.

## Proposal

Use one authoritative trailer grammar for generated instructions, guard
admission and authorship verification. Admit the direct-design form only for
its actual allowed paths and phase, and make the printed command example pass
the installed Git command guard. Do not relabel design work as stage-0 merely
to obtain a commit.

## Acceptance

- A real installed-hook test runs every printed commit example through the
  command guard and commit-msg backstop; each admitted example is accepted.
- `Dispatch: design (elephant)` is accepted for a legitimate direct-design
  commit and rejected for production implementation files.
- Verifier, generator and guard share the same classification, including
  commits made during an approved feature's implementation phase that only
  add documentation or evidence.
- Existing local stage-0-labeled design evidence commits are explicitly
  dispositioned as provenance debt; their history is not silently rewritten.

## Evidence 2026-10-03

Reproduced on all fronts on the 0.7.0 local test candidate (`1bd1d7bf`): the
Codex greenfield report (P0: `templates/prompts/agent-obligations.md:176` vs
`lib/commit-message-policy.mjs:85/:173`), the Antigravity report (Befund 7) and
the Agent-Pipeline recovery handover `docs/0.7-recovery-2026-10-03.md` (consistency
patch prepared in `scratch/design-trailer-consistency/`, unqualified).

## Triage

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `2a466fa59`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
- **Counted evidence (2026-10-22, Linux host, head of the h2 clone):** the first acceptance bullet (a real installed-hook
  run of every printed commit example) is now pinned in
  `plugins/pipeline-core/lib/pins/installed-design-trailer-example-is-rejected-by-git-guard.test.mjs`: a throwaway enrolled
  repository gets the real commit-msg hook from `scripts/commit-msg-hook-install.mjs`; every printed `Dispatch:` example
  plus `design (elephant)` goes through the real `hooks/guard-git.mjs` process and a real `git commit`, and a near-miss
  (`implementation (elephant)`) is refused by both, which proves the hooks are live in that harness. Run:
  `node --test plugins/pipeline-core/lib/pins/installed-design-trailer-example-is-rejected-by-git-guard.test.mjs`,
  13 cases, 12 pass, 0 fail, 1 skip (the skip is the fourth acceptance bullet, the provenance-debt disposition of
  stage-0-labelled history: a documentation decision with no executable surface, still manual). Not verified here: a
  Windows host run of the commit-msg hook, and a path-based rejection of `design (elephant)` for production files
  (the pin asserts only the size bound, as the PO decision of 2026-10-16 admits the form without a path grant).

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D129) — Disposition of existing stage-0-labelled design commits as provenance debt (history is not rewritten)
  Question: how are the existing stage-0-labelled design commits dispositioned, given history is never rewritten? This is the skipped fourth acceptance case, a documentation decision with no executable surface.
- **HOST-SESSION-NEEDED** — Triage closes the item only after the 0.7.0 candidate host checklist
  Closure is tied to the AC-32 install and host checklist of the 0.7.0 candidate: the PO installs the candidate and a Claude or Codex host commits with the printed `Dispatch: design (elephant)` example through the installed hooks. The Linux pin (12 pass, 1 skip) is already counted; a Windows commit-msg hook run is additionally possible via interop but does not replace the host checklist.
