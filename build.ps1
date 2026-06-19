#Requires -Version 5.1
<#
.SYNOPSIS
  build.ps1 — Build every StreamDock plugin in this repo on Windows.

.DESCRIPTION
  Windows counterpart of build.sh. For each top-level *.sdPlugin directory it:
    1. copies the plugin into .\build\<name>.sdPlugin (minus any node_modules)
    2. vendors its npm dependencies (ws + pureimage) into plugin\node_modules
    3. syntax-checks the plugin entry point (node --check index.js)

  Finally it drops install.ps1 next to the built plugins so the whole .\build
  folder is self-contained and ready to install on the StreamDock host.

  Like build.sh, dependencies are vendored with a node:20 Docker container by
  default — no Node.js is required on the host, only Docker. Pass -UseLocalNpm
  to vendor with a local Node.js + npm on PATH instead.

.EXAMPLE
  .\build.ps1
.EXAMPLE
  .\build.ps1 -UseLocalNpm
#>
[CmdletBinding()]
param(
  [switch]$UseLocalNpm,
  [string]$NodeImage = $(if ($env:NODE_IMAGE) { $env:NODE_IMAGE } else { "node:20-bookworm" }),
  [string]$MingwImage = $(if ($env:MINGW_IMAGE) { $env:MINGW_IMAGE } else { "debian:bookworm-slim" })
)

$ErrorActionPreference = "Stop"

$Root     = $PSScriptRoot
$BuildDir = Join-Path $Root "build"

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host "==> Cleaning $BuildDir"
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
New-Item -ItemType Directory -Path $BuildDir | Out-Null

$plugins = Get-ChildItem -Path $Root -Directory -Filter "*.sdPlugin"
if ($plugins.Count -eq 0) {
  Write-Error "No *.sdPlugin directories found in $Root"
}

# Decide how to vendor npm dependencies. Docker is the default (like build.sh);
# -UseLocalNpm opts into a local Node.js toolchain instead.
$haveNpm = $false
if ($UseLocalNpm) {
  if (-not (Have "npm")) { Write-Error "-UseLocalNpm given but npm is not on PATH. Install Node.js (https://nodejs.org)." }
  $haveNpm = $true
} elseif (-not (Have "docker")) {
  Write-Error "docker not found on PATH. Install Docker Desktop, or pass -UseLocalNpm to build with a local Node.js."
}
$mode = if ($haveNpm) { "local npm" } else { "Docker ($NodeImage)" }
Write-Host "==> Found $($plugins.Count) plugin(s); vendoring deps via $mode"

# Cross-compile the Windows launcher once (shared by every node plugin). On
# Windows the StreamDock host runs CodePathWin as a native process and will NOT
# execute a .js directly, so each node plugin ships this tiny launch.exe (the
# Windows counterpart of the macOS `run` wrapper) which execs index.js. Built
# with a Docker mingw-w64 cross-compiler so no C toolchain is needed on the host.
$LauncherExe = $null
$launcherSrc = Join-Path $Root "tools\launcher.c"
if ((Test-Path $launcherSrc) -and (Have "docker")) {
  Write-Host "==> Cross-compiling Windows launcher via Docker ($MingwImage)"
  $mount = (Join-Path $Root "tools") -replace '\\', '/'
  & docker run --rm -v "${mount}:/work" -w /work $MingwImage `
    bash -c "set -e; apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq gcc-mingw-w64-x86-64 >/dev/null 2>&1; x86_64-w64-mingw32-gcc -O2 -s -mwindows launcher.c -o launch.exe"
  if ($LASTEXITCODE -ne 0) { Write-Error "launcher cross-compile failed" }
  $LauncherExe = Join-Path $Root "tools\launch.exe"
  Write-Host "    built $LauncherExe"
} elseif (Test-Path $launcherSrc) {
  Write-Host "==> WARNING: docker not available — cannot build launch.exe; relying on committed copy"
}

foreach ($src in $plugins) {
  $name = $src.Name
  $dest = Join-Path $BuildDir $name
  Write-Host ""
  Write-Host "==> $name"

  # Copy plugin sources into the build dir, dropping any stale node_modules.
  # robocopy exit codes 0-7 indicate success; >=8 is a real failure.
  $rc = (Start-Process robocopy -ArgumentList @("`"$($src.FullName)`"", "`"$dest`"", "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/XD", "node_modules") -NoNewWindow -Wait -PassThru).ExitCode
  if ($rc -ge 8) { Write-Error "robocopy failed copying $name (exit $rc)" }

  $pkg = Join-Path $dest "plugin\package.json"
  if (Test-Path $pkg) {
    $pluginDir = Join-Path $dest "plugin"
    if ($haveNpm) {
      Write-Host "    install deps + syntax check (local npm)"
      Push-Location $pluginDir
      try {
        & npm install --omit=dev --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
        & node --check index.js
        if ($LASTEXITCODE -ne 0) { throw "node --check failed (exit $LASTEXITCODE)" }
        Write-Host "    ok: index.js"
      } finally {
        Pop-Location
      }
    } else {
      Write-Host "    install deps + syntax check (docker)"
      $mount = ($pluginDir -replace '\\', '/')
      & docker run --rm -v "${mount}:/app" -w /app $NodeImage `
        bash -c "npm install --omit=dev --no-audit --no-fund --loglevel=error && node --check index.js && echo '    ok: index.js'"
      if ($LASTEXITCODE -ne 0) { Write-Error "docker build step failed for $name" }
    }
    # Ship the Windows launcher next to index.js (CodePathWin points at it).
    if ($LauncherExe -and (Test-Path $LauncherExe)) {
      Copy-Item $LauncherExe (Join-Path $pluginDir "launch.exe") -Force
      Write-Host "    + launch.exe (Windows CodePathWin launcher)"
    }
  } else {
    Write-Host "    no plugin\package.json — nothing to install"
  }
}

# Ship the installers alongside the built plugins.
Copy-Item (Join-Path $Root "install.ps1") (Join-Path $BuildDir "install.ps1") -Force
if (Test-Path (Join-Path $Root "install.sh")) {
  Copy-Item (Join-Path $Root "install.sh") (Join-Path $BuildDir "install.sh") -Force
}

Write-Host ""
Write-Host "==> Done. Built $($plugins.Count) plugin(s) into: $BuildDir"
Write-Host "    Install on the StreamDock host with:  cd build; .\install.ps1"
