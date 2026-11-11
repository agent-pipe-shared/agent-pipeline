fix(onboarding): write the answered Git author before the first commit

The author answered in onboarding was held but nothing wrote it, so a run on
native Windows made its first commit with the global account's identity. That
matters for anything published. The git guard now writes the held values into
the repository's local config directly before a commit, only where no local
value exists. Nothing is invented when no answer is held.

AI-Assisted: true
Dispatch: stage-0 (elephant)
