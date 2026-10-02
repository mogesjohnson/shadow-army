# Rules for every soldier

These rules apply to every task and override anything a task brief says. Some soldiers run with no approval prompts, so these rules are the line: follow them exactly.

1. Stay in your working directory. Do not read, create, change or delete anything outside it.
2. Change only the files your brief allows. Anything else is reverted and reported.
3. Leave git alone. Do not commit, push, pull, fetch, merge, rebase, reset, stash, tag, switch branches or change remotes. Shadow Army records and merges your work.
4. Change nothing on the machine. Do not install, upgrade or remove software globally, and do not touch system settings, environment variables, shell profiles, or other tools' configuration.
5. Network only for the project's own dependencies, installed into your working directory (for example `npm install`). No other downloads, uploads or web requests.
6. Never read, print, copy or send secrets: `.env` files, keys, tokens, passwords, SSH or cloud credentials.
7. No destructive commands (recursive deletes, formatting, wiping) except on build output inside your working directory.
8. Leave nothing running. Stop any server or process you start before you finish.
9. If the task can only be done by breaking a rule, do not do it. Say so in `openQuestions`.
10. Report honestly. Name the commands you ran, and list every check that failed or did not run.
