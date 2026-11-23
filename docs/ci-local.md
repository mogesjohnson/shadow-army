# Local CI

GitHub's workflows are off, so `npm run ci:local` runs the repository's checks on this machine: first on Windows, then on Linux inside WSL.

```bash
npm run ci:local                          # Windows, then WSL Ubuntu
npm run ci:local -- --windows-only
npm run ci:local -- --linux-only
npm run ci:local -- --setup-wsl           # install Node in WSL (once)
npm run ci:local -- --distro <name>       # a WSL distro other than Ubuntu
```

Run it from the checkout you want to test; `node <path>/scripts/ci-local.mjs` from inside another worktree tests that worktree.

## What it checks

Per platform, one line each, in the form `[platform] check: status - command: summary`:

| Check | Command | Pass means |
| --- | --- | --- |
| install | `npm ci` | runs only when `node_modules` is missing or `package-lock.json` changed |
| tsc | `npx tsc --noEmit` | exit 0 |
| build | `npm run build` | exit 0 |
| test | `npm test` | vitest's own `Tests` line shows passes and no failures |
| coverage | `npm run test:coverage` | the vitest `Lines` summary is present and the 85% threshold is not reported missed |

A zero exit code without vitest's summary lines counts as a failure. If the commit has no `test:coverage` script, coverage is `not_run`. The last line is `ci:local PASS` or `ci:local FAIL`, and the exit code is non-zero on any failure. These lines can go into a PR's `Validation:` line.

## Windows and Linux

- **Windows** runs in the checkout itself.
- **Linux** runs in `~/ci/shadow-army` inside WSL, on its own filesystem and its own `node_modules`. The script fetches the current commit from the Windows repository and checks it out there. **Uncommitted changes are not included**; the output says so when the tree is dirty.
- `--setup-wsl` downloads the Node release matching the Windows `node --version` from nodejs.org into `~/.local/node` in WSL. It needs `curl` and `tar`, uses no `sudo` and changes no apt packages. Repeating it is harmless.

## Logs

Each run writes `.shadow/ci/<time>-<sha>.log` (never committed) with the commit, branch, Node version and every check line.

## Not covered

macOS is dropped (the owner, 2026-11-23). On Windows, long test runs can hit vitest's timeouts under load: rerun the failing file alone before calling it a failure.
