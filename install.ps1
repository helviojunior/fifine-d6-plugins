#Requires -Version 5.1
<#
.SYNOPSIS
  install.ps1 — Install the built StreamDock plugins onto a Windows host.

.DESCRIPTION
  Windows counterpart of install.sh. Copies every *.sdPlugin folder sitting next
  to this script into the StreamDock (HotSpot) plugins directory, then restarts
  the StreamDock software.

  This file is shipped inside .\build by build.ps1, so run it from there:
      cd build; .\install.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$Here = $PSScriptRoot
$Dest = Join-Path $env:APPDATA "HotSpot\StreamDock\plugins"

# Process names the StreamDock software ships under (Fifine / Mirabox / Ajazz…).
$ProcNames = @("fifine Control Deck", "StreamDock", "MiraBox Stream Dock", "Mirabox Stream Dock")

$plugins = Get-ChildItem -Path $Here -Directory -Filter "*.sdPlugin"
if ($plugins.Count -eq 0) {
  Write-Error "No *.sdPlugin folders found next to this script.`nRun .\build.ps1 first, then run .\build\install.ps1."
}

Write-Host "Installing $($plugins.Count) plugin(s) into:"
Write-Host "  $Dest"
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

# Remember how to relaunch: capture a running app's executable path before we stop it.
$appExe = $null
Write-Host "Stopping StreamDock software..."
foreach ($n in $ProcNames) {
  $procs = Get-Process -Name $n -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if (-not $appExe -and $p.Path) { $appExe = $p.Path }
  }
  if ($procs) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2

foreach ($src in $plugins) {
  $name = $src.Name
  Write-Host "  -> $name"
  $target = Join-Path $Dest $name
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Copy-Item -Recurse -Force $src.FullName $target

  # Optional per-plugin post-install step (e.g. wiring a Claude Code hook).
  # NOT run automatically — it may modify ~/.claude/settings.json. Opt in:
  $post = Join-Path $target "postinstall.ps1"
  if (Test-Path $post) {
    Write-Host "     optional setup available — run: powershell -ExecutionPolicy Bypass -File `"$post`""
  }
}

# Best-effort cache clear so new icons/actions are picked up.
$cache = Join-Path $env:APPDATA "HotSpot\StreamDock\cache"
if (Test-Path $cache) {
  Get-ChildItem -Path $cache -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Starting StreamDock..."
$launched = $false
if ($appExe -and (Test-Path $appExe)) {
  Start-Process $appExe; $launched = $true
} else {
  # Try common install locations.
  $candidates = @(
    (Join-Path ${env:ProgramFiles} "fifine Control Deck\fifine Control Deck.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "fifine Control Deck\fifine Control Deck.exe"),
    (Join-Path ${env:ProgramFiles} "StreamDock\StreamDock.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "StreamDock\StreamDock.exe"),
    (Join-Path ${env:ProgramFiles} "Mirabox\Stream Dock\Stream Dock.exe")
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { Start-Process $c; $launched = $true; break }
  }
}
if (-not $launched) {
  Write-Host "Could not auto-launch StreamDock — please start it manually."
}

Write-Host ""
Write-Host "Done. The new actions should appear in the StreamDock action list."
