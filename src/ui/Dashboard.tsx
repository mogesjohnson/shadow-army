import React from "react";
import { Box, Text } from "ink";
import { doneCount, formatElapsed, STATUS_WORD, type RunView, type TaskRow, type ViewStatus } from "./runView.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const COLOR: Record<ViewStatus, string> = {
  waiting: "gray",
  running: "cyan",
  ok: "green",
  error: "red",
  refused: "yellow",
  conflict: "magenta",
  skipped: "gray",
};

/** A mark per status; the status word always sits beside it, so color is never the only signal. */
const MARK: Record<Exclude<ViewStatus, "running">, string> = {
  waiting: "·",
  ok: "✓",
  error: "✗",
  refused: "!",
  conflict: "≠",
  skipped: "-",
};

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function TaskLine({ task, now, tick }: { task: TaskRow; now: number; tick: number }) {
  const mark = task.status === "running" ? SPINNER[tick % SPINNER.length]! : MARK[task.status];
  const time =
    task.status === "running" && task.startedAt !== undefined
      ? formatElapsed(now - task.startedAt)
      : task.durationMs !== undefined
        ? formatElapsed(task.durationMs)
        : "";
  return (
    <Box>
      <Box width={2}>
        <Text color={COLOR[task.status]}>{mark}</Text>
      </Box>
      <Box width={8}>
        <Text wrap="truncate">{task.id}</Text>
      </Box>
      <Box width={15}>
        <Text wrap="truncate">{task.soldier}</Text>
      </Box>
      <Box width={9}>
        <Text dimColor>{task.role}</Text>
      </Box>
      <Box width={10}>
        <Text color={COLOR[task.status]} bold={task.status !== "waiting"}>
          {STATUS_WORD[task.status]}
        </Text>
      </Box>
      <Box width={8}>
        <Text dimColor>{time}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="truncate">{task.detail ?? task.title}</Text>
      </Box>
    </Box>
  );
}

/** The live screen for `sa run`. Layout is Yoga flexbox, through Ink's Box. */
export function RunDashboard({ view, now, tick }: { view: RunView; now: number; tick: number }) {
  const done = doneCount(view);
  const cost = view.costUsd ? `  $${view.costUsd.toFixed(4)}` : "";
  const state =
    view.ended === "done"
      ? { text: "Finished", color: "green" }
      : view.ended === "failed"
        ? { text: "Stopped by an error", color: "red" }
        : { text: clip(view.phase, 60), color: "cyan" };
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#8650f0" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="#b388ff">
          SHADOW ARMY
        </Text>
        <Text dimColor>
          run {view.runId}  Monarch {view.monarch}
        </Text>
      </Box>
      <Text wrap="truncate">Goal: {view.goal}</Text>
      {view.branch ? <Text dimColor wrap="truncate">Branch: {view.branch}</Text> : null}
      <Box justifyContent="space-between" marginTop={1}>
        <Text color={state.color} wrap="truncate">
          {state.text}
        </Text>
        <Text>
          {done}/{view.tasks.length} done  {formatElapsed(now - view.startedAt)}
          {cost}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {view.tasks.map((t) => (
          <TaskLine key={t.id} task={t} now={now} tick={tick} />
        ))}
      </Box>
      {view.activity.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Activity</Text>
          {view.activity.map((line, i) => (
            <Text key={i} dimColor wrap="truncate">
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export interface Working {
  label: string;
  startedAt: number;
  /** Set when the wait is over; the line then stays on screen with a mark instead of the spinner. */
  done?: "ok" | "error";
}

/** One live line while something is waited on: the Monarch planning, or `sa summon`'s soldier working. */
export function WorkingLine({ work, now, tick }: { work: Working; now: number; tick: number }) {
  const mark =
    work.done === "ok" ? (
      <Text color="green">✓</Text>
    ) : work.done === "error" ? (
      <Text color="red">✗</Text>
    ) : (
      <Text color="cyan">{SPINNER[tick % SPINNER.length]}</Text>
    );
  return (
    <Text wrap="truncate">
      {mark} {work.label}  <Text dimColor>{formatElapsed(now - work.startedAt)}</Text>
    </Text>
  );
}

export interface Steps {
  /** Steps already passed, oldest first. They stay, so a warning among them is not lost. */
  past: string[];
  current: Working;
}

/** What `sa run` is doing before there is a plan to show: past steps, then the current one, live. */
export function StepsView({ steps, now, tick }: { steps: Steps; now: number; tick: number }) {
  return (
    <Box flexDirection="column">
      {steps.past.map((line, i) => (
        <Text key={i} dimColor wrap="truncate">
          · {line}
        </Text>
      ))}
      <WorkingLine work={steps.current} now={now} tick={tick} />
    </Box>
  );
}
