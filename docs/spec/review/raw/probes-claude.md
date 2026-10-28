# Windows short probes, claude: P-3, P-11, P-12, P-13, P-15 (Sonnet, high; 2026-10-28, session 14; prompt drafts/probes/PROMPTS.md, agent A)

# Claude probes (P-3, P-11, P-12, P-13, P-15)

Note: REPORT.md was NOT saved. The Write tool refused ("Subagents should return findings as text, not write report files"), and I did not work around it. This message is the full report.

claude --version: `2.1.312 (Claude Code)`. Binary: `C:/Users/johns/.local/bin/claude.exe`.
Scratch `<S>` = `C:/Users/johns/AppData/Local/Temp/claude/C--Users-johns-projects-AIConnections/dfd3edf8-17d1-4fde-ab77-1887c0cb904c/scratchpad/probes/claude`. Drivers: `<S>/lib.mjs`, `p3.mjs`, `p11.mjs`, `p12.mjs`, `p12b.mjs`, `p13.mjs`, `p13b.mjs`, `p13c.mjs`, `p15.mjs`. Raw NDJSON logs (`{t, dir:in|out, line}`) are in `<S>/p3`, `p11`, `p12`, `p12b`, `p13`, `p13-try1`, `p13b`, `p13c`, `p15`, each with a `summary.json`.

**Common setup.** Every process was spawned by `lib.mjs` with `claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode plan --model haiku` plus the extra flags named per probe. The cwd was a throwaway `git init` repo with one commit. The child environment had every `CLAUDE_CODE_*`, `CLAUDECODE`, `AI_AGENT`, `CLAUDE_PID` and `CLAUDE_EFFORT` variable removed, so there was no `CLAUDE_CODE_PLUGIN_DIRS`. Each process had a 120 s watchdog (`taskkill /t /f /pid`). User settings were never edited. The md5 of `~/.claude/settings.json` was `6565a5ad8d8ee46f45619e7b5dda3abb` before and after P-13.

**Model.** `--model haiku` makes `system/init` say `"model":"claude-haiku-5-5"`. But every `assistant` event says `"model":"claude-sonnet-5-5"`, and `modelUsage` has only `claude-sonnet-5-5`. So these runs were not on the cheapest model. I did not investigate further.

---
## P-3: do disabled plugins still load? (R-F-28, SET-2)

**Installed per `claude plugin list`:**
- `cockpit@inline`: session-only, path `~/.claude/mods/cockpit`, loaded.
- `cowork-plugin-management@synced`: already disabled.
- `~/.claude/plugins/` holds no marketplace-installed plugin.

**Commands.** Both runs used the base launch, cwd = throwaway repo. The second run added:
`--settings '{"enabledPlugins":{"anthropic-skills@inline":false,"cowork-plugin-management@inline":false,"cowork-plugin-management@synced":false,"cockpit@inline":false,"shadow-army-typescript7@inline":false}}'`

**Observed** (`p3/summary.json`, `p3/plain.ndjson`, `p3/disabled.ndjson`):

| field | plain | with enabledPlugins false |
|---|---|---|
| tools | 55 | 55, identical list |
| mcp_servers | rea, trace-computer (source `user`), 7 `claude.ai *` (source `claudeai`) | identical |
| slash_commands | 84 (incl. `cockpit`) | 83 (no `cockpit`) |
| skills | 47 | 47, identical |
| agents | claude, Explore, general-purpose, Plan, statusline-setup | identical |
| plugins | `{"name":"cockpit","path":"C:\\Users\\johns\\.claude\\mods\\cockpit","source":"cockpit@inline"}` + 3 builtin | 3 builtin only: `cc-plugin-agents-md@builtin`, `cc-plugin-telemetry@builtin`, `cc-plugin-plugin-authoring@builtin` |
| hook events | `hook_started` / `hook_response` `SessionStart:startup` | same |

- `~/.claude/settings.json` itself has `"env":{"CLAUDE_CODE_PLUGIN_DIRS":"C:/Users/johns/.claude/mods/cockpit"}`. So even with no variable in the process environment, the plain run loaded `cockpit@inline`: the settings `env` block re-injects it.
- `enabledPlugins:false` on the command line dropped `cockpit` from `plugins` and removed its `cockpit` slash command. That is the only difference between the two runs.
- The SessionStart hook in both runs is the user's own `hooks` entry in `settings.json` (`session_start_brief.py`), not a plugin hook. `--settings` does not remove it.
- Fifteen `anthropic-skills:*` slash commands (`:docs`, `:pdf`, ...) are present in both runs, although `anthropic-skills@inline` was `false`. They come from `~/.claude/skills/synced/<id>/`, which are user-level skills, not a plugin.
- The three `@builtin` plugins stay loaded.

