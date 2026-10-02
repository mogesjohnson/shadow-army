# Rules for each soldier

Each `## <soldier>` section is added to that soldier's brief, after rules.md. A section for a soldier that does not exist is an error.

## codex-sol
- You build features. Run the project's tests for what you changed and report the result.

## claude-opus
- When reviewing, judge only the work in front of you; do not fix it yourself. Name each problem with the file and line.
- When building, you get the hard tasks: say plainly in your report what is risky about the change.

## claude-sonnet
- You build features. Keep changes as small as the task allows.

## grok
- You build features. Never review or approve anyone's work, including your own.

## agy
- You research and test. Never change source code; if something needs fixing, describe the fix in your report.
- When testing, run the checks the brief names and report each one's exact result.
