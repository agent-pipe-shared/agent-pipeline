test(close): the real one-shot walk expects the close to bind the Result itself

The close-path walk through the real CLI pinned the old first stop
(ONESHOT-RESULT-NOT-BOUND with a repair chain) and bound the Result by hand
before the acceptance question, also after a declined acceptance. The first
call now binds the Result itself and ends at the acceptance question for the
HEAD the bootstrap commit produced, with the bootstrap reported in the result;
the declined round does the same. The plain (not one-shot) walk keeps the
manual bootstrap chain, including the PO-signed route for a drifted non-result
entry. The close-feature skill describes the stop as the narrower case it now is.

AI-Assisted: true
Dispatch: stage-0 (elephant)
