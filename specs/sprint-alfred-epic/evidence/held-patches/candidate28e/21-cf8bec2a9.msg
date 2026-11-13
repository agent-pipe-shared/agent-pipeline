fix(close): carry a dispatch briefing in the close projection as its digest only

Codex test run 2026-11-12: the close wrote the dispatch projection with
the full briefing text into the tracked feature evidence. A briefing
quotes the Spec and the code, so that copy raised a gitleaks finding (a
public storage-key name) after the candidate had been scanned clean, in
a file the project cannot change and with no review route; the close
stayed blocked. PO decision 2026-11-13 ("Beides"): digest-only close
evidence next to the public-identifier class.

- lib/durable-evidence.mjs projectedBriefing: a found briefing is
  recorded as { status: "digest-only", sourceSha256 } with no text; the
  size, credential-shape and private-path checks that guarded the copy
  go with it
- lib/audit-bundle.mjs: "digest-only" is a valid briefing status (text
  and textSha256 null, sourceSha256 a SHA-256); bundles written with
  carried or redacted texts still verify

Tests: audit-bundle (plain, path-bearing and credential-shaped
briefings all become digest-only with the source digest, no briefing
text anywhere in the projection; a bundle with a legacy carried text
still verifies), finish-feature (the close writes digest-only, no
text), durable-evidence: 106/106. A digest-only entry with text or
without a source digest is refused by the validator but has no test of
its own.

AI-Assisted: true
Dispatch: stage-0 (elephant)
