---
schema: pipeline.backlog-item.v1
id: pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
source: "PO, 2026-08-16 push-flow analysis: 'der push ist durch zu viele sachen viel zu schwierig und umständlich geworden. Man kann nicht zeitnah einfach mal pushen selbst nach freigabe nicht.' Named Block F in that session and agreed for filing; the measurements below were taken in the same session."
---

# Every gate binds the whole tree, so any following commit voids it and all work serializes

## What binds today

Verify evidence, security evidence, and a push approval each bind one exact
commit. `checkEvidenceFreshness` requires both `exitCode === 0` and
`commit === sourceCommit`; a recorded approval names the exact candidate
commit. None of the three records *what it actually read* — the binding is to
the commit as a whole, not to the inputs the gate consumed.

## The consequence, as it played out in one session

Any commit landing after a gate ran voids that gate's result, regardless of
what the commit touched. In the 2026-08-16 session this dictated the entire
work order: no commit could land while a Critic was reading evidence; the
version stamp had to be the last commit before the plugin was copied; backlog
filing, handover folding, and the stamp all had to be frozen before verify ran.
With verify at 269 suites, the working rule collapsed to one committer at a
time — which is also the shape of two already-filed defects
(`2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md`,
`2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md`).
Those two are about mechanism collisions; this item is about the binding rule
that makes serialization necessary even when no collision occurs.

## Why the obvious narrowing is unsound here

The tempting fix — "documentation changes are inert, exempt them" — is false in
this repository, and measurably so: **four registered gates read the handover
file `docs/state.md` as an input.** A docs-only commit can therefore change a
gate's verdict. Any exemption keyed on file type rather than on declared inputs
would be a guarantee the repository does not actually hold.

## Direction, not a design

Each gate declares the paths it reads. The binding envelope of a gate result is
the union of its declared inputs. A following commit whose diff touches nothing
in that envelope preserves the binding; one that touches it voids the result,
exactly as today.

Two consequences worth naming before anyone implements this:

1. The same declaration enables selective suite execution — the lever is shared
   with the verify-growth item filed alongside this one. One mechanism, two
   problems.
2. The declaration must be verified, not trusted. A gate that reads a path it
   did not declare has to fail, or the envelope is a lie and the binding is
   weaker than the one it replaced.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
