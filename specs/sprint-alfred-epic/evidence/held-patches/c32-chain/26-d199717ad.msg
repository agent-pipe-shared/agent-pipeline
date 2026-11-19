fix(usage): the Codex timeline counts a repeated token event once, and the operating model states the correction rule of D190

The Codex greenfield report (candidate 31 run): the timeline of a native Codex rollout counted one response twice. The rollout records one token_count event twice in a row, with the same cumulative total and the same last usage (68,114 input, 100 output too many in that run, lines 153 and 154 of the raw session). usage-ledger --timeline summed the last usage of every token_count event. It now counts an event only when its cumulative total_token_usage differs from the previous event's, since a genuine next response always grows the total; an event without a total is counted as before. A case pins a tripled event followed by a real response.

The same report found that docs/operating-model.md still said a Correction Goldfish carries the findings "until genuine PASS or the three-review correction limit", while the Critic coordinator course and D190 say that no round or correction-commit count refuses a correction-diff review on its own. The model now says: until genuine PASS or an explicit PO decision, no count of review rounds refuses a correction-diff review on its own (D190). Documentation only; the course and the source enforcement were already right.

AI-Assisted: true
Dispatch: stage-0 (elephant)
