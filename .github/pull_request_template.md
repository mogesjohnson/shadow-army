<!-- Title: #<actual issue> or [F<local feature ID>], then a concise action. -->

Describe the resulting behavior and implementation method in one or two sentences.

Validation: checks run, results, and any material limitation.

Tracking: issue or local feature ID. For stacked work, name the required base branch.

Checklist:
- [ ] Adapters stay isolated: only briefs and reports cross between soldiers.
- [ ] Hard routing rules (Grok never reviews, `agy` never writes) are enforced and tested.
- [ ] Dashboard and `--plain` output both work (for UI changes).
- [ ] Paths and shell calls work on Windows and POSIX.
- [ ] `npm run build`, `npx tsc --noEmit`, and `npm test` pass.
- [ ] Draft until required evidence or human acceptance is available.
