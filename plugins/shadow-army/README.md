# Shadow Army M1a mod

Windows only (D-34). Run `npm run build`, then from the repository root:
`claude --plugin-dir ./plugins/shadow-army`. Node must be on the host's PATH.

`/send <soldier> <brief>` is the slice's one command.
Its first use starts the post office through `dist/v2/modRelay.js`; later uses
reuse it. It sends the brief to one claude soldier with the
build role, waits for the turn, and shows one summary card in the transcript:
the soldier, at most five summary lines, the session log's path, and the files
applied or why none were. Each Cc or Cf character shows as a placeholder
(SEC-6). This build has no claim audit or apply, so `--claim` is refused and
the office refuses any claimed call; the claim backend arrives with #94.

The card reads `applied`, `reverted` and `reason` from the turn result, which
later milestones (B3, B4) fill. The mod keeps its Monarch
credential in module memory and passes it once on the relay's stdin. A
five-second callback renews the lease; `session.end` releases it.

Not tested: macOS and Linux; a live Claude session (M1-AC29 is the owner's
run).
