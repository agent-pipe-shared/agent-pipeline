fix(prepare-dispatch): name the prepare step of an Antigravity Critic call

Antigravity run 3 (R14) met AGY-NATIVE-ARTIFACT-MISSING on its Critic
dispatch. prepare-dispatch critic told an Antigravity session that,
after admit, each briefing file is the Prompt of one invoke_subagent
call, and left out the step the native dispatch reference requires for
every read-only role: one request file per call (one
role-dispatch-request packet plus the call's TypeName, Role and
Prompt), antigravity-native-dispatch-prepare.mjs prepare, then the
returned invocation unchanged. The briefing use now names that step and
the refusal an unprepared call gets.

The other two refusals of the report row (DISPATCH-MODEL-MISSING,
DBB-BASE-CAP-MISSING) already carry their repair in the refusal; their
call shapes were not recorded, so nothing else changes here.

AI-Assisted: true
Dispatch: stage-0 (elephant)
