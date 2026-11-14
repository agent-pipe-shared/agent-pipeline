feat(close): name the evidence follow-up and label the security coverage

C29e T4 (PO tile 2026-11-14, Claude run 3 L5): the close commits its
audit bundle before the full security scan, so the final Verify and the
v2 security verdict reach the bundle only with the evidence follow-up of
the next push. A run without that push never saw security evidence in
its bundle, and the private final record said securityStatus "green"
even for an empty capability plan. The closed-local message now ends
with the follow-up sentence, and the private final record carries a
closed coverage word (required-checks, optional-checks-only, empty-plan,
unavailable) read from the v2 verdict it binds. The coordinator accepts
the field as optional (earlier closes wrote none) and refuses any other
word. No new commit in the close.

AI-Assisted: true
Dispatch: stage-0 (elephant)
