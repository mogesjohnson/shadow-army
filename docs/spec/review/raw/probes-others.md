# Windows short probes, codex, grok, agy: P-1, P-2, P-13, P-15 (Sonnet, high; 2026-10-28, session 14; prompt drafts/probes/PROMPTS.md, agent B)

# Live probes: codex, grok, agy (Windows 11, 2026-10-28)

**REPORT.md was not saved.** The Write tool refused it ("Subagents should return findings as text, not write report files"). I did not work around that with Bash. This message is the full report. Please save it as `<scratch>\REPORT.md` if you need the file.

Scratch (S): `C:/Users/johns/AppData/Local/Temp/claude/C--Users-johns-projects-AIConnections/dfd3edf8-17d1-4fde-ab77-1887c0cb904c/scratchpad/probes/others`

Versions: `codex --version` = `codex-cli 0.160.0`; `grok --version` = `grok 1.0.70 (f50904eaee6c) [stable]`; `agy --version` = `1.4.7`.

Every probe ran in its own `git init` repo with README.md and hello.js committed, under S. Every CLI process had a hard watchdog (taskkill /t /f after 100-150 s). No `bypassPermissions`, `--dangerously-*`, `danger-full-access` or `--yolo` was used. `~/.grok/config.toml` is byte-identical before and after (md5 1975476262495c5d547ebcd19d14322e). `~/.codex/config.toml` was not touched.

Helpers: `S/lib.mjs` (client plus watchdog), `S/outside.mjs` (files outside the repo changed since a time, and whether they name the repo), `S/mkrepo.sh`. Raw logs are in `S/P1`, `S/P2`, `S/P13` and `S/P15`; each `*-summary.json` is the digest. The codex schema is in `S/schema/`.

---

## Environment finding that affects P-1 and P-15 (grok)

`~/.grok/config.toml` has `permission_mode = "always-approve"`. Under it, `grok agent stdio` never sends `session/request_permission`. P-1 run 1 (`S/P1/p1-perm.json`, repo `S/P1/repo-run1`) resolved the permission in 2 ms and wrote the file:

    6265 {"method":"_x.ai/session_notification","params":{"update":{"sessionUpdate":"pending_interaction","tool_call_id":"call-dd97...-0","kind":"permission"}}}
    6267 {"method":"_x.ai/session_notification","params":{"update":{"sessionUpdate":"interaction_resolved","tool_call_id":"call-dd97...-0"}}}
    6274 ... "sessionUpdate":"tool_call_update" ... "status":"completed" ... "newText":"hi\n"

That was the host's own setting, not a bypass flag I chose, and it wrote only into the throwaway repo. For the real run I sent the slash command `/always-approve off` as a `session/prompt`. It is session-only and the config md5 did not change.

Spec implication: a host that spawns grok must switch approvals on inside the session. Otherwise it inherits the user's `permission_mode`, and every write can be auto-approved without a prompt.

---

## P-1 (grok): pending permission, `session/cancel`, then the `cancelled` outcome

Commands:
- `APPROVE_OFF=1 node S/P1/s6-grok-p1.mjs perm <S/P1/repo> <S/P1/p1-perm-run2.json>`. This is a copy of `s6-grok.mjs` that sends `/always-approve off` first and adds a watchdog.
- It spawns `C:/Users/johns/.grok/bin/grok.exe agent --no-leader stdio`, with no server key and the config default model `grok-4.7`.
- Prompt: "Create a file named s6.txt in the current folder containing the word hi. Do nothing else."

Observed (raw lines, trimmed). Id 4 is the prompt and id 0 is the permission request:

    1351 > session/prompt id 3 text "/always-approve off"   -> 1581 result {"stopReason":"end_turn"}
    1581 > session/prompt id 4 "Create a file named s6.txt ..."
    5034 < {"id":0,"method":"session/request_permission","params":{"toolCall":{"kind":"edit","title":"Write `...\\P1\\repo\\s6.txt`"},"options":[allow-edits-session:allow_always, allow-once:allow_once, reject-once:reject_once]}}
    7041 > {"method":"session/cancel","params":{"sessionId":"01a183c7-..."}}
    7045 < {"method":"_x.ai/session_notification","params":{"update":{"sessionUpdate":"interaction_resolved","tool_call_id":"call-e795..."}}}
    7051 < {"update":{"sessionUpdate":"turn_completed","stop_reason":"cancelled","usage":{"inputTokens":23569,"cachedReadTokens":1664,...}}}
    7052 < {"method":"_x.ai/session/prompt_complete","params":{"stopReason":"cancelled","cancellationCategory":"MidTurnAbort"}}
    7052 < {"id":4,"result":{"stopReason":"cancelled", ...}}
    10044 > {"id":0,"result":{"outcome":{"outcome":"cancelled"}}}       (sent 3 s AFTER the turn had ended)
    11545 > session/prompt id 5 "Did you create s6.txt? Answer yes or no, in one word, without using any tools."
    15010 < {"id":5,"result":{"stopReason":"end_turn", "cachedReadTokens":23552 ...}}   reply: "no"

