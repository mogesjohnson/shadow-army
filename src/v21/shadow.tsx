// The War Table app on fixtures: full screen, redrawn on resize. Keys are the reducer in ui/keys.ts. No post office, no processes.
import React, { useState } from "react";
import { render, useApp, useInput, useWindowSize } from "ink";
import {
  FINISHED_SCENE, LEDGER, LEDGER_SCENE, NEEDS_SCENE, REPLAY, REPLAY_SCENE, ROSTER, SUMMARY, WORK_SCENE,
  finishedTable, needsSoldiers, replayTable, warTable,
} from "./ui/fixture.js";
import { INITIAL, press } from "./ui/keys.js";
import { Ledger } from "./ui/Ledger.js";
import { Replay } from "./ui/Replay.js";
import { Summary } from "./ui/Summary.js";
import { WarTable } from "./ui/WarTable.js";

function Shadow() {
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();
  const [state, setState] = useState(INITIAL);
  useInput((input, key) => {
    const next = press(state, input, { ctrl: key.ctrl, escape: key.escape, tab: key.tab });
    if (next.quit) exit();
    else setState(next);
  });
  switch (state.screen) {
    case "needs": return <WarTable view={warTable(columns, false, needsSoldiers)} scene={NEEDS_SCENE} height={rows} />;
    case "summary": return <Summary view={finishedTable(columns)} scene={FINISHED_SCENE} summary={SUMMARY} height={rows} />;
    case "ledger": return <Ledger view={finishedTable(columns)} scene={LEDGER_SCENE} ledger={LEDGER} height={rows} />;
    case "replay": return <Replay view={replayTable(columns)} scene={REPLAY_SCENE} replay={REPLAY} height={rows} />;
    default: return <WarTable view={warTable(columns, false, ROSTER)} scene={WORK_SCENE} height={rows} />;
  }
}

if (process.stdin.isTTY && process.stdout.isTTY) {
  render(<Shadow />, { alternateScreen: true, exitOnCtrlC: false });
} else {
  console.error("shadow needs an interactive terminal.");
  process.exitCode = 1;
}
