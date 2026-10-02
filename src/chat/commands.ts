import { closestName } from "../core/closest.js";

export interface SlashCommand {
  name: string;
  /** How its arguments are written, for the menu and /help. */
  args: string;
  help: string;
}

export const COMMANDS: SlashCommand[] = [
  { name: "help", args: "", help: "the commands and keys" },
  { name: "plan", args: "<goal>", help: "plan a goal without running it" },
  { name: "mode", args: "[ask|auto|plan]", help: "how goals run (Shift+Tab cycles it)" },
  { name: "army", args: "", help: "detect the soldiers and check their models" },
  { name: "summon", args: "<soldier> <task>", help: "send one brief to one soldier" },
  { name: "route", args: "<role>", help: "who may take a role, ranked, with reasons" },
  { name: "vault", args: "[notes|runs]", help: "the Shadow Vault's shared notes or run records" },
  { name: "locks", args: "", help: "which soldier holds which files" },
  { name: "worktrees", args: "", help: "the soldiers' worktrees and branches" },
  { name: "clear", args: "", help: "clear the screen and forget this session's goals" },
  { name: "exit", args: "", help: "leave Shadow Army" },
];

export type ChatInput =
  | { kind: "empty" }
  | { kind: "goal"; goal: string }
  | { kind: "command"; name: string; args: string[]; rest: string }
  | { kind: "unknown"; typed: string; suggestion?: string };

/** A line typed at the prompt: a goal for the Monarch, or a /command. */
export function parseInput(text: string): ChatInput {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  if (!t.startsWith("/")) return { kind: "goal", goal: t };
  const head = t.slice(1).split(/\s+/)[0]!;
  const name = head.toLowerCase();
  if (!COMMANDS.some((c) => c.name === name)) {
    return { kind: "unknown", typed: name, suggestion: closestName(name, COMMANDS.map((c) => c.name)) };
  }
  const rest = t.slice(1 + head.length).trim();
  return { kind: "command", name, args: rest ? rest.split(/\s+/) : [], rest };
}

/** The commands to offer while the first word of a /command is being typed. */
export function menuFor(text: string): SlashCommand[] {
  if (!text.startsWith("/") || /\s/.test(text)) return [];
  const typed = text.slice(1).toLowerCase();
  return COMMANDS.filter((c) => c.name.startsWith(typed));
}

/** The `sa` arguments for a command the chat hands to the CLI, or what is wrong with its arguments. */
export function cliArgsFor(name: string, args: string[]): string[] | { usage: string } | undefined {
  switch (name) {
    case "army":
    case "locks":
    case "worktrees":
      return [name, ...args];
    case "vault":
      return ["vault", ...(args.length ? args : ["notes"])];
    case "route":
      return args.length ? ["route", "--role", args[0]!, ...args.slice(1)] : { usage: "/route <role>  (build, review, research, test or orchestrate)" };
    case "summon":
      return args.length >= 2 ? ["summon", ...args] : { usage: "/summon <soldier> <task>" };
    default:
      return undefined;
  }
}

export function helpText(): string {
  const width = Math.max(...COMMANDS.map((c) => `/${c.name} ${c.args}`.trim().length));
  return [
    "Type a goal and press Enter: the Monarch plans it, soldiers carry it out, and the changes land in your folder uncommitted.",
    "",
    "Commands:",
    ...COMMANDS.map((c) => `  ${`/${c.name} ${c.args}`.trim().padEnd(width)}  ${c.help}`),
    "",
    "Keys:",
    "  Shift+Tab   cycle the mode: ask before running, run without asking, plan only",
    "  Up/Down     earlier inputs (or move in the / menu)",
    "  Tab         complete a command",
    "  Esc         clear the input",
    "  Ctrl+C      clear the input; twice on an empty prompt to exit",
  ].join("\n");
}
