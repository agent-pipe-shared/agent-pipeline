feat(audit-bundle): bind each projected dispatch to its record file digest

AGY run 3 (R13): evidence/ and scratch/ are git-ignored, so the
dispatch records exist only locally and the bundle held projections
without a link to the original bytes. PO tile 2026-11-13, "proofs into
the audit bundle": the push proof already reaches the bundle through the
follow-up at push, and the close's dispatch projection already carries
every terminal record (redacted, briefing as digest only since 28e).

Each projected dispatch now names recordSource {path, sha256} of its
exact local record file, so an auditor holding the file can check it
against the bundle. A caller that passes no source gets null; nothing
is invented.

AI-Assisted: true
Dispatch: stage-0 (elephant)
