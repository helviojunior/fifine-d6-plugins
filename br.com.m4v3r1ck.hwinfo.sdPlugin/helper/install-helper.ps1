#Requires -Version 5.1
<#
  Installs the HWiNFO sensor daemon on Windows as a background Scheduled Task
  that runs at logon and republishes a sensor provider's WMI data to
  %TEMP%\hwinfo-sensors.json (see sensors-daemon.ps1).

  Requires an elevated PowerShell (Run as administrator) to register the task.
  You must also be running LibreHardwareMonitor (preferred) or OpenHardwareMonitor
  as administrator with their WMI export enabled — that's what actually reads the
  hardware. Without a helper the affected tiles degrade gracefully (n/a / proxy).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$TaskName = "br.com.m4v3r1ck.hwinfo.sensors"
$Here     = $PSScriptRoot
$Daemon   = Join-Path $Here "sensors-daemon.ps1"

# Re-launch elevated if needed.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Elevation required — relaunching as administrator..."
  Start-Process powershell -Verb RunAs -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`"")
  return
}

if (-not (Test-Path $Daemon)) { Write-Error "sensors-daemon.ps1 not found next to this script." }

$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Daemon`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed. Real sensors appear in $($env:TEMP)\hwinfo-sensors.json within ~3s"
Write-Host "(provided LibreHardwareMonitor / OpenHardwareMonitor is running as admin)."
