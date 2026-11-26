import React from "react";
import { Box } from "ink";
import type { ArmyView } from "./model.js";
import type { TableScene } from "./tableRows.js";
import { replayRows, type Replay as Moment } from "./replayRows.js";
import { Line } from "./Strip.js";

/** The War Table as it was at one moment in the records, `view.width` by `height`. */
export function Replay({ view, scene, replay, height }: { view: ArmyView; scene: TableScene; replay: Moment; height: number }) {
  return (
    <Box flexDirection="column">
      {replayRows(view, scene, replay, height).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
