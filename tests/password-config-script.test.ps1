param(
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath
)

$ErrorActionPreference = "Stop"
$tokens = $null
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors) | Out-Null

if ($parseErrors.Count -gt 0) {
  throw ($parseErrors | ForEach-Object { $_.Message } | Select-Object -First 1)
}
