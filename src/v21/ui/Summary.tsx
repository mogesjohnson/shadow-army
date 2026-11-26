import React from "react";
import { Box } from "ink";
import type { ArmyView } from "./model.js";
import type { TableScene } from "./tableRows.js";
import { summaryRows, type Summary as Receipt } from "./summaryRows.js";
import { Line } from "./Strip.js";

/** The finished War Table with the last summary in the drawer, `view.width` by `height`. */
export function Summary({ view, scene, summary, height }: { view: ArmyView; scene: TableScene; summary: Receipt; height: number }) {
  return (
    <Box flexDirection="column">
      {summaryRows(view, scene, summary, height).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
