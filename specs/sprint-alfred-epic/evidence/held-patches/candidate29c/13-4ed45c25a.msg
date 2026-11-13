fix(goldfish-return): name trailing text after a complete final object as its own condition

Glossover K-27: a background Goldfish's final message was refused with
NGHR-FINAL-JSON "parse failed at position 3192 of 3337 characters"
although its hand-back looked valid. The object was complete; text
followed it. The refusal read like a broken object and did not say what
to change.

- A complete JSON value followed by other text is the condition
  json-trailing-text, with the end of the value and the length of what
  follows; it stays refused (the final message is the object only,
  optionally in one fence around the whole message). The text itself is
  never echoed.
- NGHR12 gains the case.

Checkpoint-Intent: candidate 29c, Glossover K-27
AI-Assisted: true
Dispatch: stage-0 (elephant)
