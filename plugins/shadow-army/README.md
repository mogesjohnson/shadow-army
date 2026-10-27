# Shadow Army M1 mod

Build the repository with `npm run build`, then load this directory from the
repository root with `claude --plugin-dir ./plugins/shadow-army`. Node must be on
the host's PATH. This plugin uses Claude Code's native function-hook API; it does
not add a model tool or a pane.

- `/army` lists the configured soldiers and starts the post office on first use.
- `/army open Kaisel` opens the configured Claude soldier's persistent session.
- `/army inspect Kaisel` shows its configuration and state.
- `/army stop Kaisel` asks its native channel to stop the running turn.

Use a shadow name or a configured soldier key. M1 opens Claude channels only.
Sending briefs, other adapters and the pane arrive in later milestones.

The mod keeps its random Monarch credential in its private module environment.
It passes the credential and current Claude session id once over the relay's
standard input. The relay's private standard output carries events; authenticated
commands use its loopback endpoint. No credential is stored in plugin state,
plugin configuration, files, environment variables or process arguments.

A five-second callback renews the helper's session lease. This interval is a
Shadow Army setting, not a vendor cache or lifecycle guarantee. Ending the Claude
session cancels renewals before requesting release. `/clear` and `/resume` end the
old lease; the next army command reads the new session id and starts a new helper.
The helper handles full cleanup independently of the native session-end hook's
short deadline. Reloading/unloading the mod cancels its native child stream and
timers; the detached helper must then finish through its independent lease or
caller-loss cleanup.

The API was checked against the reference embedded in installed Claude Code
2.1.296. Static plugin validation does not establish live HOST-2 acceptance or
provider parity. Acceptance must verify first-use startup, subsequent reuse,
normal exit, clear/resume, mod reload/unload and abrupt host loss, including
cleanup of opened soldiers and release of the folder lock.
