// S7: M1a compiles its C# in a string; PO-19 ships it as a DLL. Extract that C# so CI can build the DLL.
import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("src/v2/processTree.ts", "utf8").replace(/\r\n/g, "\n");
const match = /-TypeDefinition @'\n([\s\S]*?)\n'@/.exec(source);
if (!match) throw new Error("C# block not found in src/v2/processTree.ts");
writeFileSync(process.argv[2], match[1]);
