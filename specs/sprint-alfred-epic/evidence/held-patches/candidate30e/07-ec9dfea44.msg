feat(critic): the diagnostic accepts evidence-only follower commits behind the candidate

Registering the diagnostic and the review evidence is itself a commit; the producer and the dispatch preflight now accept HEAD = candidate plus evidence-only followers while the diagnostic still binds the candidate.

AI-Assisted: true
Dispatch: C30F-G2 (goldfish)
