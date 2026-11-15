# Candidate 30 queue (opened 2026-11-15)

Items the PO names for candidate 30 (C30-1 was named first, C30-2 second). Nothing here is built; each item says where the change lives, what must
not change, and how it is proven. Candidate 29e is applied, stamped and installed; candidate 30 starts from it.

## Scope decided by the PO (2026-11-15)

Candidate 30 is ONE candidate that collects everything below; nothing is cut into an earlier one. Order of work:

1. The Full Verify of the installed candidate 29e state first (clone outside the repository, label `fv29e`, candidate
   commit `2f99da888`, documentation commits after the stamp included).
2. Then, together in 30: the private-name and path scrub (C30-2), the fixes for what that Full Verify finds (C30-3), the
   new topics named so far (C30-1) and later ones.
3. In parallel the PO runs new greenfield tests; their findings and the toil they show are fixed in 30 as well (C30-4).

Placeholders, filled as the results arrive: C30-3 findings of the Full Verify of 29e (the red steps, each triaged by
rerunning it alone and comparing with the 29d tree; the known intermittent `native-goldfish-host-stop-pair` race is one
of them to decide), C30-4 findings and toil of the PO's new greenfield tests.

## C30-2: private project names and machine paths must leave the repository (PO, 2026-11-15, "later, in candidate 30")

**Finding.** Names of the PO's consumer projects and the PO's machine-specific absolute paths are private data and must
not be in this repository (CLAUDE.md already forbids machine-specific paths and uses `<PROJECT_A>`..`<PROJECT_C>`). They
are in it anyway: a measurement of 2026-11-15 found two known names in well over 200 tracked files (handover and
archive text, plans, backlog items and ledger, specs, evidence, held patches and their commit messages, and also plugin
code and tests as comments, fixture names and expected strings).

**Wanted.** A mechanical scan, then a scrub, for both classes in tracked files, with neutral placeholders in place.

**Open questions for the PO before the build.**

- The complete list of private names (only two are known) and the path patterns that count as private.
- Held patches, patch messages and evidence files are digest-bound (apply scripts, audit bundles, inventories): a scrub
  changes their digests, so each bound file needs its digest carried over or the item decides to leave frozen evidence
  alone. Git history cannot be rewritten (never rewrite history), so old commits keep the names.
- Plugin source is protected: its part of the scrub is a held patch and the PO's apply, and the shipped tests that pin
  such strings are restated (QG-04) in the same change.

**Proof.** A tracked scan script under `scripts/` with a purpose header, an allowlist that is empty at the end, wired
into Verify so a name or path cannot return; the scan result before and after as evidence.

**Until then.** Nothing new carries a private name or path (Memory: consumer project names are private); new text uses
neutral labels.

## C30-1: the onboarding consent question is hard to read (PO, 2026-11-15, "first mini topic")

**Finding.** The first question a person meets in onboarding (the consent text the start skill relays verbatim) is one
long run-on paragraph: the purpose, about a dozen automatic steps, the tool list, the Advisor export consent and the
list of what the yes does not cover are chained with semicolons. A human cannot scan it or find what is being agreed to.

**Wanted.** The same content, better worded and structured, with bullets where it lists things:

- one short opening: what the Pipeline adds to a project and the single question being asked;
- the steps the yes covers as a bulleted list, one step per bullet, in the order they run, with the internal command
  names kept out of the headline of each bullet (a name may follow in brackets);
- the tools the Pipeline needs on this machine as their own short list (Node.js, Git, gitleaks, osv-scanner, semgrep;
  Trivy only where the project has infrastructure or container files; OpenSSL only where the person signs), with the one
  sentence on what happens when one is missing;
- the Advisor export consent as its own short paragraph (it belongs to the yes and is not asked again);
- what the yes does not cover as a closing bulleted list: the design approval, every push, every release, every human
  guard override.

**Where it lives.** `plugins/pipeline-core/lib/onboarding-consent-scope.mjs` (the question text and its per-language
entries); `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` builds `consentQuestion` from it and tells the
agent to relay `textByLanguage` (else `text`) verbatim, so the structure must survive a relay as plain text: dash
bullets and blank lines only, no tables, no markup the terminal does not render. Plugin source: a held patch and the
PO's apply, as for every protected change.

**What must not change.**

- The scope: the covered steps, the tool list including the Trivy and OpenSSL conditions, the Advisor export consent in
  the yes, and the four exclusions stay exactly as decided (ADR-0092, ADR-0103); this item rewords and restructures,
  it adds and removes no step.
- A recorded consent stores scope step ids, never a text digest (`onboarding-consent-mark.mjs`), so a reworded text
  keeps every earlier recorded consent valid.
- Every language entry is reworked together (the German reader's text first, the English one with the same structure);
  a missing entry still falls back to `text`.

**Proof.** The consent tests that pin the text and its relay (`onboarding-consent-mark.test.mjs`,
`pipeline-start-preflight.test.mjs`, `lib/pins/start-skill-fits-the-reattach-window.test.mjs`) are restated for the new
wording (QG-04); a new case pins that every covered step id still appears as one bullet, that the four exclusions are
present, and that no line is longer than the limit the start skill relays without wrapping trouble. The first real
onboarding of a greenfield project on each runner is the human check: the PO reads the question once and says whether it
is scannable.
