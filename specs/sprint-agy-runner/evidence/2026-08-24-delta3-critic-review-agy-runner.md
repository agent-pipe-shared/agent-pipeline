# Delta Critic review #3 — sprint-agy-runner AGY-FIX2 correction wave (2026-08-24)

Bounded delta re-review of the AGY-FIX2 correction wave that answered the
second delta review's findings D1–D7
(`specs/sprint-agy-runner/evidence/2026-08-23-delta-critic-review-agy-runner.md`).

- **Base:** `ea1432e96904f13f52cf591678b239d2f6a6d563` (the second delta
  review's reviewed head)
- **Head:** `fdd987279c9dffad32762de57e2aafd91b10fc74`, tree
  `304afbee63ec6d91f066ea663830d802b89d2a3b`
- **Object:** 23 enumerated commit SHAs; the Critic independently confirmed
  the range resolves to exactly those SHAs in that order.
- **Route:** requested `claude-opus-5 at max`; effective identity
  `claude-opus-5[1m]` from direct same-dispatch evidence. Effort level is not
  observable from inside a dispatch and is recorded as unobserved, not
  confirmed.
- **Lane:** functional-equivalent-read-only; OS isolation not asserted.
- **Critic notes:** `scratch/critic-agy-ef201753/critic-notes.md` (gitignored).
- **Dispatch prompt (archived, contamination-boundary reference):**
  `scratch/critic-dispatch-agy-delta3.md`.

## Verdict: **FAIL**

Four majors, three minors. Findings are numbered F1–F7 here (the Critic's own
numbering; distinct from the first review's F1–F19 and the second review's
D1–D7 — same label space reused across rounds, disambiguate by review date).

## Findings

**F1 — major — The D2 fix traded a false positive for a false negative in
the lane's only prose detector.** `30e0adcc` replaced
`/\b(you are|please|examine|look at|review)\b/i` with
`/(?:^|\s)(you are|please|examine|look at|review)\b/i`. That closes the
hyphen collision (`critic-review.md`), but `\b`→`(?:^|\s)` also stops
matching any trigger word preceded by markdown emphasis, a quote, or a
bracket — `- **review** the tests`, `"Review the diff."`,
`(please look at the tests)` all now pass. `guard-dispatch.mjs` states of its
own check: "This check is structural. It cannot see a steer written in fresh
prose — read the template." A hand-written, prose-steered Critic briefing —
the exact failure mode CLAUDE.md names — now passes whenever the steer
carries ordinary markdown formatting.
Evidence: `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs:383`;
`plugins/pipeline-core/hooks/guard-dispatch.mjs:117`. The only prose test
case is `"please review the code"` — bare, start-of-string — so
`antigravity-pretool-guard.test.mjs` cannot detect the new gap.
Spec-ref: CLAUDE.md "Dispatch from the template, never freehand";
`spec.md` §8.3; QG-04.

**F2 — major — The D3 fix repairs only the local check;
`guard-dispatch.mjs` still sees only `Subagents[0]`.** `06483053` adds a
`subagents` array but deliberately keeps it off `toolInput` "so
canonicalPayload … stays byte-identical". `canonicalPayload` is built from
`toolInput` alone and is the only payload forwarded to `guard-dispatch.mjs`;
`toolInput.subagent_type`/`prompt` still derive from `Subagents[0]`. With
the Critic at index ≥1 of a multi-subagent envelope, `guard-dispatch.mjs`
never sees that entry and never runs — the same index-0-only defect class D3
filed, still open one layer down, documented in a code comment with no owner
and no expiry (QG-06 shape).
Evidence: `antigravity-pretool-guard.mjs:213`-`214`, `223`, `438`-`442`,
`467`.
Spec-ref: `prd_agy-runner.md` §2 invariant 1; `spec.md` §8.3; QG-06.

**F3 — major — Five commits claim goldfish dispatch IDs for which no
dispatch record exists.** `30e0adcc`, `06483053`, `42196d50`
(`AGY-FIX2-HARDENING`), `1b55b98c` (`AGY-FIX2-PUSHGUARD`), `c15ccdff`
(`AGY-FIX2-REGISTER`) all carry `Dispatch: <ID> (goldfish)`. `evidence/`
contains no dispatch record for any `AGY-FIX2` task id, while the prior
wave's records (`AGY-FIX-PUSHGUARD`, `AGY-FIX-HARDENING`, etc.) survive
alongside — making pruning an implausible explanation for the absence.
`agent-obligations.md` §6 makes the goldfish trailer a checkable claim; a
commit that fails this check is `UNVERIFIABLE`, never a pass. All five
production fixes in this wave are therefore unverifiable by the machine
check. `dispatch-authorship-verify.mjs` could not be run by the Critic to
confirm mechanically (it shells `git rev-list` in `process.cwd()`, and the
closed shell grammar admits no `cd`), so this rests on direct filesystem
evidence.
Spec-ref: `agent-obligations.md` §6; EL-01/EL-16.

**F4 — major — D4's remediation is orchestrator-authored production code on
protected path TP-5, claimed as stage-0.** `4244ad7a` adds 78 lines to the
guard-push test suite (TP-5) — a new spawn helper, a new fixture-repo
helper, and three cases including a fail-red regression test — under
`Dispatch: stage-0 (elephant)`. Every other D-finding fix in this wave went
to a goldfish dispatch. New test infrastructure remediating a major Critic
finding on a protected security suite does not fit stage-0 ("small,
disclosed, judgment-light work with no dispatch behind it"); the test
validating `1b55b98c`'s D1 fix was written by the orchestrator rather than
independently. Mitigating and disclosed: the TP-5 author-repair ceremony is
human-gated and no subagent can run it; `b4ffd460` records the ceremony's
obstacles. That makes the route awkward — it does not make the `stage-0`
claim accurate.
Spec-ref: EL-01/EL-16; `agent-obligations.md` §6.

**F5 — minor — The stage-0 definition has no home at its cited anchor.**
CLAUDE.md and `agent-obligations.md` §6 both cite "operating-model §3.3" /
"OM §3.3" as the governing definition of the stage-0 fast path.
`docs/operating-model.md` has no §3.3 — section 3 has no numbered
subsections — and the string `stage-0` does not appear anywhere in the file.
Spec-ref: QG-04.

**F6 — minor — D6's broadened containment still misses common shell inline
forms.** The `sh`/`bash` alternative matches a bare `-c` only. `bash -lc`,
`sh -ec`, `sh -exc` bypass it; `zsh -c` / `dash -c` are not in the
alternation at all. All six forms D6 actually enumerated are covered with
tests — this is residual surface, not a regression of D6 as filed.
Evidence: `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs:395`-`396`.
Spec-ref: `prd_agy-runner.md` §2 invariant 1.

**F7 — minor — `spec.md` is internally contradictory about the retired
Antigravity hooks-config projection.** `spec.md:59`-`62` states the
standalone `.agents` hooks-config projection was retired in `ffa55f78` and
discovery now goes via `.agents/plugins.json`. `spec.md:139`-`141` (Wave 3)
still instructs creating a generator for that same retired file. `e7110c7d`
reconciled only the PRD, not the spec.
Spec-ref: QG-04; ADR-0045.

## Deliberately not flagged (examined and cleared)

- D1 (guard-push.mjs cwd fix) — answered, both call sites verified.
- D7 — answered, and the unverified-fix disclosure in `docs/state.md` and
  the next-session instruction were specifically praised as exemplary.
- The 2026-08-24 trust-anchor rotation (`93b7775e`) — outside D1–D7 scope but
  fully disclosed with rationale, actor, and precedent.
- Test integrity — nothing weakened; the D2 neighbour case was strengthened.
- Dependency reality check (SEC-04) — no new dependencies in the range.
- Language assignment (ADR-0011) — all new artifacts correctly English.
- Secrets / machine-specific paths — none introduced.
- Directory contract (ADR-0063) — new items and evidence correctly placed.
- Candidate/HEAD gap — dropped: verify artifact and `docs/state.md` both
  name `f07b22f4` as the bound candidate; `fdd98727` only changed
  `docs/state.md` itself.
- Version bump build metadata lagging HEAD by three commits — inherent to
  mid-range bumping, dropped.

## Trajectory check: **consistent**

The verify artifact is machine-shaped, its command matches the project's
declared gate, no nonzero exit code anywhere, and it binds exactly the
commit `docs/state.md` names as the candidate. One dispatch-side (not
diff-side) inaccuracy: the dispatch's claims/evidence line misstated the
verify artifact's candidate commit as `fdd98727` instead of the correct
`f07b22f4` — the deliverable itself is accurate.

## Briefing violations observed

1. Dispatch inaccuracy (not contamination): claims/evidence line misstated
   the verify artifact's candidate commit.
2. Boundary edge, self-resolved: D7's text points into a longer Elephant
   narrative section; the Critic read only the D7-referent portion, not the
   "PO disposition, 2026-08-24" section, per the input-contract instruction.
3. Auto-injected context (accepted, disclosed per template): CLAUDE.md,
   parent-session start-of-session git snapshot (not used as freshness
   reference), MEMORY.md index.
4. Pre-existing scratch state from two earlier Critic subdirectories and
   Elephant working notes — not read, confined to own subdirectory; this is
   the exact exposure `backlog/items/2026-08-23-elephant-notes-and-critic-scratch-share-one-directory.md`
   already tracks.
5. `dispatch-authorship-verify.mjs` could not be run by the Critic (shells
   `git rev-list` against `process.cwd()`; closed shell grammar admits no
   `cd`) — noted as a tooling gap, not held against the diff.

## Round budget

This is the third Critic round on this package (initial full review, delta
review #2, this delta review #3). CLAUDE.md/review-protocol allow at most
four rounds total (initial + up to three delta re-reviews) — one further
round remains available after the next correction commits, not more.
