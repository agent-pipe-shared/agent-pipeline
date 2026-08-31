# Handover archive -- Prior current handover — the three-runner greenfield findings are being worked, happy path first (2026-08-28)

> Rotated from `docs/state.md` on 2026-08-31 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Prior current handover — the three-runner greenfield findings are being worked, happy path first (2026-08-28).
> Summary: The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation.
> Append-only once written; never edited by hand.
> Content below is byte-for-byte identical to its original `docs/state.md` text at the time of rotation.

## Prior current handover — the three-runner greenfield findings are being worked, happy path first (2026-08-28)

**READ THIS FIRST.** The greenfield test ran candidate 0.6.0 across Claude/Windows,
Agy/WSL and Codex/WSL against one design document. Eighteen backlog items came out
of it (`9e4a59d6`, `f51f8f4e`), and the PO set the priority explicitly: the happy
path ends at the push, so everything on that chain is NOW, not Nova B. Security is
default ON with its prerequisites made ready during init.

**The PO's own framing of the goal, kept verbatim because it is the acceptance
bar:** *"das onboarding muss guided viel einfacher für die agenten werden"*. Onboarding
today exposes ~31 subcommands with plan/apply digest pairs that an agent must
sequence by hand; all three runs independently named this their largest friction.
The decision (AskUserQuestion, 2026-08-28) is **"Flow neu, Kern behalten"** — rebuild
the orchestration, leave the binding/crypto core untouched. Nothing in this work
weakens a digest, a binding or a signature.

**Work is running in rounds of parallel worktree-isolated Goldfish dispatches.**

*Round A — landed and independently verified, not taken on report:*
`53693c3d`/`3e6bfce4` scratch-during-intake admission (161/161) · `fffb0001`/`cb673ab1`
absent pre-push hook reported as an unbacked gate (7/7) · `131a9901` twin-manifest
drift detection (34/34) · `89f30758` shared copy-safe renderer (5/5, incl. a real
`bash eval` round-trip). Merged guard suite: 162/162.

*Rounds B through L — landed, each collected by worktree inspection rather than
from its report.* The guided init driver exists and reaches a terminal `ready`
in five driver invocations and four human rounds, with no repair subcommand
(rounds F/H). Preflight resolves the active runner from three positive signals
(G) and a not-ready project's bootstrap `nextAction` now names the driver, so
an agent can learn it exists (K). The closed shell grammar admits bounded `&&`
chains under a union rule and states the admitted grammar when it refuses (I).
gitleaks resolves a plugin-shipped default config and downgrades a missing one
to SKIPPED; `push-prepare` respects `gates.security` (J). The Critic contract
gained **reachability and effect** as a seventh mandatory search dimension, and
that addition is carried into the vendored plugin copies (L, `1f51ddc4`/`fa6309b5`).

*Rounds M through U2 — landed, every one collected by worktree inspection
rather than from its report.* M/P fixed the PO profile receipt at the apply
BOTH promotion callers share (suite 247). N made a refused signature push name
its typed predicate and made the two trust-anchor-policy readers agree. O put
the "walk the signature, never offer alternatives" rule where an agent is bound
by it. Q2 made the `draft` gate derive `--by`/`--profile` from what onboarding
already persisted — the design→implementation walk went from two human stops to
one. U/U2 reconciled twelve of the 27 NOW-tracked items against the code, each
closing note naming the file and lines read; **thirteen of the nineteen still
open have NOT been re-measured** and may be stale in either direction (Round O
already partly satisfies `agents-talk-the-po-out-of-the-signature`, which does
not know it).

**The ready-gate blocker (T, `b317f139`) — the session's most consequential
finding.** `lib/project-onboarding-ready-gate.mjs` validated every observation
against a hand-maintained eleven-name `RESULT_KEYS`, while
`project-onboarding-v3.mjs` attaches `pushApprovalMode` and
`trustAnchorAvailability` to a `ready` result and to no other status. `exactKeys()`
therefore failed **exactly when a project is ready** — the only case the gate can
otherwise pass — refusing every governed write in every ready project. Invisible
because the installed marketplace copy was an older build; it surfaced the moment
the PO rsynced the candidate. The accepted shape is now status-specific and still
exact in both directions, with three pinning tests, measured against the real
producer through the real gate (13 keys, all three intents accepted) rather than a
stub. The **pattern** stays open: three hand-maintained mirrors of a shape this
module does not own, a suite green because it never asks the real producer, and
T's own tests are a fourth copy — its item requires the enumeration to be derived.

**Carried forward from the rotated 2026-08-27 handover, because neither has
another home.** (1) The **open release decision**: the PO corrected on 2026-08-26
that 0.6.0 is a combined Nova+Phoenix number, not Nova-only. Undecided — intake
Phoenix now and release combined, or release Nova alone under a different number.
`0.5.7` is not a candidate; `VERSION` and every stamp already say 0.6.0. This does
NOT block a local candidate stamped `0.6.0+…`; it blocks calling a *published*
artifact 0.6.0. (2) **AK-6** is ready to re-dispatch against
`pipeline-user-v3.schema.json` (the first attempt used the pre-v3 schema and would
have flagged a correct calibration as drifted; withdrawn `1d6dec55`, scaffolding
kept at `8316dbd8`).

