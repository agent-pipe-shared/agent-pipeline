---
schema: pipeline.backlog-item.v1
id: pipeline.briefing-dispatch-needs-hand-retyping
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P2
release: 0.7.0
source: "PO remark during the D165 fix wave, 2026-10-26: the briefing generator is used permanently and must work reliably"
done_when: manual
---

# A generated briefing reaches the dispatch only by the Elephant retyping it byte-exact

`dispatch-briefing.mjs build` writes the briefing and its digest, and `guard-dispatch.mjs` refuses any prompt whose
bytes differ (`DBG-GENERATED-DIGEST-MISMATCH`, digest over the LF-canonical text, trailing newline included). The
only route from the file to the Agent call is the model copying roughly 90 lines into the prompt parameter.

Observed 2026-10-26: after a package edit and rebuild, the prompt carried the generator marker of the previous
build, and the dispatch was refused. Earlier sessions lost time to the trailing newline in the same way. Every
retyped briefing also spends the Elephant's tokens twice: once reading the file, once writing it out.

The cost repeats on every continuation: a Goldfish that stops at its tool-budget checkpoint needs a new briefing, and
the Elephant reads and retypes the full ~90 lines again. On 2026-10-26 one slice needed three retypes (a stale marker,
a queue hold after the B2 cancel, and the continuation itself).

Wanted, one of: (a) the dispatch accepts a reference to the generated file (path plus digest) and the hook resolves
the text itself, the Goldfish receiving exactly those bytes; or (b) `build` prints the exact prompt body to paste
and a `verify-prompt` check compares a candidate against it before the call, with a readable diff on mismatch. A
rebuild must also make the previous briefing's marker unmistakably stale (the file carries its build digest in a
header the Elephant reads first).

Related: `DBG-RUNNING-SCOPE-UNKNOWN` and `GUARD-DISPATCH-SECOND-WRITER-UNJUDGED` warn on every dispatch about 70
legacy dispatch records without an owner claim. They are noise that hides a real warning; a one-time retirement of
those records would restore the signal.
