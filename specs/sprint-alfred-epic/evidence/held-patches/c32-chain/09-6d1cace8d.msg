fix(resume-hint): the consume and query refusal says what the session id is

An Antigravity greenfield run ran resume-hint.mjs consume without --session-id and was refused with only "consume requires --session-id": the flag was named, not where its value comes from. The id is the caller's own opaque identity (the receipt is keyed by its hash and query reads the receipt of the same id), so the refusal now says exactly that: any non-empty id of this session, chosen once and reused for consume and query, the runner's own session id where the runner shows one. Nothing about what is accepted or recorded changes; the exit code stays 2. A case pins the text for both verbs.

AI-Assisted: true
Dispatch: stage-0 (elephant)
