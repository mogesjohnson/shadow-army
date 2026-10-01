import React from "react";
import { Box, Text } from "ink";
import { SHADOW_ART, ARMY_ART, TAGLINE } from "./art.js";

// Shadow-monarch gradient: bright violet fading into deep indigo, top to bottom.
const GRADIENT = ["#c4a1ff", "#b388ff", "#9d6bff", "#8650f0", "#6f3fd1", "#5b32b0"];

function Art({ lines }: { lines: string[] }) {
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={GRADIENT[i % GRADIENT.length]} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function Banner({ version }: { version: string }) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Art lines={SHADOW_ART} />
      <Art lines={ARMY_ART} />
      <Box marginTop={1}>
        <Text color="#8650f0" italic>
          {" "}
          {TAGLINE}
        </Text>
        <Text dimColor>  v{version}</Text>
      </Box>
    </Box>
  );
}
