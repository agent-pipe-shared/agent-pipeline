test(override): the deadline case no longer depends on how fast git answers under load

L16-5 recorded the timeout each git call was asked for and then ran the real git with that timeout. Its third call is asked for the 500 ms floor, and on a loaded machine (three parallel workers) a real git did not answer in 500 ms, so the planning ended in the typed timeout and the case went red although the code under test was right. The case still records the requested timeouts (5000, 4000, 500) and asserts them, and now runs git itself with a generous limit.

AI-Assisted: true
Dispatch: stage-0 (elephant)
