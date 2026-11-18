test(hooks): the repository-mode promotion fixtures keep their line endings on any machine

The fixture repository sets core.autocrlf and core.safecrlf locally, so a user-level core.autocrlf=input no longer turns the CRLF twins into LF at git add. The assertion is unchanged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
