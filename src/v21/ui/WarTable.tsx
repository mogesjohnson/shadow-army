import React from "react";
import { Box } from "ink";
import type { ArmyView } from "./model.js";
import { tableRows, type TableScene } from "./tableRows.js";
import { Line } from "./Strip.js";

/** The whole War Table screen, `view.width` by `height`. */
export function WarTable({ view, scene, height }: { view: ArmyView; scene: TableScene; height: number }) {
  return (
    <Box flexDirection="column">
      {tableRows(view, scene, height).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
