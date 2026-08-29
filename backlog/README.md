# Backlog — Agent Pipeline

> Public Core backlog items are English-canonical (ADR-0011). German may appear
> only as an explicitly marked, bounded reader aid in a public user document.

## Purpose

The backlog is the versioned work queue for triaged improvements and open
questions about the pipeline itself — never leave accepted work only in a
session's chat history (principle P2/§5.1 in
[`docs/operating-model.md`](../docs/operating-model.md)). Public unconfirmed
behavior observations use a GitHub Issue as their single source from capture
through triage; only accepted implementation work is linked into this backlog,
as defined by the [observation intake governance](../docs/observation-intake.md).
The backlog remains the concrete implementation of the feedback loop from
[`docs/operating-model.md` §4](../docs/operating-model.md#4-the-lifecycle) (step 8 retro).

## Item types

Every item carries exactly one type in the frontmatter field `type`:

| Type | Meaning | Typical source |
|---|---|---|
| `workflow-improvement` | Improvement or clarification proposal for the pipeline process itself — including sharpening open ADR criteria and calibration work ahead of a migration | Elephant close-retro (`/close`), project experience, open ADR follow-up |
| `tooling-radar` | Result of a radar run or an ADR follow-up from the tooling-radar contract | monthly radar run ([`policies/tooling-policy.md` §4](../policies/tooling-policy.md)) |
| `defect` | Gap, contradiction, or drift in an existing pipeline artifact (docs contradict the ruleset, guardrail has a hole) | Critic finding, drift check, self-observation |
| `idea` | Immature proposal without a worked-out case — prioritization and elaboration still pending | spontaneous observation, discussion with the PO |
| `requirement` | An obligation stated by the Product Owner that the repository must satisfy — not a defect an agent found and not an improvement an agent proposes | PO ruling, PO-stated obligation raised in or outside a session |

`workflow-improvement` and `tooling-radar` are the only types operating-model.md and tooling-policy.md already name explicitly ([`docs/operating-model.md` §7](../docs/operating-model.md), [`policies/tooling-policy.md` §4 R1](../policies/tooling-policy.md)); `defect` and `idea` extend the taxonomy with the two cases "something is broken" and "not yet a mature position" — neither was anchored anywhere before. `requirement` closes a further gap (PO decision, 2026-08-08): two authors, in different sessions, independently reached for `requirement` and `improvement` to name a PO-stated obligation, and neither was canonical. Use `requirement` only when the obligation itself comes from the PO — a bug an agent finds stays `defect`, and an improvement an agent proposes stays `workflow-improvement`, even when a PO observation triggered the discovery.

## Storage & format

- One item = one file under `backlog/items/`, naming scheme `YYYY-MM-DD-short-english-slug.md` (date = `created`, not a due date).
- Structure and mandatory frontmatter: [`backlog/items/TEMPLATE.md`](items/TEMPLATE.md) — canonical items require `schema` / `id` / `type` / `owner` / `status` / `created` / `source`; `tracking`, `due`, and `expires` are optional scheduling fields. `sprint` is a planning-window declaration. Its admissible values are the closed set of slugs formally reserved by [ADR-0043](../docs/adr/0043-post-go-live-sprint-model.md) (`alfred`, `batman`, `nightwing`, `nova`, `phoenix`), plus the literal **`none`** — and nothing else. `none` is not a sixth sprint: it is the explicit statement that the item belongs to no planning window (PO decision, 2026-08-27), and it is counted on its own line, never inside a sprint's count. Optional for items generally, but **mandatory for any item in `open` status**: `plugins/pipeline-core/scripts/check-backlog-sprint-assignment.mjs` reports per-sprint counts, how many items declare `none`, and how many carry no declaration at all, and fails (exit 1) on any `open` item that declares none of the three (NVA-SPRINTGATE-1). A non-open item with no declaration stays counted and reported, never a failure. **Writing `none` and omitting the line are not the same thing** — that is the whole point of the value: if they were interchangeable the gate could no longer distinguish a decision from a forgotten field, which is its only purpose.
- `done_when` is a falsifier: a FLAT single-line string declaring a machine-checkable (or explicitly human) predicate for when the item counts as done, so a `status:` can no longer silently disagree with the repository. Grammar is a leading verb plus arguments, from a CLOSED vocabulary of exactly four forms:
  - `path-exists <repo-relative-path>` — satisfied when that path exists.
  - `contains <repo-relative-path> <needle>` — satisfied when that file exists and contains `<needle>` as a fixed string (never a regex); the needle is everything after the first space following the path, taken literally including inner spaces.
  - `script-exit-zero <repo-relative-script-path>` — satisfied when `node <script>` exits 0; the script path must resolve inside `plugins/pipeline-core/scripts/` or `harness/scripts/`.
  - `manual` — no machine predicate, an explicitly declared human judgment; the counterpart of `sprint: none` — distinguishable from omission, and never a finding.

  Every path argument is rejected (as MALFORMED) if it is absolute, contains a `..` segment, or resolves outside the repository root. `plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs` evaluates every item's declaration against the current tree and fails (exit 1) on a genuine contradiction: `status: open`/`in_progress` with an already-satisfied predicate (`STALE-OPEN`), `status: closed` with an unsatisfied predicate (`REGRESSION`), or a malformed declaration (`MALFORMED`, at any status). An `open`/`in_progress` item with no `done_when` at all is `UNDECLARED` — counted and reported, but **not yet fatal**; that graduates to fatal in a later commit once every open item declares the field, mirroring `sprint`'s own reported-then-enforced history (NVA-SPRINTGATE-1). `status: rejected`/`deferred` items are counted and never a finding.
- Items are **never deleted**, only progressed in status (append-only evidence; cf. [`docs/operating-model.md` §6](../docs/operating-model.md#6-evidence-review-and-recovery)) — rejected or completed items stay in place with their rationale.

### Status lifecycle

`open` → `in_progress` → `closed`, with two additional triage-only outcomes
reachable directly from `open`: `open` → `rejected` and `open` → `deferred`.

- **open** — created or triaged but not currently being implemented.
- **in_progress** — accepted and assigned to active work; the reason and
  evidence remain in the append-only transition ledger.
- **closed** — implemented with closure evidence and the sanctioned ledger
  transition; a baseline migration never creates this state.
- **rejected** — triaged and declined, with rationale recorded in the item
  (see Triage rules below); reachable only from `open`, never mid-execution.
- **deferred** — triaged and postponed, with the condition for revisiting it
  recorded in the item (see Triage rules below); reachable only from `open`,
  never mid-execution.

`rejected` and `deferred` are terminal in the transition ledger, matching
today's documented process: neither this section nor the Triage rules below
describe a path back out of a triage disposition.

The 2026-07-20 migration mapped legacy `new`/`open` to `open` and
`accepted`/`in-progress` to `in_progress`. It preserved bodies and scheduling
fields and recorded only baseline evidence; it did not infer acceptance,
implementation, or closure.

## Triage rules

Per [`docs/operating-model.md` §4](../docs/operating-model.md#4-the-lifecycle) (step 8 retro): triage is owned by the **Elephant of the next pipeline session** (not the Goldfish who created the item — separation of proposal and decision).

1. Review all items with `status: open` (at a natural session/phase boundary, not mid-execution).
2. Decide per item: **accept** (note phase/release in the item) / **reject**
   (rationale in the item's Triage "Decision:" prose; the ledger's status
   enum only accepts `open`/`in_progress`/`closed`, so a reject moves
   `status:` to `closed` the same way step 3's duplicate-merge does — there
   is no `status: rejected` value) / **defer** (state the condition in the
   Triage "Decision:" prose; the item's `status:` stays `open` — deferral is
   a scheduling note, not a distinct status value; see
   `backlog/items/2026-08-07-adr-0047-numbering-collision.md` for a worked
   example: `status: open`, `Decision: deferred — owned by the Phoenix
   sprint`).
3. Merge duplicates: close the newer item with `status: closed` and real
   `closure_commit`/`closure_evidence` fields (the older, canonical item's
   own path), and open its body with a `**Rejected as a duplicate:**` lead
   sentence naming the older item and the rationale. There is no
   `merged-into` frontmatter key and no `status: rejected` value —
   `parseBacklogItem()`'s frontmatter key regex only accepts
   `[a-z_]+` (no hyphens, so `merged-into` never parses) and the ledger's
   status enum only accepts `open`/`in_progress`/`closed` (see
   `backlog/items/2026-08-17-guard-command-grammar-dialectfor-infers-shell-dialect-from-os-not-actual-shell.md`
   for a worked example).
4. When scope is unclear (architecture/guardrail impact, cost, irreversibility): the PO decides, not the Elephant alone (operating-model §2.1).
5. The triage decision is documented **in the item itself** (section "Triage" in the template) — never only verbally or in chat.
6. **If this item is later cited as a spec/reference input to a Goldfish or Critic dispatch**, its Triage section (and any appended Closure/PO-decision-implementation section) MUST be stripped first via `plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.mjs` before the path is named in the dispatch — never the raw item path. Triage prose records a prior human/Critic decision *about* the item, and handing it over unstripped lets a later reviewer read that verdict as background about the very thing it is independently judging (PO decision 2026-08-18 #19; see `templates/prompts/critic-review.md`/`goldfish-task.md` and `backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md`).

## Ledger

The backlog has THREE generated files, never edited by hand, each with a
distinct job. Confusing them — or, worse, deriving a count by grepping
`backlog/items/*.md` directly — is the single most common source of stale
backlog claims in this repository (`grep -l "status: open"` false-positives
on historical prose that merely *mentions* `status: open`; a live count must
never be hand-derived this way).

| File | What it is | What it's for |
|---|---|---|
| [`backlog/index.json`](index.json) | Machine source of truth: every item's `id`/`status`/`type`/`owner`/`created`/`source`, its own `tracking` value verbatim when present (omitted, never `null`/empty string, when absent), and a derived `deferred: boolean` (true iff the item's own `## Triage` section has a `Decision:` line containing "deferred", per the Triage rules §2 worked-example phrasing — a separate, additive projection field, never a fourth `status` value), plus a top-level `counts: {open, in_progress, closed}` object and the ledger head hash it was generated from (`generatedFrom.transitionHead`). | **The one place to read a live backlog count from.** `node -e "console.log(require('./backlog/index.json').counts)"`, or `plugins/pipeline-core/scripts/check-state-numeric-claims.mjs` if the count is being cited in `docs/state.md` prose. |
| [`backlog/STATUS.md`](STATUS.md) | Human-readable table view of the same data (ID / Status / Type / Owner / Created / Tracking), one row per item, alphabetically sorted. | Skimming the whole backlog by eye; not for deriving a count (no summary line — read `index.json` for that). |
| [`backlog/transitions.ndjson`](transitions.ndjson) | Append-only, hash-chained (`entryHash`/`previousHash`) NDJSON audit log — one JSON object per status transition, each carrying `from`/`to`/`reason`/`evidence` (a commit + a reference path) and a `sequence` number. | The tamper-evident history of *why* an item moved status, not just that it did. Never truncated or rewritten — the chain itself is the integrity check. |
| [`backlog/transitions-phoenix-history.ndjson`](transitions-phoenix-history.ndjson) | **Immutable archived copy**, not active state. The Phoenix branch's own ledger tail (sequences 145–525, same schema and hash-chain shape as `transitions.ndjson`), preserved verbatim by the Nova/Phoenix merge (commit `c181817f`) so those entries' original hashes stay readable. Its own internal hash chain is self-consistent (verified at merge time); its first entry's `previousHash` is an external anchor into unpreserved earlier Phoenix history and cannot be verified from this repository. | Historical reference only — never read by `reconcile-backlog-ledger.mjs`, `check-backlog-state.mjs`'s projection, or any live backlog query. `check-backlog-state.mjs` pins THIS top-level file's bytes to a fixed SHA-256 and blocks on any drift (`checkPhoenixHistoryImmutable`); this is the check that backs `.gitleaks.toml`'s two rule exemptions for the top-level path — nothing, including a forged but chain-consistent appended entry, can change a byte of this top-level file without failing the gate first. The exemption regex itself is broader than the pin (it also matches any nested `.../backlog/transitions-phoenix-history.ndjson`, which this pin does not cover — known, accepted limitation, see `.gitleaks.toml`). Never append to it, never fold it into `transitions.ndjson`, never edit it. |

**Regenerating all three:** `node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs`
(read-only plan) then `--activate` (writes). It reads every item file's
CURRENT `status:` and closure frontmatter and records exactly that — it
implements nothing and reviews nothing itself; each emitted transition's
`reason` says so explicitly. Because the ledger only knows `open` →
`in_progress` → `closed` as a strict order, an item that jumped straight
from `open` to `closed` in its own file still gets TWO chained ledger
entries (open→in_progress, then in_progress→closed) to preserve that order —
this is expected, not a bug.

**The recurring failure mode this exists to name:** closing an item (flipping
`status:` in its file) and reconciling the ledger are two separate,
manually-sequenced steps. Forgetting the second one is exactly Mode 1 of
`backlog/items/2026-08-19-backlog-status-drifts-from-code-across-compaction-with-no-hardening.md`
— `verify.mjs`'s `backlog-state-check`/`backlog-ledger-reconciliation-tests`
catch it, but only when Verify happens to run, after the drift already
exists. That item's piece 1 (`GG-22`, a `guard-git.mjs` commit-time rule
that blocks an unrelated commit while a status change sits unreconciled) is
the structural fix — check that item's own status before assuming
reconciliation is still a manual habit rather than a guarded one.

## Release cycle (SHA phase)

As long as the pipeline is versioned in the SHA phase ([ADR-0002](../docs/adr/0002-versioning-sha-then-semver.md)), **every commit to `main` propagates immediately** to the bound projects — there is no bundled release step in between. This makes **triage itself the actual release gate**: an accepted item that gets implemented and merged takes effect immediately on every machine/project that next refreshes. From the SemVer phase onward, bundled releases with a CHANGELOG entry are added (the switchover criterion is documented as its own backlog item).

## Close-retro

Every completed project session ends (part of the `/close` ritual) with a **retro written by the session Elephant itself** on the question "What should the pipeline do better next time?". The answer is either a concrete backlog item (usually `type: workflow-improvement`) or a transfer item to the pipeline Elephant, or a deliberate, explicitly noted "nothing" — silence is not a valid answer ([`docs/operating-model.md` §4](../docs/operating-model.md#4-the-lifecycle), step 8 retro). **The PO is no longer asked via a ritual question**; he submits his own observations separately through his own channel.

## Tooling radar (special case)

The tooling radar has its own, already fully specified contract in [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) (R1–R5): monthly interval, fixed anchor (first `/close` of a calendar month), fixed review sources, output contract (What's new / affected rule / recommendation `review`|`adopt`|`ignore`), zero-item obligation for a run with no findings, and a special rule for ADR follow-ups. This section only points there, to avoid drift between two descriptions of the same process — `policies/tooling-policy.md` is authoritative.

## OPEN

- OPEN (Phase 4): the `/close` skill (close-block) does not yet automate the triage reminder. The radar catch-up rule is anchored as a check step "tooling radar due?" in the close-block skill (step 7) and in `harness/checklists/session-close.md`; a standalone `/radar` skill remains open.
- Schema format for **calibration files** is decided (shipped with the plugin): JSON (`.claude/pipeline.json`, [`docs/operating-model.md` §7](../docs/operating-model.md#7-project-calibration-and-extensions)). Backlog items deliberately stay Markdown+frontmatter — they are human-readable process artifacts, not skill calibration.

## References

- [`docs/operating-model.md` §7](../docs/operating-model.md) — feedback loop (source of the triage and retro rules)
- [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) — tooling-radar contract R1–R5
- [`policies/model-policy.md` MP-20/MP-21](../policies/model-policy.md) — cost telemetry, price-review follow-up
- [`docs/adr/0002-versioning-sha-then-semver.md`](../docs/adr/0002-versioning-sha-then-semver.md) — SHA phase, SemVer follow-up
