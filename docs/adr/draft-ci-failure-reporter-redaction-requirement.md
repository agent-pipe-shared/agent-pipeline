# ADR (draft, unnumbered) — the CI failure reporter's redaction requirement

> Unnumbered and unindexed until PO acceptance, per
> [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2. Home
> confirmed by [ADR-0063](0063-repository-directory-contract.md) (a
> decision/requirement record of this kind lives under `docs/adr/`).

## Status

Draft, 2026-09-04. Written in response to
`backlog/items/2026-09-01-*-ci-failure-reporter-has-no-recorded-requirement*.md`
(preserved for this dispatch as `scratch/strip-ci-failure-reporter.md`): a
component that performs redaction on a public log has never had a recorded
requirement, so no Critic round can be dispatched against it — a Critic given a
missing spec is contractually fail-closed on its own reference boundary
(`templates/prompts/critic-review.md`).

**This document is deliberately written from the problem, not from the
component's current source.** The drafting Goldfish did not open
`harness/scripts/print-verify-failures.mjs` or its test file until after the
requirement below was complete; see "Confirmed satisfiable" at the end for the
one place the implementation was consulted, and only to check the requirement
is achievable, never to supply its content.

## Context

`verify.mjs` deliberately keeps suite output private: raw suite logs are not
placed in any location the CI job exposes as a public artifact or transcript.
That containment is correct on its own terms — it is exactly what keeps a
suite's stdout/stderr (which can carry anything a test happened to print, up
to and including secrets under test, absolute local paths, or other operator
detail) out of a public surface by default.

That correctness creates a second problem: when a CI run goes red, the public
job log otherwise carries no more than a pass/fail bit and a
`diagnosticDigest` — enough to prove something failed, nothing that lets a
human or a dispatched agent attribute *which* suite failed or start
investigating without first getting hold of the private evidence out-of-band.
A component was built to close that gap: it runs after a failure, reads the
private evidence, and writes an attribution into the same public CI log that
`verify.mjs` was just careful to keep clean.

**That is a redaction/declassification boundary, stated precisely:** it takes
content that was deliberately kept private and decides what portion of it
crosses into a public, typically long-retained, indexable transcript. Getting
this wrong is asymmetric in a way that matters for how the requirement below
is shaped: under-attributing costs a human a slower investigation; over-sharing
publishes a secret or an operator's machine-identifying detail into a
permanent public record, which cannot be un-published by fixing the code
afterward. The requirement is written to be conservative for exactly that
reason — this is the one place in the day's wave where "we can patch it next
time" is not a available recovery.

There is a second reason this matters beyond the immediate leak risk: this
component's own redaction logic has already been wrong once in a way that was
invisible to its own authors. Literal `-----` PEM delimiters were written into
a pattern meant to catch private-key material, which an unrelated scanner
(`gitleaks`) then flagged against the reporter's *own source file* — not
against anything it redacted. It was caught by a tool that was not looking for
this component's logic at all. That is the concrete argument for a written,
falsifiable requirement to review against, rather than trusting the
implementation's self-consistency.

## Decision — the requirement

The requirement is stated as EARS acceptance criteria
([ADR-0004](0004-spec-rigor-tiers-ears.md): "WHEN `<trigger>`, THE SYSTEM
SHALL `<response>`"), because each line is meant to become one test case a
Critic round can check the implementation against.

Throughout, "the log" means the public CI job's exposed output (the
Actions transcript this step writes to); "the private evidence" means
anything `verify.mjs` produced that is not itself already public (the run
journal, suite stdout/stderr, `evidence/verify-latest.json`'s non-public
fields, and any environment state available to the step).

### R1 — Classes of value that must never reach the log

- **AC1 (credential/secret material).** WHEN the reporter selects content to
  emit, THE SYSTEM SHALL NOT emit credential or secret material — API keys,
  tokens, passwords, private-key material in any encoding (including PEM-like
  or base64 blocks), or signing material — regardless of whether that
  material appears in structured evidence fields or in free-form suite
  output.
- **AC2 (machine-identifying absolute paths).** WHEN the reporter selects
  content to emit, THE SYSTEM SHALL NOT emit an absolute filesystem path that
  identifies a specific machine or operator account (e.g. a `/home/<name>`,
  `/Users/<name>`, or `C:\Users\<name>` shaped path) — the same class this
  repository already treats as never fit for a commit, doc, or report
  (`CLAUDE.md`, "No secrets, tokens, or machine-specific absolute paths").
