---
schema: pipeline.backlog-item.v1
id: pipeline.installing-consumer-is-never-asked-any-setup-decision
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, preparing the tester mail: 'wenn ich den Leuten sage, soundso installiert ihr das Plugin, dann führen Sie aber ja nie das Setup aus. Das heißt, an den Entscheidungen bezüglich Scratchpad beziehungsweise Keyordner, welche Runner, auch PO Gate, welches ist Blocking, Chatfreigabe versus Signature -- da kommen Sie nirgendwo dran vorbei. Wann und wie entscheidet man das, wenn man installiert?'"
---

# Installing the plugin decides everything and asks nothing

## The question, and why the answer is not "run setup"

A consumer is told to add the marketplace and install the plugin. That is the
whole documented install path. `setup.mjs` is **not** part of it, and not by
oversight: `SETUP.md:202` says in as many words *"Do not copy `setup.mjs` into a
consumer project"*. It personalizes the Pipeline source checkout, not a governed
project.

So every setting a first-time adopter might reasonably expect to be asked about is
resolved without them. Each one below was traced in code, not assumed.

## What is decided, and by what

**Push approval mode — `signature`, silently.**
`readPushApprovalMode` (`plugins/pipeline-core/lib/critical-human-proof-policy.mjs:126`)
reads `gates.push_approval` from `pipeline.user.yaml`, and returns
`DEFAULT_PUSH_APPROVAL_MODE` for an absent file, an absent key, an unparseable
file, an uncommitted one, or an invalid value. The default is `signature`, the
strongest setting — correct as a fail-closed rule, and it is the strictest
possible answer handed to the least prepared user. A fresh project's seed writes
no `gates` block at all (the only `gates:` assignment in the seed path,
`runner-profile-migration-v3.mjs:349`, clones an existing V2 block during
migration; a greenfield project has none). So the fail-closed branch is not an
edge case for a new adopter — it is the ordinary path.

**PO signing key — never mentioned.**
`signature` mode requires an encrypted Ed25519 key created by
`po-human-approval.mjs setup --directory <dir>`, run once by the human in their
own terminal. That command appears in `SETUP.md:421` — this repository's SETUP.md.
Nothing in the install path, the bootstrap, or any hook message tells a consumer
the key exists, let alone that their approval mode requires one.

**Runner — not from the setting that looks like it.**
`pipeline.user.yaml`'s `runners.default` is not read by the onboarding library at
all (recorded in
`2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md`). Identity
comes from an explicit `--runner`, or from a literal default. The fail-closed
change decided in
`2026-08-07-absent-runner-flag-silently-defaults-to-codex.md` turns the silent
half into a caller error, which is right — and it makes the absence of any
*asking* step more visible, not less.

**Scratch location — no decision needed, but the exemption does not travel.**
The directory needs no configuration. Its dev-plan-gate exemption was activated in
`templates/pipeline.yaml.example` (`34962c1`), and that file is read by no shipped
code — verified. A consumer project therefore does not inherit the exemption.

## The contradiction, stated exactly

`setup-check.mjs` fires when personalization has not run. When
`pipeline.user.yaml` exists but carries the unconfigured setup intent — the
`default-markers` branch — `resolvingSteps()` (`:110`) returns **exactly one**
step: ``node setup.mjs`` (`:114`, and `:115` returns early with only that entry).

That is the script `SETUP.md:202` forbids a consumer to use.

The `missing` branch does better: it offers the onboarding authority-seed step as
a second resolving step (`:118`). The branch a consumer actually lands in after
seeding does not.

So the shipped hook's only advice to an installed consumer is to run a script the
shipped documentation tells them not to have. Both artifacts ship; neither knows
about the other.

## Blast radius

This is on the critical path of the tester rollout the PO is preparing. A tester
follows the install commands, reaches a push gate, is in `signature` mode with no
key and no instruction, and the one hint the system offers is the forbidden
script. Nothing here fails loudly at install time — it fails at the first gate,
which is the worst moment for a first impression.

## Direction, not a design

1. **Decide which of these are questions and which are defaults.** Not all four
   deserve a prompt. Approval mode plausibly does, because its two values imply
   completely different human workflows and one of them requires a key that does
   not exist yet. Runner plausibly does, since it is knowable only by the human.
   Scratch location does not.
2. **Put the questions where the human already is.** The bootstrap already stops
   to ask for a project goal and a profile (`skills/pipeline-start/SKILL.md`),
   and that is a precedent for asking, not for adding a new ceremony. The
   consent-scope rules there are explicit about what one consent covers; extending
   the same step is cheaper and less surprising than inventing an install wizard.
3. **Fix the contradiction regardless of 1 and 2.** The `default-markers` branch
   must not name `setup.mjs` to a consumer. It should name whatever a consumer can
   actually do — which is the first thing 1 and 2 have to define.
4. **Make `signature` mode self-explaining.** When the mode resolves to
   `signature` and no PO authority exists, the human-facing text should say so and
   name the one command that creates it. A gate whose precondition is invisible is
   indistinguishable from a broken gate.
5. **State the default in the adopter documentation.** `SETUP.md` describes the
   key setup as a step; it does not say that skipping it leaves the strictest mode
   active. A reader currently has to derive that from the fail-closed rule.

## Related

- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` — adjacent,
  and this item is the install-time half of the same gap.
- `2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md`
- `docs/adr/0056-push-approval-mode.md` — the two modes and the fail-closed rule.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
