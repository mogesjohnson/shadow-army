import { createInterface } from "node:readline";
import type { Command } from "commander";
import { OfficeClient } from "./client.js";
import type { TurnResult } from "./channel.js";
import { runPostOffice } from "./main.js";

export function renderLiveResult(result: TurnResult): string {
  const text = result.text.split(/\r?\n/).slice(0, 5).join("\n");
  return result.status === "completed" ? text || result.status
    : `${result.status}: ${result.error?.message ?? "turn stopped"}${text ? `\nPartial reply:\n${text}` : ""}`;
}

export function registerLiveCommand(program: Command): void {
  program.command("post-office", { hidden: true })
    .description("internal authenticated post office; credential supplied on stdin")
    .option("--cwd <dir>", "repository folder", process.cwd())
    .action(async (options: { cwd: string }) => { await runPostOffice({ cwd: options.cwd }); });
  program.command("live <soldier> [task...]")
    .description("open a persistent Claude soldier in a private read-only worktree")
    .option("--cwd <dir>", "repository folder", process.cwd())
    .option("--json", "machine-readable result for a single task")
    .action(async (soldier: string, task: string[], options: { cwd: string; json?: boolean }) => {
      if (options.json && !task.length) throw new Error("--json requires a task");
      const client = new OfficeClient({ cwd: options.cwd, onEvent: (event) => {
        if (event.type === "approval") console.error(`Owner response needed: ${JSON.stringify(event.data)}\n${task.length ? "Interrupt with Ctrl+C; use the interactive form to answer native requests." : "Use /answer <request_id> <native JSON response>, or /stop."}`);
      } });
      let turnRequested = false;
      let cancelled = false;
      let closeInput: (() => void) | undefined;
      const onStop = () => {
        if (!turnRequested) {
          cancelled = true;
          process.exitCode = 130;
          closeInput?.();
          void client.close().catch(() => {});
        } else void client.request({ action: "interrupt", soldier }).catch(() => {});
      };
      process.on("SIGINT", onStop);
      const show = (result: TurnResult) => {
        console.log(options.json ? JSON.stringify(result, null, 2) : renderLiveResult(result));
        if (result.status !== "completed") process.exitCode = 1;
      };
      try {
        await client.request({ action: "open", soldier });
        if (cancelled) return;
        if (task.length) {
          turnRequested = true;
          try { show(await client.request<TurnResult>({ action: "send", soldier, text: task.join(" ") })); }
          finally { turnRequested = false; }
        }
        else {
          const input = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
          closeInput = () => input.close();
          input.on("SIGINT", onStop);
          try {
            if (process.stdin.isTTY) { console.log("/stop interrupts the turn; /exit closes the session."); input.setPrompt(`${soldier}> `); input.prompt(); }
            let active: Promise<void> | undefined;
            for await (const text of input) {
              if (text.trim() === "/exit") break;
              if (text.trim() === "/stop") { await client.request({ action: "interrupt", soldier }); continue; }
              if (text.startsWith("/answer ")) {
                const match = /^\/answer\s+(\S+)\s+([\s\S]+)$/.exec(text);
                try {
                  if (!match) throw new Error("use /answer <request_id> <native JSON response>");
                  await client.request({ action: "approval", soldier, requestId: match[1], response: JSON.parse(match[2]!) });
                } catch (error) { console.error(String(error)); }
                continue;
              }
              if (!text.trim()) continue;
              if (active) { console.error("The soldier is working. Use /stop, or wait for its reply."); continue; }
              if (cancelled) break;
              turnRequested = true;
              active = client.request<TurnResult>({ action: "send", soldier, text }).then(show).catch((error: unknown) => { console.error(String(error)); process.exitCode = 1; }).finally(() => { active = undefined; turnRequested = false; if (process.stdin.isTTY) input.prompt(); });
            }
            // Closing the caller ends pending work, instead of waiting indefinitely for another turn.
            await client.close();
            await active;
          } finally { input.close(); }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      } finally { process.off("SIGINT", onStop); await client.close(); }
    });
}
