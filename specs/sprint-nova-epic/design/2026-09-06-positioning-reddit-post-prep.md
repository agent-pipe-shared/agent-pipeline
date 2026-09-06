> **Persisted 2026-09-06** from the read-only positioning session's scratch
> output `scratch/reddit-post-prep-2026-09-06.md`, verbatim apart from this header and
> the cross-reference paths noted below. Design input for the 0.6.2
> documentation block (D.1–D.6 in the handover file), not canon: nothing in
> it is a decision until an ADR, a guardrail, or `docs/state.md` says so.
> Status tags inside it (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP)
> are load-bearing and must not be rounded up.

# Reddit post prep — Agent-Pipeline first public feedback round (2026-09-06)

Session notes. Everything below was assembled read-only from this checkout on 2026-09-06.
`[KORRIGIERE MICH]` marks a claim the repo does not record and the PO must supply or correct.
Release gate for the post: **0.6.2** (Nova B interim release) — not 0.6.1.

---

## 0. Decision: post now vs. after Nova B / Alfred

PO decisions 2026-09-06: **one product** (no split); target audience **teams with audit
obligations and users who want measurable rails**, stated early in the post; Reddit feedback
still requested; ships with **0.6.2**. Positioning and doc work for Nova B:
`specs/sprint-nova-epic/design/2026-09-06-positioning-and-doc-gaps.md`.

Recommendation: post **with 0.6.2**, narrow — r/ClaudeCode, Claude Code only, the two USPs
(enforcement over instruction; traceability) — and keep Alfred for a second, bigger post.

- Both USPs are real in code today (`hooks.json`: 10 PreToolUse guards; candidate = commit+tree
  everywhere; three hash-chained governance streams; `Dispatch:` trailers).
- Alfred Track D (architecture) sits behind Waves 0–2 and a 14-day C1 baseline — a month plus.
- Nova B's theme is onboarding friction, i.e. exactly what outside first-contact data would
  prioritise. Collect that data before Nova B ends, not after.
- The honest fork: if the feedback wanted is about *architecture governance*, wait — that is
  Alfred's story ("we measured which of our own rules are enforced, per runner") and it belongs
  on r/ClaudeAI or broader.

Subreddit rules could not be fetched live (reddit.com blocked for the fetcher). From knowledge:
r/ClaudeAI requires a post flair and mods remove promo-shaped posts; r/ClaudeCode is smaller,
more technical, tolerant of plugin/tooling showcases. Flair: Showcase / Resource (r/ClaudeCode),
"Built with Claude" (r/ClaudeAI).

## 1. Pre-post fix list (doc drift — user-facing pages a Redditor reaches in two clicks)

1. `origin/main` README (and `docs/operating-model.md`, `docs/overview.md`, `docs/usage.md`,
   `docs/whats-new-0.6.0.md`) still say "Current candidate: `0.6.0` — not released";
   `CHANGELOG.md` says 0.6.1 released 2026-09-02, tag `v0.6.1`.
2. CHANGELOG 0.6.1: "the local gate passed on the released commit and CI did not" (3 suites red).
   Either CI green for 0.6.2 or say it in the post.
