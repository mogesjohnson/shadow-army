import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Box, Static, Text, useInput } from "ink";
import { Banner } from "../ui/Banner.js";
import { RunDashboard, StepsView, WorkingLine } from "../ui/Dashboard.js";
import { menuFor, type SlashCommand } from "./commands.js";
import { EFFORTS, MODE_LABEL, tokenSummary, type ChatSession, type ChatState, type Entry } from "./session.js";

export interface WelcomeInfo {
  version: string;
  cwd: string;
  monarch?: string;
  soldiers: number;
}

export interface StatusInfo {
  branch?: string;
  /** Soldiers whose CLI was found, out of all. */
  ready?: { found: number; total: number };
}

const PLACEHOLDER = "Give the Monarch a goal, or type / for commands";
const ACCENT = "#b388ff";

function Welcome({ info }: { info: WelcomeInfo }) {
  return (
    <Box flexDirection="column">
      <Banner version={info.version} />
      <Box flexDirection="column" borderStyle="round" borderColor="#8650f0" paddingX={1} alignSelf="flex-start">
        <Text>
          <Text color={ACCENT}>✻</Text> Welcome to <Text bold>Shadow Army</Text>
        </Text>
        <Text> </Text>
        <Text dimColor>  /help for commands · Shift+Tab to change mode</Text>
        <Text> </Text>
        <Text dimColor>  cwd: {info.cwd}</Text>
        <Text dimColor>
          {"  "}Monarch: {info.monarch ?? "none available"} · {info.soldiers} soldier{info.soldiers === 1 ? "" : "s"}
        </Text>
      </Box>
    </Box>
  );
}

function Said({ text, tone }: { text: string; tone: "normal" | "error" | "dim" }) {
  return (
    <Box>
      <Box width={2} flexShrink={0}>
        <Text color={tone === "error" ? "red" : ACCENT}>⏺</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={tone === "error" ? "red" : undefined} dimColor={tone === "dim"}>
          {text}
        </Text>
      </Box>
    </Box>
  );
}

function EntryView({ entry, info }: { entry: Entry; info: WelcomeInfo }) {
  switch (entry.kind) {
    case "welcome":
      return <Welcome info={info} />;
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="gray">&gt; {entry.text}</Text>
        </Box>
      );
    case "text":
      return (
        <Box marginTop={1}>
          <Said text={entry.text} tone={entry.tone} />
        </Box>
      );
    case "steps":
      return (
        <Box marginTop={1}>
          <StepsView steps={entry.steps} now={entry.now} tick={0} />
        </Box>
      );
    case "dashboard":
      return (
        <Box marginTop={1}>
          <RunDashboard view={entry.view} now={entry.now} tick={0} />
        </Box>
      );
  }
}

function InputBox({ value, cursor }: { value: string; cursor: number }) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text>&gt; </Text>
      {value ? (
        <Text>
          {value.slice(0, cursor)}
          <Text inverse>{value[cursor] ?? " "}</Text>
          {value.slice(cursor + 1)}
        </Text>
      ) : (
        <Text>
          <Text inverse>{PLACEHOLDER[0]}</Text>
          <Text dimColor>{PLACEHOLDER.slice(1)}</Text>
        </Text>
      )}
    </Box>
  );
}

function SlashMenu({ items, selected }: { items: SlashCommand[]; selected: number }) {
  const width = Math.max(...items.map((c) => `/${c.name} ${c.args}`.trim().length));
  return (
    <Box flexDirection="column" paddingX={2}>
      {items.map((c, i) => (
        <Text key={c.name} color={i === selected ? ACCENT : undefined} dimColor={i !== selected}>
          {`/${c.name} ${c.args}`.trim().padEnd(width)}  {c.help}
        </Text>
      ))}
    </Box>
  );
}

/** The efforts in a row, the chosen one marked, the suggested one labelled. */
function EffortRow({ choice, suggested, active }: { choice: string; suggested: string; active: boolean }) {
  return (
    <Text>
      {EFFORTS.map((e) => (
        <Text key={e} color={e === choice && active ? ACCENT : undefined} bold={e === choice} dimColor={e !== choice}>
          {e === choice ? `‹${e}›` : ` ${e} `}{" "}
        </Text>
      ))}
      {choice === suggested ? <Text dimColor>(suggested)</Text> : <Text dimColor>(suggested: {suggested})</Text>}
    </Text>
  );
}

