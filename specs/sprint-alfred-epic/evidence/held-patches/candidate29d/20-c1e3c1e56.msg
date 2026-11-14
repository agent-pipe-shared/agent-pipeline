fix(critic-preflight): list the later prerequisites on the empty-evidence refusal

Test round 28d (A2): preparing one Critic round took about ten
refusals, each revealing only the next prerequisite. Worst was the
order: the map refusal came after the evidence demand, but a map commit
makes evidence for the old candidate stale, so the expensive evidence
was produced twice.

The empty-evidence refusal keeps its code and stage and now carries,
only when there is more to name, an ordered `checks` list in push-init's
shape. A stale architecture map comes first and the reason says to
repair it before producing evidence. Then come the evidence and, for a
versioned feature package, the diagnostic evidence, its registration
and the evidence-only registration commit. The preflight cannot observe
these yet, so they are labelled unchecked and name the producer rules
they will meet (FPR-DIAG-PATH, CDI-OUTPUT-EXISTS, CDI-FULL-VERIFY).
Without a stale map or a package the field set is unchanged; a fault
in the probe leaves the list out, never the refusal.

AI-Assisted: true
Dispatch: stage-0 (elephant)