3. `docs/release-state.json` still records 0.5.4.
4. GitHub repo description: "my personal agent pipeline shared for everyone to use" — decide.
5. `docs/runtime-boundary.md` stale: "nothing outside Claude Code runs [enforcement]", lists 4
   guards (code: 10+), still describes stop-suggest's context-budget warnings (removed
   2026-09-04), offers `agent_runtime: claude-code | other`. `docs/operating-model.md` §2 is
   current ("Codex has its own plugin manifest and pre-tool guard adapter. Antigravity … via
   `.agents/hooks.json`").
6. `SETUP.md`: "Codex currently has no SessionStart hook in its manifest" — `codex-hooks.json`
   has one (plus PreToolUse on `Bash` and `apply_patch|Edit|Write`).
7. `docs/product-capability-inventory.json` marks `handover-hard-size-gate` as **planned**; the
   guard header says "live on every Edit/Write/NotebookEdit call … not merely built and awaiting
   wiring". The inventory itself carries `criticReview.status: required-before-publication`.
8. `CHANGELOG.md` jumps 0.6.0 → 0.5.1 → 0.4.6: no entries for 0.5.2–0.5.4, 0.4.0–0.4.2, 0.3.x
   although `docs/release-0.4.x/0.5.x-readiness.md` exist.
9. `docs/codex-isolated-critic-foundation.md` is entirely German (maintainer doc; not covered by
   `check-language-canon`).
10. `sprint_alfred` is pushed and public; its PRD §1.2 says the enforcement layer was "falsified by
    live measurement, three times over" on 2026-08-27. Say it in the post first.

## 2. Assumptions

- "Sul" = SUL-1.0 (Sustainable Use License) — confirmed by PO.
- Runner = Claude Code → r/ClaudeCode first. Swap blocks for Codex/Antigravity in §6.
- Tester mail "Feedback Testlauf AP" (2026-08-19) has no body, only two `.md` attachments
  (`agent-pipeline-greenfield-analysis-2026-08-19.md`, `…-evaluation-2026-08-19.md`), base64
  inside base64 in the RAW MIME — not decodable under the guard grammar. The repo's derived
  findings from the same date were used instead. If the attachments carry wording that should go
  in: drop them into `scratch/` or paste.
- No third-party addresses, employer domains or relationship words anywhere in this file or the
  post.

## 3. Latest greenfield test data — what survives in the repo

Gone from every checkout: `scratch/greenfield-triage-2026-08-29.md` (source of findings F1–F31)
and `docs/pipeline-session-analysis-2026-08-28.md` (recorded as "missing from this checkout";
the Codex forensics item was discarded for that reason on 2026-08-29). Claude/Windows
transcripts live on the other machine.

| Run | What is recorded | Source |
|---|---|---|
| 2026-08-28/29, three runners (Claude/Win, Codex/WSL, Agy/WSL, one design doc) | 18 backlog items. Telemetry only as runner **self-estimates**: Antigravity ~40% administration, **16 min end-to-end**; Codex ~60–75%; Claude/Win ~90%. Not metered; the 4:1 spread is the finding | `backlog/items/2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance.md` |
| 2026-08-25, Agy test repo (`_archive/Rune_Test1_Agy_060_62`) | Commit clock: onboarding 07:26:27, feature 07:26:32, fix 07:47:48, push prep 19:00. No report, only `verify-latest.json` | repo history |
| 2026-08-10, Claude, measured | 1h37m wall-clock, 79% pipeline mechanics, ~11 min on three CLI-syntax-rediscovery subagents, **push abandoned after 16 min — nothing shipped**. Both causes fixed since (`8ae0de01`, `23b92d6f`) | `backlog/items/2026-08-10-happy-path-turn-and-wall-clock-cost-is-not-externally-defensible.md` |
| 2026-08-09, Claude, paired | $26.27 vs $1.62 without pipeline (16×), 1h11 vs 10 min; second wave on a fixed candidate $13.30 (control not rerun) | `backlog/items/2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md` |

`[KORRIGIERE MICH: numbers of the PO's latest run — wall-clock, cost, push yes/no]`

Efficiency work Nova B is shipping (the 0.6.2 rationale, all from the repo):

- Verify gate **645.7 s → 482.5 s (−25%)** on 2026-09-06 via one lane eviction, no loss (515
  suites, same single red). Pool parallelism 2.55×. Top-5 lane members = 59% of runtime, not
  evictable; next lever is module scoping. (`backlog/evidence/2026-09-06-lane-eviction-measured-result.md`)
- Guard denials: 70 lines of boilerplate for 5 lines of content — closed 2026-09-04.
- Dispatch bootstrap costs 50–150k tokens before any work — open (`sprint: alfred`).
- Sequential-by-default → machine-enforced task slicing: ADR draft, increment 1 (`guard-slicing`)
  built and tested, wiring awaits an operator run; today's channel probe was its precondition.
- "Every small correction re-hashes the candidate and costs another signature" — open (`sprint: batman`).
- Guided driver: three human stops instead of a turn-by-turn state machine — landed 2026-08-28.
- `pre-gate.mjs`: seconds instead of ~13 minutes — landed.
- Gate today: 514/515 green, last red needs one TP-3 signature; 0.6.1 CI was red on 3 suites.

## 4. The post

### Title options

- *I vibe-coded a 357k-line system to stop me from vibe coding. It costs 16× more, refused to let me push, and has 79 ADRs about itself. Please break it.*
- *Two months, 5,700 commits, sprints named after superheroes and one butler, and an HTML game that never got pushed: my Claude Code guardrail pipeline is ready for outside eyes*
- *My agent pipeline is a token furnace with a signature ceremony. It also caught the agent trying to weaken its own gates. Feedback wanted.*

### Body

**TL;DR** — I built a Claude Code plugin where the rules the agent must not break are hooks that
*refuse*, not paragraphs it may ignore, and where "done" is a machine artifact bound to an exact
commit. It is 357k lines (a great many of them tests), it burns tokens like a 2019 GPU farm, it
costs 8–16× more than just letting Claude cook — and it's dogfooded so hard it has 79
architecture decision records about itself. **It is not yet efficient enough for real work.**
That's what I'm tuning, and why I want you to break it. Source-available (SUL-1.0), not OSI.
Test on **0.6.2** (out `[DATUM]`), not 0.6.1. Ten-minute test at the bottom; three questions I
actually want answered.

**Who this is for, so you can skip it early.** Teams that have to *show* someone what the
agent did and who approved it — audit, compliance, regulated code, "why did this ship" — and
people who want rails they can *measure* rather than rails they're told about. If you're
building a weekend project, this will feel like a tax office. That's not a bug; it's the wrong
tool for you, and the dials exist mostly so you can turn it down. I'd still love to hear where
it refused you.

**How I got here.** It started small. I had three projects with agents and one CLAUDE.md I kept
copy-pasting between them. It drifted. Then the agent reviewed its own work and gave itself an
A. Then it force-pushed. So I wrote a hook. Then a second hook, for the thing the first hook
didn't catch. Then I gave the roles names — an *Elephant* that plans and never forgets, *Goldfish*
that implement and forget everything, a *Critic* that never sees the chat — because Dave
Rensin's paper said so and it's easier to yell at an Elephant than at a session ID. (The rest of
the thinking is borrowed too: Addy Osmani's *model + harness* framing, and the Kaggle
spec-driven whitepaper's argument for very few human sign-offs. Synthesis, not invention.)

Two months later: 5,700 commits, 79 ADRs, ~515 test suites, ten threat-model documents, sprints
named Sentinel, Cyborg, Phoenix, Nova, Batman, Hawkeye and Alfred (Alfred is the one doing
architecture — of course he is), and a signature ceremony with an Ed25519 key for every push.
The pipeline built most of itself, under its own rules, reviewed by its own Critic. It has a cost
ledger. The ledger has opinions.

I also measured it against *not* using it. Same tiny HTML game, same model: **$26.27 vs $1.62**,
1h11 vs 10 minutes — and in the two-hour run the push was abandoned in the last 16 minutes, so
the expensive one shipped nothing. That number is the reason for this post, not a footnote. The
pipeline works. It is not yet *worth it* for a Tuesday-afternoon feature. Fixing that is the
current sprint, and outside eyes will find the dumb stuff faster than I do.

**It's built around two ideas.**

**1. An enforcement layer, not an instruction layer.** Every rule that matters here has the same
biography: written as prose, broken the first time a concrete task competed with it, turned into
a PreToolUse hook that refuses with exit 2 and the reason. Today the hooks refuse:

- force-push, history rewrites, deleting protected branches/tags, `--no-verify` — with
  quote-stripping and global-option normalisation, so `git -C repo push --force` and a commit
  message that merely *mentions* force-push don't fool it
- a `git push` whose verify/security evidence is missing, red, or bound to a different commit
  than the one being pushed — or that lacks an approval bound to that exact commit
- implementation edits before the human approved the plan
- edits to the tests that gate the implementor's own change
- **edits to the files that decide how strong a gate is** — including the installed guard code
  itself. I asked "what stops the agent from writing `gates.push_approval: chat` and pushing on
  its own authority?" Measured answer: nothing, three guards returned *allow*. An agent that can
  weaken its own gate has no gate.
- the orchestrator writing production code without a live, machine-checked dispatch record
- a reviewer briefing that wasn't built from the template — a hand-written one smuggled in the
  dispatcher's own hunt list, and the review came back organised along it
- a subagent past its tool-call budget, counted externally — self-reports lied ("34 logged",
  runtime: 62)
- any write in an ungoverned folder before the human has been asked and answered
- the handover file growing past its cap (shrinking is always allowed — a rotation must never be
  blocked by the cap it enforces)
- and one simple shell command per call — piped one-liners are refused, which you will hit in
  your first five minutes

Around the hooks: the **only** state writer is one CLI, so "plan approved" is a committed record,
not a chat memory. Every human gate is one terminal command, the word `approve`, and a passphrase
for an Ed25519 key that never enters the repo; the command checks it's running on a real TTY,
because an agent's harness never has one. A guard override exists — for one exact tool call,
digest-bound, one use, audited, with an expiry. Hook bypass has no agent-side override at all.
And the rules agents are judged by are *generated from the guards* into the briefing,
byte-equality tested, because a hand-copied second list drifts.

On 2026-08-27 I measured this layer against itself and it failed three times. That's the current
sprint: every control has to declare `enforcedBy: git-hook | tool-scope | runner-hook |
posthoc-verify | prose`, and `prose` is a visible admission, not a default.

**2. Traceability you can audit without trusting the agent's summary.**

- "done" is a machine artifact bound to the exact commit *and* tree; stale evidence is a typed
  non-success, never carried forward to a changed tree
- ~515 registered suites behind one `verify` entry point, per-suite receipts binding suite
  digest, declared inputs and candidate tree; a voided gate is re-earned from declared inputs,
  not from a commit-diff envelope; a missing scanner reports `skipped`, never `pass`
- implementation commits name the dispatch that wrote them, and a per-commit check refuses
  production diffs without provenance
- three append-only, hash-chained governance streams (human / agent / lifecycle) with canonical
  bytes and checkpoints — the head file is a projection, never authority
- an agent decision journal that records assumptions, selections, fallbacks and escalations as
  closed event types and **rejects free text, prompts and chain-of-thought by schema**
- an offline HTML evidence viewer that can only ever say *invalid*, never turn into a pass;
  create-only audit bundles; a replay that reports `unavailable` rather than a partial history
- a reconciliation ledger: every decision record implicated by a push range is `checked` or
  `amended`, and the ledger cannot live inside the commit it covers
- docs gated like code: 29 checkers for ADR consistency, reference paths, language canon, license
  contract, ownership, directory contract, capability inventory, consumer-safe paths, and more
- an error register where a recurring class **must** resolve to `mechanism | template | lesson`,
  and a close ritual whose retro question may be answered "nothing" but never skipped
- 79 ADRs, numbered at acceptance, never rewritten

**Built, not yet live — said plainly.** A few pieces exist as tested modules with no wiring yet,
and their headers say so: a default-to-parallel nudge for dispatch batching, a review-retry
planner that decides which evidence survives an abort, a temp-directory leak guard, a
trailer↔record authorship verifier, the `plan` half of a project reset. They're in the repo; they
don't enforce anything today.

**The roles, in one breath.** An *Elephant* (long-lived orchestrator) turns intent into spec and
small tasks. *Goldfish* (fresh-context subagents) implement exactly one task and return evidence
— command, log, exit code — never "should work". A *Critic* (read-only, fresh context, never sees
the chat) reviews. Two human gates: plan sign-off up front, completion sign-off at the end.
Everything else runs.

**Proportionality.** Three dials — rigor per task, governance mode per rule set, work profile —
and a T0–T6 review-trigger matrix, so a lockfile bump auto-passes and a guardrail one-liner gets
the strongest reviewer in native isolation. Cost is tracked per task from local transcripts
against a price table, always as a marked estimate.

**Security.** gitleaks / osv-scanner / semgrep / license-check behind the same gate, a control
catalog mapped to NIST SSDF and OWASP ASVS with waivers that expire, a finding lifecycle,
CLA/DCO gates bound to the PR author's own action — and ten threat-model documents, each with a
stated residual boundary.

**Where efficiency stands — honestly.** The pipeline is expensive today and it is not yet
productive enough for everyday use. I'm saying that first because it's the thing I'm tuning, not
a footnote.

Measured, same brief, same runner, with and without: **$26.27 vs $1.62**, 1h11 vs 10 min (a
later run on a fixed candidate: $13.30, control not rerun). A forensic pass over one full
session: 1h37m wall-clock, **79% of it pipeline mechanics**, ~11 minutes burned on subagents
rediscovering CLI syntax, and the push abandoned at the end — nothing shipped. Both of those
causes are fixed since; the shape of the problem isn't.

The latest three-runner test (one design document, Claude/Windows, Codex/WSL, Antigravity/WSL)
is the most recent data and the most honest about its limits: the runners' *own* estimates of
administration-vs-product share were ~40% / 60–75% / ~90%, with the best run at 16 minutes end
to end. Nothing metered that — the 4:1 spread on nominally the same process is the finding, and
it says the overhead is not inherent to the process but sensitive to the runner and the run.
`[KORRIGIERE MICH: Zahlen deines letzten Laufs — Wall-Clock, Kosten, Push ja/nein]`

What 0.6.2 changes: the verify gate dropped from 646 s to 482 s (−25%) last week without losing
a suite; guard denials no longer print 70 lines for 5 lines of content; the guided onboarding
driver stops three times instead of running a turn-by-turn state machine; a seconds-long
pre-gate previews the 13-minute gate. What's still open, and tracked: dispatch bootstrap alone
costs 50–150k tokens before any work starts; the pipeline works sequentially by default and
needs machine-enforced task slicing (designed, first increment built, not yet wired); every
small correction re-hashes the candidate and costs another human signature.

The target: `[KORRIGIERE MICH — z. B. "a feature-sized task at ≤2× the no-pipeline control,
push included"]`. Until it's there, the three dials are how you keep a throwaway from paying
full price.

**What I learned that surprised me.** Prompts don't hold. In one test the SessionStart hook
injected an explicit "ask before you touch any file" instruction into the model's context —
verified it arrived — and the model wrote `index.html` anyway because the user's task was more
concrete than the rule. It's now a PreToolUse guard that blocks the first write until the
question has been asked and answered. Almost every rule in this repo has that history: prose
first, then an incident, then a hook.

**Dogfooding, honestly stated.** The pipeline governs its own repository under its own rules:
~5,700 commits since early July, 79 ADRs, ~515 test suites in the verify gate, every checkpoint
through an independent Critic before I accept it. Outside of me: one person I roped into a
scripted acceptance run, who is still on speaking terms with me. `[KORRIGIERE MICH]` So: heavily
tested by exactly one workflow — building this pipeline — and barely tested by anyone else's.
The two consumer projects it has governed end to end are small HTML games. One of them is about
a tower. The tower has a threat model. Expect rough edges — the closed shell grammar will refuse your piped one-liners
(I hit it three times today), the push ceremony is deliberately annoying, and stray German still
surfaces because it started in German. Claude Code is the fully enforced runtime; Codex and
Antigravity have their own pre-tool guard bridges with narrower coverage (shell + write tools),
and one runner's evidence never proves another's.

**Licensing, up front because Reddit will ask.** Sustainable Use License 1.0 with an additional
permission — source-available, not OSI open source. Personal use, internal use, forks for your
own purposes, free non-commercial redistribution: fine. Selling it, hosting it as a service,
embedding it in a paid product: separate agreement. PRs need DCO + CLA.
`[KORRIGIERE MICH: dein Warum in zwei Sätzen — im Repo steht nur das Was]`

**What I'd like you to try (~10 minutes, on 0.6.2).**

1. In a project repo: `claude plugin marketplace add agent-pipe-shared/agent-pipeline --scope
   project`, then `claude plugin install pipeline-core@agent-pipeline --scope project`. **Fully
   restart Claude Code** — `/reload-plugins` isn't enough for the first bind.
2. Open an **empty** folder. First prompt: *"I want to build a small HTML game here and I have
   concrete input."* Don't mention the pipeline.
3. Expected: the agent explains the pipeline is available and **asks before writing any file**.
   If `index.html` appears first, that's a failure — tell me, with your Claude Code version.

Three things I actually want to know:

- Where did it first refuse you for no good reason?
- Would you accept a hook that refuses the agent, in your own projects — or is that a line you
  don't want crossed?
- Did the cost/rigor dials feel like real choices or like a wall?

**What's next.** 0.6.2 is the Nova B interim release that carries the efficiency work above.
The active line ("Nova B", ~70 open items) is mostly the same theme: onboarding has to get much
simpler for the agent, easier plan amendments and formal close, clearer per-runner approval and
verify guidance, observability of the delivery loop. Then Alfred: the measured enforcement record
above, and an architecture the pipeline enforces rather than one every session improvises —
declared contracts, dependency direction, where side effects may live, what a fresh session must
read before it plans. Prose is not a control there either.

Repo: https://github.com/agent-pipe-shared/agent-pipeline — 0.6.2, tag `v0.6.2`.
`[KORRIGIERE MICH: CI-Stand auf dem Release-Commit]`

**One last thing.** While drafting this post, the pipeline's own guard refused the AI that was
writing it. Three times. For using a pipe in a shell command. I'm told that's working as
intended.

And yes: once the pipeline is finished, I'll obviously have to re-engineer it. With the
pipeline. ;-)

## 5. Swap blocks

**r/codex:** replace enforcement item 1's framing with: *"On Codex the enforcement is thinner: a
pre-tool bridge on shell and write calls, no full hook surface; the roles, evidence discipline
and Critic contract are identical."* Install step 1 → `codex plugin marketplace add
https://github.com/agent-pipe-shared/agent-pipeline.git --ref main` / `codex plugin add
pipeline-core@agent-pipeline`. Do not claim the 2026-08-19 consent incident for Codex (Claude
session). Do not imply sandboxed Codex review is live (`roles/critic.md`: sandbox disabled for
this project; isolated Codex Critic "standardmäßig inaktiv").

**r/GoogleAntigravity:** ADR-0067 hard-enforcement layer (`.agents/hooks.json` →
`antigravity-pretool-guard.mjs`, exit 2 pre-execution); two fail-open paths closed `ab347a74`.
Verify current state before posting.

## 6. Source map

| Claim | Source |
|---|---|
| Problem / copy-paste drift | `README.md` "The problem", ADR-0001 Context |
| Three papers | `README.md` Acknowledgments |
| Roles, two gates | `docs/design-decisions.md`, ADR-0026, ADR-0027 |
| Guards and what they refuse | `plugins/pipeline-core/hooks/hooks.json` + each guard header |
| Gate-strength story | `plugins/pipeline-core/hooks/guard-gate-strength.mjs` header |
| Prompt-vs-hook incident | `backlog/items/2026-08-19-greenfield-ask-before-install-duty-ignored-live.md` (closure `b5354f25`) |
| Enforcement falsified 3× | `specs/sprint-alfred-epic/prd_sprint-alfred-epic.md` §1.2 (alfred checkout) |
| Cost pairs | `backlog/items/2026-08-09-what-the-claude-greenfield-run-adds-…` |
| 1h37m forensic pass | `backlog/items/2026-08-10-happy-path-turn-and-wall-clock-cost-is-not-externally-defensible.md` |
| Three-runner self-estimates | `backlog/items/2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance.md` |
| Verify 646→482 s | `backlog/evidence/2026-09-06-lane-eviction-measured-result.md` |
| 5.7k commits / 79 ADRs / ~515 suites | `git rev-list --count HEAD` = 5742; `docs/adr/`; 517 `file:` entries in `verify.mjs`, 515 per 2026-09-06 measurement |
| License | `docs/licensing.md`, `NOTICE`, `backlog/items/2026-07-20-source-available-commercial-licensing.md` |
| 10-minute test | mail "macOS Test" (2026-07-25, §9) + consent-guard item |
| Nova B / Alfred | `docs/overview.md`, `docs/state.md` item 6 ("68 open items"), alfred `docs/state.md` + PRD |
| Install commands | `SETUP.md` §B.1 |

Not recorded, therefore marked: the PO's personal SUL rationale; whether the macOS run happened;
CI state on the 0.6.2 commit; the PO's latest greenfield numbers.
