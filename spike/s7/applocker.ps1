# S7 on a Windows runner: Add-Type -Path under AppLocker policies set on the runner itself.
# Runs as the runner's administrator. Every rule is for Everyone (S-1-1-0), so no admin exemption applies.
param([string]$Dll)
$ErrorActionPreference = 'Continue'
$root = 'C:\s7'; $dllPath = "$root\ShadowJobSupervisor.dll"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
New-Item -ItemType Directory -Force "$root\allowed", "$root\denied" | Out-Null
Copy-Item "$PSScriptRoot\guardian.ps1" "$root\allowed\guardian.ps1"
Copy-Item "$PSScriptRoot\guardian.ps1" "$root\denied\guardian.ps1"; Add-Content "$root\denied\guardian.ps1" '# no rule allows this copy'
Copy-Item $Dll $dllPath

function Get-HashRule([string]$Path) {
  $x = [xml](Get-AppLockerFileInformation -Path $Path | New-AppLockerPolicy -RuleType Hash -User Everyone -Xml)
  $x.SelectSingleNode('//FileHashRule').OuterXml
}
function Get-PathRule([string]$Name, [string]$Path, [string]$Except) {
  $ex = if ($Except) { "<Exceptions><FilePathCondition Path=`"$Except`"/></Exceptions>" } else { '' }
  "<FilePathRule Id=`"$([guid]::NewGuid())`" Name=`"$Name`" Description=`"`" UserOrGroupSid=`"S-1-1-0`" Action=`"Allow`"><Conditions><FilePathCondition Path=`"$Path`"/></Conditions>$ex</FilePathRule>"
}
$baseScript = (Get-PathRule 'windir' '%WINDIR%\*') + (Get-PathRule 'programfiles' '%PROGRAMFILES%\*')
$baseDll = Get-PathRule 'all but s7' '*' "$root\*"
$allowScript = Get-HashRule "$root\allowed\guardian.ps1"
$allowDll = Get-HashRule $dllPath

function Set-Policy([string]$ScriptRules, [string]$DllRules) {
  $dll = if ($DllRules) { "<RuleCollection Type=`"Dll`" EnforcementMode=`"Enabled`">$DllRules</RuleCollection>" } else { '<RuleCollection Type="Dll" EnforcementMode="NotConfigured"/>' }
  $script = if ($ScriptRules) { "<RuleCollection Type=`"Script`" EnforcementMode=`"Enabled`">$ScriptRules</RuleCollection>" } else { '<RuleCollection Type="Script" EnforcementMode="NotConfigured"/>' }
  "<AppLockerPolicy Version=`"1`">$script$dll</AppLockerPolicy>" | Set-Content -Encoding UTF8 "$root\policy.xml"
  Set-AppLockerPolicy -XmlPolicy "$root\policy.xml"
  Start-Sleep -Seconds 5
}
function Invoke-Case([string]$Name, [string]$Script) {
  foreach ($log in 'Microsoft-Windows-AppLocker/MSI and Script', 'Microsoft-Windows-AppLocker/EXE and DLL') { wevtutil cl $log 2>$null }
  $eff = [xml](Get-AppLockerPolicy -Effective -Xml)
  "[$Name] effective: " + (($eff.AppLockerPolicy.RuleCollection | ForEach-Object { "$($_.Type)=$($_.EnforcementMode)" }) -join ' ')
  $out = & $ps -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Script -Dll $dllPath 2>&1
  "[$Name] rc=$LASTEXITCODE"; $out | ForEach-Object { "[$Name] $_" }
  foreach ($log in 'Microsoft-Windows-AppLocker/MSI and Script', 'Microsoft-Windows-AppLocker/EXE and DLL') {
    Get-WinEvent -LogName $log -MaxEvents 4 -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 's7' } |
      ForEach-Object { "[$Name] event $($_.Id): $(($_.Message -replace '\s+', ' ').Substring(0, [Math]::Min(220, $_.Message.Length)))" }
  }
}

"appidsvc before: $((Get-Service AppIDSvc).Status)"
Start-Service AppIDSvc -ErrorAction SilentlyContinue
"appidsvc after: $((Get-Service AppIDSvc).Status)"
try {
  Invoke-Case 'C0 no policy' "$root\allowed\guardian.ps1"
  Set-Policy ($baseScript + $allowScript) $null
  Invoke-Case 'C1 script allowed, DLL rules off' "$root\allowed\guardian.ps1"
  "[C1m M1a's own temp script] $(node "$PSScriptRoot\clis.mjs" m1a 2>&1)"
  Set-Policy ($baseScript + $allowScript) $baseDll
  Invoke-Case 'C2 script allowed, DLL rules on, DLL not allowed' "$root\allowed\guardian.ps1"
  Set-Policy ($baseScript + $allowScript) ($baseDll + $allowDll)
  Invoke-Case 'C3 script allowed, DLL allowed' "$root\allowed\guardian.ps1"
  Set-Policy $baseScript $null
  Invoke-Case 'C4 script not allowed' "$root\denied\guardian.ps1"
} finally {
  Set-Policy $null $null
  "cleared: $(([xml](Get-AppLockerPolicy -Effective -Xml)).AppLockerPolicy.RuleCollection.EnforcementMode -join ' ')"
}