function EffortPicker({ pick }: { pick: NonNullable<ChatState["pickEffort"]> }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#8650f0" paddingX={1}>
      <Text bold>
        {pick.soldier} <Text dimColor>({pick.model})</Text> will plan this. Effort?
      </Text>
      <EffortRow choice={pick.choice} suggested={pick.suggested} active />
      <Text dimColor>←/→ or 1-4 to change · Enter to start · Esc to cancel</Text>
    </Box>
  );
}

function ConfirmBox({ confirm }: { confirm: NonNullable<ChatState["confirm"]> }) {
  const n = confirm.tasks.length;
  const width = Math.max(...confirm.tasks.map((t) => `${t.soldier} (${t.model})`.length));
  const option = (row: number, label: string) => (
    <Text color={confirm.row === row ? ACCENT : undefined}>
      {confirm.row === row ? "❯" : " "} {label}
    </Text>
  );
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#8650f0" paddingX={1}>
      <Text bold>Run {n === 1 ? "this task" : `these ${n} tasks`}? Set each one's effort first if you like.</Text>
      {confirm.tasks.map((t, i) => (
        <Text key={t.id}>
          <Text color={confirm.row === i ? ACCENT : undefined}>{confirm.row === i ? "❯" : " "} </Text>
          <Text>{t.id.padEnd(4)} {`${t.soldier} (${t.model})`.padEnd(width)}  </Text>
          <EffortRow choice={t.effort} suggested={t.suggested} active={confirm.row === i} />
        </Text>
      ))}
      {option(n, "Yes, run it")}
      {option(n + 1, "No")}
      <Text dimColor>↑/↓ to move · ←/→ to change a task's effort · Enter or y to run · n or Esc for no</Text>
    </Box>
  );
}

function StatusLine({ state, status }: { state: ChatState; status: StatusInfo }) {
  const right = [status.branch, status.ready ? `${status.ready.found}/${status.ready.total} soldiers ready` : undefined, tokenSummary(state.tokens) || undefined].filter(Boolean);
  return (
    <Box justifyContent="space-between" paddingX={2}>
      {state.notice ? (
        <Text color="yellow">{state.notice}</Text>
      ) : (
        <Text color={state.mode === "ask" ? undefined : ACCENT} dimColor={state.mode === "ask"}>
          ⏵⏵ {MODE_LABEL[state.mode]} <Text dimColor>(shift+tab to cycle)</Text>
        </Text>
      )}
      <Text dimColor>{right.join(" · ")}</Text>
    </Box>
  );
}

