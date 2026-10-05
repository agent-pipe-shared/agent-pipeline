---
schema: pipeline.backlog-item.v1
id: pipeline.shell-classifier-faults-on-heredoc-body-text
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live 2026-10-05 (Alfred session)."
sprint: alfred
done_when: manual
---

# Shell classifier faults on heredoc body text

## Description

The shell classifier raised `GUARD-TESTPATH-SHELL-FAULT` ("mutating git apply has unbound patch targets") on a `cat >> scratch/... <<'EOF'` command whose body only contains the text "git apply --check". Heredoc body text is data, not argv, and must not be classified as a command.

## Proposal

Exclude heredoc body text from command classification, with a regression test for a heredoc whose body names `git apply`. Related: `2026-08-28-a-heredoc-refusal-teaches-no-substitute.md` and `2026-08-27-shell-grammar-reads-quoted-content-as-shell-syntax.md` (the same grammar family).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
