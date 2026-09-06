---
schema: pipeline.backlog-item.v1
id: pipeline.po-facing-commands-are-not-uniformly-rendered-break-safe
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova-b
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
done_when: contains plugins/pipeline-core/lib/human-guard-override.mjs copy-safe-command.mjs
---

# Commands handed to the PO for external execution are not uniformly rendered break-safe, and every runner lost turns to it

## What happened

The Codex run lists five separate transfer failures in security-critical steps —
none of them a user mistake:

- a node binary was itself executed with `node` as if it were a JavaScript file;
- a script path was split by a line break into `guard-` and `human-override.mjs`;
- a hash was passed with no space after `--request-sha256`;
- a key path arrived as `gent-pipeline-key` instead of `agent-pipeline-key`;
- a branch placeholder was read as the literal word.

Each cost a retry, and several cost a *new signature intent* — the expensive
kind of loop, because a fresh preimage invalidates the previous one.

## The diagnosis

The Pipeline already knows how to do this correctly. `guard-lifecycle-ready.mjs`
emits a bounded copy-safe rendering (`max 72 columns`, posix and powershell
variants, assembled through `CMD=`/`$CMD +=` fragments) for exactly this reason,
and the PO confirms that specific rendering is the one that "halbwegs
funktioniert". The defect is that it is **not applied uniformly**: other
PO-facing command emitters print a single long line and rely on the terminal not
to wrap it.

The rule this repository already states for a different case applies here in
full: a pre-rendered command must be relayed verbatim from the tool result, never
retyped. What is missing is that not every emitter produces such a rendering in
the first place.

## Direction

One shared renderer, used by every path that hands a human a command:

1. A single library function that takes an argv array and returns the bounded
   posix/powershell/cmd renderings — the emitters stop formatting their own.
2. **Never hand-assemble a PO command from prose.** Where a runner constructs
   one, it must come from that renderer's output.
3. Prefer handing over a *file* (a checksummed `.sh`/`.ps1`) over a long chat
   line wherever the ceremony allows it, as the Codex report recommends — a
   digest the PO can verify beats a line they must copy correctly.
4. A conformance test that asserts every PO-facing emitter's output is bounded
   and round-trips through a real shell to the exact intended argv. The
   `GF-105` test in `po-human-approval.test.mjs` already does this for one
   command; the coverage is what needs widening, not the technique.

## Acceptance criteria

- Every PO-facing command emitter routes through the shared renderer.
- A test proves each rendering round-trips to the intended argv, including
  values with spaces and non-ASCII characters.
- No emitter prints an unbounded single-line command.

## Progress note (2026-08-29, NVA-W12-COPYSAFE, goldfish-deep)

Scope was the three sites this item's own investigation named plus the
shared renderer itself; a repository-wide audit for OTHER, still-undiscovered
hand-assembled emitters was out of this dispatch's briefed scope, so this
item stays `status: open` rather than closed against its full "every emitter"
acceptance criterion.

Delivered:

- `plugins/pipeline-core/lib/copy-safe-command.mjs` gained a
  placeholder-passthrough mode: `placeholder(text)` wraps an argv entry (an
  unresolved human fill-in slot like `<plan-sha256>`) so
  `boundedCopySafeCommand()` renders it verbatim, never through the
  `shellWord()` quoting a literal value gets -- proven by 5 new tests in
  `copy-safe-command.test.mjs` (10/10 pass), including a direct comparison
  against the quoted-literal rendering of the identical text and a
  no-placeholder-path byte-identity test against
  `renderProjectOnboardingAction()`.
- `shellWord()` exported (previously module-private) from
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs` so
  `copy-safe-command.mjs` can quote real argv values without re-implementing
  that logic; behavior for every existing caller is unchanged.
- `plugins/pipeline-core/scripts/po-human-approval.mjs`'s
  `authorizeCriticalPushCommand` (GF-105) now calls the shared
  `boundedCopySafeCommand()` instead of hand-composing
  `renderProjectOnboardingAction()` + `boundedOpaqueCopyCommand()` locally --
  byte-identical output (the no-placeholder path is the same two calls,
  unchanged); its own 3 GF-105 tests plus the full 101-test
  `po-human-approval.test.mjs` suite pass unmodified.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and
  `plugins/pipeline-core/hooks/guard-testpath.mjs` now build every human-
  override-ceremony command line (`plan`/`prepare-authorization`/
  `authorize`/`emit-signature-digest`/`authorize-by-signature`) through
  `boundedCopySafeCommand()` instead of the hand-assembled
  `` `${process.execPath} ${JSON.stringify(script)} ...` `` templates the
  investigation named as the inconsistent-emitter shape. The real script/repo
  path values keep their existing `JSON.stringify()`-quoted text byte-for-
  byte (also routed through `placeholder()`, since that quoting is pinned by
  each file's own pre-existing test suite); every `<...>`-shaped human fill-in
  slot now renders through the new placeholder-passthrough mode. Both files'
  full existing suites pass unmodified: `guard-lifecycle-ready.test.mjs`
  (183/183) and `guard-testpath.test.mjs` (14/14 cases). No new test was
  added to either hook's own `*.test.mjs` file for this dispatch: neither was
  in this dispatch's briefed file scope, and `guard-testpath.test.mjs` is
  additionally a TP-2 protected test path -- consistency at these two sites is
  evidenced by the full unmodified regression suites above (which already
  assert substrings of the exact rendered ceremony text) rather than by a
  new, dedicated placeholder-rendering test. A follow-up item, if the PO
  wants dedicated placeholder-mode coverage at these two sites specifically,
  would need to be separately briefed with those test files in scope.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` passes
  (9/9), as required for any dispatch touching `plugins/pipeline-core/`.

