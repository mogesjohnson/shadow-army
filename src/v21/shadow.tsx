// The War Table app on fixtures: full screen, redrawn on resize, q or ctrl+c to leave. No post office, no processes.
import React from "react";
import { render, useApp, useInput, useWindowSize } from "ink";
import { ROSTER, WORK_SCENE, warTable } from "./ui/fixture.js";
import { WarTable } from "./ui/WarTable.js";

function Shadow() {
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) exit();
  });
  return <WarTable view={warTable(columns, false, ROSTER)} scene={WORK_SCENE} height={rows} />;
}

if (process.stdin.isTTY && process.stdout.isTTY) {
  render(<Shadow />, { alternateScreen: true, exitOnCtrlC: false });
} else {
  console.error("shadow needs an interactive terminal.");
  process.exitCode = 1;
}