### Where the candidate stands (night of 2026-08-28/29)

Twenty-one commits since `1c95de2c`. **486 of 488 Verify entries green** on a
quiesced tree; security scan CLEAN, exit 0. The five touches are wired and
measured live against an empty directory, not inferred: the guided driver runs ten
steps on its own and stops exactly **three** times — author/push-mode/verify-command/
trust-anchor bundled into one stop, then consent+language+profile+first description
in a single call, then the one bundled design-question round — and the project
reaches `ready` with a bound PRD/Spec.

**The two remaining red Verify entries both need the PO's key, not more work.**
`verify-suite-registration-check` (two suites that pass standalone but are not in
`verify.mjs`, TP-3) and `pipeline-state-tests` (PS53j, TP-5, proven pre-existing by
running the same check against `1c95de2c` in a separate worktree). Spec §8 already
grants a standing Nova authorization to lift TP-1/TP-3/TP-5 for an exact task —
this handover previously mis-recorded that as a PO gate to be requested. The
authorization exists; `guard-testpath` reads `gates.push_approval`, this repository
is on `signature`, and that mode has no in-session activation step. So the ask is
"sign", not "authorize".

**A standing authorization the mechanism cannot honour reads as a blocker to every
agent, and did to three sessions in one night.** Whether §8 promises more than the
guard delivers, or the guard's signature mode should know about §8, is an open
design question.

### The 2+2 Critic round

Two independent Critics on the frozen candidate: both **FAIL**, on a blocker aimed
at the dispatch rather than the code — QG-01 forbids handing a diff to the Critic
while deterministic gates are red, and that was done knowingly. Their verdict on
the candidate therefore stands under that reservation and is not a release.

Two Re-Critics on the rework diff: both **PASS**.

The round's yield was mostly about the dispatcher's own work: a wrong
authorship-evidence artifact (fixed), one commit carrying no `Dispatch:` trailer
(`278ce178`, unfixable without rewriting history), the TP-3 misreading above, and
one security gap no tool could have found — `GMWKC01` walks kernel→imported, so a
module that *imports* a kernel module is structurally invisible to it. The two
Critics disagreed about that gap; the one who filed it was right.

### Open, measured, not blocking a local test

The ready-gate shape is hand-maintained in three places. Reachability is a
review-time prompt with no mechanical check. **BS25/BS26 durability** (ADR-0068 D6):
three positional ledger lookups remain (`backlog-state.mjs:1326`, `:1504`, the test
fixture); two can bind by `entryHash`, `amendsSequence` needs an additive
`amendsEntryHash`, and the fixture must stay positional, so the prefix invariant
becomes a named check. The **Antigravity hard-enforcement layer's two fail-open
paths** (PO instruction 2026-08-27, in this candidate): the whole layer is inert
whenever the daemon cannot resolve `node`, and it fails silently because the hook
that would report it is the one that does not run.

**Two of the four documented reasons for `security: off` are stale** (`c67397d7`).
What actually blocks is the v2 verdict's three offending required capabilities plus
a license allowlist that resolves only inside this repository.

**Codex restarts where a resume would do.** The barrier's contract requires "a
ticket proving a fresh *Codex* process re-read those bytes" — a new process, not a
new conversation. By that contract a resume clears it and keeps context. The one
empirical fact it turns on is unmeasured: whether `codex resume` re-reads
`.codex/*`. Measure that before changing any instruction.

**One defect class runs through all of this.** Capabilities that pass their own
tests while being unusable — *named but not admitted*, *admitted but not named*,
*published but not consumed*. **The mechanism was measured, the path to the
mechanism was not.** Filed as `a33ea0cc`, with the complementary Critic dimension
landed in Round L; that dimension then found the night's largest defects, which is
the evidence it is correctly worded.

Its sibling shape, seen repeatedly during the night: **a change to A creates an
obligation at B, and only a later gate run reveals it.** Editing a doc staled its
vendored copy; regenerating that copy tripped the consumer-path scanner; extending
the Critic search surface invalidated a security baseline pinned to it; registering
five suites silently invalidated the capability inventory. None is carelessness;
each is a missing coupling.

### The PO's acceptance bar, kept verbatim because it is what "done" means

> *"1. ich bestätige, dass die pipeline installiert werden soll 2. ich beantworte
> eine reihe anfragen fürs onboarding (modus, author, etc.) 3. ich gebe PRD frei
> 4. ich verlange den push 5. ich signiere den push"*

Touch 3 carries an open quality question rather than a defect: what the PO releases
is a staging draft that is a verbatim intake transcript until an agent authors the
product framing. The flow is coherent — binding is provisional, the real release is
the plan-approval gate — but nothing forces the authoring step between the two.

**Still true and unchanged:** the push gate is `approval: required` with
`gates.push_approval: signature`. Nothing here unblocks a push, and no outstanding
item may be reported as done while its gate is pending.

