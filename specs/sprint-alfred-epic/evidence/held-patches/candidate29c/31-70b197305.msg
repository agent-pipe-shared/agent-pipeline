fix(design-review): an observation is bound to the PRD and Spec of its first receipt

The replay refusal (8e5410388) looked only at --previous and the target
folder, so the same exported report could stamp a receipt over one
changed Spec byte written under evidence/ without --previous. create now
binds the observation in the private store at its first stamp
(<digest>.consumed, exclusive create, PRD and Spec digests) and refuses a
stamp over other bytes with DRC-OBSERVATION-REPLAYED, in any folder. A
receipt made by mistake and deleted before commit can be made again over
the same PRD and Spec; the refusal names that route. The library header
states what the store's write refusal does not cover.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
