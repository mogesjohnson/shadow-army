import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sweepTrees, systemOps, type SweepOps, type SweepReport } from "./contain/sweep.js";

/**
 * PO-16's one-shot sweep, run by the mod as `node dist/v2/sweepMain.js <folder>` when the post office's output ends
 * with no shutdown event. It takes no lock, opens no port and reads no secret: it only reads `.shadow/v2/trees/`,
 * ends the trees whose post office is gone, and prints one JSON line (the report) for the mod's transcript line.
 * Exit 0 when every swept tree ended, 1 when a process is left, 2 on a usage or machine error.
 */
export async function main(args: readonly string[], write: (line: string) => void, ops?: SweepOps): Promise<number> {
  if (args.length !== 1) { write(JSON.stringify({ error: "usage: sweepMain <folder>" })); return 2; }
  let report: SweepReport;
  try { report = await sweepTrees(resolve(args[0]!), ops ?? systemOps()); } catch (error) { write(JSON.stringify({ error: (error as Error).message })); return 2; }
  write(JSON.stringify(report));
  return report.left.length > 0 || report.unhandled > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), (line) => process.stdout.write(`${line}\n`));
}
