import React from "react";
import { Box } from "ink";
import type { Soldier } from "./model.js";
import { headerRows } from "./layout.js";
import { Line } from "./Strip.js";

/** The pane header (HOST-4): one line from 50 columns, two below. */
export function PaneHeader({ soldier, width, ascii }: { soldier: Soldier; width: number; ascii: boolean }) {
  return (
    <Box flexDirection="column">
      {headerRows(soldier, width, ascii).map((row, i) => (
        <Line key={i} row={row} ascii={ascii} />
      ))}
    </Box>
  );
}
