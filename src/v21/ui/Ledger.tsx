import React from "react";
import { Box } from "ink";
import type { ArmyView } from "./model.js";
import type { TableScene } from "./tableRows.js";
import { ledgerRows, type LedgerLine } from "./ledgerRows.js";
import { Line } from "./Strip.js";

/** The finished War Table with the war ledger in the drawer, `view.width` by `height`. */
export function Ledger({ view, scene, ledger, height }: { view: ArmyView; scene: TableScene; ledger: LedgerLine[]; height: number }) {
  return (
    <Box flexDirection="column">
      {ledgerRows(view, scene, ledger, height).map((row, i) => (
        <Line key={i} row={row} ascii={view.ascii} />
      ))}
    </Box>
  );
}
