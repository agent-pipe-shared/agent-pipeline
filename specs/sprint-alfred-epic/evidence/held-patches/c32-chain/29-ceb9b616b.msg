feat(critic): the stop hook notes the last Critic stop, and the close and the split merge say why no Source return was issued

The Codex greenfield report (candidate 31 run): neither Critic round produced a Source return. The close then needed the PO's acknowledgement of a caller-authored fallback (an extra signature and about an hour of waiting), and the split merge stopped with CSM-PACKET-NO-RECORDS. The packet was claimed and admitted before the Critic ran, so the remaining causes are on the stop side (the agent type of the spawned Critic, or a final message without a verdict, or no stop event at all), and a stop that finds no open packet or a non-Critic agent type left no trace, so nobody could tell which.

issueCriticSourceReturn() now writes one small note, `<common-dir>/agent-pipeline/critic-packets/last-critic-stop.json` (mode 0600, overwritten by the next stop, only where the packet directory exists): the runner, the time, the agent type (cleaned, at most 40 characters), the outcome (issued, no-verdict, ambiguous, no-open-packet and the other typed statuses) and a reason. A subagent of another type that returns a schema-shaped Critic verdict is noted as verdict-under-other-agent-type, naming the type and the two Critic types; that is the usual cause on a runner that spawns every role as `default`. Behaviour is unchanged: the stop still issues nothing for a non-Critic type, nothing fails or blocks, and a diagnostic fault is swallowed.

readCriticStopNote() reads it and describeCriticStopNote() renders one sentence, which CLOSE-CRITIC-CALLER-AUTHORED and CSM-PACKET-NO-RECORDS now carry before their repair; without a note the sentence says the hook recorded no Critic stop at all. A case covers the no-verdict note, the verdict under the default type, the unchanged note after a non-Critic stop without a verdict, and an issued stop.

AI-Assisted: true
Dispatch: stage-0 (elephant)
