fix(guard): name the one-pattern alternation when -e is repeated

Four of the fifteen read refusals in the third Claude greenfield run were
"rg -n -e a -e b -e c <file>"; the refusal said "keep one -e" and the
agent had to guess how to search for several patterns. The hint now
names the admitted spelling: for rg one -e with an alternation in single
quotes (-e 'one|two'), for grep the alternation with -E and no -e,
which is the form the grammar admits for grep (measured; grep -e is not
admitted). The test checks that both suggested spellings are admitted.

AI-Assisted: true
Dispatch: stage-0 (elephant)