Summary fields: `endedBeforePermissionAnswer: true`, `firstStop: "cancelled"`, `secondStop: "end_turn"`, `secondReply: "no"`, `fileExists: false`. The repo listing afterwards is README.md and hello.js only.

**Verdict: YES.** With approvals on, `session/cancel` during a pending `session/request_permission` ends the turn with `stopReason` `cancelled`. The agent resolves its own pending interaction and does not wait for the client's `cancelled` answer. That answer arrived 3 s late and caused no error. Nothing was written, and the same session answered the next prompt with its context.

**Limits:**
- One clean run.
- Answering the permission before the cancel was not tested.
- Model was grok-4.7.
- Approvals had to be switched on first (see the environment finding).

---

## P-2 (agy): interrupt, or "kill the tree and resume by id"

`agy --help` (1.4.7) shows no interrupt or cancel option. The relevant flags are:
- `--continue/-c`
- `--conversation <id>`
- `--print-timeout` (a time limit, not an interrupt)
- `--mode accept-edits|auto|plan`
- `--input-format stream-json`

There is no subcommand for interrupting.

**Interrupt attempt.** Command: `AGY_MODEL=gemini-3.8-flash-low node S/agy-drv.mjs S/P2/repo S/P2/interrupt.json p2`. It runs `agy.exe --input-format stream-json --output-format stream-json --mode plan --model gemini-3.8-flash-low` as one long-lived process.
- Turn 1: "Remember the codeword PINEAPPLE-42. Reply with just: ok".
- Turn 2: "Write a 700-word story ... no tools".
- Mid-turn 2, with text deltas flowing, I sent these lines 2.5 s apart: `{"event":"interrupt"}`, `{"event":"cancel"}`, `{"event":"stop"}`, `{"event":"abort"}`, then `{"event":"control_request","request_id":"i1","request":{"subtype":"interrupt"}}`.
- The first four got no stdout reply and the deltas kept flowing. stderr from `S/P2/interrupt.json`:

        warning: ignoring unsupported stream input message event "interrupt"
        warning: ignoring unsupported stream input message event "cancel"
        warning: ignoring unsupported stream input message event "stop"
        warning: ignoring unsupported stream input message event "abort"
        error: stream input message event "control_request" is not supported yet

- The turn ran to its end (16.3 s, 4575-char response, `status SUCCESS`).
- A second `result` followed with `"status":"ERROR","error":"stream input message event \"control_request\" is not supported yet"`. The process exited with code 2.
- A user line `/stop` sent mid-turn in the kill run also changed nothing.

**Kill and resume.** Command: `node S/agy-kill.mjs S/P2/repo S/P2/kill.json`.
- Turn 1 is the same. The conversation id `40666cf2-acf5-4b39-86de-0eb2c02aa730` comes from the `init` event and the `result`.
- Turn 2 asks for a story that must start with the word MARIGOLD.
- After 1.5 s of deltas (1619 chars streamed) I ran `taskkill /t /f /pid 60640`:

        SUCCESS: The process with PID 60016 (child process of PID 60640) has been terminated.
        SUCCESS: The process with PID 60640 (child process of PID 69112) has been terminated.
        exit {"code":1}, kill took 585 ms

- agy has a child process, so the tree kill is needed.
- I resumed with `agy.exe --input-format stream-json --output-format stream-json --mode plan --model gemini-3.8-flash-low --conversation 40666cf2-...`. The prompt was "What was the codeword I asked you to remember in my first message? And what word did I ask my second message's story to start with? Answer in one short line."

        init conversation_id = 40666cf2-acf5-4b39-86de-0eb2c02aa730
        {"event":"result","result":{"status":"SUCCESS","response":"The codeword was PINEAPPLE-42, and the starting word was MARIGOLD.\n","num_turns":3}}

**Verdict:** agy has NO interrupt over stream-json. Event names it doesn't know are ignored with a stderr warning, and `control_request` is fatal ("not supported yet"). So it is "end the process tree (`taskkill /t /f`) and resume with `--conversation <id>`". The resume keeps turn 1 and also the user message of the killed turn 2. The half-written assistant text was not needed. The repo stayed unchanged.

