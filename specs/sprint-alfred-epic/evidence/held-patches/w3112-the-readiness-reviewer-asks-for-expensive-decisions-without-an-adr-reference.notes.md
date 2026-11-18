# w3112 — the readiness reviewer asks one fixed question about expensive decisions without an ADR reference (candidate 31, C31-B12)

Applies AFTER the base clone of candidate 31 (the patch is the delta `444f9e5c..HEAD` on that chain and does not apply to the bare repository HEAD). PO decision of 2026-11-19: one fixed question, no new gate.
Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What

- `plugins/pipeline-core/agents/readiness-reviewer.md`, in "What to check" after "Decisions to record": one fixed question, asked once in the full round. Is there a decision in the design that is expensive to reverse
  (a data shape, a public interface, a security boundary, a cross-module contract, a technology choice) and has no entry in any module's `adrReferences`? The answer is a question, never a blocking finding. It names the decision
  in one line and the command `create-adr.mjs --root <root> --slug <slug> --title "<title>"` (or `--from-design` after declaring the path). The reviewer says explicitly when there is none.
- Pin: one new case J7 in `plugins/pipeline-core/lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs` (the nearest existing pin that reads the reviewer text). Written first, red before (10 of 11 pass, J7 fails), green after (11 of 11).

## Why

The pipeline derives ADR drafts only from module `adrReferences`; an expensive decision the design never declared stays invisible. The reviewer is the one place that can notice it, as a question (design-course: a question never holds the design).

## Not changed / not proven

- No gate, no record field, nothing stored; the report shape is unchanged. No vendored or generated copy of the reviewer text exists (only the one agent file), so no sync file changes.
- Other reviewer text, the Spec and the templates are untouched.
- Whether a reviewer model actually raises the question is not proven by a text pin.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.