**Verdict:** with that `--settings`, no installed plugin's tool, command, skill, agent, hook or MCP server still loads; the one plugin, `cockpit`, was fully dropped. The soldier still gets the user's own settings-level hooks, user skills (including the synced `anthropic-skills:*`), user MCP servers and the three builtin plugins. A user `settings.json` `env.CLAUDE_CODE_PLUGIN_DIRS` re-adds plugins, so an empty process environment is not enough; `enabledPlugins:false` does override it.

**Limits:** only one non-synced plugin existed, and it is a mod with no tool, agent or MCP server of its own. So a disabled plugin's tool/agent/MCP was not exercised beyond the field comparison. Plugin hooks were not exercised.

---
## P-11: cost totals across an interrupt (R-M1-75, CH-2)

**Command:** base launch plus `--include-partial-messages`, one process, log `p11/session.ndjson`. Turns:
1. "Count from 1 to 400, one number per line. Nothing else."
2. "Now count from 1 to 3000 ..." interrupted 1.5 s after the first `content_block_delta` with `{"type":"control_request","request_id":"p-1","request":{"subtype":"interrupt"}}`.
3. "Reply with just: ok".

**Interrupt reply:** `{"type":"control_response","response":{"subtype":"success","request_id":"p-1","response":{"still_queued":[]}}}`. Then `{"type":"user",..."[Request interrupted by user]"}` and `result/success` (`stop_reason:"end_turn"`, `is_error:false`, `result:""`, `num_turns:2`).

| result | total_cost_usd | usage (per result) | modelUsage claude-sonnet-5-5 |
|---|---|---|---|
| 1 (400 lines) | 0.0728679 | in 2, out 903, cache_read 14459, cache_create 15597 | in 2, out 903, cr 14459, cc 15597, costUSD 0.0728679 |
| 2 (interrupted) | 0.0728679 (unchanged) | in 2, out 0, cr 30056, cc 13150, `iterations: []` | identical to result 1 |
| 3 ("ok") | 0.0787685 | in 2, out 4, cr 43206, cc 384 | in 4, out 907, cr 57665, cc 15981, costUSD 0.0787685 |

**Verdict:** nothing is zeroed or restarted. `total_cost_usd` and `modelUsage` keep accumulating across the interrupt: result 3 equals result 1 plus only turn 3. `usage` is per turn (result 3 shows only its own 384 created tokens). The interrupted turn's own cost and tokens are in neither running total: result 2 equals result 1, and result 3's `modelUsage` adds only turn 3 (out 903+4, cr 14459+43206). So the host cannot treat result 2 as zero or as a restart, and it under-counts the interrupted turn.

**Limits:** one interrupt, after about 146 deltas. Result 2's `usage` is odd (`output_tokens:0`, `cr 30056`, `iterations:[]`), so interrupted-turn usage is not reliable.

---
## P-12: auto-memory in a linked worktree (D-19, R-M1-82, M1-AC14)

**Setup.** `p12.mjs` ran in plan mode (the base launch). `p12b.mjs` is identical but with `--permission-mode acceptEdits`, because plan mode blocks writes. Repo R has one commit, and `git worktree add W -b wt`. A short `claude -p` in R and in W gave each folder's `system/init` `memory_paths.auto`.

**Discovery** (`p12/summary.json`): R and W get the SAME memory folder, R's: `C:/Users/johns/.claude/projects/<R-path-dashed>-p12-R/memory/` for both `cwd=R` and `cwd=W` (`"sameFolder": true`). W also gets its own project folder `...-p12-W` under `~/.claude/projects/`, but it holds only `.jsonl` transcripts and no `memory/` dir.

I seeded R's folder with `MEMORY.md` = `Canary: the password is PURPLE-TAPIR-42.` and reset it to that one file before each of (a), (b), (c). Prompts in W: "What does your memory say the password is?" then "Remember that my favourite colour is teal."

