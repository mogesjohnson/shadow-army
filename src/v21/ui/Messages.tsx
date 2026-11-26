import React from "react";
import { Box } from "ink";
import type { ArmyView, Message } from "./model.js";
import { messageRows } from "./boardRows.js";
import { Line } from "./Strip.js";

/** The War Table messages log, at most `height` rows tall. */
export function Messages({ view, messages, height }: { view: ArmyView; messages: Message[]; height: number }) {
  return (
    <Box flexDirection="column">
      {messageRows(view, messages, height).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