**Limits:**
- Windows only.
- The interrupt names I tried are guesses. An undocumented one may exist, but nothing in `--help` or stdout names one.
- Plan mode, flash-low model.
- I did not test the kill during a tool call or a permission wait.
- `cache_read_tokens` was 0 on the resumed turn.

---

## P-13: files each CLI writes by itself on a read-only turn ("List the files here and say what they are")

Method per CLI: a new repo; a full listing (`.git` contents skipped) and `git status --porcelain --ignored` before and after; `S/outside.mjs <since> <repo path> <roots>` for files elsewhere modified since the start.

**All three created or changed zero files in the repo.** The listing before and after is README.md (8b) and hello.js (18b), and git status was empty both times. grok's `signals.json` is not in the repo; it is under grok's home (below).

**codex** (`codex app-server`, `thread/start` approvalPolicy `never`, `turn/start` `sandboxPolicy {"type":"readOnly"}`, gpt-5.6-luna, effort low)
- Command: `node S/p13-codex.mjs S/P13/codex-repo S/P13/codex.json`.
- The turn completed. It ran two PowerShell read commands (`rg --files`, `Get-ChildItem -Force`) and listed both files.
- Files outside the repo that name it:
  - `C:/Users/johns/.codex/sessions/2026/10/28/rollout-2026-10-28T14-41-58-01a183d1-a87b-7d41-bb04-6a13debfe49f.jsonl` (95 KB). The `thread/start` response returns this path as `thread.path`.
  - `.codex/.sandbox/sandbox.2026-10-28.log`
  - `.codex/state_5.sqlite-wal`
  - `.codex/thread_history_1.sqlite-wal`
  - `.codex/logs_2.sqlite-wal`
- Also touched but not naming the repo: `.codex/.sandbox/deny_read_acl_state.json`, `cache/codex_apps_*`, `models_cache.json`, `plugins/cache/...`.

**grok** (`grok agent --no-leader stdio`, `/always-approve off` first, any permission would be rejected)
- Command: `node S/p13-grok.mjs S/P13/grok-repo S/P13/grok.json`.
- `session/new` result keys are `sessionId, models, configOptions, _meta`. There is no `modes`, so this ran in the default mode. configOptions are `model` and `reasoning_effort`.
- The turn ended `end_turn` with tools `list_dir` and `read_file` x2, and 0 permission requests.
- Files outside the repo, in `C:/Users/johns/.grok/sessions/C%3A%2F...%2FP13%2Fgrok-repo/01a183ca-be78-7e92-a4ec-bb5f9c9e04bb/`:
  - `announcement_state.json`, `chat_history.jsonl`, `events.jsonl`, `prompt_context.json`, `resources_state.json`, `rewind_points.jsonl`
  - `signals.json`, `summary.json`, `system_prompt.txt`, `title_refresh_idx`, `tool_definitions.json`, `updates.jsonl`, `usage.json`
  - their `.lock` files
- Also: `sessions/<encoded cwd>/prompt_history.jsonl`, `sessions/session_search.sqlite`, `models_cache.json`, `settings_cache.json`.
- So `signals.json` lives in `~/.grok/sessions/<encoded cwd>/<session>/`.

**agy** (stream-json, `--mode plan`, gemini-3.8-flash-low)
- Command: `node S/p13-agy.mjs S/P13/agy-repo S/P13/agy.json`.
- The result was SUCCESS with step types `user_input, agent_response, tool, subagent`. It listed README.md and noted that shell execution was unavailable.
- Files outside the repo, under `C:/Users/johns/.gemini/antigravity-cli/`:
  - `brain/<convId 4899f94d-f346-4e04-bf3c-0f5bdf2d40b8>/.system_generated/logs/{transcript.jsonl, transcript_full.jsonl, chunks/...}`
  - `.../steps/12/output.txt` and `.../steps/14/output.txt`
  - `conversations/<convId>.db`, `annotations/<convId>.pbtxt`, `conversation_summaries.db`, `jetbox_summaries_proto.pb`
  - `cache/last_conversations.json`, `cli.log`, `log/cli-20261028_144852.log`
  - `presence/<convId>.lock`, `implicit/*.pb`, `crashes/crash_*.log` (0 b)
- `~/.agents`, `~/.antigravity`, `AppData/Local/agy` and `AppData/Roaming/{agy,Antigravity}` had nothing new naming the repo.

