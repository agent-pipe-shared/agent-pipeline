feat(present-plan): name how each review round's reviewer model is known

The PO tile (label per runner) said a design approval is signed with the
reviewer label visible. present-plan printed nothing about it. It now
prints one line per non-fallback round, read from the receipt itself:
the observed model and its host assurance on Claude ("observed by the
host, not attested by the provider"), or "unobserved -- this runner has
no host observation route" on Codex and Antigravity. The line sits next
to the K128 fallback line, outside the signed binding, whose bytes stay
unchanged.

DABX017 asserts the observed line; new DABX018 presents a Codex round
with its unobserved label and an unchanged binding.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
