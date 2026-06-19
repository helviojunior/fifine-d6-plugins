#Requires -Version 5.1
<#
  Runs after install.ps1 copies this plugin. Wires the Claude Code
  PermissionRequest hook to this plugin's cross-platform Node hook script.

  Usage (opt in):
    powershell -ExecutionPolicy Bypass -File "<plugin>\postinstall.ps1"
#>
[CmdletBinding()]
param(
  [string]$PluginDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$hookJs = Join-Path $PluginDir "hooks\claude-approve.js"
# Claude Code runs hook commands via the shell — invoke Node on our script.
$command = "node `"$hookJs`""

$settingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"
Write-Host "Configuring Claude Code PermissionRequest hook -> $command"

if (Test-Path $settingsFile) {
  $settings = Get-Content -Raw $settingsFile | ConvertFrom-Json
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $settingsFile) | Out-Null
  $settings = [pscustomobject]@{}
}

# Convert to a mutable hashtable tree so we can add keys regardless of shape.
function ConvertTo-Hashtable($obj) {
  if ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string]) {
    return @($obj | ForEach-Object { ConvertTo-Hashtable $_ })
  }
  if ($obj -is [psobject]) {
    $h = @{}
    foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = ConvertTo-Hashtable $p.Value }
    return $h
  }
  return $obj
}

$s = ConvertTo-Hashtable $settings
if (-not $s.ContainsKey("hooks")) { $s["hooks"] = @{} }
if (-not $s["hooks"].ContainsKey("PermissionRequest")) { $s["hooks"]["PermissionRequest"] = @() }

$found = $false
foreach ($entry in @($s["hooks"]["PermissionRequest"])) {
  if ($entry -is [hashtable] -and $entry.ContainsKey("hooks")) {
    foreach ($h in @($entry["hooks"])) {
      if ($h -is [hashtable] -and "$($h["command"])" -match "claude-approve") {
        $h["command"] = $command
        $found = $true
      }
    }
  }
}
if (-not $found) {
  $s["hooks"]["PermissionRequest"] += @{
    matcher = ""
    hooks   = @(@{ type = "command"; command = $command })
  }
}

($s | ConvertTo-Json -Depth 20) | Set-Content -Path $settingsFile -Encoding UTF8
Write-Host ("  hook configured" + $(if ($found) { "" } else { " (added)" }))