/** The `sa` chat screen. All the behavior lives in `ChatSession`; this draws it and reads keys. */
export function ChatApp({
  session,
  info,
  loadStatus,
  tickMs = 120,
  clock = Date.now,
}: {
  session: ChatSession;
  info: WelcomeInfo;
  loadStatus?: () => Promise<StatusInfo>;
  tickMs?: number;
  clock?: () => number;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [inputs, setInputs] = useState<string[]>([]);
  const [recall, setRecall] = useState<number | undefined>();
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<StatusInfo>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    void loadStatus?.().then((s) => live && setStatus(s), () => undefined);
    return () => {
      live = false;
    };
  }, [loadStatus]);

  // Spinners and clocks move while something runs.
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(() => setTick((t) => t + 1), tickMs);
    return () => clearInterval(timer);
  }, [state.busy, tickMs]);

  const menu = session.idle ? menuFor(value) : [];
  useEffect(() => setSelected(0), [value]);

  const edit = (next: string, at = next.length) => {
    setValue(next);
    setCursor(Math.max(0, Math.min(at, next.length)));
  };
  const submit = (text: string) => {
    if (text.trim()) setInputs((h) => (h.at(-1) === text ? h : [...h, text]));
    setRecall(undefined);
    edit("");
    void session.submit(text);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (state.pickEffort) return session.decideEffort(false);
      if (state.confirm) return session.decide(false);
      if (session.idle && value) return edit("");
      return session.interrupt();
    }
    if (state.notice) session.clearNotice();

    if (state.pickEffort) {
      if (key.leftArrow) session.moveEffort(-1);
      else if (key.rightArrow || key.tab) session.moveEffort(1);
      // Exactly one digit, 1 to 4, picks that effort; pasted text such as "1.5" is not a key and is ignored.
      else if (/^[1-4]$/.test(input)) session.setEffort(EFFORTS[Number(input) - 1]!);
      else if (key.return) session.decideEffort(true);
      else if (key.escape) session.decideEffort(false);
      return;
    }
    if (state.confirm) {
      if (key.upArrow) session.moveChoice(-1);
      else if (key.downArrow || key.tab) session.moveChoice(1);
      else if (key.leftArrow) session.moveEffort(-1);
      else if (key.rightArrow) session.moveEffort(1);
      else if (key.return) session.choose();
      else if (input === "y") session.decide(true);
      else if (input === "n" || key.escape) session.decide(false);
      return;
    }
    if (!session.idle) return;
    if (key.tab && key.shift) return session.cycleMode();

    // While browsing earlier inputs, Up and Down stay on them, even when a recalled /command opens the menu.
    const browsing = recall !== undefined;
    if (menu.length) {
      const pick = menu[Math.min(selected, menu.length - 1)]!;
      if (key.upArrow && !browsing) return setSelected((selected - 1 + menu.length) % menu.length);
      if (key.downArrow && !browsing) return setSelected((selected + 1) % menu.length);
      if (key.tab || (key.return && value.slice(1).toLowerCase() !== pick.name)) {
        if (key.return && !pick.args) return submit(`/${pick.name}`);
        return edit(`/${pick.name}${pick.args ? " " : ""}`);
      }
    }
    if (key.return) return submit(value);
    if (key.upArrow && inputs.length) {
      const i = Math.max(0, (recall ?? inputs.length) - 1);
      setRecall(i);
      return edit(inputs[i]!);
    }
    if (key.downArrow && recall !== undefined) {
      const i = recall + 1;
      setRecall(i < inputs.length ? i : undefined);
      return edit(i < inputs.length ? inputs[i]! : "");
    }
    if (key.leftArrow) return setCursor(Math.max(0, cursor - 1));
    if (key.rightArrow) return setCursor(Math.min(value.length, cursor + 1));
    if (key.home || (key.ctrl && input === "a")) return setCursor(0);
    if (key.end || (key.ctrl && input === "e")) return setCursor(value.length);
    // Editing a recalled input ends browsing, so the arrows go back to the menu or start from the newest input.
    if (key.escape) {
      setRecall(undefined);
      return edit("");
    }
    if (key.delete) {
      setRecall(undefined);
      if (cursor < value.length) edit(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
      return;
    }
    if (key.backspace) {
      setRecall(undefined);
      if (cursor > 0) edit(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setRecall(undefined);
      const text = input.replace(/\r\n|\r|\n/g, " ");
      edit(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
    }
  });

  const now = clock();
  const tick = Math.floor(Date.now() / tickMs);
  return (
    <Box flexDirection="column">
      <Static key={state.epoch} items={state.entries}>
        {(entry) => <EntryView key={entry.id} entry={entry} info={info} />}
      </Static>
      <Box flexDirection="column" marginTop={1}>
        {state.busy?.kind === "steps" ? <StepsView steps={state.busy.steps} now={now} tick={tick} /> : null}
        {state.busy?.kind === "dashboard" ? <RunDashboard view={state.busy.view} now={now} tick={tick} /> : null}
        {state.busy?.kind === "command" ? <WorkingLine work={state.busy.work} now={now} tick={tick} /> : null}
        {state.pickEffort ? <EffortPicker pick={state.pickEffort} /> : null}
        {state.confirm ? <ConfirmBox confirm={state.confirm} /> : null}
        {session.idle ? <InputBox value={value} cursor={cursor} /> : null}
        {menu.length ? <SlashMenu items={menu} selected={Math.min(selected, menu.length - 1)} /> : null}
        <StatusLine state={state} status={status} />
      </Box>
    </Box>
  );
}
