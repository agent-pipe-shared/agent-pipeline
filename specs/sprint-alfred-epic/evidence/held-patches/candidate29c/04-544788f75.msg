fix(close): word the open v2 security scope without contradicting a passed scanner

Follow-up to the C3 honest display: the readback row could read
"semgrep: passed; ... no security control shown as passed". The note now
names only the v2 scope ("v2 scope unavailable", "v2 capability plan
empty ...: capability controls open"), and the close sentence for an
unreadable scope says what it covers is open. The scanner states stay as
they are.

Checkpoint-Intent: candidate 29c, Codex run 3 C3
AI-Assisted: true
Dispatch: stage-0 (elephant)
