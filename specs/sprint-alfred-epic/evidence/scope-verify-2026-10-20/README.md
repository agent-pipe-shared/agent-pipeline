# Per-item re-verification, 2026-10-20 (D61)

Every one of the 145 items with open agent, decision or signature points in the 2026-10-20
remeasure was re-read against its own acceptance and the current code, at head `c1771bc98`
or shortly before it, by 21 read-only readers (`claude-sonnet-5-5`, at most about 32 tool
uses each, no tests run). `reader-prompt.md` is the exact prompt; `input-NN.json` and
`out-NN.json` are each reader's input and output; `summary.json` aggregates them.

Clause statuses over all 145 items: 320 evidence (code and test exist, no counted result
stated), 76 done, 76 content, 80 native-host, 33 po-decision, 7 po-signature, 15 superseded,
7 unread. Readers marked 60 items closable after the test hosts once their counted runs are
green. The readers found the remeasure's open points wrong or stale for many items: in most
of them the fix and its pin already exist.

Limits: the readers did not run any test, several ran out of budget or met guard refusals,
and a reader's `content` verdict is sometimes conditional ("if absent"). Every `content`
clause is checked again against the code before its Goldfish briefing is written. Three
items are unread (AC-154, AC-174, AC-179) and get their own read.
