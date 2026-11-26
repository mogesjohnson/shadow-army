import React from "react";
import { Box } from "ink";
import type { Soldier } from "./model.js";
import { cardRows, type CardInfo, type CardOpts } from "./cardRows.js";
import { Line } from "./Strip.js";

/** One War Table soldier card. */
export function Card({ soldier, info, ...opts }: { soldier: Soldier; info: CardInfo } & CardOpts) {
  return (
    <Box flexDirection="column">
      {cardRows(soldier, info, opts).map((row, i) => (
        <Line key={i} row={row} ascii={!!opts.ascii} />
      ))}
    </Box>
  );
}
