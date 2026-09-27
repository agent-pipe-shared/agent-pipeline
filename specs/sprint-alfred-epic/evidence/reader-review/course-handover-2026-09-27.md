# Source reader-review course — open at 0.7 preparation

This is a course handover, not a reader binding or a finding disposition.
Source-bound review covers the sixteen paths returned by
`check-doc-reader-binding.mjs --snapshot`. The latest committed document
snapshot was `1f1b5ed603e1046de602479cb0066a0548b271ed`, docset digest
`282a3d9c1997d98010b3dd5595d3ae6ebafda9466bd537a8d18579e01be9398c`.

Three complete two-stage rounds are recorded: `20260923a`, `20260924a`, and
`20260927a`. The latest phase-two report leaves five public-document findings
open. This course has at most one further correction cycle and one fresh
two-stage round under `harness/reader-review-protocol.md`. A new round ID or
an evidence-only commit does not reset the limit.

| Finding in `20260927a` | Concrete correction for the next public-doc batch |
| --- | --- |
| Verify/close sequence conflicts with `docs/usage.md` | In both flow guides, route a clear Critic result through a final full, Critic-bound Verify before human acceptance/close. Show red Verify returning to recovery in both diagrams and explain the final receipt in the delivery table. |
| English flow starts with the skill inventory | Move the `session-and-delivery-skills` block below the task/roles introduction and primary journey; preserve its capability marker and anchor. |
| README licensing outlook interrupts the newcomer path | Move the English beta outlook below the initial problem/benefits explanation without changing the current-license statement. |
| Completion report orders Track D before Track C | Put the Track C/Operations work-package section before Track D; preserve the content and anchors. |
| Flow guides call integrated Nova B work future roadmap | State that Nova A/B implementation is present but candidate-bound issue acceptance is pending; name genuinely unfinished follow-up work separately. |

The active Alfred plan was already in `PLAN-LIFECYCLE-DIGEST-DRIFT` before this
course handover: PRD/Spec bytes did not match the prior approval. On
2026-09-27, the sanctioned `pipeline-state.mjs reopen-design --by Codex`
transition recorded that invalidation and moved the feature to design/draft.
The root-level flow-guide and README edits initially met `guard-devplan`
refusals in that phase. A first override plan returned `HGO-DRIFT` only
because the source script was paired with an installed-plugin denial; the
installed override script then produced the matching plan. The PO signed
two exact, one-use intents: one for the two flow guides and one for the README.
Both were armed and applied without broadening their paths. The completion
report reordering used the ordinary design-document route. These five
corrections form the course's third public-document correction batch.
The design state and plan invalidation remain explicit; the overrides do not
renew the Alfred plan authority.

After this correction batch is committed, dispatch two fresh readers against
that exact document state. If they still require public-document edits, stop
under the course limit and obtain a documented course decision; do not
silently begin round five.
