# Backlog — Agent Pipeline

> Public Core backlog items are English-canonical (ADR-0011). German may appear
> only as an explicitly marked, bounded reader aid in a public user document.

## Purpose

The backlog is the only place where improvements, observations, and open questions about the pipeline itself get **versioned** — never left only in a session's chat history (principle P2/§5.1 in [`docs/operating-model.md`](../docs/operating-model.md)). It is the concrete implementation of the feedback loop from [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop).

## Item types

Every item carries exactly one type in the frontmatter field `type`:

| Type | Meaning | Typical source |
|---|---|---|
| `workflow-improvement` | Improvement or clarification proposal for the pipeline process itself — including sharpening open ADR criteria and calibration work ahead of a migration | Elephant close-retro (`/close`), project experience, open ADR follow-up |
| `tooling-radar` | Result of a radar run or an ADR follow-up from the tooling-radar contract | monthly radar run ([`policies/tooling-policy.md` §4](../policies/tooling-policy.md)) |
| `defect` | Gap, contradiction, or drift in an existing pipeline artifact (docs contradict the ruleset, guardrail has a hole) | Critic finding, drift check, self-observation |
| `idea` | Immature proposal without a worked-out case — prioritization and elaboration still pending | spontaneous observation, discussion with the PO |

`workflow-improvement` and `tooling-radar` are the only types operating-model.md and tooling-policy.md already name explicitly ([`docs/operating-model.md` §7](../docs/operating-model.md), [`policies/tooling-policy.md` §4 R1](../policies/tooling-policy.md)); `defect` and `idea` extend the taxonomy with the two cases "something is broken" and "not yet a mature position" — neither was anchored anywhere before.

## Storage & format

- One item = one file under `backlog/items/`, naming scheme `YYYY-MM-DD-short-english-slug.md` (date = `created`, not a due date).
- Structure and mandatory frontmatter: [`backlog/items/TEMPLATE.md`](items/TEMPLATE.md) — required fields `type` / `status` / `created` / `source`; optional fields (e.g. `due` for scheduled follow-ups) are marked as such in the template.
- Items are **never deleted**, only progressed in status (append-only evidence; cf. [`docs/operating-model.md` §6](../docs/operating-model.md#6-evidence-review-and-recovery)) — rejected or completed items stay in place with their rationale.

### Status lifecycle

`new` → (`accepted` | `deferred` | `rejected`) → `done` (only after `accepted`)

- **new** — created, not yet triaged.
- **accepted** — accepted, assigned to a phase/release (noted in the item).
- **deferred** — deferred, with a condition/point in time for the next review.
- **rejected** — rejected, rationale is mandatory and stays in the item.
- **done** — implemented; reference to the implementing commit/ADR/PR added.

## Triage rules

Per [`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop): triage is owned by the **Elephant of the next pipeline session** (not the Goldfish who created the item — separation of proposal and decision).

1. Review all items with `status: new` (at a natural session/phase boundary, not mid-execution).
2. Decide per item: **accept** (note phase/release in the item) / **reject** (rationale in the item, `status: rejected`) / **defer** (`status: deferred`, state the condition).
3. Merge duplicates: the newer item points to the older one (`merged-into: <filename>`), `status: rejected` with rationale "duplicate of …".
4. When scope is unclear (architecture/guardrail impact, cost, irreversibility): the PO decides, not the Elephant alone (operating-model §2.1).
5. The triage decision is documented **in the item itself** (section "Triage" in the template) — never only verbally or in chat.

## Release cycle (SHA phase)

As long as the pipeline is versioned in the SHA phase ([ADR-0002](../docs/adr/0002-versioning-sha-then-semver.md)), **every commit to `main` propagates immediately** to the bound projects — there is no bundled release step in between. This makes **triage itself the actual release gate**: an accepted item that gets implemented and merged takes effect immediately on every machine/project that next refreshes. From the SemVer phase onward, bundled releases with a CHANGELOG entry are added (the switchover criterion is documented as its own backlog item).

## Close-retro

Every completed project session ends (part of the `/close` ritual) with a **retro written by the session Elephant itself** on the question "What should the pipeline do better next time?". The answer is either a concrete backlog item (usually `type: workflow-improvement`) or a transfer item to the pipeline Elephant, or a deliberate, explicitly noted "nothing" — silence is not a valid answer ([`docs/operating-model.md` §7](../docs/operating-model.md#7-feedback-loop)). **The PO is no longer asked via a ritual question**; he submits his own observations separately through his own channel.

## Tooling radar (special case)

The tooling radar has its own, already fully specified contract in [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) (R1–R5): monthly interval, fixed anchor (first `/close` of a calendar month), fixed review sources, output contract (What's new / affected rule / recommendation `review`|`adopt`|`ignore`), zero-item obligation for a run with no findings, and a special rule for ADR follow-ups. This section only points there, to avoid drift between two descriptions of the same process — `policies/tooling-policy.md` is authoritative.

## OPEN

- OPEN (Phase 4): the `/close` skill (close-block) does not yet automate the triage reminder. The radar catch-up rule is anchored as a check step "tooling radar due?" in the close-block skill (step 7) and in `harness/checklists/session-close.md`; a standalone `/radar` skill remains open.
- Schema format for **calibration files** is decided (shipped with the plugin): JSON (`.claude/pipeline.json`, [`docs/operating-model.md` §8](../docs/operating-model.md#8-projekt-kalibrierungsschicht)). Backlog items deliberately stay Markdown+frontmatter — they are human-readable process artifacts, not skill calibration.

## References

- [`docs/operating-model.md` §7](../docs/operating-model.md) — feedback loop (source of the triage and retro rules)
- [`policies/tooling-policy.md` §4](../policies/tooling-policy.md) — tooling-radar contract R1–R5
- [`policies/model-policy.md` MP-20/MP-21](../policies/model-policy.md) — cost telemetry, price-review follow-up
- [`docs/adr/0002-versioning-sha-then-semver.md`](../docs/adr/0002-versioning-sha-then-semver.md) — SHA phase, SemVer follow-up
