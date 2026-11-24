# S7: what PO-19's script does first. Report the language mode, then load the DLL with Add-Type -Path.
param([string]$Dll)
"mode=$($ExecutionContext.SessionState.LanguageMode)"
try {
  Add-Type -Path $Dll
  "addtype=ok type=$(([type]'ShadowJobSupervisor').FullName)"
} catch {
  $e = $_.Exception
  "addtype=fail $($e.GetType().FullName): $($e.Message)"
  while ($e.InnerException) { $e = $e.InnerException; "  inner $($e.GetType().FullName) hr=0x{0:X8}: $($e.Message)" -f $e.HResult }
}