**Verdict (D-7, option A):** on a read-only turn none of the three writes any file in the working folder by itself. All state goes to the vendor's home (`~/.codex`, `~/.grok/sessions/<encoded cwd>`, `~/.gemini/antigravity-cli`), and several of those files name the repo path.

**Limits:**
- Read-only listing turns only. No write turn was run, so files written beside a tool-made change were not checked.
- One run each.
- git-internal files were not diffed beyond `git status`.
- A repo that already holds `.grok` or `.agents` folders was not tried.

---

## P-15: switching sandbox or mode between turns

**codex** (one thread, approval policy `never`, gpt-5.6-luna, effort low)
- Command: `node S/p15-codex.mjs S/P15/codex-repo S/P15/codex.json`.
- `thread/start {cwd, model, approvalPolicy:"never"}` returned `approvalPolicy "never"` and `sandbox {"type":"readOnly","networkAccess":false}`. The config has no sandbox_mode, so the thread default here is read-only.
- Turn 1: `turn/start` with `sandboxPolicy {"type":"readOnly"}`, "create a.txt".
  - Status `completed`. Reply: "Failed — the workspace is read-only, so I couldn’t create `a.txt`."
  - No tool item at all, and no a.txt.
  - Tokens: input 18211, cachedInput 17792.
- Turn 2: `sandboxPolicy {"type":"workspaceWrite"}`, "create b.txt".
  - A `fileChange` item `completed`, then a PowerShell check showed `b.txt` with 3 bytes and "hi".
  - Tokens: input 19282, cachedInput 18944.
- Turn 3: NO `sandboxPolicy`, "create c.txt".
  - A `fileChange` item `completed`, and `c.txt` exists.
  - Tokens: input 19555, cachedInput 19200.
- Final repo: README.md, b.txt, c.txt, hello.js.
- The `last.cachedInputTokens` values (17792, 18944, 19200 from `thread/tokenUsage/updated`) show the cache survived both switches. `cacheWriteInputTokens` was 0.
- The schema (`TurnStartParams.sandboxPolicy`) also says "Override the sandbox policy for this turn and subsequent turns."

**Verdict: YES.** The `readOnly` to `workspaceWrite` switch through `turn/start.sandboxPolicy` works between turns on one thread, with no new thread and no lost cache. Turn 2's policy stays as the thread's default for turn 3: the thread started `readOnly`, and turn 3 wrote with no policy given.

**Limits:**
- Turn 1 did not attempt a write; the model declined from its instructions. Read-only enforcement itself was not exercised.
- Windows sandbox (`sandbox = "elevated"` in config).
- One run, on a cheap model rather than the config default.

**grok** (`grok agent --no-leader stdio`, approvals on via `/always-approve off`)
- Commands: `node S/p15-grok.mjs S/P15/grok-repo S/P15/grok.json`, then `node S/p15-grok-bogus.mjs S/P15/grok-repo`.
- `session/new` lists NO `modes` (`modes: null`). `configOptions` are only `model` and `reasoning_effort`. There is no `plan` mode to start in.
- `session/set_mode` returns `{}` for any id: `plan`, `default`, `agent` and a bogus `zzz_bogus` all succeed with no error and no mode event.
- `session/set_config_option {configId:"mode"}` returns `{"code":-32602,"message":"Invalid params","data":"unknown config option: mode"}`.
- Turn 1, before set_mode: "create a.txt" made a `write` tool call and 1 `session/request_permission`. I answered reject-once, the turn ended `stopReason: "cancelled"`, and no file was written.
- Turn 2, after set_mode plan/default/agent: "create b.txt" behaved identically. set_mode changed nothing observable.
- Cached tokens: turn 1 `inputTokens 23567, cachedReadTokens 1664`; turn 2 `inputTokens 24238, cachedReadTokens 23552`. The cache stayed intact.

**Verdict: NO.** CH-11's grok switch does not work as written on grok 1.0.70. There is no mode list to read and no plan or edit mode to select. `session/set_mode` is a silent no-op that accepts any string. What works is the per-session `/always-approve on|off` command and answering each `session/request_permission`; a rejected permission ends the turn as `cancelled`. A read-only guarantee has to come from the host rejecting writes, or from a discarded snapshot, not from a mode.

**Limits:**
- Only `plan`, `default` and `agent` were tried as mode ids.
- The user's `permission_mode = "always-approve"` config forced the in-session approval switch.
- Model was grok-4.7.
- The rejections ended both write turns as `cancelled`, so a write succeeding after a switch was not observed (it was seen only in P-1 run 1, under always-approve).
