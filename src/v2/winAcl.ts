import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { posixInspect, type FolderFacts } from "./snapshot.js";

/** One folder's owner SID and access rules, as `Get-Acl` reads them; `rights` is the FileSystemRights mask. */
export interface AclFolder { path: string; owner: string; rules: { sid: string; allow: boolean; rights: number; inheritOnly: boolean }[] }
export interface AclRead { user: string; folders: AclFolder[] }
export type AclReader = (paths: string[]) => AclRead;

const SYSTEM = "S-1-5-18", ADMINISTRATORS = "S-1-5-32-544", TRUSTED_INSTALLER = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
const TRUSTED = new Set([SYSTEM, ADMINISTRATORS, TRUSTED_INSTALLER]);
/** Rights that let a holder delete, rename or re-permission a folder or its entries: DeleteChild, Delete, WriteDAC, WriteOwner, GenericAll. */
const REPLACE = 0x40 | 0x10000 | 0x40000 | 0x80000 | 0x10000000;
/** Rights that let a holder add entries: WriteData (add file), AppendData (add folder), GenericWrite. */
const CREATE = 0x2 | 0x4 | 0x40000000;

const SCRIPT = `$ErrorActionPreference='Stop'
$folders = @(foreach ($p in ([Console]::In.ReadToEnd() | ConvertFrom-Json)) { $a = Get-Acl -LiteralPath $p
  [pscustomobject]@{ path = $p; owner = $a.GetOwner([Security.Principal.SecurityIdentifier]).Value
    rules = @($a.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object { [pscustomobject]@{
      sid = $_.IdentityReference.Value; allow = ($_.AccessControlType -eq 'Allow'); rights = [long]$_.FileSystemRights
      inheritOnly = (([int]$_.PropagationFlags -band 2) -ne 0) } }) } })
[pscustomobject]@{ user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; folders = $folders } | ConvertTo-Json -Depth 5 -Compress`;

/** Reads the folders' owners and ACLs with Windows PowerShell's `Get-Acl`; the paths go in on stdin, never in the script. */
export const readAcls: AclReader = (paths) => {
  const shell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  const out = execFileSync(shell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { input: JSON.stringify(paths), encoding: "utf8", timeout: 20_000, windowsHide: true });
  return JSON.parse(out) as AclRead;
};

const key = (path: string) => path.toLowerCase();
/**
 * WSP-11's facts on Windows. The first folder asked (the deepest that exists) and every folder above it are read in one
 * call. Another user may hold no right to replace any of them, nor to add entries to the first, where the snapshots go.
 * The current user, SYSTEM, Administrators and TrustedInstaller are trusted. Anything unreadable throws (fail closed).
 */
export function windowsInspector(read: AclReader = readAcls): (dir: string) => FolderFacts {
  let known: Map<string, FolderFacts> | undefined;
  return (dir) => {
    if (!known) {
      const chain: string[] = [];
      for (let at = dir, past = ""; at !== past; past = at, at = dirname(at)) chain.push(at);
      const result = read(chain);
      if (typeof result?.user !== "string" || !result.user.startsWith("S-1-") || !Array.isArray(result.folders)) throw new Error("the folders' owners and permissions could not be read");
      known = new Map();
      for (const folder of result.folders) {
        if (typeof folder?.path !== "string" || typeof folder.owner !== "string" || !Array.isArray(folder.rules)) throw new Error(`the owner and permissions of ${JSON.stringify(folder?.path)} could not be read`);
        const deepest = key(folder.path) === key(dir);
        const mask = deepest ? REPLACE | CREATE : REPLACE;
        const owner = folder.owner === result.user ? "owner" : TRUSTED.has(folder.owner) ? "trusted" : "other";
        const writableByOthers = folder.rules.some((rule) => rule.allow && !rule.inheritOnly && rule.sid !== result.user && !TRUSTED.has(rule.sid) && (rule.rights & mask) !== 0);
        known.set(key(folder.path), { owner, writableByOthers });
      }
    }
    const facts = known.get(key(dir));
    if (!facts) throw new Error(`the owner and permissions of ${dir} were not read`);
    return facts;
  };
}

/** The snapshot root's inspector for this platform: a fresh one per check, so nothing read is reused later. */
export const platformInspect = (platform: NodeJS.Platform = process.platform, read?: AclReader) => (platform === "win32" ? windowsInspector(read) : posixInspect);
