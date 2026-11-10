# ADR-0090: The evidence follows every push, and a release includes its push

> Agent-Pipeline · Sprint Alfred · 2026-11-10

**Status:** accepted (2026-11-10, PO tiles, register D237 to D239). Built in candidate 27. Not yet run on a real repository or a real signature.

**Context source (verbatim PO direction, 2026-11-10):** "aus meiner Sicht option 1 aber es sind zwei weil man macht mE entweder einen push auf einen feat branch oder released aber eh nicht beides. Beim release ist der push dann doch inkludiert?"

## Context

The three greenfield reports found that evidence stayed outside the repository. The push signature can only exist after the commit that carries the audit bundle, so its proof, the final Verify and the Security result cannot be inside that commit. A follow-up commit existed, but only together with a release tag on main. A run that pushed a feature branch kept those records in the private store. In the Claude run all six Critic reports stayed in scratch, because exporting them was a separate hand-written step.

A consumer release also demanded an earlier signed push to main, so a release took three signatures: design, push and release.

## Decision

1. **The close exports every Critic round itself** from the private journal (the verdict, checked against the digest in the receipt) into the feature, inside the one close commit. Working notes stay out. A round it cannot read stays named and never stops the close.
2. **One follow-up commit after any signed push or release, to the same destination, with no further signature.** It carries the push or release proof, the final Verify record and the final Security verdict as new files under the bundle's `proofs/`. The guard admits it only when it is exactly one commit on an approved and published parent and adds only public proof objects, one list and exactly the two records whose digests the close recorded privately for a candidate of this history. The raw scanner output and the push-boundary Verify have no recorded digest and do not travel. Nothing can chain onto it: the follow-up commit itself carries no approval.
3. **A signed release includes its push.** The human signs two things in all: the design, and then either a branch push or a release. The signed release approval names one commit, and it stands in for the push approval of exactly that commit to origin's main as a fast-forward. Verify, Security and every other gate still run. In `chat` mode the release approval is written without any human input, so it does not stand in: that push keeps its own `approve-push --by` act.
4. The generated pre-push hook decides these cases through the same predicates as the push guard.

This changes the decision of 2026-11-08 that the proof travels only with the version tag, and moves the proof and evidence part of CGF-25 out of 0.7.1. The portable auditor package stays in 0.7.1.

## Consequences

Evidence reaches the repository on both routes without a further stop. The guard relaxes one narrow shape; any other content meets the full gate unchanged. The final Verify record and the Security verdict become tracked, so what they name becomes visible to whoever reads the repository. A signed release can now be the first thing that reaches main, so its approval carries the weight the push approval carried before.

## Affected contracts

ADR-0056 stays: every push still needs a human approval. A signed release approval is that approval for its own push; in `chat` mode `approve-push --by` remains it. `docs/push-release-flow.md` describes both routes.
