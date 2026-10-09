# Native TypeScript 7 for Claude Code

This optional plugin gives a Claude Code session TypeScript/JavaScript navigation
and diagnostics from the TypeScript 7 compiler installed in its worktree.
It covers TS, TSX, JS, JSX, MTS, CTS, MJS and CJS. Attach it only to the sessions
where you want it; it does not install a marketplace plugin or edit Claude settings.

## Attach to one session

Install dependencies in the selected worktree first (`npm ci` for Shadow Army).
The worktree needs Node 20 or later on `PATH` and a local native `typescript@7`
installation, including its platform package. The plugin's own directory can live
in another checkout; the compiler and project files come from the session worktree.

PowerShell, starting in the selected worktree:

```powershell
$ts7Plugin = (Resolve-Path '.\plugins\typescript7-lsp').Path
claude --plugin-dir $ts7Plugin
```

On POSIX, starting in the selected worktree:

```sh
claude --plugin-dir "$PWD/plugins/typescript7-lsp"
```

If the plugin is in another checkout, supply its absolute path instead. Add your
usual Claude flags to either command. Each soldier starts its own Claude session
from its own worktree. Do not combine this with `--bare`, which disables LSP.

Before using it, check the loaded configuration:

```sh
claude plugin validate --strict /absolute/path/to/plugins/typescript7-lsp
claude --plugin-dir /absolute/path/to/plugins/typescript7-lsp plugin list --json
```

The list should include `shadow-army-typescript7@inline`, enabled with session
scope. These commands verify the configuration, without starting a model turn.
Disable another TypeScript LSP plugin for this session if it claims the same
extensions: Claude uses the first registered server for each extension.

## Compiler and process lifetime

Claude supplies `CLAUDE_PROJECT_DIR`; a direct launcher invocation uses its current
directory if that variable is absent. The launcher requires that root's local
`node_modules/typescript` and matching native platform package. Install dependencies
in each worktree. Startup never downloads a compiler or falls back to a global
compiler, TypeScript 6, or another checkout's dependencies.

Each launch starts one native `tsc --lsp --stdio` process with that root as its
working directory. A small protocol adapter asks for native document diagnostics
after open/change/save events and publishes the results to Claude. TypeScript 7
serves document errors through diagnostic requests; Claude Code 2.1.295 consumes
diagnostic notifications. Navigation requests go to the native server. The adapter
discards results superseded by later edits or a closed document. Changes to an
exported type also refresh diagnostics in open importing files; native refresh
requests refresh all open documents.

The server stays alive across individual requests and turns. Session shutdown,
input EOF, or termination of the launcher ends it. Startup and protocol failures
go to stderr, leaving stdout for LSP only; automatic crash restart is disabled.
Start a new session after correcting a startup failure or updating the compiler.

For v2, this process is a **session service**. C5's process-lifetime correction is
tracked separately in #69: a completed turn must not wait for the language server
to exit, and a turn's Stop action must preserve the service. The future SET-2
session launcher must pass this plugin only when the owner attaches it. The v2
post office is not implemented yet; this plugin is used directly through Claude.

## Verification and troubleshooting

`npm test` covers launcher/protocol failure behavior. `npm run test:lsp` uses the
installed native server to check TSX/NodeNext diagnostics after edits, definitions,
references, separate concurrent roots, paths containing spaces and shutdown.
CI runs both on Windows, Ubuntu and macOS.

Local configuration checks use Claude Code **2.1.295** and the native protocol
checks use TypeScript **7.0.2**. A protocol test client and Claude's manifest/loader
checks are separate evidence: they do not prove a live model-driven Claude turn.
Live Claude navigation and automatic diagnostic acceptance remain required before
this draft integration can be approved. See [issue #70](https://github.com/mogesjohnson/shadow-army/issues/70)
and its PR comments for current evidence.

For startup failures, run Claude with `--debug` and inspect its LSP messages and
the `/plugin` Errors tab. Missing local packages require dependency installation
in the selected root, including optional native packages. An extension-conflict
warning means a different enabled server owns the file type. For detailed manual
acceptance, edit a TSX file to introduce a type error, verify Claude receives the
native diagnostic, correct it, then check a definition and references. Close the
session and confirm its server exits.

References: [Claude LSP configuration](https://code.claude.com/docs/en/plugins-reference#lspservers),
[extension conflicts and protocol rules](https://code.claude.com/docs/en/plugins/components#lsp-servers),
and [Microsoft's native TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
