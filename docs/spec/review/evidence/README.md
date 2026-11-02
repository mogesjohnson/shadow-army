# Evidence for the spec 2.0 review

GitHub is private, so agents read these copies instead.

| File | What it is |
|---|---|
| `m0-report.md` | The M0 spike report (S1–S5), as posted on #63 on 2026-10-08. |
| `s6-results.md` | Spike S6 (interrupt) results so far, from STATE.md. Not yet posted on #63. |
| `issue-63-comments.md` | Every comment on #63, exported 2026-10-14. |
| `codex-review-method.md` | Codex's review method (the owner's seven failure simulations) and its Sol test report, from #69. |

**Not committed: Claude Code's mod API typings** (`claude-code.d.ts`, 803 KB, and the plugin-authoring skill's `reference.md`, from Claude Code 2.1.294). They are Anthropic's and ship with Claude Code, so they stay out of the repository.
- Claude Code unpacks them with its bundled plugin-authoring skill, under `<temp>/claude/bundled-skills/<version>/<hash>/plugin-authoring/`. On the owner's Windows machine that is `%LOCALAPPDATA%\Temp\claude\bundled-skills\2.1.294\…`, and a local copy is in `.shadow/v2-tools/review/evidence/mod-api-2.1.294/`.
- The same facts are documented at https://code.claude.com/docs/en/plugins/mods/reference and https://code.claude.com/docs/en/plugins/mods/api.
- Facts the review used from them: `session.end` has one short bound (1.5 s by default); `$.session.id()` changes after `/clear` or a resume, with no new `session.start`; `$.clock.every` runs one period at a time; a `$.process.spawn` child is killed when the module unloads, and blocks on its next write once 1,048,576 characters of its output wait unread; `$.process` is CLI only; mods also run in `claude -p` sessions (`$.session.surfaces()` is empty there).
