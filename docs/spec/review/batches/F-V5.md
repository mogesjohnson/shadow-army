# Unit F, round 1, verification batch F-V5 (evidence levels and the canvas)

## R-F-25

- severity: P2
  type: untestable
  location: §5.1 C (docs/spec/v2.md:457-463); CH-1 (:219-220)
  claim: The contract fixtures record only "an error" per CLI, so CH-1's error kinds are checked only against fakes written from the spec.
  scenario: The real claude reports a rate limit in a shape the fake doesn't use (NEEDS-PROBE). In production it is filed as "another error", with no reset time and no H6 hold, while M1-AC4 still passes against the fake.
  evidence: The contract level records "the two-prompt task; an approval request …; an error; a session that goes cold". CH-1 says the kinds are "read from the CLI's own fields".
  fix: Contract level: "For each CLI, record one session per error kind it can be made to produce (a context overflow, a login needed). A kind that can't be produced on purpose is built from the vendor's documented shape and marked synthetic."

## R-F-44

- severity: P2
  type: gap
  location: §5.1 C (docs/spec/v2.md:457-463)
  claim: The owner's list of recordings misses what the requirements with C evidence need, and "recorded again when a CLI updates" has no trigger.
  scenario: M2-AC6 needs a recording of each CLI stopped mid-turn, CH-9 (C only) needs a resume, PO-4 needs each CLI's `send` call, and M1-AC3 needs a subagent's message. None is on the list. claude updates often, while CH-8 lets a newer version run with a warning, so it's unclear whether every update means re-recording.
  evidence: CH-8:258; VER-4:505.
  fix: List the recordings each C requirement needs. Re-record when an adapter's pinned version changes.

## R-F-43

- severity: P2
  type: gap
  location: Header Design (docs/spec/v2.md:11); VIS-1 (:424); VIS-2 (:426); HOST-9 (:133)
  claim: The canvas is normative but lives outside the repository, behind a login and with its source in `.shadow/`. The spec doesn't say which wins when the two disagree.
  scenario: MSG-4 (:294) requires "a glyph and a word" for queued, delivered, answered, interrupted, not delivered and cancelled, and HOST-6 needs glyphs for waiting, held, log in, down and error. The spec gives none of these glyphs. S1 already found the canvas and the spec disagreeing (inline vs docked at 110).
  evidence: m0-report.md:16; §5.1 S:492 "follow the canvas".
  fix: "The named canvas version is exported into the repository; where it and this spec disagree, this spec wins". List every state's glyph and word in VIS-2.

## R-F-45

- severity: P2
  type: ambiguity
  location: §5.1 S (docs/spec/v2.md:492); M5-AC6 (:672); M5-AC7 (:673); VIS-3 (:427)
  claim: "At 144, 110 and 80 columns" doesn't say whether these are terminal or surface widths, while ACs need 44 and 60, and a pane is drawn at the width Claude Code gives it.
  scenario: The pane's tree gets `bodyColumns` (for example 56), never 144. Read as surface widths, M5-AC6's 44 and M5-AC7's 60 are never covered.
  evidence: Mods reference: "draw to e.props.bodyColumns".
  fix: "Terminal widths 144, 110 and 80; the pane also at body widths 56 and 44; the strip at 60."