**(a) plain, cwd W**
- Plan mode: `My memory says the password is **PURPLE-TAPIR-42**. It's listed as a "Canary" entry in MEMORY.md.` The write was refused: `I haven't saved it. Plan mode is active...`. The folder was unchanged.
- acceptEdits (`p12b`): the same read answer. Tool calls: `Read` of R's `memory\MEMORY.md`, `Glob` (denied), `Write` `...-p12b-R\memory\favourite-colour.md`, `Edit` of `MEMORY.md`. Folder after: `favourite-colour.md` ("The user's favourite colour is teal.") and `MEMORY.md` = `Canary: the password is PURPLE-TAPIR-42.\n- [Favourite colour](favourite-colour.md) — user's favourite colour is teal`.

**(b) `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in the environment plus `--settings '{"env":{"CLAUDE_CODE_DISABLE_AUTO_MEMORY":"1"}}'`**
- `system/init` has no `memory_paths` field at all.
- Answer: `I don't have a password in my context...`.
- Second prompt (acceptEdits): `I can't keep it beyond this session ... I don't have a memory store`.
- Folder after: only the canary line, in both modes.

**(c) as (b), plus R's committed `.claude/settings.json` = `{"autoMemoryEnabled":true,"env":{"CLAUDE_CODE_DISABLE_AUTO_MEMORY":"0"}}` (merged into W, `c_W_has_settings:true`), the process started with the variable at `0`, still with (b)'s `--settings` (value `1`)**
- No `memory_paths` in init, password unknown, no write, folder unchanged, in both modes.

**Verdict:** a `-p` soldier in a linked worktree loads R's `MEMORY.md`. When the mode allows edits it writes into R's shared memory folder (a new file and an edit to `MEMORY.md`), not a per-worktree folder. (b)'s pair of `--settings` env plus process env switches it fully off (not read, not written). It stays off under (c): the committed `autoMemoryEnabled:true` and env `"0"`, and the process env `0`, did not re-enable it while `--settings` set `1`.

**Limits:** in (c) the `--settings` value won. I did not test which of the three layers alone suffices, nor `autoMemoryEnabled` alone. The owner's user-settings part of M1-AC14 was not tested, as instructed. Plan-mode soldiers cannot write memory at all (the model refuses), so the write path exists only in edit-allowing modes.

---
## P-13, claude: files from a read-only turn, and "don't ask again" (D-7, option A)

**Part 1** (`p13/`, base launch, plan mode): "List the files here and say what they are." It ran `Bash` `ls -la`. Before and after were identical:
- files = `["README.md (12b)"]`
- `git status --porcelain --ignored` empty
- `.git` entries `COMMIT_EDITMSG,HEAD,config,description,hooks,index,info,logs,objects,refs`
- no `.claude/`

Outside the repo, the session only writes its transcript under `~/.claude/projects/<cwd>/`.

**Part 2, try 1** (`p13-try1/`): `--permission-mode default --permission-prompts host --permission-prompt-tool stdio`, prompt "Run the shell command `git status`...". No `can_use_tool` request came: `git status` is auto-allowed as read-only. It ran, `permission_denials:[]`, and no file was written. For the retry I changed one thing, the command, to `node -e "console.log(42)"`.

**Part 2, try 2** (`p13b/`): request received:
`{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"node -e \"console.log(42)\"",...},"permission_suggestions":[{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"node -e \"console.log(42)\""}],"behavior":"allow","destination":"localSettings"}],"decision_reason":"This command requires approval","decision_reason_type":"other"}`

I answered `{"behavior":"allow","updatedInput":<input>,"updatedPermissions":<that suggestions array>}`, only for that command. It printed `42`. A second identical request in the same session ran with no new `can_use_tool`, so the rule applied.

**Where saved:** `<repo>/.claude/settings.local.json` (94 bytes, new `.claude/` dir):
`{"permissions":{"allow":["Bash(node -e \"console.log\\(42\\)\")"]}}` (pretty-printed in the file).
- `~/.claude/settings.json` is unchanged and no user `settings.local.json` appeared. No `<repo>/.claude/settings.json` was created.
- `git status --porcelain --ignored` showed `!! .claude/` only because the owner's global gitignore (`~/.config/git/ignore`, dated Oct 1, containing `**/.claude/settings.local.json`) ignores it. Without it the file would show as untracked.

**Worktree check** (`p13c/`, same flow with cwd = linked worktree W of R): same suggestion (`destination:"localSettings"`). The file was written to `W/.claude/settings.local.json`, and R got no `.claude/`.

**Verdict:** claude writes no files of its own into the folder during a read-only turn. "Don't ask again" saves its rule in the working directory's own `.claude/settings.local.json`, i.e. the worktree's, not the main repo's. Each worktree therefore gets its own untracked file, hidden only by the owner's global gitignore.