Remaining for full closure: an audit confirming no OTHER PO-facing command
emitter in the repository still hand-assembles a command string outside this
renderer (this item's "every emitter" acceptance criterion) was not performed
by this dispatch.

## Progress note (2026-08-29, NVA-CF-BL19-COPYSAFEADOPT-REMAINDER)

`antigravity-pretool-guard.mjs` landed (commit `4d704e79`), mirroring
`guard-gate-strength.mjs` exactly — full 44-test suite passes unmodified.

`codex-pretool-guard.mjs` was attempted and **reverted after a genuine,
verified conflict**, not a budget/skill failure: `boundedCopySafeCommand()`'s
`placeholder(JSON.stringify(value))` idiom renders a shellWord-safe path
bare/unquoted (by `shellWord()`'s own design), but `codex-pretool-guard.test.mjs`
hard-pins the literal double-quoted `--flag "<path>"` form in three
assertions. There is no construction through the shared renderer that
reproduces forced double-quoting for such a path — this is a property of
`copy-safe-command.mjs` itself, not a mistake in the adoption attempt.
**This needs a PO/design decision before it can close:** either (a) relax
`codex-pretool-guard.test.mjs`'s exact-quoting assertions to accept the
shellWord-safe bare rendering (a real behavior change needing sign-off), or
(b) extend `copy-safe-command.mjs` with an opt-in forced-quoting mode for a
caller that needs it, without weakening the `placeholder()`/`isTemplateSlot()`
security property (NVA-CF-COPYSAFE) every other caller now depends on.

Also surfaced: `plugins/pipeline-core/hooks/human-guard-override.mjs` is a
THIRD direct importer of `boundedOpaqueCopyCommand`, not previously named by
this item's own investigation — noted here for a future audit pass, not yet
actioned.

## Progress note (2026-08-29, NVA-CF-FORCEDQUOTE)

PO decision resolved option (b) above: opt-in forced-quoting mode, not a
test relaxation. Delivered (commits `8f7f4575`, `456cde30`):
`copy-safe-command.mjs` gained `forcedQuote(text)` — forces double-quoting
for its own argv entry via a genuine shell-safe escaper (escapes `\`, `"`,
`$`, backtick; NOT a raw `JSON.stringify()` pass-through, so it does not
reintroduce the shell-injection class `placeholder()`'s own fix closed),
byte-identical to the pre-existing convention for ordinary paths with no
special characters. `codex-pretool-guard.mjs` now composes all 6 of its
hand-assembled override/Pipeline-Author-Repair guidance lines through
`boundedCopySafeCommand()` with `forcedQuote()` for path values and
`placeholder()` for human fill-in hints — its own `codex-pretool-guard.test.mjs`
left byte-for-byte untouched, all 38 assertions (including the 3 originally-
pinned exact-quoting ones) pass unmodified. Independently re-verified by the
Elephant: `copy-safe-command.test.mjs` 21/21, `codex-pretool-guard.test.mjs`
38/38. **Critic review required** before this candidate ships (guardrail/hook
file) — folded into the session's single final Critic 1+1 round.

This item still stays `status: open`: the "every emitter" repository-wide
audit acceptance criterion remains unperformed, and the surfaced
`human-guard-override.mjs` third-importer note above is still unactioned.

## Re-verified, 2026-09-01 (NVA-B-STALECLOSE) — predicate satisfied, requirement not met, stays open

`check-backlog-done-predicate.mjs` reports this item STALE-OPEN because
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` contains the literal
string `copy-safe-command.mjs` (true — it is imported there as part of the
landed `NVA-W12-COPYSAFE`/`NVA-CF-FORCEDQUOTE` work). That only satisfies the
needle string, not this item's full "every emitter" acceptance criterion.
Confirmed still open by direct check: `plugins/pipeline-core/lib/
human-guard-override.mjs` (the actual current path — the item's own note
named it without the `lib/` prefix) still imports and calls
`boundedOpaqueCopyCommand` directly (line 46 import, line 1542 call site),
not the shared `boundedCopySafeCommand()`/`copy-safe-command.mjs` renderer.
This is exactly the third-importer gap the item's own 2026-08-29 progress
note flagged as "surfaced ... not yet actioned," and it remains unactioned
today. Left `status: open`. `done_when` predicate not amended per briefing
prohibition.

## Progress note (2026-09-06, NVA-B-HGOCOPYSAFE-1, goldfish-deep)

Resolved the `human-guard-override.mjs` third-importer gap named above.
**Correction to this dispatch's own briefing's stated premise:** the
briefing asserted `copy-safe-command.mjs` has "no existing mode" to render
an opaque, already-assembled command string, listing only `placeholder`,
`forcedQuote`, `boundedCopySafeCommand`, `renderHumanCopySafeCommand` as its
exports. That list missed `copy-safe-command.mjs`'s own
`export { boundedOpaqueCopyCommand };` (line 35) — a byte-identical
re-export of the exact function `project-onboarding-v3.mjs` defines, already
established as this repository's real precedent for the raw-opaque-string
disclosure shape at `antigravity-pretool-guard.mjs`
(`NVA-CF-BL19-COPYSAFEADOPT`: "sourced from the shared renderer module
rather than project-onboarding-v3.mjs directly"). No new capability was
needed in `copy-safe-command.mjs`. Delivered (commit `da6b381c`):
`human-guard-override.mjs`'s import switched from
`./project-onboarding-v3.mjs` to `./copy-safe-command.mjs` for
`boundedOpaqueCopyCommand`, with a comment mirroring the antigravity
precedent; one new round-trip test added to `copy-safe-command.test.mjs`
proving the re-exported function reconstructs an already-assembled opaque
command string (space, `$`, non-ASCII) byte-identical through a real shell
(not `eval`, since an arbitrary opaque string has no shadowable executable
name to capture argv through the way the argv-assembled tests above do).
`copy-safe-command.test.mjs`: 32/32 pass (was 31/31). Full existing
`human-guard-override.test.mjs`: 99/99 pass, zero assertion changes.
`check-consumer-safe-paths.test.mjs`: 9/9 pass.

**This item stays `status: open`, NOT closed.** Two gaps remain against the
"every emitter" acceptance criterion: (1) `codex-pretool-guard.mjs:19` still
imports `boundedOpaqueCopyCommand` directly from `project-onboarding-v3.mjs`
rather than through `copy-safe-command.mjs`'s re-export, even though that
file already imports `boundedCopySafeCommand`/`forcedQuote`/`placeholder`
from `copy-safe-command.mjs` on the very next line — an inconsistency this
dispatch found but was out of its briefed scope to touch; (2) the
repository-wide "every OTHER emitter" audit this item's acceptance criteria
require remains unperformed. Both were out of this dispatch's briefed
scope (`human-guard-override.mjs` only).

## Progress note (2026-09-06, NVA-B-CODEXGUARDIMPORT-1)

Resolved gap (1) above: `codex-pretool-guard.mjs`'s import switched from
`../lib/project-onboarding-v3.mjs` to `../lib/copy-safe-command.mjs` for
`boundedOpaqueCopyCommand` (commit `d398a662`), the identical re-export
already used by `human-guard-override.mjs` and `antigravity-pretool-guard.mjs`
— byte-identical function, zero behavior change. Full existing
`codex-pretool-guard.test.mjs`: 38/38 pass, zero assertion changes
(`backlog/evidence/2026-09-06-nva-b-codexguardimport-1-green.txt`).

**Disclosed authorship note:** this commit was authored directly by the
Elephant session rather than dispatched, submitted for the mandatory T1
Critic review any guardrail-hook diff requires
(`backlog/evidence/2026-09-06-nva-b-codexguardimport-1-authorship-disclosure.md`).

Gap (2), the repository-wide "every OTHER emitter" audit, remains
unperformed — this item stays `status: open`.

## T1 Critic review of `d398a662` — round 2 (closing) PASS

Round 1 FAIL on two evidence gaps (no completed verify result bound to the
commit; consumer-safe-paths check unevidenced), code confirmed correct;
both remediated. Round 2 (fix-verification scope, two-round cap exhausted):
PASS. Full findings, including the disposed EL-01 authorship finding and
two minor follow-ups filed: `backlog/evidence/2026-09-06-nva-b-codexguardimport-1-findings.md`.
