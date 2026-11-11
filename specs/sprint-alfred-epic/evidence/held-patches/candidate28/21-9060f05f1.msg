fix(guard): stop reporting refused plugin reads as outside the project

A read of the plugin's own files was refused as "outside the project root"
whenever a flag or value was the actual fault, for example --max-columns over
its limit. The agent then looked for another path instead of fixing the flag.
An existing file in the approved plugin root now gets the unsupported-command
refusal. A filename filter on a directory outside the project stays refused,
and the refusal now names the filter and says what to do instead. A file that
is really outside, and a missing plugin file, keep their own refusals.

AI-Assisted: true
Dispatch: stage-0 (elephant)
