# User-attributed AGY routing decision

Source: user-provided decision summarized in the task briefing for this evidence package. This is a record of the user's selected schema and tier intent; it is not a runtime capture or native execution proof.

- Schema version: AGY 1.4.7.
- Flat record fields: `TypeName`, `Role`, `Prompt`.
- Optional `Model` enum: `inherit`, `flash_lite`, `flash`, `pro`.
- `Workspace` enum: `inherit`, `branch`, `share`.
- Approved routing: worker uses the efficient/flash tier; frontier, deep, and critic use the `pro` tier.
- `inherit` is forbidden by the approved routing decision.
- The concrete model selection and effort were not observed. No provider, account, session, or native execution claim is made.

The custody record is in [evidence-index.json](evidence-index.json). Its statement is intentionally attributed to user input rather than to a captured AGY process.
