test(architecture): read the materializer result as its JSON line, not the whole console text

The State writer prints its next-step commit guidance on a second line after
the JSON result, and the fixture joins every console channel into one text,
so two cases of the public greenfield route suite failed on JSON.parse. The
guidance is intended; the cases now parse the line that starts with a brace.

AI-Assisted: true
Dispatch: stage-0 (elephant)
