fix(design-approval): the request-exists refusal names the commit as the cause of a stale scratch copy

A Codex greenfield run committed a config file between two present-plan runs of the same design and was refused with DWP-REQUEST-EXISTS-DRIFT: the scratch copy of the design approval request is named by the binding digest, but its content also binds the commit the request was presented at, so the second run found the same name with other bytes. The repair (move or delete that one scratch file) worked and cost one escalated call, but the refusal did not say why the same digest had two contents.

When the earlier file is a plain single-link request of the same schema and binding whose intent differs, the refusal now says exactly that: an earlier present-plan at another commit, the copy is stale, delete it and run again, and make no further commit between that present-plan and the signature. The decision is made by a pure, fail-closed helper (anything unparsable, another binding, another schema or an identical intent keeps the original message). Nothing about when the file is written, replaced or refused changes: the sealed companion publication and the exit code are untouched. Cases pin the helper.

AI-Assisted: true
Dispatch: stage-0 (elephant)
