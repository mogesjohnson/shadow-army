# Shadow Army: rules for Claude

`sa` is a TypeScript/Node CLI (Ink for the UI) that commands other AI CLIs (claude, codex, grok, agy) as an army. Soldiers never share context: only briefs and reports cross between them. Read `CONTRIBUTING.md` for the full process; the rules below are the ones that get missed.

## Commands

```bash
npm install
npm run build          # tsc -> dist/
npx tsc --noEmit
npm test               # vitest
node dist/cli.js army  # run the built CLI (or `sa` after `npm link`)
```

## Commits

- Subject: `#<issue> <concise action>`, or `[F<n>] <concise action>` for local feature IDs (`[F0]` = repo bootstrap docs). Imperative mood. No `feat:` / `fix:` / `docs:` prefixes.
- End every commit message with the attribution trailer the session gives (`Co-Authored-By: Claude <model> <noreply@anthropic.com>`). Use the exact line from the session's reminder.
- Stage files by explicit path. Never `git add -A` or `git add .`: other agents leave untracked files in the working tree.
- Never force-push, `filter-branch`, or otherwise rewrite pushed history unless the user explicitly asks for it in that session.
- Enforced, not just asked: the `commit-msg` hook in `.githooks/` (turned on by `npm install`) rejects a wrong subject, and the `PR format` workflow checks every PR's title, body and commit subjects. If either rejects, fix the text. Never bypass with `--no-verify`.

## Pull requests

Follow `.github/pull_request_template.md` exactly.

- Title: `#<issue> <concise action>`.
- Body: one or two sentences on the resulting behavior and how it is implemented; a short `Validation:` line (checks run, results, material limitations); a `Tracking:` line with the issue and, for stacked work, the base branch; then the checklist.
- `gh pr create --body` skips the template file, so paste the template's checklist into the body yourself.
- Tick a checklist box only for something actually verified. Leave the rest unchecked and say why on the line.
- Put the detailed AC-to-evidence mapping and the limitations in a PR comment, not in the body.
- Use `Tracking: #N`. Never closing keywords (`closes`, `fixes`, `resolves`): they close issues on merge before acceptance is checked.
- The `PR format` check needs: a `#N`/`[F<n>]` title, `Validation:`, `Tracking:`, `Checklist:` with all 6 boxes, and no closing keyword. Edit the PR body to re-run it.
- Open as a draft unless all required evidence and human acceptance exist. End the body with the PR attribution line the session gives.
- Stacked work: base the PR on the previous feature branch and name it in `Tracking:`.

## Issues and merging

- Every feature gets an issue with acceptance criteria (AC1, AC2, ...) and the handoff block from `CONTRIBUTING.md`. Branch: `claude/<issue number>-<short-purpose>`.
- Codex reviews and merges. Claude does not merge, and does not close an issue by assertion.
- Close an issue only when its acceptance is actually complete, and record the exact acceptance scope. If something was not verified (POSIX, a real terminal), say so in a comment on the issue.
- Comment on the issue or PR at milestones (behavior, evidence, remaining work, blockers), not once per tool call.
- Do not generate a replacement feature when an issue closes.

## Working tree

- The working tree is shared with Codex, which checks out PR branches here. Run `git branch --show-current` and `git status` before starting work and before every commit.
- Do not commit files you did not write (for example `.review-*.md`).
- `.shadow/` (the Shadow Vault) is working memory and is never committed.

## Design rules to preserve

- Keep the orchestrator thin. Shadow Army routes work, tracks who owns what, and records history. Behavior that belongs to a model or a CLI stays there: before adding orchestration logic, check whether each CLI already has a flag, setting, event or output format for it, and pass that through instead of rebuilding it.
- Adapters stay isolated. Only briefs and reports cross between soldiers.
- Hard rules: Grok never reviews, `agy` never writes. They live in `src/core/assign.ts` and in each adapter's `capabilities`. A delegate file can only restrict an adapter, never grant it more.
- Routing policy (roles, cost, `forbidden`, `write`) lives in the front-matter of `orchestratorDelegate.md`; runtime settings (`cli`, `model`, `autonomy`) live in `shadow.config.json`. Both files must list the same soldiers.
- Writes need the build role and `--write`, and always happen in the soldier's own worktree under its claims.
- `autonomy` (supervised / auto / full) only chooses each vendor's own flags (see each adapter's `*Access`/permission-mode function). Commands are governed by the vendor at that level; Shadow Army never adds or removes a vendor safeguard on its own.
- With `auto` or `full`, a read-only task runs in a throwaway snapshot (its writes are discarded), and the checkout guard (`src/workspace/guard.ts`) fails any task during which something outside Shadow Army's `shadow/*` branches and worktrees changed. Keep both whenever autonomy is involved.
- `rules.md` (every soldier) and `agent.md` (`## <soldier>` sections) go into every brief, and `rules.md` into the Monarch's plan prompt. They are instructions; the guard and the claim audit are the parts that are enforced.
- The Monarch's own calls stay read-only whatever a soldier's autonomy.
- A Claude Code session's safety classifier refuses to launch soldiers in `full` mode. Do not try to work around that; leave live `full`-mode runs to the owner.
