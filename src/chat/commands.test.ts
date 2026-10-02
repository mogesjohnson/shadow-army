import { describe, expect, it } from "vitest";
import { cliArgsFor, COMMANDS, helpText, menuFor, parseInput } from "./commands.js";

describe("reading the prompt", () => {
  it("takes plain text as a goal and /words as commands", () => {
    expect(parseInput("   ")).toEqual({ kind: "empty" });
    expect(parseInput("  add a hello command ")).toEqual({ kind: "goal", goal: "add a hello command" });
    expect(parseInput("/summon grok  fix the bug")).toEqual({ kind: "command", name: "summon", args: ["grok", "fix", "the", "bug"], rest: "grok  fix the bug" });
    expect(parseInput("/HELP")).toEqual({ kind: "command", name: "help", args: [], rest: "" });
  });

  it("suggests the closest command for a typo", () => {
    expect(parseInput("/amry")).toEqual({ kind: "unknown", typed: "amry", suggestion: "army" });
    expect(parseInput("/zzzzzz")).toEqual({ kind: "unknown", typed: "zzzzzz", suggestion: undefined });
  });

  it("groups quoted slash arguments and preserves Windows paths and ordinary apostrophes", () => {
    expect(parseInput('/summon grok --write --claim "src/my file.ts" \'fix it\'')).toMatchObject({
      kind: "command", args: ["grok", "--write", "--claim", "src/my file.ts", "fix it"],
    });
    expect(parseInput(String.raw`/summon grok --claim="src\my file.ts" don't change it`)).toMatchObject({
      kind: "command", args: ["grok", "--claim=src\\my file.ts", "don't", "change", "it"],
    });
    expect(parseInput(String.raw`/summon grok "say \"hello\""`)).toMatchObject({
      kind: "command", args: ["grok", 'say "hello"'],
    });
  });

  it("reports an unfinished quoted argument", () => {
    expect(parseInput('/summon grok "fix it')).toEqual({ kind: "error", message: "Unclosed quote in /summon arguments." });
  });

  it("offers matching commands only while the first word is typed", () => {
    expect(menuFor("/").map((c) => c.name)).toEqual(COMMANDS.map((c) => c.name));
    expect(menuFor("/p").map((c) => c.name)).toEqual(["plan"]);
    expect(menuFor("/plan x")).toEqual([]);
    expect(menuFor("plan")).toEqual([]);
  });

  it("maps the pass-through commands to sa's own commands", () => {
    expect(cliArgsFor("army", [])).toEqual(["army"]);
    expect(cliArgsFor("locks", [])).toEqual(["locks"]);
    expect(cliArgsFor("worktrees", [])).toEqual(["worktrees"]);
    expect(cliArgsFor("vault", [])).toEqual(["vault", "notes"]);
    expect(cliArgsFor("vault", ["runs"])).toEqual(["vault", "runs"]);
    expect(cliArgsFor("route", ["review", "--author", "grok"])).toEqual(["route", "--role", "review", "--author", "grok"]);
    expect(cliArgsFor("route", [])).toMatchObject({ usage: expect.stringContaining("/route <role>") });
    expect(cliArgsFor("summon", ["grok", "fix", "it"])).toEqual(["summon", "grok", "fix", "it"]);
    expect(cliArgsFor("summon", ["grok"])).toEqual({ usage: "/summon <soldier> <task>" });
    expect(cliArgsFor("help", [])).toBeUndefined();
  });

  it("lists every command and the keys in /help", () => {
    const text = helpText();
    for (const c of COMMANDS) expect(text).toContain(`/${c.name}`);
    expect(text).toContain("Shift+Tab");
    expect(text).toContain("Ctrl+C");
  });
});