**Limits:** `git status` never prompts, so the asked command was replaced by `node -e`. Part 1 only ran a read-only `ls`.

---
## P-15, claude: mode switch and ExitPlanMode (R-F-122, R-M1-93, M6-AC17; SES-6)

**Commands:** base launch; part 2 adds `--permission-prompts host --permission-prompt-tool stdio`. Logs: `p15/part1.ndjson`, `p15/part2.ndjson`.

**(1) Part 1, plan mode**
- Turn 1 "Create a file named a.txt containing the word hi": no a.txt. It wrote the plan file `C:\Users\johns\.claude\plans\create-a-file-named-parallel-otter.md` (allowed in plan mode) and said `I haven't created a.txt, because plan mode is active and blocks file creation.` `permission_denials: []`.
- Sent `{"type":"control_request","request_id":"p-1","request":{"subtype":"set_permission_mode","mode":"acceptEdits"}}`. Reply: `{"type":"control_response","response":{"subtype":"success","request_id":"p-1","response":{"mode":"acceptEdits"}}}`. Also `{"type":"system","subtype":"status","status":null,"permissionMode":"acceptEdits"}`, and the next `system/init` has `"permissionMode":"acceptEdits"`.
- Turn 2: `Write a.txt` ran with no prompt; content `hi`.

**(2) Part 2, plan with stdio**
- After writing a plan file it called `ToolSearch select:ExitPlanMode` (the tool is loaded on demand), then `ExitPlanMode`. That arrived as `can_use_tool` (`tool_name:"ExitPlanMode"`, `input.plan`, `input.planFilePath`, no suggestions). Allowed with `{"behavior":"allow","updatedInput":<input>}`.
- Tool result: `User has approved your plan. You can now start coding.` Then `{"type":"system","subtype":"status","status":null,"permissionMode":"default"}`. So the session left `plan`, but to `default`, not `acceptEdits`.
- The following `Write b.txt` came as `can_use_tool` with `permission_suggestions:[{"type":"setMode","mode":"acceptEdits","destination":"session"}]`. I allowed it; b.txt = `hi`.
- The next turn's init says `permissionMode:"default"`, and a Write of `c.txt` asked again (I denied it).

**Cache (per API call, cache_read / cache_creation):**
- Part 1, turn 1: 14459 / 14656, then 29115 / 13767. After the switch, turn 2: 14459 / 28781, then 43240 / 365.
- Part 2, before ExitPlanMode: 16007 / 18132, then 34139 / 11050. After ExitPlanMode: 16007 / 29743, then 45750 / 398, 46148 / 171, 46319 / 103.
- For comparison, P-11 with no mode change grew normally (43206 / 384).

**Verdict:** CH-11's switch works in a stream-json `-p` session as written. `set_permission_mode` replies `{mode}` and is visible in `system/status` and the next `init`. ExitPlanMode arrives as a `can_use_tool` and, when allowed, leaves `plan`. But a plain allow lands in `default`, not `acceptEdits`, so the next write still asks unless the host also sets the mode. A mode change does reset the prompt cache. The first call after each change read only the static prefix (14459 or 16007 tokens) and re-created everything after it (28781 and 29743 tokens), where the earlier turn text had been cached.

**Limits:** one run per case. In part 2 the drop also coincides with the on-demand ExitPlanMode tool load, which changes the tool set. In part 1 the tool set was unchanged and the drop still happened, which points to the mode change. Passing the `setMode` suggestion back as `updatedPermissions` on ExitPlanMode was not tried. Plan mode writes plan files to the user-level `~/.claude/plans/`.

---
## Cleanup (done)

- Removed all throwaway repos and worktrees, the seeded memory folder, and every `~/.claude/projects/*scratchpad-probes-claude*` folder my runs created. The `~/.claude/projects` listing is identical to the baseline taken before the runs (`<S>/projects-baseline.txt`).
- Removed the two `~/.claude/plans/*.md` files my P-15 runs created. Only the owner's `jolly-rolling-dewdrop.md` remains there.
- Kept in `<S>`: scripts, `*.ndjson` logs, `summary.json` files, `p12.out.txt`, `p12b.out.txt`, `p15.out.txt`.
- The `rm -rf` on `~/.claude/projects` ran only against folders matching `*scratchpad-probes-claude*`. No user settings, memory or project file was touched.
