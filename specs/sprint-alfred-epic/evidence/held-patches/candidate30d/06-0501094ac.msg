fix(critic): a delta request that makes the next round a full round needs the Coordinator's explicit yes

A cautious true in trustBoundaryChanged or impactAmbiguous silently turned the
next Critic round into a full round over the whole feature range (66 and 72
files and three reviewers instead of about 30 files). The consequence showed
only in the registration result, and a registered value cannot be taken back.

The verb now refuses such a request before it writes anything
(FPR-DELTA-FULL-ROUND-UNCONFIRMED), states the consequence and when a true
value is factually right (a change to who or what is trusted or what an actor
may do, not every correction in a security-relevant feature), and registers it
only when the Coordinator reruns it with --confirm-full-round. The help text,
the path skeleton and the guard catalogue carry the same, and the catalogue
admits the flag for this one verb only. No tool fills or infers the judgment.

AI-Assisted: true
Dispatch: stage-0 (elephant)
