import React from "react";
import { Text } from "ink";
import { PALETTE, type ArmyView } from "./model.js";
import { stripRow, type Row } from "./layout.js";

/** One laid-out row; colour is dropped in the ASCII profile, so tags and glyphs must carry the meaning. */
export function Line({ row, ascii }: { row: Row; ascii: boolean }) {
  return (
    <Text wrap="truncate">
      {row.map((s, i) => (
        <Text key={i} color={ascii || !s.tone ? undefined : PALETTE[s.tone]} bold={s.bold}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** The army strip (HOST-6). */
export function Strip({ view }: { view: ArmyView }) {
  return <Line row={stripRow(view)} ascii={view.ascii} />;
}
