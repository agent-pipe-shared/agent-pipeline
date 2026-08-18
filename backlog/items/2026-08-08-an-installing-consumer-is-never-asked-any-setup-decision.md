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

## PO decision, 2026-08-08 — the questions go into the bootstrap, split into two planes

The PO chose: the decisions are asked in the bootstrap, not by a separate consumer
setup command, and `signature` stays the default but must explain itself. They
then asked the sharper question this section answers: is that once per machine,
once per repository, or do the configurations split by scope?

**They split.** The split already exists physically and was never named.

### The fields, as they actually are

`pipeline.user.yaml` in this repository carries: `advisor_export.consent`,
`agent_runtime`, `autonomy` (branch model, push policy, WIP limit), `critic_export`
(what may leave the repository), `gates` (`claude_md_max_lines`, `dev_plan`,
`push`, `push_approval`, `security`), `language` (agent- and human-facing),
`roles.po`, `routing` (per-duty model assignment, ~270 lines), `runners`,
`session.keep_awake`, `usage`.

### The narrow-gauge split, adopted now

The PO asked explicitly for a minimum viable base now, with the full treatment
deferred to Nightwing.

| Plane | Fields | Asked |
|---|---|---|
| Machine | PO key directory (with guided key creation and a proposed default location), `routing`, `language`, `session`, `usage` | once per machine |
| Repository | `gates.push_approval`, the remaining `gates`, `autonomy`, `critic_export` / `advisor_export` | once per repository |
| Never asked | the runner, the scratch location, `claude_md_max_lines` | — |

**Zero field overlap between the planes.** This is not a stylistic preference:
this repository already applies the rule between `pipeline.yaml` and
`pipeline.json` (ADR-0046/ADR-0054). Two configurations with different threat
models must not share a field, because a shared field needs a precedence rule, and
every precedence rule is a place where the weaker plane can override the stronger.

### Two corrections to the PO's first formulation, and why

**1. There must be no persisted runner property at all.** The PO's own case
decides it: the same repository may be worked with Codex and with Claude
alternately, for cost or model reasons, and that must keep working. A stored
project runner cannot express that. The runner is therefore read from the running
session every time — at the CLI edge, where "which runner is executing" and "which
runner is meant" are the same question — and carried explicitly inward, where
helpers still raise if it is absent.

This makes `agent_runtime: "claude-code"` and `runners.default` non-authoritative
for identity. They exist today and are exactly the shape being removed.

**2. `gates.push_approval` cannot move to the machine plane.** The PO wrote both
"gates, language etc. are machine, not repo" and "chat versus signature is decided
per repository". The second is taken, because the first would destroy the
setting's only security property: `readPushApprovalMode` falls back to the strict
default whenever the file is *uncommitted*, precisely so a local edit cannot
weaken a repository-wide gate. Machine-scoped, it becomes a setting each
participant can switch off for themselves.

The same argument applies more weakly to the other blocking gates: whether
`security` or `dev_plan` blocks is a statement about the project's risk, not the
operator's preference. Machine-scoped, two developers on one repository would get
different enforcement, and CI has no machine configuration at all. `language` and
`routing` are genuinely operator properties and move to the machine plane without
objection.

### Open, deliberately not decided here

Where the machine plane physically lives. An environment variable
(`PIPELINE_PO_APPROVAL_DIRECTORY` today) is losable and undiscoverable; a file
under the user's configuration directory would be better but needs its own guard
treatment, since the guard currently admits only one derived directory outside the
project root.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, partially delivered — stays open, current-scope
  (not deferred; the PO's own narrow-gauge split was explicitly "adopted
  now", only the full config-UI treatment goes to Nightwing, as this item's
  own body already states). Direction 4 (make `signature` mode
  self-explaining) is done: the seeded `pipeline.user.yaml` comment block
  (`project-onboarding-v3.mjs:999`) names `gates.push_approval` and the exact
  setting in plain text at seed time. Related key-directory awareness
  (`PO-KEYDIR-01(A)`) also landed — see the sibling item
  `2026-08-07-human-approval-ux-directory-clarity-and-single-command.md`.
  NOT verified as done: an actual bootstrap `collect-input` question for
  `gates.push_approval` / the machine-plane PO-key-directory guided creation
  (grepped `project-onboarding-v3.mjs` for a `collect-input`-shaped
  push-approval prompt — none found) — the narrow-gauge base still reads as
  "explains itself once seeded" rather than "asks first".
- **Rationale:** verified the self-explaining-default claim directly in
  source; the bootstrap-question claim was checked by targeted grep, not a
  full flow trace — a future session should confirm end-to-end rather than
  trust this grep alone before closing.
- **Assignment (if accepted):** the remaining bootstrap-question wiring needs
  a dedicated goldfish-deep dispatch (onboarding/lifecycle code, real design
  latitude); not fixed in this triage pass (docs/backlog-only). Full
  config-UI treatment remains Nightwing per this item's own PO-recorded
  decision.
- **Date:** 2026-08-17

### 0.6.0 release-bar confirmation (2026-08-18)

Re-checked during the Nova 0.6.0 release triage sweep: the full config-UI
treatment is already correctly deferred to Sprint Nightwing per the PO's own
2026-08-08 decision above. The one remaining piece that is NOT deferred — the
narrow-gauge bootstrap `collect-input` question for `gates.push_approval` and
the machine-plane PO-key-directory guided creation — has a specific, bounded
assignment already recorded (goldfish-deep, onboarding/lifecycle code) and
stays a same-release dispatch target rather than a close, since it needs real
design latitude in `project-onboarding-v3.mjs` plus test coverage to trust.
Not attempted here.
