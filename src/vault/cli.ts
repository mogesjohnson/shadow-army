import { Command, Option } from "commander";
import { renderNotes, renderOverview, renderRuns } from "./render.js";
import { Vault, VaultError, type NoteStatus } from "./vault.js";

/** Run a vault command, turning VaultError into a clean message and a non-zero exit. */
async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof VaultError) {
      console.error(`error: ${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

export function registerVaultCommands(program: Command): void {
  const vaultCmd = program
    .command("vault")
    .description("inspect and curate the Shadow Vault (.shadow/ in the project directory)")
    .option("--cwd <dir>", "project directory whose vault to use", process.cwd());

  const open = (cmd: Command) => Vault.forCwd(cmd.optsWithGlobals().cwd as string);

  vaultCmd.action((_opts, cmd: Command) =>
    guarded(async () => {
      const vault = open(cmd);
      console.log(renderOverview(vault.root, await vault.listNotes(), await vault.listRuns()));
    }),
  );

  vaultCmd
    .command("notes")
    .description("list shared notes")
    .addOption(new Option("--status <status>", "filter by status").choices(["proposed", "accepted", "rejected"]))
    .action((opts: { status?: NoteStatus }, cmd: Command) =>
      guarded(async () => console.log(renderNotes(await open(cmd).listNotes(opts.status)))),
    );

  for (const [name, status, verb] of [
    ["accept", "accepted", "accepted: will be given to soldiers in future briefs"],
    ["reject", "rejected", "rejected: will never be given to a soldier"],
  ] as const) {
    vaultCmd
      .command(`${name} <ids...>`)
      .description(`${name} proposed notes`)
      .action((ids: string[], _opts: unknown, cmd: Command) =>
        guarded(async () => {
          const vault = open(cmd);
          for (const id of ids) {
            const note = await vault.setNoteStatus(id, status);
            console.log(`${note.id} ${verb}`);
          }
        }),
      );
  }

  vaultCmd
    .command("add <text...>")
    .description("add an accepted note by hand")
    .action((text: string[], _opts: unknown, cmd: Command) =>
      guarded(async () => {
        const note = await open(cmd).addNote({ text: text.join(" "), source: "you", status: "accepted" });
        console.log(`${note.id} [${note.status}] ${note.text}`);
      }),
    );

  vaultCmd
    .command("runs")
    .description("list recorded runs, newest first")
    .option("--limit <n>", "how many to show", "20")
    .action((opts: { limit: string }, cmd: Command) =>
      guarded(async () => console.log(renderRuns(await open(cmd).listRuns(Number(opts.limit) || 20)))),
    );

  vaultCmd
    .command("show <runId>")
    .description("print one run record as JSON")
    .action((runId: string, _opts: unknown, cmd: Command) =>
      guarded(async () => console.log(JSON.stringify(await open(cmd).getRun(runId), null, 2))),
    );
}
