import React from "react";
import { Box } from "ink";
import type { ArmyView, Briefs, Message } from "./model.js";
import { monarchRows } from "./boardRows.js";
import { Line } from "./Strip.js";

/** The War Table Monarch panel. */
export function Monarch({ view, briefs, messages }: { view: ArmyView; briefs: Briefs; messages: Message[] }) {
  return (
    <Box flexDirection="column">
      {monarchRows(view, briefs, messages).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
