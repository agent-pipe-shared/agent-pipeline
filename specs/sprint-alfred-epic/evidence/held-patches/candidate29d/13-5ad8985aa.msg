fix(guard): give no per-part verdict for a list with a line break in a part or a non-root cd

The per-part verdict of a ";"-list echoed each part into the denial
text. A part holding a quoted line break could thereby start a line of
its own, and one shaped like the retry-actions envelope would be read
by its line-by-line consumer as a second envelope. Such a list now gets
no text at all; the test pins exactly one envelope line.

After a cd to anywhere but the project root, a relative operand names a
different file than it does from the root, so "admitted on its own,
exactly as written" would be a wrong claim. No verdict is given then.

AI-Assisted: true
Dispatch: stage-0 (elephant)
