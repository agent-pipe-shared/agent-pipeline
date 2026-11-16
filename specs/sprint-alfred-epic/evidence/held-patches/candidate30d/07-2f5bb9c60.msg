fix(critic): the diagnostic refusal names the order trap and the way out

The diagnostic for a correction commit can only be produced while HEAD is that
commit. An evidence-only commit made after it (the export or the lineage of the
previous round) leaves HEAD behind the candidate the delta route selects, and
the refusal CDI-DIRTY-CANDIDATE named only its code, so a coordinator looked
for a dirty tree that did not exist and the delta verb then found no diagnostic.

The producer now says which of the two causes it is: HEAD behind the candidate
(with the number of commits and the order that avoids it: diagnostic right
after the correction commit, before any evidence, export or lineage commit, or
from a clean checkout of exactly the candidate), or a tree that differs. The
delta verb's refusal for a missing diagnostic carries the same hint. No check
changed its decision.

AI-Assisted: true
Dispatch: stage-0 (elephant)
