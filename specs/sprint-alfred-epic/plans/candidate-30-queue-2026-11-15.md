# Candidate 30 queue (opened 2026-11-15)

Items the PO names for candidate 30, newest last. Nothing here is built; each item says where the change lives, what must
not change, and how it is proven. Candidate 29e is applied, stamped and installed; candidate 30 starts from it.

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
