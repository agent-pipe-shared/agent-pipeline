test(security): pin the public-identifier review for the audit-bundle copy

Codex greenfield run 3 (C4): the same public storage identifier was
flagged in the generated briefing and in the close's audit copy. The
public-identifier class (28e) admits audit-bundles/ in code, but only
the feature-evidence path was tested. The new case reviews and verifies
the identifier in an audit-bundle record and refuses it when only the
copy holds it. The resumption after the exception commit is covered by
the 29a carry fix and its tests.

Checkpoint-Intent: candidate 29c, Codex run 3 C4 check
AI-Assisted: true
Dispatch: stage-0 (elephant)
