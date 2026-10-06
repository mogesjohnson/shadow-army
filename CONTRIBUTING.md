# Contributing to Shadow Army

Shadow Army is built one feature at a time. Every change has an issue, a branch, and a focused pull request.

## Ground rules

- **One feature, one issue, one PR.** Keep PRs focused. Stacked work names its required base branch.
- **Soldiers stay isolated.** No adapter may read another soldier's transcript or private Vault directory. Only briefs and reports cross the boundary.
- **Thin orchestrator.** Shadow Army routes work, tracks who owns what, and records history. Behavior that belongs to a model or a CLI stays there. Before adding orchestration logic, check each CLI for a flag, setting, event or output format that already does it, and pass that through instead of rebuilding it.
- **Hard rules are code.** Routing rules in `orchestratorDelegate.md` (Grok never reviews, `agy` never writes) must be enforced by the router, not just documented.
- **Cross-platform.** Windows and POSIX paths and shells both work.

## Branches

`<agent-or-author>/<issue-number>-<short-purpose>`, for example `claude/12-vault-locks`. State the base branch in the issue and PR. For stacked work the base is the previous feature branch.

## Pull requests

Title: `#<issue> <concise action>` or `[F<n>] <concise action>`.

The PR template (`.github/pull_request_template.md`) asks for:

1. **Behavior:** one or two sentences on the resulting behavior and how it is implemented.
2. **Validation:** checks run, results, and any material limitation.
3. **Tracking:** the issue or local feature ID. For stacked work, the required base branch.
4. **Checklist:**
   - [ ] Adapters stay isolated (no context leaks between soldiers).
   - [ ] Hard routing rules are enforced and tested.
   - [ ] Both the dashboard and `--plain` output work for any UI change.
   - [ ] Paths and shell calls work on Windows and POSIX.
   - [ ] `npm run build`, `npx tsc --noEmit`, and `npm test` pass.

Leave the PR as a **draft** while required evidence or human acceptance is missing.

## Issue handoff block

Every implementation issue ends with:

```
Branch: <author>/<actual issue number>-<short-purpose>; base <specified branch>.
Push a focused PR. Map each AC ID to evidence and state any unresolved item plainly.
Leave the PR draft when required evidence or human acceptance is still missing.
Codex reviews and merges; Claude does not merge or close the issue by assertion.
```

## Tracking progress

- Record progress on the issue or PR at **milestones**: implemented behavior, evidence, remaining work, blockers. Do not post one update per tool call.
- A long-session checkpoint keeps: issue URL, branch/head, changed files, decisions, tests and results, blockers, and the next concrete action.

## After merge

- Verify GitHub's merged state and commit.
- Update or close the issue only when its acceptance is actually complete. Record the exact acceptance scope; for example, "minimum basic playability" is not "all future scenarios passed".
- Keep any inventory or proposal status consistent.
- Do not automatically generate a replacement feature when an issue closes.

## Adding a soldier

Implement the `Adapter` interface (`src/adapters/Adapter.ts`), declare its capabilities (`write`, `review`), add its `cli` and `model` to `shadow.config.json`, and add its roles and rules to the front-matter of `orchestratorDelegate.md`. Both files must list the same soldiers, and a misspelled rule key is an error. A rule in the delegate file can only restrict an adapter, never grant it more than its declared capabilities. Describe its strengths and weaknesses in the prose below the front-matter. Preview the effect with `sa route --role <role>`. `sa adapter new <name>` will scaffold this once F9 lands.

## Development

```bash
npm install
npm run build
npm test
```
