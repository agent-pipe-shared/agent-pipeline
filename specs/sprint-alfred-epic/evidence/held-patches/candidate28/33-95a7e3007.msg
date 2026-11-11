fix(guard): keep the outside-root label for a dot-dot plugin path

- 9060f05f1 stopped labelling a refused read of an existing plugin file as
  outside the project. A path that reaches such a file through a ".."
  segment lost the label too, and two C23 AC-108 cases in
  guard-lifecycle-ready.test.mjs went red.
- The dot-dot spelling is the refused part, so it keeps
  GUARD-READ-SCOPE-OUTSIDE-ROOT whatever file it lands on.

AI-Assisted: true
Dispatch: stage-0 (elephant)
