fix(dispatch-briefing): DBG-ITEM-SLUG says what the item slug is and names the repair

Antigravity greenfield run 3 (R6) lost a round trip on DBG-ITEM-SLUG: the
refusal only said the slug must be lowercase letters, digits and hyphens,
not that --item is the bare slug from which the item id is derived as
<spec folder>.<item>. The refusal now says so, and a value that already
carries the folder prefix names the exact repair (pass the part after the
dot).

Checkpoint-Intent: candidate 29, AGY run 3 R6
AI-Assisted: true
Dispatch: stage-0 (elephant)
