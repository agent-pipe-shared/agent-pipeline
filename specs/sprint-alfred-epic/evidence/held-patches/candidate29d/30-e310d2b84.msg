fix(native-host): retry only integration races, and end before the host timeout

Follow-up to the K-38 retry. SDC-AUTHORITY-CAS carries about two
hundred reasons, most of them structural (a broken binding, a duplicate
member, a drifted namespace); a fresh boundary cures none of them. The
retry now repeats a closed set of race reasons only: registry-lock-held,
the preimage/generation/prefix races and the existing terminal sibling
races. Any other refusal comes back at once.

The integration runs after the finalize, whose waits share a 240 s
ceiling, and the hook's host timeout is 300 s (120 s for the
SubagentHandback matcher). The retry's default budget was the full
90 s lock wait, so a slow stop could run past the timeout and lose its
stop outcome. The hook now passes a hard deadline, its host timeout
minus a 30 s reserve counted from process start; no round starts after
it, the minimum round count included. The retry budget itself is 60 s.

Pins: NGHS73 gains a structural CAS case and a deadline case; NGHS74
compares the hook's timeout table with every native-host registration
in hooks.json and codex-hooks.json.

AI-Assisted: true
Dispatch: stage-0 (elephant)
