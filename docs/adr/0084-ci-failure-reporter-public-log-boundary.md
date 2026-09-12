# ADR-0084 — CI failure reporter public-log boundary

## Status

Accepted, 2026-09-12. Initially drafted on 2026-09-04 in response to
`backlog/items/2026-09-01-*-ci-failure-reporter-has-no-recorded-requirement*.md`
(preserved for the drafting dispatch as `scratch/strip-ci-failure-reporter.md`).
The PO accepted the positive allow-list in AC5 and the disclosed, non-gating
failure behavior in AC10. The accepted design permits no sanitized free-text
excerpt: every raw or unclassified log value and every exception message is
represented only by an explicit redaction marker.

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
  A suite name is classified as safe only when it exactly matches an identifier
  in the current candidate's repository-authoritative Verify suite inventory.
  Character shape or a permissive identifier regex alone is not a safety
  classification.
- **AC6 (no free-text excerpts).** WHEN the reporter emits public attribution,
  THE SYSTEM SHALL NOT emit raw or sanitized free-text excerpts from suite
  output, evidence fields, or exception messages. Such values are outside the
  closed allow-list in AC5 and are represented only by the marker required by
  AC8.

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
degradation (AC11) — it is a disclosed, non-blocking degradation. This avoids
adding a second reason for the pipeline to go red after Verify has already
failed.

## Consequences

**Positive.** A Critic round now has something falsifiable to check the
implementation candidate against — each AC above maps to something a
reviewer can either find satisfied or find a counter-example for. The four
questions the source item posed as "actually owed" are each answered
explicitly (R1/AC1–AC4 for classes withheld, R2/AC5–AC6 for what may be
emitted, R3/AC7–AC8 for the unclassifiable case, R4/AC9–AC11 for the
reporter's own failure), so no part of the item's stated minimum is left
implicit.

**Negative.** Public CI output no longer contains a readable suite-log tail.
Operators need access to private evidence and use its digest reference for
detailed diagnosis. The reporter also remains diagnostic: its own failure is
visible but cannot add a second gate after Verify is already red.

**Risk.** This decision does not itself prove the implementation satisfies the
criteria. That confirmation requires the separate exact-candidate Critic round
in the source item's acceptance criteria.

## Public schema compatibility and rollback

The reporter emits one JSON object per line. Failure records use
`pipeline.verify-public-failure.v1`; diagnostic and degradation records use
`pipeline.verify-public-notice.v1`. Consumers must branch on `schema` and
`kind`, treat unknown schema versions as unsupported, and must not render
unknown fields as free text. Notice `code` values are fixed identifiers; their
presence does not authorize any additional evidence field for publication.

This replaces the earlier human-readable log-tail output. Consumers that need
details must resolve the SHA-256 reference against the separately protected
private evidence. There is no compatibility promise for parsers of the former
free-text format because preserving it would violate AC4–AC7.

A safe rollback cannot restore the former raw-tail implementation while this
ADR remains accepted. If the structured reporter must be withdrawn, the CI
step degrades to a fixed `pipeline.verify-public-notice.v1` notice with an
explicit redaction marker and exit code zero, or is disabled together with an
equivalent fixed notice at the workflow boundary. Restoring public excerpts
requires a successor ADR and a new privacy review.

## Pre-acceptance implementation finding (historical)

*(Added in a follow-up edit after the requirement above was drafted and
committed at `32213a0a`. `harness/scripts/print-verify-failures.mjs` was read
at this point for the first time in this dispatch; its test file was not
opened, since the main script already answers the one question this section
exists to answer — is R1–R4 achievable in principle, not "does the current
code already pass it." No AC above was written or altered by this reading.)*

At the time of that review, the implementation's architecture was the
opposite shape from R1/AC4's default-deny model. The script redacted four
specific credential *shapes*
(`ghp_`/`gho_`/etc. GitHub tokens, `github_pat_` tokens, AWS `AKIA` keys, and
PEM private-key blocks) out of an otherwise-unfiltered suite-log tail, and
emitted everything else that survived its byte/line bounds — including, by
construction, absolute filesystem paths, email addresses, and any other
value a suite happened to print. That is a **blocklist** (emit by default,
strip four known-bad shapes) where AC1–AC4 specify an **allowlist** (withhold
by default, emit only classified-safe fields). Nothing about that makes
AC1–AC11 unachievable — a default-deny redesign is a real, buildable change,
not a contradiction in terms — but the then-current implementation did not
satisfy AC2 (machine-identifying paths), AC3
(personal identifiers), or AC4/AC7 (default-withhold on anything
unclassified). This historical finding supplied the concrete implementation
gap addressed after PO acceptance.

That review also found that
the top-level `catch` at the CLI entrypoint
(`print-verify-failures.mjs:446-450`) prints `error.message` (truncated to
200 characters) directly to `console.log`, with no pass through `redactText`
first. An exception message is exactly the kind of unclassified value AC1/
AC9 are about, and this path bypasses the script's own redaction function
entirely. The accepted implementation must close that AC1/AC9 path.

The old design intent already treated the reporter as non-gating and attempted
bounded degradation, but the exception path showed why that intent was
insufficient without the closed output schema adopted here.

## Follow-up

- Review the positive-allow-list implementation against this accepted ADR on
  its exact candidate. Until that Critic round completes, the component's
  review status remains outstanding rather than skipped or reviewed.
- Bind the final candidate to the required Privacy and Threat-Model signatures
  through the normal PO ceremony. This ADR records no fabricated signature or
  substitute attestation.
- Keep detailed evidence private. Future public fields require a successor ADR
  that adds a typed safe class; expanding a sanitizer or free-text grammar is
  not an implementation-only change.
