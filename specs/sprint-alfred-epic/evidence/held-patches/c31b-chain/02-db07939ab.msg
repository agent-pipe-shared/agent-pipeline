fix(design-review): the report label and resolved-status rules no longer drop a genuine blocking finding

The cloud review of the C31a change found two ways the new report parser could lose an open finding. An intro sentence of three or more words ending in a colon directly under "Blocking findings:" ended the section, so every finding after it was lost and the receipt was made with none. And an item whose text merely began with the word resolved, withdrawn or closed ("Resolved symlinks are not re-checked", "Closed-loop retry has no cap") was read as a status.

A label line now ends a section only after a blank line, after at least one item, and when it names a round, earlier, previous, prior or a status. A status token is the word alone or with "in substance" or "for ...", followed by a sentence end. Both are narrow on purpose: when in doubt the item stays open, which is the old behaviour and has a recovery route. The real round 2 report of the greenfield run still reads as one blocking finding and six questions, and the cases pin the intro sentence, the two lookalike statuses, an unrelated label and the status tokens of the real shape.

AI-Assisted: true
Dispatch: stage-0 (elephant)