- **AC3 (personal/session identifiers).** WHEN the reporter selects content
  to emit, THE SYSTEM SHALL NOT emit personal identifiers (email addresses,
  usernames not already part of the public repository's own history) or
  session/correlation identifiers (the same class this repository's own
  commit-trailer rule already forbids for a different artifact —
  `templates/prompts/agent-obligations.md` §6).
- **AC4 (unclassified raw content, default-deny).** WHEN the reporter
  considers any value sourced from the private evidence or from suite
  output for inclusion, THE SYSTEM SHALL treat that value as unsafe by
  default and SHALL emit it only if it has been affirmatively classified as
  belonging to an allowed-safe class (R2). Raw suite output is not itself an
  allowed-safe class — everything in it is opaque until classified.

### R2 — What the reporter is allowed to emit

- **AC5 (positive allow-list).** THE SYSTEM SHALL be permitted to emit only:
  (a) a suite identifier/name, (b) a coarse status signal (e.g. pass/fail or
  an exit code), (c) non-sensitive structured attribution metadata that
  identifies *which* check failed without carrying its content, and (d) a
  pointer or reference into the private evidence store (e.g. a path relative
  to the repository or a content digest) that a reader with access to the
  private evidence can use to retrieve detail themselves — provided that
  pointer itself independently satisfies R1 (AC1–AC3).
- **AC6 (excerpted content needs the same classification, not an exemption).**
  IF the reporter emits any excerpt of suite output (for readability, e.g. a
  bounded tail), THEN every value within that excerpt SHALL independently
  satisfy AC1–AC4 before inclusion — an excerpt is not a separate, looser
  channel; it is content subject to the same default-deny rule as everything
  else in R1.

### R3 — Behaviour on a value it cannot classify

- **AC7 (withhold, not emit, explicitly).** WHEN the reporter encounters a
  candidate value it cannot confidently classify into an allowed-safe class
  under R2, THE SYSTEM SHALL withhold that value and SHALL NOT emit it. This
  is the requirement's explicit answer to the question the source item
  raised as still open: irreversibility once a public log is published means
  the default on an unclassifiable value must be withhold, never emit.
- **AC8 (withholding is visible, not silent).** WHEN the reporter withholds a
  value under AC7, THE SYSTEM SHALL emit an explicit, non-sensitive marker in
  its place (something that says redaction happened) rather than omitting
  the field with no trace. A reader must be able to tell "nothing was here"
  apart from "something was here and was withheld" — a silent omission is
  indistinguishable from absence of a problem, which defeats the attribution
  purpose this component exists for in the first place.

### R4 — Behaviour when the reporter itself fails

This is the requirement's explicit answer to the source item's fourth
question. The reporter is diagnostic, not a gate: it runs only after the
job has already failed for a substantive reason (the suites it reports on),
so its own internal failure is a distinct event from the failure it is
trying to explain, and the two must not be allowed to blur into each other.

- **AC9 (no leak on internal failure).** IF the reporter encounters an
  internal error while classifying or redacting a value, THEN THE SYSTEM
  SHALL NOT fall back to emitting that value's raw, unredacted form. An
  internal error is itself an unclassifiable-value case and is bound by AC7:
  fail closed, withhold.
- **AC10 (internal failure does not silently gate).** IF the reporter fails
  to complete its reporting pass, THEN THE SYSTEM SHALL NOT be the thing that
  determines the CI job's pass/fail outcome — that signal already exists,
  set by the suite failures that triggered this step, and conflating a
  reporting failure with a substantive test failure would make the two
  indistinguishable to a reader relying on the job's status alone.
- **AC11 (internal failure is disclosed, not swallowed).** IF the reporter
  fails to complete its reporting pass, THEN THE SYSTEM SHALL emit an
  explicit, non-sensitive notice into the log stating that attribution
  reporting itself failed or is incomplete, distinguishable from "there was
  nothing to report" and from a normal successful attribution. A reader must
  never be left inferring "no issues with reporting" from silence where the
  true state was "reporting broke."

**Summary answer to the item's fourth question, stated plainly:** a
redaction failure is neither a full CI failure (AC10) nor a silent
degradation (AC11) — it is a disclosed, non-blocking degradation. Whether a
future decision wants to make it block instead is open (see Follow-up); this
requirement's position is the conservative default that does not add a new
way for the pipeline to go red while a Critic round is still outstanding
against the component that would gate it.

## Consequences

**Positive.** A Critic round now has something falsifiable to check the
seven implementing commits against — each AC above maps to something a
reviewer can either find satisfied or find a counter-example for. The four
questions the source item posed as "actually owed" are each answered
explicitly (R1/AC1–AC4 for classes withheld, R2/AC5–AC6 for what may be
emitted, R3/AC7–AC8 for the unclassifiable case, R4/AC9–AC11 for the
reporter's own failure), so no part of the item's stated minimum is left
implicit.

**Negative.** Some of R2 and R4 are genuine design positions taken by this
document rather than restatements of an already-settled fact (there was no
prior requirement to restate) — specifically AC10's "does not gate" stance
and AC5's specific allow-list shape are choices, not derivations, and a
Critic or the PO may reasonably contest them. They are stated as explicit,
falsifiable claims precisely so that contesting them is possible.

**Risk.** A requirement written before the Critic round exists is only as
good as the review that follows it; this document does not itself confirm
the seven commits satisfy any AC below — that confirmation is the separate,
later Critic round the source item's own acceptance criteria call for.

## Confirmed satisfiable by reading the current implementation

*(Added in a follow-up edit after the requirement above was drafted and
committed at `32213a0a`. `harness/scripts/print-verify-failures.mjs` was read
at this point for the first time in this dispatch; its test file was not
opened, since the main script already answers the one question this section
exists to answer — is R1–R4 achievable in principle, not "does the current
code already pass it." No AC above was written or altered by this reading.)*

**Achievable, yes — but the current implementation's architecture is the
opposite shape from R1/AC4's default-deny model, which is exactly the kind of
gap a requirement written from the problem is supposed to surface, not
paper over.** The script redacts four specific credential *shapes*
(`ghp_`/`gho_`/etc. GitHub tokens, `github_pat_` tokens, AWS `AKIA` keys, and
PEM private-key blocks) out of an otherwise-unfiltered suite-log tail, and
emits everything else that survives its byte/line bounds — including, by
construction, absolute filesystem paths, email addresses, and any other
value a suite happened to print. That is a **blocklist** (emit by default,
strip four known-bad shapes) where AC1–AC4 specify an **allowlist** (withhold
by default, emit only classified-safe fields). Nothing about that makes
AC1–AC11 unachievable — a default-deny redesign is a real, buildable change,
not a contradiction in terms — but it does mean the current implementation
would not, as it stands, satisfy AC2 (machine-identifying paths), AC3
(personal identifiers), or AC4/AC7 (default-withhold on anything
unclassified) if checked against them today. That gap is exactly what the
forthcoming Critic round is for; this section names it as an observation for
that round to weigh, not as a finding this dispatch is authorized to act on
(briefing NVA-B-CIREPSPEC-1, field 4: no edits to the reporter or its test).

One further concrete point worth flagging for that Critic round specifically:
the top-level `catch` at the CLI entrypoint
(`print-verify-failures.mjs:446-450`) prints `error.message` (truncated to
200 characters) directly to `console.log`, with no pass through `redactText`
first. An exception message is exactly the kind of unclassified value AC1/
AC9 are about, and this path bypasses the script's own redaction function
entirely — worth the Critic round's attention against AC1/AC9 specifically.

AC5/AC6 (positive allow-list, same classification for excerpts), AC10 (does
not gate — the script always exits 0, degrading every failure mode to one
diagnostic line, matching AC10 exactly), and AC9/AC11's "never throws, always
degrades to a bounded diagnostic line" framing are all already structurally
present in the current code's design intent, even though AC9's specific
"exception path must not skip redaction" requirement is not, per the point
above.

## Follow-up

- **A Critic round against the seven commits named in the source item**
  (`4d5df21c`, `b904c01d`, `8fbb4ed7`, `a5d26a72`, `58fe2d4b`, `c84d2f44`,
  `57fefcf2`) is the next step, dispatched separately by the Elephant — not
  performed by this document or this dispatch (briefing NVA-B-CIREPSPEC-1,
  field 4: "A Critic round against the seven listed commits is a SEPARATE,
  later step the Elephant dispatches — not yours to fold in").
- PO decision on whether AC10's "does not gate" stance is the wanted default,
  or whether a reporting failure should instead block the job, is open — this
  document takes the conservative non-blocking position and states it as
  contestable rather than settled.
- Numbering and `docs/adr/README.md` index-row assignment happen only at PO
  acceptance, per ADR-0069 Decision 2; this file stays
  `docs/adr/draft-ci-failure-reporter-redaction-requirement.md` until then.
- Until the Critic round in the first bullet completes, the component's
  review status should be recorded as outstanding, not skipped and not
  reviewed — the source item's own acceptance criteria already say this.
